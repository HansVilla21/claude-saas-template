# Skill: Cargar en el motor un prompt escrito afuera

## ⚠️ Regla vigente (founder, 2026-10-17) — manda sobre lo que diga el resto de esta skill

**El texto que entrega el autor se carga tal cual, letra por letra:** el prompt principal, las reglas de pase y cualquier pieza que él entregue. No se mueve ni se reescribe ninguna línea.

Lo que esta skill antes llamaba "cambiar lo mínimo" ahora se parte en dos:

| Es del autor (no se toca) | Es nuestro (se ajusta para que su texto funcione) |
|---|---|
| El prompt principal y las reglas de pase | `modelo: claude-sonnet-5` y `callar_tras_cierre: true`. **Todos los bots van en Sonnet** |
| Si trae una trampa (la hora dentro del prompt, su revisión final en el medio, un bloque que el motor ya arma), **se le reporta** con el número para que la corrija en su próxima versión | `aviso_al_pasar: avisar` si su prompt escribe el puente: en silencioso el código lo borra, **aunque su LEEME pida apagarlo**. `instruccion_al_pasar` remite a su sección del puente y lleva `{{DIA_SEMANA}}` y `{{HORA_CR}}` |
| | Las piezas viejas nuestras que contradicen el texto nuevo (`reglas_finales`, `objeciones`, `instruccion_al_pasar`) se vacían o se alinean |
| | Las llaves que pide su LEEME (temperatura, topes, espera) se ponen si existen en el código; las que no existen se reportan |

**Por qué:** el 2026-10-17 se cargó un prompt del equipo comercial moviendo la línea de la hora y su revisión final a `reglas_finales`, y dejando el modelo viejo. El founder lo revirtió: *"lo que me pasa [el autor], eso es y listo"*. El prompt es del autor y lo va a volver a editar; si lo cambiamos nosotros, la versión que él tiene deja de ser la que corre.

**El costo de cargarlo tal cual, para decírselo al autor:** con `{{HORA_CR}}` dentro del prompt la caché nunca pega. Medido en 7 días de tráfico real con Sonnet 5: US$0,060 por respuesta con la hora adentro, contra US$0,024 sin ella (unas 2,5 veces más). Su propia guía (`editar-prompt-momentum`) ya dice que la fecha y la hora van en "Revisión final".

## Cuándo usar esta skill

- Llega un prompt hecho por **otra persona o proyecto** (el equipo comercial, otra IA) para el bot de un negocio, con un "ya está todo, nada más hay que implementarlo".
- Viene con instrucciones de carga ("esto va en tal campo", "la espera ya está configurada") que **no se escribieron mirando el sistema vivo**.
- El motor no usa ese texto solo: le pega bloques alrededor (catálogo, decisiones del turno, reglas del sistema, revisión final del negocio) y lee config que el autor no ve.
- Cross-project: cualquier sistema que arma el prompt **por bloques**, usa **caché de prompts** y deja que el negocio edite parte de la config desde una pantalla.

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

### 4. Simular, solo si hace falta

Por defecto **no se simula**: el autor prueba desde su número en modo prueba (paso 7). Se simula si el founder lo pide o si se cambió el motor para que el texto funcione.

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
- El mensaje para el autor, y la fila en el backlog con lo que falta para prenderlo.

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
