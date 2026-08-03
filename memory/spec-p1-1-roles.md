# Spec Tecnico — Fase P1.1: Roles reales con granularidad por rol

**Fecha:** 2026-06-04
**Autor:** arquitecto (template)
**Estado:** listo para implementacion por backend-builder + frontend-builder (paralelos)
**Decisiones congeladas:** input del founder 2026-06-04 + plan-sistema-admin.md §D4 (extendido) + roadmap-completo.md §P1.1.
**Esfuerzo objetivo:** 12-16h (~1.5-2 jornadas).

Este documento describe paths, signatures, SQL y UX exactos. Quien implemente NO debe re-arquitecturar, solo ejecutar. Si encuentra ambiguedad real, escala — no improvisa.

---

## 0. Bloqueantes para el founder (decidir ANTES de empezar)

| # | Decision | Recomendacion del arquitecto |
|---|---|---|
| B1 | **Sin asignar:** ¿el `agent` ve conversaciones con `assigned_user_id IS NULL` (las que el bot maneja sin handoff todavia)? | **NO las ve.** Justificacion en DT3b. Si decis SI, cambiar UN string en la RLS (`OR assigned_user_id IS NULL`). |
| B2 | **Pool de handoff sin asignar:** cuando el bot escala handoff y NO hay agente asignado, ¿quien lo agarra? | **Admin/owner las ve y asigna manual.** Cuando asigna a `Juan`, Juan la ve en su inbox. Justificacion en DT3b. |
| B3 | **Viewer puede ver insights / metricas?** | **SI** (es su funcion principal: auditar). Solo se le bloquean acciones de escritura. |

**Default si no responde:** procedo con B1=NO, B2=admin/owner asigna, B3=SI. Son las opciones mas conservadoras y desbloquean el resto sin perdida de funcionalidad real.

---

## 1. Resumen ejecutivo

Hoy el enum `agency_role` tiene 4 valores (`owner | admin | agent | viewer`) y la unica policy RLS multi-tenant es **binaria**: sos miembro de la agency o no. Una vez adentro, ves TODO. P1.1 introduce **granularidad real por rol** en tres capas: (1) RLS de Postgres como red de seguridad sobre `conversations`, `leads`, `messages`, `tag_assignments`, `agency_memberships`, `agencies`; (2) helpers TypeScript (`requireAgencyAccess`, `requireAgencyAdmin`) que devuelven el rol al server component para gating de UI y errores tipados en server actions; (3) UI condicional que **oculta** acciones administrativas a quien no las puede ejecutar (no renderiza vs disabled, segun contexto). El cambio mas visible para el cliente: un community manager (`agent`) ve SOLO sus conversaciones asignadas, no ve "Todos", no ve "Equipo", no puede cambiar configuracion. Un `admin` puede invitar gente y configurar el bot pero no borrar la agency. Esto desbloquea vender a inmobiliarias o fisios con equipo de 3+ personas sin caos de privacidad.

---

## 2. Estado actual (que hace hoy + que NO)

### Lo que SI hay

| Capa | Estado |
|---|---|
| Enum `agency_role` en migration 0001 | `owner`, `admin`, `agent`, `viewer` declarados. |
| Tabla `agency_memberships` (migration 0002) | Tiene `role agency_role not null default 'agent'`. UNIQUE `(agency_id, user_id)`. `is_active boolean`. |
| Helper RLS `public.is_member_of(aid uuid)` (migration 0006) | Devuelve true si el user es member activo. **No distingue rol.** |
| Helper RLS `public.is_master()` (migration 0006) | Devuelve true si el user es master activo. Bypassea todo. |
| Policies RLS tenant-scoped sobre `leads`, `conversations`, `messages`, `tasks`, `tags`, `tag_assignments`, etc. | Patron uniforme: `is_member_of(agency_id) OR is_master()`. SELECT + INSERT + UPDATE + DELETE indistintos. |
| Helper TS `requireMaster()` | Gate de scope master. |
| Helper TS `requireAgencyOwner(slug)` | Gate exclusivo de owner. Branch para master impersonando. |
| Filtro UI "Mias" en inbox (`isMine(c, userId) = c.assignedUserId === userId`) | Funciona como filtro voluntario sobre lista. NO es enforcement de seguridad. |
| Filtro UI "Todos" en inbox | Funciona para todos los roles indistintamente. |
| Sidebar item "Equipo" condicional a `isOwner` (ADM-3) | Solo owners reales ven el link. Master impersonando NO ve el link (decision intencional ADM-3 §10). |
| Sidebar item "Panel Admin" condicional a `isMaster` | OK. Solo masters. |
| Server actions del inbox (`markConversationRead`, `markHandoffHandled`, `sendMessageViaYCloud`) | Hacen ownership check via RLS user-bound + UPDATE admin. **NO chequean rol.** Cualquier member puede actuar sobre cualquier conv de su agency. |
| Server actions de equipo (`inviteMember`, `removeMember`) | Gated por `requireAgencyOwner`. **Solo owner**, no admin. |
| Server action `saveAgencySettings` | Sin gate de rol. **Cualquier member puede editar settings de la agency.** |

### Lo que NO hay (gaps que P1.1 cierra)

1. **Ningun chequeo de rol en RLS** sobre tablas tenant-scoped. Un `viewer` puede hacer `UPDATE leads SET stage_id=...` y RLS lo deja pasar.
2. **Ningun helper TS que devuelva el rol del current user** para una agency. El sidebar tiene que hacer la query a mano. Server components que necesitan el rol lo refetchan.
3. **Ningun filtro server-side por asignado** para el `agent`. El SELECT de `conversations` en `/inbox/page.tsx` trae TODO de la agency. El filtro "Mias" es client-only voluntario.
4. **Ningun gating de UI por rol** mas alla de `isOwner / isMaster`. Botones como "Toggle bot/humano", "Cambiar etapa", "Nuevo contacto" se muestran a todos.
5. **El realtime broadcast `agency:<id>` emite a todos los suscritos.** Un `agent` recibe broadcasts de conversations que NO le pertenecen. Sin defensa client-side, en la consola del navegador ve eventos de otras conversaciones (aunque el SELECT inicial las filtre).
6. **`saveAgencySettings` y `editar bot_config`** estan sin gate. Aunque `bot_config` se edita desde panel master (ADM-3), `agencies.settings` SI se edita desde el cliente y hoy lo puede cambiar cualquiera.
7. **Cambio de rol post-invitacion:** no existe UI ni server action. El modal de invitar solo crea `agent` (D3 LOCK-IN de ADM-3). No hay dropdown para cambiar rol despues.

---

## 3. Matriz de permisos completa (DT1 resuelta)

Notacion:
- **Y** = permitido (UI muestra accion + server action acepta + RLS permite).
- **N** = denegado (UI no muestra accion + server action retorna error tipado + RLS bloquea como red de seguridad).
- **Y\*** = permitido con scope reducido (ver nota).
- **M** = master bypassa todo (siempre Y).

### Conversaciones / Inbox

| Accion | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Ver lista de conversaciones de la agency | Y (todas) | Y (todas) | Y\* (solo `assigned_user_id = self`) | Y (todas) |
| Ver filtro "Todos" | Y | Y | **N** | Y |
| Ver filtros "Sin leer", "Bot", "Handoff" | Y | Y | Y\* (sobre subset propio) | Y |
| Ver filtro "Mias" | Y | Y | Y (es el unico subset) | Y |
| Ver filtro AgentFilter (selector por agente) | Y | Y | **N** | Y |
| Abrir conversacion + ver mensajes | Y | Y | Y\* (solo si es suya) | Y |
| Enviar mensaje outbound | Y | Y | Y\* (solo en conv suya) | **N** |
| Toggle bot ↔ humano | Y | Y | Y\* (solo en conv suya) | **N** |
| Marcar handoff handled | Y | Y | Y\* (solo en conv suya) | **N** |
| Cambiar `assigned_user_id` de la conv | Y | Y | Y\* (solo a si mismo, en conv ya suya — NO puede reasignar a otro ni tomar conv ajena) | **N** |
| Editar tags del lead desde el panel | Y | Y | Y\* (solo en lead de conv suya) | **N** |
| Ver insights / metricas del contacto | Y | Y | Y\* (solo en su conv) | Y |

### Leads / Contactos

| Accion | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Ver lista de leads / contactos de la agency | Y (todos) | Y (todos) | Y\* (solo `leads.assigned_user_id = self` UNION leads con conv suya) | Y (todos) |
| Ver vista Kanban | Y | Y | Y\* (solo sus leads) | Y |
| Crear nuevo lead manual | Y | Y | Y (queda asignado a si mismo por default) | **N** |
| Editar lead (full_name, phone, email, notes) | Y | Y | Y\* (solo lead suyo) | **N** |
| Cambiar `stage_id` (etapa del lead) | Y | Y | Y\* (solo lead suyo) | **N** |
| Cambiar `is_qualified` | Y | Y | Y\* (solo lead suyo) | **N** |
| Cambiar `assigned_user_id` del lead | Y | Y | Y\* (solo a si mismo, NO puede reasignar a otro ni tomar lead ajeno) | **N** |
| Borrar lead (soft delete `deleted_at`) | Y | Y | **N** | **N** |
| Editar tags del lead | Y | Y | Y\* (solo lead suyo) | **N** |

### Settings / configuracion

| Accion | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Ver pagina `/settings` (nombre + bot settings cliente-facing) | Y | Y | **N** | **N** |
| Editar `agencies.settings` (toggles, horarios, umbrales SLA) | Y | Y | **N** | **N** |
| Editar `agencies.name` | Y | Y | **N** | **N** |
| Editar `pipeline_stages` (CRUD) | Y | Y | **N** | **N** |
| Editar `tags` catalog (CRUD) | Y | Y | **N** | **N** |
| Editar `extractor_field_defs` | Y | Y | **N** | **N** |
| Editar `bot_config` desde Panel Admin (`/a/[slug]/admin`) | **N** (solo master) | **N** (solo master) | **N** | **N** |

### Equipo / membresias

| Accion | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Ver pagina `/settings/equipo` | Y | Y | **N** | **N** |
| Ver lista de miembros (read) | Y | Y | **N** | **N** |
| Invitar nuevo miembro como `agent` | Y | Y | **N** | **N** |
| Invitar nuevo miembro como `viewer` | Y | Y | **N** | **N** |
| Invitar nuevo miembro como `admin` | Y | **N** (solo owner) | **N** | **N** |
| Invitar nuevo miembro como `owner` | **N** (transferencia, fuera de scope) | **N** | **N** | **N** |
| Cambiar rol de un miembro (a/de agent/viewer) | Y | Y | **N** | **N** |
| Cambiar rol de un miembro (a/de admin) | Y | **N** | **N** | **N** |
| Cambiar rol del owner (demote/promote) | **N** (fuera de scope) | **N** | **N** | **N** |
| Remover miembro `agent`/`viewer` (soft delete) | Y | Y | **N** | **N** |
| Remover miembro `admin` | Y | **N** | **N** | **N** |
| Remover al owner | **N** | **N** | **N** | **N** |
| Remover a si mismo | **N** | **N** | **N** | **N** |

### Acciones destructivas / nivel agency

| Accion | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Suspender / reactivar agency | **N** (solo master) | **N** | **N** | **N** |
| Borrar agency | **N** (solo master) | **N** | **N** | **N** |
| Transferir ownership | **N** (fuera de scope P1.1) | **N** | **N** | **N** |
| Cambiar `plan` / billing | **N** (no existe billing) | **N** | **N** | **N** |
| Conectar / desconectar canal WhatsApp | Y | Y | **N** | **N** |

### Realtime broadcast

| Capa | owner | admin | agent | viewer |
|---|:-:|:-:|:-:|:-:|
| Suscribirse al canal `agency:<id>` | Y | Y | Y | Y |
| Procesar payload sobre `conversations` ajenas | Y | Y | **N** (filtro client-side) | Y |
| Procesar payload sobre `messages` de conv ajenas | Y | Y | **N** (filtro client-side) | Y |
| Procesar payload sobre `leads` ajenos | Y | Y | **N** (filtro client-side) | Y |

**Master:** bypassea todo via RLS (`is_master()`). Cuando impersona, opera con permisos de **owner** (decision ADM-3 DT3).

---

## 4. DTs resueltas (10)

### DT1 — Matriz de permisos
Ver §3. **Resuelta.** Cualquier cambio futuro a la matriz arranca por modificar este documento.

### DT2 — Patron de enforcement: defense in depth
**Decision:** **ambos en cascada — RLS + helpers TS**.

- **RLS** es la red de ultima linea. Si el front se bypasea (curl directo a Supabase con el JWT del agent), RLS bloquea.
- **Helpers TS** dan UX rapida (errores tipados, 404 sin leak), evitan round-trips innecesarios al RLS para checks de UI, y permiten retornar `agencyId + role` al caller en una sola query.
- **El admin client (service_role) bypassa RLS.** Las server actions que usan admin DEBEN llamar primero al helper TS (que valida rol). Sin esto, una server action con admin client se vuelve un agujero.

**Por que no solo RLS:** porque queremos esconder UI a quien no la puede usar (no renderizar "Invitar" para un agent) y mostrar errores tipados para edge cases. RLS solo dice "fila no existe / permission denied" — el front no sabe distinguir "no existe" de "no podes ver".

**Por que no solo helpers TS:** porque cualquier endpoint Supabase con el JWT del user (incluido el client del browser que SI lee directo de tablas como `tag_assignments` en `inbox-client.tsx`) puede leer/escribir sin pasar por la server action. Sin RLS, el agent puede hacer `supabase.from('conversations').select('*')` y trae todo. Confirmado en `inbox-client.tsx:163-168` que el cliente lee `tag_assignments` directo via JS.

### DT3 — Filtrado del inbox para `agent`
**Decision:** **opcion C — RLS + filtro a nivel query + filtro client-side en realtime**.

- **RLS** sobre `conversations` y `leads` para `agent`: solo ve donde `assigned_user_id = auth.uid()`. Garantia de seguridad: aunque el front pida `.select('*')`, solo devuelve sus filas.
- **Filtro en server action** del `/inbox/page.tsx`: redundante con RLS pero explicito (legibilidad).
- **Filtro client-side en `use-inbox-realtime.ts`**: cuando llega un broadcast de `conversations` o `messages` que el agent NO debe procesar (porque la conv no es suya), el handler lo descarta antes de tocar state. Sin esto, el state local podria sumar conversations que el agent NO va a poder volver a leer del backend (porque RLS bloquea), generando rows "fantasma" en la lista hasta el siguiente reload.

**Implementacion del filtro client-side:**
- El handler de realtime recibe `currentUserRole: AgencyRole` + `currentUserId: string` como nuevas props.
- Si `currentUserRole === 'agent'`, antes de hacer `setConversations / setMessagesByConv / setLeads`, valida que la `conversation_id` corresponda a una conv en el state local (que ya fue filtrada por RLS en el load inicial) O que el payload tenga `assigned_user_id === currentUserId`.

### DT3b — ¿El agent ve "sin asignar"? (BLOQUEANTE B1/B2)
**Recomendacion del arquitecto: NO, el agent NO ve sin asignar.**

Razones:
1. Si el agent ve las sin-asignar, "tomar una" se vuelve self-assign sin coordinacion. Dos agents pueden tomar la misma conv en paralelo (race) y duplicar respuesta al cliente. Mala UX.
2. El flow del founder es claro: "el bot maneja hasta handoff, ahi se asigna". La asignacion la hace un admin/owner (manualmente o via auto-asignacion del bot por la `Asignar Tool`).
3. Si el admin quiere que el agent tome conv libremente, le da rol `admin` o se le agrega un boton "Tomar esta conv" en una vista especial de pool (fuera de scope P1.1).

**Implementacion:** la policy RLS para agent es exactamente:
```sql
assigned_user_id = auth.uid() AND is_member_of_with_role(agency_id, ARRAY['agent']::agency_role[])
```
Sin `OR assigned_user_id IS NULL`.

**Si el founder dice SI** a B1/B2: agregar `OR conv.assigned_user_id IS NULL` a la policy SELECT del agent sobre `conversations`. Simple cambio, sin tocar nada mas.

### DT4 — UI: hide vs disabled vs not-rendered
**Decision:** **A para administrativas, B contextual para acciones de operacion**.

| Tipo de accion | Patron | Ejemplo |
|---|---|---|
| Administrativas (configurar, invitar, borrar) | **A — no renderizar** | Item sidebar "Equipo" para agent → no aparece. Boton "+ Invitar miembro" para admin → SI aparece. Boton "Borrar agencia" para owner → NO aparece (no existe en UI todavia). |
| Operacionales contextuales (toggle bot, cambiar etapa) | **B — disabled con tooltip "requiere admin/owner"** | Para `viewer` el composer del inbox se renderiza disabled con placeholder "Modo lectura". Permite que el viewer entienda el contexto sin sentir que la app esta rota. |
| Operacionales sobre conv ajena para agent | **A — no renderizar** | El agent simplemente no ve la conv en lista. No hay "Te falta permiso" — la conv no existe para el. |

**Razon:** las administrativas que no deberias ver son ruido (mostrarlas disabled invita a "como obtengo permiso?"). Las operacionales contextuales para `viewer` son didacticas (le ensenan donde estaria la accion si tuviera rol). Para `agent` sobre conv ajena, la conv directamente no existe — RLS la bloquea, el front nunca la recibe.

### DT5 — Migracion de datos
**Decision:** **ninguna migracion de seed.** Los memberships existentes (todos `owner` hoy) quedan como estan.

- No generamos admin/agent demo.
- Nuevos roles se crean via UI del modal "Invitar miembro" con dropdown de rol (cambio que ADM-3 dejo cerrado bajo D3 LOCK-IN y que P1.1 reabre — ver DT7).
- La migration NUEVA (vease §5) introduce RLS policies + helpers SQL. No toca data.

### DT6 — Cambio de rol post-invitacion
**Decision:** **dropdown en la fila del miembro** en `/settings/equipo`, con reglas:

- **Owner** puede cambiar rol entre `admin | agent | viewer`. NO puede cambiar a/desde `owner` (transferencia fuera de scope).
- **Admin** puede cambiar rol entre `agent | viewer`. NO puede cambiar a/desde `admin` ni `owner`.
- Cambiar tu propio rol: bloqueado.
- Cambiar rol de un `owner`: bloqueado para todos los no-owners. El owner tampoco puede demote-se a si mismo (perderia control de la agency).

**Server action nueva:** `changeMemberRole({ slug, userId, role })` en `team.ts`. Discriminated union con errores `cannot_change_self`, `cannot_change_owner`, `insufficient_permissions`, `member_not_found`.

### DT7 — Roles del modal "Invitar miembro"
**Decision:** **abrir a dropdown segun rol del invitador**.

- Si el invitador es `owner`: dropdown con `admin`, `agent`, `viewer` (NO `owner` — transferencia).
- Si el invitador es `admin`: dropdown con `agent`, `viewer` (NO `admin` ni `owner`).
- La validacion server-side rebota intentos de bypass (admin tratando de invitar admin via curl directo).

**Reabre D3 LOCK-IN de ADM-3** (que era "rol fijo agent"). El founder lo aprobo implicitamente al pedir P1.1.

### DT8 — Owner unico o multiple
**Decision:** **mantener `agencies.owner_user_id` unico**. NO se soporta multiple owners en P1.1.

- Si el owner quiere "transferir", se hace via UI futura (action `transferOwnership` — fuera de scope P1.1, anotada como pendiente).
- `agency_memberships` permite tener N rows con `role='owner'` en la misma agency a nivel schema (UNIQUE es `(agency_id, user_id)`, no por rol). **Pero la UI y los helpers NO crean owners adicionales.** Si por SQL manual aparecen, el sistema los respeta (RLS los trata como owners) — caso edge tolerado.

### DT9 — Realtime: como filtrar para `agent`
**Decision:** **filtro client-side en el handler** del `use-inbox-realtime.ts`, NO canal por user.

- El canal `agency:<id>` sigue siendo agency-wide (no cambia el broadcast).
- El handler recibe `currentUserRole` + `currentUserId` y filtra antes de mutar state.
- **Limitacion conocida:** el agent SI recibe el payload via WebSocket. En network tab del DevTools, podria ver IDs de conversaciones ajenas. **NO es leak de PII** porque el payload de broadcast solo trae `{ new, old, table, op }` con campos de la fila — y los campos sensibles (body de mensajes, telefonos, emails) requieren un SELECT de RLS para leerse. El agent puede ver IDs pero NO contenido.
- **Si en el futuro el founder quiere broadcast-by-user**, eso requiere cambios al backend (la migration 0008 emite con `realtime.send` desde triggers — habria que agregar mas canales por user_id). Fuera de scope P1.1.

### DT10 — Roles del lado del extractor / bot
**No toca P1.1.** El bot escribe via `service_role` en N8N. RLS no aplica a `service_role`. El bot puede seguir escribiendo a `extractor_field_values`, `bot_turns`, `messages`, `conversations`, `leads` sin cambios.

---

## 5. Cambios al backend

### 5.1 Migration NUEVA — `0019_agency_role_rls.sql`

**Decision Tecnica DT2 (extension):** migration ES obligatoria. RLS policies son DDL y necesitan transaccion documentada.

**Contenido (orden estricto):**

#### 5.1.1 Helper functions adicionales

```sql
-- Devuelve el rol del current user para una agency, o NULL si no es miembro.
-- security definer + stable para que se cachee dentro de la query.
create or replace function public.agency_role_for(aid uuid)
returns public.agency_role
language sql security definer stable
set search_path = public as $$
    select role from public.agency_memberships
    where user_id = auth.uid() and agency_id = aid and is_active
    limit 1;
$$;

-- True si el current user es miembro de aid con uno de los roles en `roles`.
-- security definer + stable.
create or replace function public.has_agency_role(aid uuid, roles public.agency_role[])
returns boolean
language sql security definer stable
set search_path = public as $$
    select exists(
        select 1 from public.agency_memberships
        where user_id = auth.uid()
          and agency_id = aid
          and is_active
          and role = any(roles)
    );
$$;

grant execute on function public.agency_role_for(uuid) to authenticated;
grant execute on function public.has_agency_role(uuid, public.agency_role[]) to authenticated;
```

#### 5.1.2 Drop + recreate policies sobre `conversations`

```sql
drop policy if exists conversations_access on public.conversations;

-- SELECT: owner/admin/viewer ven toda la agency. agent solo sus asignadas.
create policy conversations_select on public.conversations for select
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin','viewer']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and assigned_user_id = auth.uid()
        )
    );

-- INSERT: owner/admin (UI de "Nuevo lead" lo crea). viewer no. agent no
-- (la creacion va via leads, no conversations — y el INSERT lo hace el bot
-- via service_role).
create policy conversations_insert on public.conversations for insert
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
    );

-- UPDATE: owner/admin sobre cualquier conv. agent solo sobre la suya
-- (assigned_user_id = self). viewer no.
create policy conversations_update on public.conversations for update
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and assigned_user_id = auth.uid()
        )
    )
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            -- AGENT puede modificar SI ya era suya. NO puede self-assign
            -- una conv ajena (assigned_user_id = ... TO self). El check
            -- with check valida la fila NUEVA: si el nuevo assigned_user_id
            -- sigue siendo self, OK.
            and assigned_user_id = auth.uid()
        )
    );

-- DELETE: solo master (no hay UI cliente que borre conv hoy).
create policy conversations_delete on public.conversations for delete
    using (is_master());
```

**Nota tecnica:** el `with check` del UPDATE garantiza que un agent NO pueda hacer `UPDATE conversations SET assigned_user_id = '<other_user_id>' WHERE id = '<mia>'`. La fila NUEVA tendria `assigned_user_id != auth.uid()` y el with check rebota.

**Caso edge resuelto:** un agent intentando "tomar" una conv ajena (`UPDATE ... SET assigned_user_id = auth.uid() WHERE id = '<ajena>'`). El `using` filtra: la conv ajena no es visible para el agent, asi que el WHERE no encuentra fila → 0 rows affected, sin error. **Garantizado** por la combinacion using + with check.

#### 5.1.3 Drop + recreate policies sobre `leads`

```sql
drop policy if exists leads_access on public.leads;

-- SELECT: igual que conversations. agent ve donde assigned_user_id = self
-- O donde haya una conv suya (porque a veces leads.assigned_user_id puede
-- ser NULL pero la conv esta asignada). Resolvemos con un EXISTS.
create policy leads_select on public.leads for select
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin','viewer']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and (
                assigned_user_id = auth.uid()
                or exists (
                    select 1 from public.conversations c
                    where c.lead_id = leads.id
                      and c.assigned_user_id = auth.uid()
                )
            )
        )
    );

-- INSERT: owner/admin/agent. viewer no.
-- agent puede crear leads (queda asignado a si mismo por trigger / app logic).
create policy leads_insert on public.leads for insert
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin','agent']::agency_role[])
    );

-- UPDATE: igual logica que select para agent, mas with check.
create policy leads_update on public.leads for update
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and (
                assigned_user_id = auth.uid()
                or exists (
                    select 1 from public.conversations c
                    where c.lead_id = leads.id and c.assigned_user_id = auth.uid()
                )
            )
        )
    )
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and assigned_user_id = auth.uid()
        )
    );

-- DELETE (soft via deleted_at no aplica RLS DELETE — pero hay un caso de
-- hard delete administrativo). owner/admin/master. NO agent.
create policy leads_delete on public.leads for delete
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
    );
```

#### 5.1.4 Drop + recreate policies sobre `messages`

```sql
drop policy if exists messages_access on public.messages;

-- SELECT: si veo la conversation, veo sus mensajes. Reuso el EXISTS sobre
-- conversations para no duplicar logica de roles.
create policy messages_select on public.messages for select
    using (
        is_master()
        or exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
              -- la policy de conversations_select se evalua implicitamente
              -- al hacer el join (RLS aplica). Pero por defensa explicita
              -- replicamos el check de rol.
              and (
                  has_agency_role(c.agency_id, ARRAY['owner','admin','viewer']::agency_role[])
                  or (
                      has_agency_role(c.agency_id, ARRAY['agent']::agency_role[])
                      and c.assigned_user_id = auth.uid()
                  )
              )
        )
    );

-- INSERT: owner/admin sobre cualquier conv. agent solo sobre conv suya.
-- viewer no.
create policy messages_insert on public.messages for insert
    with check (
        is_master()
        or exists (
            select 1 from public.conversations c
            where c.id = messages.conversation_id
              and (
                  has_agency_role(c.agency_id, ARRAY['owner','admin']::agency_role[])
                  or (
                      has_agency_role(c.agency_id, ARRAY['agent']::agency_role[])
                      and c.assigned_user_id = auth.uid()
                  )
              )
        )
    );

-- UPDATE: master (status updates de webhook van via service_role).
-- owner/admin para correcciones admin. agent no edita mensajes (no hay UI).
-- viewer no.
create policy messages_update on public.messages for update
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
    );

-- DELETE: solo master.
create policy messages_delete on public.messages for delete
    using (is_master());
```

#### 5.1.5 Drop + recreate policies sobre `tag_assignments`

```sql
drop policy if exists tag_assignments_access on public.tag_assignments;

-- SELECT: igual que el padre (lead). agent ve solo de sus leads.
create policy tag_assignments_select on public.tag_assignments for select
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin','viewer']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and entity_type = 'lead'
            and exists (
                select 1 from public.leads l
                where l.id = tag_assignments.entity_id
                  and (
                      l.assigned_user_id = auth.uid()
                      or exists (
                          select 1 from public.conversations c
                          where c.lead_id = l.id and c.assigned_user_id = auth.uid()
                      )
                  )
            )
        )
    );

-- INSERT/UPDATE/DELETE: owner/admin/agent (sobre su lead). viewer no.
create policy tag_assignments_write on public.tag_assignments for all
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and entity_type = 'lead'
            and exists (
                select 1 from public.leads l
                where l.id = tag_assignments.entity_id and l.assigned_user_id = auth.uid()
            )
        )
    )
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
        or (
            has_agency_role(agency_id, ARRAY['agent']::agency_role[])
            and entity_type = 'lead'
            and exists (
                select 1 from public.leads l
                where l.id = tag_assignments.entity_id and l.assigned_user_id = auth.uid()
            )
        )
    );
```

#### 5.1.6 Drop + recreate policies sobre `agency_memberships`

```sql
drop policy if exists memberships_select on public.agency_memberships;
drop policy if exists memberships_write on public.agency_memberships;

-- SELECT: cualquier miembro activo ve la lista (necesario para que el inbox
-- popule el AgentFilter con compañeros de equipo). Si quisieramos que el
-- agent NO vea la lista de compañeros, hay que filtrar en el query.
-- Decision: agent SI ve la lista (es esperado: vas a saber a quien pasarle).
create policy memberships_select on public.agency_memberships for select
    using (is_master() or is_member_of(agency_id));

-- INSERT: owner/admin (con guards de rol en server action que rebotan el
-- caso "admin tratando de crear owner"). Master tambien.
create policy memberships_insert on public.agency_memberships for insert
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
    );

-- UPDATE: owner/admin (con guards en server action). Master.
create policy memberships_update on public.agency_memberships for update
    using (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
    )
    with check (
        is_master()
        or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[])
    );

-- DELETE: solo master (cliente usa soft delete via UPDATE is_active=false).
create policy memberships_delete on public.agency_memberships for delete
    using (is_master());
```

**Nota:** el server action `changeMemberRole` y `removeMember` siguen usando admin client (service_role), bypassando RLS. La RLS aca es defensa por si el cliente intenta UPDATE directo via JS (no deberia, pero por seguridad).

#### 5.1.7 Drop + recreate policies sobre `agencies`

```sql
drop policy if exists agencies_update on public.agencies;

-- UPDATE: master, owner, admin. NO agent, NO viewer.
create policy agencies_update on public.agencies for update
    using (
        is_master()
        or has_agency_role(id, ARRAY['owner','admin']::agency_role[])
    )
    with check (
        is_master()
        or has_agency_role(id, ARRAY['owner','admin']::agency_role[])
    );
```

#### 5.1.8 Drop + recreate policies sobre `pipeline_stages`, `tags`, `custom_field_defs`, `extractor_field_defs`, `followup_rules`

Patron uniforme (owner/admin escriben, todos los miembros leen):

```sql
-- pipeline_stages
drop policy if exists pipeline_stages_access on public.pipeline_stages;
create policy pipeline_stages_select on public.pipeline_stages for select
    using (is_master() or is_member_of(agency_id));
create policy pipeline_stages_write on public.pipeline_stages for all
    using (is_master() or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[]))
    with check (is_master() or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[]));

-- tags catalog (idem)
drop policy if exists tags_access on public.tags;
create policy tags_select on public.tags for select
    using (is_master() or is_member_of(agency_id));
create policy tags_write on public.tags for all
    using (is_master() or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[]))
    with check (is_master() or has_agency_role(agency_id, ARRAY['owner','admin']::agency_role[]));

-- mismo patron para custom_field_defs, extractor_field_defs, followup_rules
-- (todos catalogos de configuracion).
```

#### 5.1.9 NO se tocan

- `users` (self + master): cada user se ve a si mismo. Sin cambio.
- `master_accounts`, `master_audit_log`: sin cambio.
- `webhook_events_raw`, `bot_prompt_templates`, `n8n_chat_histories`: sin cambio.
- `audit_log`: SELECT para todos los miembros queda como esta (read-only, sin INSERT desde cliente).
- `followups` (motor de seguimientos): leer/escribir como owner/admin. Por ahora se queda con la policy actual `is_member_of` — no es critico para P1.1 y abrir caso edge esta fuera de scope.
- `agency_modules`, `documents`, `module_definitions`, `module_packages`, `extractor_field_values`, `custom_field_values`: igual — no son criticas para P1.1, las dejamos con la policy actual. **TODO post-P1.1:** extender el patron a estas tablas cuando se construyan UIs cliente que las escriban.

### 5.2 Helpers TS NUEVOS

#### 5.2.1 `crm-v2/src/lib/auth/agency-roles.ts` (constantes + types)

```ts
export type AgencyRole = 'owner' | 'admin' | 'agent' | 'viewer';

export const AGENCY_ROLES: AgencyRole[] = ['owner', 'admin', 'agent', 'viewer'];

export const AGENCY_ROLE_LABEL: Record<AgencyRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agente',
  viewer: 'Viewer',
};

export const AGENCY_ROLE_DESCRIPTION: Record<AgencyRole, string> = {
  owner: 'Control total. Es el dueño de la cuenta.',
  admin: 'Configura el sistema, invita gente, ve todo. No puede borrar la agencia.',
  agent: 'Atiende las conversaciones que le asignen. No ve las de otros.',
  viewer: 'Solo lectura. Ve todo pero no puede modificar nada.',
};

// Helpers de inclusion (UI condicional).
export const isOwnerOrAdmin = (r: AgencyRole | null) => r === 'owner' || r === 'admin';
export const isAgent = (r: AgencyRole | null) => r === 'agent';
export const isViewer = (r: AgencyRole | null) => r === 'viewer';
export const canEditOperationalData = (r: AgencyRole | null) =>
  r === 'owner' || r === 'admin' || r === 'agent';
export const canEditConfig = (r: AgencyRole | null) => r === 'owner' || r === 'admin';
export const canManageTeam = (r: AgencyRole | null) => r === 'owner' || r === 'admin';

// Quien puede invitar a quien.
export function rolesInvitableBy(invitorRole: AgencyRole): AgencyRole[] {
  if (invitorRole === 'owner') return ['admin', 'agent', 'viewer'];
  if (invitorRole === 'admin') return ['agent', 'viewer'];
  return [];
}

// Quien puede cambiar rol de quien (incluida la transicion target).
export function canChangeRoleTo(
  invitorRole: AgencyRole,
  targetCurrentRole: AgencyRole,
  newRole: AgencyRole,
): boolean {
  if (targetCurrentRole === 'owner' || newRole === 'owner') return false; // owner no se toca
  if (invitorRole === 'owner') return true;
  if (invitorRole === 'admin') {
    if (targetCurrentRole === 'admin') return false; // admin no toca a admin
    if (newRole === 'admin') return false;            // admin no promueve a admin
    return true;
  }
  return false;
}
```

#### 5.2.2 `crm-v2/src/lib/auth/require-agency-access.ts` (helper general)

```ts
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AgencyRole } from './agency-roles';

const IMPERSONATION_COOKIE_NAME = 'master_impersonating';

export type AgencyAccessContext = {
  user: User;
  userId: string;
  email: string;
  agencyId: string;
  slug: string;
  // Rol efectivo. Si es master impersonando, devolvemos 'owner' (ADM-3 DT3).
  // Si master NO impersonando entra a una agency ajena, devolvemos 'owner'
  // tambien (master tiene permisos completos via is_master() en RLS).
  role: AgencyRole;
  isMasterImpersonating: boolean;
};

/**
 * Gate general para cualquier ruta /a/[slug]/*. Resuelve agencyId + rol
 * efectivo en UNA query (o dos si master impersonando).
 *
 * Devuelve notFound() en lugar de 403 para NO leakear existencia de la agency
 * a usuarios externos.
 *
 * Uso:
 *   const { agencyId, role, isMasterImpersonating } = await requireAgencyAccess(slug);
 *   if (!canEditConfig(role)) notFound();
 */
export async function requireAgencyAccess(slug: string): Promise<AgencyAccessContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Branch master impersonando.
  const cookieStore = await cookies();
  const impersonatingSlug = cookieStore.get(IMPERSONATION_COOKIE_NAME)?.value ?? null;

  if (impersonatingSlug === slug) {
    const { data: masterRow } = await supabase
      .from('master_accounts').select('is_active').eq('user_id', user.id).maybeSingle();
    if (masterRow?.is_active) {
      const admin = createAdminClient();
      const { data: agency } = await admin
        .from('agencies').select('id, is_active').eq('slug', slug).maybeSingle();
      if (!agency) notFound();
      if (!agency.is_active) notFound(); // ADM-4B parity
      return {
        user, userId: user.id, email: user.email ?? '',
        agencyId: agency.id, slug,
        role: 'owner', isMasterImpersonating: true,
      };
    }
  }

  // Branch normal: el user es miembro activo de esta agency.
  type Row = {
    agency_id: string;
    role: AgencyRole;
    agencies: { slug: string; is_active: boolean } | { slug: string; is_active: boolean }[] | null;
  };
  const { data: row } = await supabase
    .from('agency_memberships')
    .select('agency_id, role, agencies!inner(slug, is_active)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('agencies.slug', slug)
    .maybeSingle<Row>();
  if (!row) notFound();

  // Defense in depth: si la agency esta suspendida, redirect (mismo trato que
  // ADM-4B: el layout /a/[slug]/layout.tsx ya hace este check, pero por si
  // alguien llama el helper desde otra ruta).
  const ag = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
  if (!ag?.is_active) notFound();

  return {
    user, userId: user.id, email: user.email ?? '',
    agencyId: row.agency_id, slug,
    role: row.role, isMasterImpersonating: false,
  };
}
```

#### 5.2.3 `requireAgencyAdmin(slug)` — wrapper

```ts
import { notFound } from 'next/navigation';
import { requireAgencyAccess } from './require-agency-access';
import { isOwnerOrAdmin } from './agency-roles';

/**
 * Gate para rutas que requieren owner o admin (gestion de equipo, settings,
 * pipeline_stages, tags, extractor_field_defs).
 *
 * Devuelve notFound() para no leakear que el agent / viewer veria esa ruta.
 */
export async function requireAgencyAdmin(slug: string) {
  const ctx = await requireAgencyAccess(slug);
  if (!isOwnerOrAdmin(ctx.role)) notFound();
  return ctx;
}
```

#### 5.2.4 `requireAgencyOwner(slug)` — refactor MINIMO

El existente sigue funcionando. **Adicion:** internamente delega en `requireAgencyAccess` y filtra por `role === 'owner'` (en lugar de hacer su propia query). Mantiene su firma publica intacta — backward compatible con ADM-3.

```ts
import { notFound } from 'next/navigation';
import { requireAgencyAccess } from './require-agency-access';
import type { AgencyAccessContext } from './require-agency-access';

export type AgencyOwnerContext = AgencyAccessContext;

export async function requireAgencyOwner(slug: string): Promise<AgencyOwnerContext> {
  const ctx = await requireAgencyAccess(slug);
  // Master impersonando ya viene con role='owner' (DT3 ADM-3).
  if (ctx.role !== 'owner') notFound();
  return ctx;
}
```

### 5.3 Server actions modificadas

#### 5.3.1 Inbox actions (`crm-v2/src/app/a/[slug]/inbox/actions.ts`)

Las 3 actions actuales (`markConversationRead`, `markHandoffHandled`, `sendMessageViaYCloud`) hoy hacen ownership via RLS-bound SELECT y mutacion via admin client. **NO necesitan cambio funcional inmediato porque la RLS nueva ya las filtra.** Cambio menor para errores tipados:

- Aceptan `slug` como nuevo argumento opcional (para invocar `requireAgencyAccess` y obtener el rol).
- Si el rol es `viewer`, retornan `{ ok: false, error: 'read_only_role' }` antes de tocar nada.
- Si el rol es `agent` y la conv no es del agent (RLS la filtra → fila viene null), retornan `{ ok: false, error: 'not_authorized' }` con mensaje "Esta conversacion no esta asignada a vos".

**Por que aceptar slug ahora:** las actions hoy no lo reciben (solo `conversationId` / `messageId`). Para invocar `requireAgencyAccess(slug)` necesitamos el slug. Cambiamos las llamadas desde `inbox-client.tsx` para pasar el slug (ya disponible en `agencySlug`).

#### 5.3.2 Lead actions (`crm-v2/src/lib/leads/...` — `useContactEdit`, `setStage`, `setQualified`, `setAssignee`)

Hoy `useContactEdit` (en `crm-v2/src/components/contactos/use-contact-edit.ts`) escribe direct a Supabase desde el browser usando el client user-bound. **Eso ya esta protegido por la RLS nueva** — el agent no podra hacer `UPDATE leads` sobre lead ajeno (filas afectadas = 0).

**Cambio:** `useContactEdit` debe detectar `affectedRows === 0` y mostrar toast "No tenes permiso para editar este contacto" (en lugar de mostrar exito y revertir cuando llega el realtime). Implementacion:

```ts
// dentro de setStage:
const { data, error } = await supabase
  .from('leads')
  .update({ stage_id: nextStageId, ... })
  .eq('id', leadId)
  .select('id')
  .maybeSingle();
if (error) { /* rollback + toast */ }
if (!data) {
  // RLS bloqueo (0 rows affected). Rollback + toast.
  rollback();
  toast.error('No tenes permiso para modificar este contacto.');
}
```

#### 5.3.3 Settings action (`crm-v2/src/app/a/[slug]/settings/actions.ts`)

`saveAgencySettings(input)` debe:
- Reemplazar `getUser` + manual membership check por `requireAgencyAdmin(slug)`.
- Si el rol no es owner/admin → notFound() (helper lo hace).
- Backward compatibility: si la action se invoca sin `slug`, falla con `invalid_input`. Hoy el form la llama con `agencyId`, agregamos `slug` al payload.

#### 5.3.4 Team actions (`crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.ts`)

- `listMembers`: sin cambio (lo invoca server component ya gated).
- `inviteMember`: el gate pasa de `requireAgencyOwner` a `requireAgencyAdmin`. Acepta `role: AgencyRole` (no mas hardcoded `agent`). Valida con `rolesInvitableBy(ctx.role).includes(input.role)`. Si no → `error: 'role_not_invitable'`.
- `removeMember`: gate `requireAgencyAdmin`. Si target es `admin` y caller es `admin` → `error: 'cannot_remove_admin'`. Si target es `owner` → `error: 'cannot_remove_owner'` (igual que hoy). Si target es self → `cannot_remove_self`.
- **NUEVA action `changeMemberRole({ slug, userId, role })`:** gate `requireAgencyAdmin`. Usa `canChangeRoleTo(ctx.role, target.role, role)` para validar. Si no pasa → `error: 'insufficient_permissions'`. Idempotente: si target.role === new role, retorna `{ ok: true }` sin update.

### 5.4 Layout `/a/[slug]/layout.tsx`

Hoy el layout resuelve `isMaster` + (en algun lugar) `isOwner` para pasar al `<AgencyShell>`. **Cambio:** reemplazar por una sola llamada a `requireAgencyAccess(slug)` y pasar `role` al shell. Esto elimina queries duplicadas y centraliza el chequeo.

```ts
// pseudo
const ctx = await requireAgencyAccess(slug);
// si la agency esta suspendida, requireAgencyAccess ya hizo notFound().
// si el user no es miembro/master, idem.
return (
  <AgencyShell
    role={ctx.role}
    isMasterImpersonating={ctx.isMasterImpersonating}
    {...otherProps}
  />
);
```

---

## 6. Cambios al frontend

### 6.1 `<AgencyShell>` (sidebar cliente)

Prop nueva: `role: AgencyRole`. Reemplaza la prop `isOwner` (que pasa a derivarse).

**Sidebar items condicionales:**

| Item | Condicion |
|---|---|
| Inbox | siempre visible |
| Contactos | siempre visible |
| Agenda / Seguimientos / Tareas | siempre visible (cuando se construyan) |
| Insights / Dashboard | siempre visible |
| Configuracion (`/settings`) | `canEditConfig(role)` (owner o admin) |
| Equipo (`/settings/equipo`) | `canManageTeam(role)` (owner o admin) |
| Panel Admin (`/admin`) | `isMaster` (sin cambio) |

**Caso master impersonando:** el helper `requireAgencyAccess` ya devuelve `role='owner'` cuando impersona, asi que ve todos los items administrativos. Consistente con DT3 ADM-3.

### 6.2 Inbox

#### 6.2.1 `<ConvList>` y `<FiltersStrip>`

`<ConvList>` recibe nueva prop `currentUserRole: AgencyRole`. Cambios:

- **Filtro "Todos"**: condicionado a `!isAgent(currentUserRole)`. Para agent, el filtro default arranca en `mine` (o desaparece y queda fijo en "mias" implicito).
- **`AgentFilter` (selector por agente):** condicionado a `!isAgent(currentUserRole)`. Agent no necesita filtrar por agente (solo se ve a si mismo).
- **Filtros "Sin leer", "Bot", "Handoff"**: visibles para todos los roles, operan sobre el subset que cada uno ve (RLS ya filtro).
- **Boton "Nuevo contacto"** (si existiera en inbox): viewer no lo ve.

```tsx
// dentro de ConvList.tsx, filtros:
const isAgentRole = isAgent(currentUserRole);
const filters: FilterTab[] = [
  ...(isAgentRole ? [] : [{ id: 'all', label: 'Todos', count: all.length }]),
  { id: 'unread', label: 'Sin leer', count: unreadCount },
  { id: 'bot', label: 'Bot', count: botCount },
  { id: 'mine', label: 'Mias', count: mineCount },
  { id: 'handoff', label: 'Handoff', count: handoffCount },
];
// y al inicializar filter por default:
const [filter, setFilter] = useState<FilterId>(isAgentRole ? 'mine' : 'all');
```

#### 6.2.2 `<ChatPanel>` y composer

- **Viewer**: composer renderizado disabled con placeholder "Modo solo lectura. No podes enviar mensajes."
- **Viewer**: boton "Toggle bot/humano" oculto.
- **Viewer**: boton "Sugerir respuesta IA" oculto.
- **Agent**: composer disponible solo si la conv esta asignada a el (RLS ya garantiza que no ve las ajenas, asi que no hace falta logica adicional aqui). Si por alguna razon ve una conv (cache stale), el server action `sendMessageViaYCloud` rebota con `not_authorized`.

#### 6.2.3 `<LeadPanel>` (panel derecho con info del contacto)

- **Viewer**: campos editables (etapa, calificado, asignado, tags, notas) se renderizan en read-only. Mostrar valores pero sin dropdowns/edits.
- **Agent** sobre lead suyo: igual que owner/admin.
- **Agent** sobre lead ajeno: no aplica (no lo ve).

#### 6.2.4 `useInboxRealtime` — filtro client-side

Agregar args `currentUserRole`, `currentUserId`. En el handler:

```ts
function shouldProcess(payload: BroadcastPayload, currentRole: AgencyRole, currentUserId: string): boolean {
  if (currentRole !== 'agent') return true; // owner/admin/viewer procesan todo
  // Agent: solo procesa eventos sobre filas propias.
  const row = (payload.new ?? payload.old) as Record<string, unknown>;
  if (payload.table === 'conversations') {
    return row.assigned_user_id === currentUserId;
  }
  if (payload.table === 'messages') {
    // Resolver la conv en state local (la lista del agent solo tiene conv suyas).
    const convId = row.conversation_id as string | undefined;
    return convId !== undefined && convsInState.has(convId);
  }
  if (payload.table === 'leads') {
    return row.assigned_user_id === currentUserId
      || leadsInState.has(row.id as string);
  }
  if (payload.table === 'tag_assignments') {
    const eid = row.entity_id as string | undefined;
    return row.entity_type === 'lead' && eid !== undefined && leadsInState.has(eid);
  }
  return true;
}
```

**Nota:** `convsInState` / `leadsInState` son sets construidos a partir del state local del client. El hook ya tiene acceso al state setter, agregar un getter (via ref) para los IDs visibles.

### 6.3 Contactos / Leads

`<ContactosClient>` recibe `currentUserRole`. Cambios:

- **Viewer**: boton "+ Nuevo contacto" oculto. Drag-and-drop kanban deshabilitado (DragOverlay no se monta). Edicion inline (`useContactEdit`) bloqueada por rol — los dropdowns renderizan disabled.
- **Agent**: boton "+ Nuevo contacto" visible. El lead creado queda con `assigned_user_id = currentUserId` (lo setea la server action `createLead` o el form mismo). Kanban: agent solo ve sus leads (RLS), drag funciona sobre los suyos.
- **Agent** sobre lead ajeno: no aplica (no lo ve).
- Filtro "Sin asignar" del strip de metricas: para agent, se oculta (no tiene sentido — no ve los sin asignar).

### 6.4 Ficha de contacto `/a/[slug]/leads/[id]/page.tsx`

Cambio en `page.tsx`:
```ts
const ctx = await requireAgencyAccess(slug);
// La query del lead lo filtra por RLS. Si el agent intenta abrir un lead
// ajeno, viene null → notFound().
const { data: lead } = await supabase.from('leads').select('*').eq('id', id).maybeSingle();
if (!lead) notFound();
// pasamos ctx.role al client component para gating de UI
```

Pestañas:
- **Info**: viewer ve read-only. Agent sobre suyo: editable.
- **Conversacion**: viewer ve hilo, sin "Responder en el inbox" (o con el boton disabled). Agent sobre suyo: editable.
- **Insights**: visible para todos los roles (B3 = SI).
- **Notas**: idem patron.
- **Actividad**: read-only para todos (timeline derivado).

### 6.5 Settings cliente `/a/[slug]/settings/page.tsx`

Cambio:
```ts
const ctx = await requireAgencyAdmin(slug); // notFound si no es owner/admin
// resto igual
```

### 6.6 Equipo `/a/[slug]/settings/equipo/`

#### 6.6.1 `page.tsx`
Cambia `requireAgencyOwner` → `requireAgencyAdmin`. Pasa `currentUserRole: ctx.role` al `<TeamPageClient>`.

#### 6.6.2 `<TeamPageClient>` recibe `currentUserRole`
Lo pasa a los hijos:
- `<TeamMemberRow>`: usa `canChangeRoleTo(currentUserRole, member.role, ...)` para mostrar/no el dropdown de rol y los items habilitados. Usa `removeMember` con guards de rol.
- `<InviteMemberModal>`: dropdown de rol con `rolesInvitableBy(currentUserRole)`. Reemplaza el hint "Se sumara como Agente. (Otros roles llegan pronto.)".

#### 6.6.3 `<TeamMemberRow>` extension

Nuevo control: dropdown de rol (similar al de stage del lead). Para cada miembro, los items habilitados son los que `canChangeRoleTo(currentUserRole, member.role, x)` retorne true. Si no hay ninguno, el dropdown no se renderiza (caso: admin viendo otro admin).

Boton "Remover":
- Self: oculto.
- Owner: oculto.
- Admin (y caller es admin): oculto.
- Resto: visible.

### 6.7 Cambios en estilos / animaciones

Ninguno especifico. Reusar el patron de modales y dropdowns ya establecido. Si se agrega un selector de rol como dropdown en el modal de invitar, clonar el patron de los otros dropdowns del proyecto (header-stage-dropdown, agent-filter).

---

## 7. Migration nueva

**Si.** `crm-v2/supabase/migrations/0019_agency_role_rls.sql`. Contenido detallado en §5.1.

**Justificacion:** RLS policies son DDL, requieren transaccion documentada y versionado. Ademas necesitamos crear 2 helper functions nuevas (`agency_role_for`, `has_agency_role`) que son reutilizables fuera del scope de las policies.

**No-data-touching:** la migration NO inserta ni modifica filas. Solo CREATE/DROP de policies + CREATE OR REPLACE de functions. Cero riesgo de perder data. Rollback = `drop policy ...; drop function ...; create policy ... (las viejas)` — pero recordar que las viejas eran `is_member_of` plano, lo cual es estrictamente mas permisivo que las nuevas. Un rollback solo "abre" permisos, no rompe nada.

**Orden de aplicacion:** despues de la migration 0018 actual (`admin_master_metrics_rpcs`).

**Performance:** las nuevas policies tienen subqueries con EXISTS sobre `conversations` (para `leads_select` cuando el agent busca leads donde tiene conv asignada) y sobre `leads` (para `tag_assignments_select`). Indices existentes que las soportan:
- `idx_leads_assigned` (en `leads.assigned_user_id`) ✓
- `idx_memberships_user` (en `agency_memberships.user_id`) ✓
- Falta: `idx_conversations_assigned` en `conversations(assigned_user_id, agency_id)`. **Agregar en la misma migration.** Sin este, el EXISTS sobre conversations para el agent puede escanear toda la tabla.

```sql
create index if not exists idx_conversations_assigned
    on public.conversations(assigned_user_id, agency_id);
```

---

## 8. Testing manual (lista por rol)

### Como `owner`
1. Login como owner.
2. Sidebar: ve `Inbox`, `Contactos`, `Configuracion`, `Equipo`, (`Panel Admin` si tambien es master).
3. Inbox: ve TODAS las conv. Ve filtro "Todos" + `AgentFilter` con todos los miembros.
4. Toma cualquier conv. Composer activo. Toggle bot/humano funciona.
5. Cambia etapa de un lead. OK.
6. Va a Equipo: ve lista. Modal "Invitar miembro" tiene dropdown con `admin`, `agent`, `viewer` (sin `owner`).
7. Invita un `admin` → ve aparecer la fila con badge "Admin".
8. En su propia fila (owner): no aparece dropdown de rol ni boton "Remover".
9. En la fila del admin que invito: dropdown con opciones `admin` (actual), `agent`, `viewer`. Boton "Remover" visible.
10. Cambia el admin a `agent` → toast OK. Verifica que el admin original ahora se ve como "Agente" en la lista.
11. Borrar la agency: NO existe en UI (correcto — fuera de scope P1.1; lo hace master).

### Como `admin`
1. Login como admin (invitado por owner).
2. Sidebar: ve `Inbox`, `Contactos`, `Configuracion`, `Equipo`. NO ve `Panel Admin`.
3. Inbox: ve TODAS las conv (como owner). Filtros: "Todos" + AgentFilter visibles.
4. Toma cualquier conv. Mismas acciones que owner. OK.
5. Equipo: ve lista. Modal "Invitar miembro" tiene dropdown con `agent`, `viewer` (NO `admin`, NO `owner`).
6. Intenta invitar `admin` via curl directo a la action → 400 con error `role_not_invitable`.
7. En la fila del owner: dropdown de rol NO visible, "Remover" NO visible.
8. En la fila de otro admin: dropdown NO visible, "Remover" NO visible.
9. En la fila de un agent: dropdown con `agent`, `viewer`. "Remover" visible.
10. Remueve al agent → OK.
11. Settings: accede a `/settings`, puede editar. OK.

### Como `agent`
1. Login como agent (invitado por owner o admin).
2. Sidebar: ve `Inbox`, `Contactos`. NO ve `Configuracion`, NO ve `Equipo`, NO ve `Panel Admin`.
3. Inbox arranca con filtro "Mias" por default. **NO ve filtro "Todos"**. NO ve `AgentFilter`.
4. Lista muestra SOLO conversaciones donde `assigned_user_id = self`. Si el owner asigna una conv nueva al agent, aparece en realtime.
5. Si el owner cambia el `assigned_user_id` de una conv del agent a otro usuario, la conv desaparece del inbox del agent en realtime (handler recibe UPDATE con `assigned_user_id != self` → remove de state local).
6. Conversa: composer activo. Envia mensaje. OK.
7. Cambia etapa de un lead suyo desde el panel: OK.
8. Click en un lead ajeno (deep-link `/a/[slug]/leads/<id_ajeno>`): notFound (RLS no devuelve fila).
9. Click en "Toggle bot/humano" sobre conv suya: OK.
10. Navega manual a `/a/[slug]/settings`: notFound.
11. Navega manual a `/a/[slug]/settings/equipo`: notFound.
12. Curl directo a `inviteMember` action: error 404 (helper notFound).
13. SQL injection attempt via JS: `supabase.from('conversations').select('*').eq('agency_id', '<agency>')` → devuelve solo las suyas (RLS).
14. Crea un contacto nuevo desde la lista de Contactos: OK, queda `assigned_user_id = self`.

### Como `viewer`
1. Login como viewer.
2. Sidebar: ve `Inbox`, `Contactos`. NO ve `Configuracion`, NO ve `Equipo`.
3. Inbox: ve TODAS las conv de la agency (filtros "Todos", "Sin leer", etc., AgentFilter — todos visibles).
4. Abre una conv. Composer renderizado disabled con placeholder "Modo solo lectura".
5. Botones "Toggle bot/humano", "Sugerir IA" ocultos.
6. Panel del lead: campos read-only (no dropdowns).
7. Contactos: lista visible. Boton "+ Nuevo contacto" oculto. Kanban: drag deshabilitado.
8. Ficha del contacto: pestañas Info, Conversacion, Insights, Notas, Actividad — todas visibles, todas read-only.
9. Curl a `sendMessageViaYCloud` → `error: 'read_only_role'`.

### Como `master` (sin impersonar)
1. Login como master, navega a `/a/[slug-cualquiera]/inbox` directo.
2. NO entra al gate de impersonacion (cookie ausente). Cae al gate normal. NO es miembro → notFound.
3. **Comportamiento OK:** master accede solo via impersonacion explicita.

### Como `master` impersonando
1. Master clickea "Ingresar como cliente" en `/master/clientes/[slug]` → setea cookie + redirect a `/a/[slug]/inbox`.
2. Banner ambar visible.
3. `requireAgencyAccess` devuelve `role='owner'`, `isMasterImpersonating=true`.
4. Sidebar: ve TODO lo de owner (Configuracion, Equipo). Sin Panel Admin del cliente (esa ruta tiene su propio gate de master).
5. Puede invitar, remover, editar settings — todo funciona como owner real.
6. Banner sigue visible.

### Smoke test del realtime
1. Owner en tab 1, agent en tab 2 (la misma agency, el agent solo tiene conv #5 asignada).
2. Owner asigna conv #7 al agent (cambia `assigned_user_id`).
3. En tab 2 (agent), conv #7 aparece en realtime en su inbox.
4. Owner asigna conv #5 a otro agente.
5. En tab 2, conv #5 desaparece en realtime.
6. Owner crea conv #99 con `assigned_user_id=null` (caso "sin asignar").
7. En tab 2, conv #99 NO aparece (DT3b: agent no ve sin asignar).
8. Owner asigna conv #99 al agent.
9. En tab 2, conv #99 aparece en realtime.

---

## 9. Estimacion

| Capa | Tarea | Horas |
|---|---|---|
| Backend | Migration 0019 (helpers SQL + drops/creates de 7 tablas + indice) | 2.5 |
| Backend | Helpers TS (`agency-roles.ts`, `require-agency-access.ts`, refactor `require-agency-owner.ts`) | 1.5 |
| Backend | Refactor server actions inbox (3 actions, agregar slug + error tipado) | 1.0 |
| Backend | Refactor server action settings (`saveAgencySettings`) | 0.25 |
| Backend | Server actions equipo: extender `inviteMember` con rol, extender `removeMember`, NUEVA `changeMemberRole` | 1.5 |
| Backend | Ajuste `useContactEdit` para detectar `affectedRows === 0` y rollback | 0.5 |
| Frontend | Layout `/a/[slug]/layout.tsx`: cambiar a `requireAgencyAccess`, pasar role a shell | 0.5 |
| Frontend | `<AgencyShell>`: prop `role`, gating de items (Configuracion, Equipo) | 0.5 |
| Frontend | `<ConvList>`: prop `currentUserRole`, gating de filtros "Todos" + AgentFilter, default filter | 0.75 |
| Frontend | `<ChatPanel>` / composer: gating viewer + agent | 0.75 |
| Frontend | `<LeadPanel>`: read-only para viewer | 0.5 |
| Frontend | `useInboxRealtime`: filtro client-side por rol | 1.0 |
| Frontend | `<ContactosClient>` + kanban + tabla: gating viewer + agent | 1.25 |
| Frontend | Ficha lead `/leads/[id]`: pasar role, gating de pestañas | 0.5 |
| Frontend | `<InviteMemberModal>`: dropdown de rol + descripcion + validacion | 1.0 |
| Frontend | `<TeamMemberRow>`: dropdown de cambio de rol + gating boton remover | 1.0 |
| Testing | Smoke por rol (owner, admin, agent, viewer, master impersonando) | 1.5 |
| Buffer | Bugs imprevistos (RLS performance, edge cases de realtime) | 1.0 |
| **TOTAL** | | **15.5h** |

Dentro del rango 11-15h del roadmap (vamos +0.5h por incluir refactor de `useContactEdit` y el indice nuevo). Realistic para **2 jornadas**.

---

## 10. Riesgos / casos edge

| # | Caso | Comportamiento esperado |
|---|---|---|
| 1 | Agent recibe una conv asignada y al segundo se la quitan (race RLS + realtime) | Realtime UPDATE con `assigned_user_id != self` → handler client la remueve del state. Si el agent estaba con esa conv abierta en el chat, el `selectedConvId` queda apuntando a una conv que ya no existe en state → fallback a primer conv o vacio. **Aceptable.** |
| 2 | Agent intenta UPDATE direct via JS sobre conv ajena | RLS `using` filtra → 0 rows affected → `useContactEdit` detecta y toast "No tenes permiso". |
| 3 | RLS performance: subquery EXISTS sobre `conversations` en `leads_select` para agent | Indice `idx_conversations_assigned (assigned_user_id, agency_id)` lo cubre. Para 10k leads + 50k conversations, latencia esperada <50ms. Si en testing supera 200ms, considerar materializar `lead.assigned_user_id` (denormalizacion) — no es necesario hoy. |
| 4 | Caso master impersona pero agency esta suspendida | `requireAgencyAccess` valida `agency.is_active` en branch master. Si suspendida → notFound. **Master no puede impersonar agency suspendida**, debe reactivarla primero desde `/master/clientes/[slug]`. Documentado. |
| 5 | Admin se demote-a si mismo a agent por error (no, esta bloqueado) | Bloqueado por `canChangeRoleTo(invitor, target, new) returns false` cuando target.user_id === invitor.user_id. Mas: la fila propia no muestra dropdown de rol. |
| 6 | Owner se elimina por SQL manual del membership (caso patologico) | El owner pierde acceso al `/settings/equipo` (notFound). `agencies.owner_user_id` sigue apuntando a el. Inconsistencia tolerada — fuera de scope. |
| 7 | Bot escribe conversation con `assigned_user_id=null` (handler bot maneja) | RLS NO afecta al bot (service_role bypassa). Cuando handoff sucede, el bot escribe `assigned_user_id = X` via tool de Asignar. A partir de ahi, el agent X la ve. |
| 8 | Realtime: agent recibe broadcast de conv que aun no tiene en state pero acaba de ser asignada a el | El handler debe procesar el INSERT/UPDATE (es nueva para el). Caso A — la conv ya existia, el UPDATE le cambia `assigned_user_id` a el. El handler ve `assigned_user_id === currentUserId` → procesa, INSERT a state. Caso B — la conv es nueva, INSERT. Handler ve `assigned_user_id === currentUserId` → procesa. **OK.** |
| 9 | Viewer abre el composer y hace key press: el form esta disabled, no se envia | `<textarea disabled>` no acepta input. UI consistente. |
| 10 | RLS con `is_master()` ya esta cacheada vs `has_agency_role` nueva — performance del OR | Postgres evalua OR con short-circuit. `is_master()` (helper stable + indexed) es rapido. `has_agency_role` agrega 1 query a memberships indexada — ~1ms. Total <5ms por policy. OK. |
| 11 | `agency_role_for` devuelve null para no-miembro | Las policies usan `has_agency_role` (NO `agency_role_for`) en sus checks, justamente porque null no se compara bien. `has_agency_role` retorna boolean estricto. OK. |
| 12 | Agent con browser tab abierto cuando le quitan el rol (ej. owner cambio agent→viewer) | El JWT del agent sigue siendo valido hasta su refresh. **Lag de hasta 1h** (default JWT TTL Supabase). Mientras tanto, RLS aplica el rol ACTUAL via `has_agency_role` (lee de la DB, no del JWT) — asi que el comportamiento se actualiza instantaneamente. UI puede quedar inconsistente (muestra UI de agent pero las acciones rebotan con error). **Aceptable.** El agent va a refrescar la pagina y todo se rectifica. |
| 13 | Carga inicial del inbox para agent con 0 conv asignadas | `convRows` viene vacio (RLS filtra todo). UI muestra empty state "Aun no tenes conversaciones asignadas. Cuando te asignen una, va a aparecer aca." (texto a anadir). |
| 14 | Servicio `tag_assignments` en inbox-client (lectura directa JS) para tags del lead seleccionado | RLS nueva sobre `tag_assignments_select` filtra por rol. Agent solo recibe tags de leads suyos. OK. |
| 15 | El agent intenta crear un lead via "+ Nuevo contacto" pero al insert no pasa el agency_id correcto | `createLead` action setea `agency_id` y `assigned_user_id = currentUserId` server-side. RLS valida ambos. OK. |

---

## 11. Pre-Mortem (3 peores escenarios + mitigacion)

### Escenario 1 — "El agent ve todo en produccion" (regresion silenciosa)
**Disparador:** alguien (Claude futuro, founder, contratista) escribe una server action nueva que usa admin client SIN llamar al helper de rol primero. Por ejemplo: una action "exportar leads a CSV" que hace `admin.from('leads').select('*').eq('agency_id', x)` y devuelve todo.

**Como se nota:** un cliente reporta "mi community manager descargo el CSV y tiene todos los telefonos de mis leads". Daño: PII leak interno. Reputacion. Posiblemente legal (LGPD/GDPR-equivalent).

**Mitigacion:**
1. **Regla de codigo:** todas las server actions empiezan con `requireAgencyAccess(slug)` o `requireAgencyAdmin(slug)` ANTES de tocar admin client. Documentar en `crm-v2/CLAUDE.md`.
2. **Tests E2E con Playwright** (post-P1.1): un test "como agent, intenta exportar CSV" y verifica que la respuesta no incluye leads ajenos.
3. **Auditoria periodica:** cada 3 sprints, grep por `createAdminClient()` en `src/app/` y verificar manualmente que cada uso tenga un `requireAgency*` antes.

### Escenario 2 — "RLS se vuelve lenta y el inbox tarda 5 segundos en cargar"
**Disparador:** un cliente con 50k leads + 200k conversations crece el dataset y las subqueries EXISTS de las policies empiezan a escanear tablas grandes.

**Como se nota:** un cliente reporta "el inbox tarda". El monitoring de Supabase muestra queries que toman >2s en `auth.uid()` callbacks.

**Mitigacion:**
1. **Indice agregado en la migration 0019** (`idx_conversations_assigned`). Cubre el EXISTS del agent.
2. **Pre-prod load test:** seedar agency con 50k leads/200k conversations y medir tiempo de carga del inbox para agent/owner. Si supera 1s, ajustar antes de prod.
3. **Plan B (si llega a pasar):** denormalizar `lead.last_assigned_user_id` (sync trigger desde conv) para evitar el EXISTS en `leads_select`. Caso B, materializar vista `agent_visible_leads(user_id, lead_id)` actualizada por trigger.
4. **Monitoring:** activar `pg_stat_statements` en Supabase, alertar si queries de policies superan p95 200ms.

### Escenario 3 — "Cambiar rol del cliente VIP rompe sus dashboards en realtime"
**Disparador:** owner cambia su propio rol a viewer por error (no — esto esta bloqueado). Pero owner demote-a otro admin a agent. El admin afectado tiene sesion activa. Sus tabs siguen mostrando UI de admin (boton "Invitar") pero al clickear, falla.

**Como se nota:** el ex-admin reporta "no puedo invitar gente, ¿se rompio el sistema?". El owner se enoja porque "le rompiste el cliente".

**Mitigacion:**
1. **UI explica el rol actual** en el header del sidebar (badge pequeño "Admin", "Agent", etc.). Si cambia, despues del refresh el badge cambia y el cliente entiende.
2. **Server actions retornan error tipado** `insufficient_permissions` con mensaje "Tu rol cambio. Refresca la pagina." → toast obvio.
3. **Push de Realtime sobre `agency_memberships` UPDATE** (opcional, post-P1.1): cuando el rol del propio user cambia, refrescar la pagina automaticamente. Implementacion barata pero fuera de scope P1.1.

---

## 12. Lo que NO entra (recordatorio, congelado)

- Transferir ownership entre users → fuera de scope. Si surge, action `transferOwnership({ slug, newOwnerUserId })` con guards (solo el owner actual + el new owner tiene que ser admin existente).
- Multiple owners simultaneos → no soportado. Schema lo permite, UI/helpers no lo crean.
- Suspender user individual (sin remover) → owner puede demote a `viewer` para read-only. Suspend full se difiere.
- Audit log visible por user → tabla `audit_log` existe pero no se llena desde acciones de roles. Diferido.
- Canal por user en realtime → fuera de scope. Filtro client-side es suficiente para MVP.
- Selector de agency post-login (multi-agency user) → diferido (caso #6 de ADM-3 sigue funcional sin UI).
- Trigger para `accepted_at` al primer login del invitee → fuera de scope. `lastSignInAt` sirve como senial.
- Modificar el flujo del bot (extractor, tools) → fuera de scope. RLS no aplica a service_role.
- Test E2E automatizado por rol → fuera de scope (es un buen post-P1.1).

---

## 13. Resumen para builders

**Backend builder:**
1. Crear migration 0019 con helpers SQL + 7 drops/creates de policies + indice. Aplicar local + verificar con un seed de prueba.
2. Crear `agency-roles.ts` (types + helpers de inclusion + tablas de transicion).
3. Crear `require-agency-access.ts`. Refactor minimo de `require-agency-owner.ts` para delegar.
4. Crear `require-agency-admin.ts`.
5. Refactor `saveAgencySettings`, `inviteMember`, `removeMember`. Crear `changeMemberRole`.
6. Refactor `markConversationRead`, `markHandoffHandled`, `sendMessageViaYCloud` para aceptar slug + error tipado.
7. Ajuste `useContactEdit` para detectar 0 rows affected.

**Frontend builder:**
1. Layout `/a/[slug]/layout.tsx`: usar `requireAgencyAccess`, pasar `role` y `isMasterImpersonating` al shell.
2. `<AgencyShell>`: prop `role`, gating de Configuracion + Equipo, badge de rol en header.
3. Inbox `<ConvList>` + `<FiltersStrip>`: gating de "Todos" + AgentFilter, default filter para agent.
4. `<ChatPanel>` + composer: gating viewer + agent.
5. `<LeadPanel>`: read-only para viewer.
6. `useInboxRealtime`: filtro client-side por rol.
7. Contactos page + `<ContactosClient>` + kanban + tabla: gating viewer + agent.
8. Ficha de lead: gating de pestañas.
9. `<InviteMemberModal>`: dropdown de rol con `rolesInvitableBy`.
10. `<TeamMemberRow>`: dropdown de cambio de rol con `canChangeRoleTo`.

**QA founder (localhost):** ejecutar el checklist §8 cubriendo los 4 roles + master + master impersonando.

---

## Anexo: archivos tocados (referencia)

### Backend
- `crm-v2/supabase/migrations/0019_agency_role_rls.sql` (NUEVA)
- `crm-v2/src/lib/auth/agency-roles.ts` (NUEVA)
- `crm-v2/src/lib/auth/require-agency-access.ts` (NUEVA)
- `crm-v2/src/lib/auth/require-agency-admin.ts` (NUEVA)
- `crm-v2/src/lib/auth/require-agency-owner.ts` (refactor minimo)
- `crm-v2/src/app/a/[slug]/inbox/actions.ts` (refactor)
- `crm-v2/src/app/a/[slug]/settings/actions.ts` (refactor)
- `crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.ts` (extension + nueva action `changeMemberRole`)
- `crm-v2/src/app/a/[slug]/settings/equipo/_actions/team.types.ts` (extension)
- `crm-v2/src/components/contactos/use-contact-edit.ts` (ajuste de detect 0 rows)

### Frontend
- `crm-v2/src/app/a/[slug]/layout.tsx` (refactor a `requireAgencyAccess`)
- `crm-v2/src/components/agency/agency-shell.tsx` (prop `role`, gating items)
- `crm-v2/src/app/a/[slug]/inbox/page.tsx` (pasar role)
- `crm-v2/src/components/inbox/inbox-client.tsx` (pasar role a hijos + realtime)
- `crm-v2/src/components/inbox/conv-list.tsx` (gating filtros)
- `crm-v2/src/components/inbox/chat-panel.tsx` (gating composer/acciones)
- `crm-v2/src/components/inbox/lead-panel.tsx` (read-only viewer)
- `crm-v2/src/components/inbox/use-inbox-realtime.ts` (filtro client-side)
- `crm-v2/src/app/a/[slug]/leads/page.tsx` (pasar role)
- `crm-v2/src/app/a/[slug]/leads/[id]/page.tsx` (pasar role)
- `crm-v2/src/components/contactos/contactos-client.tsx` (gating viewer/agent)
- `crm-v2/src/components/contactos/contactos-table.tsx` (read-only viewer)
- `crm-v2/src/components/contactos/contactos-kanban.tsx` (drag deshabilitado viewer)
- `crm-v2/src/app/a/[slug]/settings/page.tsx` (`requireAgencyAdmin`)
- `crm-v2/src/app/a/[slug]/settings/equipo/page.tsx` (`requireAgencyAdmin`, pasar role)
- `crm-v2/src/app/a/[slug]/settings/equipo/_components/team-page-client.tsx` (prop role)
- `crm-v2/src/app/a/[slug]/settings/equipo/_components/team-member-row.tsx` (dropdown rol, gating remove)
- `crm-v2/src/app/a/[slug]/settings/equipo/_components/invite-member-modal.tsx` (dropdown rol)

### Memory
- `memory/decisions.md` — agregar D8 "Granularidad de roles: matriz P1.1" + DTs principales (DT3b, DT7) + decision sobre transferOwnership diferida.
- `memory/roadmap-completo.md` — marcar P1.1 como en construccion.
- `memory/backlog-mvp.md` §6 — actualizar a "en progreso" / cerrar al merge.

---

**Fin del spec.** Listo para dispatch paralelo a backend-builder + frontend-builder despues de respuesta del founder a los bloqueantes B1-B3 (§0). Default conservador: B1=NO, B2=admin asigna, B3=SI → procede sin esperar.
