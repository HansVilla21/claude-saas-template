// El aviso mínimo de cada persona: miércoles 4 de noviembre de 2026 a las 11:20 en
// Costa Rica, servicio de 1 h con 4 horas de aviso y atención de 8:00 a 17:00.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { horaEnZona } from './tz.ts';
import { estaLibre, horariosLibres, type EntradaMotor, type RecursoMotor, type ServicioMotor } from './motor.ts';
import { semanaPorDefecto, type Horario } from './semana.ts';

const CR = 'America/Costa_Rica';
const HOY = '2026-11-04';
const MANANA = '2026-11-05';
const AHORA = Date.parse('2026-11-04T17:20:00Z');
const UN_DIA = 24 * 60;

const horario: Horario = { zona: CR, semana: semanaPorDefecto(), excepciones: {}, feriados: 'ninguno' };
const servicio = (over: Partial<ServicioMotor> = {}): ServicioMotor => ({
  id: 's1', duracionMin: 60, pasoMin: null, margenAntesMin: 0, margenDespuesMin: 0,
  avisoMinimoMin: 240, ventana: { tipo: 'naturales', dias: 14 }, limiteDiario: null, cupos: 1, ...over,
});
const persona = (id: string, avisoMinimoMin?: number): RecursoMotor => ({
  id, horario, ...(avisoMinimoMin === undefined ? {} : { avisoMinimoMin }),
});
const entrada = (over: Partial<EntradaMotor> = {}): EntradaMotor => ({
  servicio: servicio(), recursos: [persona('ana')], ocupados: [], desde: HOY, hasta: HOY, zonaCliente: CR, ahora: AHORA, ...over,
});
const horas = (e: EntradaMotor) => horariosLibres(e)[0].horarios.map((h) => horaEnZona(h.inicio, CR));
const cr = (fecha: string, hhmm: string) => Date.parse(`${fecha}T${hhmm}:00-06:00`);

test('sin aviso propio manda el del servicio', () => {
  assert.deepEqual(horas(entrada()), ['16:00']);
});

test('manda el más largo: la persona con 1 día le gana al servicio de 4 horas', () => {
  const e = entrada({ recursos: [persona('ana', UN_DIA)] });
  const [dia] = horariosLibres(e);
  assert.deepEqual(dia.horarios, []);
  assert.deepEqual(dia.motivo, { tipo: 'aviso_minimo' });
  assert.equal(estaLibre(e, cr(HOY, '16:00')).libre, false);
  assert.deepEqual(horas({ ...e, desde: MANANA, hasta: MANANA }), ['12:00', '13:00', '14:00', '15:00', '16:00']);
});

test('una persona con 30 minutos no achica las 4 horas del servicio', () => {
  assert.deepEqual(horas(entrada({ recursos: [persona('ana', 30)] })), ['16:00']);
});

test('un servicio sin aviso respeta el de la persona', () => {
  const e = entrada({ servicio: servicio({ avisoMinimoMin: 0 }), recursos: [persona('ana', 120)] });
  assert.deepEqual(horas(e), ['14:00', '15:00', '16:00']);
});

test('con varios, cada uno cuenta con el suyo', () => {
  const e = entrada({ recursos: [persona('beto', UN_DIA), persona('ana')] });
  const [hoy] = horariosLibres(e);
  assert.deepEqual(hoy.horarios.map((h) => [horaEnZona(h.inicio, CR), h.recursos]), [['16:00', ['ana']]]);
  const r = estaLibre(e, cr(HOY, '16:00'));
  assert.equal(r.libre && r.horario.recursos.join(), 'ana');
});

test('el motivo es el aviso solo si no le alcanza a ninguno', () => {
  const tarde = Date.parse('2026-11-04T22:00:00Z'); // 16:00
  const conUno = entrada({ ahora: tarde, servicio: servicio({ avisoMinimoMin: 0 }), recursos: [persona('beto', UN_DIA), persona('ana')] });
  assert.deepEqual(horariosLibres(conUno)[0].horarios.map((h) => h.recursos), [['ana']]);
  const conTodos = entrada({ ahora: tarde, servicio: servicio({ avisoMinimoMin: 0 }), recursos: [persona('beto', UN_DIA), persona('ana', UN_DIA)] });
  assert.deepEqual(horariosLibres(conTodos)[0].motivo, { tipo: 'aviso_minimo' });
});
