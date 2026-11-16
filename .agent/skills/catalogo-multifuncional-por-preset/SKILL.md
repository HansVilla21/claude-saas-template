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

## Apéndice 2026-10-13 — Un rubro sin tope (productos)

Los dos modos de arriba tienen techo. `inline` mete la lista entera en el
prompt (tope 30) y `search` filtra en memoria lo que trae (techo 200). Una
tienda puede tener 20 productos o 5.000, y no se sabe de antemano. Para ese
rubro se agregó un tercer camino, que se elige con `tool_config.tool_slug`:
la **búsqueda vive en Postgres** y **el prompt no crece con el catálogo**.
Quedó en producción, con 5.000 productos de un solo negocio medidos en
~75-107 ms.

**En el prompt va el resumen, no la lista.** Tiene cuántos productos hay, las
25 categorías y las 20 marcas más numerosas, y "y N más" si se pasan. Con eso
el modelo sabe qué existe y elige dónde buscar ("algo para el frío" →
Chaquetas). Dos reglas:
- **Sin nada visible no hay bloque ni herramienta,** igual que en `inline`.
- **Un resumen que FALLA no es un resumen vacío.** Ante un error se ofrece la
  herramienta igual, con una línea que avisa. Si no, un corte de un segundo en
  la base hace que el bot conteste "no tenemos".

**La búsqueda es una RPC** (`buscar_productos`), SECURITY INVOKER y sin
`anon`. Se apoya en dos columnas generadas STORED, que sirven a todos los
rubros:
- **`search_doc`:** un tsvector `spanish` sobre texto pasado por `unaccent`,
  con pesos A título, B categoría/marca, C opciones/código y D descripción.
- **`search_text`:** lo mismo en minúsculas y sin tildes, para los trigramas y
  para el buscador del panel.
- **`unaccent` es STABLE** y una columna generada exige IMMUTABLE. La salida es
  un envoltorio `f_unaccent(text)` IMMUTABLE con el diccionario por nombre
  completo (`extensions.unaccent('extensions.unaccent'::regdictionary, $1)`).

**El orden de la búsqueda.** Gana el primer paso que encuentra algo, y cada
relajación se le informa al modelo:
1. **Código exacto.** Si no está, avisa `codigo`, y si no vino nada más para
   buscar, devuelve vacío. Antes caía al listado general y el modelo recibía 6
   productos al azar sin saber que el código no estaba.
2. **TODAS las palabras.**
3. **ALGUNA palabra** (aviso `parcial`): "camisa negra" sin negra trae la camisa.
4. **PARECIDO por trigramas,** `word_similarity` ≥ 0,35 (aviso `parecido`).
   "ipone" da 0,44 contra "iPhone" y el ruido entre palabras distintas ronda
   0,17. **Filtrá las palabras vacías** con `to_tsvector('spanish', w) <> ''`:
   "para" da 1,0 contra "Crema para manos" y le ganaba al iPhone de "ipone
   para regalo".
5. **La categoría o la marca solas** (aviso `texto`): "abrigo" en Chaquetas
   trae chaquetas, no algo de otra categoría.
6. **Después se relaja:** primero el precio (+20 %), después se suelta la
   categoría.
- **El parecido va al final a propósito.** Calcularlo para todas las filas en
  cada búsqueda la llevaba a 432 ms; como último recurso no cuesta nada.
- **El prompt dice qué hacer con cada aviso:** con `parcial`, `parecido` o
  `texto`, "no es exactamente lo que pidió, decilo y ofrecelo como lo más
  parecido"; con `codigo`, "no digas que lo tenés".

**Sin índice GIN, medido** (`probar-migracion-contra-base-viva-con-rollback`).
Toda búsqueda va acotada por negocio y módulo, que ya tienen su btree. Con
5.000 productos el GIN ganaba entre 1 y 20 ms y cada guardado lo pagaría.

**Una herramienta por módulo de búsqueda, enrutadas por nombre.** Un negocio
con propiedades y productos ofrece las dos. Un nombre desconocido no se
ejecuta. Si la RPC falla, la herramienta TIRA: el modelo sabe que no buscó, en
vez de leer "0 resultados" y decir que no hay.

**Lo que solo apareció con el motor real** (turnos sintéticos sin envío; ver
`probar-camino-produccion-sin-efectos-externos`). Ningún test lo vio:
- **"talla" estaba en las opciones de casi todo** y, con un solo nivel de
  palabras, rellenaba los 6 resultados con productos ajenos. Por eso existen
  los niveles.
- **El modelo armó un link de foto para un producto que no tenía.** Lo frenó
  el filtro de URLs permitidas, pero igual va al prompt: "si no trae foto, no
  mandes imagen ni armes un link".
- **Escribió los precios con coma** (₡65,000). El formato va en el prompt:
  "₡65.000".
- **Después de un código que no estaba, no buscó el siguiente** y contestó "no
  lo tengo", aunque existía. La regla prohibía afirmar que algo existe sin
  buscar, no que no lo hay. Ahora dice "cada producto o código nuevo es una
  búsqueda nueva, aunque lo anterior no haya aparecido", en el prompt **y** en
  la descripción de la herramienta. En dos conversaciones nuevas buscó cada vez.

**El estado es la única fuente de verdad.** Un stock en 0 o negativo agota el
producto al guardar: el bot solo ve `available` y no mira el stock en ningún
otro lado. La SQL igual lo excluye, por si entra por otra vía, con un helper
que usa **CASE y no AND**: el AND de SQL no garantiza el orden y castear un
texto que no es número revienta. Volver a "Disponible" un producto con 0 pide
cargar las unidades.

**El panel, para miles de ítems:**
- **Pagina en el servidor** de a 60 y busca con ILIKE sobre `search_text`,
  con `%`, `_` y `\` escapados.
- **Con un filtro activo, recargá después de cada cambio.** Un ítem que deja de
  calzar corre la paginación y "Cargar más" se saltea uno.
- **Si la carga falla,** `try/finally`: si no, el spinner queda para siempre.

**Las fotos de un turno anterior se confirman una por una:** "¿esta URL es foto
de un ítem visible de este negocio?". Antes se buscaban entre 500 ítems
cualquiera; en un catálogo grande casi nunca estaban y se descartaban.
- **Gotcha:** `.contains('media', [{ url }])` arma un arreglo de Postgres
  (`cs.{…}`) y sobre jsonb revienta con "invalid input syntax for type json".
  Va como texto: `.contains('media', JSON.stringify([{ url }]))`. Solo
  apareció al probar contra la base real.

**El preset entra apagado** (`is_active = false`) si el código viejo en
producción lo malinterpretaría. Acá, con un `mode: search`, habría usado la
herramienta de propiedades sobre productos. Se prende después del deploy.

**Al escribir SQL o prompts con Python en Windows,** `open(..., 'w')` escribe
CRLF. El prompt llegó a la base con 17 caracteres de más. Usá
`newline='\n'` y compará el md5 de la base, la migración y el seed.

---

## Apéndice 2026-11-14 — El inventario que sale del sistema de la tienda

Una distribuidora de insumos médicos mandó su inventario exportado del
sistema de caja: 2.577 filas con código, nombre, precio, IVA y cantidad. **No
traía categoría ni marca.** Se cargaron 2.465 productos sin precio y sin
existencias, porque el bot deja el pedido armado y una persona confirma precio
y existencia. Lo que sigue vale para cualquier exportación de un sistema de
tienda.

### Lo que trae y cómo leerlo

- **Marca, talla, color y medida van dentro del nombre,** y cada variante es
  una fila. El texto del módulo le dice al bot que sume la talla, el color o
  la marca a la búsqueda, y que nombre lo que salió.
- **Los nombres vienen en mayúsculas.** No se reescriben (son la fuente y el
  panel los muestra así); el texto del módulo le pide escribirlos como en un
  chat, sin agregar detalles que el nombre no traiga.
- **Códigos internos de 6 dígitos:** que no los diga salvo que se los pidan.
- **La ñ puede venir rota** (`Ã‘`). Se repara antes de cargar.
- **"Los 900 productos" del cliente no eran 900:** eran los que tenían
  existencia ese día (928). El archivo traía 2.577. Contá antes de prometer.

### Lo que NO se carga aunque venga

- **La cantidad.** Es una foto del día y un 0 esconde el producto de la
  búsqueda (ver "El estado es la única fuente de verdad"). Había 1.649 en
  cero, entre ellos casi todas las camas hospitalarias y las sillas que se
  venden a pedido. Se carga todo sin cantidad y la existencia la confirma una
  persona.
- **El precio, si el negocio decide no darlo.** Sin precio, `precio_max`
  deja la búsqueda en cero. El texto del módulo le prohíbe usarlo aunque la
  persona dé un presupuesto, y al medir se confirma en los argumentos de la
  herramienta (ver abajo). Los precios y cantidades del archivo quedan en un
  JSON local, por si después se cargan por código.
- **Filas que no son productos,** con la lista para que la revise el
  negocio:
  - pedidos a la medida con **el nombre de un cliente en el título** (12):
    es un dato personal que el bot podría nombrarle a otra persona;
  - servicios internos (descuento, transporte, reparación, consultas, filas
    vacías, `#NAME?`);
  - lo que el prompt dice que no es del rubro (acá, 87 medicamentos);
  - los dudosos ("(PACA)", "(VIEJAS)"), que se le preguntan al cliente.
- **Un clasificador por reglas se equivoca con lo que se parece:** "cortador
  de pastillas" caía como medicamento. Leé la lista de excluidos entera antes
  de cargar.

### Las categorías las ponés vos, y la búsqueda las lee

`search_doc` le da a la categoría el peso B, casi como al título. Eso las
vuelve parte de la búsqueda, para bien y para mal:

- **Sin categoría, "cama hospitalaria" encontraba 1 de las 25 camas,** porque
  el resto se llama "CAMA MANUAL 3 POSICIONES…".
- **Cada palabra del nombre de una categoría tiene que valer para TODOS sus
  productos.** Con "Pañales de adulto y bebé", "pañal de bebé" devolvía
  pañales de adulto, sin aviso de relajación: la palabra "bebé" la ponía la
  categoría. Con "Colchones antiescaras y hospitalarios", un colchón
  matrimonial salía como antiescaras. Se partieron (pañales de adulto / de
  bebé / sin decir, camas solo con camas, colchones sin adjetivos) y se
  volvió a medir: de 30 búsquedas reales a 22 de 22 bien.
- **Los sinónimos sí van, si son la misma cosa:** "Andaderas, andadores y
  rollators" hace que "andador" traiga las 22 andaderas.
- **Pero el resumen muestra 25 categorías.** Partir dejó 47, y las 22 que no
  entran al resumen son justo las chicas que se separaron (andaderas,
  glucómetros, tensiómetros, pañales de bebé). Medido: el modelo pasó
  `categoria: "Equipo médico y mobiliario"` para un tensiómetro de muñeca.
  La búsqueda corre sus niveles DENTRO de esa categoría antes de soltarla,
  así que con una categoría visible pero equivocada el nivel "alguna palabra"
  puede devolver productos de otra cosa: el mismo cruce de arriba, por otra
  puerta.
- **El arreglo es nuestro y va en el texto del módulo:** `categoria` solo
  cuando la persona pide ver una categoría entera ("qué sillas de ruedas
  manejan"). Para un producto, solo texto, que ya encuentra la categoría por
  el peso B. Medido con el prompt real: antes pasaba categoría en 9 de 11
  búsquedas; después, en 12 de 76, casi siempre una que sí calzaba ("Sillas
  de ruedas", "Fajas y corsés"). La otra salida es quedarse en 25 categorías
  o subir el tope del resumen en el código, que cambia el prompt de todos los
  negocios.

### Prenderlo cambia lo que ve el cliente

Prender el módulo desde Master materializa los campos del extractor del
preset (acá, "Producto buscado" y "Presupuesto máximo" en la ficha del
contacto) y muestra la sección Catálogo en el menú del negocio. Avisale al
cliente antes de que lo encuentre solo.

### Cargar sin pisar nada

- **Un script que solo agrega los códigos que faltan.** El índice único de
  `external_code` es parcial y PostgREST no puede hacer upsert contra él.
  Leé los códigos cargados paginando (tope de 1.000) y verificando contra
  `count`, insertá en tandas de 200 con `.select('id')` y contá lo que volvió.
- **Guardas antes de escribir:** el proyecto de la URL, el negocio por id y
  slug, y el módulo por id y slug.
- **Desde que el módulo está prendido, el negocio edita su catálogo en el
  panel.** Una recarga con otra exportación no pisa nombres ni borra lo que ya
  no venden: eso se decide con el cliente.

### Medir con el prompt real, mirando qué buscó

La respuesta del bot no dice qué buscó. `bot_turns.metadata.herramientas`
trae cada `Product_Search_Tool` con sus argumentos (`texto`, `categoria`,
`marca`, `precio_max`) y el detalle de la relajación ("3 de 3 productos, se
relajó categoria, marca"). Ahí se ve si usó `precio_max`, si eligió una
categoría que no está en el resumen y si buscó cada producto nuevo que nombró
la persona. En esta carga, 87 búsquedas en 78 turnos simulados (US$0,02 por
respuesta con Sonnet 5): **0 con `precio_max`**, aunque un caso pedía "que no
pase de 100 mil", y ninguna afirmación de existencia ni precio.

Lo que el bot hizo bien y conviene pedirle a cualquier texto de módulo así:
- "Omron" no estaba: dijo que esa marca no aparece y ofreció los dos de
  muñeca que sí, sin "no tenemos".
- "Talla G" no existe en el nombre: ofreció las tallas que vienen (S a XL) y
  preguntó el peso, que el nombre del producto sí trae.
- Medicamentos, que no son del rubro: lo dijo en una línea, no pasó, y buscó
  el termómetro que pidió después.
