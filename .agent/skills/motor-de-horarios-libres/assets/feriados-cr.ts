// Los feriados de Costa Rica, para que la agenda no ofrezca horarios en un día
// que el negocio está cerrado. PURO: sin base, sin reloj, sin red.
//
// ─────────────────────────────────────────────────────────────────────────────
// POR QUÉ EN CÓDIGO Y NO EN UNA TABLA
// ─────────────────────────────────────────────────────────────────────────────
// Diez de los doce caen siempre en la misma fecha, y los otros dos (Jueves y
// Viernes Santo) salen de la Pascua, que se calcula. Con una tabla habría que
// acordarse de cargar el año siguiente cada diciembre, y el día que nadie se
// acuerde la agenda ofrece el 1 de enero sin dar ningún error. Así sale bien
// para cualquier año, y el motor (la página y el bot) lo lee sin un viaje a la
// base.
//
// ─────────────────────────────────────────────────────────────────────────────
// LOS TRASLADOS A LUNES
// ─────────────────────────────────────────────────────────────────────────────
// La Ley 9875 movió algunos feriados al lunes entre 2020 y 2024. En 2026 no hay
// traslados: cada feriado queda en su fecha natural (comunicado del MTSS, CARTA-
// MTSS-DAJ-AER-1076-2025). Para 2027 hay un proyecto de ley presentado en mayo
// de 2026 y ninguna ley aprobada (verificado el 2026-10-27). Si una ley mueve un
// feriado, se anota en `TRASLADOS` con la fecha nueva y todo lo demás lo toma.
//
// El negocio que atiende un feriado puntual lo abre con un «día especial» en su
// horario: la excepción por fecha le gana al feriado (ver `motor.ts`).

export type Feriado = {
  /** 'YYYY-MM-DD', la fecha en que se descansa (después de un traslado, si lo hubo). */
  fecha: string;
  nombre: string;
  /**
   * De pago obligatorio. Los tres que no lo son (2 y 31 de agosto, 1 de
   * diciembre) son los que más negocios trabajan, y por eso el horario deja
   * elegir cerrar solo en los obligatorios.
   */
  obligatorio: boolean;
};

/** Qué feriados cierran la agenda de un horario. */
export type ModoFeriados = 'todos' | 'obligatorios' | 'ninguno';

const FIJOS: readonly { mes: number; dia: number; nombre: string; obligatorio: boolean }[] = [
  { mes: 1, dia: 1, nombre: 'Año Nuevo', obligatorio: true },
  { mes: 4, dia: 11, nombre: 'Día de Juan Santamaría', obligatorio: true },
  { mes: 5, dia: 1, nombre: 'Día del Trabajador', obligatorio: true },
  { mes: 7, dia: 25, nombre: 'Anexión del Partido de Nicoya', obligatorio: true },
  { mes: 8, dia: 2, nombre: 'Día de la Virgen de los Ángeles', obligatorio: false },
  { mes: 8, dia: 15, nombre: 'Día de la Madre', obligatorio: true },
  { mes: 8, dia: 31, nombre: 'Día de la Persona Negra y la Cultura Afrocostarricense', obligatorio: false },
  { mes: 9, dia: 15, nombre: 'Día de la Independencia', obligatorio: true },
  { mes: 12, dia: 1, nombre: 'Día de la Abolición del Ejército', obligatorio: false },
  { mes: 12, dia: 25, nombre: 'Navidad', obligatorio: true },
];

/**
 * Traslados por ley: fecha natural → fecha en que se descansa. Vacío porque en
 * 2026 no hay ninguno y para 2027 no hay ley aprobada (ver arriba).
 */
const TRASLADOS: Readonly<Record<string, string>> = {};

const dos = (n: number) => String(n).padStart(2, '0');
const clave = (anio: number, mes: number, dia: number) => `${anio}-${dos(mes)}-${dos(dia)}`;

/**
 * El domingo de Pascua del año (calendario gregoriano), con el algoritmo
 * anónimo de Meeus/Jones/Butcher. Devuelve [mes 1-12, día].
 */
export function domingoDePascua(anio: number): [number, number] {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return [mes, dia];
}

/** La fecha `n` días antes o después de [mes, día] del año, como 'YYYY-MM-DD'. */
function correr(anio: number, mes: number, dia: number, n: number): string {
  const d = new Date(Date.UTC(anio, mes - 1, dia + n));
  return clave(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

const CACHE = new Map<number, Feriado[]>();

/** Los feriados de Costa Rica de un año, en orden de fecha. */
export function feriadosCostaRica(anio: number): Feriado[] {
  const hecho = CACHE.get(anio);
  if (hecho) return hecho;
  const [mesP, diaP] = domingoDePascua(anio);
  const lista: Feriado[] = [
    ...FIJOS.map((f) => ({ fecha: clave(anio, f.mes, f.dia), nombre: f.nombre, obligatorio: f.obligatorio })),
    { fecha: correr(anio, mesP, diaP, -3), nombre: 'Jueves Santo', obligatorio: true },
    { fecha: correr(anio, mesP, diaP, -2), nombre: 'Viernes Santo', obligatorio: true },
  ]
    .map((f) => ({ ...f, fecha: TRASLADOS[f.fecha] ?? f.fecha }))
    .sort((x, y) => x.fecha.localeCompare(y.fecha));
  CACHE.set(anio, lista);
  return lista;
}

/** El feriado de esa fecha ('YYYY-MM-DD'), o null si es un día común. */
export function feriadoDe(fecha: string): Feriado | null {
  const anio = Number(fecha.slice(0, 4));
  if (!Number.isInteger(anio)) return null;
  return feriadosCostaRica(anio).find((f) => f.fecha === fecha) ?? null;
}

/** Si con ese modo la fecha queda cerrada por feriado. */
export function cierraPorFeriado(fecha: string, modo: ModoFeriados): boolean {
  if (modo === 'ninguno') return false;
  const f = feriadoDe(fecha);
  if (!f) return false;
  return modo === 'todos' || f.obligatorio;
}

/** Los feriados que vienen desde `desde` ('YYYY-MM-DD'), hasta `cuantos`, cruzando de año si hace falta. */
export function proximosFeriados(desde: string, cuantos: number): Feriado[] {
  const anio = Number(desde.slice(0, 4));
  return [...feriadosCostaRica(anio), ...feriadosCostaRica(anio + 1)]
    .filter((f) => f.fecha >= desde)
    .slice(0, cuantos);
}
