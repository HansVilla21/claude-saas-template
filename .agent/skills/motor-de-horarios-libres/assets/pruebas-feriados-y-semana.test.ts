import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cierraPorFeriado, domingoDePascua, feriadoDe, feriadosCostaRica, proximosFeriados } from './feriados-cr.ts';
import {
  diasEntre,
  esFecha,
  franjasDelDia,
  franjasValidas,
  resumenSemana,
  revisarFranjas,
  semanaParaGuardar,
  semanaPorDefecto,
  semanaValida,
  sumarDias,
  type Horario,
} from './semana.ts';

// ── Feriados ──────────────────────────────────────────────────────────────────

test('2026 tiene los 12 feriados de la lista oficial, en su fecha natural', () => {
  // La lista del MTSS para 2026 (sin traslados).
  assert.deepEqual(feriadosCostaRica(2026).map((f) => f.fecha), [
    '2026-01-01', '2026-04-02', '2026-04-03', '2026-04-11', '2026-05-01', '2026-07-25',
    '2026-08-02', '2026-08-15', '2026-08-31', '2026-09-15', '2026-12-01', '2026-12-25',
  ]);
});

test('la Pascua: 5 de abril de 2026, 28 de marzo de 2027, 16 de abril de 2028', () => {
  assert.deepEqual(domingoDePascua(2026), [4, 5]);
  assert.deepEqual(domingoDePascua(2027), [3, 28]);
  assert.deepEqual(domingoDePascua(2028), [4, 16]);
  assert.equal(feriadoDe('2027-03-25')?.nombre, 'Jueves Santo');
  assert.equal(feriadoDe('2027-03-26')?.nombre, 'Viernes Santo');
});

test('los tres de pago no obligatorio son el 2 y el 31 de agosto y el 1 de diciembre', () => {
  assert.deepEqual(
    feriadosCostaRica(2026).filter((f) => !f.obligatorio).map((f) => f.fecha),
    ['2026-08-02', '2026-08-31', '2026-12-01'],
  );
});

test('cierraPorFeriado según el modo del horario', () => {
  assert.equal(cierraPorFeriado('2026-12-01', 'todos'), true);
  assert.equal(cierraPorFeriado('2026-12-01', 'obligatorios'), false);
  assert.equal(cierraPorFeriado('2026-12-25', 'obligatorios'), true);
  assert.equal(cierraPorFeriado('2026-12-25', 'ninguno'), false);
  assert.equal(cierraPorFeriado('2026-12-24', 'todos'), false, 'el 24 no es feriado');
});

test('los próximos feriados cruzan de año', () => {
  assert.deepEqual(proximosFeriados('2026-11-15', 3).map((f) => f.fecha), ['2026-12-01', '2026-12-25', '2027-01-01']);
});

// ── Franjas ───────────────────────────────────────────────────────────────────

test('revisarFranjas ordena y acepta franjas pegadas', () => {
  const r = revisarFranjas([{ desde: '14:00', hasta: '18:00' }, { desde: '08:00', hasta: '14:00' }]);
  assert.deepEqual(r, { ok: true, franjas: [{ desde: '08:00', hasta: '14:00' }, { desde: '14:00', hasta: '18:00' }] });
});

test('revisarFranjas rechaza lo que se pisa, lo que termina antes de empezar y las horas rotas', () => {
  assert.equal(revisarFranjas([{ desde: '08:00', hasta: '12:00' }, { desde: '11:00', hasta: '13:00' }]).ok, false);
  assert.equal(revisarFranjas([{ desde: '12:00', hasta: '08:00' }]).ok, false);
  assert.equal(revisarFranjas([{ desde: '8:00', hasta: '12:00' }]).ok, false);
  assert.equal(revisarFranjas([{ desde: '24:00', hasta: '24:00' }]).ok, false);
  assert.equal(revisarFranjas([{ desde: '22:00', hasta: '24:00' }]).ok, true, '24:00 vale como fin');
});

test('franjasValidas rechaza lo que no es una lista de franjas', () => {
  assert.equal(franjasValidas(null), null);
  assert.equal(franjasValidas([{ desde: 8, hasta: '12:00' }]), null);
  assert.deepEqual(franjasValidas([]), []);
});

test('semanaValida: un día que falta es cerrado; un día roto invalida todo', () => {
  assert.deepEqual(semanaValida({ '1': [{ desde: '08:00', hasta: '12:00' }] })?.[1], [{ desde: '08:00', hasta: '12:00' }]);
  assert.deepEqual(semanaValida({})?.[3], []);
  assert.equal(semanaValida({ '2': 'lunes' }), null);
  assert.equal(semanaValida([]), null);
});

test('la semana va y vuelve de la base igual', () => {
  const s = semanaPorDefecto();
  assert.deepEqual(semanaValida(semanaParaGuardar(s)), s);
});

// ── El día ────────────────────────────────────────────────────────────────────

function h(over: Partial<Horario> = {}): Horario {
  return { zona: 'America/Costa_Rica', semana: semanaPorDefecto(), excepciones: {}, feriados: 'todos', ...over };
}

test('franjasDelDia: el día especial le gana al feriado y el feriado a la semana', () => {
  assert.deepEqual(franjasDelDia(h(), '2026-10-27'), { franjas: [{ desde: '08:00', hasta: '17:00' }], origen: 'semana' });
  assert.deepEqual(franjasDelDia(h(), '2026-12-01'), { franjas: [], origen: 'feriado' });
  const abierto = h({ excepciones: { '2026-12-01': [{ desde: '09:00', hasta: '12:00' }] } });
  assert.deepEqual(franjasDelDia(abierto, '2026-12-01'), { franjas: [{ desde: '09:00', hasta: '12:00' }], origen: 'excepcion' });
});

// ── Fechas ────────────────────────────────────────────────────────────────────

test('fechas como texto: sumar, contar y validar', () => {
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
  assert.equal(diasEntre('2026-10-25', '2026-11-08'), 14);
  assert.equal(esFecha('2026-02-30'), false);
  assert.equal(esFecha('2026-02-28'), true);
});

// ── El resumen ────────────────────────────────────────────────────────────────

test('resumenSemana junta los días seguidos iguales', () => {
  const s = semanaPorDefecto();
  s[6] = [{ desde: '08:00', hasta: '12:00' }];
  assert.deepEqual(resumenSemana(s), ['Lun a Vie · 8:00 a 17:00', 'Sáb · 8:00 a 12:00']);
});

test('resumenSemana con almuerzo y con días sueltos', () => {
  const s = semanaPorDefecto().map(() => []) as ReturnType<typeof semanaPorDefecto>;
  s[2] = [{ desde: '08:00', hasta: '12:00' }, { desde: '13:00', hasta: '17:00' }];
  s[4] = [{ desde: '08:00', hasta: '12:00' }, { desde: '13:00', hasta: '17:00' }];
  assert.deepEqual(resumenSemana(s), ['Mar · 8:00 a 12:00 y 13:00 a 17:00', 'Jue · 8:00 a 12:00 y 13:00 a 17:00']);
  assert.deepEqual(resumenSemana(semanaPorDefecto().map(() => [])), ['Sin días abiertos']);
});
