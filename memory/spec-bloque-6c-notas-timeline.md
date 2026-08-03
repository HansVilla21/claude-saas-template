# Spec: BLOQUE-6C — Historial de notas con timeline (bot + humano)

**Fecha:** 2026-06-05
**Autor:** arquitecto
**Bloque:** 6 (Polish UX) — sub-fase C de 3.
**Trigger:** backlog §1.6 line 76 ("Historial de notas con iconito (bot/humano) + fecha/hora. Hoy solo hay un textarea de notas, sin historial") + §1.6 line 77 ("Auto-notas (toggle): que el bot pueda agregar notas al historial"). El bot YA ESCRIBE notas a `lead_notes` desde F4 (deployado 2026-05-29) — la UI las ignora porque sigue editando `leads.notes` legacy.
**Estado relativo:** independiente de 6A y 6B. Puede ir antes/despues/en paralelo. Tabla `lead_notes` existe desde migration 0014.
**Rutas afectadas:** `/a/[slug]/leads/[id]` (tab Notas) + `/a/[slug]/inbox` (lead-panel del inbox, mismo widget).

---

## 0. Resumen ejecutivo

6C reemplaza el textarea unico de `leads.notes` (legacy) por un **timeline append-only de notas con procedencia (bot|humano)** que LEE y ESCRIBE en `lead_notes` (tabla que ya existe + el bot ya escribe pero la UI ignora).

**Entrega:**

1. **Migration 0025** — agregar RLS policies a `lead_notes` (la migration 0014 creo tabla SIN RLS — bug latente cuando se haga read cliente-side via supabase-js). Incluir tambien indice por `(lead_id, created_at desc)` (ya existe — verificar) y trigger updated_at.
2. **Server actions** en `crm-v2/src/app/a/[slug]/leads/[id]/actions.ts` (existe): `listLeadNotes(slug, leadId, filter)`, `createLeadNote(slug, leadId, body)`, `updateLeadNote(slug, noteId, body)`, `deleteLeadNote(slug, noteId)`.
3. **Componentes nuevos:** `note-bubble.tsx` (entry con autor + timestamp + body + edit/delete inline), `note-composer.tsx` (input append-only + boton agregar), `notes-timeline.tsx` (lista de bubbles con filtros).
4. **Reemplazar `notes-tab.tsx`** del contact detail con timeline. **Reemplazar la tab notas del `lead-panel.tsx` del inbox** con el mismo timeline.
5. **Filtros pills:** `Todas | Solo mías | Solo bot`. Query string state (`?notes=mine`).
6. **Cap de visualizacion** — solo mostrar notas de **ultimos 30 dias** al primer load (importante: el bot puede llevar 7 dias escribiendo notas que el agente no vio; si dumpamos 200 notas viejas el agente se asusta). "Cargar mas antiguas" paginacion bajo demanda.
7. **Mantener `leads.notes` legacy como cache "ultima nota"** para no romper queries de Insights / Inbox que la usan. Documentar deprecation V2.

**Versiones resultantes:**
- DB: **1 migration nueva** `0025_lead_notes_rls_and_polish.sql`.
- Frontend: **3 components nuevos** + **3 archivos modificados** (notes-tab, lead-panel del inbox, server actions). El textarea legacy de notas se elimina de ambos lugares.
- Edge functions: **0 cambios** (bot ya escribe correcto a `lead_notes` desde F4).

**Hallazgos del audit (criticos):**

- ✅ `lead_notes` existe desde migration 0014. Schema (verificado): `id, agency_id, lead_id, body, created_by_kind (bot|human), created_by_user_id, created_at, updated_at`. **NO tiene `author_kind` ni `author_user_id` — la spec del founder usa otros nombres. Vamos con los nombres reales: `created_by_kind` y `created_by_user_id`.**
- ⚠️ **`lead_notes` NO tiene RLS habilitado**. Verificado: grep en `0019_agency_role_rls.sql` no muestra `lead_notes`. **Esto es un bug latente.** Hoy el bot escribe via service_role (bypass), pero si la UI cliente-facing usa supabase-js user-bound para SELECT, el SELECT funciona (porque RLS no esta habilitado: defecto = permisivo) PERO un atacante con credenciales podria SELECT notas de otra agency. Spec 6C incluye policies en migration 0025.
- ✅ El bot ya escribe a `lead_notes` con dedupe defensivo (`bot-actions/index.ts` linea 928-995). Dedupe 4h por (lead_id, body normalizado). Esto significa que cuando deploy UI, las notas del bot YA estan en la tabla.
- ⚠️ **`leads.notes` (text legacy) hoy se edita en 2 lugares:** `notes-tab.tsx` (contact detail) lineas 50-65 y `lead-panel.tsx` (inbox sidebar) lineas 312-330 + 583-630. Ambos hacen `update leads set notes`. **Decision:** dejar `leads.notes` como "ultima nota humana" (cache informativo), pero ya no editar desde UI. El editor pasa a ser `lead_notes`. Si la columna `notes` se necesita en queries (Insights), se actualiza desde el server action al crear nota humana — replica del body de la nota mas reciente.
- ⚠️ Existencia de N notas del bot acumuladas: Yairon/Robert tienen bot-c-v1 corriendo desde 2026-06-01. El bot escribe note.write cuando completa calificacion (memoria `feedback_capture_skills_for_every_process`). **Riesgo critico:** si el cliente ve 50+ notas del bot retroactivas, mala UX. Mitigacion: cap inicial 30 dias + filtro "Solo mías" default si hay >20 notas del bot.
- ⚠️ `notes-tab.tsx` actual recibe `initialNotes` desde la page server component. **Decision:** reemplazar el prop por `initialLeadNotes` (lista de `lead_notes`) y cambiar el patron a "stream de timeline". La page server component fetcheara con `listLeadNotes`.
- ⚠️ El `lead-panel.tsx` del inbox sidebar tambien tiene tab notas (lineas 583-630). Mismo reemplazo.

---

## 1. Problema / requerimiento

**Hoy:**

- El widget de "Notas" en la ficha del contacto y en el sidebar del inbox es un **textarea unico de `leads.notes`** que se sobreescribe. Si dos personas editan, una pisa la otra. No hay historial.
- El bot **YA escribe** notas via `bot-actions` `note.write` handler (deployado F4 2026-05-29) en `lead_notes`. PERO la UI no las muestra — quedan invisibles en la DB.
- El agente no sabe que el bot vio cosas relevantes ("lead pidio hablar con Carlos pero Carlos no atiende sabados", ejemplo del header de la migration 0014).
- Sin historial, no hay continuidad: si Roberto deja una nota el lunes, el agente que toma la conv el viernes no la lee.

**Lo que queremos:**

1. **Reemplazar el textarea unico** por un **timeline cronologico desc** de notas individuales (mas reciente arriba).
2. Cada nota muestra: **autor** (avatar humano o icono robot), **timestamp relativo** ("hace 3h"), **body**, badge de procedencia bot/humano.
3. **Input separado** para agregar nota nueva. Append-only.
4. **Filtros pills:** `Todas | Solo mías | Solo bot`.
5. **Edicion/borrado** solo si la nota es del autor (RLS check + UI guard).
6. **Cap inicial 30 dias** + "Cargar mas antiguas".
7. **Coexistencia con `leads.notes` legacy:** ya no se edita desde UI. Se mantiene como "ultima nota humana" para que queries existentes no rompan.

---

## 2. Estado actual relevante (auditado)

### 2.1 Schema real de `lead_notes` (migration 0014)

```sql
create table if not exists public.lead_notes (
    id               uuid primary key default gen_random_uuid(),
    agency_id        uuid not null references public.agencies(id) on delete cascade,
    lead_id          uuid not null references public.leads(id) on delete cascade,
    body             text not null,
    created_by_kind  text not null check (created_by_kind in ('bot','human')),
    created_by_user_id uuid references public.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists idx_lead_notes_lead
    on public.lead_notes(lead_id, created_at desc);
create index if not exists idx_lead_notes_agency
    on public.lead_notes(agency_id, created_at desc);
```

- Sin RLS policies. Sin `alter table enable row level security`.
- Indice por lead correctamente desc.
- `created_by_user_id` referencia `public.users` (la tabla custom del proyecto, NO `auth.users`). **Verificar:** `users` es la tabla espejo creada por trigger en signup. Si si, mantener. Si no, ajustar a `auth.users`.

### 2.2 Bot escritura (deployada F4)

`crm-v2/supabase/functions/bot-actions/index.ts`:

- Linea 936-945: SELECT ultima nota del lead para dedupe.
- Linea 968-994: INSERT con `created_by_kind='bot'`, `created_by_user_id=null`.

**Validacion 2026-06-05:** consultar Supabase `select count(*) from lead_notes where created_by_kind='bot' and created_at > now() - interval '7 days'`. Si > 50, **importante riesgo R-BACKLOG-NOTAS** (cliente vera dump al abrir contact).

### 2.3 UI legacy actual

**`notes-tab.tsx` (contact detail):**
- Linea 38-65: `NotesTab({ supabase, leadId, initialNotes, readOnly, onSaved })`.
- Persiste `leads.notes` via supabase-js user-bound (linea 55).
- Autosave debounced 1s.
- Comentario explicito linea 7-8: "el historial de notas con procedencia que pidió el cliente necesita una tabla nueva — es backlog aparte. Acá solo el campo notes."

**`lead-panel.tsx` (inbox sidebar):**
- Linea 40: tab type `'info' | 'insights' | 'notes'`.
- Linea 131-165: state `notes` + reset cuando cambia lead.
- Linea 324: UPDATE `leads.notes` via supabase-js.
- Linea 583-630: render del tab notas (textarea + status).

Ambos reemplazan a la NUEVA implementacion.

### 2.4 Coexistencia con `leads.notes`

**Auditoria de uso del campo `leads.notes`:**

| Lugar | Uso | Decision |
|---|---|---|
| `notes-tab.tsx` | Editor textarea | Remover (reemplazado) |
| `lead-panel.tsx` | Editor textarea | Remover (reemplazado) |
| Insights / Analytics | ? (verificar grep) | Si lo usan, replicar desde server action al crear nota humana |
| Bot prompt / context | El bot lee `leads.notes`? | Verificar `bot-actions` y workflow N8N. **Si lo usa, hay que decidir si sigue siendo `leads.notes` "ultima nota" o consolidar todas las notas** |

**Decision V1:** mantener `leads.notes` como cache de "ultima nota humana" para no romper consumidores. El server action `createLeadNote` con `created_by_kind='human'` tambien hace `update leads set notes = body where id = lead_id`.

**V2:** deprecar `leads.notes` completamente cuando todos los consumidores migren a leer `lead_notes`.

### 2.5 Server actions del lead

`crm-v2/src/app/a/[slug]/leads/[id]/actions.ts` — file existe. Necesita verificar firmas actuales. **Spec asume agregar 4 actions nuevas + reusar `requireAgencyAccess(slug)`.**

### 2.6 Agency_role gating

- SELECT (ver notas): cualquier member (incluido viewer read-only).
- INSERT (crear nota humana): agent+ (NO viewer — viewer es read-only).
- UPDATE (editar): solo el autor (`created_by_user_id = auth.uid()`).
- DELETE (borrar): solo el autor.

### 2.7 Recordatorio Git

Feature branch + Vercel preview + PR + merge a main. Founder aplica 0025 via Dashboard.

---

## 3. Decisiones tecnicas

### 3.1 Mantener `leads.notes` como cache "ultima nota humana"

**Decision:** NO eliminar la columna `leads.notes` en V1.

**Razones:**
- Riesgo no auditado: algun consumidor (panel admin, exports, Insights) puede leerla. Eliminar rompe.
- El bot puede usarla en su prompt como contexto rapido ("aqui esta el resumen actual del lead"). Si la borramos sin auditar el workflow N8N, riesgo.

**Como funciona:**
- `createLeadNote` con `created_by_kind='human'` ALSO hace `update leads set notes = body where id = lead_id`. Mantiene "ultima nota humana" actualizada.
- Notas del bot NO actualizan `leads.notes` (mantenemos separacion).
- V2: auditoria de consumidores → si nadie depende de `leads.notes`, drop column.

### 3.2 Cap inicial 30 dias + paginacion bajo demanda

**Decision:** primera carga del timeline limita a notas de los ultimos 30 dias (`where created_at > now() - interval '30 days'`). Si hay mas, mostrar boton "Cargar mas antiguas".

**Por que:**
- El bot acumula notas — un lead activo puede tener 20+ notas en 1 mes.
- Si abrimos la conv y vemos 50 notas, mala UX.
- 30 dias es ventana razonable: cubre el periodo de actividad reciente.

**Paginacion:** cursor-based con `created_at < <last_created_at>`. NO offset (offsets caros + race con INSERT).

```typescript
async function listLeadNotes(slug, leadId, opts: {
  filter: 'all' | 'mine' | 'bot';
  cursor?: string;  // ISO timestamp
  limit?: number;   // default 30
}) {
  // SELECT * FROM lead_notes
  // WHERE lead_id = ? AND agency_id = ?
  //   [AND created_by_kind = 'bot' | created_by_user_id = ?]
  //   AND created_at < cursor (si cursor)
  //   AND created_at > now() - interval '30 days' (si no cursor)
  // ORDER BY created_at DESC LIMIT limit
}
```

**Primera carga:** `cursor=null, limit=30`. Si retorna 30 + indicador "hay mas" (1 query extra con `count` o checking si llego al limit).

**Paginar:** click "Cargar mas antiguas" → llama con `cursor=<oldest_loaded>, limit=30`. Concatena.

### 3.3 Filtros pills con query string state

**Decision:** estado de filtro en URL via search param `?notes=mine` (o `bot` o ausente=all). Navegacion preserva filtro.

**Implementacion:** `useSearchParams` + `router.replace` con `scroll: false`. Sin recargar.

### 3.4 Edicion inline (no popup)

**Decision:** click "Editar" en nota propia → el `<p>` se convierte en `<textarea>` con valor + botones "Guardar" / "Cancelar". Patron del Notion/Linear modern.

**Por que NO popup:**
- Popup interrumpe contexto. Inline mantiene la nota en su lugar relativo al timeline.
- Menos componentes nuevos.

**Implementacion:** state local `editingId: string | null`. Si match, render textarea; sino render p.

### 3.5 Borrado con confirmacion suave

**Decision:** click boton trash → estado `confirmingDelete: string | null` muestra "¿Borrar? [Sí] [Cancelar]" inline en lugar del bubble. Click "Sí" → server action. Sin modal.

### 3.6 NO soft-delete V1

**Decision:** DELETE row real. Si V2 quiere undo, agregamos `deleted_at`.

**Trade-off:** el agente puede arrepentirse de borrar. Mitigacion: confirmacion suave + toast con "Deshacer" durante 5s post-delete (V1.5 si entra rapido).

### 3.7 Auto-refresh con realtime opcional

**Decision V1:** NO realtime para `lead_notes`. La UI re-fetchea con `revalidatePath` post-mutation.

**Por que NO realtime V1:**
- Realtime cuesta un canal abierto extra por contact open. Multiplicar por user × tab = costoso vs free tier.
- Las notas del bot llegan en bursts cortos (1 nota cuando termina calificacion). Refresh manual o navegar a la conv refresca.

**V2:** agregar realtime en `use-inbox-realtime.ts` para que las notas del bot aparezcan en vivo cuando estas mirando la ficha.

### 3.8 Mismo widget en inbox sidebar y contact detail

**Decision:** crear `notes-timeline.tsx` reutilizable. Render-prop o boolean `compact` para variar densidad.

- Contact detail: ancho completo, bubbles grandes.
- Inbox sidebar: ancho 280-320px, bubbles compactos.

Mismo loader, mismo composer, mismas actions.

### 3.9 Cero impacto en el bot

**Decision:** NO modificar `bot-actions` ni N8N. El bot ya escribe en el formato correcto.

**Verificacion:** la spec 0014 alinea `created_by_kind` y `created_by_user_id`. El handler `note.write` (linea 968-980 de bot-actions) inserta con esos campos. UI los lee.

### 3.10 Optimistic UI al crear nota

**Decision:** al click "Agregar":
1. Insertar bubble localmente con `pending: true` + body.
2. Llamar action.
3. Si OK, refrescar fila con datos reales (id, created_at del server). Quitar `pending`.
4. Si fallo, marcar `failed: true` con boton "Reintentar".

UX rapida sin esperar round-trip.

---

## 4. Modelo de datos

### 4.1 Migration 0025 — RLS + polish para lead_notes

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0025: lead_notes RLS + polish (Bloque 6C)
-- =============================================================================
-- BUG LATENTE FIX: la migration 0014 creo `lead_notes` SIN habilitar RLS.
-- Hoy el bot escribe via service_role (bypass), pero cualquier cliente con
-- credenciales puede SELECT sin filtro. Esta migration habilita RLS y agrega
-- policies multi-tenant.
--
-- Tambien agrega:
--   - Trigger updated_at (si no existe el helper, crearlo).
--   - Verifica que indice (lead_id, created_at desc) existe (ya esta en 0014).
--
-- Idempotente.
-- =============================================================================

-- 1. Helper updated_at trigger (si no existe). Patron del proyecto.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'tg_set_updated_at') then
    create or replace function public.tg_set_updated_at()
    returns trigger language plpgsql as $func$
    begin new.updated_at = now(); return new; end;
    $func$;
  end if;
end $$;

-- 2. Trigger updated_at en lead_notes (idempotente)
drop trigger if exists trg_lead_notes_updated_at on public.lead_notes;
create trigger trg_lead_notes_updated_at
    before update on public.lead_notes
    for each row execute function public.tg_set_updated_at();

-- 3. Habilitar RLS
alter table public.lead_notes enable row level security;

-- 4. Policies
-- SELECT: cualquier member de la agency puede leer
drop policy if exists "lead_notes_select" on public.lead_notes;
create policy "lead_notes_select"
    on public.lead_notes for select
    using (is_member_of(agency_id) or is_master());

-- INSERT: cualquier authenticated member que pertenezca a la agency.
-- El gate por rol (no viewer) se hace en el server action.
-- Para inserts del bot, service_role bypassa RLS.
drop policy if exists "lead_notes_insert" on public.lead_notes;
create policy "lead_notes_insert"
    on public.lead_notes for insert
    with check (is_member_of(agency_id) or is_master());

-- UPDATE: solo el autor, si es human. El bot no edita.
drop policy if exists "lead_notes_update_own" on public.lead_notes;
create policy "lead_notes_update_own"
    on public.lead_notes for update
    using (
      (is_member_of(agency_id) and
       created_by_kind = 'human' and
       created_by_user_id = auth.uid())
      or is_master()
    )
    with check (
      (is_member_of(agency_id) and
       created_by_kind = 'human' and
       created_by_user_id = auth.uid())
      or is_master()
    );

-- DELETE: igual que UPDATE — solo autor humano + master
drop policy if exists "lead_notes_delete_own" on public.lead_notes;
create policy "lead_notes_delete_own"
    on public.lead_notes for delete
    using (
      (is_member_of(agency_id) and
       created_by_kind = 'human' and
       created_by_user_id = auth.uid())
      or is_master()
    );

-- 5. Comments
comment on policy "lead_notes_select" on public.lead_notes is
    'Cualquier member de la agency lee las notas (humanas y del bot).';
comment on policy "lead_notes_update_own" on public.lead_notes is
    'Solo el autor humano puede editar su nota. Notas del bot inmutables.';
comment on policy "lead_notes_delete_own" on public.lead_notes is
    'Solo el autor humano puede borrar su nota. Notas del bot solo se borran via service_role / master.';
```

**Notas para el builder:**
- Verificar si `auth.uid()` esta disponible en el contexto de la policy (es funcion standard de Supabase). Si la migration 0019 ya lo usa, OK.
- `is_member_of` y `is_master` ya existen desde 0006_rls.

### 4.2 Estimacion de tamano

- Tipico: 5-20 notas / lead × 100 leads activos / agency = 500-2000 rows / agency.
- 50 agencies × 1000 rows = 50K rows. Negligible.
- Indices existentes (lead, agency) cubren el caso de uso.

---

## 5. Estructura de archivos a crear / modificar

### 5.1 Crear

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `crm-v2/supabase/migrations/0025_lead_notes_rls_and_polish.sql` | SQL | RLS + trigger updated_at + verificacion |
| `crm-v2/src/lib/leads/notes-types.ts` | TS | Type `LeadNote`, `LeadNotesFilter`, helpers |
| `crm-v2/src/components/leads/notes-timeline.tsx` | client component | Timeline reusable (lista + filters + composer + paginacion) |
| `crm-v2/src/components/leads/note-bubble.tsx` | client component | Render de una nota con autor + timestamp + body + edit/delete inline |
| `crm-v2/src/components/leads/note-composer.tsx` | client component | Input + boton agregar |

### 5.2 Modificar

| Archivo | Cambio |
|---|---|
| `crm-v2/src/app/a/[slug]/leads/[id]/actions.ts` | Agregar `listLeadNotes`, `createLeadNote`, `updateLeadNote`, `deleteLeadNote` |
| `crm-v2/src/components/contactos/detail/notes-tab.tsx` | **REEMPLAZAR completamente**: el componente actual (textarea de `leads.notes`) se convierte en wrapper que renderiza `<NotesTimeline leadId={leadId} agencyId={...} canEdit={!readOnly} />`. Eliminar el codigo legacy de autosave |
| `crm-v2/src/components/inbox/lead-panel.tsx` | En el tab 'notes' (linea 583-630), reemplazar el textarea por `<NotesTimeline compact ... />`. Eliminar el state `notes`, `notesState`, refs y persistencias relacionadas |
| `crm-v2/src/app/a/[slug]/leads/[id]/page.tsx` (donde se carga `notes-tab.tsx`) | Cambiar el prop `initialNotes` por `initialLeadNotes` (pre-cargados con `listLeadNotes` server-side, limit 30) |

### 5.3 NO tocar

- ❌ `bot-actions` — bot escribe correcto.
- ❌ N8N — irrelevante.
- ❌ La columna `leads.notes` (mantener como cache hasta deprecation V2).
- ❌ Otras tabs del lead (Info, Insights, Conversacion, Actividad).

### 5.4 Detalle de actions

```typescript
// crm-v2/src/app/a/[slug]/leads/[id]/actions.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAgencyAccess } from '@/lib/auth/require-agency-access';
import { isViewer } from '@/lib/auth/agency-roles';

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_DAYS = 30;

export async function listLeadNotes(
  slug: string,
  leadId: string,
  opts?: { filter?: 'all' | 'mine' | 'bot'; cursor?: string; limit?: number },
) {
  const ctx = await requireAgencyAccess(slug);
  const admin = createAdminClient();
  let q = admin
    .from('lead_notes')
    .select(`
      id, body, created_by_kind, created_by_user_id, created_at, updated_at,
      author:created_by_user_id ( id, full_name, email )
    `)
    .eq('agency_id', ctx.agencyId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? DEFAULT_LIMIT);

  if (opts?.filter === 'bot') {
    q = q.eq('created_by_kind', 'bot');
  } else if (opts?.filter === 'mine') {
    q = q.eq('created_by_kind', 'human').eq('created_by_user_id', ctx.userId);
  }

  if (opts?.cursor) {
    q = q.lt('created_at', opts.cursor);
  } else {
    // Primera carga: cap 30 dias
    const cutoff = new Date(Date.now() - DEFAULT_WINDOW_DAYS * 86400 * 1000).toISOString();
    q = q.gt('created_at', cutoff);
  }

  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, notes: data ?? [] };
}

export async function createLeadNote(slug: string, leadId: string, body: string) {
  const ctx = await requireAgencyAccess(slug);
  if (isViewer(ctx.role)) return { ok: false, error: 'read_only_role' };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'body_required' };
  if (trimmed.length > 2000) return { ok: false, error: 'body_too_long' };

  const admin = createAdminClient();
  // Verificar que el lead pertenece a la agency
  const { data: lead } = await admin
    .from('leads')
    .select('id, agency_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead || lead.agency_id !== ctx.agencyId) {
    return { ok: false, error: 'lead_not_found' };
  }

  const { data: inserted, error } = await admin
    .from('lead_notes')
    .insert({
      agency_id: ctx.agencyId,
      lead_id: leadId,
      body: trimmed,
      created_by_kind: 'human',
      created_by_user_id: ctx.userId,
    })
    .select('id, body, created_by_kind, created_by_user_id, created_at, updated_at')
    .single();
  if (error) return { ok: false, error: error.message };

  // Mantener leads.notes como cache de "ultima nota humana"
  await admin
    .from('leads')
    .update({ notes: trimmed })
    .eq('id', leadId);

  revalidatePath(`/a/${slug}/leads/${leadId}`);
  return { ok: true as const, note: inserted };
}

export async function updateLeadNote(slug: string, noteId: string, body: string) {
  const ctx = await requireAgencyAccess(slug);
  if (isViewer(ctx.role)) return { ok: false, error: 'read_only_role' };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'body_required' };
  if (trimmed.length > 2000) return { ok: false, error: 'body_too_long' };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('lead_notes')
    .select('id, agency_id, created_by_kind, created_by_user_id, lead_id')
    .eq('id', noteId)
    .maybeSingle();
  if (!existing || existing.agency_id !== ctx.agencyId) {
    return { ok: false, error: 'note_not_found' };
  }
  if (existing.created_by_kind !== 'human' ||
      existing.created_by_user_id !== ctx.userId) {
    return { ok: false, error: 'not_your_note' };
  }

  const { error } = await admin
    .from('lead_notes')
    .update({ body: trimmed })
    .eq('id', noteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/a/${slug}/leads/${existing.lead_id}`);
  return { ok: true };
}

export async function deleteLeadNote(slug: string, noteId: string) {
  const ctx = await requireAgencyAccess(slug);
  if (isViewer(ctx.role)) return { ok: false, error: 'read_only_role' };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('lead_notes')
    .select('id, agency_id, created_by_kind, created_by_user_id, lead_id')
    .eq('id', noteId)
    .maybeSingle();
  if (!existing || existing.agency_id !== ctx.agencyId) {
    return { ok: false, error: 'note_not_found' };
  }
  if (existing.created_by_kind !== 'human' ||
      existing.created_by_user_id !== ctx.userId) {
    return { ok: false, error: 'not_your_note' };
  }

  const { error } = await admin
    .from('lead_notes')
    .delete()
    .eq('id', noteId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/a/${slug}/leads/${existing.lead_id}`);
  return { ok: true };
}
```

**Caveat join:** Supabase select foreign key syntax `author:created_by_user_id ( ... )` requiere que la relacion este registrada. Si la FK existe (esta), funciona. Si falla, fallback a fetch separado de `users` por IDs.

### 5.5 Detalle de `notes-timeline.tsx`

```typescript
'use client';

import { useState, useEffect, useTransition } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { NoteBubble } from './note-bubble';
import { NoteComposer } from './note-composer';
import { listLeadNotes } from '@/app/a/[slug]/leads/[id]/actions';
import type { LeadNote, LeadNotesFilter } from '@/lib/leads/notes-types';

export function NotesTimeline({
  slug,
  leadId,
  initialNotes,
  initialHasMore,
  currentUserId,
  canEdit,           // viewer = false
  compact = false,   // inbox sidebar = true
}: {
  slug: string;
  leadId: string;
  initialNotes: LeadNote[];
  initialHasMore: boolean;
  currentUserId: string;
  canEdit: boolean;
  compact?: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filter: LeadNotesFilter =
    (sp.get('notes') as LeadNotesFilter) ?? 'all';

  const [notes, setNotes] = useState<LeadNote[]>(initialNotes);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, startTransition] = useTransition();

  // Refetch cuando cambia filtro
  useEffect(() => {
    startTransition(async () => {
      const res = await listLeadNotes(slug, leadId, { filter });
      if (res.ok) {
        setNotes(res.notes);
        setHasMore(res.notes.length === 30);
      }
    });
  }, [filter, slug, leadId]);

  const setFilter = (f: LeadNotesFilter) => {
    const params = new URLSearchParams(sp);
    if (f === 'all') params.delete('notes');
    else params.set('notes', f);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const loadMore = () => {
    if (!notes.length || loading) return;
    const cursor = notes[notes.length - 1].created_at;
    startTransition(async () => {
      const res = await listLeadNotes(slug, leadId, { filter, cursor });
      if (res.ok) {
        setNotes(prev => [...prev, ...res.notes]);
        setHasMore(res.notes.length === 30);
      }
    });
  };

  const handleNoteCreated = (note: LeadNote) => {
    // Si el filtro actual lo excluye, igual lo agregamos arriba.
    setNotes(prev => [note, ...prev]);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {canEdit && (
        <NoteComposer
          slug={slug}
          leadId={leadId}
          onCreated={handleNoteCreated}
          compact={compact}
        />
      )}
      {/* Pills filter */}
      <div className="flex gap-1.5">
        <FilterPill label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterPill label="Solo mías" active={filter === 'mine'} onClick={() => setFilter('mine')} />
        <FilterPill label="Solo bot" active={filter === 'bot'} onClick={() => setFilter('bot')} />
      </div>
      {/* Lista */}
      {notes.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface px-3 py-6 text-center text-sm text-muted">
          {filter === 'all'
            ? 'Sin notas todavía.'
            : filter === 'mine'
            ? 'No tenés notas en este contacto.'
            : 'El bot no ha escrito notas en este contacto.'}
        </div>
      ) : (
        notes.map(n => (
          <NoteBubble
            key={n.id}
            note={n}
            currentUserId={currentUserId}
            slug={slug}
            compact={compact}
          />
        ))
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted disabled:opacity-50"
        >
          {loading ? 'Cargando…' : 'Cargar más antiguas'}
        </button>
      )}
    </div>
  );
}
```

### 5.6 Detalle de `note-bubble.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Robot, PencilSimple, Trash, Check, X } from '@phosphor-icons/react/dist/ssr';
import { Avatar } from '@/components/inbox/bits';
import { updateLeadNote, deleteLeadNote } from '@/app/a/[slug]/leads/[id]/actions';
import { toast } from 'sonner';
import type { LeadNote } from '@/lib/leads/notes-types';

function relativeTime(iso: string): string {
  // "hace 3h", "ayer", "12 mayo" — copiar patron de message-bubble
  // ...
}

export function NoteBubble({
  note,
  currentUserId,
  slug,
  compact,
}: {
  note: LeadNote;
  currentUserId: string;
  slug: string;
  compact?: boolean;
}) {
  const isBot = note.created_by_kind === 'bot';
  const isOwnNote = !isBot && note.created_by_user_id === currentUserId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await updateLeadNote(slug, note.id, draft);
    setSaving(false);
    if (!res.ok) { toast.error('No se pudo guardar'); return; }
    setEditing(false);
  };

  const del = async () => {
    setSaving(true);
    const res = await deleteLeadNote(slug, note.id);
    setSaving(false);
    if (!res.ok) toast.error('No se pudo borrar');
  };

  return (
    <div className="flex gap-2.5 rounded-lg border border-line bg-surface p-3">
      {/* Avatar / icono */}
      <div className="shrink-0">
        {isBot ? (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-accent">
            <Robot size={16} weight="fill" />
          </div>
        ) : (
          <Avatar name={note.author?.full_name ?? '?'} size={32} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2 text-xs">
          <span className="font-semibold text-ink">
            {isBot ? 'Bot' : note.author?.full_name ?? 'Equipo'}
          </span>
          {isBot && (
            <span className="rounded-full bg-accent-soft px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.08em] text-accent">
              bot
            </span>
          )}
          <span className="text-muted">{relativeTime(note.created_at)}</span>
          {note.updated_at !== note.created_at && (
            <span className="text-muted">(editado)</span>
          )}
        </div>
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full resize-y rounded-md border border-line bg-surface-muted px-2 py-1.5 text-sm leading-snug text-ink outline-none focus:border-line-strong"
              rows={3}
            />
            <div className="mt-1.5 flex gap-1.5">
              <button onClick={save} disabled={saving} className="...">
                <Check size={12} /> Guardar
              </button>
              <button onClick={() => { setEditing(false); setDraft(note.body); }} className="...">
                <X size={12} /> Cancelar
              </button>
            </div>
          </>
        ) : confirmingDelete ? (
          <>
            <p className="text-sm text-ink">{note.body}</p>
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="text-pale-red-ink">¿Borrar esta nota?</span>
              <button onClick={del} disabled={saving} className="rounded-md bg-pale-red-ink px-2 py-0.5 text-white">Sí, borrar</button>
              <button onClick={() => setConfirmingDelete(false)} className="text-muted">Cancelar</button>
            </div>
          </>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words text-sm leading-snug text-ink">{note.body}</p>
            {isOwnNote && (
              <div className="mt-1.5 flex gap-2 text-xs text-muted">
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 hover:text-ink">
                  <PencilSimple size={11} /> Editar
                </button>
                <button onClick={() => setConfirmingDelete(true)} className="inline-flex items-center gap-1 hover:text-pale-red-ink">
                  <Trash size={11} /> Borrar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

### 5.7 Detalle de `note-composer.tsx`

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Plus } from '@phosphor-icons/react/dist/ssr';
import { createLeadNote } from '@/app/a/[slug]/leads/[id]/actions';
import { toast } from 'sonner';

export function NoteComposer({ slug, leadId, onCreated, compact }: {
  slug: string;
  leadId: string;
  onCreated: (note: LeadNote) => void;
  compact?: boolean;
}) {
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const res = await createLeadNote(slug, leadId, trimmed);
      if (!res.ok) {
        toast.error(`No se pudo agregar: ${res.error}`);
        return;
      }
      onCreated(res.note);
      setBody('');
    });
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Agregá una nota interna…"
        rows={compact ? 2 : 3}
        className="w-full resize-none border-0 bg-transparent p-1 text-sm leading-snug text-ink outline-none placeholder:text-muted"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>Visible solo para tu equipo</span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !body.trim()}
          className="inline-flex items-center gap-1 rounded-md bg-ink px-2.5 py-1 text-canvas disabled:opacity-50"
        >
          <Plus size={11} /> Agregar
        </button>
      </div>
    </div>
  );
}
```

### 5.8 Reemplazo en `notes-tab.tsx`

```typescript
// crm-v2/src/components/contactos/detail/notes-tab.tsx (NUEVO)

'use client';

import { NotesTimeline } from '@/components/leads/notes-timeline';
import type { LeadNote } from '@/lib/leads/notes-types';

export function NotesTab({
  slug,
  leadId,
  initialNotes,
  initialHasMore,
  currentUserId,
  readOnly = false,
}: {
  slug: string;
  leadId: string;
  initialNotes: LeadNote[];
  initialHasMore: boolean;
  currentUserId: string;
  readOnly?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted">
          Historial de notas
        </h3>
      </div>
      <NotesTimeline
        slug={slug}
        leadId={leadId}
        initialNotes={initialNotes}
        initialHasMore={initialHasMore}
        currentUserId={currentUserId}
        canEdit={!readOnly}
      />
    </div>
  );
}
```

**El page server `crm-v2/src/app/a/[slug]/leads/[id]/page.tsx`** debe pre-cargar:

```typescript
const notesRes = await listLeadNotes(slug, leadId);
const initialNotes = notesRes.ok ? notesRes.notes : [];
const initialHasMore = initialNotes.length === 30;
// ...
<NotesTab
  slug={slug}
  leadId={leadId}
  initialNotes={initialNotes}
  initialHasMore={initialHasMore}
  currentUserId={ctx.userId}
  readOnly={isViewer(ctx.role)}
/>
```

### 5.9 Reemplazo en `lead-panel.tsx` (inbox sidebar)

En el tab `'notes'` (linea 583-630), reemplazar el bloque entero por:

```tsx
{tab === 'notes' && (
  <NotesTimeline
    slug={slug}
    leadId={lead.id}
    initialNotes={[]}
    initialHasMore={false}
    currentUserId={currentUserId}
    canEdit={!viewerMode}
    compact
  />
)}
```

**Caveat:** el `lead-panel.tsx` recibe `lead` por props desde inbox-client. NO tenia `slug` ni `currentUserId` necesariamente. **Hay que propagarlos**. Verificar en el inbox-client/page que se pasan.

**Alternativa:** lead-panel pasa `leadId` y al montar el tab notes, NotesTimeline carga via fetch client-side (no pre-render server). Patron actual del lead-panel (es client component).

Implementacion sugerida: NotesTimeline tiene un mode "lazy-load" — si `initialNotes` esta vacio Y `initialHasMore=false`, en mount llama `listLeadNotes`.

```typescript
useEffect(() => {
  if (initialNotes.length === 0 && !initialHasMore) {
    startTransition(async () => {
      const res = await listLeadNotes(slug, leadId, { filter });
      if (res.ok) {
        setNotes(res.notes);
        setHasMore(res.notes.length === 30);
      }
    });
  }
}, [/* once */]);
```

Esto cubre el caso de inbox sidebar (client-only).

---

## 6. UX / layout

### 6.1 Contact detail — tab Notas (desktop)

```
+================================================+
| Historial de notas                              |
| ---------------------------------------------- |
| [📝 Agregá una nota interna…]                  |
|                          [Agregar (Ctrl+Enter)] |
| ---------------------------------------------- |
| [Todas] [Solo mías] [Solo bot]                  |
| ---------------------------------------------- |
| [Hans] hace 5 min                               |
|   "Lead pidio hablar con Roberto"               |
|   [Editar] [Borrar]                             |
|                                                 |
| [🤖 Bot] hace 2h                                |
|   "Lead calificado: presupuesto 200k,           |
|    zona Santa Ana, urgencia alta"               |
|                                                 |
| [Roberto] ayer                                  |
|   "Confirmo visita sabado 10am"                 |
|                                                 |
| [🤖 Bot] hace 3 dias                            |
|   "Lead solicita info de propiedad XYZ"         |
|                                                 |
| [Cargar más antiguas]                           |
+================================================+
```

### 6.2 Inbox sidebar — tab Notas (compact, mobile)

Igual layout pero anchura reducida + texto un poco mas chico. Boton "Agregar" ocupa fila propia.

### 6.3 Estados de filtro

- Default: `Todas` activa.
- Si > 20 notas del bot al primer load: toast info "El bot escribio X notas. Usá 'Solo mías' para ver solo lo tuyo".

### 6.4 Edicion inline

```
[Hans] hace 5 min
+--------------------------------+
| Lead pidio hablar con Roberto  |
| esta semana                    |
+--------------------------------+
[✓ Guardar] [X Cancelar]
```

### 6.5 Confirmacion delete

```
[Hans] hace 5 min
"Lead pidio hablar con Roberto"

¿Borrar esta nota?  [Sí, borrar] [Cancelar]
```

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Prob | Impacto | Mitigacion |
|---|---|---|---|---|
| **R-FREETIER** | lead_notes crece con cada nota del bot | Media | Bajo | Indices ya cubren. Tamano negligible vs 500 MB DB free. Si crece descontrolado, V2 agrega cleanup pg_cron |
| **R-BACKLOG-NOTAS** | Cliente abre contact y ve 50 notas del bot retroactivas | Alta | Medio | Cap 30 dias + toast informativo + filtro "Solo mías" disponible siempre. Verificar `count(*) where created_by_kind='bot'` antes de deploy |
| **R-RLS-MISSING** | Hoy lead_notes esta sin RLS. SI el deploy de UI ocurre ANTES de migration 0025, los SELECT desde supabase-js cliente pueden leer cross-agency | Media | Alto | Deploy order: migration 0025 PRIMERO, luego UI. Si por error la UI llega antes, las server actions usan admin client con verificacion explicita agency_id — defensa de segundo nivel cubre |
| R-EDIT-OWN-RACE | Dos sesiones del mismo user editan misma nota | Baja | Bajo | Last-write-wins. `updated_at` marca cual gano |
| R-DEPRECATION-LEAKS | Algun consumidor lee `leads.notes` y no se actualiza con la nota mas reciente del bot | Media | Bajo | V1 mantenemos `leads.notes` con replica de la ultima nota humana SOLO (no del bot). Si V2 audit muestra consumer, decidir |
| R-DELETE-IRREVERSIBLE | Agente borra nota y se arrepiente | Media | Bajo | Confirmacion suave. V1.5 puede agregar undo toast 5s |
| R-PAGINATION-RACE | Click "Cargar mas" mientras alguien crea nota nueva | Baja | Bajo | Cursor by created_at desc + lt cursor garantiza no duplicar. Si una nota nueva entra en window medio, aparece arriba (filter por nuevo fetch) |
| R-USER-DELETED | autor `created_by_user_id` apunta a user que se borro de la agency | Baja | Bajo | `on delete set null` en FK. UI muestra "Equipo (autor borrado)" |
| R-VIEWER-COMPOSER | Viewer ve composer pero al click action rebota | Baja | Bajo | `canEdit={!isViewer(role)}` oculta composer. Action tambien valida |
| R-NOTE-XSS | Body con `<script>` | Baja | Alto | Render via `<p>` con texto plain (React escapa por default). Si V2 quiere markdown, sanitizar |
| R-CONCURRENT-VIEW | Si 2 agentes miran el mismo contact, no ven nota del otro hasta refresh | Media | Bajo | V1 sin realtime; revalidatePath solo afecta al que escribe. Aceptable V1 |
| R-INBOX-PROPS | lead-panel necesita slug + currentUserId nuevos | Media | Bajo | Verificar antes de codear que props se propagan desde inbox-client |

---

## 8. Plan de testing

### 8.1 T-MIGRATION

- Aplicar 0025.
- ✅ RLS habilitado: `select relrowsecurity from pg_class where relname = 'lead_notes'` → true.
- ✅ Policies creadas: `select * from pg_policies where tablename = 'lead_notes'` → 4 rows.
- ✅ Trigger `trg_lead_notes_updated_at` existe.

### 8.2 T-PRE-MIGRATION-AUDIT

ANTES de deploy:
```sql
select count(*), created_by_kind from lead_notes
where created_at > now() - interval '7 days'
group by created_by_kind;
```
Tomar nota: si bot > 50, comunicar al founder antes de mostrar UI.

### 8.3 T-CREATE-HUMAN

- Login como user A en agency X.
- Ir a contact detail.
- Tab Notas. Tipear "Test nota Hans". Click Agregar.
- ✅ Toast / appear optimistic.
- ✅ Aparece arriba del timeline con avatar Hans + "hace pocos seg".
- ✅ DB: row con `created_by_kind='human'`, `created_by_user_id=<userA>`.
- ✅ `leads.notes` actualizada con "Test nota Hans".

### 8.4 T-EDIT-OWN

- Click "Editar" en nota propia.
- ✅ Textarea aparece con valor.
- Cambiar a "Test nota Hans editada". Guardar.
- ✅ Body actualizado. Indicador "(editado)" aparece.
- ✅ DB: `updated_at` diferente de `created_at`.

### 8.5 T-EDIT-OTHER

- Login como user B (mismo agency).
- ✅ Nota del user A NO muestra botones Editar / Borrar.
- Intentar via dev tools forzar updateLeadNote.
- ✅ Server rechaza con `not_your_note`.

### 8.6 T-DELETE-OWN

- Click "Borrar" en nota propia.
- ✅ Confirm inline aparece.
- Click "Sí, borrar".
- ✅ Nota desaparece.
- ✅ DB: row eliminada.

### 8.7 T-BOT-NOTES-RENDER

- Pre-condicion: bot ya escribio notas (verificar `select * from lead_notes where created_by_kind='bot' limit 1`).
- Abrir contact con bot notes.
- ✅ Aparecen con icono robot + badge "bot".
- ✅ Sin botones Editar / Borrar.

### 8.8 T-FILTERS

- Crear: 2 notas humanas + 1 del bot (manual INSERT si necesario).
- Click pill "Solo mías" → URL cambia a `?notes=mine`. Solo notas humanas del current user visibles.
- Click "Solo bot" → solo notas del bot visibles.
- Click "Todas" → todas visibles. URL sin param.

### 8.9 T-30DAY-CAP

- Crear nota con `created_at = now() - interval '45 days'` (manual INSERT).
- ✅ Primera carga NO la muestra.
- Click "Cargar mas antiguas".
- ✅ Aparece.

### 8.10 T-PAGINATION

- Tener > 30 notas.
- ✅ Primera carga: 30 + boton "Cargar mas".
- Click "Cargar mas".
- ✅ Carga 30 mas. Boton sigue (hasta vaciar).

### 8.11 T-ROLE-VIEWER

- Login como viewer.
- ✅ Timeline visible. Composer NO visible.
- Notas humanas suyas: NO botones Editar / Borrar (porque viewer no escribio nada nunca).
- Intentar forzar via dev tools.
- ✅ Server action rechaza con `read_only_role`.

### 8.12 T-CROSS-AGENCY-RLS

- Crear nota en agency A.
- Login como user de agency B.
- Intentar SELECT directo via supabase-js (`from('lead_notes').select('*').eq('agency_id', '<aid_A>')`).
- ✅ Vacio (RLS bloquea).

### 8.13 T-INBOX-SIDEBAR

- Abrir conv del lead en inbox.
- Ir a tab notas del sidebar.
- ✅ Mismo timeline + composer compact.
- Agregar nota desde inbox.
- Ir a contact detail.
- ✅ Nota aparece tambien.

### 8.14 T-LEGACY-COEXISTENCE

- Crear nota humana.
- ✅ `leads.notes` (legacy) actualizada.
- Crear nota desde bot (manual o esperar).
- ✅ `leads.notes` NO se modifica (solo human notes lo updatean).

### 8.15 T-MOBILE

- 375px viewport.
- Contact detail + Inbox sidebar.
- ✅ Layout funciona. Composer accesible. Filtros pills scrollean si necesario.

---

## 9. Trade-offs y alternativas descartadas

| Decision tomada | Alternativa descartada | Por que |
|---|---|---|
| Mantener `leads.notes` como cache "ultima humana" | Drop column ahora | Riesgo no auditado con consumidores. V2 audit + drop |
| Cap 30 dias + paginacion | Mostrar todo de una | Bot acumula notas; cliente se asusta con dump masivo |
| Cursor pagination | Offset | Offsets caros + race con insert |
| RLS strict (autor edita) | Permissive (admin edita ajenas) | Admin no debe pisar notas de agent. Si V2 lo quiere, agregar policy admin-override |
| NO realtime V1 | Realtime inmediato | Costo de canales x usuario activo. Refresh manual suficiente |
| Edicion inline | Modal | Inline preserva contexto del timeline |
| Confirmacion suave (inline buttons) | Modal de confirmacion | Modal interrumpe |
| Filtros pills con URL state | Filtros con state local | URL state preserva navegacion / refresh |
| 3 filtros (all/mine/bot) | Mas filtros (rango fechas, etiquetas) | YAGNI V1 |
| Edit/delete solo human | Edit del bot tambien | Bot notes son evidencia de su decision; editarlas falsea audit |
| NO soft-delete V1 | Soft-delete con `deleted_at` | Schema mas simple V1. V2 si feedback |
| 30 dias hardcoded | Configurable | YAGNI; V2 si pide |
| Pre-load server-side en contact detail | Solo lazy-load client | Contact detail es SSR — el render inicial debe ser rapido. Inbox sidebar si lazy (es client) |

---

## 10. Costo estimado

**Supabase Postgres:**
- 1 row / nota × estimado 5K notas / mes / agency × ~500 B = ~2.5 MB / agency / mes.
- 50 agencies: 125 MB / mes acumulado.
- Free tier 500 MB: aguanta ~4 meses sin cleanup. Pro $25 cubre.

**Bandwidth:**
- 30 notas × ~500 B = 15 KB primer load. Negligible.
- Cargar mas: idem por click.

**Vercel:**
- 4 server actions nuevas. Compute negligible.

**Total costo incremental mensual: $0.**

---

## 11. Trabajo NO incluido (futuras fases)

**6C cubre:** timeline read/write + filters + paginacion + edit/delete inline + cap 30 dias.

**Fuera de scope 6C:**

- **Realtime notas** — sincronizacion en vivo. V2 (use-inbox-realtime extensible).
- **Undo toast** — 5s para deshacer borrado.
- **Soft-delete** — `deleted_at` para recovery.
- **Mentions @user** — notificar a usuarios mencionados.
- **Reacciones a notas** — like / acknowledged.
- **Hilos / replies** — nota responde a otra.
- **Tags / categorias en notas** — clasificacion.
- **Markdown / rich text** — formato basico.
- **Adjuntar archivos a nota** — imagen, voice note (reusa Storage de 6A).
- **Export notas a CSV** — analisis externos.
- **Audit log de cambios** — quien edito que y cuando.
- **Notas "pinned"** — destacadas arriba siempre.
- **Cleanup automatico pg_cron** — purgar notas > 1 ano de inactividad.
- **Drop column `leads.notes`** — post audit de consumidores.

---

## 12. Checklist pre-PR

- [ ] Migration 0025 aplicada idempotente
- [ ] RLS habilitado en lead_notes
- [ ] Policies select/insert/update/delete creadas con check correcto
- [ ] Trigger updated_at funcionando
- [ ] 4 actions con `requireAgencyAccess` + gate viewer + validation
- [ ] Action create updatea `leads.notes` (legacy cache)
- [ ] `notes-types.ts` exporta `LeadNote`, `LeadNotesFilter`
- [ ] `note-bubble.tsx` con edit/delete inline + bot vs human render
- [ ] `note-composer.tsx` con Ctrl+Enter
- [ ] `notes-timeline.tsx` con filtros URL state + paginacion
- [ ] `notes-tab.tsx` reemplazado (CRM)
- [ ] `lead-panel.tsx` tab notas reemplazado (Inbox sidebar)
- [ ] Lazy-load en sidebar funciona
- [ ] T-MIGRATION, T-CREATE, T-EDIT-OWN, T-EDIT-OTHER, T-DELETE-OWN, T-BOT-RENDER, T-FILTERS, T-30DAY, T-PAGINATION, T-ROLE-VIEWER, T-CROSS-AGENCY, T-INBOX-SIDEBAR, T-LEGACY-COEXISTENCE, T-MOBILE pasan
- [ ] No emojis decorativos
- [ ] `leads.notes` legacy NO se elimina

---

## 13. Estimacion

**Tamano:** **Medium**.

| Fase | Esfuerzo |
|---|---|
| Migration + types | 1h |
| 4 server actions | 1.5h |
| `note-bubble` + `note-composer` + `notes-timeline` | 2h |
| Integracion en contact detail (notes-tab + page server) | 1h |
| Integracion en inbox sidebar (lead-panel cleanup) | 1-1.5h |
| QA founder + ajustes | 1h |
| **Total** | **7.5-8.5h** |

Marca del founder: "~1 sesion (2-3 horas)" — mi estimacion es **mas alta** porque:
- Cleanup del lead-panel (eliminar state textarea, persistencias) es delicado (state share entre tabs, refs, persistencias optimistic).
- Patron lazy-load del sidebar requiere thinking.
- 2 lugares de integracion duplican QA.

Para encajar en 3h: **dejar inbox-sidebar legacy V1 y solo cambiar contact detail**. La nota tab del sidebar sigue mostrando textarea, pero el founder accede al timeline desde el contact detail.

---

## 14. Handoff a builders

**backend-builder:**
- Migration 0025 siguiendo patron 0019/0024.
- 4 server actions con tests basicos.

**frontend-builder:**
- `notes-types.ts` exports.
- 3 components nuevos.
- Reemplazar `notes-tab.tsx`.
- Modificar `lead-panel.tsx` (lazy load).
- Modificar page server del lead para pre-cargar.

**Founder (deploy):**
- ANTES DE DEPLOY: T-PRE-MIGRATION-AUDIT — query DB para ver cuantas notas del bot acumuladas. Si > 50, notificar a clientes via toast la primera carga ("El asistente registró X observaciones internas mientras trabajaba").
- Aplica 0025 via Dashboard.
- Merge PR.
- QA con conv con notas del bot reales.

**Quien revise:**
- Validar RLS efectivo (T-CROSS-AGENCY).
- Validar gate de roles.
- Validar cap 30 dias.
- Validar coexistencia `leads.notes` legacy.

---

**Fin de la spec 6C.**
