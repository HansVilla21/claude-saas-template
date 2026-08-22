# Skill: Migraciones por Postgres directo, con guard del proyecto (cuando el MCP apunta a otra base)

## Cuándo usar esta skill

- Trabajás varios proyectos Supabase desde la misma máquina y **el MCP está apuntado a otro** de ellos.
- Una migración con `security definer`, `create policy` o funciones te devuelve **403 desde la Management API** aunque el token sea válido.
- Querés un aplicador de migraciones **reproducible** que no dependa de pegar SQL en un dashboard.

**Regla madre:** aplicar una migración a la base equivocada es de los pocos errores **irreversibles** de una sesión. El guard no es paranoia, es el requisito.

## Por qué existe esta skill

FreshAdFlow, 2026-07-06. Dos hallazgos que se pagan caro por separado:

1. **La Management API de Supabase (`POST /v1/projects/{ref}/database/query`) devuelve 403** en migraciones que usan `security definer` o `create policy`, aunque el mismo token funcione perfecto para un `SELECT` o un DDL simple. Es un filtro de seguridad del endpoint, no un problema de permisos del token. **No hay flag que lo destrabe:** hay que ir por Postgres directo.

2. **El MCP de Supabase de la máquina apuntaba al CRM** (`fahujscodhqlopycorzn`), no a FreshAdFlow (`lhfbtnklprkejkpmnjfr`). Un `apply_migration` distraído por el MCP habría corrido el SQL **contra la base de otro cliente en producción**. Por eso el proyecto elevó a **regla inviolable en su `CLAUDE.md`**: *Supabase siempre por `.env`; el MCP no se toca por ninguna razón.*

## Proceso

### 1. Declarar la regla donde se lee al empezar cada sesión

En el `CLAUDE.md` del proyecto, no en un comentario perdido:

```md
## Regla de Supabase (inviolable — leer al iniciar CADA sesión)
- Proyecto correcto: ref `lhfbtnklprkejkpmnjfr`.
- DB -> pg directo con `SUPABASE_STRING`. Auth-config -> Management API con `SUPABASE_ACCESS_TOKEN`.
- El MCP de Supabase NO se toca: apunta a OTRO proyecto. Usarlo acá corrompería la base equivocada.
```

### 2. Un aplicador con guard del ref, versionado en el repo

`scripts/apply-migration.mjs` — el guard va **antes** de conectar, y el SQL entero va en una transacción:

```js
const REF = "lhfbtnklprkejkpmnjfr"; // el ÚNICO proyecto permitido

const conn = leerDelEnv("SUPABASE_STRING");
if (!conn.includes(REF)) {
  console.error(`ABORTADO: la connection string no apunta a ${REF}.`);
  process.exit(1);                       // <- el guard
}

const client = new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin");
  await client.query(sql);               // el archivo .sql completo
  await client.query("commit");
  console.log("Migración aplicada y commiteada.");
} catch (e) {
  await client.query("rollback");
  console.error("Falló — rollback hecho:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
```

Uso: `node scripts/apply-migration.mjs supabase/migrations/0009_creatives_prompt.sql`

Detalles que importan:
- **Leer el `.env` a mano** (no un loader mágico) para que sea obvio de dónde sale la credencial.
- `ssl: { rejectUnauthorized: false }` es necesario contra el pooler de Supabase.
- **`begin`/`commit` explícito**: una migración a medio aplicar es peor que una que no corrió.
- El script vive en el repo y se usa **siempre**. Un aplicador ad-hoc por sesión es cómo se aplica SQL a la base equivocada.

### 3. Numerar y no reescribir

`0001_init.sql`, `0002_abuse_guard.sql`, … Aditivas siempre que se pueda: agregar columna es barato, cambiar el tipo de una en producción no. En FreshAdFlow quedó una columna (`jobs.reference_paths`) de una feature descartada — inofensiva, se dejó.

### 4. Verificar contra la fuente de verdad

Después de aplicar, consultá la fila / la columna / la policy directamente. "Corrió sin error" no es "quedó aplicada" — ver [[verificar-funcionamiento-end-to-end]].

## Gotchas

- **`ALTER TYPE ... ADD VALUE` dentro de una transacción** funciona en PG15 **solo si el valor nuevo no se usa en la misma transacción**. Si la misma migración inserta con el valor nuevo, partila en dos.
- **Migración que cambia el contrato de una función que prod ya llama = desplegar en la misma ventana.** Pasó real: `ensure_profile` pasó de 2 a 3 argumentos con default. El código viejo en producción siguió funcionando sin error… pero **el free grant dejó de otorgarse** (el default era `false`) hasta que se desplegó el código nuevo. Un gap benigno pero invisible: sin error, sin log, solo usuarios sin sus créditos.
- **Evitá triggers en `auth.users`.** Un trigger ahí rompe el signup con el opaco *"Database error saving new user"*. En su lugar, una función idempotente (`ensure_profile`) que la app llama con `service_role` en el primer login. Ver [[auth-supabase-google-nativo]].
- **La Management API sí sirve** para lo que no es SQL: config de auth, plantillas de email, tiempos de OTP. Usala ahí, con el mismo guard del ref.
- **Dos proyectos abiertos en la misma máquina** es el escenario de riesgo. Si el MCP puede escribir en el otro, el guard tiene que estar en el script, no en tu memoria.

## Ejemplo (input -> output)

- **Input:** "aplicá la migración 0011 (teléfono en profiles + reason del ledger)".
- **Output:** `node scripts/apply-migration.mjs supabase/migrations/0011_contact.sql` -> guard verifica el ref -> begin/commit -> verificación de la columna en la base. Diecisiete migraciones aplicadas así, cero incidentes de base cruzada.

## Relacionadas

[[verificar-funcionamiento-end-to-end]] · [[probar-migracion-contra-base-viva-con-rollback]] · [[auth-supabase-google-nativo]] · [[habilitar-rls-tabla-expuesta]] · [[deploy-seguro-vercel-preview-prod]]
