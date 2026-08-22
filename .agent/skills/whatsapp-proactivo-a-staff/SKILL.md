# Skill: WhatsApp proactivo a staff (por evento de la DB)

Mandar un WhatsApp **proactivo** a gente interna (agentes/equipo) cuando pasa un
evento en la base — el caso canónico es un **handoff** (el bot pide humano) — sin
que esa persona haya abierto ventana de 24h con el número del negocio.

## Cuándo usar esta skill

- Querés avisarle por WhatsApp a un agente/staff cuando ocurre algo en la DB
  (handoff, lead nuevo, ventana por cerrarse, asignación, SLA vencido, etc.).
- El destinatario es **staff interno** (da consentimiento como empleado), no un
  lead frío al que no podés spamear.
- Ya existe una fila/tabla que representa el evento y "a quién avisarle"
  (ej. `public.notifications` de un centro in-app). Idealmente colgate de ella
  para no duplicar el targeting.

## Regla madre (por qué esto es posible)

Un WhatsApp **proactivo** fuera de la ventana de 24h **solo** se puede mandar con
una **plantilla aprobada por Meta** (categoría **Utility** = la más barata). No se
puede texto libre. La plantilla es el permiso de Meta para iniciar en frío — el
mismo mecanismo del "tu código es 1234" de un banco.

## Proceso

1. **Elegí la fuente del evento.** Preferí colgarte de una fila que YA se crea y
   YA sabe a quién avisar (ej. `notifications` type `handoff_pending`, que ya hace
   el fan-out asignado/pool). Así reusás el targeting en vez de duplicarlo. El
   disparo tiene que vivir a **nivel base de datos** si el evento lo escribe n8n/
   otro servicio directo en Postgres (no pasa por tu app).

2. **Tabla de log + anti-spam.** Creá `wa_notification_log` (agency_id, user_id,
   conversation_id, type, status, error_code, created_at) con RLS **deny-all**
   (solo service_role escribe) + índice `(user_id, conversation_id, type,
   created_at desc)`. Doble propósito: cooldown (no reenviar al mismo
   (user, conv, type) en <N min) y observabilidad.

3. **Edge Function** (`notify-agent-whatsapp`): recibe `{ notification_id }` +
   header `x-dispatch-secret`. Pasos: valida secret → lee la fila canónica
   (service_role) → cooldown contra el log → resuelve teléfono del destinatario
   (`users.phone`) → número del negocio (`agency_channels.phone_number`) →
   datos para el mensaje (ej. lead: `conversations.lead_id → leads`) → registra
   `queued` → manda la plantilla a YCloud → registra `sent`/`failed`.
   **Degradación total: nunca 5xx.** Todo camino loguea y responde 200 (patrón de
   `ycloud-webhook`). Auth por secret compartido (no un endpoint público útil).

4. **Trigger de dispatch.** `AFTER INSERT ... WHEN (new.type = '<evento>')` que
   llama a la función con `net.http_post` (pg_net). La **URL y el secret salen de
   Vault** (`vault.create_secret` out-of-band, nunca hardcodeados en la
   migración). El trigger es `security definer`; **revocá EXECUTE a anon/
   authenticated** (advisor 0028: una función SECURITY DEFINER queda invocable por
   REST; el trigger la corre igual sin ese grant). Blindá con `exception when
   others then return new` — el aviso jamás debe abortar el INSERT del evento.

5. **Config/secretos.** En la función: `WA_DISPATCH_SECRET` (= el de Vault),
   `YCLOUD_API_KEY`, `WA_TEMPLATE_<X>_NAME`, `WA_TEMPLATE_LANG`. Los setea el
   founder en el dashboard (no hay tool para setear secrets de función). El nombre
   de plantilla va como env, no hardcodeado.

6. **Plantilla en YCloud/Meta.** Body con las variables que rellena la función +
   botón URL dinámico. Aprobación de minutos a ~1 día. Ver Gotchas.

7. **Teléfono del staff.** Cada persona carga su número en su perfil
   (`users.phone`). Sin número → `no_phone` en el log, sin WhatsApp, pero la
   campanita in-app sigue. El guardado del perfil DEBE ser server action, no
   update client-side (ver Gotcha del guardado silencioso).

8. **Verificá e2e contra la fuente de verdad.** No basta `sent` en el log
   (= YCloud aceptó). El juez es el celular: mandá un handoff real a un número de
   prueba y **confirmá que el WhatsApp llega**. Probá también cooldown (2º evento
   <N min → `skipped_cooldown`) y degradación (sin teléfono → `no_phone`). pg_net
   es async: verificá el disparo en `net._http_response`.

## Gotchas (los que ya nos costaron)

- **La plantilla NO puede empezar NI terminar con una variable.** Meta lo rechaza
  ("Variables cannot be placed at the start or end"). Rodeá cada `{{n}}` con texto
  fijo — ej. cerrá con una línea "Entrá para atenderlo 👇".
- **Las "variables con nombre" del editor de YCloud son cosméticas** → por debajo
  la plantilla es POSICIONAL. El envío manda `parameters: [{type:'text', text}]`
  en orden, sin `parameter_name`. (Confirmado: la doc de YCloud solo documenta
  posicional.)
- **Menos variables = menos fricción.** Lo que es igual para todos los tenants
  (ej. el nombre del producto "Momentum CRM") va como **texto fijo** del template,
  no como variable. Solo hacé variable lo que cambia por mensaje (nombre agente,
  nombre/teléfono del lead, y el sufijo del deep-link).
- **Botón URL dinámico en multi-tenant de un solo dominio:** base fija
  `https://<dominio>/a/{{1}}` + la función manda el sufijo `<slug>/inbox?conv=<id>`.
  Una sola plantilla sirve para TODAS las agencias (cambia solo el sufijo).
- **Ventana de 24h ≠ plantilla.** El texto libre necesita ventana abierta; la
  plantilla no. Son caminos distintos — no confundir con el envío del inbox.
- **Guardado del teléfono en el perfil que "guarda" pero no persiste:** si el
  update es client-side (`@/lib/supabase/client`) y la sesión del browser no
  resuelve `auth.uid()`, el UPDATE afecta 0 filas y supabase-js NO devuelve error
  → "✓ Guardado" mentiroso. Fix: server action con auth server-side + escritura
  garantizada (ver skill `rls-write-bloqueada-por-policy-desalineada` y el patrón
  de `outbound-delivery-server-action`).
- **Costo del fan-out a pool:** cada plantilla utility es facturable; un handoff
  sin asignar avisa a N agentes = N mensajes. El cooldown corta rebotes, pero si
  el volumen crece, considerá limitar el pool a owner/admin.
- **⚠️ El endpoint `?wabaId=` de YCloud IGNORA el filtro** (agregado 2026-08-18).
  Devuelve las plantillas de **toda la cuenta**, no las del WABA que pediste. En
  multi-tenant eso hace que veas la plantilla de OTRO cliente y concluyas que el
  tuyo ya la tiene. Pasó: se reportó `aviso_handoff` como existente en el WABA de
  un cliente nuevo, era falsa, y el aviso murió esa noche con `ycloud_403`.
  **Verificá el campo `wabaId` de cada plantilla en la respuesta**, no confíes en
  el query param. Regla general: si un filtro de una API de tercero no está
  probado, tratá la respuesta como sin filtrar.
- **Parámetros fantasma** (agregado 2026-08-18): el nodo que notifica mandaba
  `send_lead_message` en el payload a la Edge Function, y la función **nunca lo
  lee**. El campo existía, se seteaba, se revisaba en code review — y no hacía
  nada. Antes de confiar en un flag del payload, **buscá su lector**: si nadie lo
  referencia del otro lado, el comportamiento que creés configurado no existe.
  (Mismo modo de fallo que las llaves de config sin consumidor — ver
  `config-por-tenant-no-literal-en-el-flujo`.)

## Output esperado

- Migración: `wa_notification_log` (+ RLS) · trigger `dispatch_wa_notification`
  (pg_net + Vault, EXECUTE revocado a anon).
- Edge Function `notify-agent-whatsapp` deployada (verify_jwt off, auth por
  secret).
- Plantilla YCloud aprobada + secretos en la función.
- Campo teléfono en el perfil (server action).
- Verificación e2e: WhatsApp real recibido + cooldown + degradación en el log.

## Ejemplo

**Input:**
"Cuando el bot hace handoff quiero que al agente le llegue un WhatsApp con el
nombre y teléfono del cliente, sin tener que abrir el CRM."

**Output:**
Trigger sobre la fila `notifications` (handoff_pending) → Edge Function que
resuelve agente + lead + número del negocio y manda la plantilla `aviso_handoff`:

> Hola {{agente}}, un cliente necesita tu atención en *Momentum CRM*
> 👤 *Cliente:* {{lead_nombre}}
> 📞 *Teléfono:* {{lead_telefono}}
> Entrá para atenderlo 👇
> [ Abrir conversación ] → /a/<slug>/inbox?conv=<id>

Verificado e2e: el WhatsApp llegó con datos de lead real, el 2º handoff <10 min
quedó `skipped_cooldown`, y un agente sin teléfono quedó `no_phone` sin romper
nada.

## Skills relacionadas

`ycloud-webhook-to-supabase` (recibir de YCloud) · `supabase-edge-function-secret-auth`
(auth por secret) · `whatsapp-image-delivery-ycloud` (formato de media YCloud) ·
`outbound-delivery-server-action` (envío saliente confiable) ·
`rls-write-bloqueada-por-policy-desalineada` (writes user-bound que fallan
silencioso) · `probar-migracion-contra-base-viva-con-rollback` (verificar en prod).
