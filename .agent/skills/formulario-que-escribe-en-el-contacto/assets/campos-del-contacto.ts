// A qué parte del contacto va cada respuesta del formulario de un servicio
// (0167, Hans 28-10). PURO: lo usan el editor de Servicios (qué ofrecer) y la
// server action (qué aceptar), así los dos dicen lo mismo.
//
// Hay dos lugares:
//   · lo fijo de la ficha: hoy solo el cumpleaños, desde una pregunta de fecha
//     (nombre, WhatsApp y correo ya los pide siempre el formulario);
//   · un campo propio del negocio (`extractor_field_defs`): los mismos que llena
//     el bot y se ven en Insights. Uno nuevo creado desde acá nace con
//     `bot_extrae = false`: el bot no lo busca en el chat (decisión C).
//
// Qué tipo de pregunta puede ir a qué tipo de campo lo decide `campoCompatible`.
// La base vuelve a convertir y saltea lo que no encaja (`reservas_valor_para_campo`).

import type { TipoPregunta } from '@/lib/reservas/datos';

export type TipoCampo = 'text' | 'number' | 'boolean' | 'date' | 'enum' | 'json';

/** Un campo propio del negocio, como lo ve el editor. */
export type CampoDelNegocio = {
  id: string;
  nombre: string;
  tipo: TipoCampo;
  /** Solo para `enum`. */
  opciones: string[];
  /** El analista del bot lo busca en el chat. */
  botExtrae: boolean;
};

/**
 * A dónde va la respuesta. `nuevo` solo existe en el editor: al guardar, la
 * server action crea el campo y lo convierte en `campo`.
 */
export type Destino =
  | { tipo: 'cumpleanos' }
  | { tipo: 'campo'; id: string; botExtrae?: boolean }
  | { tipo: 'nuevo'; nombre: string; botExtrae: boolean };

export const MAX_NOMBRE_CAMPO = 60;

/** Las opciones de un campo `enum`: la base guarda strings o `{ value, label }`. */
export function opcionesDeCampo(crudo: unknown): string[] {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .map((o) => (typeof o === 'string' ? o : o && typeof o === 'object' ? (o as { value?: unknown }).value : null))
    .filter((o): o is string => typeof o === 'string' && o.trim() !== '');
}

/** Qué tipos de campo aceptan las respuestas de un tipo de pregunta. */
export function tiposDeCampoPara(tipo: TipoPregunta): TipoCampo[] {
  switch (tipo) {
    case 'number': return ['number', 'text'];
    case 'date': return ['date', 'text'];
    case 'yes_no': return ['boolean', 'text'];
    case 'choice':
    case 'dropdown': return ['enum', 'text'];
    default: return ['text'];
  }
}

/**
 * Si una pregunta puede guardarse en ese campo. Un `enum` solo acepta una
 * pregunta cuyas opciones estén TODAS entre las del campo: si no, la respuesta
 * que no está se perdería sin que nadie se entere.
 */
export function campoCompatible(p: { tipo: TipoPregunta; opciones: readonly string[] }, c: Pick<CampoDelNegocio, 'tipo' | 'opciones'>): boolean {
  if (!tiposDeCampoPara(p.tipo).includes(c.tipo)) return false;
  if (c.tipo === 'enum') {
    const delCampo = new Set(c.opciones);
    return p.opciones.length > 0 && p.opciones.every((o) => delCampo.has(o));
  }
  return true;
}

/** El tipo del campo que se crea desde una pregunta. */
export function tipoDeCampoNuevo(tipo: TipoPregunta): TipoCampo {
  switch (tipo) {
    case 'number': return 'number';
    case 'date': return 'date';
    case 'yes_no': return 'boolean';
    case 'choice':
    case 'dropdown': return 'enum';
    default: return 'text';
  }
}

/** La clave interna de un campo nuevo: «Cantidad de sucursales» → «cantidad_de_sucursales». */
export function claveDeCampo(nombre: string, usadas: ReadonlySet<string>): string {
  const base = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '') || 'campo';
  if (!usadas.has(base)) return base;
  for (let i = 2; ; i++) {
    const c = `${base}_${i}`;
    if (!usadas.has(c)) return c;
  }
}

/** Lo que dice el editor del destino elegido, para una línea de resumen. */
export function nombreDelDestino(d: Destino | null, campos: readonly CampoDelNegocio[]): string | null {
  if (!d) return null;
  if (d.tipo === 'cumpleanos') return 'Cumpleaños';
  if (d.tipo === 'nuevo') return d.nombre.trim() || 'Campo nuevo';
  return campos.find((c) => c.id === d.id)?.nombre ?? null;
}
