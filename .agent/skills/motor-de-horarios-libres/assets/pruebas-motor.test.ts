import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaEnZona } from './tz.ts';
import { estaLibre, horariosLibres, pasoDeAlineacion, type EntradaMotor, type Ocupado, type ServicioMotor } from './motor.ts';
import { semanaPorDefecto, type Franja, type Horario, type Semana } from './semana.ts';

const CR = 'America/Costa_Rica';

/** De lunes a viernes de 9 a 17, como el horario que REA OS usó en Calendly. */
function semana9a17(): Semana {
  return Array.from({ length: 7 }, (_, d) => (d >= 1 && d <= 5 ? [{ desde: '09:00', hasta: '17:00' }] : []));
}

function horario(over: Partial<Horario> = {}): Horario {
  return { zona: CR, semana: semana9a17(), excepciones: {}, feriados: 'todos', ...over };
}

/** El tipo de reunión de la prueba de REA OS: 45 min cada 30, 24 h de aviso, 14 días naturales. */
function servicio(over: Partial<ServicioMotor> = {}): ServicioMotor {
  return {
    id: 's1',
    duracionMin: 45,
    pasoMin: 30,
    margenAntesMin: 0,
    margenDespuesMin: 0,
    avisoMinimoMin: 24 * 60,
    ventana: { tipo: 'naturales', dias: 14 },
    limiteDiario: null,
    cupos: 1,
    ...over,
  };
}

// "Ahora" de la prueba de REA OS: domingo 25 de octubre de 2026, 16:16 en Costa Rica (UTC-6).
const DOMINGO_1616 = Date.parse('2026-10-25T22:16:00Z');

function entrada(over: Partial<EntradaMotor> = {}): EntradaMotor {
  return {
    servicio: servicio(),
    recursos: [{ id: 'ana', horario: horario() }],
    ocupados: [],
    desde: '2026-10-26',
    hasta: '2026-10-26',
    zonaCliente: CR,
    ahora: DOMINGO_1616,
    ...over,
  };
}

const horas = (dias: ReturnType<typeof horariosLibres>, i = 0, zona = CR) =>
  dias[i].horarios.map((h) => horaEnZona(h.inicio, zona));

/** El instante de una hora de Costa Rica. */
const cr = (fecha: string, hhmm: string) => Date.parse(`${fecha}T${hhmm}:00-06:00`);

// ── Los casos que REA OS midió en vivo en Calendly (§10 de su guía) ───────────

test('domingo a las 16:16 con 24 h de aviso: el lunes no tiene horarios', () => {
  const [lunes] = horariosLibres(entrada());
  assert.equal(lunes.horarios.length, 0);
  // El último del lunes, a las 16:00, queda a menos de 24 horas.
  assert.deepEqual(lunes.motivo, { tipo: 'aviso_minimo' });
});

test('un martes: 15 horarios, de 09:00 a 16:00 cada 30 minutos', () => {
  const dias = horariosLibres(entrada({ desde: '2026-10-27', hasta: '2026-10-27' }));
  const h = horas(dias);
  assert.equal(h.length, 15);
  assert.equal(h[0], '09:00');
  assert.equal(h[1], '09:30');
  // 16:30 + 45 min = 17:15: no entra.
  assert.equal(h[h.length - 1], '16:00');
});

test('el mismo martes con el cliente en Madrid: de 16:00 a 23:00', () => {
  const madrid = 'Europe/Madrid';
  const dias = horariosLibres(entrada({ desde: '2026-10-27', hasta: '2026-10-27', zonaCliente: madrid }));
  const h = horas(dias, 0, madrid);
  assert.equal(h.length, 15);
  assert.equal(h[0], '16:00');
  assert.equal(h[h.length - 1], '23:00');
});

test('la ventana de 14 días naturales: el día 14 sí, el 15 no', () => {
  const dias = horariosLibres(entrada({ desde: '2026-11-06', hasta: '2026-11-09' }));
  assert.equal(dias[0].fecha, '2026-11-06');
  assert.equal(dias[0].horarios.length, 15, 'el viernes 6 está adentro');
  // El 8 es domingo (cerrado igual) y es el último día de la ventana.
  assert.deepEqual(dias[2].motivo, { tipo: 'cerrado' });
  assert.equal(dias[3].fecha, '2026-11-09');
  assert.equal(dias[3].horarios.length, 0);
  assert.deepEqual(dias[3].motivo, { tipo: 'fuera_de_ventana' });
});

test('Tokio: «hoy» y las fechas son las del cliente; aparece el sábado y desaparece el martes', () => {
  const tokio = 'Asia/Tokyo';
  // Lunes 26 a las 07:29 en Tokio = domingo 25 a las 16:29 en Costa Rica.
  const ahora = Date.parse('2026-10-25T22:29:00Z');
  const dias = horariosLibres(entrada({ ahora, desde: '2026-10-26', hasta: '2026-10-31', zonaCliente: tokio }));
  const conHorarios = dias.filter((d) => d.horarios.length > 0).map((d) => d.fecha);
  assert.deepEqual(conHorarios, ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
  // El viernes de 9 a 16 en Costa Rica es el sábado de 0:00 a 7:00 en Tokio.
  assert.equal(horas(dias, 5, tokio)[0], '00:00');
  assert.equal(horas(dias, 5, tokio).at(-1), '07:00');
});

// ── Alineación ────────────────────────────────────────────────────────────────

test('el paso de alineación: 30 → 30, 45 → 15, 60 → 60, 8 → 1', () => {
  assert.equal(pasoDeAlineacion(30), 30);
  assert.equal(pasoDeAlineacion(45), 15);
  assert.equal(pasoDeAlineacion(60), 60);
  assert.equal(pasoDeAlineacion(25), 5);
  assert.equal(pasoDeAlineacion(8), 1);
});

test('sin paso propio se ofrece cada lo que dura: 45 min → 9:00, 9:45, 10:30', () => {
  const dias = horariosLibres(entrada({ servicio: servicio({ pasoMin: null }), desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.deepEqual(horas(dias).slice(0, 3), ['09:00', '09:45', '10:30']);
});

test('después de una cita que termina a las 10:10, el siguiente es a las 10:30 (la grilla cuenta desde la hora en punto)', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '09:00'), fin: cr('2026-10-27', '10:10') }];
  const dias = horariosLibres(entrada({ servicio: servicio({ duracionMin: 30 }), ocupados, desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.equal(horas(dias)[0], '10:30');
});

test('con el aviso mínimo, el primer horario de hoy cae en la grilla, no en la hora exacta', () => {
  // Martes 27 a las 10:07 con 2 h de aviso: el mínimo es 12:07, el primero 12:30.
  const ahora = cr('2026-10-27', '10:07');
  const dias = horariosLibres(entrada({ ahora, servicio: servicio({ avisoMinimoMin: 120 }), desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.equal(horas(dias)[0], '12:30');
});

// ── Lo ocupado y los márgenes ─────────────────────────────────────────────────

test('una cita a las 10:00 saca los horarios que se le pisan', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '10:00'), fin: cr('2026-10-27', '11:00') }];
  const h = horas(horariosLibres(entrada({ servicio: servicio({ duracionMin: 30 }), ocupados, desde: '2026-10-27', hasta: '2026-10-27' })));
  assert.ok(h.includes('09:30'), '9:30 termina justo a las 10:00');
  assert.ok(!h.includes('10:00') && !h.includes('10:30'));
  assert.ok(h.includes('11:00'));
});

test('con 15 min de margen después, el de las 9:30 ya no entra antes de la cita de las 10:00', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '10:00'), fin: cr('2026-10-27', '11:00') }];
  const s = servicio({ duracionMin: 30, margenDespuesMin: 15 });
  const h = horas(horariosLibres(entrada({ servicio: s, ocupados, desde: '2026-10-27', hasta: '2026-10-27' })));
  assert.ok(h.includes('09:00'));
  assert.ok(!h.includes('09:30'));
  assert.ok(h.includes('11:00'), 'el margen de después no afecta al que empieza cuando termina la cita');
});

test('con 15 min de margen antes, después de la cita el primero es 11:30', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '10:00'), fin: cr('2026-10-27', '11:00') }];
  const s = servicio({ duracionMin: 30, margenAntesMin: 15 });
  const h = horas(horariosLibres(entrada({ servicio: s, ocupados, desde: '2026-10-27', hasta: '2026-10-27' })));
  assert.ok(!h.includes('11:00'));
  assert.ok(h.includes('11:30'));
});

test('los márgenes no se aplican contra el borde del horario: con 15 antes, igual se ofrece a las 9:00', () => {
  const s = servicio({ duracionMin: 30, margenAntesMin: 15, margenDespuesMin: 15 });
  const h = horas(horariosLibres(entrada({ servicio: s, desde: '2026-10-27', hasta: '2026-10-27' })));
  assert.equal(h[0], '09:00');
  assert.equal(h.at(-1), '16:30');
});

test('los márgenes congelados de la cita existente se suman a los del servicio', () => {
  // La cita de 10:00 a 11:00 tiene 30 min de margen después: ocupa hasta 11:30.
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '10:00'), fin: cr('2026-10-27', '11:00'), margenDespuesMin: 30 }];
  const h = horas(horariosLibres(entrada({ servicio: servicio({ duracionMin: 30 }), ocupados, desde: '2026-10-27', hasta: '2026-10-27' })));
  assert.ok(!h.includes('11:00'));
  assert.ok(h.includes('11:30'));
});

test('lo ocupado de otra persona no le quita horarios a esta', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'luis', inicio: cr('2026-10-27', '09:00'), fin: cr('2026-10-27', '17:00') }];
  const dias = horariosLibres(entrada({ ocupados, desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.equal(dias[0].horarios.length, 15);
});

test('con dos personas, un horario sale si al menos una está libre, y dice cuál', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '10:00'), fin: cr('2026-10-27', '11:00') }];
  const recursos = [{ id: 'ana', horario: horario() }, { id: 'luis', horario: horario() }];
  const [dia] = horariosLibres(entrada({ recursos, servicio: servicio({ duracionMin: 30 }), ocupados, desde: '2026-10-27', hasta: '2026-10-27' }));
  const diez = dia.horarios.find((h) => horaEnZona(h.inicio, CR) === '10:00');
  assert.deepEqual(diez?.recursos, ['luis']);
  const nueve = dia.horarios.find((h) => horaEnZona(h.inicio, CR) === '09:00');
  assert.deepEqual(nueve?.recursos, ['ana', 'luis']);
});

test('el día todo ocupado dice «ocupado», no «cerrado»', () => {
  const ocupados: Ocupado[] = [{ recursoId: 'ana', inicio: cr('2026-10-27', '08:00'), fin: cr('2026-10-27', '18:00') }];
  const [dia] = horariosLibres(entrada({ ocupados, desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.deepEqual(dia.motivo, { tipo: 'ocupado' });
});

// ── Cupos ─────────────────────────────────────────────────────────────────────

const reto = (over: Partial<ServicioMotor> = {}) =>
  servicio({ id: 'reto', duracionMin: 60, pasoMin: 60, cupos: 2, avisoMinimoMin: 0, ...over });
const reservaDelReto = (hhmm: string): Ocupado =>
  ({ recursoId: 'ana', inicio: cr('2026-10-27', hhmm), fin: cr('2026-10-27', hhmm) + 60 * 60_000, servicioId: 'reto' });

test('cupo de 2: con una reserva el horario sigue saliendo, con «queda 1»', () => {
  const [dia] = horariosLibres(entrada({ servicio: reto(), ocupados: [reservaDelReto('10:00')], desde: '2026-10-27', hasta: '2026-10-27' }));
  const diez = dia.horarios.find((h) => horaEnZona(h.inicio, CR) === '10:00');
  assert.equal(diez?.quedan, 1);
  assert.equal(dia.horarios.find((h) => horaEnZona(h.inicio, CR) === '09:00')?.quedan, 2);
});

test('cupo de 2 con dos reservas: el horario lleno no sale del motor', () => {
  const [dia] = horariosLibres(entrada({ servicio: reto(), ocupados: [reservaDelReto('10:00'), reservaDelReto('10:00')], desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.ok(!horas([dia]).includes('10:00'));
});

test('una cita de OTRO servicio a la misma hora ocupa el horario entero, aunque haya cupo', () => {
  const otra: Ocupado = { ...reservaDelReto('10:00'), servicioId: 'otro' };
  const [dia] = horariosLibres(entrada({ servicio: reto(), ocupados: [otra], desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.ok(!horas([dia]).includes('10:00'));
});

test('con cupo, los inicios que se le pisan a una reserva quedan ocupados', () => {
  const [dia] = horariosLibres(entrada({ servicio: reto({ pasoMin: 30 }), ocupados: [reservaDelReto('10:00')], desde: '2026-10-27', hasta: '2026-10-27' }));
  const h = horas([dia]);
  assert.ok(h.includes('10:00'));
  assert.ok(!h.includes('09:30') && !h.includes('10:30'));
  assert.ok(h.includes('09:00') && h.includes('11:00'));
});

// ── Límite diario ─────────────────────────────────────────────────────────────

test('límite de 2 por día: con dos reservas del servicio el día se cierra', () => {
  const s = servicio({ duracionMin: 30, limiteDiario: 2, avisoMinimoMin: 0 });
  const ocupados: Ocupado[] = ['09:00', '11:00'].map((h) => ({
    recursoId: 'ana', inicio: cr('2026-10-27', h), fin: cr('2026-10-27', h) + 30 * 60_000, servicioId: 's1',
  }));
  const [martes, miercoles] = horariosLibres(entrada({ servicio: s, ocupados, desde: '2026-10-27', hasta: '2026-10-28' }));
  assert.equal(martes.horarios.length, 0);
  assert.deepEqual(martes.motivo, { tipo: 'limite_diario' });
  assert.ok(miercoles.horarios.length > 0);
});

test('límite diario con cupo: varias personas en el mismo horario cuentan como UNA reserva', () => {
  const s = reto({ limiteDiario: 2 });
  const [dia] = horariosLibres(entrada({ servicio: s, ocupados: [reservaDelReto('10:00'), reservaDelReto('10:00')], desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.ok(dia.horarios.length > 0);
});

// ── Feriados y días especiales ────────────────────────────────────────────────

test('el 1 de diciembre (martes, feriado) cierra con «todos» y abre con «solo obligatorios»', () => {
  const ahora = cr('2026-11-20', '08:00');
  const base = { ahora, servicio: servicio({ ventana: { tipo: 'naturales', dias: 30 } as const }), desde: '2026-12-01', hasta: '2026-12-01' };
  const [cerrado] = horariosLibres(entrada(base));
  assert.deepEqual(cerrado.motivo, { tipo: 'feriado', nombre: 'Día de la Abolición del Ejército' });
  const [abierto] = horariosLibres(entrada({ ...base, recursos: [{ id: 'ana', horario: horario({ feriados: 'obligatorios' }) }] }));
  assert.equal(abierto.horarios.length, 15);
});

test('Navidad cierra también con «solo obligatorios», y abre si se atiende en feriados', () => {
  const ahora = cr('2026-12-10', '08:00');
  const base = { ahora, servicio: servicio({ ventana: { tipo: 'naturales', dias: 30 } as const }), desde: '2026-12-25', hasta: '2026-12-25' };
  const [obligatorios] = horariosLibres(entrada({ ...base, recursos: [{ id: 'ana', horario: horario({ feriados: 'obligatorios' }) }] }));
  assert.equal(obligatorios.horarios.length, 0);
  const [ninguno] = horariosLibres(entrada({ ...base, recursos: [{ id: 'ana', horario: horario({ feriados: 'ninguno' }) }] }));
  assert.equal(ninguno.horarios.length, 15);
});

test('un día especial le gana al feriado: abrir el 15 de setiembre de 9 a 12', () => {
  const ahora = cr('2027-09-01', '08:00');
  const excepciones: Record<string, Franja[]> = { '2027-09-15': [{ desde: '09:00', hasta: '12:00' }] };
  const [dia] = horariosLibres(entrada({ ahora, recursos: [{ id: 'ana', horario: horario({ excepciones }) }], desde: '2027-09-15', hasta: '2027-09-15' }));
  assert.deepEqual(horas([dia]), ['09:00', '09:30', '10:00', '10:30', '11:00']);
});

test('un día especial vacío cierra un día de semana (vacaciones)', () => {
  const excepciones: Record<string, Franja[]> = { '2026-10-28': [] };
  const [dia] = horariosLibres(entrada({ recursos: [{ id: 'ana', horario: horario({ excepciones }) }], desde: '2026-10-28', hasta: '2026-10-28' }));
  assert.deepEqual(dia.motivo, { tipo: 'cerrado' });
});

// ── Horario propio del servicio ───────────────────────────────────────────────

test('un servicio que solo se da martes y jueves de 9 a 12 se cruza con el horario de quien atiende', () => {
  const soloMaJu: Semana = Array.from({ length: 7 }, (_, d) => (d === 2 || d === 4 ? [{ desde: '09:00', hasta: '12:00' }] : []));
  const horarioServicio = horario({ semana: soloMaJu });
  const dias = horariosLibres(entrada({ horarioServicio, desde: '2026-10-27', hasta: '2026-10-28' }));
  assert.deepEqual(horas(dias, 0), ['09:00', '09:30', '10:00', '10:30', '11:00']);
  assert.equal(dias[1].horarios.length, 0, 'el miércoles el servicio no se da');
});

// ── Medianoche y cambio de horario ────────────────────────────────────────────

test('dos franjas pegadas en la medianoche son una sola: la cita de las 23:30 cruza al día siguiente', () => {
  const nocturna: Semana = Array.from({ length: 7 }, () => []);
  nocturna[2] = [{ desde: '22:00', hasta: '24:00' }];
  nocturna[3] = [{ desde: '00:00', hasta: '02:00' }];
  const s = servicio({ duracionMin: 60, pasoMin: 30, avisoMinimoMin: 0 });
  const dias = horariosLibres(entrada({ servicio: s, recursos: [{ id: 'ana', horario: horario({ semana: nocturna }) }], desde: '2026-10-27', hasta: '2026-10-28' }));
  assert.deepEqual(horas(dias, 0), ['22:00', '22:30', '23:00', '23:30']);
  assert.deepEqual(horas(dias, 1), ['00:00', '00:30', '01:00']);
});

test('una zona con horario de verano: las 9:00 siguen siendo las 9:00 antes y después del cambio', () => {
  const ny = 'America/New_York';
  // El 1 de noviembre de 2026 Nueva York vuelve de UTC-4 a UTC-5.
  const s = servicio({ duracionMin: 60, pasoMin: 60, avisoMinimoMin: 0 });
  const ahora = Date.parse('2026-10-29T12:00:00Z');
  const dias = horariosLibres(entrada({ ahora, servicio: s, recursos: [{ id: 'ana', horario: horario({ zona: ny }) }], zonaCliente: ny, desde: '2026-10-30', hasta: '2026-11-02' }));
  assert.equal(horas(dias, 0, ny)[0], '09:00');
  assert.equal(horas(dias, 3, ny)[0], '09:00');
  assert.equal(dias[0].horarios[0].inicio, Date.parse('2026-10-30T13:00:00Z'));
  assert.equal(dias[3].horarios[0].inicio, Date.parse('2026-11-02T14:00:00Z'));
});

// ── Ventana en días hábiles ───────────────────────────────────────────────────

test('5 días hábiles desde el viernes 27 de noviembre: el feriado del 1 no cuenta, así que llega al lunes 7', () => {
  const ahora = cr('2026-11-27', '08:00');
  const s = servicio({ ventana: { tipo: 'habiles', dias: 5 }, avisoMinimoMin: 0 });
  // Lun 30, (mar 1 feriado), mié 2, jue 3, vie 4, lun 7.
  const dias = horariosLibres(entrada({ ahora, servicio: s, desde: '2026-12-07', hasta: '2026-12-08' }));
  assert.ok(dias[0].horarios.length > 0, 'el lunes 7 está adentro');
  assert.deepEqual(dias[1].motivo, { tipo: 'fuera_de_ventana' });
  // Control: si el negocio atiende feriados, el 1 cuenta y la ventana termina el viernes 4.
  const atiende = { id: 'ana', horario: horario({ feriados: 'ninguno' }) };
  const [lunes] = horariosLibres(entrada({ ahora, servicio: s, recursos: [atiende], desde: '2026-12-07', hasta: '2026-12-07' }));
  assert.deepEqual(lunes.motivo, { tipo: 'fuera_de_ventana' });
});

test('sin límite de ventana se puede reservar dentro de un año', () => {
  const s = servicio({ ventana: { tipo: 'sin_limite' } });
  const [dia] = horariosLibres(entrada({ servicio: s, desde: '2027-10-26', hasta: '2027-10-26' }));
  assert.equal(dia.horarios.length, 15);
});

// ── Lo demás ──────────────────────────────────────────────────────────────────

test('un día que ya pasó dice «pasado»', () => {
  const [dia] = horariosLibres(entrada({ desde: '2026-10-20', hasta: '2026-10-20' }));
  assert.deepEqual(dia.motivo, { tipo: 'pasado' });
});

test('devuelve todas las fechas pedidas, también las vacías', () => {
  const dias = horariosLibres(entrada({ desde: '2026-10-26', hasta: '2026-11-01' }));
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
});

test('estaLibre usa el mismo motor: lo que se lista se puede reservar, y lo demás no', () => {
  const base = entrada({ desde: '2026-10-27', hasta: '2026-10-27' });
  const r = estaLibre(base, cr('2026-10-27', '09:30'));
  assert.equal(r.libre, true);
  assert.equal(estaLibre(base, cr('2026-10-27', '09:10')).libre, false, 'fuera de la grilla');
  assert.equal(estaLibre(base, cr('2026-10-27', '16:30')).libre, false, 'no entra antes de las 17:00');
  assert.equal(estaLibre(base, cr('2026-10-26', '15:00')).libre, false, 'dentro del aviso mínimo');
});

test('la semana por defecto es de lunes a viernes de 8 a 17', () => {
  const dias = horariosLibres(entrada({ recursos: [{ id: 'ana', horario: horario({ semana: semanaPorDefecto() }) }], servicio: servicio({ duracionMin: 60, pasoMin: 60 }), desde: '2026-10-27', hasta: '2026-10-27' }));
  assert.deepEqual(horas(dias), ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']);
});

// ── El motivo, con un servicio que tiene sus propios días ─────────────────────

const soloMananasLaV: Semana = Array.from({ length: 7 }, (_, d) => (d >= 1 && d <= 5 ? [{ desde: '08:00', hasta: '12:00' }] : []));

test('el servicio no se da el sábado: el motivo es «cerrado», aunque quien atiende sí abra', () => {
  const sabadoAbierto = semana9a17();
  sabadoAbierto[6] = [{ desde: '08:00', hasta: '12:00' }];
  const [sabado] = horariosLibres(entrada({
    recursos: [{ id: 'ana', horario: horario({ semana: sabadoAbierto }) }],
    horarioServicio: horario({ semana: soloMananasLaV, feriados: 'ninguno' }),
    desde: '2026-10-31', hasta: '2026-10-31',
  }));
  assert.deepEqual(sabado.motivo, { tipo: 'cerrado' });
});

test('con días propios, lo que se pierde por el aviso dice «aviso mínimo», no «ocupado»', () => {
  // Martes 27 a las 11:15 con 4 h de aviso: el servicio es de 8 a 12, así que hoy ya no hay.
  const ahora = cr('2026-10-27', '11:15');
  const [hoy] = horariosLibres(entrada({
    ahora,
    servicio: servicio({ duracionMin: 60, pasoMin: null, avisoMinimoMin: 240 }),
    horarioServicio: horario({ semana: soloMananasLaV, feriados: 'ninguno' }),
    desde: '2026-10-27', hasta: '2026-10-27',
  }));
  assert.deepEqual(hoy.motivo, { tipo: 'aviso_minimo' });
});
