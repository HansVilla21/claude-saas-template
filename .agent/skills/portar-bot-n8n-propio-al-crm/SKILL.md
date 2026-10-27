# Skill: Portar un bot propio de n8n al CRM multi-tenant

> Capturada 2026-09-02 al pasar a **Leo (Level CR)** desde su workflow propio
> (`Level - Leo - YCLOUD`) al `bot-c-v1` del CRM. Tercera vez del mismo proceso
> (Roberto, Jacó, Level) y **el mismo defecto falló las tres**.

## Cuándo usar esta skill

- Un cliente **ya tenía su bot** corriendo en un workflow de n8n propio (con sus
  prompts, su persona, su historial) y hay que moverlo al CRM multi-tenant, donde
  el bot es UNO solo y cada tenant aporta su `bot_config`.
- El cliente "viejo" que entra al CRM por el flujo de alta nuevo.
- No aplica a un cliente nuevo sin bot previo: para eso está
  `onboarding-cliente-crm`.

## Lo primero: NO le pidas los prompts al cliente

Están en el JSON del workflow. Se sacan por API en 30 segundos y salen **exactos**
— pedirlos por chat trae una versión vieja, recortada o "la que él cree que es".

```bash
curl -sL -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_HOST/api/v1/workflows/<id>" -o wf.json
# Los prompts viven en:
#   Information Extractor → parameters.options.systemPromptTemplate   (router)
#   AI Agent - <X>        → parameters.options.systemMessage          (principal / objeciones)
#   Information Extractor → parameters.inputSchema                    (schema del router)
```

Medido en Level: router 11.536 · principal **50.310** · objeciones 5.464 chars.

## Proceso

1. **Extraer los 3 prompts + el inputSchema** a
   `clients/<slug>/prompts/_compiled/{router,principal,objeciones}.txt`.
   Guardá también los `.raw.txt` sin tocar: son la evidencia de qué había antes.

2. **⚠️ ARREGLAR EL CONTRATO DEL ROUTER. Este es EL paso.** El prompt del cliente
   emite el nombre de SU bot como destino, y el CRM solo entiende tres valores:
   `AGENTE_PRINCIPAL`, `AGENTE_OBJECIONES`, `HANDOFF_HUMANO`.

   | Cliente | Emitía | Resultado sin el fix |
   |---|---|---|
   | Roberto | `ROBERTO` | router descartado |
   | Jacó | `PRINCIPAL` | router descartado |
   | Level | `LEO_PRINCIPAL` (×22) | router descartado |

   **Las dos formas de fallar, y son distintas:**
   - El guard de `Componer System Prompt` exige que el texto contenga los 3
     destinos. Si no, usa el `ROUTER_DEFAULT` **de Momentum** — y tu fisioterapeuta
     rutea con reglas de "aceptó la DEMO" y "corre ads". Falla en silencio.
   - Si forzaras el paso, el `Switch — Destino Router` **descarta el turno**: un
     destino fuera del contrato deja el bot **mudo**, no degradado. El BACKUP solo
     dispara cuando `destino` **no existe**, no cuando trae basura.

   El fix es un `sed` global, y **hay que probar que es lo único que cambió**:
   ```bash
   sed 's/LEO_PRINCIPAL/AGENTE_PRINCIPAL/g' router.raw.txt > router.txt
   # neutralizá la palabra en los dos lados: el diff debe salir VACÍO
   diff <(sed 's/AGENTE_PRINCIPAL/X/g' router.txt) <(sed 's/LEO_PRINCIPAL/X/g' router.raw.txt)
   ```

3. **Declarar `bot_config.router_fields`** con los campos del `datos_extraidos`
   del cliente. Sin esta llave el nodo emite el schema de Momentum y **los campos
   de su prompt son ficción** (medido en Roberto: de 21 campos declarados, el nodo
   podía emitir 3).

   **El TIPO importa y se saca leyendo el prompt, no adivinando.** En Level el
   prompt dice *"capital_mencionado: monto en numero entero de COLONES (**no
   string**)"*; declararlo `string` lo hacía llegar como `"10000000"`. Buscá en el
   prompt cada campo antes de tipearlo.

4. **Diffear las tools de los dos workflows.** Las tools son nodos del grafo y
   **no viajan con el prompt**. Si el prompt dice "usá la tool X" y el destino no
   la tiene, el bot promete algo que no puede hacer.
   ```bash
   node -e 'const w=require("./wf.json");for(const [f,c] of Object.entries(w.connections||{}))
     if(c.ai_tool) c.ai_tool.flat().forEach(t=>console.log(f,"→",t.node))'
   ```
   (Leo no usaba ninguna: el caso fácil. Verificalo, no lo asumas.)

5. **Cargar con MERGE, nunca reemplazando `bot_config` entero.** Un PATCH del
   objeto completo borra `media_prompts`, `counters_mode` y lo que haya. Leé,
   fusioná, escribí — y **verificá releyendo de la base** que los 3 prompts
   quedaron idénticos char a char.

6. **Actualizar `extractor_field_defs`** (los campos de la FICHA del lead, que son
   otros que los del router). Los que siembra el alta son genéricos —
   zona/presupuesto/urgencia— y no sirven para el rubro del cliente. Si la agency
   ya tiene leads, no los toques sin revisar; el script debe **abortar** si
   `count(leads) > 0`.

7. **Probar en el playground y verificar en la EJECUCIÓN, no en la respuesta.**
   Que el bot conteste con la persona correcta prueba el prompt PRINCIPAL. El
   router es otro nodo: puede seguir siendo el de Momentum y no se nota.
   ```bash
   # última ejecución del playground → output de "Componer System Prompt"
   # tiene que decir: router_source: tenant   y   router_schema_source: tenant
   ```
   Probá 4 turnos: saludo · dar el nombre (el caso que más se rutea mal) ·
   un dato con número (verifica el TIPO) · una objeción (verifica el 2º destino).

8. **Confirmar 0 escrituras**: el playground no debe crear leads, conversaciones
   ni mensajes.

## Gotchas (ya cometidos — no repetir)

- **`bot_enabled` es `true` por omisión.** El flujo lo calcula como
  `a.is_active AND COALESCE((settings->>'bot_enabled')::boolean, true)`. Una agency
  recién creada con `settings = {}` tiene el bot **ARMADO**: si el número ya está en
  `agency_channels`, contesta desde ese instante — con el prompt genérico y el
  router de Momentum. **Apagalo explícitamente ANTES de conectar el número.**
- **El playground EXIGE `bot_enabled = true`.** Para probar hay que prenderlo, así
  que el orden seguro es: cargar prompts → prender → probar → apagar → que el
  founder decida el go-live.
- **El `+` en `agency_channels.phone_number` no rompe nada** — las 4 rutas
  (webhook entrante, `Resolve Agency`, envío saliente, aviso de handoff) normalizan
  a dígitos. Verificalo en el código antes de "arreglarlo": es un falso positivo
  que cuesta media hora.
- **No todo lo que está bajo la llave `router` es un router.** El de Jacó es un
  filtro pre-bot con otro schema. Leé qué EMITE antes de darlo por bueno.
- **Si el cliente traía plantillas de WhatsApp**, están en SU WABA y hay que
  filtrar del lado nuestro: el `?wabaId=` de YCloud **no filtra** y devuelve las de
  toda la cuenta. Y revisá que exista `aviso_handoff` en esa WABA, o el handoff no
  avisa a nadie.

## Output esperado

El bot del cliente respondiendo con **su** persona en `/a/<slug>/probar-bot`, con
`router_source=tenant` confirmado en los datos de la ejecución, sus campos propios
saliendo con el tipo correcto, 0 escrituras en el CRM, y el workflow viejo
**apagado** para que no queden dos sistemas.

## Ejemplo

**Input:** "Level ya tenía su bot (Leo) en n8n. Pasalo a la plataforma."

**Output:** 3 prompts extraídos del workflow · `LEO_PRINCIPAL` → `AGENTE_PRINCIPAL`
(22 ocurrencias, diff vacío al neutralizar) · 10 `router_fields` con
`capital_mencionado` como **number** · cargados con merge y releídos char a char ·
playground respondiendo *"Hola Soy Leo, asesor financiero de Level"*, memoria
multi-turno y objeciones con datos reales · `router_source: tenant` verificado en la
ejecución · 0 leads/conversaciones/mensajes creados.

## Relacionadas

[[onboarding-cliente-crm]] · [[verificar-funcionamiento-end-to-end]] ·
[[config-por-tenant-no-literal-en-el-flujo]] · [[workflow-n8n-activo-sin-recibir]] ·
[[jsonb-config-save-no-pisar-campos-ajenos]]
