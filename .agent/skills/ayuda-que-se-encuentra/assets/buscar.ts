// Buscador del manual. Pensado para quien escribe como habla: ignora tildes y
// mayúsculas, saca las palabras que no dicen nada («cómo hago para»), entiende
// las palabras de la gente («bot», «wasap», «cliente»), los plurales y los
// verbos conjugados («mandar» encuentra «mando»), y perdona errores de tipeo
// («plantila», «etiketa»). Sin React ni base: se prueba con `node --test`.
//
// Cada palabra tiene que aparecer en el artículo (con esa tolerancia). Con tres
// palabras o más puede faltar una: la gente pregunta con palabras que el manual
// no usa. Si así no sale nada, devuelve lo más parecido y lo avisa.

import { normalizar, palabrasDe } from './normalizar';
import type { ArticuloAyuda, BloqueAyuda } from './tipos';

/** El texto de un bloque, plano. */
export function textoDeBloque(b: BloqueAyuda): string {
  switch (b.kind) {
    case 'parrafo':
    case 'nota':
      return b.texto;
    case 'pasos':
    case 'lista':
      return b.items.join(' ');
    case 'botones':
      return b.items.map((i) => `${i.nombre} ${i.hace}`).join(' ');
    case 'definiciones':
      return b.items.map((i) => `${i.termino} ${i.que}`).join(' ');
  }
}

/** Lo que se dice al preguntar y no dice nada del tema. «no» NO va: «el bot no contesta». */
const VACIAS = new Set(
  ('a al como cual cuales cuando de del donde el ella en es esta estan este esto hacer hago hay la las le les lo los ' +
    'me mi mis o para pero por puedo que quiero se si su sus te tengo un una unos unas y ya yo con mas tambien muy algo ' +
    'alguien quisiera necesito deberia hacerlo hace hacen saber sabe veo ver').split(' '),
);

/** Cómo lo dice la gente → cómo lo dice el manual. */
const SINONIMOS: Record<string, string[]> = {
  bot: ['chatbot', 'bot'],
  wasap: ['whatsapp'],
  wsp: ['whatsapp'],
  whats: ['whatsapp'],
  guasap: ['whatsapp'],
  wa: ['whatsapp'],
  cel: ['celular'],
  telefono: ['telefono', 'celular'],
  clave: ['contrasena', 'clave'],
  password: ['contrasena'],
  eliminar: ['eliminar', 'borrar', 'borro'],
  quitar: ['quitar', 'borrar', 'saco'],
  cliente: ['cliente', 'contacto'],
  clientes: ['clientes', 'contactos'],
  lead: ['contacto', 'lead'],
  leads: ['contactos', 'leads'],
  excel: ['excel', 'csv'],
  masivo: ['masivo', 'envio'],
  difusion: ['masivo', 'difusion'],
  cita: ['cita', 'agenda'],
  citas: ['citas', 'agenda'],
};

const SUFIJOS = ['aciones', 'acion', 'amente', 'mente', 'ando', 'iendo', 'ar', 'er', 'ir', 'as', 'es', 'os', 'a', 'e', 'o', 's'];

/** Raíz tosca: lo suficiente para que «mandar», «mando» y «plantillas» se encuentren. */
export function raiz(w: string): string {
  if (w.length <= 4) return w;
  for (const s of SUFIJOS) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  return w;
}

/** Distancia de edición con trasposición, cortada en `tope` (devuelve tope + 1 si se pasa). */
export function distancia(a: string, b: string, tope: number): number {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let ante: number[] | null = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (ante && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, ante[j - 2] + 1);
      cur[j] = v;
      if (v < minFila) minFila = v;
    }
    if (minFila > tope) return tope + 1;
    ante = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Las palabras que cuentan para buscar. Si todas son «vacías» («cómo»), se usan igual. */
export function palabrasDeBusqueda(consulta: string): string[] {
  const todas = palabrasDe(consulta);
  const utiles = todas.filter((p) => !VACIAS.has(p));
  return utiles.length > 0 ? utiles : todas;
}

/** ¿Esta palabra de un texto corresponde a alguna de la búsqueda? Para resaltar. */
export function coincidePalabra(palabraTexto: string, palabras: readonly string[]): boolean {
  const n = normalizar(palabraTexto).replace(/[^a-z0-9]/g, '');
  if (n.length < 3) return false;
  return palabras.some((p) => [p, raiz(p), ...(SINONIMOS[p] ?? [])].some((r) => r.length >= 3 && n.startsWith(r)));
}

// ── Índice: palabra del manual → dónde aparece (0 título, 1 palabras/pantalla/resumen, 2 cuerpo).
type Campo = 0 | 1 | 2;
const PESO: Record<Campo, number> = { 0: 6, 1: 3, 2: 1 };
const INDICES = new WeakMap<readonly ArticuloAyuda[], Map<string, [number, Campo][]>>();

function vocabulario(articulos: readonly ArticuloAyuda[]): Map<string, [number, Campo][]> {
  const hecho = INDICES.get(articulos);
  if (hecho) return hecho;
  const vocab = new Map<string, [number, Campo][]>();
  articulos.forEach((a, i) => {
    const campos: [Campo, string][] = [
      [0, a.titulo],
      [1, [...(a.palabras ?? []), ...a.pantallas.map((p) => p.nombre), a.resumen].join(' ')],
      [2, a.bloques.map(textoDeBloque).join(' ')],
    ];
    for (const [campo, texto] of campos) {
      for (const t of new Set(palabrasDe(texto))) {
        let lista = vocab.get(t);
        if (!lista) vocab.set(t, (lista = []));
        lista.push([i, campo]);
      }
    }
  });
  INDICES.set(articulos, vocab);
  return vocab;
}

/** Qué palabras del manual cuentan como `q`, y con qué calidad (0 a 1). */
function equivalentes(q: string, vocab: Map<string, unknown>): Map<string, number> {
  const alts = SINONIMOS[q] ?? [q];
  const r = raiz(q);
  const tope = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  const res = new Map<string, number>();
  for (const v of vocab.keys()) {
    let cal = 0;
    if (alts.includes(v)) cal = 1;
    else if (alts.some((x) => x.length >= 3 && v.startsWith(x))) cal = 0.9;
    else if (r.length >= 4 && (v.startsWith(r) || raiz(v) === r)) cal = 0.85;
    else if (tope > 0 && v.length >= 4) {
      const d = distancia(q, v, tope);
      if (d <= tope) cal = d === 1 ? 0.7 : 0.55;
      else if (q.length >= 5 && v.length > q.length && distancia(q, v.slice(0, q.length), 1) <= 1) cal = 0.6; // escribiendo, con un error
    }
    if (cal > 0) res.set(v, cal);
  }
  return res;
}

export interface ResultadoBusqueda {
  /** Las palabras que se buscaron, ya normalizadas (sirven para resaltar). */
  palabras: string[];
  resultados: ArticuloAyuda[];
  /** true = ninguno tenía las palabras necesarias; son los más parecidos. */
  parecidos: boolean;
}

export function buscar(articulos: readonly ArticuloAyuda[], consulta: string): ResultadoBusqueda {
  const palabras = palabrasDeBusqueda(consulta);
  if (palabras.length === 0) return { palabras, resultados: [], parecidos: false };
  const vocab = vocabulario(articulos);
  // Por palabra: artículo → la mejor calidad en cada campo.
  const porPalabra = palabras.map((q) => {
    const notas = new Map<number, [number, number, number]>();
    for (const [v, cal] of equivalentes(q, vocab)) {
      for (const [i, campo] of vocab.get(v) ?? []) {
        const fila = notas.get(i) ?? [0, 0, 0];
        if (cal > fila[campo]) fila[campo] = cal;
        notas.set(i, fila);
      }
    }
    return notas;
  });
  const frase = palabras.join(' ');
  const puntos: { i: number; total: number; cuantas: number }[] = [];
  articulos.forEach((a, i) => {
    let total = 0;
    let cuantas = 0;
    for (const notas of porPalabra) {
      const f = notas.get(i);
      if (!f) continue;
      total += f[0] * PESO[0] + f[1] * PESO[1] + f[2] * PESO[2];
      cuantas++;
    }
    if (cuantas === 0) return;
    if (normalizar(a.titulo).includes(frase)) total += 8;
    puntos.push({ i, total: total + cuantas * 20, cuantas });
  });
  const n = palabras.length;
  const necesarias = n >= 3 ? n - 1 : n;
  let lista = puntos.filter((p) => p.cuantas >= necesarias);
  let parecidos = false;
  if (lista.length === 0 && n > 1) {
    parecidos = true;
    lista = puntos.filter((p) => p.cuantas >= Math.ceil(n / 2));
  }
  lista.sort((x, y) => y.total - x.total || x.i - y.i);
  return { palabras, resultados: lista.map((p) => articulos[p.i]), parecidos };
}

/** Los que coinciden de verdad, el mejor primero. Sin «parecidos». Vacía → []. */
export function buscarArticulos(articulos: readonly ArticuloAyuda[], consulta: string): ArticuloAyuda[] {
  const r = buscar(articulos, consulta);
  return r.parecidos ? [] : r.resultados;
}
