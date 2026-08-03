# Spec: BLOQUE-6B — Templates de respuesta (machotes)

**Fecha:** 2026-06-05
**Autor:** arquitecto
**Bloque:** 6 (Polish UX) — sub-fase B de 3.
**Trigger:** backlog §1.4 line 57 ("Templates / machotes cerca de la caja, sin pestaña propia. Hoy hay botón 'Plantillas (próximamente)' deshabilitado"). El boton existe como placeholder en `chat-panel.tsx` linea 461-469.
**Estado relativo:** 6A multimedia primero (extrae composer). 6B reusa el composer.tsx extraido. 6C notas timeline despues.
**Rutas afectadas:** `/a/[slug]/settings` (nueva seccion "Plantillas") + `/a/[slug]/inbox` (template picker en composer).

---

## 0. Resumen ejecutivo

6B entrega un sistema completo de templates de mensaje gestionables por owner+admin de la agency, integrado en el composer del inbox:

1. **Migration 0024** — nueva tabla `message_templates` (id, agency_id, name, body, category enum, variables[], sort_order, autor, timestamps) + RLS (members SELECT, owner+admin write).
2. **Settings nueva seccion "Plantillas"** — CRUD completo: crear, editar, borrar, reordenar drag-drop. Filtros por categoria. Search local.
3. **Composer integrado** — boton "Plantillas" (hoy disabled, lineas 461-469 de `chat-panel.tsx`) se activa. Click abre dropdown picker (search + categorias). Click en template inserta `body` al input del composer con variables resaltadas.
4. **Variables `{{nombre}}`** — V1 NO se auto-resuelven con datos del lead. Quedan **resaltadas en amarillo** dentro del textarea para que el agente las llene manual. V2: auto-resolucion.
5. **Categorias fijas** (V1): `saludo`, `calificacion`, `precio`, `cierre`, `followup`, `otros`. Editable en V2 con configuracion.

**Versiones resultantes:**
- DB: **1 migration nueva** `0024_message_templates.sql` (tabla + RLS + 1 trigger updated_at + 1 indice).
- Frontend: **3 archivos nuevos** + **3 archivos modificados** (settings client + composer + chat-panel passthrough).
- Edge functions: **0 cambios.**
- Env vars: **0 nuevas.**

**Hallazgos del audit (criticos):**

- ✅ `requireAgencyAdmin(slug)` ya existe en `crm-v2/src/lib/auth/require-agency-admin.ts` — patron para gate CRUD a owner+admin.
- ✅ `@dnd-kit/sortable` esta en `package.json` (lo usa el Kanban de contactos). Reutilizable para drag-to-reorder en Settings.
- ✅ Settings ya tiene patron `SectionCard` + `LabeledInput` + `LabeledTextarea` (`admin-bits.tsx`).
- ✅ `saveAgencySettings` action existe en `crm-v2/src/app/a/[slug]/settings/actions.ts` — patron para nueva action `saveMessageTemplate`.
- ⚠️ El boton "Plantillas" en `chat-panel.tsx` lineas 461-469 esta INLINE en el bloque del composer. Spec 6A extrae el composer a `composer.tsx` ANTES de esta spec. **6B depende de que 6A Phase 1 este mergeado primero** (porque modifica `composer.tsx`).
- ⚠️ `sonner` esta en deps — usar para feedback de save/delete templates.
- ⚠️ El bot tambien podria querer usar templates en futuro (saludos, scripts iniciales). V1 NO toca el bot — solo CRUD humano. Si el bot necesita templates en V2, hereda el mismo schema.
- ⚠️ `agencies.settings` (jsonb) podria contener template config (categorias custom) en V2. V1 hardcoded.
- ⚠️ No hay tabla similar en BD hoy. Es feature nueva limpia.

---

## 1. Problema / requerimiento

**Hoy:**
- Cada vez que el agente humano va a contestar una pregunta repetitiva ("cuanto vale", "horario de visitas", "ubicacion exacta"), tiene que tipear todo desde cero.
- El bot ya hace eso automaticamente cuando esta activado. Pero cuando hay handoff (humano toma la conv), el agente pierde la ventaja del scripting.
- El boton "Plantillas" ya esta visible en el composer pero **disabled con tooltip "disponible cuando carguemos los templates aprobados"**. El feature esta prometido pero no entregado.
- Sin templates, escalar humanos requiere training de cada nuevo agente. Templates institucionalizan el conocimiento.

**Lo que queremos:**

1. **Settings con seccion "Plantillas"** donde owner+admin gestionan los templates de su agency.
2. **CRUD completo** con drag-to-reorder, categorias, search.
3. **Variables `{{nombre}}` `{{producto}}` `{{precio}}`** como placeholders que el agente llena al usar la plantilla. V1 no auto-resolve — V2 si.
4. **Composer:** click en boton "Plantillas" → dropdown picker → click inserta body al input con variables resaltadas en amarillo.
5. **Multi-tenant:** templates por agency, NO por user. Visibles a todos los members; solo owner+admin editan.

---

## 2. Estado actual relevante (auditado)

### 2.1 Boton "Plantillas" en composer (placeholder)

`crm-v2/src/components/inbox/chat-panel.tsx` lineas 461-469:

```tsx
<button
  type="button"
  aria-label="Plantillas (próximamente)"
  title="Plantillas — disponible cuando carguemos los templates aprobados"
  disabled
  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted opacity-50"
>
  <Sparkle size={17} />
</button>
```

**6B activa este boton.** Dado que 6A va a extraer el composer a `composer.tsx`, esta spec asume que ese refactor ya ocurrio.

### 2.2 Settings actual

`crm-v2/src/app/a/[slug]/settings/page.tsx` linea 19: `requireAgencyAdmin(slug)`. **YA ESTA gateado a owner+admin.** Las nuevas RPCs de templates pueden gate al mismo nivel sin nada nuevo.

`crm-v2/src/components/agency/settings/settings-client.tsx` linea 12-32: estructura de secciones existente. Cada seccion es un `SectionCard`. **Patron para Plantillas: agregar UNA SectionCard mas al settings-client + un archivo `templates-section.tsx` aparte.**

### 2.3 Server actions de settings

`crm-v2/src/app/a/[slug]/settings/actions.ts` (no leida explicita pero referenciada): `saveAgencySettings`. **6B agrega nuevas actions:** `listMessageTemplates`, `saveMessageTemplate`, `deleteMessageTemplate`, `reorderMessageTemplates`.

### 2.4 Patrones existentes a reutilizar

- **Drag-to-reorder:** `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` ya en deps. Se usa en `contactos-kanban.tsx` (drag entre columnas) y en el "flujo de conversacion" del Panel Admin (lista de pasos reordenable, backlog §3.1).
- **Search local:** patron de `conv-list.tsx` (filtrado cliente-side). Para <50 templates por agency, cliente-side alcanza sin server query.
- **Toast feedback:** `sonner` para "Plantilla guardada", "Plantilla eliminada", "Error al guardar".
- **Form patterns:** `LabeledInput`, `LabeledTextarea`, `SectionCard` del Panel Admin (`admin-bits.tsx`). Mismo look del Settings actual.
- **Dropdown picker:** patron de `header-stage-dropdown.tsx` (dropdown con search). Mismo modelo para el template-picker.

### 2.5 Recordatorio Git

Feature branch + Vercel preview + PR + merge a main. Migrations las aplica el founder via Dashboard. Frontend va auto-deploy en merge.

---

## 3. Decisiones tecnicas

### 3.1 Categorias fijas en V1 + texto libre "otros"

**Decision:** enum hardcoded en aplicacion (NO en DB enum tipo Postgres).

```typescript
export const TEMPLATE_CATEGORIES = [
  { value: 'saludo',       label: 'Saludo' },
  { value: 'calificacion', label: 'Calificación' },
  { value: 'precio',       label: 'Precio / Cotización' },
  { value: 'cierre',       label: 'Cierre / Reserva' },
  { value: 'followup',     label: 'Seguimiento' },
  { value: 'otros',        label: 'Otros' },
] as const;

export type TemplateCategory = typeof TEMPLATE_CATEGORIES[number]['value'];
```

**Por que enum aplicacion y no enum DB:**

- Postgres enums son rigidos: agregar valor requiere `ALTER TYPE`, no se puede borrar valor. V2 quiere categorias configurables por agency — en Postgres enum es imposible.
- Si V1 usa `text` con CHECK constraint, V2 solo elimina el CHECK y agrega columna `agencies.template_categories jsonb`. Migracion limpia.

**Esquema DB:** `category text not null default 'otros' check (category in ('saludo', 'calificacion', 'precio', 'cierre', 'followup', 'otros'))`.

### 3.2 CRUD a owner+admin via `requireAgencyAdmin`

**Decision:** las 4 actions (list, save, delete, reorder) reciben `slug` y llaman `requireAgencyAdmin(slug)` salvo `listMessageTemplates` que llama `requireAgencyAccess(slug)` (read-only para agent+viewer tambien).

**Por que asi:**
- Owner+admin son los unicos que estructuran knowledge base del equipo.
- Agent puede usar (consume desde composer) — necesita SELECT.
- Viewer puede usar (read-only mode no impide consumo de template — el agent compone y manda, el viewer ni siquiera tiene composer).

Tabla matriz:

| Action | Role minimo | Funcion |
|---|---|---|
| `listMessageTemplates(slug)` | viewer+ (cualquier member) | leer para mostrar en picker |
| `saveMessageTemplate(slug, payload)` | admin+ | crear/editar |
| `deleteMessageTemplate(slug, id)` | admin+ | eliminar |
| `reorderMessageTemplates(slug, ids[])` | admin+ | drag-to-reorder |

### 3.3 Search del picker: cliente-side V1

**Decision V1:** filter en cliente con `body.toLowerCase().includes(query)` + `name.toLowerCase().includes(query)`. Sin trigram ni server query.

**Justificacion:**
- Hipotesis: agencies tipicas tendran 5-30 templates V1.
- Filter sobre 30 items en cliente es <1 ms.
- Trigram + server query agrega round-trip + complejidad.

**Trigger para mover a server-side V2:**
- Agency con > 100 templates.
- Founder pide search por contenido de body con relevancia.

### 3.4 Drag-to-reorder con `@dnd-kit/sortable`

**Decision:** mismo patron del Kanban de contactos. NO numerico V1.

**Persistencia:**
- Action `reorderMessageTemplates(slug, [id1, id2, id3, ...])` recibe array ordenado de IDs.
- Server hace UPDATE con CASE WHEN del nuevo `sort_order` para cada ID en 1 query.

```sql
update public.message_templates
set sort_order = case id
    when '<id1>'::uuid then 0
    when '<id2>'::uuid then 1
    when '<id3>'::uuid then 2
end,
updated_at = now()
where agency_id = '<aid>'::uuid
  and id in ('<id1>'::uuid, '<id2>'::uuid, '<id3>'::uuid);
```

### 3.5 Variables `{{nombre}}` — regex client-side + spans amarillos

**Decision:** parsear template body con regex `\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}` y envolver matches en `<span>` amarillo. NO auto-resolver V1.

**Implementacion del input del composer cuando inserta template con variables:**

Opcion A: usar `<textarea>` plana — las variables salen como texto literal `{{nombre}}`. El agente las edita a mano. Funciona pero sin highlight.

Opcion B: input rich con `contenteditable` + spans estilizados. Mas UX pero mas codigo y mas riesgo (paste, undo).

Opcion C (elegida): `<textarea>` PLANA + un **highlight layer** debajo. Patron: dos `<div>` superpuestos donde uno tiene el texto plano `<textarea>` transparente y el otro un `<div>` mirror con los `<span>` coloreados. Es el patron de syntax highlighters de browser (Highlight.js / Prism con textarea).

```tsx
// Pseudo
<div className="relative">
  <div
    aria-hidden
    className="pointer-events-none whitespace-pre-wrap break-words text-transparent"
    style={{ font: 'inherit' }}
  >
    {parseWithHighlights(draftText)}
  </div>
  <textarea
    value={draftText}
    onChange={...}
    className="absolute inset-0 resize-none bg-transparent caret-ink"
  />
</div>
```

**Decision V1:** **Opcion A simple** (textarea plana, sin highlight). Razon: composer hoy es `<input>` (linea 474 del chat-panel actual), no textarea. Cambiar a Opcion C requiere reescribir el composer + manejar la sincronizacion scroll layer/textarea. Es ratio costo/beneficio malo para V1.

**Trade-off explicito:** sin highlight visual, las variables se ven como `{{nombre}}` literal. El agente tiene que reemplazar manualmente. UX es 7/10 vs 10/10. Pero el costo es 1h vs 4-5h.

**Workaround partial para V1:** despues de insertar el template, **abrir un toast** que diga "Plantilla insertada. Reemplaza `{{nombre}}`, `{{precio}}` antes de enviar." Esto educa al agente sin parsear.

**V2 future:** Opcion C con highlight + V2.5 con auto-resolve usando `lead.full_name`, `lead.phone`, etc.

### 3.6 Schema: `variables text[]` auto-derivado al guardar

**Decision:** al hacer `saveMessageTemplate`, parsear el body en server y guardar el array de variables encontradas en `variables text[]`. Esto permite mostrar en la UI del Settings "Esta plantilla usa: nombre, precio".

**Pseudo en action:**
```typescript
function extractVariables(body: string): string[] {
  const re = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) found.add(m[1]);
  return Array.from(found).sort();
}
```

**Por que en server, no en cliente al guardar:** consistencia. Si el cliente envia el array, podria mandar uno inconsistente con el body. El server siempre re-parsea.

### 3.7 Sort_order: int, default 0, indexado por (agency_id, sort_order)

**Decision:**
- `sort_order int not null default 0`.
- Indice: `(agency_id, sort_order asc)` para query del picker.

**Trade-off vs `position` decimal (Kanban moderno):**

- Decimal permite insertar entre 2 sin re-numerar todos.
- Para <50 templates por agency, re-numerar al reorder es trivial (1 query, vista en 3.4).
- Empezamos con int simple. Si el reorder se vuelve un problema (agencies con >1000 templates), migramos a decimal V2.

### 3.8 Pre-llenado con seed (post-migration manual)

**Decision V1:** NO seedeamos templates automaticos. La migration crea tabla vacia.

**Razon:**
- Cada agency tiene su voz/tono. Templates genericos ("Hola, cómo estás?") son ruido.
- El founder/onboarding puede cargar 5-10 templates iniciales a cada agency manualmente durante el onboarding del cliente.

**V2 future:** template gallery con plantillas sugeridas por industria que el cliente clona a su agency.

### 3.9 Audit log: cambios en templates

**Decision V1:** NO loguear en `audit_log`. Las modificaciones son responsabilidad del owner+admin de la agency, no necesitan auditoria cross-tenant.

**Razon:** ya hay tracking implicito en `created_at`, `updated_at`, `created_by`. Si el founder en V2 quiere "quien edito que template y cuando", lo agregamos con trigger en la tabla.

---

## 4. Modelo de datos

### 4.1 Migration 0024

```sql
-- =============================================================================
-- Momentum AI CRM — Migration 0024: message_templates (Bloque 6B)
-- =============================================================================
-- Templates de mensaje gestionados por owner+admin de cada agency. Visibles
-- a todos los members en el picker del composer. Variables {{nombre}} quedan
-- literal en el body — V1 NO se auto-resuelven; V2 si.
--
-- Categorias V1 fijas via CHECK constraint (saludo|calificacion|precio|cierre|
-- followup|otros). V2 movera a config por agency cuando el founder lo pida.
--
-- Idempotente (if not exists + drop if exists policy).
-- =============================================================================

create table if not exists public.message_templates (
    id              uuid primary key default gen_random_uuid(),
    agency_id       uuid not null references public.agencies(id) on delete cascade,
    name            text not null,
    body            text not null,
    category        text not null default 'otros'
                    check (category in ('saludo', 'calificacion', 'precio',
                                        'cierre', 'followup', 'otros')),
    -- Array de variables encontradas en body al guardar (auto-derivado del
    -- regex \{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\} en el server action). Sirve para
    -- mostrar en Settings ("Esta plantilla usa: nombre, precio").
    variables       text[] not null default '{}',
    sort_order      int not null default 0,
    created_by      uuid references public.users(id) on delete set null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

-- Indice principal del picker: (agency, sort)
create index if not exists idx_message_templates_agency_sort
    on public.message_templates(agency_id, sort_order asc);

-- Trigger updated_at (patron de leads/conversations)
drop trigger if exists trg_message_templates_updated_at on public.message_templates;
create trigger trg_message_templates_updated_at
    before update on public.message_templates
    for each row execute function public.tg_set_updated_at();
-- ^^ Asume que tg_set_updated_at() existe. Si no, crearla en esta migration:
-- create or replace function public.tg_set_updated_at()
-- returns trigger language plpgsql as $$
-- begin new.updated_at = now(); return new; end; $$;

-- RLS
alter table public.message_templates enable row level security;

-- SELECT: cualquier member (agent / viewer / admin / owner) puede leer
drop policy if exists "message_templates_select" on public.message_templates;
create policy "message_templates_select"
    on public.message_templates for select
    using (is_member_of(agency_id) or is_master());

-- INSERT/UPDATE/DELETE: solo owner + admin
-- Patron de la migration 0019 (agency_role_rls): usar `is_agency_admin(aid)`.
-- Si esa funcion no existe, fallback a is_member_of (RLS) + gate en server action
-- via requireAgencyAdmin. **Recomendado: usar gate en server action y dejar RLS
-- generoso para members** (consistente con como esta hoy todo Settings).
drop policy if exists "message_templates_write" on public.message_templates;
create policy "message_templates_write"
    on public.message_templates for all
    using (is_member_of(agency_id) or is_master())
    with check (is_member_of(agency_id) or is_master());

comment on table public.message_templates is
    'Templates de mensaje gestionados por owner+admin de la agency. Visibles a todos los members en el picker del composer del inbox. Variables {{nombre}} no se auto-resuelven V1.';
```

**Notas para el builder:**
- Verificar si `tg_set_updated_at` existe en `0007_triggers.sql`. Si si, no crearla aqui. Si no, agregar al inicio de la migration.
- La policy `_write` es generosa (member puede). El gate real esta en server action via `requireAgencyAdmin`. Esto sigue el patron del Settings (que ya gate en pagina + action).

### 4.2 RLS: por que generosa + gate en server action

**Trade-off:** podriamos hacer RLS strict via funcion `is_agency_admin(aid)`. Pero:
- La migration 0019 ya hizo gate granular para algunas tablas (leads, messages) y NO para Settings (porque la pagina ya bloquea).
- Consistency: tratamos Templates igual que Settings — page guard + action guard suficiente.
- Defensa en profundidad parcial: si por bug se llama action sin slug, RLS deja pasar al member pero NO al outsider (sigue protegido cross-agency).

### 4.3 Estimacion de tamano

- Tipico: 5-30 templates / agency.
- 50 agencies × 30 templates = 1500 rows. Negligible.
- Indice (agency, sort) = ~50 KB.

---

## 5. Estructura de archivos a crear / modificar

### 5.1 Crear

| Archivo | Tipo | Responsabilidad |
|---|---|---|
| `crm-v2/supabase/migrations/0024_message_templates.sql` | SQL | Tabla + RLS + indice + trigger updated_at |
| `crm-v2/src/lib/templates/types.ts` | TS | Type `MessageTemplate`, const `TEMPLATE_CATEGORIES`, `extractVariables(body)` |
| `crm-v2/src/app/a/[slug]/settings/templates-actions.ts` | server action file | `listMessageTemplates`, `saveMessageTemplate`, `deleteMessageTemplate`, `reorderMessageTemplates` |
| `crm-v2/src/components/agency/settings/templates-section.tsx` | client component | Seccion CRUD en Settings: lista + add + edit modal + delete confirm + drag-reorder |
| `crm-v2/src/components/inbox/template-picker.tsx` | client component | Dropdown picker en composer: search + filter por categoria + insertar |

### 5.2 Modificar

| Archivo | Cambio |
|---|---|
| `crm-v2/src/components/agency/settings/settings-client.tsx` | Agregar `<TemplatesSection slug={slug} />` como nueva `SectionCard`. Recibir `templates` desde la page server component |
| `crm-v2/src/app/a/[slug]/settings/page.tsx` | Pre-cargar templates via `listMessageTemplates` y pasarlos al `SettingsClient` |
| `crm-v2/src/components/inbox/composer.tsx` (existe post-6A) | Activar el boton "Plantillas" — quitar `disabled`, conectar al state `templatePickerOpen`, renderizar `<TemplatePicker open={templatePickerOpen} onSelect={(tpl) => setDraft(d => d + tpl.body)} />`. Si el founder no quiso 6A primero, modificar `chat-panel.tsx` directamente |

### 5.3 NO tocar

- ❌ Bot / N8N — no consume templates V1.
- ❌ Edge functions.
- ❌ Otras tablas / migrations.
- ❌ Auth helpers (ya estan).

### 5.4 Detalle de `templates-actions.ts`

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAgencyAccess } from '@/lib/auth/require-agency-access';
import { requireAgencyAdmin } from '@/lib/auth/require-agency-admin';
import { extractVariables, type TemplateCategory } from '@/lib/templates/types';

export async function listMessageTemplates(slug: string) {
  const ctx = await requireAgencyAccess(slug);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('message_templates')
    .select('id, name, body, category, variables, sort_order, created_at, updated_at')
    .eq('agency_id', ctx.agencyId)
    .order('sort_order', { ascending: true });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, templates: data ?? [] };
}

export async function saveMessageTemplate(
  slug: string,
  payload: {
    id?: string;  // si viene, UPDATE; si no, INSERT
    name: string;
    body: string;
    category: TemplateCategory;
  },
) {
  const ctx = await requireAgencyAdmin(slug);
  // Validacion
  if (!payload.name.trim()) return { ok: false, error: 'name_required' };
  if (!payload.body.trim()) return { ok: false, error: 'body_required' };
  if (payload.name.length > 100) return { ok: false, error: 'name_too_long' };
  if (payload.body.length > 2000) return { ok: false, error: 'body_too_long' };

  const variables = extractVariables(payload.body);
  const admin = createAdminClient();

  if (payload.id) {
    // UPDATE — verificar ownership
    const { data: existing } = await admin
      .from('message_templates')
      .select('id, agency_id')
      .eq('id', payload.id)
      .maybeSingle();
    if (!existing || existing.agency_id !== ctx.agencyId) {
      return { ok: false, error: 'template_not_found' };
    }
    const { error } = await admin
      .from('message_templates')
      .update({
        name: payload.name.trim(),
        body: payload.body,
        category: payload.category,
        variables,
      })
      .eq('id', payload.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/a/${slug}/settings`);
    return { ok: true };
  } else {
    // INSERT — sort_order = max + 1 dentro de la agency
    const { data: maxRow } = await admin
      .from('message_templates')
      .select('sort_order')
      .eq('agency_id', ctx.agencyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;
    const { error } = await admin
      .from('message_templates')
      .insert({
        agency_id: ctx.agencyId,
        name: payload.name.trim(),
        body: payload.body,
        category: payload.category,
        variables,
        sort_order: nextOrder,
        created_by: ctx.userId,
      });
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/a/${slug}/settings`);
    return { ok: true };
  }
}

export async function deleteMessageTemplate(slug: string, id: string) {
  const ctx = await requireAgencyAdmin(slug);
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('message_templates')
    .select('id, agency_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing || existing.agency_id !== ctx.agencyId) {
    return { ok: false, error: 'template_not_found' };
  }
  const { error } = await admin
    .from('message_templates')
    .delete()
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/a/${slug}/settings`);
  return { ok: true };
}

export async function reorderMessageTemplates(slug: string, orderedIds: string[]) {
  const ctx = await requireAgencyAdmin(slug);
  if (!orderedIds.length) return { ok: true };
  const admin = createAdminClient();

  // Verificar que todos pertenecen a la agency
  const { data: rows } = await admin
    .from('message_templates')
    .select('id, agency_id')
    .in('id', orderedIds);
  const allOwned = (rows ?? []).every(r => r.agency_id === ctx.agencyId);
  if (!allOwned) return { ok: false, error: 'template_not_found' };

  // Update en N queries chicas (mas simple que CASE WHEN raw SQL).
  // Para 30 templates es 30 UPDATEs — milisegundos.
  const updates = orderedIds.map((id, idx) =>
    admin.from('message_templates').update({ sort_order: idx }).eq('id', id),
  );
  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed?.error) return { ok: false, error: failed.error.message };

  revalidatePath(`/a/${slug}/settings`);
  return { ok: true };
}
```

### 5.5 Detalle de `templates-section.tsx`

UX:

```
+======================== Plantillas ==========================+
|                                                              |
| [+ Nueva plantilla]                          [Search: ___]   |
| Filtros: [Todas] [Saludo] [Calif.] [Precio] [Cierre] [...]   |
|                                                              |
| ┌─ Saludo ────────────────────────────────────────────────┐ |
| | [⋮] Hola estandar                              [Editar] | |
| |    "Hola {{nombre}}, gracias por escribir. ¿En qué..."   | |
| |    Usa: nombre                                           | |
| |                                                          | |
| | [⋮] Saludo formal                              [Editar] | |
| |    "Buen día. Le habla [nombre del agente]..."           | |
| └─────────────────────────────────────────────────────────┘ |
|                                                              |
| ┌─ Precio ─────────────────────────────────────────────────┐ |
| | [⋮] Cotización propiedad                       [Editar] | |
| |    "La propiedad {{producto}} tiene un precio de..."     | |
| └─────────────────────────────────────────────────────────┘ |
+==============================================================+
```

- Grupos por categoria (visualmente). Cada item tiene drag-handle (`⋮⋮`) para reorder.
- Click "Editar" → abre modal con `name`, `category` (select), `body` (textarea), boton Guardar / Eliminar / Cancelar.
- Drag funciona DENTRO de cada categoria? O cross-categoria? **Decision V1:** cross-categoria — el sort_order es flat. Si el agente quiere mover un Saludo entre dos Precios, puede (cambiando categoria + reorder).
- Modal de delete confirm: "¿Eliminar la plantilla 'X'? Esta accion no se puede deshacer."

### 5.6 Detalle de `template-picker.tsx`

UX:

```
                   ┌────────────────────────────────────┐
                   | [Search: ____________]              |
                   | [Todas] [Saludo] [Prec.] [Cier.]    |
                   |                                     |
                   | Hola estandar                       |
                   | "Hola {{nombre}}, gracias por..."   |
                   |                                     |
                   | Saludo formal                       |
                   | "Buen día. Le habla..."             |
                   |                                     |
                   | Cotización propiedad                |
                   | "La propiedad {{producto}}..."      |
                   |                                     |
                   | + Crear plantilla (admin only)      |
                   └────────────────────────────────────┘
[AI] [📎] [🎙️] [☄️] [...input...] [➤]
```

- Pop-over anclado al boton "Plantillas". Click fuera → cerrar.
- Search filtra `name + body` (incluye match).
- Categorias como pills: una activa a la vez (default "Todas").
- Click en item → cierra picker + inserta `body` al input del composer + `toast.info('Plantilla insertada. Reemplaza {{nombre}}, {{precio}}…')` SI el body tiene variables.
- Si el user es admin: chip al final "+ Crear plantilla" que abre Settings en nueva tab (`window.open('/a/[slug]/settings#templates')`).

**Insercion al input:** `setDraft((prev) => (prev ? `${prev}\n\n${tpl.body}` : tpl.body))`. Si hay draft previo, concatenar con doble newline. Si esta vacio, reemplazar.

### 5.7 Detalle del cambio en `composer.tsx`

Quitar `disabled` del boton actual. Agregar:

```tsx
const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);

// Lazy-load al primer click
useEffect(() => {
  if (templatePickerOpen && templates === null) {
    listMessageTemplates(slug).then((res) => {
      if (res.ok) setTemplates(res.templates);
      else toast.error('No se pudieron cargar las plantillas');
    });
  }
}, [templatePickerOpen, templates, slug]);

// Boton:
<button
  type="button"
  onClick={() => setTemplatePickerOpen(o => !o)}
  aria-label="Plantillas"
  title="Plantillas"
  className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md text-ink-soft hover:bg-surface-muted hover:text-ink"
>
  <Sparkle size={17} />
</button>

<TemplatePicker
  open={templatePickerOpen}
  onClose={() => setTemplatePickerOpen(false)}
  templates={templates}
  onSelect={(tpl) => {
    setDraft((prev) => prev ? `${prev}\n\n${tpl.body}` : tpl.body);
    if (tpl.variables.length > 0) {
      toast.info(`Reemplazá ${tpl.variables.map(v => `{{${v}}}`).join(', ')} antes de enviar`);
    }
    queueMicrotask(() => inputRef.current?.focus());
  }}
  slug={slug}
  isAdmin={currentUserRole === 'owner' || currentUserRole === 'admin'}
/>
```

**Caveat:** el composer hoy usa `<input>` plain. Si el body de la plantilla tiene newlines, se rompe (un input es single-line). **Decision:** convertir el `<input>` del composer a `<textarea>` con auto-resize (1-6 rows). Esto es 10 lineas. Aplica IGUAL para 6A multimedia (el caption de imagen tambien podria ser multi-linea).

---

## 6. UX / layout

### 6.1 Settings con seccion Plantillas (desktop)

Settings actual tiene scroll vertical con N `SectionCard`s. La nueva seccion "Plantillas" va abajo de "Auto-acciones" y arriba de "Datos del negocio" (no critica el orden).

### 6.2 Settings (mobile 375px)

Cada `SectionCard` ya es responsive. Los items de templates:
- En mobile, la tarjeta de cada template ocupa 100% ancho.
- Drag-handle pequeño a la izquierda.
- Boton "Editar" full-width abajo.

### 6.3 Picker (desktop)

Pop-over de 360-400px ancho. Se abre arriba del boton (no abajo — el composer esta al fondo de la pantalla).

### 6.4 Picker (mobile)

Modal bottom-sheet full-width que sube desde abajo (estilo iOS share sheet). Permite mas espacio + es ergonomico con pulgar.

```tsx
{isCompact ? (
  <motion.div
    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
    transition={{ type: 'spring', damping: 30 }}
    className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-4"
  >
    ...
  </motion.div>
) : (
  <div className="absolute bottom-full mb-2 left-12 z-40 w-96 rounded-xl border border-line bg-surface shadow-lg">
    ...
  </div>
)}
```

---

## 7. Riesgos y mitigaciones

| # | Riesgo | Prob | Impacto | Mitigacion |
|---|---|---|---|---|
| **R-FREETIER** | message_templates suma rows a Postgres free tier (500 MB DB total) | Baja | Bajo | 1500 rows × ~1 KB = 1.5 MB. Negligible vs 500 MB |
| R-DEPENDENCY-6A | 6B modifica `composer.tsx` que crea 6A. Si 6A no esta mergeado, hay conflict | Media | Medio | Si el founder hace 6B antes que 6A: modificar directamente `chat-panel.tsx` (lineas 461-469) y luego 6A toma el cambio al extraer |
| R-INPUT-TO-TEXTAREA | Cambiar `<input>` a `<textarea>` rompe estilos del composer | Baja | Bajo | Smoke T-TEXT del 6A se reusa. Visual QA en desktop + mobile |
| R-NO-RESOLVE | Agente envia template con `{{nombre}}` literal | Media | Bajo | Toast warning al insertar template con variables. Educacion del agente |
| R-CROSS-AGENCY | Agente de agency A ve templates de agency B | Baja | Alto | RLS `is_member_of(agency_id)` cubre. Validar con T-RLS |
| R-DELETE-ACCIDENTAL | Admin borra template usado por el equipo sin querer | Media | Bajo | Doble confirmacion con nombre del template. Soft-delete no V1 — V2 si el founder lo pide |
| R-REORDER-RACE | 2 admins reordenan al mismo tiempo | Baja | Bajo | Last-write-wins. La UI se sincroniza con refresh tras save |
| R-CATEGORIA-EXPLOSION | Templates en categoria "otros" se acumulan | Baja | Bajo | UI muestra count por categoria + sugiere recategorizar |
| R-BODY-CON-XSS | Body del template contiene `<script>` y se inyecta en el chat | Baja | Alto | El composer escribe en `<textarea>` plain — no parsea HTML. Cuando se renderiza en bubble, el mismo `linkify` actual (que escapa) lo procesa |
| R-VARIABLE-COLLISION | Template con `{{lead}}` vs `{{lead.name}}` | Baja | Bajo | V1 acepta cualquier `{{[a-zA-Z_][a-zA-Z0-9_]*}}` simple. Variables con dot path se difieren a V2 |
| R-PICKER-OPEN-PERF | Lazy-load llama action en cada open | Baja | Bajo | Cache en componente: solo carga primera vez. Refresh con `revalidatePath` post-save |
| R-MOBILE-KEYBOARD | En mobile el bottom-sheet del picker queda tapado por el teclado | Media | Medio | Cuando picker se abre, blur del input para cerrar teclado. Usar `visualViewport` API si esta disponible |

---

## 8. Plan de testing

### 8.1 T-MIGRATION

- Aplicar 0024 en branch.
- ✅ Tabla creada con check constraint correcto.
- ✅ Indice presente.
- ✅ RLS habilitado.

### 8.2 T-CRUD-CREATE

- Login como owner de agency A.
- Settings → "+ Nueva plantilla" → nombre "Test", body "Hola {{nombre}}", categoria "saludo" → Guardar.
- ✅ Toast success.
- ✅ Aparece en lista en categoria Saludo.
- ✅ `variables` contiene `['nombre']`.

### 8.3 T-CRUD-EDIT

- Click "Editar" → cambiar body a "Hola {{nombre}}, gracias {{producto}}".
- ✅ Al guardar, `variables = ['nombre','producto']`.

### 8.4 T-CRUD-DELETE

- Click 3-dots → "Eliminar" → confirmar.
- ✅ Toast "Eliminada".
- ✅ Row eliminada de DB.

### 8.5 T-REORDER

- Drag template 3 al lugar 1.
- ✅ Visual reordena.
- ✅ DB `sort_order` actualizado.
- ✅ Refresh de pagina mantiene orden.

### 8.6 T-PICKER-COMPOSER

- Ir a inbox, abrir conv.
- Click boton "Plantillas" en composer.
- ✅ Picker abre.
- Click en template "Hola standard".
- ✅ Body insertado en input.
- ✅ Toast con variables a reemplazar.
- ✅ Picker cierra.

### 8.7 T-PICKER-SEARCH

- Picker abierto, tipear "preci".
- ✅ Filtro local muestra solo templates con "preci" en name/body.

### 8.8 T-PICKER-CATEGORIA

- Click pill "Saludo".
- ✅ Solo templates de saludo visibles.

### 8.9 T-ROLE-AGENT

- Login como agent.
- Ir a Settings → ✅ recibe `notFound` (Settings ya gateado).
- Ir a inbox, abrir picker → ✅ ve templates pero NO ve "+ Crear plantilla".
- ✅ Insertar template funciona.

### 8.10 T-ROLE-VIEWER

- Login como viewer.
- ✅ Composer disabled (read-only mode). Boton plantillas tambien disabled (no envia).

### 8.11 T-CROSS-AGENCY

- Login como user de agency B (que tiene 0 templates).
- ✅ Picker muestra "No hay plantillas todavía".
- ✅ NO ve templates de agency A.

### 8.12 T-MOBILE

- 375px viewport.
- Settings: ver lista, scroll, editar.
- ✅ Modal de edicion full-screen friendly.
- Inbox: abrir picker.
- ✅ Bottom-sheet con anim spring.

### 8.13 T-LARGE-BODY

- Crear template con body 2000 chars (al limite).
- ✅ Guarda OK.
- ✅ Body de 2001 chars retorna `body_too_long`.

---

## 9. Trade-offs y alternativas descartadas

| Decision tomada | Alternativa descartada | Por que |
|---|---|---|
| Tabla nueva `message_templates` | Guardar en `agencies.settings.templates jsonb` | jsonb se vuelve dificil de query/filter cuando crecen. Tabla con indice es estandar |
| Categorias hardcoded V1 | Categorias por agency desde el inicio | Mas complejidad UI sin valor V1. V2 trivial migracion |
| `category text check` | enum Postgres | enum rigido. V2 quiere categorias custom — text es flexible |
| Variables literal `{{nombre}}` sin highlight | Highlight con `contenteditable` mirror layer | Costo 4-5h por feature poco usado V1. Toast educativo cubre el gap |
| Auto-derivar `variables` en server | Cliente manda array | Server consistencia. Si cliente manda mal, DB queda incongruente |
| Drag-to-reorder con dnd-kit | Botones ↑↓ numericos | dnd-kit ya esta. Mejor UX en mobile (long-press) |
| Search cliente-side V1 | Trigram + server | <50 items: cliente es mas rapido |
| Sort_order int | Decimal "position" Linear-style | <100 templates: int + re-numerar al reorder es trivial |
| RLS generoso + gate en action | RLS strict con `is_agency_admin` | Consistencia con Settings actual. Defense in depth parcial pero suficiente |
| NO seed inicial | Seed con 10 templates genericos | Genericos son ruido. Onboarding cliente carga sus propios |
| NO audit_log de cambios | Trigger que escribe a audit_log | Overkill V1. Si V2 quiere, trivial agregar |
| Picker bottom-sheet en mobile | Picker como modal centrado | Bottom-sheet es ergonomico con pulgar y no compite con el teclado |
| Lazy-load del picker | Pre-fetch en mount del composer | Picker se usa <50% de conversaciones; lazy-load ahorra una RPC por sesion |

---

## 10. Costo estimado

**Supabase Postgres (free tier 500 MB):**
- 1500 rows × ~1 KB = 1.5 MB. **Trivial.**
- Indice: ~50 KB. Trivial.

**Bandwidth:**
- Picker carga la 1ra vez por sesion. Body de cada template ~200 B. 30 templates × 200 B = 6 KB / agency / sesion.
- Trivial vs free tier 5 GB / mes.

**Vercel:**
- Server Actions extras: ~4 nuevas. Cero costo extra (Hobby Plan permite Server Actions ilimitadas dentro del compute mensual).

**Total costo incremental mensual: $0.**

---

## 11. Trabajo NO incluido (futuras fases)

**6B (esta spec) cubre:** CRUD completo de templates + picker en composer + variables literal.

**Fuera de scope 6B (futuro):**

- **Auto-resolucion de variables** — `{{nombre}}` → `lead.full_name`, `{{phone}}` → `lead.phone`, etc. Mapping fijo en V2. `{{lead.email}}` dot-path en V2.5.
- **Highlight visual de variables** — Opcion C (textarea + mirror layer) en V2.
- **Categorias configurables por agency** — mover de check constraint a `agencies.settings.template_categories`.
- **Templates aprobados por Meta (HSM/MTM)** — para enviar fuera de ventana 24h. Schema distinto: requiere `meta_template_id`, `language`, `components`. **Es feature separada del backlog §1.4** ("Solo se pueden enviar plantillas pre-aprobadas" cuando ventana cerrada). V2 / V3.
- **Templates del bot** — el bot puede usar el mismo schema en V2 si necesita scripts.
- **Bulk import desde CSV** — agencies con muchos templates pre-existentes.
- **Template gallery / market** — biblioteca compartida cross-agency con clonacion.
- **Versionado** — historial de cambios al body de un template.
- **Variantes A/B** — comparar performance entre dos versiones.

---

## 12. Checklist pre-PR

- [ ] Migration 0024 con header consistente, idempotente
- [ ] `message_templates` tabla + RLS + indice + check constraint categorias
- [ ] `tg_set_updated_at` trigger (existente o creado)
- [ ] `types.ts` con `TEMPLATE_CATEGORIES` + `extractVariables`
- [ ] `templates-actions.ts` con 4 actions con `requireAgencyAdmin` / `requireAgencyAccess`
- [ ] `templates-section.tsx` en Settings: lista por categoria + add + edit modal + delete confirm + drag-reorder
- [ ] `template-picker.tsx` en composer: lazy-load + search + filter categoria + select inserts body + toast variables
- [ ] `composer.tsx` (o `chat-panel.tsx` si 6A no mergeado) — quitar disabled del boton, integrar picker
- [ ] `<input>` del composer → `<textarea>` auto-resize 1-6 rows (necesario para templates multi-linea)
- [ ] Validacion en server: name (1-100), body (1-2000)
- [ ] T-CRUD-CREATE/EDIT/DELETE, T-REORDER, T-PICKER-*, T-ROLE-AGENT/VIEWER, T-CROSS-AGENCY, T-MOBILE pasan
- [ ] No emojis decorativos en codigo

---

## 13. Estimacion

**Tamano:** **Medium**.

| Fase | Esfuerzo |
|---|---|
| Migration + types + actions | 1-1.5h |
| `templates-section.tsx` (CRUD + drag) | 2-3h |
| `template-picker.tsx` (mobile + desktop) | 1.5-2h |
| Integracion en composer + textarea autoresize | 0.5-1h |
| QA founder + ajustes | 1h |
| **Total** | **6-8.5h** |

Marca del founder: "~1 sesion (3-4 horas)" — mi estimacion es **mas alta** principalmente por el drag-to-reorder con `@dnd-kit` (es ~1h de trial-error la primera vez), el bottom-sheet mobile del picker (1h con animaciones), y el cambio input→textarea con auto-resize (no es trivial sin libreria).

Para encajar en 3-4h: **droppear drag-to-reorder (poner botones ↑↓) y droppear bottom-sheet (modal estandar mobile)**. Funcional pero menos pulido.

---

## 14. Handoff a builders

**backend-builder / frontend-builder:**
- Implementa migration 0024 siguiendo estilo 0019/0024.
- Implementa `types.ts` + `templates-actions.ts`.
- Implementa `templates-section.tsx` reusando `SectionCard` + `LabeledInput` + `LabeledTextarea` + `@dnd-kit/sortable` (referencia: el "flujo de conversacion" del Panel Admin).
- Implementa `template-picker.tsx` con search local + filter categoria pills + bottom-sheet mobile / popover desktop.
- Modifica `composer.tsx` (o `chat-panel.tsx` legacy) para conectar el boton.
- Converte el `<input>` del composer a `<textarea>` autoresize.

**Founder (deploy):**
- Aplica migration 0024 via Dashboard.
- Merge PR a main. Vercel auto-deploy.
- QA: crear 5 templates de prueba, usar en conv real.

**Quien revise:**
- Validar checklist §12.
- Verificar RLS: cross-agency no ve nada.
- Verificar gate roles: agent NO ve "+ Crear", viewer NO usa picker.

---

**Fin de la spec 6B.**
