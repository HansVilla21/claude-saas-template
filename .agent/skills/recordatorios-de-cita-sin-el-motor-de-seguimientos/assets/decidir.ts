// Qué recordatorio le toca a cada cita, AHORA. PURO: el reloj entra de afuera,
// así las pruebas eligen «el miércoles a las 10:00» cualquier día.
//
// Lo usa el barrido (`servidor/barrer.ts`) con las citas VIVAS que acaba de leer:
// una cita movida trae su hora nueva y la decisión sale para esa hora. Lo que ya
// se decidió para una hora (enviado u omitido) no se vuelve a decidir: la llave
// es cita + minutos antes + hora de la cita, la misma del UNIQUE de la 0165.

import { claveDiaEnZona, instanteEnZona, partesEnZona } from '@/lib/format/tz';
import type { ReglaRecordatorio } from './tipos';

/** De noche no: nada sale antes de las 7:00 del negocio (si tocaba antes, sale a las 7:00). */
export const HORA_MINIMA = '07:00';
const MINUTO_MINIMO = 7 * 60;

/**
 * Si el cron estuvo caído, un recordatorio con más de 2 horas de atraso ya no
 * sale: «1 día antes» que llega con 4 horas para la cita confunde más de lo que
 * ayuda.
 */
export const GRACIA_MS = 2 * 60 * 60 * 1000;

export type MotivoOmitido =
  /** Se reservó (o se movió) después de la hora en que tocaba: acaba de recibir la confirmación. */
  | 'reservada_despues'
  /** Tocaba antes de que el negocio prendiera los recordatorios. */
  | 'antes_de_activar'
  /** Tocaba hace más de 2 horas (el cron estuvo caído). */
  | 'vencido'
  /** Tocaban dos a la vez (otro más cerca de la cita sale ahora): uno por vez. */
  | 'llega_otro'
  /** La cita es antes de las 7:00: no hay hora decente para mandarlo. */
  | 'de_madrugada';

export type CitaParaRecordar = {
  id: string;
  inicioMs: number;
  /** Desde cuándo la cita tiene ESTA hora: lo más nuevo entre `created_at` y `reagendada_at`. */
  fijadaMs: number;
};

export type DecisionRecordatorio = {
  citaId: string;
  minutosAntes: number;
  inicioMs: number;
  /** El momento en que tocaba (con la regla de la noche); null si no hay ninguno. */
  programadoMs: number | null;
} & ({ accion: 'enviar' } | { accion: 'omitir'; motivo: MotivoOmitido });

/** La llave de lo ya decidido: la misma del UNIQUE de `recordatorio_envios`. */
export const llaveDeEnvio = (citaId: string, minutosAntes: number, inicioMs: number) =>
  `${citaId}|${minutosAntes}|${inicioMs}`;

/**
 * Cuándo sale un recordatorio. Si cae antes de las 7:00 del negocio, sale a las
 * 7:00 de ese mismo día. null si la cita es antes de esa hora.
 *
 *   Cita 10:00, 3 h antes  → 7:00.
 *   Cita 8:00, 3 h antes   → 7:00 (no 5:00).
 *   Cita 6:30, 3 h antes   → null: a las 7:00 la cita ya empezó.
 */
export function momentoDelRecordatorio(inicioMs: number, minutosAntes: number, zona: string): number | null {
  const bruto = inicioMs - minutosAntes * 60_000;
  const p = partesEnZona(bruto, zona);
  if (p.hora * 60 + p.minuto >= MINUTO_MINIMO) return bruto;
  const siete = instanteEnZona(claveDiaEnZona(bruto, zona), HORA_MINIMA, zona);
  if (siete === null || siete >= inicioMs) return null;
  return siete;
}

/**
 * Lo que hay que hacer ahora con las citas de UN negocio. Solo devuelve lo que
 * ya tocaba (lo que todavía no toca, no aparece): `enviar`, u `omitir` con su
 * motivo, que el barrido anota para que no se vuelva a decidir.
 */
export function decidirRecordatorios(e: {
  citas: CitaParaRecordar[];
  reglas: Pick<ReglaRecordatorio, 'minutosAntes'>[];
  /** Llaves (`llaveDeEnvio`) de lo ya decidido para estas citas. */
  yaDecididos: ReadonlySet<string>;
  /** Cuándo el negocio prendió los recordatorios. null = apagados. */
  activadoMs: number | null;
  zona: string;
  ahoraMs: number;
}): DecisionRecordatorio[] {
  if (e.activadoMs === null) return [];
  const salida: DecisionRecordatorio[] = [];
  for (const c of e.citas) {
    if (c.inicioMs <= e.ahoraMs) continue;
    const vencidos: DecisionRecordatorio[] = [];
    const paraMandar: (DecisionRecordatorio & { accion: 'enviar' })[] = [];
    for (const r of e.reglas) {
      if (e.yaDecididos.has(llaveDeEnvio(c.id, r.minutosAntes, c.inicioMs))) continue;
      const bruto = c.inicioMs - r.minutosAntes * 60_000;
      if (bruto > e.ahoraMs) continue; // todavía no toca (tampoco el de madrugada)
      const base = { citaId: c.id, minutosAntes: r.minutosAntes, inicioMs: c.inicioMs };
      const momento = momentoDelRecordatorio(c.inicioMs, r.minutosAntes, e.zona);
      if (momento === null) { vencidos.push({ ...base, programadoMs: null, accion: 'omitir', motivo: 'de_madrugada' }); continue; }
      if (momento > e.ahoraMs) continue; // de noche: espera a las 7:00
      const conMomento = { ...base, programadoMs: momento };
      if (c.fijadaMs >= momento) vencidos.push({ ...conMomento, accion: 'omitir', motivo: 'reservada_despues' });
      else if (e.activadoMs > momento) vencidos.push({ ...conMomento, accion: 'omitir', motivo: 'antes_de_activar' });
      else if (e.ahoraMs - momento > GRACIA_MS) vencidos.push({ ...conMomento, accion: 'omitir', motivo: 'vencido' });
      else paraMandar.push({ ...conMomento, accion: 'enviar' });
    }
    // Uno por vez: si tocaban dos (el cron estuvo un rato caído), sale el más
    // cercano a la cita y el otro queda omitido.
    paraMandar.sort((a, b) => a.minutosAntes - b.minutosAntes);
    const [primero, ...resto] = paraMandar;
    if (primero) salida.push(primero);
    for (const r of resto) salida.push({ ...r, accion: 'omitir', motivo: 'llega_otro' });
    salida.push(...vencidos);
  }
  return salida;
}

/** Cómo le fue a un canal: si es un error, se reintenta. */
export const esErrorDeCanal = (estado: string | null | undefined) => typeof estado === 'string' && estado.startsWith('error');

/** Como mucho 3 intentos, y dentro de la gracia (pasada, ya no sirve). */
export function debeReintentar(e: { intentos: number; programadoMs: number; inicioMs: number; ahoraMs: number }): boolean {
  return e.intentos < 3 && e.ahoraMs - e.programadoMs <= GRACIA_MS && e.inicioMs > e.ahoraMs;
}
