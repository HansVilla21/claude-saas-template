// La regla de la cita a mano (decisión de Hans, 2026-11-04): a uno mismo se le
// puede agendar dentro del aviso, con una advertencia; a OTRA persona, no.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personasDeLaCita, revisarAvisoDeLaCita, textoDelAviso, type EntradaAviso } from './aviso-de-la-cita.ts';

const AHORA = Date.parse('2026-11-04T17:20:00Z'); // miércoles 11:20 en Costa Rica
const a_las = (hhmm: string) => Date.parse(`2026-11-04T${hhmm}:00-06:00`);
const HANS = { userId: 'hans', nombre: 'Hans', avisoMin: 0 };
const PIETRO = { userId: 'pietro', nombre: 'Pietro', avisoMin: 0 };
const CRISTEL = { userId: 'cristel', nombre: 'Cristel', avisoMin: 0 };

function entrada(over: Partial<EntradaAviso> = {}): EntradaAviso {
  return { inicioMs: a_las('12:00'), ahoraMs: AHORA, avisoServicioMin: 240, personas: [HANS], yo: 'hans', antes: null, ...over };
}

test('Hans se agenda a sí mismo a las 12:00: advierte y deja', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada()), { tipo: 'advertir', avisoMin: 240 });
});

test('Hans le agenda a Pietro a las 12:00: no deja', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [PIETRO] })), { tipo: 'bloquear', nombres: ['Pietro'], avisoMin: 240 });
});

test('fuera del aviso no pasa nada, con la misma persona que un minuto antes bloquea', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [PIETRO], inicioMs: AHORA + 240 * 60_000 })), { tipo: 'nada' });
  assert.equal(revisarAvisoDeLaCita(entrada({ personas: [PIETRO], inicioMs: AHORA + 239 * 60_000 })).tipo, 'bloquear');
});

test('manda el aviso más largo: el de la persona si pide más que el servicio', () => {
  const pietro = { ...PIETRO, avisoMin: 1440 };
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [pietro], inicioMs: a_las('16:00') })), { tipo: 'bloquear', nombres: ['Pietro'], avisoMin: 1440 });
  // Y el del servicio, si la persona pide menos.
  assert.equal(revisarAvisoDeLaCita(entrada({ personas: [{ ...PIETRO, avisoMin: 30 }] })).tipo, 'bloquear');
  assert.equal(revisarAvisoDeLaCita(entrada({ personas: [{ ...PIETRO, avisoMin: 30 }], avisoServicioMin: 0 })).tipo, 'nada');
});

test('todos juntos: se mira a cada uno, aunque quien agenda sea parte del equipo', () => {
  assert.deepEqual(
    revisarAvisoDeLaCita(entrada({ personas: [HANS, PIETRO, CRISTEL] })),
    { tipo: 'bloquear', nombres: ['Pietro', 'Cristel'], avisoMin: 240 },
  );
});

test('todos juntos: si solo choca el aviso propio de quien agenda, advierte y deja', () => {
  const r = revisarAvisoDeLaCita(entrada({ avisoServicioMin: 0, personas: [{ ...HANS, avisoMin: 1440 }, PIETRO] }));
  assert.deepEqual(r, { tipo: 'advertir', avisoMin: 1440 });
});

test('con avisos distintos solo se nombra a quien tiene el más largo', () => {
  const r = revisarAvisoDeLaCita(entrada({ personas: [{ ...PIETRO, avisoMin: 1440 }, CRISTEL], inicioMs: a_las('12:00') }));
  assert.deepEqual(r, { tipo: 'bloquear', nombres: ['Pietro'], avisoMin: 1440 });
  assert.equal(textoDelAviso(r), 'Esa hora está dentro del aviso mínimo de 1 día para Pietro. Elegí una hora más adelante.');
});

test('todos juntos: Pietro con 1 día bloquea aunque el servicio no tenga aviso', () => {
  const r = revisarAvisoDeLaCita(entrada({ avisoServicioMin: 0, personas: [HANS, { ...PIETRO, avisoMin: 1440 }] }));
  assert.deepEqual(r, { tipo: 'bloquear', nombres: ['Pietro'], avisoMin: 1440 });
});

test('una cita de un espacio no tiene a quién proteger: solo advierte', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [] })), { tipo: 'advertir', avisoMin: 240 });
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [], avisoServicioMin: 0 })), { tipo: 'nada' });
});

test('una cita sin servicio y sin nadie no revisa nada', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [], avisoServicioMin: 0 })), { tipo: 'nada' });
});

test('una cita sin servicio asignada a otra persona respeta el aviso de esa persona', () => {
  assert.equal(revisarAvisoDeLaCita(entrada({ avisoServicioMin: 0, personas: [{ ...PIETRO, avisoMin: 60 }] })).tipo, 'bloquear');
  assert.equal(revisarAvisoDeLaCita(entrada({ avisoServicioMin: 0, personas: [PIETRO] })).tipo, 'nada');
});

test('una hora que ya pasó no es «dentro del aviso»: anotar lo que ya ocurrió se puede', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [PIETRO], inicioMs: a_las('09:00') })), { tipo: 'nada' });
});

// ── Editar ───────────────────────────────────────────────────────────────────

const ANTES_PIETRO = { inicioMs: a_las('12:00'), userIds: ['pietro'] };

test('editar sin mover la hora ni sumar a nadie nunca bloquea: cambiar una nota', () => {
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [PIETRO], antes: ANTES_PIETRO })), { tipo: 'nada' });
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [HANS], antes: { inicioMs: a_las('12:00'), userIds: ['hans'] } })), { tipo: 'nada' });
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [], antes: { inicioMs: a_las('12:00'), userIds: [] } })), { tipo: 'nada' });
});

test('editar moviendo la hora dentro del aviso de otro bloquea', () => {
  assert.equal(revisarAvisoDeLaCita(entrada({ personas: [PIETRO], antes: ANTES_PIETRO, inicioMs: a_las('13:00') })).tipo, 'bloquear');
});

test('editar sumando a otra persona bloquea solo por la que se suma', () => {
  assert.deepEqual(
    revisarAvisoDeLaCita(entrada({ personas: [PIETRO, CRISTEL], antes: ANTES_PIETRO })),
    { tipo: 'bloquear', nombres: ['Cristel'], avisoMin: 240 },
  );
});

test('sacar a alguien de la cita, a la misma hora, nunca bloquea', () => {
  const antes = { inicioMs: a_las('12:00'), userIds: ['pietro', 'cristel'] };
  assert.deepEqual(revisarAvisoDeLaCita(entrada({ personas: [PIETRO], antes })), { tipo: 'nada' });
});

test('pasarle la cita a otra persona a la misma hora bloquea; tomarla uno mismo advierte', () => {
  assert.equal(revisarAvisoDeLaCita(entrada({ personas: [CRISTEL], antes: ANTES_PIETRO })).tipo, 'bloquear');
  assert.equal(revisarAvisoDeLaCita(entrada({ personas: [HANS], antes: ANTES_PIETRO })).tipo, 'advertir');
});

// ── De los recursos a las personas ──────────────────────────────────────────

const RECURSOS = [
  { id: 'r-hans', tipo: 'persona' as const, userId: 'hans', nombre: 'Hans', avisoMinimoMin: 60 },
  { id: 'r-pietro', tipo: 'persona' as const, userId: 'pietro', nombre: 'Pietro', avisoMinimoMin: 0 },
  { id: 'r-sala', tipo: 'espacio' as const, userId: null, nombre: 'Sala', avisoMinimoMin: 0 },
];

test('personasDeLaCita: junta recursos y encargado sin repetir, y un espacio no es persona', () => {
  assert.deepEqual(personasDeLaCita(RECURSOS, ['r-hans', 'r-sala'], 'hans'), [{ userId: 'hans', nombre: 'Hans', avisoMin: 60 }]);
  assert.deepEqual(personasDeLaCita(RECURSOS, ['r-sala'], null), []);
  assert.deepEqual(personasDeLaCita(RECURSOS, [], 'pietro'), [{ userId: 'pietro', nombre: 'Pietro', avisoMin: 0 }]);
  assert.deepEqual(personasDeLaCita(RECURSOS, ['r-pietro', 'r-hans'], null).map((p) => p.userId), ['pietro', 'hans']);
  // Alguien que no está en la agenda no tiene aviso propio que respetar.
  assert.deepEqual(personasDeLaCita(RECURSOS, [], 'otro'), []);
});

// ── Los textos ──────────────────────────────────────────────────────────────

test('los textos dicen el aviso y a quién le queda', () => {
  assert.equal(textoDelAviso({ tipo: 'nada' }), null);
  assert.equal(textoDelAviso({ tipo: 'advertir', avisoMin: 240 }), 'Esa hora está dentro del aviso mínimo de 4 horas. Igual se puede agendar.');
  assert.equal(
    textoDelAviso({ tipo: 'bloquear', nombres: ['Pietro'], avisoMin: 1440 }),
    'Esa hora está dentro del aviso mínimo de 1 día para Pietro. Elegí una hora más adelante.',
  );
  assert.equal(
    textoDelAviso({ tipo: 'bloquear', nombres: ['Pietro', 'Cristel'], avisoMin: 240 }),
    'Esa hora está dentro del aviso mínimo de 4 horas para Pietro y Cristel. Elegí una hora más adelante.',
  );
});
