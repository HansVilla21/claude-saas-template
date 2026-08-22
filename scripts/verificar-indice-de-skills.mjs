#!/usr/bin/env node
/**
 * Verifica que los índices de skills no mientan.
 *
 *   node scripts/verificar-indice-de-skills.mjs             # solo reporta
 *   node scripts/verificar-indice-de-skills.mjs --arreglar  # corrige la tabla de familias
 *
 * Fuente de verdad: las **carpetas** de `.agent/skills/`. Todo lo demás
 * (los contadores de `CLAUDE.md`, `README.md` y `.agent/skills/README.md`, y la
 * tabla de familias) se compara contra eso.
 *
 * `--arreglar` toca **solo** la columna "Cuántas" de la tabla de familias y agrega
 * la fila de una sección que falte. Lo demás lo reporta y no lo toca: un contador
 * mal en `CLAUDE.md` casi siempre significa que alguien no terminó de agregar sus
 * skills, y taparlo con el número correcto esconde el trabajo a medias.
 *
 * POR QUÉ EXISTE: el 2026-08-22 corrieron cuatro cosechas en paralelo sobre este
 * repo. Cada PR sumaba skills y actualizaba unos contadores sí y otros no. La
 * tabla de familias del README quedó sumando 98 con 118 skills reales — decía la
 * verdad de tres semanas antes. Un índice desfasado es peor que ninguno: te hace
 * creer que ya buscaste.
 *
 * Sale con código 1 si algo no cuadra, así que sirve en un hook o en CI.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...xs) => join(ROOT, ...xs);
const ARREGLAR = process.argv.includes("--arreglar");

/** Skills de referencia por si hay que crear la fila de una sección nueva. */
const DESTACADAS = {
  "🖼️ SaaS con motor de IA generativa":
    "`causa-raiz-mala-calidad-ia-esta-en-el-input`, `motor-de-recetas-de-prompts-para-imagen`, `probar-motor-ia-fuera-de-la-app`",
};

let problemas = 0;
const mal = (msg) => { problemas++; console.error("✗ " + msg); };
const bien = (msg) => console.log("✓ " + msg);

// ---------- 1. las skills reales ----------
const reales = readdirSync(p(".agent/skills"))
  .filter((n) => {
    const d = p(".agent/skills", n);
    return statSync(d).isDirectory() && existsSync(join(d, "SKILL.md"));
  })
  .sort();
const TOTAL = reales.length;
console.log(`\n${TOTAL} skills de proceso en .agent/skills/\n`);

// ---------- 2. el índice temático: sección -> skills ----------
const secciones = [];
{
  let actual = null;
  for (const l of readFileSync(p(".agent/skills/README.md"), "utf8").split("\n")) {
    if (l.startsWith("## ")) {
      const t = l.slice(3).trim();
      actual = t === "Historial por tier" ? null : { titulo: t, skills: [] };
      if (actual) secciones.push(actual);
      continue;
    }
    if (!actual || !l.startsWith("|")) continue;
    if (/^\|\s*Skill\s*\|/.test(l) || /^\|\s*-+/.test(l)) continue;
    const celda = l.split("|")[1] ?? "";
    for (const m of celda.matchAll(/`([a-z0-9][a-z0-9-]+)`/g)) actual.skills.push(m[1]);
  }
}

const nombradas = new Map(); // skill -> [secciones]
for (const s of secciones) for (const k of s.skills) {
  if (!nombradas.has(k)) nombradas.set(k, []);
  nombradas.get(k).push(s.titulo);
}

const setReales = new Set(reales);
const huerfanas = reales.filter((k) => !nombradas.has(k));
const fantasmas = [...nombradas.keys()].filter((k) => !setReales.has(k));

if (huerfanas.length) mal(`${huerfanas.length} skill(s) sin lugar en el índice temático:\n    ` + huerfanas.join("\n    "));
else bien("el índice temático nombra todas las skills");

if (fantasmas.length) mal(`${fantasmas.length} nombre(s) en el índice que ya no existen:\n    ` + fantasmas.join("\n    "));
else bien("el índice temático no nombra skills inexistentes");

// cada skill cuenta en su PRIMERA sección (las repeticiones son referencias cruzadas)
const asignada = new Set();
const porSeccion = new Map();
for (const s of secciones) {
  let n = 0;
  for (const k of s.skills) {
    if (!setReales.has(k) || asignada.has(k)) continue;
    asignada.add(k); n++;
  }
  porSeccion.set(s.titulo, n);
}

// ---------- 3. los contadores sueltos ----------
const contadores = [
  ["CLAUDE.md", /(\d+) skills de proceso reusables:/],
  [".agent/skills/README.md", /\*\*(\d+) skills\.\*\*/],
];
for (const [archivo, re] of contadores) {
  const m = readFileSync(p(archivo), "utf8").match(re);
  if (!m) mal(`no encontré el contador en ${archivo}`);
  else if (+m[1] !== TOTAL) mal(`${archivo} dice ${m[1]} skills; hay ${TOTAL}`);
  else bien(`${archivo} dice ${TOTAL}`);
}

const readme = readFileSync(p("README.md"), "utf8");
const contadoresReadme = [...readme.matchAll(/(\d+) skills de proceso/g)].map((m) => +m[1]);
const desalineados = contadoresReadme.filter((n) => n !== TOTAL);
if (!contadoresReadme.length) mal("README.md no menciona el total de skills de proceso");
else if (desalineados.length) mal(`README.md tiene ${desalineados.length} contador(es) en ${[...new Set(desalineados)].join("/")}; hay ${TOTAL}`);
else bien(`README.md: ${contadoresReadme.length} contador(es), todos en ${TOTAL}`);

// ---------- 4. la tabla de familias ----------
// Mapea el nombre corto de la tabla del README al título de la sección del índice.
const ALIAS = {
  "Método y verificación": "🔬 Método de trabajo y verificación",
  "Sitio, catálogo y CMS para PYME": "🌐 Sitio público, catálogo y CMS para cliente PYME",
  "Ejecución y modo de trabajo del founder": "🎯 Ejecución y modo de trabajo del founder",
};
const sinEmoji = (t) => t.replace(/^\P{L}+/u, "").trim();
const seccionDe = (familia) => {
  if (ALIAS[familia]) return ALIAS[familia];
  const hit = secciones.find((s) => sinEmoji(s.titulo) === familia);
  return hit?.titulo;
};

const RE_FILA = /^\| ([^|\n]+?) \| (\d+) \| ([^\n]*?) \|$/gm;
const filas = [...readme.matchAll(RE_FILA)];
if (!filas.length) mal("no encontré la tabla de familias en README.md");
else {
  let texto = readme;
  let arreglos = 0;
  let suma = 0;
  const cubiertas = new Set();

  for (const [linea, familiaRaw, n, resto] of filas) {
    const familia = familiaRaw.trim();
    const sec = seccionDe(familia);
    if (!sec) { suma += +n; mal(`la familia "${familia}" del README no existe como sección del índice`); continue; }
    cubiertas.add(sec);
    const real = porSeccion.get(sec) ?? 0;
    suma += real;
    if (+n === real) continue;
    if (ARREGLAR) { texto = texto.replace(linea, `| ${familiaRaw} | ${real} | ${resto} |`); arreglos++; }
    else mal(`familia "${familia}": el README dice ${n}, el índice tiene ${real}`);
  }

  // secciones sin fila
  const faltantes = secciones.filter((s) => !cubiertas.has(s.titulo) && (porSeccion.get(s.titulo) ?? 0) > 0);
  for (const s of faltantes) {
    const n = porSeccion.get(s.titulo);
    const nombre = sinEmoji(s.titulo);
    if (!ARREGLAR) { mal(`la sección "${s.titulo}" (${n} skills) no tiene fila en la tabla de familias`); suma += n; continue; }
    const destacadas = DESTACADAS[s.titulo] ?? s.skills.slice(0, 2).map((k) => "`" + k + "`").join(", ");
    const nueva = `| ${nombre} | ${n} | ${destacadas} |`;
    const ultima = [...texto.matchAll(RE_FILA)].at(-1)?.[0];
    if (!ultima) { mal("no pude ubicar dónde insertar la fila nueva"); continue; }
    texto = texto.replace(ultima, ultima + "\n" + nueva);
    arreglos++; suma += n;
  }

  if (ARREGLAR && arreglos) {
    writeFileSync(p("README.md"), texto, "utf8");
    bien(`tabla de familias: ${arreglos} fila(s) corregida(s) o agregada(s)`);
  }
  if (suma !== TOTAL) mal(`la tabla de familias suma ${suma}; hay ${TOTAL} skills`);
  else bien(`la tabla de familias suma ${TOTAL}`);
}

// ---------- salida ----------
if (problemas) {
  console.error(`\n${problemas} problema(s). Los conteos por familia salen de .agent/skills/README.md:`);
  for (const [t, n] of porSeccion) if (n) console.error(`  ${String(n).padStart(3)}  ${t}`);
  process.exit(1);
}
console.log("\nTodo cuadra.\n");
