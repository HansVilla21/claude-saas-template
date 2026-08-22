/**
 * Lectura y normalización de catálogos PDF exportados de Canva.
 *
 * Reusable tal cual: no tiene dependencias del proyecto ni credenciales.
 * Requiere `pdfjs-dist`. Extraído de un proyecto real (mueblería, julio 2026)
 * donde reconstruyó 4 catálogos → 230 productos y 504 variantes con precio.
 *
 * Los PDF salen de Canva, que exporta el texto con espaciado entre letras:
 * "C Ó D I G OC M - 2 0" en vez de "CÓDIGO CM-20", y "₡ 3 9 9 . 0 0 0" en vez
 * de "₡399.000". Todo lo de acá existe para deshacer eso de forma confiable.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const pdfjsDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjs = await import(
  pathToFileURL(path.join(pdfjsDir, "legacy/build/pdf.mjs")).href
);
const fontsUrl = pathToFileURL(path.join(pdfjsDir, "standard_fonts") + path.sep).href;

/** Extrae el texto del PDF, una entrada por página. */
export async function paginasDePdf(file) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    useSystemFonts: true,
    standardFontDataUrl: fontsUrl,
    verbosity: 0,
  }).promise;

  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { items } = await page.getTextContent();

    // Agrupar por fila visual con tolerancia. Redondear la Y a una rejilla fija
    // NO sirve: dos celdas de la misma fila pueden diferir 1pt y caer en cubos
    // distintos, y entonces se ordenan por Y en vez de por X. Eso llegó a
    // invertir precios (Queen/King de la CM-50 salían al revés).
    const TOL_FILA = 6;
    const orden = items
      .filter((it) => it.str?.trim())
      .map((it) => ({ y: it.transform[5], x: it.transform[4], s: it.str }))
      .sort((a, b) => b.y - a.y);

    const filas = [];
    for (const it of orden) {
      const fila = filas.find((f) => Math.abs(f.y - it.y) <= TOL_FILA);
      if (fila) fila.items.push(it);
      else filas.push({ y: it.y, items: [it] });
    }

    paginas.push(
      filas
        .map((f) =>
          f.items
            .sort((a, b) => a.x - b.x)
            .map((o) => o.s)
            .join("")
            .replace(/\s+/g, " ")
            .trim()
        )
        .filter(Boolean)
    );
    page.cleanup();
  }
  return paginas;
}

/**
 * Deshace el espaciado entre letras de Canva.
 * "C Ó D I G OC M - 2 0" → "CÓDIGOCM-20"   ·   "₡ 3 9 9 . 0 0 0" → "₡399.000"
 *
 * Regla: si una línea tiene más caracteres sueltos que palabras de verdad,
 * se le quitan TODOS los espacios simples entre caracteres individuales.
 */
export function desespaciar(linea) {
  const sueltos = (linea.match(/(?:^|\s)\S(?=\s|$)/g) || []).length;
  const tokens = linea.split(/\s+/).filter(Boolean).length;
  if (tokens > 2 && sueltos / tokens > 0.5) {
    return linea.replace(/(?<=\S)\s(?=\S)/g, (m, off, s) => {
      // Solo une si alguno de los dos lados es un carácter suelto.
      const izq = s.slice(0, off).split(/\s/).pop();
      const der = s.slice(off + 1).split(/\s/)[0];
      return izq.length <= 1 || der.length <= 1 ? "" : " ";
    });
  }
  return linea;
}

/** Montos en colones de una línea, en orden. "₡540.000₡609.000" → [540000, 609000] */
export function preciosDe(linea) {
  return [...linea.matchAll(/₡\s*([\d][\d.,\s]*)/g)]
    .map((m) => Number(m[1].replace(/[.,\s]/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 1000);
}

/**
 * Normaliza un código al formato de la base: LETRAS-NN (dos dígitos).
 * "JS-023" → "JS-23"  ·  "CM-20" → "CM-20"  ·  "001" → null (sin prefijo)
 */
export function normalizarCodigo(bruto) {
  if (!bruto) return null;
  const m = String(bruto).toUpperCase().replace(/\s/g, "").match(/([A-ZÁÉÍÓÚÑ]{2,4})-?(\d{1,3})/);
  if (!m) return null;
  return `${m[1]}-${String(Number(m[2])).padStart(2, "0")}`;
}

/** Quita acentos y baja a minúsculas, para comparar nombres. */
export function clave(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
