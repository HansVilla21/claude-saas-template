# Skill: Ficha de Contacto Full-Page con Pestañas (reusando el inbox)

## Cuándo usar esta skill

- Construir una pantalla de detalle de contacto/lead `/leads/[id]` (o `/contactos/[id]`) en un CRM multi-tenant (Next.js App Router), con pestañas, reusando piezas del inbox ya construido.
- Convertir un panel lateral de lead (drawer del inbox) en una vista dedicada full-page con URL propia.

## Por qué existe esta skill

El inbox ya tiene casi todo: edición de estado/calificado/asignado con **procedencia** (bot/humano), insights de tiempos, render de mensajes, editor de etiquetas. Una ficha "nivel Dios" NO se reconstruye desde cero: es una vista full-page que **reusa** esas piezas + agrega Conversación y Actividad. Reinventar = perder casos sutiles (procedencia, realtime, optimismo). Regla: diff contra la fuente que funciona.

## Proceso

### 1. Route server component `/a/[slug]/leads/[id]/page.tsx`

- **Next 16: `params` y `searchParams` son async** → `const { id, slug } = await params`.
- Resolver agency por slug → fetch del lead por id con **`deleted_at is null`**; si no existe → `notFound()` (no crash).
- Traer en el mismo patrón de queries del inbox: conversación(es) + mensajes (de la más reciente, `created_at asc`), tags asignadas + catálogo `agency_tags`, `pipeline_stages`, members, y (para Insights) `extractor_field_defs` activos + `extractor_field_values` del lead.
- Mapear a view models (reusar `toInboxLead`, `toInboxMessage`, etc.) y pasar al client shell.

### 2. Client shell con pestañas + header canónico

- Header: identidad (avatar/nombre/teléfono/email) + acciones (`tel:` / `wa.me` / `mailto:`) + los **4 controles canónicos (Estado / Calificado / Asignado / Fuente) con procedencia, editables, ARRIBA**. NO los dupliques dentro de la pestaña Info (una sola fuente de verdad; Info pone una nota apuntando a la cabecera).
- Pestañas: **Info · Conversación · Insights · Notas · Actividad**. Cambio de pestaña instantáneo (sin animación — se ve decenas de veces).

### 3. Contenido de cada pestaña (reusar)

- **Info:** score editable, etiquetas EDITABLES (catálogo `agency_tags`), datos, `bot_summary`, `extra` (jsonb) legible key/value.
- **Conversación:** hilo read-only (reusar `MessageBubble` + `DateSeparator`) + botón "Responder en el inbox" (ver deep-link).
- **Insights:** el panel de inteligencia (ver skill de Insights / reusar `insights-tab` + `response-time.ts`).
- **Notas:** editor del campo `notes` (autosave debounced). El "historial de notas con procedencia" necesita tabla `lead_notes` (item aparte).
- **Actividad:** timeline (ver gotcha audit_log).

### 4. Edición inline optimista + procedencia humana

Hook tipo `use-contact-edit`: update optimista en estado local + escribir a Supabase (RLS permite a members) con procedencia `*_set_by='human'`, `*_set_at`, `*_set_by_user`; rollback si falla. (Mismo patrón que `lead-panel.tsx` del inbox.)

### 5. Deep-link a la conversación en el inbox (aditivo, no reestructurar)

El inbox usa `initialSelectedConversationId`. Agregar soporte **aditivo** de `?conv=<id>`: si viene y la conversación está en la lista, abrirla; si no, fallback al comportamiento previo (la más reciente). El botón navega a `/a/<slug>/inbox?conv=<convId>`.

### 6. Realtime (ideal)

Suscribirse al canal `agency:<id>` (contrato migración 0008) y reconciliar `leads` (**INSERT + UPDATE + soft-delete**) y `tag_assignments` (refetch) para este lead, **sin pisar ediciones en curso**.

## Output esperado

1. `/a/[slug]/leads/[id]` con 5 pestañas, carga datos reales, `notFound()` en id inexistente.
2. Controles canónicos en el header, editables con procedencia, persistiendo.
3. Conversación read-only + deep-link funcional al inbox.
4. 0 errores de consola, responsive 375px↔desktop, `tsc`/`eslint` limpios.

## Ejemplo concreto (Momentum CRM v2, funcionando 2026-05-29)

`/a/demo/leads/<uuid>` (Mariana, Ganado): header con Estado/Calificado/Asignado/Fuente + procedencia "Por Tú · fecha"; Info con score + etiqueta editable + `extra`; Conversación con el hilo + "Responder en el inbox" abriendo `?conv=`; Insights con el panel de inteligencia; Notas con autosave; Actividad con timeline derivado. Cambiar etapa persistió con procedencia humana tras reload.

## Gotchas / antipattern

- **Next 16:** `params`/`searchParams` async — `await` obligatorio.
- **`deleted_at is null` + `notFound()`** — no mostrar contactos borrados ni crashear con id inválido.
- **`audit_log` existe pero NO se puebla** (ningún trigger lo llena) → la pestaña Actividad **deriva** el timeline de señales reales (`*_set_at/_by`, creación, recencia). Si en el futuro se puebla, esas filas se mezclan. Nunca dejar la pestaña vacía-fea ni que crashee.
- **"Asignado" en Contactos = dueño del lead (`leads.assigned_user_id`)**, distinto del encargado de la conversación del inbox (`conversations.assigned_user_id`). No los confundas.
- **NO reestructurar el inbox** para el deep-link — soporte aditivo de `?conv=`.
- **NO duplicar** los controles canónicos en header y en Info.
- **CORE/agnóstico de nicho:** nada de campos inmobiliarios (interés/presupuesto) — eso va por módulos.

## Skills relacionadas

- `crm-inbox-conv-list-filters-strip` — la lista/filtros del inbox que comparte patrones.
- `inbox-message-bubble-render` — render del hilo de mensajes.
- `supabase-realtime-broadcast-pattern` — realtime por agency (handler leads INSERT+UPDATE).
- `outbound-delivery-server-action` — para responder desde el inbox enlazado.

## Memoria global del founder (relacionada)

- `diff-against-working-source-when-porting` — reusar las piezas del inbox, no reinventar.
- `feedback_diseno_diferenciador_no_ai_slop` — mantener el design system "editorial cálido".
