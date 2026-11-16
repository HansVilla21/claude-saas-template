# Skill: Formulario de reserva que escribe en el contacto (y el destino lo decide la base)

## Cuándo usar esta skill

- Hay una página pública para agendar (tipo Calendly) y el negocio quiere **hacer preguntas por servicio** («¿cuántas sucursales tenés?», «¿cómo nos conociste?», cumpleaños) cuyas respuestas **queden en el contacto del CRM**, no solo pegadas a la cita.
- Alguien pide «campos personalizados» y el proyecto **ya tiene** algún sistema de campos por negocio (los que llena el bot, los que se ven en la ficha).
- Una escritura la pueden hacer **dos autores** (la persona desde un formulario, el bot desde el chat) sobre el mismo dato, y hay que saber de dónde vino cada valor.
- Vas a guardar una **fecha de calendario** (cumpleaños) que viaja por un formulario público.

**Por qué existe.** Se construyó en el CRM de Momentum el 2026-10-28 (PR #465 del CRM, migración 0167). El pedido sonaba a una pantalla de formularios. Lo difícil eran cuatro cosas que ninguna prueba feliz muestra: cuál de dos sistemas de campos usar, quién decide a dónde va cada respuesta, quién firma el origen del dato cuando lo escriben dos autores, y qué pasa con una fecha en Costa Rica (UTC-6).

> El código real está en `assets/`. La fuente viva: `crm-v2/src/lib/reservas/`, `src/components/reservas/pregunta-editor.tsx` y `src/components/reservar/pregunta-publica.tsx`.

---

## Qué se construyó

Formularios por servicio con estos tipos: texto corto, párrafo, una opción (botones), lista desplegable, varias opciones, número, correo, teléfono, fecha (día, mes y año) y sí o no. Cada pregunta es obligatoria o no. Cada una puede guardarse en:

- **un campo fijo de la ficha** (hoy solo el cumpleaños, y solo desde una pregunta de fecha), o
- **un campo propio del negocio**, uno existente o uno nuevo creado desde el editor, o
- **ninguno** (queda solo en la cita).

---

## Proceso

### 1. Antes de diseñar: buscar si ya existen campos propios por negocio

El plan inicial era una tabla nueva de campos personalizados. Antes de crearla se buscó, y había **dos** sistemas:

| Sistema | Estado |
|---|---|
| `custom_field_defs` | Heredado, **vacío**, sin una sola pantalla que lo use |
| `extractor_field_defs` | El que vive: lo llena el analista del bot, se ve en la ficha, **2.085 valores** |

Se usó el que vive. Un tercero habría dejado tres verdades sobre «qué sabemos de este contacto». Para encontrarlos: `grep` del nombre de las tablas en `src/`, y en la base el conteo de filas de cada candidata (`select count(*) from …`). Una tabla con 0 filas y 0 lecturas en el código es un resto.

### 2. El destino lo decide la base, nunca el navegador

Esta es la regla que sostiene todo lo demás.

1. **La página pública no recibe el destino.** El servidor lo borra de la pregunta antes de mandarla. El navegador no puede ni leerlo.
2. **El navegador manda solo respuestas por id de pregunta.** El servidor las valida con la regla de cada tipo y arma `answers`: `{ pregunta, tipo, respuesta, pregunta_id, valor }`. `respuesta` es el texto que se muestra en la cita; `valor` es el dato con su tipo (número, booleano, lista).
3. **Un trigger `AFTER INSERT` en la cita** lee cada pregunta **por id, dentro del negocio y del servicio de la cita** (`bq.id = v_id and bq.agency_id = new.agency_id and bq.booking_type_id = new.booking_type_id`) y de ahí saca a dónde escribir. Una respuesta con el id de una pregunta de otro servicio no entra a ningún lado.
4. **La FK compuesta impide apuntar a un campo de otro negocio:**
   `foreign key (field_def_id, agency_id) references extractor_field_defs (id, agency_id) on delete set null (field_def_id)`.
   Para eso `extractor_field_defs` necesita `unique (id, agency_id)`. Con `set null (columna)` solo se suelta `field_def_id`; el `agency_id` de la pregunta no se toca. Si borran el campo, la pregunta queda sin destino y la reserva sigue andando.

### 3. Misma transacción que la reserva, pero la reserva nunca falla por el dato

- Que sea el mismo `INSERT` garantiza que no haya cita con respuestas perdidas ni respuestas sin cita.
- Cada respuesta va en **su propio bloque** `begin … exception when others then raise warning … end`. Lo que no encaja se saltea: texto en un campo número, opción fuera del enum, fecha imposible (`2001-02-30` tira al convertir y cae al `exception`), cumpleaños en el futuro o antes de 1900. Vale más la cita que el dato.
- **Una respuesta vacía nunca borra** lo que el contacto ya tenía.
- La conversión la hace una función pura de la base (`reservas_valor_para_campo(valor, tipo, opciones)`, `immutable`): devuelve el valor ya con su tipo o `null`. Tiene que estar escrita aparte del trigger para poder probarla sola.

### 4. El origen del dato lo pone la base, no quien escribe

Hay que mostrar «Formulario de reserva · 28/10» o «Bot · 27/10» al lado de cada valor. La columna `origen` tiene un problema que aparece solo con dos autores:

- El bot escribe con `upsert … on conflict do update` y **no manda `origen`**.
- Con `ON CONFLICT`, las columnas que el `update` no nombra **se quedan como estaban**. Un `origen = 'reserva'` anterior quedaba pegado aunque el bot hubiera cambiado el valor, y la ficha mentía.

El arreglo es un trigger `BEFORE INSERT OR UPDATE` sobre la tabla de valores que decide el origen:

- Por defecto pone `origen = 'bot'` y `appointment_id = null`.
- Solo el trigger de la reserva puede cambiarlo, y lo hace con una marca local a la transacción: `perform set_config('crm.origen_valor', 'reserva', true)` antes de escribir y `set_config('crm.origen_valor', '', true)` después, **también dentro del `exception`**, o la marca se filtra a la siguiente respuesta.

### 5. Compatibilidad pregunta → campo, como función pura compartida

`campoCompatible(pregunta, campo)` (`assets/campos-del-contacto.ts`) la usan **el editor** (qué ofrecer) y **la server action** (qué aceptar). Los dos dicen lo mismo porque es el mismo archivo.

| Tipo de pregunta | Tipos de campo que la aceptan |
|---|---|
| número | `number`, `text` |
| fecha | `date`, `text` |
| sí o no | `boolean`, `text` |
| una opción, lista | `enum`, `text` |
| el resto (incluye varias opciones) | `text` |

- Un `enum` solo acepta la pregunta si **todas** sus opciones están entre las del campo. Si falta una, esa respuesta se perdería sin que nadie se entere.
- Si al cambiar el tipo de una pregunta el destino deja de servir, el editor lo suelta a «No guardar». Mejor eso que dejar un error esperando en el guardado.
- La base vuelve a convertir y saltea lo que no encaja: la función pura es la primera defensa y la base es la última.

### 6. Un campo nuevo desde el formulario nace sin que el bot lo busque

Columna nueva `extractor_field_defs.bot_extrae boolean not null default true` (los existentes siguen en `true`). Un campo creado desde un formulario nace en **`false`**: si no, crear una pregunta cambiaría lo que hace el bot de ese negocio, que nadie pidió. El analista filtra `.eq('bot_extrae', true)`.

- Desde el editor solo se puede **prender** `bot_extrae`. Apagar un campo que el bot ya usa cambiaría al bot.
- Un campo nuevo con el **nombre de uno existente y compatible** reutiliza ese (dos servicios que piden «Empresa» llenan el mismo).
- Con el nombre de uno **incompatible**, error claro: dos «Empresa» de distinto tipo confunden en la ficha.
- Dos preguntas nuevas con el mismo nombre en el mismo servicio crean un solo campo.
- La clave interna sale del nombre (`claveDeCampo`: sin tildes, minúsculas, `_`, hasta 40 caracteres) y no choca con las del negocio, también con las de campos apagados.

### 7. Las decisiones de producto se llevan con un ejemplo, no en abstracto

Son cuatro y cambian lo que ve el cliente. A Hans se le presentó una por una con **un contacto con nombre**, qué llena y qué ve el equipo:

| Decisión | Lo que se resolvió |
|---|---|
| El contacto ya tenía el valor | El formulario **reemplaza**; vacío no borra; la cita guarda lo que respondió |
| El bot puede cambiar después lo del formulario | **Sí**: gana lo último dicho, con el origen visible |
| Un campo nuevo lo busca el bot | **No** por defecto |
| «Empresa» va como columna fija o campo propio | **Campo propio** del negocio |

Hans las aprobó con «como recomendás». La versión en abstracto («¿reemplaza o conserva?») no se entiende; con «Laura ya tenía 2 sucursales y hoy puso 3» sí.

### 8. Una fecha es un día, no un instante

La ficha mostraba los campos `date` con `new Date('1990-03-15').toLocaleDateString()`. En Costa Rica (UTC-6) eso muestra el **14**, porque el texto se lee como medianoche UTC. Además rompe la hidratación, porque el formato cambia según la versión de ICU.

- Se formatea **a mano** desde `'YYYY-MM-DD'` (`fechaLegible`: «15 de marzo de 1990»).
- La fecha pública se pide con **día, mes y año** en tres campos: un calendario obliga a retroceder mes por mes hasta 1985.
- «Sin tocar ningún campo» es una respuesta vacía, no un error.
- Misma regla que `editar-dato-que-el-webhook-reescribe`, paso 5.

---

## Ejemplo input → output

**Input.** El negocio configura el servicio «Llamada de diagnóstico» con:

| # | Pregunta | Tipo | Va a |
|---|---|---|---|
| 1 | ¿Cuántas sucursales tienen? | número, obligatoria | campo nuevo «Sucursales» (`number`, `bot_extrae=false`) |
| 2 | ¿Cómo nos conociste? | lista: Instagram, Web, Referido | campo existente «Canal» (`enum` con esas 3 y más) |
| 3 | Cumpleaños | fecha | Cumpleaños de la ficha |
| 4 | ¿Algo más que debamos saber? | párrafo | No guardar |

Laura reserva por el link público y escribe `3`, `Instagram`, `15 / 3 / 1990`, y deja la 4 vacía.

**Output.**
- El navegador manda `{ [id1]: '3', [id2]: 'Instagram', [id3]: '1990-3-15' }`. Nada más.
- `answers` queda: `{ pregunta: '¿Cuántas sucursales…', tipo: 'number', respuesta: '3', pregunta_id: id1, valor: 3 }` y así las demás. La pregunta 4 vacía no entra.
- Trigger: `extractor_field_values` recibe `Sucursales = 3` y `Canal = "Instagram"` con `origen = 'reserva'` y `appointment_id` de la cita. `leads.birth_date = 1990-03-15`.
- En la ficha: «Sucursales: 3 · Formulario de reserva · 28/10» y «Cumpleaños: 15 de marzo de 1990» (no el 14).
- Si el lunes el bot saca del chat que ahora son 4 sucursales, el `upsert` pasa por el trigger de origen: «Sucursales: 4 · Bot · 2/11».
- Si Laura hubiera escrito `tres` en la pregunta 1, el servidor la rechaza con «Tiene que ser un número» antes de tocar la base.

---

## Gotchas

1. **Dos sistemas de campos en la misma base.** Si no buscás antes, creás el tercero. El de 0 filas era el heredado.
2. **`ON CONFLICT DO UPDATE` conserva lo que no nombrás.** Cualquier columna de «quién lo escribió» que dependa de que el escritor la mande, miente en el segundo escritor. Va en un trigger `BEFORE`.
3. **La marca `set_config(..., true)` es local a la transacción.** Apagala también en el `exception`; si no, la respuesta siguiente del mismo bucle hereda `origen = 'reserva'`.
4. **El `exception` dentro del bucle se come los errores.** Es lo que querés para la reserva, y por eso mismo hay que anotar un `raise warning` con el id de la pregunta y el `sqlerrm`: sin eso, una respuesta que nunca se guarda no deja rastro.
5. **Un `enum` con una opción de menos pierde respuestas en silencio.** La regla «todas las opciones de la pregunta tienen que estar en el campo» va en la función pura y se prueba.
6. **Un campo nuevo con `bot_extrae` en `true` por descuido cambia al bot de ese negocio** sin que nadie lo haya pedido. El default de la columna es `true` por los existentes; el insert del editor lo pone explícito en `false`.
7. **Las respuestas viejas no traen `pregunta_id`.** El trigger las saltea (`continue`) y la migración es compatible con el código que corre hoy. Se desplegó sin coordinar.
8. **El revoke va también a `PUBLIC`** en las tres funciones nuevas (`revocar-execute-incluye-public`). Una es `security definer`.
9. **Los textos de la página pública le hablan a cualquier cliente de cualquier negocio:** neutros, sin tú, vos ni usted.

---

## Cómo se probó

1. **El bloque que siempre aborta** contra la base viva (`probar-migracion-contra-base-viva-con-rollback`), con **21 comprobaciones**: reemplaza el valor, vacío no borra, la pregunta de otro servicio no entra, texto en un campo número / opción fuera del enum / fecha imposible se saltean **sin romper la cita**, el bot escribe después y el origen pasa a `bot`, la FK de otro negocio se rechaza, borrar el campo suelta la pregunta, y **0 valores existentes cambiaron**.
2. **Control negativo:** sin el trigger de la reserva, 0 filas. Sin él, el verde no prueba nada.
3. **Pruebas puras** (`assets/pruebas-formularios.test.ts`): cada tipo con su regla, `campoCompatible`, `claveDeCampo`, el destino en `validarPreguntas`.
4. **De punta a punta en local, a 375 px:** servicio de prueba con 6 preguntas, reserva por el link público escribiendo primero un **número inválido** (tiene que mostrar el error debajo del campo), después la reserva buena. Se verifica en la base **y** en la ficha (`verificar-funcionamiento-end-to-end`).
5. **Limpieza:** se borra todo lo de prueba. Antes de borrar la cita se pone `google_invitado = false`, así Google saca el evento sin mandar un correo de cancelación a nadie.

## Output esperado

- La migración con tipos nuevos, destino con FK compuesta, `bot_extrae`, `origen`, los dos triggers y la función de conversión, probada con el bloque que aborta.
- La función pura de compatibilidad compartida por editor y servidor, y la validación por tipo compartida por navegador y servidor.
- Un editor con selector de destino (incluido «Campo nuevo») y una página pública que pide cada tipo con su control.
- En la ficha, el origen de cada dato.

## Assets

| Archivo | Qué es |
|---|---|
| `assets/0167_formularios_de_reserva.sql` | La migración real: tipos, FK compuesta, `bot_extrae`, `origen`, trigger de origen, conversión y trigger de la cita, con su rollback en el encabezado |
| `assets/campos-del-contacto.ts` | `campoCompatible`, `tiposDeCampoPara`, `tipoDeCampoNuevo`, `claveDeCampo`, `opcionesDeCampo` |
| `assets/pruebas-formularios.test.ts` | Las pruebas puras (`node:test`). Importan helpers del CRM (`validarPreguntas`, `validarRespuesta`, `validarInvitado`) que hay que portar |

Las tablas son las del CRM (`appointments`, `booking_type_questions`, `extractor_field_defs`, `extractor_field_values`, `leads`). Al reusar en otro proyecto, cambiá los nombres y dejá la estructura.

## Relacionadas

- `editar-dato-que-el-webhook-reescribe`: la misma pregunta de «quién gana cuando dos autores escriben», y la fecha como `date`.
- `catalogo-multifuncional-por-preset`: otro caso de una base que se adapta por configuración al rubro.
- `reservar-sin-pisarse-pagina-publica` y `motor-de-horarios-libres`: la agenda de la que sale la cita.
- `probar-migracion-contra-base-viva-con-rollback`: el bloque que siempre aborta y el control negativo.
- `revocar-execute-incluye-public`: por qué el revoke va también a PUBLIC.
- `detectar-escritura-filtrada-rls`: el guardado del editor se confirma contando filas.
- `verificar-funcionamiento-end-to-end`: la prueba de punta a punta en la ficha, no solo en la base.
