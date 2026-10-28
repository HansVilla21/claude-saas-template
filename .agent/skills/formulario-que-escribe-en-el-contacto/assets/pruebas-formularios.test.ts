// Los formularios por servicio (0167): cada tipo de pregunta se valida igual en
// el navegador y en el servidor, y cada respuesta sale con el texto que se
// muestra en la cita y el dato con su tipo que va al contacto.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarPreguntas, type PreguntaUI, type TipoPregunta } from '@/lib/reservas/datos';
import {
  campoCompatible,
  claveDeCampo,
  opcionesDeCampo,
  tipoDeCampoNuevo,
  type CampoDelNegocio,
} from '@/lib/reservas/campos-del-contacto';
import { fechaDe, numeroDe, validarInvitado, validarRespuesta, type DatosInvitado } from '@/lib/reservas/pagina/formulario';

const ID = '11111111-1111-4111-8111-111111111111';

function pregunta(tipo: TipoPregunta, extra: Partial<PreguntaUI> = {}): PreguntaUI {
  return { id: ID, texto: 'Pregunta', tipo, opciones: [], obligatoria: false, destino: null, ...extra };
}

function campo(tipo: CampoDelNegocio['tipo'], opciones: string[] = []): CampoDelNegocio {
  return { id: '22222222-2222-4222-8222-222222222222', nombre: 'Campo', tipo, opciones, botExtrae: false };
}

const ok = (r: ReturnType<typeof validarRespuesta>) => {
  assert.equal(r.ok, true);
  assert.ok(r.ok && !r.vacia, 'no tenía que venir vacía');
  return r as Extract<typeof r, { vacia: false }>;
};
const falla = (r: ReturnType<typeof validarRespuesta>) => assert.equal(r.ok, false);

test('número: acepta coma o punto decimal y rechaza texto y miles', () => {
  assert.equal(numeroDe('3'), 3);
  assert.equal(numeroDe(' 1,5 '), 1.5);
  assert.equal(numeroDe('-2.25'), -2.25);
  assert.equal(numeroDe('1.500.000'), null);
  assert.equal(numeroDe('tres'), null);
  assert.equal(numeroDe('1e20'), null);
  const r = ok(validarRespuesta(pregunta('number'), '12', '506'));
  assert.equal(r.valor, 12);
  falla(validarRespuesta(pregunta('number'), 'muchas', '506'));
});

test('fecha: los tres campos arman un día real; uno imposible o a medias no', () => {
  assert.equal(fechaDe('1990-3-15'), '1990-03-15');
  assert.equal(fechaDe('2001-2-30'), null);
  assert.equal(fechaDe('1899-1-1'), null);
  assert.equal(fechaDe('1990--15'), null);
  const r = ok(validarRespuesta(pregunta('date'), '1990-3-15', '506'));
  assert.equal(r.valor, '1990-03-15');
  assert.equal(r.respuesta, '15 de marzo de 1990');
  falla(validarRespuesta(pregunta('date'), '1990-3-', '506'));
  // Sin tocar ningún campo es una respuesta vacía, no un error.
  assert.deepEqual(validarRespuesta(pregunta('date'), '--', '506'), { ok: true, vacia: true });
});

test('sí o no: guarda un booleano y muestra Sí / No', () => {
  assert.equal(ok(validarRespuesta(pregunta('yes_no'), 'si', '506')).valor, true);
  const no = ok(validarRespuesta(pregunta('yes_no'), 'no', '506'));
  assert.equal(no.valor, false);
  assert.equal(no.respuesta, 'No');
  falla(validarRespuesta(pregunta('yes_no'), 'tal vez', '506'));
});

test('opciones: una tiene que estar en la lista; varias salen en el orden de la pregunta, sin repetidas', () => {
  const opciones = ['WhatsApp', 'Instagram', 'Web'];
  assert.equal(ok(validarRespuesta(pregunta('choice', { opciones }), 'Web', '506')).valor, 'Web');
  assert.equal(ok(validarRespuesta(pregunta('dropdown', { opciones }), 'Instagram', '506')).valor, 'Instagram');
  falla(validarRespuesta(pregunta('dropdown', { opciones }), 'TikTok', '506'));
  const varias = ok(validarRespuesta(pregunta('multi_choice', { opciones }), ['Web', 'WhatsApp', 'Web'], '506'));
  assert.deepEqual(varias.valor, ['WhatsApp', 'Web']);
  assert.equal(varias.respuesta, 'WhatsApp, Web');
  falla(validarRespuesta(pregunta('multi_choice', { opciones }), ['Web', 'Fax'], '506'));
  // Lo que llega del navegador puede no ser una lista: cuenta como vacía.
  assert.deepEqual(validarRespuesta(pregunta('multi_choice', { opciones }), 'Web', '506'), { ok: true, vacia: true });
});

test('correo y teléfono: con su forma; el teléfono sin + toma el país del WhatsApp', () => {
  assert.equal(ok(validarRespuesta(pregunta('email'), ' Laura@Ejemplo.com ', '506')).valor, 'laura@ejemplo.com');
  falla(validarRespuesta(pregunta('email'), 'laura@', '506'));
  assert.equal(ok(validarRespuesta(pregunta('phone'), '8888 1234', '506')).valor, '+50688881234');
  assert.equal(ok(validarRespuesta(pregunta('phone'), '+1 305 555 0101', '506')).valor, '+13055550101');
  falla(validarRespuesta(pregunta('phone'), '123', '506'));
});

test('validarInvitado: obligatoria vacía da error; cada respuesta lleva su pregunta_id y su valor', () => {
  const preguntas = [
    pregunta('number', { id: 'a1', texto: 'Sucursales', obligatoria: true }),
    pregunta('multi_choice', { id: 'a2', texto: 'Canales', opciones: ['WhatsApp', 'Web'] }),
    pregunta('short_text', { id: 'a3', texto: 'Comentario' }),
  ];
  const base: DatosInvitado = { nombre: 'Laura', prefijo: '506', numero: '88881234', correo: 'laura@ejemplo.com', respuestas: {} };
  const sin = validarInvitado(base, preguntas);
  assert.equal(sin.ok, false);
  assert.ok(!sin.ok && sin.errores['pregunta:a1']);

  const con = validarInvitado({ ...base, respuestas: { a1: '3', a2: ['Web'], a3: '' } }, preguntas);
  assert.ok(con.ok);
  assert.deepEqual(con.valor.respuestas, [
    { pregunta: 'Sucursales', tipo: 'number', respuesta: '3', pregunta_id: 'a1', valor: 3 },
    { pregunta: 'Canales', tipo: 'multi_choice', respuesta: 'Web', pregunta_id: 'a2', valor: ['Web'] },
  ]);
});

test('a qué campo puede ir cada tipo', () => {
  assert.equal(campoCompatible(pregunta('number'), campo('number')), true);
  assert.equal(campoCompatible(pregunta('number'), campo('text')), true);
  assert.equal(campoCompatible(pregunta('short_text'), campo('number')), false);
  assert.equal(campoCompatible(pregunta('yes_no'), campo('boolean')), true);
  assert.equal(campoCompatible(pregunta('multi_choice', { opciones: ['a', 'b'] }), campo('enum', ['a', 'b'])), false);
  // Un enum solo si TODAS las opciones de la pregunta están en el campo.
  assert.equal(campoCompatible(pregunta('dropdown', { opciones: ['casa', 'lote'] }), campo('enum', ['lote', 'casa', 'ambos'])), true);
  assert.equal(campoCompatible(pregunta('dropdown', { opciones: ['casa', 'finca'] }), campo('enum', ['lote', 'casa'])), false);
  assert.equal(tipoDeCampoNuevo('dropdown'), 'enum');
  assert.equal(tipoDeCampoNuevo('email'), 'text');
  assert.deepEqual(opcionesDeCampo(['a', { value: 'b', label: 'B' }, '', 3]), ['a', 'b']);
});

test('la clave de un campo nuevo no choca con las del negocio', () => {
  assert.equal(claveDeCampo('Cantidad de sucursales', new Set()), 'cantidad_de_sucursales');
  assert.equal(claveDeCampo('Empresa', new Set(['empresa'])), 'empresa_2');
  assert.equal(claveDeCampo('¿Año?', new Set()), 'ano');
  assert.equal(claveDeCampo('¡¡!!', new Set()), 'campo');
});

test('validarPreguntas: el destino tiene que tener sentido', () => {
  const v = (p: Partial<PreguntaUI>) => validarPreguntas([{ ...pregunta('short_text', { texto: 'Algo' }), ...p }]);
  assert.equal(v({ tipo: 'date', destino: { tipo: 'cumpleanos' } }).ok, true);
  assert.equal(v({ destino: { tipo: 'cumpleanos' } }).ok, false);
  assert.equal(v({ destino: { tipo: 'nuevo', nombre: '  ', botExtrae: false } }).ok, false);
  assert.equal(v({ destino: { tipo: 'campo', id: 'no-es-un-id' } }).ok, false);
  const nuevo = v({ destino: { tipo: 'nuevo', nombre: '  Empresa ', botExtrae: false } });
  assert.ok(nuevo.ok);
  assert.deepEqual(nuevo.valor[0].destino, { tipo: 'nuevo', nombre: 'Empresa', botExtrae: false });
  // Varias opciones necesita al menos dos.
  assert.equal(v({ tipo: 'multi_choice', opciones: ['uno'] }).ok, false);
  assert.equal(v({ tipo: 'multi_choice', opciones: ['uno', 'dos'] }).ok, true);
});
