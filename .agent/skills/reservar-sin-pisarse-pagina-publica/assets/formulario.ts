// El formulario de la página para reservar: qué se le pide al cliente y cómo se
// valida. PURO: lo usan el navegador (para avisar antes de mandar) y el
// servidor (para decidir), así los dos dicen lo mismo.
//
// Nombre, WhatsApp y correo son obligatorios (Hans, 2026-10-27): el correo hace
// falta para la invitación de Google Calendar de la fase 3, como en Calendly.
//
// Los textos le hablan a CUALQUIER cliente de cualquier negocio: neutros, sin
// tú, vos ni usted (como la plantilla `reserva_confirmada`).

import type { PreguntaUI, TipoPregunta } from '@/lib/reservas/datos';

export const MAX_NOMBRE_INVITADO = 120;
export const MAX_RESPUESTA_CORTA = 200;
export const MAX_RESPUESTA_LARGA = 1000;
export const MAX_MOTIVO = 500;

/** Lo que el cliente escribió, tal cual. */
export type DatosInvitado = {
  nombre: string;
  /** El prefijo del país sin `+` ('506'). */
  prefijo: string;
  /** El país elegido en el selector ('CR'): Estados Unidos y Canadá comparten el +1. */
  pais?: string;
  /** El número como lo escribió: puede traer espacios, guiones o un `+` con otro país. */
  numero: string;
  correo: string;
  /** Respuestas por id de pregunta. */
  respuestas: Record<string, string>;
};

/** Cada respuesta con su pregunta, tal como estaba al reservar (`appointments.answers`). */
export type RespuestaGuardada = { pregunta: string; tipo: TipoPregunta; respuesta: string };

export type CampoConError = 'nombre' | 'telefono' | 'correo' | `pregunta:${string}`;

export type InvitadoValido = {
  nombre: string;
  /** Solo dígitos, con el código de país: como `leads.whatsapp_phone`. */
  telefono: string;
  correo: string;
  respuestas: RespuestaGuardada[];
};

/**
 * El WhatsApp en dígitos con el código de país. Si el número empieza con `+`,
 * se respeta el país que escribió la persona; si no, se le antepone el del
 * selector. Un número que ya trae el prefijo del selector adelante (por ejemplo
 * «506 8888 1234» con Costa Rica elegido) no se duplica.
 */
export function telefonoCompleto(prefijo: string, numero: string): string | null {
  const crudo = (numero ?? '').trim();
  const digitos = crudo.replace(/\D/g, '');
  const pre = (prefijo ?? '').replace(/\D/g, '');
  if (!digitos) return null;
  let completo: string;
  if (crudo.startsWith('+') || crudo.startsWith('00')) completo = crudo.startsWith('00') ? digitos.slice(2) : digitos;
  else if (pre && digitos.startsWith(pre) && digitos.length > pre.length + 6) completo = digitos;
  else completo = `${pre}${digitos}`;
  return /^[0-9]{8,15}$/.test(completo) ? completo : null;
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** El nombre con los espacios de más colapsados. */
const limpio = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Valida todo el formulario. Devuelve los datos limpios, o un error por campo
 * para pintarlo debajo de cada uno.
 */
export function validarInvitado(
  d: DatosInvitado,
  preguntas: readonly PreguntaUI[],
): { ok: true; valor: InvitadoValido } | { ok: false; errores: Partial<Record<CampoConError, string>> } {
  const errores: Partial<Record<CampoConError, string>> = {};

  const nombre = limpio(d.nombre);
  if (!nombre) errores.nombre = 'Falta el nombre.';
  else if (nombre.length > MAX_NOMBRE_INVITADO) errores.nombre = 'El nombre es muy largo.';

  const telefono = telefonoCompleto(d.prefijo, d.numero);
  if (!telefono) errores.telefono = 'Ese WhatsApp no parece completo.';

  const correo = (d.correo ?? '').trim().toLowerCase();
  if (!correo) errores.correo = 'Falta el correo.';
  else if (correo.length > 254 || !CORREO.test(correo)) errores.correo = 'Ese correo no parece válido.';

  const respuestas: RespuestaGuardada[] = [];
  for (const p of preguntas) {
    if (!p.id) continue;
    const clave = `pregunta:${p.id}` as const;
    const r = (d.respuestas?.[p.id] ?? '').trim();
    const max = p.tipo === 'long_text' ? MAX_RESPUESTA_LARGA : MAX_RESPUESTA_CORTA;
    if (!r) {
      if (p.obligatoria) errores[clave] = 'Esta pregunta es obligatoria.';
      continue;
    }
    if (p.tipo === 'choice' && !p.opciones.includes(r)) {
      errores[clave] = 'Falta elegir una de las opciones.';
      continue;
    }
    if (r.length > max) {
      errores[clave] = `La respuesta es muy larga (máx ${max}).`;
      continue;
    }
    respuestas.push({ pregunta: p.texto, tipo: p.tipo, respuesta: r });
  }

  if (Object.keys(errores).length > 0 || !telefono) return { ok: false, errores };
  return { ok: true, valor: { nombre, telefono, correo, respuestas } };
}

/** Un motivo opcional de cambio o cancelación, recortado. */
export function limpiarMotivo(m: string | null | undefined): string | null {
  const t = limpio(m);
  return t ? t.slice(0, MAX_MOTIVO) : null;
}
