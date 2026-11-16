'use server';

// Las server actions de la página pública para reservar (`/r/...`). SIN SESIÓN:
// cualquiera las puede llamar, así que cada una valida todo lo que llega del
// navegador y la base vuelve a validar (las funciones de la 0162 son la última
// palabra: que dos personas no agarren la misma hora lo decide `book_slot`).
//
// Lo que NUNCA viene del navegador: el negocio (se busca por su link), el
// servicio (se busca dentro de ese negocio), quién atiende (lo elige el motor)
// ni la cita que se mueve (sale del token).

import { after } from 'next/server';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolverZona } from '@/lib/format/tz';
import { estaLibre } from '@/lib/reservas/motor';
import { leerOcupados } from '@/lib/reservas/servidor/acceso';
import {
  leerCitaPorHash,
  leerNegocio,
  leerReservable,
  libresDelMes,
  mesValido,
  type DiaPublico,
} from '@/lib/reservas/pagina/publico';
import { limpiarMotivo, validarInvitado, type CampoConError, type DatosInvitado } from '@/lib/reservas/pagina/formulario';
import { generarToken, hashDeIp, hashDeToken, ipDeEncabezados, tokenConForma } from '@/lib/reservas/pagina/token';
import { avisarReserva } from '@/lib/reservas/avisos/avisar';

/** Menos que esto entre abrir el formulario y mandarlo no lo llena una persona. */
const MIN_LLENADO_MS = 3000;
const DIA_MS = 24 * 60 * 60 * 1000;

export type RespuestaHorarios = { ok: true; dias: DiaPublico[] } | { ok: false; error: string };

export type RespuestaReserva =
  | { ok: true; token: string }
  | { ok: false; error: string; ocupado?: boolean; errores?: Partial<Record<CampoConError, string>> };

export type RespuestaGestion = { ok: true } | { ok: false; error: string; ocupado?: boolean };

const NO_SE_PUEDE = 'Este servicio ya no se puede reservar por acá.';
const OCUPADO = 'Ese horario se acaba de ocupar. Hay que elegir otro.';
const ERROR_GENERAL = 'No se pudo completar. Intentar de nuevo en un momento.';

const MENSAJE_RECHAZO: Record<string, string> = {
  ocupado: OCUPADO,
  limite: 'Se alcanzó el límite de reservas desde este número o este dispositivo. Intentar más tarde.',
  servicio: NO_SE_PUEDE,
  invalido: 'Revisar los datos del formulario.',
  no_existe: 'Este link ya no corresponde a ninguna cita.',
  no_activa: 'Esta cita ya no está agendada.',
  fuera_de_plazo: 'Ya pasó el plazo para cambiar o cancelar esta cita. Para hacerlo, hay que escribirle al negocio.',
};

async function contexto(): Promise<{ ipHash: string | null; urlBase: string }> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'crm.momentum-lab-ai.com';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return { ipHash: hashDeIp(ipDeEncabezados(h)), urlBase: `${proto}://${host}` };
}

/**
 * Lo ocupado alrededor de un inicio, para validar con el motor justo antes de
 * reservar. Dos días a cada lado alcanzan para los márgenes, el límite del día
 * y cualquier zona.
 */
async function ocupadosCerca(agencyId: string, inicio: number, excluir: string | null = null) {
  return leerOcupados(agencyId, inicio - 2 * DIA_MS, inicio + 2 * DIA_MS, excluir);
}

/** Los horarios libres de un mes. Con `token`, los del servicio de esa cita, sin contarla a ella. */
export async function pedirHorarios(input: {
  negocio?: string;
  servicio?: string;
  token?: string | null;
  mes: string;
  zona: string;
}): Promise<RespuestaHorarios> {
  const mes = mesValido(input.mes);
  if (!mes) return { ok: false, error: ERROR_GENERAL };
  const ahora = Date.now();
  try {
    if (input.token) {
      if (!tokenConForma(input.token)) return { ok: false, error: MENSAJE_RECHAZO.no_existe };
      const cita = await leerCitaPorHash(hashDeToken(input.token), ahora);
      if (!cita?.reservable) return { ok: false, error: NO_SE_PUEDE };
      const dias = await libresDelMes(cita.reservable, mes, input.zona, ahora, cita.id);
      return dias ? { ok: true, dias } : { ok: false, error: ERROR_GENERAL };
    }
    const negocio = await leerNegocio(input.negocio ?? '');
    const r = negocio ? await leerReservable(negocio, input.servicio ?? '') : null;
    if (!r) return { ok: false, error: NO_SE_PUEDE };
    const dias = await libresDelMes(r, mes, input.zona, ahora);
    return dias ? { ok: true, dias } : { ok: false, error: ERROR_GENERAL };
  } catch (err) {
    console.error('[reservas/pedirHorarios]', err);
    return { ok: false, error: ERROR_GENERAL };
  }
}

export async function reservar(input: {
  negocio: string;
  servicio: string;
  inicio: number;
  zona: string;
  datos: DatosInvitado;
  /** El campo trampa: una persona no lo ve y lo deja vacío. */
  trampa: string;
  /** Cuándo se abrió el formulario (reloj del navegador). */
  abiertoMs: number;
}): Promise<RespuestaReserva> {
  try {
    const { ipHash, urlBase } = await contexto();
    const negocio = await leerNegocio(input.negocio);
    const r = negocio ? await leerReservable(negocio, input.servicio) : null;
    if (!negocio || !r) return { ok: false, error: NO_SE_PUEDE };
    const admin = createAdminClient();

    // Antibot: el campo trampa lleno o un formulario llenado en menos de 3 s. Se
    // anota y se responde con el error general, sin decir por qué.
    const apurado = !Number.isFinite(input.abiertoMs) || Date.now() - input.abiertoMs < MIN_LLENADO_MS;
    if ((input.trampa ?? '').trim() !== '' || apurado) {
      await admin.rpc('reservas_rechazo', {
        p_agency_id: negocio.id, p_booking_type_id: r.servicio.id, p_ip_hash: ipHash, p_telefono: null, p_motivo: 'trampa',
      });
      return { ok: false, error: ERROR_GENERAL };
    }

    const v = validarInvitado(input.datos, r.servicio.preguntas);
    if (!v.ok) return { ok: false, error: 'Revisar los datos del formulario.', errores: v.errores };

    // El motor, con lo ocupado de ahora: el mismo que dibujó el calendario.
    const inicio = Math.round(input.inicio);
    const zona = resolverZona(input.zona);
    const ocupados = await ocupadosCerca(negocio.id, inicio);
    if (!ocupados) return { ok: false, error: ERROR_GENERAL };
    const libre = estaLibre({ ...r.entrada, ocupados, zonaCliente: zona, ahora: Date.now() }, inicio);
    if (!libre.libre) return { ok: false, error: OCUPADO, ocupado: true };

    // La base elige entre los que el motor dejó libres, en el orden del servicio,
    // con el candado puesto.
    const token = generarToken();
    const { data, error } = await admin.rpc('reservas_reservar', {
      p_agency_id: negocio.id,
      p_booking_type_id: r.servicio.id,
      p_recursos: libre.horario.recursos,
      p_inicio: new Date(inicio).toISOString(),
      p_nombre: v.valor.nombre,
      p_telefono: v.valor.telefono,
      p_correo: v.valor.correo,
      p_zona_cliente: zona,
      p_respuestas: v.valor.respuestas,
      p_token_hash: hashDeToken(token),
      p_ip_hash: ipHash,
    });
    if (error) {
      console.error('[reservas/reservar] la base falló', error.message);
      return { ok: false, error: ERROR_GENERAL };
    }
    const res = data as { ok: boolean; motivo?: string; cita_id?: string };
    if (!res.ok || !res.cita_id) {
      return { ok: false, error: MENSAJE_RECHAZO[res.motivo ?? ''] ?? ERROR_GENERAL, ocupado: res.motivo === 'ocupado' };
    }

    const citaId = res.cita_id;
    after(() => avisarReserva({ evento: 'confirmada', citaId, token, urlBase }));
    return { ok: true, token };
  } catch (err) {
    console.error('[reservas/reservar]', err);
    return { ok: false, error: ERROR_GENERAL };
  }
}

export async function moverReserva(input: { token: string; inicio: number; zona: string; motivo?: string | null }): Promise<RespuestaGestion> {
  try {
    if (!tokenConForma(input.token)) return { ok: false, error: MENSAJE_RECHAZO.no_existe };
    const { ipHash, urlBase } = await contexto();
    const hash = hashDeToken(input.token);
    const ahora = Date.now();
    const cita = await leerCitaPorHash(hash, ahora);
    if (!cita) return { ok: false, error: MENSAJE_RECHAZO.no_existe };
    if (cita.bloqueo) return { ok: false, error: MENSAJE_RECHAZO[cita.bloqueo === 'pasada' ? 'no_activa' : cita.bloqueo] };
    if (!cita.reservable) return { ok: false, error: NO_SE_PUEDE };

    const inicio = Math.round(input.inicio);
    const zona = resolverZona(input.zona);
    const ocupados = await ocupadosCerca(cita.negocio.id, inicio, cita.id);
    if (!ocupados) return { ok: false, error: ERROR_GENERAL };
    const libre = estaLibre({ ...cita.reservable.entrada, ocupados, zonaCliente: zona, ahora }, inicio);
    if (!libre.libre) return { ok: false, error: OCUPADO, ocupado: true };

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('reservas_mover', {
      p_token_hash: hash,
      p_recursos: libre.horario.recursos,
      p_inicio: new Date(inicio).toISOString(),
      p_motivo: limpiarMotivo(input.motivo),
      p_ip_hash: ipHash,
    });
    if (error) {
      console.error('[reservas/mover] la base falló', error.message);
      return { ok: false, error: ERROR_GENERAL };
    }
    const res = data as { ok: boolean; motivo?: string; cita_id?: string; usuario_anterior?: string | null; inicio_anterior?: string };
    if (!res.ok) return { ok: false, error: MENSAJE_RECHAZO[res.motivo ?? ''] ?? ERROR_GENERAL, ocupado: res.motivo === 'ocupado' };

    const token = input.token;
    after(() => avisarReserva({
      evento: 'movida', citaId: cita.id, token, urlBase,
      inicioAnteriorMs: res.inicio_anterior ? Date.parse(res.inicio_anterior) : cita.inicioMs,
      usuarioAnteriorId: res.usuario_anterior ?? null,
    }));
    return { ok: true };
  } catch (err) {
    console.error('[reservas/mover]', err);
    return { ok: false, error: ERROR_GENERAL };
  }
}

export async function cancelarReserva(input: { token: string; motivo?: string | null }): Promise<RespuestaGestion> {
  try {
    if (!tokenConForma(input.token)) return { ok: false, error: MENSAJE_RECHAZO.no_existe };
    const { ipHash, urlBase } = await contexto();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('reservas_cancelar', {
      p_token_hash: hashDeToken(input.token),
      p_motivo: limpiarMotivo(input.motivo),
      p_ip_hash: ipHash,
    });
    if (error) {
      console.error('[reservas/cancelar] la base falló', error.message);
      return { ok: false, error: ERROR_GENERAL };
    }
    const res = data as { ok: boolean; motivo?: string; cita_id?: string };
    if (!res.ok || !res.cita_id) return { ok: false, error: MENSAJE_RECHAZO[res.motivo ?? ''] ?? ERROR_GENERAL };
    const citaId = res.cita_id;
    after(() => avisarReserva({ evento: 'cancelada', citaId, token: null, urlBase }));
    return { ok: true };
  } catch (err) {
    console.error('[reservas/cancelar]', err);
    return { ok: false, error: ERROR_GENERAL };
  }
}
