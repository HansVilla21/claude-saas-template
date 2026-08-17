# Skill: Postgres prepared statements en n8n (patrón JSON deconstruction)

## Cuándo usar esta skill

- Estás escribiendo queries SQL en nodos Postgres de n8n con `executeQuery`.
- Tu query tiene 5+ parámetros, algunos posiblemente vacíos / null.
- Recibís el error `"there is no parameter $N"` aunque parezca que pasaste N valores.
- Querés escribir queries robustas que no se rompan con caracteres especiales (apóstrofes, comas) ni con valores null.

## El problema

El campo `options.queryReplacement` de los nodos Postgres en n8n es un **string separado por comas**:

```
={{ expr1 }}, ={{ expr2 }}, ={{ expr3 }}
```

n8n splittea ese string por comas. Cada parte se evalúa como expression y se pasa como `$1`, `$2`, `$3` al SQL.

**Problemas:**

1. **Valores vacíos consecutivos colapsan**: si `expr2` y `expr3` ambos evalúan a string vacío, el parser puede pasar solo 1 o 2 parámetros en vez de 3.
2. **Comas dentro de valores rompen**: si un expression evalúa a `"O'Brien, Liliana"` (con coma adentro), el parser splittea el string en el lugar incorrecto.
3. **Comillas escapadas confunden**: `={{ "literal string" }}` con comillas dobles escapadas a veces se cuenta mal.

Resultado: Postgres recibe menos parámetros de los esperados y tira:

```
ERROR: there is no parameter $N
```

## La solución: JSON deconstruction

En vez de pasar N parámetros separados, pasar **UN solo parámetro JSON** y deconstruirlo en SQL con el operador `->>`.

### Antes (frágil):

```sql
INSERT INTO public.leads (manychat_id, display_name, ig_id, whatsapp_phone, ...)
VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), ...)
```

```
queryReplacement:
={{ $('A').first().json.manychat_id }}, ={{ $('A').first().json.display_name }}, ={{ $('A').first().json.ig_id }}, ={{ $('A').first().json.whatsapp_phone }}
```

Si `ig_id` y `whatsapp_phone` vienen vacíos → "no parameter $4".

### Después (robusto):

```sql
WITH data AS (SELECT $1::jsonb AS d)
INSERT INTO public.leads (manychat_id, display_name, ig_user_id, whatsapp_phone, ...)
SELECT
  d->>'manychat_id',
  NULLIF(d->>'display_name', ''),
  NULLIF(d->>'ig_id', ''),
  NULLIF(d->>'whatsapp_phone', ''),
  ...
FROM data
```

```
queryReplacement:
={{ JSON.stringify({
  manychat_id: $('A').first().json.manychat_id ?? '',
  display_name: $('A').first().json.display_name ?? '',
  ig_id: $('A').first().json.ig_id ?? '',
  whatsapp_phone: $('A').first().json.whatsapp_phone ?? ''
}) }}
```

**UN solo parámetro.** Las comas están adentro del JSON, no separan params. n8n nunca se confunde.

## Beneficios concretos

1. **Inmune a valores vacíos**: el JSON puede tener `{ "ig_id": "" }` o `{ "ig_id": null }` sin colapsar.
2. **Inmune a caracteres especiales**: JSON escapa automáticamente apóstrofes, comillas, backslashes, etc.
3. **Más legible**: el SQL deja claro qué campo es qué (`d->>'manychat_id'` vs `$1`).
4. **Fácil de agregar campos**: solo agregás una key más al JSON y un `d->>'new_field'` en el SELECT — no hay que reordenar `$N`.

## Patrón completo: ejemplo Crear Lead

### Query SQL
```sql
WITH data AS (SELECT $1::jsonb AS d)
INSERT INTO public.leads
  (agency_id, manychat_id, manychat_page_id, display_name, full_name,
   whatsapp_phone, phone, ig_user_id, ig_username, live_chat_url, source, status)
SELECT
  'b740e7a3-94f5-42ab-b485-ffb4963dea62'::uuid,
  d->>'manychat_id',
  NULLIF(d->>'manychat_page_id', ''),
  NULLIF(d->>'display_name', ''),
  NULLIF(TRIM(COALESCE(d->>'first_name', '') || ' ' || COALESCE(d->>'last_name', '')), ''),
  NULLIF(d->>'whatsapp_phone', ''),
  NULLIF(d->>'whatsapp_phone', ''),
  NULLIF(d->>'ig_id', ''),
  NULLIF(d->>'ig_username', ''),
  NULLIF(d->>'live_chat_url', ''),
  (d->>'channel')::lead_source,
  'nuevo'::lead_status
FROM data
ON CONFLICT (agency_id, manychat_id) WHERE manychat_id IS NOT NULL
DO UPDATE SET
   last_contact_at = NOW(),
   display_name    = COALESCE(EXCLUDED.display_name, leads.display_name),
   ...
RETURNING id;
```

### queryReplacement
```javascript
={{ JSON.stringify({
  manychat_id: $('Edit Fields2').first().json.manychat_id ?? '',
  manychat_page_id: $('Edit Fields2').first().json.manychat_page_id ?? '',
  display_name: $('Edit Fields2').first().json.display_name ?? '',
  first_name: $('Edit Fields2').first().json.first_name ?? '',
  last_name: $('Edit Fields2').first().json.last_name ?? '',
  whatsapp_phone: $('Edit Fields2').first().json.whatsapp_phone ?? '',
  ig_id: $('Edit Fields2').first().json.ig_id ?? '',
  ig_username: $('Edit Fields2').first().json.ig_username ?? '',
  live_chat_url: $('Edit Fields2').first().json.live_chat_url ?? '',
  channel: $('Edit Fields2').first().json.channel ?? 'whatsapp'
}) }}
```

## Cuándo usar prepared statements clásicos (no JSON)

Si la query tiene **pocos parámetros** (1-3) y **ninguno es nullable**, los prepared statements clásicos están bien:

```sql
SELECT id, manychat_id, display_name
FROM public.leads
WHERE agency_id = $1::uuid AND manychat_id = $2
LIMIT 1;
```

```
queryReplacement: ={{ $('Resolve Agency').first().json.agency_id }}, ={{ $('ID y Mensaje').first().json.ID }}
```

Esto funciona porque `agency_id` y `ID` siempre tienen valor.

**Regla práctica:** si tu queryReplacement tiene 5+ valores **o** algún valor puede venir null/vacío, usá JSON deconstruction.

## ON CONFLICT con índice parcial

Caso especial: si la tabla tiene un UNIQUE parcial (con WHERE clause), el `ON CONFLICT` también necesita esa WHERE clause:

```sql
-- Tabla con índice parcial
CREATE UNIQUE INDEX uq_messages_external_id
  ON messages (agency_id, channel, external_id)
  WHERE external_id IS NOT NULL;

-- Query INSERT con ON CONFLICT debe incluir la WHERE
ON CONFLICT (agency_id, channel, external_id)
  WHERE external_id IS NOT NULL   -- ← ESTO
  DO NOTHING
```

Sin la WHERE → `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`.

## Convención de agency_id

Si trabajás single-tenant (1 agency por proyecto Supabase), hardcodeá el UUID en el SQL como literal:

```sql
INSERT INTO public.leads (agency_id, ...)
SELECT 'b740e7a3-94f5-42ab-b485-ffb4963dea62'::uuid, ...
```

No lo pases por queryReplacement. Razón: si lo pasás con `={{ "uuid" }}` (string literal con comillas), el parser de n8n puede contarlo mal.

Si trabajás multi-tenant, hacé un nodo previo `Resolve Agency` que devuelva el agency_id, y referenciá `={{ $('Resolve Agency').first().json.agency_id }}` (sin comillas literales, viene de un expression real).

## Tests que recomiendo correr antes de subir el SQL

Antes de pegar una query Postgres en un nodo de n8n, **probala en Supabase SQL Editor** con datos reales hardcoded:

```sql
-- Test rápido con datos del founder
WITH data AS (
  SELECT '{
    "manychat_id": "1515862162",
    "display_name": "Hans",
    "ig_id": null,
    "whatsapp_phone": "+50688217229"
  }'::jsonb AS d
)
SELECT
  d->>'manychat_id',
  NULLIF(d->>'display_name', ''),
  NULLIF(d->>'ig_id', ''),  -- debe devolver NULL
  NULLIF(d->>'whatsapp_phone', '')
FROM data;
```

Si el SQL funciona ahí con datos reales (incluyendo nulls), va a funcionar en n8n.

## Referencias

- Doc oficial n8n Postgres node: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/
- Errores comunes: `chatbot-manychat-supabase-multicanal/docs/03-errores-comunes-y-fixes.md` (E02, E03)
