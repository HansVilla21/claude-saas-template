# Skill: Onboarding Cliente CRM (Momentum)

> Capturada 2026-06-22 del alta del primer cliente externo (Roberto, fisioterapeuta).
> Convierte el alta de un cliente nuevo de "una sesión entera" a ~30 min reusando scripts.

## Cuándo usar esta skill

- Hay que dar de alta un **cliente/tenant nuevo** (una "agency") en el CRM `crm-v2`.
- Crear su espacio + usuarios + bot + sección "Probar bot" para que el cliente lo pruebe.
- El multi-tenant es por `agency_id` con RLS; casi nada se duplica, todo es data en la DB.

## Proceso

1. **Recoger los datos del cliente.** Nombre del negocio, slug (`a-z0-9-`), industria
   (`fisio`/`inmobiliaria`/`saas`/`otra`), owner (nombre + email — o login temporal si no
   hay email), equipo (nombres + roles), número de WhatsApp (opcional), y **los prompts del
   bot** (los trae el cliente/founder; van a `clients/<slug>/prompts/`).

2. **Provisionar el tenant.** Duplicar `crm-v2/scripts/provision-roberto-fisio.js` y ajustar
   datos. Crea (vía Auth Admin + REST, service_role): usuario owner (login temporal:
   `email_confirm=true` + pass generado al vuelo, **sin enviar correo**) + `agencies`
   (industria, sin número) + `agency_memberships` (owner + Hans admin) + `pipeline_stages`
   (funnel del nicho) + `extractor_field_defs` (campos que captura el bot). **El alta NO
   siembra funnel/campos/módulos automático** — hay que sembrarlos. **Verificar login REAL**
   (POST `/token?grant_type=password` → `access_token`), no solo que la fila exista.

3. **Compilar + cargar los prompts del bot.** Extraer el system prompt de cada `.md` a
   `clients/<slug>/prompts/_compiled/*.txt`, y cargarlos con `load-roberto-prompts.js` a
   **`agencies.bot_config.agent_prompts.{router,principal,objeciones}`**.
   ⚠️ **GOTCHA #1 (costó iteraciones): la llave es `agent_prompts`, NO `prompts`.** El
   workflow n8n `bot-test-playground` (id `dxZTZdwzyIcimZv0`) lee `bot_config.agent_prompts.*`;
   el Agente Principal tiene fallback al nodo "Componer System Prompt" (que lee
   `custom_instructions`), por eso si cargás mal la llave responde un bot genérico, no el real.

4. **Probar el bot (e2e).** El playground `/a/<slug>/probar-bot` (server action proxy al
   webhook n8n, resuelve por `agency_id`, **0 escrituras en el CRM**) debe responder con la
   persona del cliente. Verificar en prod: login del owner → saludo del bot real → memoria
   multi-turno → confirmar en la DB que NO se crearon leads/conversaciones/mensajes.
   Requiere `N8N_TEST_WEBHOOK_URL` + `BOT_TEST_SECRET` en Vercel (prod).

5. **Dar de alta el equipo.** Duplicar `provision-roberto-team.js` (login temporal, rol
   admin/agent) **o** invitar por correo (`inviteMember` desde `settings/equipo`, ahora que
   la config de auth está arreglada — ver gotcha #4).

6. **(Opcional) Conectar WhatsApp de producción.** Insertar en `agency_channels`
   (`channel='whatsapp'`, `provider='ycloud'`, `phone_number` E.164 sin `+`). El bot de prod
   resuelve la agency por ese número.
   **Verificar el número contra la API de YCloud, NO contra lo que diga un handoff**
   (`GET api.ycloud.com/v2/whatsapp/phoneNumbers`, header `X-API-Key`): da el `wabaId`, el
   `verifiedName` y el estado `CONNECTED`. En 2026-08-17 un handoff de 6 días antes citaba un
   número de Roberto que **ya no existía en la cuenta**.
   - Los **webhooks de YCloud son por CUENTA, no por número** (`GET /v2/webhookEndpoints`): si el
     tenant anterior ya funciona, el número nuevo queda cubierto solo. No hay nada que configurar.
   - **Las plantillas se aprueban por WABA**, y cada cliente trae el suyo. Chequear
     `GET /v2/whatsapp/templates?wabaId=<waba>` **antes** de prometer el aviso de handoff: sin
     `aviso_handoff` en APPROVED no hay notificación proactiva posible (fuera de la ventana de 24h
     Meta solo acepta plantilla).
   - **Cargar el teléfono del staff** (`users.phone`) de quien recibe el handoff. `notify-agent-whatsapp`
     resuelve el destinatario por ahí; sin él responde `skipped: no_phone`, lo loguea en
     `wa_notification_log` y **el lead queda esperando a alguien que nunca se enteró**. Si el bot del
     cliente cierra escalando ("en un momento te coordinamos"), esto no es un extra: es el último
     paso de su embudo.
   - Poner `settings.bot_enabled = true` **explícito**. El flow lo da por `true` cuando falta
     (`COALESCE(...,true)`), así que un `settings` vacío funciona pero deja la UI diciendo una cosa
     y el bot haciendo otra.

## Gotchas (errores ya cometidos — no repetir)

- **#-2 El nodo `Router` NO era config-driven, y el destino es un contrato duro.** (Descubierto
  2026-08-17 conectando a Roberto; arreglado en los dos workflows.) `Agente Principal` y `Agente
  Objeciones` leen `bot_config.agent_prompts.*`; **el `Router` tenía el clasificador de Momentum
  escrito a mano**, así que los prompts de router de todos los clientes **nunca se ejecutaron** y un
  fisioterapeuta ruteaba con reglas de "aceptó la DEMO" / "corre ads". Medido con el mismo mensaje en
  los dos routers: *"dolor agudo insoportable, no puedo ni moverme"* → con el del tenant
  **HANDOFF_HUMANO** ("alarma médica"), con el default **AGENTE_PRINCIPAL** ("no es relevante para
  calificación comercial"). Hoy el prompt del tenant se usa **solo si declara el contrato**: la
  palabra `destino` + los 3 destinos válidos (`AGENTE_PRINCIPAL`, `AGENTE_OBJECIONES`,
  `HANDOFF_HUMANO`).
  **Dos cosas que hay que saber al dar de alta un cliente:**
  1. **El prompt del router del cliente DEBE emitir `AGENTE_PRINCIPAL`**, no el nombre de su bot. El
     `Switch — Destino Router` **descarta el turno** si `destino` trae un valor desconocido — el
     BACKUP solo dispara cuando `destino` **no existe**. Un destino fuera del contrato = **bot mudo**,
     no bot degradado. (Roberto emitía `ROBERTO`; Jacó declaraba `PRINCIPAL`.)
  2. **No todo lo que está bajo la llave `router` es un router.** El de Jacó es un *filtro pre-bot*
     con otro schema (`tipo_mensaje`, `debe_continuar_bot`). Antes de dar por bueno un prompt heredado,
     leer qué emite — no asumirlo por el nombre de la llave.
  El script `crm-v2/scripts/build-router-config-driven-v1.js` es idempotente, deja snapshot y verifica
  por hash contra el n8n vivo (incluido que el default embebido sea idéntico char a char al literal
  anterior).

- **#-1 El playground y el bot de PRODUCCIÓN son workflows DISTINTOS y se desincronizan.**
  `bot-test-playground` (`dxZTZdwzyIcimZv0`) y `bot-c-v1` (`Jsh4krhC9HRUh7Ly`) leen el MISMO
  `bot_config`, así que un prompt nuevo aparece en los dos al instante — pero las **tools son
  nodos del grafo** y no viajan solas. Verificado 2026-08-10 al conectar el número de Jacó: el
  playground tenía la `Catalog Search Tool` desde el 06/08, producción no la había recibido
  nunca (sin cambios desde el 29/06). El prompt del cliente ya decía *"OBLIGATORIO usar la
  Catalog Search Tool"* → **en el playground el bot daba datos reales del catálogo y en
  producción los describía de memoria**. Probar solo en "Probar bot" NO prueba producción.
  **Antes de dar por conectado un número, diffear las tools de los dos workflows:**
  ```bash
  # por cada workflow: qué nodos están conectados como ai_tool
  curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" "$HOST/api/v1/workflows/<id>" \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const w=JSON.parse(d);
        for(const [f,c] of Object.entries(w.connections||{}))
          if(c.ai_tool) c.ai_tool.flat().forEach(t=>console.log(f,"→",t.node))})'
  ```
  El port se hace **copiando el nodo** del workflow donde ya funciona (nunca reescribiéndolo):
  ver `crm-v2/scripts/build-bot-c-v1-set30-catalog-tool.js` — valida que las referencias
  `$('Nodo')` existan en el destino, deja snapshot, es idempotente y verifica releyendo del
  n8n vivo que los parámetros queden **idénticos por hash** a los de la fuente.

- **#0 El playground "Probar bot" SÍ requiere `settings.bot_enabled=true`.** (Corrige una nota vieja que decía lo contrario.) Con `bot_enabled=false` el workflow `bot-test-playground` responde `{"ok":false,"error":"not_configured"}` y la UI muestra "no configurado", aunque `bot_config.agent_prompts` esté completo. Verificado 2026-07-14 con Jacó Dream Rentals: mismo bot_config → `not_configured` con el flag en false, respondió bien apenas se puso en true. Es seguro prenderlo aunque el cliente "no quiera bot en prod": el bot de producción resuelve por número en `agency_channels`, así que **sin número conectado el bot de prod NO dispara** — solo se habilita el playground. Además la config debe tener los **3 agentes** (`router,principal,objeciones`) en `agent_prompts`; si el cliente no tiene objeciones, cargar un stub (rara vez se dispara: el switch cae a principal por defecto).
- **#1 `bot_config.agent_prompts`, NO `prompts`** (ver paso 3). El más caro.
- **#2 NO duplicar workflows n8n por cliente.** El playground (`bot-test-playground`) y el bot
  de prod ya son dinámicos por `agency_id` → cliente nuevo = data en `bot_config`, no un
  workflow nuevo. (Antes de buildear, `git branch -a`: la feature puede ya existir.)
- **#3 Login temporal = email nuestro** (`<persona>@momentum-lab-ai.com`). Cambiarlo al email
  real del cliente cuando lo dé, para que pueda hacer reset solo.
- **#4 Invitaciones por correo:** la config de Supabase Auth debe usar **token_hash →
  `/auth/confirm`** (no PKCE/`ConfirmationURL` → `/auth/callback`, que rompe en invites
  admin-iniciados con "No se pudo confirmar la sesión") y el `uri_allow_list` debe incluir el
  wildcard del dominio. Templates en `crm-v2/supabase/email-templates/`; aplicar a la config
  viva vía Management API (`PATCH /v1/projects/<ref>/config/auth`).
- **#5 Verificar contra la fuente de verdad** en cada capa (login token 200, bot real
  respondiendo, 0 escrituras). "Se creó la fila" ≠ "funciona".

## Output esperado

Tenant funcional **en producción**: espacio + login(s) + funnel + campos + bot real probable
en `/a/<slug>/probar-bot` + equipo dado de alta. Credenciales temporales entregables. Todo
verificado e2e en prod.

## Ejemplo

**Input:** "Cliente nuevo Roberto, fisioterapeuta, sin número. Acá están sus prompts."

**Output:** agency `roberto` (`db2ccbc7-…`, industria fisio) + login owner + funnel
(Nuevo→En conversación→Cita agendada→Paciente→Descartado) + 6 campos de captura + 3 prompts en
`bot_config.agent_prompts` + "Probar bot" vivo (saludo "soy Roberto Venegas…", memoria,
objeciones LAARC, 0 escrituras) + equipo (2 admins). Verificado e2e en
`crm.momentum-lab-ai.com`. Scripts: `provision-roberto-fisio.js`, `load-roberto-prompts.js`,
`provision-roberto-team.js`.
