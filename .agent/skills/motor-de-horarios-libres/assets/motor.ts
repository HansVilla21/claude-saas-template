// El motor de horarios libres: qué horarios se le pueden ofrecer a un cliente
// para un servicio. Es la pieza central de la agenda propia. La usan la vista
// previa de Servicios, la página para reservar y, al final, el bot. Los tres
// le preguntan a ESTA función, así nunca se ofrece una hora que otro camino
// considera ocupada.
//
// PURO: sin base, sin red, sin leer el reloj (`ahora` entra por parámetro).
// Así se prueba con los casos que REA OS midió en vivo en Calendly
// (`REA OS/sistemas/calendly/guia-de-implementacion.md` §10).
//
// ─────────────────────────────────────────────────────────────────────────────
// EL ALGORITMO (tres pasos, como el de Cal.diy, que se estudió antes)
// ─────────────────────────────────────────────────────────────────────────────
//   1. RANGOS. Para cada fecha, las franjas del horario de quien atiende (el
//      día especial le gana al feriado, y el feriado a la semana), pasadas a
//      instantes reales con la zona del horario. Si el servicio tiene horario
//      propio, se cruza con ese.
//   2. RESTAR LO OCUPADO. Cada cita del recurso se agranda con los márgenes y se
//      resta. Los márgenes NO se aplican contra el borde del horario: «15
//      minutos antes» no le quita a nadie la cita de las 8:00 cuando abre a las
//      8:00.
//   3. GENERAR. Sobre cada rango libre, el primer inicio es el mayor entre el
//      comienzo del rango y «ahora + aviso mínimo», alineado a la grilla del
//      paso CONTANDO DESDE LA HORA EN PUNTO y en la zona del NEGOCIO (con un
//      paso de 30, a :00 y :30). Después se avanza de a un paso. Un inicio
//      queda solo si la cita entera entra en el rango.
//
// ─────────────────────────────────────────────────────────────────────────────
// LO QUE NO SE COPIÓ DE CAL.DIY, A PROPÓSITO
// ─────────────────────────────────────────────────────────────────────────────
//   · Su grilla se alinea en la zona del que reserva: un cliente en la India ve
//     las horas corridas a :30. Acá la grilla es la del negocio.
//   · Listar y validar usan lógicas distintas (issues #29729 y #30266), y por
//     eso a veces se ofrece un horario que después falla al reservar. Acá la
//     validación (`estaLibre`) llama a esta MISMA función.
//   · Un horario con cupo lleno lo esconde la pantalla, no el servidor (#28081).
//     Acá un horario lleno no sale del motor.
//   · Una reserva con cupo no bloquea los horarios que se le pisan con otro
//     inicio. Acá sí: el recurso está ocupado desde que empieza esa cita.
//
// Que dos personas no reserven el mismo horario a la vez NO se resuelve acá:
// lo resuelve la base al reservar (fase 2, `book_slot` con candado).

import { claveDiaEnZona, instanteEnZona, partesEnZona } from './tz.ts';
import { cierraPorFeriado, feriadoDe } from './feriados-cr.ts';
import { diaDeSemanaDe, franjasDelDia, sumarDias, type Horario } from './semana.ts';

/** Hasta dónde se pueden reservar horarios hacia adelante. */
export type Ventana =
  | { tipo: 'naturales'; dias: number }
  | { tipo: 'habiles'; dias: number }
  | { tipo: 'sin_limite' };

/** Las reglas del servicio que deciden qué horarios se ofrecen. */
export type ServicioMotor = {
  id: string;
  duracionMin: number;
  /** Cada cuánto se ofrece un horario. null = lo que dura el servicio. */
  pasoMin: number | null;
  margenAntesMin: number;
  margenDespuesMin: number;
  /** Cuánto antes hay que reservar: con 240, a las 10:00 lo primero que se ofrece es a las 14:00. */
  avisoMinimoMin: number;
  ventana: Ventana;
  /** Cuántas reservas de este servicio por día, como mucho. null = sin límite. */
  limiteDiario: number | null;
  /** Cuántas personas por horario. 1 = una cita normal; 2 en un reto de fútbol, 20 en una clase. */
  cupos: number;
};

/** Quien atiende (una persona) o donde se atiende (un espacio), con su horario. */
export type RecursoMotor = { id: string; horario: Horario };

/**
 * Algo que ocupa a un recurso: una cita del CRM, una reserva, un evento de su
 * Google (fase 3). Solo lo que sigue en pie: las canceladas no se pasan.
 */
export type Ocupado = {
  recursoId: string;
  inicio: number;
  fin: number;
  /** El servicio de la reserva, si salió de uno. Las de ESTE servicio cuentan para el cupo y el límite diario. */
  servicioId?: string | null;
  /** Los márgenes con que se reservó (congelados en la cita). Una cita a mano no tiene. */
  margenAntesMin?: number;
  margenDespuesMin?: number;
};

export type EntradaMotor = {
  servicio: ServicioMotor;
  /** Quiénes pueden atender este servicio. Un horario sale si al menos uno está libre. */
  recursos: readonly RecursoMotor[];
  /** El horario propio del servicio, si tiene: se cruza con el de quien atiende. */
  horarioServicio?: Horario | null;
  ocupados: readonly Ocupado[];
  /** Fechas a consultar, inclusive, en la zona del CLIENTE ('YYYY-MM-DD'). */
  desde: string;
  hasta: string;
  zonaCliente: string;
  ahora: number;
};

export type HorarioLibre = {
  inicio: number;
  fin: number;
  /** Lugares que quedan en ese horario (con cupo 1, siempre 1). */
  quedan: number;
  /** Quiénes lo pueden atender, en el orden del servicio. */
  recursos: string[];
};

/** Por qué un día no tiene horarios. La vista previa lo dice al lado del día. */
export type MotivoSinHorarios =
  | { tipo: 'pasado' }
  | { tipo: 'fuera_de_ventana' }
  | { tipo: 'feriado'; nombre: string }
  | { tipo: 'cerrado' }
  | { tipo: 'limite_diario' }
  | { tipo: 'aviso_minimo' }
  | { tipo: 'ocupado' };

export type DiaLibre = {
  /** En la zona del cliente. */
  fecha: string;
  horarios: HorarioLibre[];
  /** Solo si `horarios` viene vacío. */
  motivo?: MotivoSinHorarios;
};

/** Una consulta más larga que esto es un error de quien llama, no una necesidad: la página pide un mes. */
export const MAX_DIAS_CONSULTA = 62;

const MIN = 60_000;

type Rango = [number, number];

function unir(rangos: Rango[]): Rango[] {
  const orden = [...rangos].sort((a, b) => a[0] - b[0]);
  const out: Rango[] = [];
  for (const [a, b] of orden) {
    const ultimo = out[out.length - 1];
    // `<=`: dos franjas pegadas (22:00–24:00 y 00:00–02:00) son UNA, y así una
    // cita de las 23:30 puede cruzar la medianoche.
    if (ultimo && a <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], b);
    else out.push([a, b]);
  }
  return out;
}

function intersectar(x: readonly Rango[], y: readonly Rango[]): Rango[] {
  const out: Rango[] = [];
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const a = Math.max(x[i][0], y[j][0]);
    const b = Math.min(x[i][1], y[j][1]);
    if (a < b) out.push([a, b]);
    if (x[i][1] < y[j][1]) i++;
    else j++;
  }
  return out;
}

function restar(libres: readonly Rango[], ocupados: readonly Rango[]): Rango[] {
  const quitar = unir([...ocupados]);
  const out: Rango[] = [];
  for (const [a0, b] of libres) {
    let a = a0;
    for (const [qa, qb] of quitar) {
      if (qb <= a) continue;
      if (qa >= b) break;
      if (qa > a) out.push([a, qa]);
      a = Math.max(a, qb);
      if (a >= b) break;
    }
    if (a < b) out.push([a, b]);
  }
  return out;
}

/** Los rangos de un horario para esas fechas (en la zona del horario), ya unidos. */
function rangosDelHorario(h: Horario, fechas: readonly string[]): Rango[] {
  const out: Rango[] = [];
  for (const fecha of fechas) {
    for (const f of franjasDelDia(h, fecha).franjas) {
      const a = instanteEnZona(fecha, f.desde, h.zona);
      const b = f.hasta === '24:00'
        ? instanteEnZona(sumarDias(fecha, 1), '00:00', h.zona)
        : instanteEnZona(fecha, f.hasta, h.zona);
      if (a !== null && b !== null && b > a) out.push([a, b]);
    }
  }
  return unir(out);
}

/** El paso de la grilla: el mayor de 60, 30, 20, 15, 10 y 5 que divide al paso. Con 45, 15; con 8, 1. */
export function pasoDeAlineacion(pasoMin: number): number {
  for (const p of [60, 30, 20, 15, 10, 5]) if (pasoMin % p === 0) return p;
  return 1;
}

/** El primer instante >= t que cae en la grilla de `alineacion` minutos, contada desde la hora en punto en `zona`. */
function alinear(t: number, zona: string, alineacion: number): number {
  const enMinuto = Math.ceil(t / MIN) * MIN;
  if (alineacion <= 1) return enMinuto;
  const p = partesEnZona(enMinuto, zona);
  const resto = (p.hora * 60 + p.minuto) % alineacion;
  return resto === 0 ? enMinuto : enMinuto + (alineacion - resto) * MIN;
}

/** La última fecha (en la zona del horario) en que todavía se puede reservar, o null si no hay tope. */
export function ultimaFechaReservable(v: Ventana, hoy: string, h: Horario): string | null {
  if (v.tipo === 'sin_limite') return null;
  if (v.tipo === 'naturales') return sumarDias(hoy, v.dias);
  // Hábiles: de lunes a viernes, sin los feriados en que ESTE negocio cierra.
  // Un negocio que atiende feriados los cuenta como días de trabajo.
  let f = hoy;
  for (let n = 0; n < v.dias;) {
    f = sumarDias(f, 1);
    const d = diaDeSemanaDe(f);
    if (d >= 1 && d <= 5 && !cierraPorFeriado(f, h.feriados)) n++;
  }
  return f;
}

type Candidato = { inicio: number; fin: number; quedan: number; recursoId: string };

function candidatosDelRecurso(
  e: EntradaMotor,
  r: RecursoMotor,
  fechasHost: readonly string[],
  diasEnLimite: ReadonlySet<string>,
): Candidato[] {
  const s = e.servicio;
  const h = r.horario;
  const duracion = s.duracionMin * MIN;
  const paso = Math.max(1, s.pasoMin ?? s.duracionMin);
  const alineacion = pasoDeAlineacion(paso);

  let rangos = rangosDelHorario(h, fechasHost);
  if (e.horarioServicio) rangos = intersectar(rangos, rangosDelHorario(e.horarioServicio, fechasHost));

  // Las reservas de ESTE servicio con cupo no se restan: comparten su horario
  // hasta llenarlo. Todo lo demás ocupa al recurso entero.
  const conCupo = s.cupos > 1;
  const delRecurso = e.ocupados.filter((o) => o.recursoId === r.id && o.fin > o.inicio);
  const agrandar = (o: Ocupado): Rango => [
    o.inicio - ((o.margenAntesMin ?? 0) + s.margenDespuesMin) * MIN,
    o.fin + ((o.margenDespuesMin ?? 0) + s.margenAntesMin) * MIN,
  ];
  const compartidas = conCupo ? delRecurso.filter((o) => o.servicioId === s.id) : [];
  const bloqueos = delRecurso.filter((o) => !compartidas.includes(o)).map(agrandar);

  // El día que llegó al límite se vuelve un bloque ocupado entero: la misma
  // resta lo saca, sin un camino aparte.
  for (const dia of diasEnLimite) {
    const a = instanteEnZona(dia, '00:00', h.zona);
    const b = instanteEnZona(sumarDias(dia, 1), '00:00', h.zona);
    if (a !== null && b !== null) bloqueos.push([a, b]);
  }

  const libres = restar(rangos, bloqueos);

  const hoyHost = claveDiaEnZona(e.ahora, h.zona);
  const ultima = ultimaFechaReservable(s.ventana, hoyHost, h);
  // La ventana se mide por el INICIO: el último día vale entero, aunque la cita
  // de las 23:30 termine al día siguiente.
  const finVentana = ultima === null ? Infinity : instanteEnZona(sumarDias(ultima, 1), '00:00', h.zona) ?? Infinity;
  const minimo = e.ahora + s.avisoMinimoMin * MIN;

  const ocupadosPorInicio = new Map<number, number>();
  for (const o of compartidas) ocupadosPorInicio.set(o.inicio, (ocupadosPorInicio.get(o.inicio) ?? 0) + 1);
  const compartidasAgrandadas = compartidas.map((o) => ({ o, r: agrandar(o) }));

  const out: Candidato[] = [];
  for (const [a, b] of libres) {
    for (let t = alinear(Math.max(a, minimo), h.zona, alineacion); t + duracion <= b && t < finVentana; t += paso * MIN) {
      // Con cupo: el horario de una reserva del servicio se ofrece mientras
      // quede lugar; cualquier otro inicio que se le pise queda ocupado.
      const yaReservados = ocupadosPorInicio.get(t) ?? 0;
      const pisa = compartidasAgrandadas.some(({ o, r: [oa, ob] }) => o.inicio !== t && oa < t + duracion && ob > t);
      if (pisa) continue;
      const quedan = s.cupos - yaReservados;
      if (quedan <= 0) continue;
      out.push({ inicio: t, fin: t + duracion, quedan, recursoId: r.id });
    }
  }
  return out;
}

/** Las fechas de `desde` a `hasta`, inclusive. */
function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta && out.length <= MAX_DIAS_CONSULTA; f = sumarDias(f, 1)) out.push(f);
  return out;
}

/** Los días que ya llegaron al límite diario del servicio, en la zona de ese horario. */
function diasEnLimite(e: EntradaMotor, zona: string): Set<string> {
  const lim = e.servicio.limiteDiario;
  const out = new Set<string>();
  if (lim === null) return out;
  // Una reserva es una cita: con cupo, el horario compartido cuenta una vez
  // (si no, sumarse a una clase gastaría el límite, como el #17221 de Cal.diy).
  const porDia = new Map<string, Set<string>>();
  for (const o of e.ocupados) {
    if (o.servicioId !== e.servicio.id) continue;
    const dia = claveDiaEnZona(o.inicio, zona);
    const set = porDia.get(dia) ?? new Set<string>();
    set.add(`${o.recursoId}|${o.inicio}`);
    porDia.set(dia, set);
  }
  for (const [dia, set] of porDia) if (set.size >= lim) out.add(dia);
  return out;
}

function motivoDelDia(e: EntradaMotor, fecha: string): MotivoSinHorarios {
  // Se explica en la zona del primer recurso: en la vista previa es la misma
  // que la del cliente, y para un cliente en otra zona es una aproximación.
  const r = e.recursos[0];
  if (!r) return { tipo: 'cerrado' };
  const h = r.horario;
  const hoy = claveDiaEnZona(e.ahora, h.zona);
  if (fecha < hoy) return { tipo: 'pasado' };
  const ultima = ultimaFechaReservable(e.servicio.ventana, hoy, h);
  if (ultima !== null && fecha > ultima) return { tipo: 'fuera_de_ventana' };
  const dias = e.recursos.map((x) => franjasDelDia(x.horario, fecha));
  if (dias.every((d) => d.franjas.length === 0)) {
    const f = dias.some((d) => d.origen === 'feriado') ? feriadoDe(fecha) : null;
    return f ? { tipo: 'feriado', nombre: f.nombre } : { tipo: 'cerrado' };
  }
  // Lo que de verdad abre ese día es el cruce con los días propios del
  // servicio: si el servicio no se da ese día, está cerrado aunque quien
  // atiende trabaje.
  const delServicio = e.horarioServicio ? rangosDelHorario(e.horarioServicio, [fecha]) : null;
  const rangos = e.recursos.flatMap((x) => {
    const propios = rangosDelHorario(x.horario, [fecha]);
    return delServicio ? intersectar(propios, delServicio) : propios;
  });
  if (rangos.length === 0) return { tipo: 'cerrado' };
  if (diasEnLimite(e, h.zona).has(fecha)) return { tipo: 'limite_diario' };
  // Si todo lo que abre ese día termina antes del aviso mínimo, el motivo es el
  // aviso, no que esté lleno.
  const minimo = e.ahora + e.servicio.avisoMinimoMin * MIN;
  if (rangos.every(([, b]) => b - e.servicio.duracionMin * MIN < minimo)) return { tipo: 'aviso_minimo' };
  return { tipo: 'ocupado' };
}

/**
 * Los horarios libres de un servicio, día por día, en la zona del cliente.
 * Devuelve TODAS las fechas pedidas, también las vacías (con su motivo), para
 * que la pantalla pinte el mes sin adivinar.
 */
export function horariosLibres(e: EntradaMotor): DiaLibre[] {
  const fechas = fechasEntre(e.desde, e.hasta);
  if (fechas.length === 0 || e.servicio.duracionMin <= 0 || e.servicio.cupos < 1) {
    return fechas.map((fecha) => ({ fecha, horarios: [], motivo: { tipo: 'cerrado' } }));
  }
  // Las fechas del negocio que pueden caer en las del cliente: dos días de
  // colchón a cada lado alcanzan para cualquier par de zonas (la diferencia más
  // grande entre dos zonas es de 26 horas).
  const fechasHost = fechasEntre(sumarDias(fechas[0], -2), sumarDias(fechas[fechas.length - 1], 2));

  const porInicio = new Map<number, HorarioLibre>();
  for (const r of e.recursos) {
    for (const c of candidatosDelRecurso(e, r, fechasHost, diasEnLimite(e, r.horario.zona))) {
      const ya = porInicio.get(c.inicio);
      if (ya) {
        ya.recursos.push(c.recursoId);
        ya.quedan = Math.max(ya.quedan, c.quedan);
      } else {
        porInicio.set(c.inicio, { inicio: c.inicio, fin: c.fin, quedan: c.quedan, recursos: [c.recursoId] });
      }
    }
  }

  const porFecha = new Map<string, HorarioLibre[]>(fechas.map((f) => [f, []]));
  for (const libre of [...porInicio.values()].sort((a, b) => a.inicio - b.inicio)) {
    porFecha.get(claveDiaEnZona(libre.inicio, e.zonaCliente))?.push(libre);
  }
  return fechas.map((fecha) => {
    const horarios = porFecha.get(fecha) ?? [];
    return horarios.length > 0 ? { fecha, horarios } : { fecha, horarios, motivo: motivoDelDia(e, fecha) };
  });
}

/**
 * Si ese inicio exacto se puede reservar, y con quién. Es la validación al
 * reservar: llama a `horariosLibres`, así listar y validar nunca discrepan.
 */
export function estaLibre(
  e: Omit<EntradaMotor, 'desde' | 'hasta'>,
  inicio: number,
): { libre: false } | { libre: true; horario: HorarioLibre } {
  const fecha = claveDiaEnZona(inicio, e.zonaCliente);
  const [dia] = horariosLibres({ ...e, desde: fecha, hasta: fecha });
  const horario = dia?.horarios.find((x) => x.inicio === inicio);
  return horario ? { libre: true, horario } : { libre: false };
}
