// El manual como grafo. Cada artículo se conecta con:
//   · los que recomienda en «Mirá también» (`relacionados`);
//   · los que lo recomiendan a él. Esos no se anotan: se calculan al leer,
//     igual que los backlinks del cerebro de Nexus OS;
//   · los que se hacen en la misma pantalla, como conexión más suave.
// Medido el 2026-11-20: 242 de 275 artículos forman una sola red y la mediana
// es de 3 conexiones. Lo usan la respuesta de la Ayuda («Mirá también») y el
// asistente (MOM-116), para darle a Momo las vecinas de lo que encontró.
// Puro.

import type { ArticuloAyuda } from './tipos';

export interface VecinosAyuda {
  /** «Mirá también» en cualquiera de los dos sentidos, sin repetir. */
  enlazados: ArticuloAyuda[];
  /** Los de la misma pantalla principal que no están ya entre los enlazados. */
  mismaPantalla: ArticuloAyuda[];
  /** Cuántos hay en la misma pantalla en total (se muestran solo algunos). */
  totalMismaPantalla: number;
}

const ENTRANTES = new WeakMap<readonly ArticuloAyuda[], Map<string, string[]>>();

function entrantes(articulos: readonly ArticuloAyuda[]): Map<string, string[]> {
  const hecho = ENTRANTES.get(articulos);
  if (hecho) return hecho;
  const mapa = new Map<string, string[]>();
  for (const a of articulos) {
    for (const r of a.relacionados ?? []) {
      const lista = mapa.get(r) ?? [];
      if (!lista.includes(a.id)) lista.push(a.id);
      mapa.set(r, lista);
    }
  }
  ENTRANTES.set(articulos, mapa);
  return mapa;
}

export function vecinosDe(
  articulos: readonly ArticuloAyuda[],
  a: ArticuloAyuda,
  { maxEnlazados = 8, maxPantalla = 4 }: { maxEnlazados?: number; maxPantalla?: number } = {},
): VecinosAyuda {
  const porId = new Map(articulos.map((x) => [x.id, x] as const));
  const ids = [...(a.relacionados ?? []), ...(entrantes(articulos).get(a.id) ?? [])];
  const vistos = new Set<string>([a.id]);
  const enlazados: ArticuloAyuda[] = [];
  for (const id of ids) {
    const x = porId.get(id);
    if (!x || vistos.has(id)) continue;
    vistos.add(id);
    enlazados.push(x);
  }
  const ruta = a.pantallas[0]?.ruta;
  const misma =
    ruta == null ? [] : articulos.filter((x) => !vistos.has(x.id) && x.pantallas[0]?.ruta === ruta);
  return {
    enlazados: enlazados.slice(0, maxEnlazados),
    mismaPantalla: misma.slice(0, maxPantalla),
    totalMismaPantalla: misma.length,
  };
}
