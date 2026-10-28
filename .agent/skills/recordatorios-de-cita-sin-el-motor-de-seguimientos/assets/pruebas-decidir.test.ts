import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRACIA_MS,
  debeReintentar,
  decidirRecordatorios,
  llaveDeEnvio,
  momentoDelRecordatorio,
  type CitaParaRecordar,
} from '@/lib/recordatorios/decidir';
import { antesEnPalabras, minutosValidos } from '@/lib/recordatorios/tipos';

// Costa Rica es UTC-6 todo el año: 10:00 CR = 16:00 UTC.
const CR = 'America/Costa_Rica';
const cr = (iso: string) => Date.parse(`${iso}-06:00`);
const POR_DEFECTO = [{ minutosAntes: 1440 }, { minutosAntes: 180 }];
const HACE_UN_MES = cr('2026-09-29T10:00:00');

function decidir(citas: CitaParaRecordar[], ahora: string, extra: Partial<Parameters<typeof decidirRecordatorios>[0]> = {}) {
  return decidirRecordatorios({
    citas, reglas: POR_DEFECTO, yaDecididos: new Set(), activadoMs: HACE_UN_MES, zona: CR, ahoraMs: cr(ahora), ...extra,
  });
}

// El ejemplo que se le mostró a Hans: María, jueves 29 a las 10:00.
const maria: CitaParaRecordar = { id: 'maria', inicioMs: cr('2026-10-29T10:00:00'), fijadaMs: cr('2026-10-27T09:00:00') };

test('⭐ el de 1 día sale el miércoles a las 10:00 y no antes', () => {
  assert.deepEqual(decidir([maria], '2026-10-28T09:59:00'), []);
  const r = decidir([maria], '2026-10-28T10:00:30');
  assert.equal(r.length, 1);
  assert.deepEqual({ accion: r[0].accion, minutos: r[0].minutosAntes, programado: r[0].programadoMs },
    { accion: 'enviar', minutos: 1440, programado: cr('2026-10-28T10:00:00') });
});

test('⭐ el de 3 horas de una cita a las 10:00 sale a las 7:00', () => {
  const ya = new Set([llaveDeEnvio('maria', 1440, maria.inicioMs)]);
  const r = decidir([maria], '2026-10-29T07:00:30', { yaDecididos: ya });
  assert.equal(r.length, 1);
  assert.equal(r[0].accion, 'enviar');
  assert.equal(r[0].programadoMs, cr('2026-10-29T07:00:00'));
});

test('⭐ de noche no: una cita a las 8:00 recibe el de 3 horas a las 7:00, no a las 5:00', () => {
  const pedro: CitaParaRecordar = { id: 'pedro', inicioMs: cr('2026-10-31T08:00:00'), fijadaMs: HACE_UN_MES };
  assert.equal(momentoDelRecordatorio(pedro.inicioMs, 180, CR), cr('2026-10-31T07:00:00'));
  // Control negativo: sin la regla, a las 5:30 ya habría salido.
  assert.ok(pedro.inicioMs - 180 * 60_000 < cr('2026-10-31T05:30:00'));
  const ya = new Set([llaveDeEnvio('pedro', 1440, pedro.inicioMs)]);
  assert.deepEqual(decidir([pedro], '2026-10-31T05:30:00', { yaDecididos: ya }), []);
  const r = decidir([pedro], '2026-10-31T07:01:00', { yaDecididos: ya });
  assert.deepEqual(r.map((d) => [d.minutosAntes, d.accion]), [[180, 'enviar']]);
});

test('una cita antes de las 7:00 no tiene hora decente para el de 3 horas: queda omitido', () => {
  const temprano: CitaParaRecordar = { id: 'temprano', inicioMs: cr('2026-10-31T06:30:00'), fijadaMs: HACE_UN_MES };
  assert.equal(momentoDelRecordatorio(temprano.inicioMs, 180, CR), null);
  const ya = new Set([llaveDeEnvio('temprano', 1440, temprano.inicioMs)]);
  const r = decidir([temprano], '2026-10-31T03:31:00', { yaDecididos: ya });
  assert.deepEqual(r.map((d) => (d.accion === 'omitir' ? d.motivo : d.accion)), ['de_madrugada']);
});

test('⭐ reservada tarde: la que se reservó después de la hora del recordatorio no lo recibe', () => {
  // María reserva el miércoles a las 15:00 para el jueves a las 10:00.
  const tarde: CitaParaRecordar = { ...maria, id: 'tarde', fijadaMs: cr('2026-10-28T15:00:00') };
  const r = decidir([tarde], '2026-10-28T15:05:00');
  assert.deepEqual(r.map((d) => [d.minutosAntes, d.accion === 'omitir' ? d.motivo : d.accion]), [[1440, 'reservada_despues']]);
  const ya = new Set([llaveDeEnvio('tarde', 1440, tarde.inicioMs)]);
  assert.deepEqual(decidir([tarde], '2026-10-29T07:01:00', { yaDecididos: ya }).map((d) => d.accion), ['enviar']);
  // Hoy a las 9:00 para hoy a las 11:00: ninguno.
  const hoy: CitaParaRecordar = { id: 'hoy', inicioMs: cr('2026-10-29T11:00:00'), fijadaMs: cr('2026-10-29T09:00:00') };
  const r2 = decidir([hoy], '2026-10-29T09:01:00');
  assert.ok(r2.every((d) => d.accion === 'omitir'));
  assert.equal(r2.length, 2);
});

test('⭐ una cita movida se decide para su hora NUEVA; lo de la hora vieja no la frena', () => {
  // Se le mandó el de 1 día para el jueves; la movieron el miércoles a las 12:00 al viernes a las 10:00.
  const viejo = new Set([llaveDeEnvio('maria', 1440, maria.inicioMs)]);
  const movida: CitaParaRecordar = { id: 'maria', inicioMs: cr('2026-10-30T10:00:00'), fijadaMs: cr('2026-10-28T12:00:00') };
  assert.deepEqual(decidir([movida], '2026-10-29T07:01:00', { yaDecididos: viejo }), []);
  const r = decidir([movida], '2026-10-29T10:00:30', { yaDecididos: viejo });
  assert.deepEqual(r.map((d) => [d.minutosAntes, d.accion, d.inicioMs]), [[1440, 'enviar', movida.inicioMs]]);
});

test('si tocaban dos a la vez, sale uno solo: el más cercano a la cita', () => {
  const cita: CitaParaRecordar = { id: 'c', inicioMs: cr('2026-10-29T12:00:00'), fijadaMs: HACE_UN_MES };
  const r = decidir([cita], '2026-10-29T10:05:00', { reglas: [{ minutosAntes: 180 }, { minutosAntes: 120 }] });
  assert.deepEqual(r.map((d) => [d.minutosAntes, d.accion === 'omitir' ? d.motivo : d.accion]), [[120, 'enviar'], [180, 'llega_otro']]);
});

test('con más de 2 horas de atraso ya no sale (el cron estuvo caído)', () => {
  const r = decidir([maria], '2026-10-29T07:05:00');
  assert.deepEqual(r.map((d) => [d.minutosAntes, d.accion === 'omitir' ? d.motivo : d.accion]), [[180, 'enviar'], [1440, 'vencido']]);
});

test('prender los recordatorios no dispara los que ya habían vencido', () => {
  const r = decidir([maria], '2026-10-28T10:30:00', { activadoMs: cr('2026-10-28T10:20:00') });
  assert.deepEqual(r.map((d) => (d.accion === 'omitir' ? d.motivo : d.accion)), ['antes_de_activar']);
});

test('apagados, ya decididos o con la cita pasada: nada', () => {
  assert.deepEqual(decidir([maria], '2026-10-28T10:00:30', { activadoMs: null }), []);
  const todo = new Set([llaveDeEnvio('maria', 1440, maria.inicioMs), llaveDeEnvio('maria', 180, maria.inicioMs)]);
  assert.deepEqual(decidir([maria], '2026-10-29T09:00:00', { yaDecididos: todo }), []);
  assert.deepEqual(decidir([maria], '2026-10-29T10:00:01'), []);
});

test('reintentos: hasta 3 y dentro de las 2 horas', () => {
  const base = { programadoMs: cr('2026-10-29T07:00:00'), inicioMs: maria.inicioMs };
  assert.equal(debeReintentar({ ...base, intentos: 1, ahoraMs: cr('2026-10-29T07:10:00') }), true);
  assert.equal(debeReintentar({ ...base, intentos: 3, ahoraMs: cr('2026-10-29T07:10:00') }), false);
  assert.equal(debeReintentar({ ...base, intentos: 1, ahoraMs: base.programadoMs + GRACIA_MS + 60_000 }), false);
});

test('las palabras y el rango de la pantalla', () => {
  assert.equal(antesEnPalabras(1440), '1 día');
  assert.equal(antesEnPalabras(180), '3 horas');
  assert.equal(antesEnPalabras(60), '1 hora');
  assert.equal(antesEnPalabras(1440 * 2 + 240), '2 días y 4 horas');
  assert.equal(minutosValidos(60), true);
  assert.equal(minutosValidos(59), false);
  assert.equal(minutosValidos(90), false);
  assert.equal(minutosValidos(7 * 24 * 60), true);
  assert.equal(minutosValidos(7 * 24 * 60 + 60), false);
});
