// Paso 1 del barrido: de cada rol, qué pantallas visitar y qué anclas buscar en cada una.
//
// Se corre desde la RAÍZ del proyecto, con el mismo cargador de alias que usan las pruebas:
//   node --experimental-strip-types --no-warnings --import ./scripts/register-alias.mjs \
//     <esta-carpeta>/generar-rutas.mjs <carpeta-de-salida>
//
// Escribe `rutas-<rol>.json`: [{ ruta, anclas: [{ a, quien: ["recorrido/paso", ...] }] }].
// Una ruta con `:id` hay que reemplazarla por un id real de PRUEBA antes de visitarla.
//
// Se adapta en UN lugar: la ruta del catálogo (CATALOGO). Cada recorrido tiene `roles` y `pasos`;
// cada paso, `ruta`, `ancla`, `listo` y `vacio` (ver los tipos de la skill).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CATALOGO = "src/lib/guia/catalogo/index.ts";

const salida = process.argv[2];
if (!salida) throw new Error("Falta la carpeta de salida: generar-rutas.mjs <carpeta>");
fs.mkdirSync(salida, { recursive: true });

const { RECORRIDOS } = await import(pathToFileURL(path.join(process.cwd(), CATALOGO)).href);

/** rol -> ruta -> ancla -> quién la usa */
const porRol = new Map();
const poner = (rol, ruta, ancla, quien) => {
  if (!ancla) return;
  const rutas = porRol.get(rol) ?? new Map();
  const anclas = rutas.get(ruta) ?? new Map();
  const usos = anclas.get(ancla) ?? [];
  if (!usos.includes(quien)) usos.push(quien);
  anclas.set(ancla, usos);
  rutas.set(ruta, anclas);
  porRol.set(rol, rutas);
};

for (const r of RECORRIDOS) {
  for (const p of r.pasos) {
    const quien = `${r.id}/${p.id}`;
    const delPaso = [p.ancla, p.listo.tipo === "campo" ? p.listo.ancla : undefined, p.listo.tipo === "hecho" ? p.listo.enviaCon : undefined, p.vacio?.ancla];
    for (const rol of r.roles) for (const a of delPaso) poner(rol, p.ruta, a, quien);
  }
}

for (const [rol, rutas] of porRol) {
  const lista = [...rutas].map(([ruta, anclas]) => ({ ruta, anclas: [...anclas].map(([a, quien]) => ({ a, quien })) }));
  fs.writeFileSync(path.join(salida, `rutas-${rol}.json`), JSON.stringify(lista, null, 1));
  console.log(`${rol}: ${lista.length} pantallas, ${lista.reduce((n, x) => n + x.anclas.length, 0)} anclas`);
}
