# Skill: Datos reales vs. seed de demo (cuando el prototipo se vuelve producto)

## Cuándo usar esta skill

- Un proyecto que arrancó con **datos sembrados de demo** empieza a recibir **datos reales** (integración conectada, cliente cargando info, usuarios usándolo).
- El cliente dice *"estos números no cuadran"* o *"esto no tiene sentido"* mirando la UI.
- Vas a conectar la primera integración real a un CRM/dashboard que hasta ahora era una maqueta.
- Existe un `db:seed` (o script equivalente) escrito cuando la base era desechable.

## Por qué existe esta skill

Un producto construido desde un prototipo tiene **datos falsos escondidos en tres capas**, y las tres mienten con total naturalidad hasta que el cliente las descubre:

1. **Tablas de agregados sembradas** (`funnel_counts`, `linkedin_daily`, `channel_stats`) — la UI lee de ahí en vez de derivar de la fuente real.
2. **Filas KV de settings** (`settings.machine_today`) — contadores "de hoy" que nunca fueron de hoy.
3. **Fallbacks hardcodeados en el código** (`?? 47`) — los más traicioneros: sobreviven a limpiar la base.

**Costo real (CRM de Josué Miranda, 2026-07):** el cliente abrió el dashboard y vio *118 leads* cuando la base tenía *38*. Su reacción textual: *"no tiene sentido las cosas que estás haciendo, y eso es grave porque la calidad con la que estás trabajando está siendo pésima"*. El mismo error reapareció **dos veces más** (`linkedin_daily`, y un sidebar que decía "Máquina activa · 47 contactos hoy" en todas las pantallas).

**La lección: no alcanza con dejar de leer el dato falso. Hay que borrarlo.** Mientras exista, es una mina.

---

## Proceso

### 1. Regla madre: derivar de la fuente, nunca del agregado sembrado

| ❌ Nunca | ✅ Siempre |
|---|---|
| `select * from funnel_counts` | `select stage_id, count(*) from leads group by 1` |
| `select * from linkedin_daily` | derivar de `integration_events` (el registro real) |
| `settings.machine_today.contactados` | contar eventos de hoy |

**Regla:** si un número se puede derivar de la fuente, se deriva. Una tabla de agregados solo se justifica por performance medida, y entonces se llena desde la fuente (job/trigger), nunca a mano.

### 2. Cazar los tres tipos de mentira

```bash
# 1. Tablas de agregados: ¿quién las lee?
grep -rn "funnel_counts\|channel_stats\|linkedin_daily\|trend_daily" --include=*.ts --include=*.tsx .

# 2. Settings KV con números
grep -rn "machine_today\|kpi_" --include=*.ts --include=*.tsx .

# 3. ⚠️ Fallbacks hardcodeados — los que sobreviven a limpiar la base
grep -rnE "\?\?\s*[0-9]{2,}|=\s*[0-9]{2,}\s*\}" --include=*.tsx --include=*.ts .
```

El tercero es el importante. Ejemplo real que sobrevivió a dos limpiezas:

```tsx
// app/(app)/layout.tsx  — el sidebar mostraba "47 contactos hoy" SIEMPRE
const contactsToday = (machineRow?.value as { contactados?: number })?.contactados ?? 47;
//                                                                                   ^^ acá
// components/shell/Sidebar.tsx
export function Sidebar({ contactsToday = 47 }) { //                                 ^^ y acá
```

Borrar la fila de settings no arreglaba nada: el `?? 47` seguía mintiendo. **Buscá los defaults, no solo las queries.**

### 3. Placeholder honesto, nunca número inventado

Cuando algo todavía no está conectado, la UI lo dice. No inventa.

```tsx
// ❌ Miente
<span>{contactsToday}</span>          // 47 salido de la nada
<span>Máquina activa</span>           // no hay máquina

// ✅ Honesto
<span>{connected ? eventsToday : "—"}</span>
<span>{connected ? "Máquina activa" : "Máquina sin eventos"}</span>
<p>El análisis IA se genera cuando conectemos el asistente · aún sin datos para este lead</p>
```

Regla de oro: **"—" y una frase que explique por qué, siempre le gana a un número lindo y falso.** El cliente perdona un vacío; no perdona que le mientan.

### 4. Cuando llega el dato real: BORRAR el seed, no ignorarlo

Dejar la tabla sembrada "dormida" es dejar una mina armada. Cualquiera (incluido vos en 3 meses) la vuelve a cablear.

```sql
-- 0006_drop_seeded_demo.sql
-- linkedin_daily y settings.machine_today quedaron sembrados con números de demo
-- (47/38/12/5). El motor real deriva TODO de integration_events, así que nadie los lee.
-- Se ELIMINAN en vez de dejarlos dormidos: cualquier cableado futuro volvería a
-- mostrar números que no cuadran — el error que ya se cometió con el dashboard.
drop table if exists public.linkedin_daily;
delete from public.settings where key = 'machine_today';
```

Y limpiar todo lo que apunte: el script de seed, los tipos, los comentarios.

**Checklist de borrado:**
- [ ] Migración que elimina tabla/filas.
- [ ] `db-seed.mjs`: quitar el insert y la referencia en el `truncate` (si no, el seed explota).
- [ ] `types.ts`: eliminar el tipo.
- [ ] `grep` final: 0 referencias en código (solo comentarios explicando el borrado).
- [ ] Verificar post-migración que **los datos reales siguen intactos**.

### 5. ⛔ Blindar el script de seed (esto borra el trabajo del cliente)

Un `db:seed` escrito para una base desechable hace `truncate ... cascade`. **El día que llega el primer dato real, ese script se convierte en una bomba** — y vive a un tab de distancia de `db:migrate`, que sí se corre seguido.

```js
/**
 * Guarda de seguridad: si la base tiene datos que NO vinieron de este seed,
 * aborta. Se salta con `--force-destroy`, que hay que escribir a mano.
 */
async function guardRealData() {
  const force = process.argv.includes("--force-destroy");

  // Señales de datos reales. Cada una es suficiente para abortar.
  const checks = [
    ["eventos de la integración", `select count(*)::int n from integration_events`],
    ["leads con perfil real", `select count(*)::int n from leads where qualification->>'linkedin_url' is not null`],
  ];

  const found = [];
  for (const [label, sql] of checks) {
    try {
      const { rows } = await q(sql);
      if (rows[0].n > 0) found.push(`${rows[0].n} ${label}`);
    } catch {
      // La tabla no existe (base nueva) → nada real que proteger.
    }
  }
  if (found.length === 0) return;
  if (force) { console.warn("⚠️  --force-destroy: borrando datos reales."); return; }

  console.error("\n⛔ SEED ABORTADO — la base tiene datos reales:\n");
  for (const f of found) console.error(`   · ${f}`);
  console.error(`
   Este script hace TRUNCATE de leads y actividades: sería irreversible.
   · ¿Cambios de schema?   →  npm run db:migrate  (seguro)
   · ¿Inspeccionar?        →  npm run db:inspect  (lectura)
   · ¿De verdad borrar?    →  node scripts/db-seed.mjs --force-destroy
`);
  await db.end();
  process.exit(1);
}
await guardRealData(); // antes de abrir la transacción
```

Claves del diseño:
- **Detectar datos reales por su origen**, no por cantidad (un solo lead real ya importa).
- **Fallar cerrado**: exit 1, antes de la transacción.
- **El mensaje redirige** a lo que el usuario probablemente quería (`db:migrate`).
- **Escape explícito y feo** (`--force-destroy`), imposible de tipear por accidente.
- **Documentarlo** en el README/DEPLOY con el ⛔ bien visible.

### 6. Verificar contra la base, no contra la pantalla

Antes de decirle al cliente que algo cuadra, probalo con una query:

```sql
-- Los números de la UI deben salir de acá, y deben coincidir
select count(*) from leads;                                    -- total
select stage_id, count(*) from leads group by 1 order by 2 desc; -- embudo
select source_id, count(*) from leads group by 1;               -- canales
```

Si la suma de las fuentes no da el total, o el embudo no suma los leads: **hay una mentira**. Buscala antes de que la encuentre el cliente.

---

## Gotchas

| Gotcha | Por qué duele |
|---|---|
| **Borrar la fila pero dejar el `?? 47`** | El número falso sobrevive a la limpieza de la base. Buscá los defaults. |
| **Dejar la tabla sembrada "dormida"** | Alguien la vuelve a cablear. Borrala. |
| **Limpiar la tabla y no el `db-seed`** | El seed explota al insertar en una tabla que ya no existe. |
| **Seed sin guard** | Un `pnpm db:seed` distraído borra meses de datos del cliente. |
| **"El dashboard ya deriva de datos reales"** | Verificalo con una query. Suele quedar un widget suelto (a mí me quedó el sidebar). |
| **Placeholder que parece dato** | Un "0" y un "—" comunican cosas distintas: uno dice "no pasó", el otro "no lo sé". |

## Output esperado

- Cero tablas/filas de demo en la base (migración de borrado aplicada y verificada).
- Cero fallbacks numéricos hardcodeados (`grep` limpio).
- Toda la UI derivando de la fuente real, o mostrando un placeholder honesto.
- `db:seed` blindado y documentado como destructivo.
- Datos reales verificados intactos después de todo.

## Ejemplo

**Input:** el cliente reporta *"el dashboard dice 118 leads pero yo tengo 38"*.

**Output:**
1. `grep` → `lib/db/dashboard.ts` lee `funnel_counts` (sembrada con 118).
2. Se reescribe para derivar de `leads`/`appointments`/`stages`.
3. Migración que borra `funnel_counts` para que nadie la recablee.
4. `grep` de fallbacks → aparece un `?? 47` en el sidebar que nadie había visto.
5. Se blinda `db:seed`, que habría borrado los 696 leads reales.
6. Verificación por query: el embudo suma 38, las fuentes suman 38, el cierre es 3 de 38.

## Relacionado

- [[prototipo-ui-a-datos-reales]] — conectar un prototipo mock a datos reales sin reescribir la UI.
- [[prospai-webhook-crm]] — la integración que destapó estos tres casos.
- [[debugging-silent-errors]] — cuando el dato falso no da error, solo miente.
