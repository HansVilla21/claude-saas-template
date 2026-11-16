// El horario de una persona o un espacio: su semana, sus días especiales y qué
// hace con los feriados. Cómo se guarda, cómo se valida y qué franjas tiene un
// día. PURO: sin base, sin reloj.
//
// Se guarda en `availability_schedules.week` (jsonb) y en
// `availability_exceptions` (una fila por fecha). Lo que viene de la base pasa
// SIEMPRE por `semanaValida`/`franjasValidas`: un jsonb roto no puede dejar a un
// negocio sin horarios sin explicar por qué, ni ofrecer las 3 de la mañana.

import { cierraPorFeriado, type ModoFeriados } from './feriados-cr.ts';

/** Una franja del día en hora local del horario. `hasta` puede ser '24:00' (hasta la medianoche). */
export type Franja = { desde: string; hasta: string };

/** Índice 0 = domingo … 6 = sábado, como `Date.getDay()`. Una lista vacía es un día cerrado. */
export type Semana = Franja[][];

export type Horario = {
  /** Zona IANA del horario. Hoy todos los negocios están en America/Costa_Rica. */
  zona: string;
  semana: Semana;
  /** Días especiales por fecha ('YYYY-MM-DD'): le ganan a la semana y al feriado. Vacío = cerrado ese día. */
  excepciones: Readonly<Record<string, Franja[]>>;
  feriados: ModoFeriados;
};

export const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;
export const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/** La semana con la que nace un horario nuevo: lunes a viernes de 8:00 a 17:00. */
export function semanaPorDefecto(): Semana {
  return Array.from({ length: 7 }, (_, d) => (d >= 1 && d <= 5 ? [{ desde: '08:00', hasta: '17:00' }] : []));
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutos desde la medianoche: '08:30' → 510, '24:00' → 1440. null si no es una hora. */
export function minutosDe(hhmm: string): number | null {
  if (hhmm === '24:00') return 24 * 60;
  const m = HORA.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** '08:30' a partir de los minutos del día; 1440 da '24:00'. */
export function hhmmDe(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Las franjas de un día, validadas: cada una empieza antes de terminar, en
 * orden y sin pisarse. Devuelve el motivo del primer problema, para que la
 * pantalla lo diga en vez de guardar algo que el motor va a ignorar.
 */
export function revisarFranjas(franjas: readonly Franja[]): { ok: true; franjas: Franja[] } | { ok: false; motivo: string } {
  const orden = [...franjas]
    .map((f) => ({ f, a: minutosDe(f.desde), b: minutosDe(f.hasta) }))
    .sort((x, y) => (x.a ?? 0) - (y.a ?? 0));
  let fin = -1;
  for (const { f, a, b } of orden) {
    if (a === null || b === null || f.desde === '24:00') return { ok: false, motivo: 'Hay una hora que no es válida.' };
    if (b <= a) return { ok: false, motivo: `La franja de ${f.desde} a ${f.hasta} termina antes de empezar.` };
    if (a < fin) return { ok: false, motivo: 'Hay dos franjas que se pisan.' };
    fin = b;
  }
  return { ok: true, franjas: orden.map((x) => ({ desde: x.f.desde, hasta: x.f.hasta })) };
}

/** Lo que venga (jsonb de la base, un formulario) como lista de franjas, o null si no se puede leer. */
export function franjasValidas(v: unknown): Franja[] | null {
  if (!Array.isArray(v)) return null;
  const crudas: Franja[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) return null;
    const { desde, hasta } = x as Record<string, unknown>;
    if (typeof desde !== 'string' || typeof hasta !== 'string') return null;
    crudas.push({ desde, hasta });
  }
  const r = revisarFranjas(crudas);
  return r.ok ? r.franjas : null;
}

/**
 * La semana guardada (`{"0": [...], …, "6": [...]}`), o null si algún día no se
 * puede leer. Un día que falta es un día cerrado: así una semana a medio
 * escribir no inventa horarios.
 */
export function semanaValida(v: unknown): Semana | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const semana: Semana = [];
  for (let d = 0; d < 7; d++) {
    const dia = o[String(d)];
    if (dia === undefined) { semana.push([]); continue; }
    const f = franjasValidas(dia);
    if (!f) return null;
    semana.push(f);
  }
  return semana;
}

/** La semana como se guarda en la base. */
export function semanaParaGuardar(semana: Semana): Record<string, Franja[]> {
  return Object.fromEntries(semana.map((f, d) => [String(d), f]));
}

// ── Fechas como texto ('YYYY-MM-DD'), sin zona ─────────────────────────────────
// Una fecha de calendario no tiene zona: el 15 de setiembre es el 15 en
// cualquier lado. Se cuenta con `Date.UTC` solo como calculadora.

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function esFecha(s: string): boolean {
  const m = FECHA.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function sumarDias(fecha: string, n: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

/** 0 = domingo … 6 = sábado. */
export function diaDeSemanaDe(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Días de calendario de `desde` a `hasta` (positivo si `hasta` es después). */
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Por qué un día tiene las franjas que tiene. La pantalla lo dice al lado del día. */
export type OrigenDia = 'excepcion' | 'feriado' | 'semana';

/**
 * Las franjas de una fecha en ese horario, y de dónde salen. El orden importa:
 * el día especial le gana a todo (así se abre un feriado puntual), después el
 * feriado, después la semana.
 */
export function franjasDelDia(h: Horario, fecha: string): { franjas: readonly Franja[]; origen: OrigenDia } {
  const especial = h.excepciones[fecha];
  if (especial) return { franjas: especial, origen: 'excepcion' };
  if (cierraPorFeriado(fecha, h.feriados)) return { franjas: [], origen: 'feriado' };
  return { franjas: h.semana[diaDeSemanaDe(fecha)] ?? [], origen: 'semana' };
}

// ── El resumen en una línea ────────────────────────────────────────────────────

/** '8:00' en vez de '08:00': así se lee en una tarjeta. */
function horaCorta(hhmm: string): string {
  return hhmm.startsWith('0') ? hhmm.slice(1) : hhmm;
}

export function textoFranjas(franjas: readonly Franja[]): string {
  if (franjas.length === 0) return 'Cerrado';
  return franjas.map((f) => `${horaCorta(f.desde)} a ${horaCorta(f.hasta)}`).join(' y ');
}

/**
 * La semana en pocas líneas, juntando los días seguidos que tienen lo mismo:
 * ['Lun a Vie · 8:00 a 17:00', 'Sáb · 8:00 a 12:00']. Los días cerrados no se
 * listan; si no abre ningún día, lo dice.
 */
export function resumenSemana(semana: Semana): string[] {
  // De lunes a domingo, que es como se piensa una semana de trabajo.
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const grupos: { dias: number[]; texto: string }[] = [];
  for (const d of orden) {
    const texto = textoFranjas(semana[d] ?? []);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto) ultimo.dias.push(d);
    else grupos.push({ dias: [d], texto });
  }
  const abiertos = grupos.filter((g) => g.texto !== 'Cerrado');
  if (abiertos.length === 0) return ['Sin días abiertos'];
  return abiertos.map((g) => {
    const primero = DIAS_CORTOS[g.dias[0]];
    const ultimo = DIAS_CORTOS[g.dias[g.dias.length - 1]];
    const dias = g.dias.length === 1 ? primero : g.dias.length === 2 ? `${primero} y ${ultimo}` : `${primero} a ${ultimo}`;
    return `${dias} · ${g.texto}`;
  });
}
