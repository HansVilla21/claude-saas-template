# Skill: Cargar en el motor un prompt escrito afuera

## ⚠️ Regla vigente (founder, 2026-10-17) — manda sobre lo que diga el resto de esta skill

**El texto que entrega el autor se carga tal cual, letra por letra:** el prompt principal, las reglas de pase y cualquier pieza que él entregue. No se mueve ni se reescribe ninguna línea.

Lo que esta skill antes llamaba "cambiar lo mínimo" ahora se parte en dos:

| Es del autor (no se toca) | Es nuestro (se ajusta para que su texto funcione) |
|---|---|
| El prompt principal y las reglas de pase | `modelo: claude-sonnet-5` y `callar_tras_cierre: true`. **Todos los bots van en Sonnet** |
| Si trae una trampa (la hora dentro del prompt, su revisión final en el medio, un bloque que el motor ya arma), **se le reporta** con el número para que la corrija en su próxima versión | `aviso_al_pasar: avisar` si su prompt escribe el puente: en silencioso el código lo borra, **aunque su LEEME pida apagarlo**. `instruccion_al_pasar` remite a su sección del puente, lleva `{{DIA_SEMANA}}` y `{{HORA_CR}}` y le prohíbe contarle a la persona el día o la hora (ver el apéndice de catálogo y fotos) |
| | Las piezas viejas nuestras que contradicen el texto nuevo (`reglas_finales`, `objeciones`, `instruccion_al_pasar`) se vacían o se alinean |
| | **Los topes salen de su TEXTO, no de su LEEME.** Si el texto dice "una burbuja, dos solo si son dos cosas, tres solo con link", `tope_burbujas` es 2, aunque el LEEME diga 3. `largo_maximo_respuesta` no baja de lo que el texto necesita (ver paso 4: el recortador rompe frases). El resto de las llaves del LEEME (temperatura, espera) se ponen si existen en el código; las que no existen se reportan |

**Por qué:** el 2026-10-17 se cargó un prompt del equipo comercial moviendo la línea de la hora y su revisión final a `reglas_finales`, y dejando el modelo viejo. El founder lo revirtió: *"lo que me pasa [el autor], eso es y listo"*. El prompt es del autor y lo va a volver a editar; si lo cambiamos nosotros, la versión que él tiene deja de ser la que corre.

**Cargado no es listo (founder, 2026-10-19).** Después de cada carga se **mide** el estilo del bot contra las reglas del mismo prompt (paso 4), y los números van al founder y al autor **antes** de decir "listo". Sin eso, el autor prueba, ve el bot fallar en lo que su texto prohíbe y concluye que "no se cargó": pasó con la v2.4 de un consultorio, que estaba bien cargada y abría cada reacción con "Uy".

**El costo de cargarlo tal cual, para decírselo al autor:** con `{{HORA_CR}}` dentro del prompt la caché nunca pega. Medido en 7 días de tráfico real con Sonnet 5: US$0,060 por respuesta con la hora adentro, contra US$0,024 sin ella (unas 2,5 veces más). Su propia guía (`editar-prompt-momentum`) ya dice que la fecha y la hora van en "Revisión final".

## Cuándo usar esta skill

- Llega un prompt hecho por **otra persona o proyecto** (el equipo comercial, otra IA) para el bot de un negocio, con un "ya está todo, nada más hay que implementarlo".
- Viene con instrucciones de carga ("esto va en tal campo", "la espera ya está configurada") que **no se escribieron mirando el sistema vivo**.
- El motor no usa ese texto solo: le pega bloques alrededor (catálogo, decisiones del turno, reglas del sistema, revisión final del negocio) y lee config que el autor no ve.
- Cross-project: cualquier sistema que arma el prompt **por bloques**, usa **caché de prompts** y deja que el negocio edite parte de la config desde una pantalla.
- La entrega trae también **catálogo y fotos**: seguir además el apéndice "Cuando la entrega trae catálogo y fotos", al final.

## Por qué existe esta skill

En el CRM de Momentum se cargó tres veces un prompt del equipo comercial: un consultorio (2026-09-22), el bot de la propia agencia (2026-09-26) y una clínica de medicina estética (2026-10-15). Las tres veces el texto estaba bien escrito, y las tres veces **pegarlo tal cual lo rompía**. Ninguno de estos problemas da error: el bot contesta, solo que distinto de lo que dice el prompt.

| Lo que dice quien lo escribió | Lo que pasa en el motor |
|---|---|
| "Pegalo entero en el campo del prompt" | El motor le agrega 5 bloques. Si el prompt trae su propio `## DECISIONES DE ESTE TURNO`, quedan dos, y el suyo con un estado congelado |
| "Hoy es {{DIA_SEMANA}} y son las {{HORA_CR}}", en la línea 17 | Cambia cada minuto, así que la caché no sirve: **cada respuesta se cobra el prompt entero**. En Claude, además, se paga la escritura de la caché al doble |
| "Dale el precio tal cual el catálogo" | El catálogo llegaba **cortado**: 30 ítems (la clínica tiene 38) y 300 caracteres por descripción (36 de 38 pasaban). Faltaban justo los servicios que el prompt nombra para lipopapada y Sculptra, y los precios que viven en la descripción |
| Su REVISIÓN FINAL, al final del prompt | Ya no es final: detrás van el catálogo, las decisiones y la revisión final **del negocio**, que es la que gana. La vieja decía "los audios no se interpretan, se pasan" |
| "Al pasar, avisá que una compañera le escribe" | El negocio estaba en **pase silencioso** y el código vacía el mensaje |
| "La espera de 60 s ya está configurada" | No existía la llave: corría con los 45 por defecto |
| "Escribí con ¿ ¡ como el equipo" | El código se los borraba a todos los bots |
| Reglas de pase de 2.885 caracteres | El motor las lee enteras, pero la pantalla de Configuración tenía un tope de 2000 y cada guardado las manda: **el negocio no podía guardar NADA ahí** |
| El texto genérico del módulo de servicios | Decía "sugerí el servicio que calce", contra la regla dura "nunca elegís un tratamiento por la persona" |
| El puente de noche: "dice cuándo, según la hora" | Con la hora solo al final del prompt, de noche decía "en un ratito" en 4 de 6 pases, y a una persona que escribía en inglés la pasó en español. Con la hora y el idioma **en la instrucción del pase**, 6 de 6 |

> La idea central: **un prompt ajeno se carga como un PR, no como un copiar y pegar.** Se cruza contra el sistema vivo, se ajusta la configuración para que el texto funcione, el texto queda tal cual, y lo que el texto tiene mal se le reporta al autor.

## Proceso

### 1. Leer el estado vivo antes que el archivo

No creerle al LEEME que viene con el prompt: dice cómo cree el autor que está todo.

```sql
-- La config entera del negocio y si el bot está prendido
select motor_bot, settings->'bot_enabled' bot_enabled, settings->'bot_schedule' horario,
       (select array_agg(k order by k) from jsonb_object_keys(bot_config) k) llaves,
       bot_config->>'modelo' modelo, bot_config->>'aviso_al_pasar' aviso,
       bot_config->'espera_segundos' espera, length(bot_config#>>'{agent_prompts,principal}') principal
from agencies where slug = '<slug>';

-- El catálogo que el prompt da por inyectado: cuántos, qué tan largos y en qué unidad
select count(*) visibles, max(length(description)) desc_max,
       count(*) filter (where length(description) > 300) desc_largas,
       array_agg(distinct price_unit) unidades
from catalog_items where agency_id = '<id>' and deleted_at is null and is_published and status = 'available';
```

Leer también `reglas_finales` y `reglas_handoff` vivas (texto completo), el texto del módulo de catálogo (`module_definitions.prompt_fragment` y el `prompt_override` del negocio) y `bot_prompt_versions` (alguien pudo cambiarlo desde el panel).

### 2. Cruzar el prompt contra el motor, punto por punto

| Revisar | Cómo se rompe | Qué se hace |
|---|---|---|
| Bloques que arma el motor | Decisiones del turno u objeciones dos veces | Se sacan del prompt (el contrato en `crm-v2/docs/specs/2026-09-26-contrato-prompts-del-bot.md` dice cuáles) |
| Placeholders que cambian seguido | `{{HORA_CR}}` antes del final de lo cacheable mata la caché | A `reglas_finales`, que va después del corte de la caché. Ojo: "al final del prompt" **no alcanza**, porque el catálogo va detrás del prompt y dentro de la caché |
| Datos que el prompt da por inyectados | Topes del motor (ítems, largo por descripción) más chicos que el catálogo real | Contar contra los topes **en el código** (`catalogo.ts`) y arreglar el motor si hace falta |
| Texto genérico de un módulo | Contradice una regla dura del prompt | `prompt_override` del negocio en `agency_modules.config` |
| Lo que se lee último | `reglas_finales` vieja contradice al prompt y gana | Reemplazarla, con copia antes. La revisión final del autor va ahí |
| Modo de pase | El prompt escribe un puente y el negocio está en silencioso | `aviso_al_pasar: avisar` + `instruccion_al_pasar` (tope 400) que remita a la sección del puente y diga cuándo va vacío (spam, proveedores). Si el puente depende de la hora o del idioma, **ponerlos ahí**, en el punto donde se decide el pase |
| Lo que "ya está configurado" | La llave no existe | Verificar cada llave que nombra el LEEME |
| Estilo que impone el código | `limpiarBurbuja` borra ¿ ¡, dos puntos y punto final | Si el negocio pide otra cosa, es una opción por negocio (`signos_de_apertura`), nunca un cambio para todos |
| Topes de la pantalla de Configuración | El texto entra al motor pero rompe cada guardado del negocio | Comparar los largos contra `MAX_*` de `lib/settings/types.ts` y el motor |
| El largo | Recortar "porque la metodología dice 5.000" | Con Sonnet 5 y caché el largo no es el problema (prompts vivos de 25 a 51 mil). No se corta |

**Con la regla vigente:** las filas que tocan el TEXTO del autor (bloques del motor dentro del prompt, placeholders, su revisión final) ya no se arreglan. Pasan a ser lo que se le reporta. Las de configuración y de motor (modo de pase, llaves, topes, catálogo, `prompt_override` del módulo) se siguen haciendo.

### 3. Separar lo del autor de lo nuestro, con un script

- **El texto del autor entra como vino.** Solo se normaliza lo invisible (BOM, `\r\n` → `\n`, espacios al final). El md5 de lo que se guarda tiene que ser el del archivo normalizado.
- **Lo nuestro se arma aparte:** `modelo`, `callar_tras_cierre`, `aviso_al_pasar`, `instruccion_al_pasar` (tope 400) y las piezas viejas que se vacían. Cada pieza se compara con su tope (`MAX_*` de `lib/settings/types.ts` y del motor).
- **Escribir en bytes** (`write_bytes(texto.encode('utf-8'))`). En Windows, `write_text` de Python pone CRLF y el prompt llega a la base con `\r\n`.
- Los originales van a `clients/<cliente>/prompts/motor-<version>-<fecha>/originales/` (local, fuera de git).

### 4. Medir siempre, después de guardar

**Obligatorio en cada carga.** `crm-v2/scripts/medir-estilo.ts <negocio> --tope-usd 1` corre conversaciones simuladas por el motor real con los casos del negocio (`scripts/medir-estilo/<negocio>.json`) y cuenta, por respuesta:
- las frases que el prompt prohíbe;
- más burbujas de las que el texto permite;
- burbujas largas;
- dos preguntas en un turno;
- **las respuestas que acortó el recortador**, que se imprimen completas para leerlas.

Una corrida de 4 conversaciones con Sonnet 5 cuesta ~US$0,40. Si el negocio todavía no tiene su archivo de casos, se arma con sus reglas de pase y las frases que su texto prohíbe.

- **Leer la transcripción, no solo el número.** El 2026-10-19 bajar `largo_maximo_respuesta` a 200 "mejoró" la tabla a la mitad de fallas, pero porque el recortador acortaba el 38 % de las respuestas. Una de esas, en una prueba real del autor, salió sin el comienzo de la frase ("Roberto le vea la rodilla…"). La tabla de frases prohibidas no lo vio.
- **Si el estilo falla, se prueban perillas nuestras, una por variante,** con los mismos casos, nunca el texto del autor. Medido en el consultorio (7 variantes):
  - `tope_burbujas` alineado con el texto (2 en vez de 3) eliminó las respuestas de 3 burbujas sin link, y nada más;
  - subir el razonamiento (`esfuerzo: medium`) no cambió nada;
  - copiar su revisión final a `reglas_finales` tampoco;
  - bajar el largo por debajo de lo que el texto necesita compra frases rotas;
  - **las frases que el texto prohíbe ("uy", "con calma", "le gustaría que") no bajaron con ninguna perilla de configuración:** 13 a 16 fallas en 4 conversaciones con cualquier combinación sin recortador. Eso es del texto, así que se le pasa al autor con los números y las frases exactas, y lo corrige él.
- **Cuando el autor dice "no se parece a mi versión":** primero confirmar que el bot lee su versión. `bot_turns.tokens_in` sube con el largo del prompt nuevo, y la voz cambia. Recién después medir. Casi nunca es la carga.
- **Dónde prueba el autor:** en "Probar bot" (mismo sistema que el WhatsApp). Lo que prueba con el prompt suelto en otro chat no transfiere, porque no tiene el tope, el recortador ni el bloque de decisiones.

Para simular conversaciones enteras sin contar estilo (pases, otro idioma, de noche), sigue existiendo el simulador:

- `scripts/simular-conversaciones.ts <negocio> <etiqueta> [personas] --config propuesta.json`. **`--config` reemplaza la config entera**: pasarle la propuesta COMPLETA (lo que había más lo nuevo).
- Los casos salen de las **reglas de pase del autor**: uno por regla que pasa, más los que NO tienen que pasar, más otro idioma, de usted, y de noche. Si se cambió el motor, uno que pruebe ese cambio (el servicio que antes no llegaba).
- Tanda chica primero (3 casos), mirar el costo por turno en `bot_turns.metadata.costo_usd` (`is_eval_synthetic`) y recién ahí el resto. Avisar el costo antes. Referencia: 36 turnos con Sonnet 5 costaron US$0,55.
- **Leer las transcripciones, no solo la tabla.** La tabla no ve que el puente de noche dice "en un ratito", que el pase salió en otro idioma o que una burbuja se partió en "Dra.".
- Lo que falle se arregla primero en **lo que es nuestro** (instrucción al pasar, revisión final, motor) y no en el texto del autor. Repetir los casos que fallaron; si era intermitente, dos veces.

### 5. Guardar en una escritura y verificar contra la base

- Respaldo de la config viva en `crm-v2/backups/` (fuera de git).
- El prompt principal por **`guardar_prompt_del_bot`** (service_role, con el md5 del texto anterior): así la versión vieja queda en el historial de Master, con «Volver a esta». Esa función no acepta texto vacío; si hay que vaciar `objeciones`, insertar antes la versión vieja en `bot_prompt_versions` (sin la columna `largo`, que es calculada).
- El resto en una sola escritura con **filtro por `updated_at`**: si alguien cambió la config en el medio (el negocio puede editar 5 llaves desde Configuración), no se escribe nada. Y `select` de vuelta: un PATCH que no matchea responde éxito con 0 filas.
- Verificar: md5 de la base = md5 del archivo, **cero `\r`** (`position(chr(13) in bot_config::text) = 0`), las llaves esperadas, `bot_enabled` sin tocar.
- Uno o dos casos del simulador **sin `--config`**: prueban lo que quedó guardado, no la propuesta.

### 6. Cerrar el circuito con el autor

- Un mensaje corto, en un bloque aparte para que el founder lo reenvíe, con tres cosas: que quedó cargado tal cual; **lo único que no siguió su LEEME y por qué** (casi siempre el aviso al pasar); y **las trampas de su texto** con el número, para que las corrija él en la próxima versión.
- La trampa nueva va a la fuente, que es el contrato y el skill con el que escribe (`editar-prompt-momentum` en `crm-v2`). Si no, se repite la próxima vez.

### 7. Prenderlo es otro paso, con OK

Antes de `settings.bot_enabled = true`:

- **Datos sensibles:** si es salud, la consulta legal.
- **Quiénes vuelven al bot al prender:** el trigger de reconciliar le devuelve las conversaciones `unassigned` sin dueño humano, y las de `human` no las toca. Contarlas antes, para que el bot no le hable de golpe a gente que estaba con el equipo.
- **Modo prueba:** `settings.bot_solo_para` con el número de quien prueba, para hablarle por WhatsApp real sin prenderlo para todos. Su conversación tiene que estar **sin dueño** (`assigned_user_id` nulo, o el que puso el reparto): si alguien del equipo la tiene asignada, el bot se calla igual y la prueba parece rota.

## Output esperado

- El texto del autor guardado tal cual (md5 de la base = md5 del archivo), con Sonnet 5, su respaldo y la versión anterior en el historial de Master.
- Si el motor no podía con lo que pide el prompt: un PR con el arreglo y sus pruebas, mergeado antes de dar la carga por buena.
- La carpeta local con los originales.
- **El resultado de `medir-estilo`** (números + las respuestas recortadas), corrido después de guardar.
- El mensaje para el autor, con esos números, y la fila en el backlog con lo que falta para prenderlo.

## Ejemplo (2026-10-17, con la regla vigente)

**Input:** "El equipo comercial pidió actualizar el prompt de un consultorio: acá van el prompt, las reglas de pase y su nota. La regla es que lo que pasan ellos se carga y listo."

**Output:**
- **Cargado tal cual:** principal (25.703 caracteres) y reglas de pase, verificados por md5 contra los archivos. `reglas_finales` y `objeciones` viejas vaciadas, porque contradecían la voz nueva; sus versiones quedaron en el historial.
- **Config:** Sonnet 5, `callar_tras_cierre`, temperatura y topes como pidió la nota.
- **Lo único que no siguió la nota:** el aviso al pasar quedó prendido. Apagado, el código borra su puente.
- **Para el autor:** la línea de la hora está dentro del prompt y cada respuesta cuesta unas 2,5 veces más; que la pase a Revisión final en la próxima versión.
- **Prueba:** bot apagado para los leads reales; su número en `bot_solo_para` y su conversación sin dueño.

## Ejemplo anterior (2026-10-15, antes de la regla: hoy NO se tocaría el texto)

**Input:**
"Acá está todo lo que pasó el equipo comercial para la clínica: el prompt, las reglas de pase y un LEEME. Ya no hace falta cortarlo porque usamos otro modelo. Nada más hay que implementarlo."

**Output:**
- **El largo se confirmó:** 26 mil caracteres no se cortan.
- **Lo que no daba el motor:** el catálogo llegaba cortado, la unidad en inglés, los ¿ ¡ borrados y el corte de burbujas en "Dra.". Se arregló en un PR.
- **Lo que no daba la pantalla:** el tope de 2000 de las reglas de pase en Configuración. Se arregló en otro PR.
- **Tres cambios al texto,** probados por script con diff:
  - la hora sale del prompt;
  - el puente remite a la hora del final;
  - la REVISIÓN FINAL pasa a `reglas_finales`.
- **Config nueva:** pase con aviso, con hora e idioma en la instrucción; Sonnet 5; espera de 60 s; texto propio del módulo de servicios.
- **Pruebas:** 12 casos simulados. Aparecieron 3 fallas, se arreglaron y se volvieron a correr. Costo total: US$0,61.
- **Carga:** una escritura verificada por md5. El bot quedó apagado, con los pendientes para prenderlo escritos.

---

## Apéndice 2026-11-02 — Al sacar una regla del prompt cargado, medir también el caso contrario

Un cliente trabaja hasta las 5 y el prompt cortaba «hoy» a las 4. Se sacó el corte, y fuera de horario **empeoró**.

- **Medido:** en pruebas, prometer «hoy» fuera de horario pasó de **3 de 6 a 6 de 6**. El prompt trae dos ejemplos con «hoy mismo le escribe por aquí» y el modelo los copia; sin el corte, nada lo frenaba. En pases reales ya ocurría en **8 de 19**.
- **Lección:** al sacar una regla, medí contra la versión **anterior** y también en el **caso contrario** (acá, fuera de horario), no solo el caso que pidieron (acá, entre 4 y 5).
- **Lo que no alcanzó:** sacar «hoy mismo» de los ejemplos (4 de 6 seguían prometiéndolo). Dos redacciones cortas en `instruccion_al_pasar` tampoco (6 de 6 y 3 de 6 prometiendo hoy).
- **Trampa:** `instruccion_al_pasar` tiene **tope de 400 caracteres** y el motor corta en silencio con `.slice`. Una prueba que arma el texto sin el recorte da verde, y en producción se corta justo lo nuevo (va al final). Probá pasando por **la misma función del motor** que arma la instrucción, no por una copia.
- **Lo que funcionó:** `reglas_finales` (2.000 caracteres, **lo último que lee el modelo**) con una frase explícita: «Si ahora está fuera de ese horario, no diga hoy ni hoy mismo». Resultado: **6 de 6 bien** fuera de horario y **3 de 3** en horario. Son pocas corridas: se confirma con pases reales.
- **Antes de culpar al reloj:** el «mensaje de fuera de horario» que reportó el cliente no era el aviso automático ni la hora del servidor: lo escribía el modelo siguiendo el prompt. Calculá la hora con la función real del motor y buscá el texto exacto en los mensajes guardados antes de tocar nada.

---

## Apéndice 2026-11-02 — Cuando la entrega trae catálogo y fotos

Una tienda de uniformes entregó en un zip el prompt, las reglas de pase, 26 productos y 26 fotos, con una nota que decía que el catálogo solo se usaba para las fotos. El prompt se cargó tal cual. Lo que hizo falta estuvo alrededor del texto, y nada de esto dio error.

### Las fotos se miran antes de subirlas

- **El nombre del archivo puede mentir.** 8 de 11 fotos de una colección tenían el nombre cruzado: el archivo del diseño 6 mostraba el diseño 10. Cargadas por nombre, a quien pide un diseño le llega otro, y la medición no lo ve porque solo cuenta que salió una foto.
- **Cómo revisarlas:** una hoja de contacto con el nombre del archivo debajo de cada foto (en Windows sale con `System.Drawing`, sin instalar nada) y otra ampliada de las que traen un código impreso. Si lo que muestra la foto coincide con el catálogo y el nombre no, manda lo que muestra. La lista de cruces va en el mensaje al autor, para que corrija su carpeta.
- **Una foto compartida por dos productos se sube dos veces,** una por ítem, para que quitarla de uno no toque al otro. La ruta es la del panel, `<negocio>/tmp/<uuid>.<ext>`: el borrado de un negocio recorre dos niveles.
- **Después de medir, verificar qué foto salió,** no que salió una. Se cruza la URL de `media->0` de cada producto con `bot_turns.output_crudo`. `tools_invocadas` vino vacío en turnos en los que el bot sí había buscado, así que no sirve para esto.
- **Lo impreso en la foto también es dato:**
  - **Un código impreso distinto del catálogo** (`UGSW_06` contra `USW_006`) da 0 resultados en la búsqueda. Si no se le avisa al bot, dice que ese código no existe, así que va en el texto del módulo.
  - **Un precio impreso distinto** (sin IVA, o con otro monto) lo va a ver la persona al lado del que dice el bot. Se compara contra el prompt y se le reporta al autor.

### Lo que el motor no hace aunque la nota lo pida

| La nota dice | Lo que pasa |
|---|---|
| "La tabla de medidas va como segunda foto" | `producto_para_el_modelo` devuelve solo `media->0`. La segunda se ve en el panel y el bot nunca la manda |
| "`largo_maximo_respuesta` de 900" | Ese valor solo baja el límite: `limiteDeLargo` toma el menor entre el negocio y `tope × 220`. Con 3 burbujas queda en 660. Se carga igual, se reporta, y el motor se toca solo si una medición llega al tope |
| "Cuando un diseño llega a 0, deja de ofrecerse" | Es cierto con stock cargado. Stock vacío cuenta como disponible, así que sin la cantidad el bot ofrece todo |

### El texto del módulo puede contradecir al prompt

Con "el catálogo solo para las fotos", el texto genérico de Productos choca de cuatro formas:
- pide buscar siempre antes de responder;
- dice "lo que no venga en los datos no lo afirmes", y el prompt ya sabe telas y envíos;
- dice "si salió en la búsqueda, está disponible", contra la regla de no confirmar existencias;
- va de vos, en un bot que habla de usted.

Se resuelve con `prompt_override` en `agency_modules.config`, sin tocar el texto del autor. Hay que conservar el formato `[IMG:URL]` y qué hacer con `relajaciones`. La descripción de la herramienta y `NOTA_DETALLE_PRECIO` viven en el código y no se pisan.

### El pase y la hora

- **La hora en `instruccion_al_pasar` puede hacer que el bot cuente su razonamiento:** "hoy es lunes así que en un rato le escriben", "como estamos en horario". Salió en 3 de 4 pases. Bajó casi del todo agregando "le dice solo cuándo, sin nombrar el día, la hora ni el horario": en unas veinte corridas siguientes quedó una vez ("como hoy es domingo"), y a veces un "ya cerramos por hoy", que se lee natural.
- **Fuera de horario se prueba sin esperar a la noche.** `--config` de `medir-estilo` con `agent_prompts.principal`, `instruccion_al_pasar` y `reglas_finales` en los que `{{DIA_SEMANA}}`, `{{FECHA_CR}}` y `{{HORA_CR}}` ya van reemplazados por un valor fijo. No se guarda nada, y cada corrida de un caso costó de US$0,02 a US$0,12. Los casos mínimos son en horario, sábado abierto, sábado cerrado, noche y madrugada.
- **La regla final tiene que cubrir los tres casos.** Medido:
  - **Sin regla:** un sábado a las 4:10 p. m., con la tienda cerrada desde las 2:30, dijo "hoy mismo".
  - **Con "si ya cerraron, no diga hoy":** el sábado quedó bien, pero en horario salió una vez "mañana a primera hora". Además, esa frase choca con la madrugada, donde "hoy desde las 8" es lo correcto.
  - **Con los tres casos** (abierto: en un rato, no mañana; todavía no abren: hoy desde que abran; ya cerraron: mañana o el lunes): 6 de 6 bien. Son pocas corridas, así que se confirma con pases reales.

### Al medir

- **`espera_pase`:** un caso que tiene que pasar en el primer turno, como un reclamo, va con `"si"`. Con `"al-final"` la tabla lo cuenta como falla aunque el bot haya hecho lo correcto.
- **El lead simulado no ve los adjuntos:** vuelve a pedir la foto que ya le mandaron. Un "aquí la tiene otra vez" es de la prueba, no del bot.
- **Las cuentas se revisan a mano.** Ninguna regex sabe si 6 × 3.300 + 2 × 4.430 da bien. Conviene escribir los totales esperados en `fuente`, en el archivo de casos.
- **El costo de la hora dentro del prompt no sale de la simulación.** Las corridas van seguidas y la caché pega: dieron US$0,027 por respuesta, contra los US$0,060 de tráfico real. Para el autor, ese costo se multiplica por el volumen del negocio, contando ráfagas:

```sql
with m as (
  select conversation_id, created_at,
         lag(created_at) over (partition by conversation_id order by created_at) as previo
  from messages where agency_id = '<id>' and direction = 'inbound'
)
select date_trunc('day', created_at at time zone 'America/Costa_Rica')::date as dia,
       count(*) as respuestas_estimadas
from m where previo is null or created_at - previo > interval '30 seconds'
group by 1 order by 1;
```

  Es un techo: baja con cada conversación que pasa a una persona.

### Las preguntas que trae la nota

Se contestan contra el código o la base, y van en el mensaje al autor. Medido en esta carga:
- **"¿El bot ve el anuncio?"** No. El turno no lee la atribución. Ve lo que escribe la persona, y el texto prearmado del anuncio le llega como su mensaje.
- **"Un mensaje del equipo quedó como del cliente":** antes de culpar al registro, mirar el evento crudo del proveedor. `webhook_events_raw.agency_id` puede venir nulo, así que filtrar por agencia da 0 filas y parece que no hay datos: se busca el número del negocio dentro de `raw_payload`, acotado por fecha. En este caso eran entrantes reales desde otro número.

---

## Apéndice 2026-11-03 — Cuando el prompt pide una ficha y el texto del motor la frena

La nueva versión del prompt de una clínica pedía no listar tratamientos ni precios cuando alguien cuenta una preocupación, y dar la información de la valoración con su ficha (`descripcion_tal_cual`, skill `texto-literal-por-marcador`). El texto del autor se cargó tal cual. Lo que hubo que cambiar estaba alrededor.

### Medir el choque antes de arreglarlo

Leyendo los textos, el choque parecía otro. La nota del motor decía "se nombran cada uno con su precio, sin fichas", se lee al final y vale "por encima de cualquier otra indicación", así que debía ganarle al prompt y listar precios. **Medido con 3 conversaciones (US$0,34): el modelo no listó nada.** Lo que sí fallaba era la otra mitad de la frase: por el "sin fichas", contaba la valoración con sus palabras.

Sin esa tanda chica, el informe habría dicho "lista precios" y el arreglo habría apuntado a lo que no estaba roto.

### El texto del motor dice cuándo, no qué contestar

- **La regla:** la nota de un mecanismo que usan varios negocios dice cuándo se dispara. Qué contestar cuando no aplica lo dice el prompt del negocio. La nota traía una decisión comercial de un día, y al cambiar el prompt pasó a contradecirlo.
- **Si la decisión era del founder, se le dice.** Cambiar esa frase deshacía una opción que había elegido antes, así que el merge esperó su OK.
- **"Como mucho una frase corta" también manda.** Dejaba la ficha sin saludo: dos reportes de la clínica. La nota ahora nombra el saludo antes de la ficha, y `medir-estilo` lo cuenta con `saludo_al_empezar`.

### Una ficha que el modelo no usa por su cuenta

Un servicio que el prompt manda a ofrecer por iniciativa propia, como la valoración, se resiste a salir por ficha: el prompt ya trae los datos, y el modelo los cuenta.

| Lo que se probó | Ficha de la valoración |
|---|---|
| Solo la línea del prompt ("si el sistema te pasa la ficha, la usas") + el servicio en el catálogo | 0 de 3 |
| Nota del motor: "cada vez que va a decir el precio o lo que incluye, aunque no lo haya nombrado" | 1 de 3 |
| Además, `reglas_finales` con el marcador concreto: `[FICHA:<ref>]` | 4 de 4 |

- **`reglas_finales` es config nuestra** y se lee al final, así que no toca el texto del autor. Se le cuenta en el mensaje, porque su línea sola no alcanza.
- **El marcador es parte del id del servicio.** Si alguien borra y vuelve a crear el servicio, deja de valer: `depurarFichas` lo saca sin error y la ficha deja de salir. Queda anotado en el backlog.
- **El equipo del negocio puede editar `reglas_finales`** desde Configuración. Si lo borra, se vuelve al 1 de 3.

### Lo que se revisa en cada carga

- **Lo agregado a mano se compara contra lo VIVO, no contra la versión anterior del autor.** Contra su versión anterior había 2 cambios; contra lo que estaba cargado, 6. Cada diferencia se revisa y se reporta si se pierde algo.
- **Las palabras que el autor prohíbe también salen de nuestra config.** `instruccion_al_pasar` todavía decía "nunca en un ratito", y el nuevo prompt prohíbe esa palabra. Cambiarla por la frase larga daba 409 caracteres contra el tope de 400, y el motor habría cortado lo último en silencio.
- **Una palabra que el cliente prohibió por escrito va también a `frases_prohibidas`.** Se busca sin mirar las fichas: una descripción del negocio que la usa sale igual, y se le avisa al autor.
- **Los casos de medir se actualizan con el prompt.** Una cita que ya no está en el texto avisa sola. Lo que no avisa es un `espera_pase` que quedó viejo o un regex que no cubre lo que el motor genera: `{{SALUDO_HORA}}` da "Buen día", no "Buenos días", y de día la regla del saludo habría fallado siempre.
- **La hora en Git Bash de Windows:** `TZ=America/Costa_Rica date` imprime UTC y lo rotula como hora local. Dio 03:43 cuando eran las 21:43. La hora de Costa Rica se saca con `Intl` en Node, que es lo que ya imprime el reporte de `medir-estilo`.
