# Skill: Catálogo multifuncional por preset

Armar una sección donde cada negocio carga **lo que vende** — propiedades,
servicios, productos físicos, lo que sea — con UNA sola base de datos que se
**adapta a cualquier rubro por configuración**, y que el **bot consume** para
mostrarle al lead lo que calza con lo que busca.

## Cuándo usar esta skill

- Un cliente necesita que el bot muestre/recomiende lo que el negocio vende
  (propiedades por zona/precio, servicios de un oficio, productos de una tienda).
- Querés que el mismo motor sirva para **varios rubros** sin reprogramar por cada uno.
- Ya existe (o vas a montar) un sistema de módulos por agencia y un bot que puede
  llamar tools o recibir contexto inyectado.

## Regla madre (por qué esto funciona sin volverse papilla)

**Base compartida + preset por vertical (enfoque híbrido).** NI un solo campo
JSONB genérico para todo (UI y bot mediocres, no se afinan por rubro), NI una
tabla/módulo separado por rubro (reconstruís CRUD+RLS+fotos+realtime N veces). En
vez de eso: **una tabla base** con lo que TODO lo vendible comparte + un campo
`attributes` jsonb para lo específico, y el "sabor" de cada rubro (ficha de
atributos, formulario, qué extrae el bot, cómo busca, cómo habla) vive como
**preset en el sistema de módulos**. Plomería una vez; rubro nuevo = preset nuevo,
muchas veces **sin tocar código**.

## Proceso

1. **Tabla base `catalog_items`.** Columnas fijas compartidas: `agency_id`,
   `module_id` (a qué preset pertenece), `title`, `description`, `price_amount` +
   `price_currency` + `price_unit` (`once|month|session|hour|...`), `status` enum
   (`available|reserved|sold|paused` — solo `available` se muestra al lead),
   `external_code` (opcional, unique por agencia), `media` jsonb `[{path,url}]`,
   `attributes` jsonb (lo del rubro), `is_published`, `created_by/updated_by`,
   `deleted_at` (soft delete). Índices: `(agency_id, module_id, status)` + GIN en
   `attributes`. RLS: **todos los miembros leen, owner/admin escriben** (calcá el
   patrón uniforme del proyecto; el bot lee vía service_role que bypassa RLS).

2. **El schema de atributos vive en el PRESET, no en la tabla.** El `attributes`
   jsonb NO es libre: cada `module_definition` (preset) define en su `config_schema`
   la ficha `[{key,label,type: text|number|enum|bool, options?, filterable?,
   required?}]`. La UI, la validación y los filtros del bot se derivan de ahí.

3. **Un preset carga 4 cosas de una** (reusá el sistema de módulos existente):
   ficha de atributos (`config_schema`) · campos que extrae el bot del lead
   (`extractor_schema`) · comportamiento del bot (`prompt_fragment` + `tool_config`)
   · UI (`ui_slots.list_badges`). Al **enable** en una agencia, materializá los
   `extractor_field_defs` desde el `extractor_schema` del preset.

4. **Dos modos de bot por preset** (bandera `tool_config.mode`):
   - `search` (rubro grande, cientos de items → inmobiliaria): el bot usa una
     **tool** que decide invocar; edge function con **fallback multi-pass** (exacto
     → relaja precio → tipo → zona, reporta qué relajó), cap ~5.
   - `inline` (rubro chico, 5–15 items → servicios): NO busca; se le **inyecta la
     lista completa** en el prompt en cada turno (endpoint `list_all` → todos los
     disponibles, cap ~30 → nodo que formatea → se concatena al system prompt).

5. **Edge function de búsqueda** (`catalog-search`): un solo endpoint para los dos
   modos, auth por secret, **degradación total (nunca 5xx)**. `agency_id` lo pone
   el flow, NUNCA el LLM. Filtros de texto (operacion/tipo/zona) en la query;
   numéricos del jsonb (dormitorios) **en memoria** (ver Gotcha).

6. **UI del CRM** con **formulario dinámico**: sección fija (título/precio/estado/
   fotos) + "Detalles del rubro" **dibujado desde `config_schema.attributes`** (un
   input por tipo). Cero forms por rubro. Fotos a un bucket de Storage por agencia
   (path `<agency_id>/...`, lectura pública para que el BSP las baje). Escritura vía
   **server action con gate de rol** (nunca update client-side: falla silencioso).
   Si la agencia tiene >1 preset, al crear preguntá cuál (selector, no `window.*`).

7. **Go-live del bot** (n8n u otro): nodo Tool HTTP (search) o nodo Get-list +
   inyección (inline) + el `prompt_fragment` del preset en el prompt del cliente.
   Documentá los pasos porque tocan un workflow vivo.

8. **Verificá contra la fuente de verdad.** Probá la migración con BEGIN/ROLLBACK
   antes de aplicar; la lógica de búsqueda con datos reales (exacto / por código /
   fallback / inline); y el **camino de lectura para un rol NO-master** (ver Gotcha
   del join). "Compila" ≠ "funciona".

## Gotchas (los que ya nos costaron)

- **jsonb `attributes->>campo` es TEXTO.** Comparar numéricos ahí es lexicográfico
  (`"10" < "2"`). Filtrá números (dormitorios, etc.) **en memoria** tras traer, o
  casteá; el precio va en su **columna numérica** (`price_amount`), no en jsonb.
- **El camino de lectura tiene que servir al owner REAL, no solo a master.** La
  página lee `agency_modules` join `module_definitions` con el cliente del usuario
  (RLS aplica). Verificá que ambas policies dejen leer al miembro: los presets van
  con `scope='global'` (legibles por cualquier autenticado) y `agency_modules` con
  `is_member_of`. Si no, el owner ve 0 presets y el módulo "no existe" para él.
- **`agency_id` nunca lo rellena el LLM.** Lo provee el flow. Si el modelo lo
  inventa, una agencia consulta el catálogo de otra.
- **Confirmá el schema real ANTES de escribir data ops:** nombre exacto de los
  enums (`extractor_field_type`, `scope`), el unique de `extractor_field_defs`
  (`(agency_id, field_key)`), etc. No asumas de memoria.
- **Fotos = bucket público por agencia.** El BSP baja la imagen para mandarla al
  lead; si el bucket es privado, la foto no llega. Path scopeado por `agency_id`
  en la policy de `storage.objects`.
- **Un ítem `paused`/`sold`/borrado NO se muestra al lead.** El filtro del bot es
  `status='available' AND is_published AND deleted_at IS NULL` — no `direction` ni
  otra cosa.
- **0 resultados no es error.** El bot ofrece tomar datos del lead, nunca dice "no
  tengo nada" a secas ni la función responde 5xx.

## Output esperado

- Migración: tabla `catalog_items` (+ RLS owner/admin write) · bucket de Storage
  por agencia.
- 1+ presets en `module_definitions` (scope global) con `config_schema` +
  `extractor_schema` + `tool_config.mode` + `prompt_fragment` + `ui_slots`.
- Edge function de búsqueda (search multi-pass + inline `list_all`), secret auth.
- Sección "Catálogo" en el CRM: lista + form dinámico + fotos + gate de rol.
- Doc de go-live n8n (search + inline).
- Verificación: migración con rollback, lógica de búsqueda contra datos reales,
  camino de lectura para rol no-master, tsc/eslint/build limpios.

## Ejemplo

**Input:**
"Quiero una sección donde el cliente cargue lo que vende (propiedades, y también
servicios) y que el bot le muestre al lead lo que calza."

**Output:**
Tabla base `catalog_items` + preset `catalog-inmobiliaria` (mode `search`: atributos
operacion/tipo/zona/dormitorios, tool con fallback) y `catalog-servicios` (mode
`inline`: atributos categoria/duracion/modalidad, lista inyectada). La misma UI
dibuja el form según el rubro; el owner carga una propiedad con fotos y el bot, sin
que nadie lo toque, responde "casa en Escazú hasta $250K" con opciones reales +
foto; un negocio de servicios enciende su preset y el bot sugiere el servicio que
calza desde la lista. Verificado contra la base (exacto→CR-2031, inline→4 servicios).

## Skills relacionadas

`n8n-properties-search-tool-pattern` (la tool HTTP + `$fromAI` que consume esto) ·
`supabase-edge-function-secret-auth` (auth por secret) ·
`fuente-unica-derivar-de-hijos` (una sola fuente de verdad por dato) ·
`habilitar-rls-tabla-expuesta` (prender RLS sin romper el backend) ·
`probar-migracion-contra-base-viva-con-rollback` · `rls-write-bloqueada-por-policy-desalineada`
(writes user-bound que fallan silencioso) · `whatsapp-image-delivery-ycloud` (formato de la foto al lead).
