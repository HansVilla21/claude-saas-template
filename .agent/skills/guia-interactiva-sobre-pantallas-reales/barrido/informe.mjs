import fs from "node:fs";
const [dir, rol] = process.argv.slice(2);
const rutas = JSON.parse(fs.readFileSync(`${dir}/rutas-${rol}.json`, "utf8"));
const res = new Map();
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(`resultado-${rol}-`))) for (const r of JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"))) res.set(r.ruta, r);
let faltan = 0, dup = 0, sinVer = 0, redir = 0;
for (const { ruta, anclas } of rutas) {
  const r = res.get(ruta);
  if (!r) { console.log("SIN RESULTADO", ruta); continue; }
  if (r.error) { console.log("ERROR", ruta, r.error); continue; }
  const hdr = `${ruta}${r.final !== ruta ? "  → " + r.final : ""} «${r.titulo}»`;
  const lineas = [];
  for (const { a, quien } of anclas) {
    const [n, v] = r.res[a] ?? [0, 0];
    const q = quien.slice(0, 2).join(", ") + (quien.length > 2 ? ` +${quien.length - 2}` : "");
    if (n === 0) { faltan++; lineas.push(`   FALTA  ${a}   ← ${q}`); }
    else if (v === 0) { sinVer++; lineas.push(`   OCULTA ${a} (${n})   ← ${q}`); }
    else if (v > 1) { dup++; lineas.push(`   x${v}     ${a}   ← ${q}`); }
  }
  if (r.final !== ruta) redir++;
  if (lineas.length || r.final !== ruta) { console.log(hdr); lineas.forEach((l) => console.log(l)); }
}
console.log(`\nresumen ${rol}: faltan ${faltan} · ocultas ${sinVer} · repetidas ${dup} · rutas redirigidas ${redir} · rutas ${rutas.length}`);
