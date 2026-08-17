# Spec Tecnico — Fase ADM-4 Bloque B (Cablear `is_active` real)

**Fecha:** 2026-06-04
**Autor:** arquitecto (template)
**Estado:** listo para implementacion por backend-builder + frontend-builder
**Decisiones congeladas:** alcance "cablear `is_active` para que SI corte bot y login del owner" acordado en sesion 2026-06-04. NO se incluye polish UX (Bloque C). NO se toca metricas (Bloque A — ya en `main`).
**Esfuerzo objetivo:** 6-10h (~1 dia).

Quien implemente NO debe re-arquitecturar. Si encuentra ambiguedad real, escala — no improvisa.

---

## 0. Hallazgo critico de la auditoria (antes de empezar)

Al revisar el workflow N8N actual `chatbot-momentum-bot-v6-v1.json`, el nodo `Resolve Agency` (linea 1458) **YA chequea `is_active = true`** en el WHERE del CTE:

```sql
WHERE ac.channel = 'whatsapp'
  AND regexp_replace(...) = regexp_replace($1, ...)
  AND ac.is_active = true
  AND a.is_active = true   -- <-- ya esta
LIMIT 1
```

**Pero el comportamiento es incorrecto:** si la agency esta `is_active=false`, el CTE NO devuelve fila. Los nodos downstream que hacen `$('Resolve Agency').first().json.agency_id` reciben `undefined` y crashean silenciosamente (sin telemetria, sin path explicito de "agency suspendida"). El mensaje queda guardado en `messages` por el webhook (que NO depende de N8N) pero el bot no responde Y tampoco hay log de POR QUE no respondio.

**Implicacion del hallazgo:**
1. **El "corte del bot" YA esta a medias** — funciona por accidente (crash silencioso).
2. **No es suficiente:** sin path explicito, debugging cuando un cliente se queja "el bot no contesta" es una pesadilla (¿es suspendido? ¿bug del bot? ¿problema YCloud?). Necesitamos path observable.
3. **Cambia la DT1 del founder:** el corte del bot **no se mueve** a otro lugar — se hace EXPLICITO donde ya esta (en el SQL de `Resolve Agency` + el IF `Chatbot Activado?` que ya lee `bot_enabled`).

Este hallazgo invierte la DT1: en vez de "cortar en edge o en N8N", la respuesta es "**cortar en SQL de la query maestra + path explicito en N8N existente + defense-in-depth en edge**". Detalle abajo.

---

## 1. Resumen ejecutivo

`is_active=false` en `agencies` debe producir **3 efectos reales** que hoy no produce de forma limpia:

1. **Bot N8N silenciado limpio:** mensaje del lead se persiste (auditoria), N8N entra a path explicito "agency suspendida" y termina sin invocar al LLM ni a `bot-actions`. Telemetria minima (1 fila en `webhook_events_raw.processing_error` con razon `agency_suspended`).
2. **Owner/agentes cliente-facing fuera:** request a `/a/[slug]/*` redirige a una pagina `/account-suspended` minimal, mobile-first, con boton "Cerrar sesion".
3. **Master sigue operando todo:** lista, detalle, impersonar, reactivar — sin friccion. Master impersonando una agency suspendida tambien entra (bypass del corte).

Reactivacion desde el panel master vuelve a habilitar todo inmediatamente. No requiere re-deploy de N8N.

---

## 2. Estado actual relevante

### 2.1 Que SI hace hoy `suspendAgency` (verificado en `agencies.ts:603-644`)

| Efecto | Estado |
|---|---|
| `UPDATE agencies SET is_active=false WHERE slug=?` | ✅ |
| Audit log `agency_suspend` en `master_audit_log` | ✅ |
| `revalidatePath('/master/clientes')` + detalle | ✅ |
| Banner "Suspendido" en `/master/clientes/[slug]` header | ✅ (ADM-2) |
| Badge "Suspendido" en lista master | ✅ (ADM-4-A) |
| Badge "Suspendido" en tabla resume dashboard | ✅ (ADM-4-A) |

### 2.2 Que NO hace hoy (los 3 gaps que este spec cierra)

| Gap | Comportamiento actual | Comportamiento deseado |
|---|---|---|
| **G1: Bot N8N** | El nodo `Resolve Agency` filtra `a.is_active=true` en el WHERE → si false, CTE vacio → crash silencioso de los nodos downstream → mensaje persistido sin respuesta + sin log. | CTE devuelve fila SIEMPRE; `bot_enabled` queda `false` cuando `is_active=false`. El IF `Chatbot Activado?` (que ya existe) toma el path "Chatbot NO Activado" → noop limpio + audit minima. |
| **G2: Login cliente** | Owner/agente entra a `/a/[slug]/inbox` normal. RLS deja pasar (es member). No hay check de `is_active`. | Layout `/a/[slug]/*` lee `agencies.is_active` (ya lo lee — el SELECT incluye id/name/slug pero NO is_active). Si false Y user NO es master → `redirect('/account-suspended?slug=...')`. |
| **G3: Defense-in-depth en webhook** | `ycloud-webhook` persiste el mensaje sin chequear si la agency esta activa. | (Opcional, bajo costo) Marcar `processed_at=null + processing_error='skipped: agency_suspended'` cuando la agency esta suspendida. Mensaje sigue persistiendo. |

### 2.3 Helpers / archivos a tocar

| Archivo | Tipo | Cambio |
|---|---|---|
| `crm-v2/src/app/a/[slug]/layout.tsx` | Server | Agregar lectura de `is_active` + redirect a `/account-suspended` si false y user no es master. |
| `crm-v2/src/lib/auth/require-agency-owner.ts` | Server helper | Agregar gate de `is_active` para todas las server actions del scope cliente (settings/equipo). Master impersonando: bypass. |
| `crm-v2/proxy.ts` | Edge proxy | **No se toca.** El gate vive en layout + helper. Razon en DT3. |
| `crm-v2/src/app/(public)/account-suspended/page.tsx` | Server (nuevo) | Pagina minimalista, mobile-first, con CTA "Cerrar sesion". |
| `crm-v2/src/app/auth/actions.ts` | Server | `signOut()` ya redirige a `/login`. **No se toca.** Si despues queremos limpiar la cookie `master_impersonating` (gap menor de ADM-2 §9), se hace fuera de este spec. |
| `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v1.json` | Workflow | Modificar SQL de `Resolve Agency` (G1). Sticky note nueva para futuros que lean el workflow. Versionado segun skill `n8n-workflow-versioning`. |
| `crm-v2/supabase/functions/ycloud-webhook/index.ts` | Edge function | Helper menor: chequear `is_active=false` despues de `resolveAgencyByPhone` y marcar `processing_error='skipped: agency_suspended'`. |
| `crm-v2/src/components/agency/agency-suspended-banner.tsx` | Server (nuevo) | (Solo cuando master impersona agency suspendida) Banner rojo "Esta cuenta esta suspendida — modo solo lectura para soporte". Ver DT7. |
| `crm-v2/src/app/master/clientes/[slug]/_components/agency-detail-header.tsx` | Client | (Solo cosmetico) Si `isActive=false`, agregar texto debajo del badge `"Suspendido desde DD/MM/YYYY"` usando un campo nuevo `suspendedAt` derivado del ultimo audit_log. DT7. Si no entra en presupuesto: skip a polish. |

### 2.4 Migration

**Ninguna nueva obligatoria.** La columna `agencies.is_active` ya existe desde migration 0002 (linea 47, `boolean not null default true`). Verificado.

**Opcional (DT8):** agregar columna `agencies.suspended_at timestamptz null` para que el banner muestre "suspendido desde X". Decision: **NO la incluimos en este spec**. Se deriva del `master_audit_log` cuando el panel la necesite (subquery menor en `getAgencyDetail`). Razon: scope creep mininmo, evita migration.

---

## 3. Objetivo (criterios de aceptacion verificables)

Al terminar este bloque, el founder debe poder verificar lo siguiente en localhost:

1. **Crear agency demo + impersonar** (ADM-2 ya cubre). OK.
2. **Suspender via boton master.** Badge cambia, audit_log tiene fila. OK (ya andaba).
3. **(NUEVO) Owner logueado intenta entrar a `/a/[slug]/inbox`** → redirect a `/account-suspended` con texto "Tu cuenta esta suspendida".
4. **(NUEVO) Owner intenta accion server (ej. enviar mensaje desde inbox)** → si la sesion siguio activa, la server action falla con error tipado `agency_suspended` (defense-in-depth, no rompe; UI no deberia llegar ahi porque el layout ya redirigio).
5. **(NUEVO) Bot N8N para mensaje entrante a la agency suspendida:** mensaje persiste en `messages` (via webhook), pero N8N entra al path "Chatbot NO Activado" y NO invoca al LLM, NO llama a `bot-actions`, NO consume tokens.
6. **(NUEVO) Master impersona la misma agency suspendida** → entra normal (banner ambar de impersonacion sigue). En `/a/[slug]/inbox` ve banner rojo adicional "Esta cuenta esta suspendida" (DT7), pero puede leer y operar (no redirect a `/account-suspended`).
7. **(NUEVO) Master reactiva:** owner refresca y entra normal sin re-login. Proximo mensaje WhatsApp es respondido normal por el bot.

---

## 4. Decisiones tecnicas resueltas (8/8)

Las DT del brief, resueltas con argumento. Tabla compacta primero, detalle abajo.

| # | Tema | Decision | Razon corta |
|---|---|---|---|
| DT1 | Punto de corte del bot | **En SQL de `Resolve Agency` + path existente "Chatbot NO Activado" + defense en webhook (gratis)** | Aprovechar IF `Chatbot Activado?` que ya existe en N8N. Edge + webhook como defense-in-depth gratis. Visible en N8N executions Y en `webhook_events_raw`. |
| DT2 | Comportamiento bot cortado | **A: silencio total + persistencia.** Mensaje del lead queda en `messages`, bot NO responde. | Reactivar = el master ve el contexto que paso. Mensaje canned (B) genera friccion innecesaria (cliente moroso no quiere que sus leads vean "estamos fuera de servicio"). C (no persistir) pierde auditoria. |
| DT3 | Punto de corte del login | **B: en `layout.tsx` de `/a/[slug]/*` + helper `requireAgencyOwner` para actions cliente.** NO en proxy. | Proxy no tiene acceso facil a `agencies.is_active` sin query extra. Layout ya hace el SELECT — agregar `is_active` al select es 0 costo. Helper cubre las actions. Triple defensa: layout + helper + (futuro) RLS. |
| DT4 | Master impersonando agency suspendida | **Bypass.** Master entra normal, ve el banner rojo extra. | El propio brief lo pide. Caso de soporte: diagnostico requiere acceso. |
| DT5 | Pagina `/account-suspended` | **Pagina dedicada minimalista mobile-first, branded.** CTA "Cerrar sesion". | Redirect a `/login` neutro deja al user sin contexto ("¿por que me sacaron?"). Pagina propia explica. Caso multi-agency: el redirect lleva `?slug=X` y la pagina menciona "tu cuenta en X esta suspendida"; otras agencies del mismo user **siguen funcionando** (DT5b). |
| DT6 | Cache / sesion activa | **Validacion server-side per-request. NO invalidacion activa.** | Proxima request del owner cae al gate del layout y redirige. Forzar logout en tiempo real es vendor-locked (Supabase no expone "invalidate this session"). Costo (owner ve la pantalla hasta que navega) es aceptable. |
| DT7 | UI feedback master cuando ve agency suspendida | **Banner ambar de impersonacion + banner rojo "Esta cuenta esta suspendida" debajo. Metricas/tabs visibles. NO read-only forzado.** | Master sigue operando. Banner rojo es el feedback honesto. Read-only forzado complica el codigo sin beneficio (el riesgo de master "rompe algo en agency suspendida" es bajo — es el founder). |
| DT8 | Reactivacion immediata | **Si, inmediata.** Sin acciones extra. | Master clic "Reactivar" → bot responde proximo mensaje + owner navega y entra. Conveniencia operativa. |

### DT1 — detalle del punto de corte del bot

El brief proponia "edge function vs N8N" como dicotomia. La auditoria revelo que **ambas opciones simultaneas son posibles a costo casi cero**, y la N8N **ya esta a medias**. Propongo:

**Layer 1 — Edge `ycloud-webhook` (defense in depth, fail fast, persistencia):**
- Despues de `resolveAgencyByPhone` (que ya lee `agency_channels`), agregar UNA query: `SELECT is_active FROM agencies WHERE id=?`. La query es trivial (~5-10ms con `idx_agencies_pkey`).
- Si `is_active=false`: persistir el mensaje SI MISMO (no perder el lead) pero NO continuar al procesamiento. Marcar la fila `webhook_events_raw` con `processing_error='skipped: agency_suspended'`.
- **Por que persistimos igual:** el mensaje del lead es valioso (cuando reactiven, el inbox tiene contexto). Si NO lo persistimos, perdemos el lead entrante. El acuerdo es "el bot no responde", no "borramos los mensajes".
- **Donde se ejecuta:** ANTES de los UPSERTs de lead/conversation/message. Decision matiz: **se ejecuta DESPUES de los UPSERTs** para que la conversacion/lead queden creados (asi reactivar conserva el lead). Detalle abajo.

**Layer 2 — N8N `Resolve Agency` (path explicito + telemetria):**
- Hoy el SQL hace `AND a.is_active=true` en el WHERE → fila vacia si suspendida → crash silencioso downstream.
- Fix: mover `is_active` del WHERE al SELECT. Devolver fila siempre. Setear `bot_enabled = (a.is_active AND COALESCE((settings->>'bot_enabled')::boolean, true))` (ya lo hace bien). El IF `Chatbot Activado?` que ya existe toma la rama negativa → noop.
- Para telemetria: agregar un nodo Code-node despues del NoOp existente que inserte 1 fila en `bot_observability.bot_turn_events` con `event_kind='skipped_agency_suspended'`. (DT-1.1 — incluido en presupuesto.)

**Defense en cascada:** si el edge falla en cortar (race condition: agency reactivada entre webhook y N8N), N8N corta. Si N8N falla (race inversa), el edge corto. **Doble red de seguridad sin costo notable.**

**Por que NO cortar SOLO en edge:** N8N executions son la fuente de verdad operativa del bot. Si solo cortamos en edge, debugging "¿por que el bot no respondio?" siempre obliga a abrir Supabase logs ANTES de N8N. Mejor: N8N tiene path explicito visible en su UI.

**Por que NO cortar SOLO en N8N:** el webhook ya es publico (Meta firma con HMAC). Si el bot tiene un bug y entra en loop, queremos cortar lo antes posible para no consumir compute. Edge corta antes.

### DT3 — detalle del punto de corte del login

Brief proponia A (proxy) / B (layout) / C (helper). Auditoria:
- **Proxy:** el proxy es edge-runtime. Hacer un SELECT a Supabase desde edge tiene latencia variable y suma a TODO request del sitio (no solo `/a/[slug]/*`). Cacheable, pero complejo. **No vale para esta fase.**
- **Layout:** el SELECT actual del layout devuelve `id, name, slug`. Agregar `is_active` al SELECT es cambiar UN string. La validacion redirige antes del render. Costo: 0.
- **Helper `requireAgencyOwner`:** solo se invoca en actions cliente. Agregar el chequeo da defense-in-depth para casos donde el layout no se ejecuto (Server Actions directas via formData de paginas legacy). Costo: 1 select extra dentro del helper (ya hace varios).

**Decision: B + C combinados.** Layout redirige (UX rapida), helper rechaza con error tipado `agency_suspended` (defensa).

### DT5b — caso multi-agency

User puede ser owner de A (activa) y agent de B (suspendida). Hoy es posible (el modelo n:m lo permite, ver `createAgencyWithOwner` mode `existing_user_added`).

**Comportamiento esperado:**
- Entra a `/a/A/inbox` → OK, normal.
- Entra a `/a/B/inbox` → redirect `/account-suspended?slug=B&from=/a/B/inbox`.
- `/account-suspended` muestra: "Tu acceso al espacio **{B.name}** esta suspendido temporalmente." + CTA "Volver al inicio" → `/` (que rutea a la primera agency disponible activa, ya implementado en `src/app/page.tsx`) + CTA secundaria "Cerrar sesion" → `/login`.
- **El user NO pierde acceso a A.** Sigue navegando entre agencies activas.

---

## 5. Cambios al backend (detalle por archivo)

### 5.1 `crm-v2/src/app/a/[slug]/layout.tsx`

**Cambio:** agregar `is_active` al SELECT de agency + nuevo branch de redirect.

```ts
// ANTES (linea 28):
const { data: agency } = await supabase
  .from('agencies')
  .select('id, name, slug')
  .eq('slug', slug)
  .maybeSingle();

if (!agency) notFound();

// DESPUES:
const { data: agency } = await supabase
  .from('agencies')
  .select('id, name, slug, is_active')
  .eq('slug', slug)
  .maybeSingle();

if (!agency) notFound();

// NUEVO: gate de is_active. Master bypassa (master_accounts lookup ya
// se hizo arriba en el layout, linea 22). Si user es master, entra normal
// con o sin impersonacion — el banner rojo lo agregamos en otro paso.
if (!agency.is_active && !master) {
  redirect(`/account-suspended?slug=${slug}`);
}
```

**Notas:**
- El SELECT ya filtra por RLS member-or-master. Si el user no es member y la agency esta suspendida, ya devolveria null y caeria en `notFound()` (no entra al branch nuevo). El branch nuevo solo aplica para members reales.
- Master impersonando (cookie + `master.role` populado) entra normal — el bypass es porque `master` es truthy.

### 5.2 `crm-v2/src/lib/auth/require-agency-owner.ts`

**Cambio:** agregar lookup de `is_active` + error tipado.

```ts
// Despues de resolver agency (rama master impersonando o member real):

// NUEVO: defensa para acciones cliente. Master impersonando: bypass.
if (impersonatingSlug !== slug) {
  // Solo validar is_active si NO es master impersonando.
  const { data: ag } = await supabase
    .from('agencies')
    .select('is_active')
    .eq('id', agencyId)
    .maybeSingle();

  if (!ag?.is_active) {
    // Same pattern que notFound() para no leakear: 404 generico para no-masters.
    notFound();
  }
}
```

**Por que notFound y no error tipado:** el helper hoy lanza `notFound()` para no-owners. Mantener convencion. Las actions cliente que invocan el helper recibiran `NEXT_NOT_FOUND` → Next muestra la 404 page. **Mejor UX que un toast "agency_suspended"** porque la UI cliente nunca deberia llegar ahi (layout ya redirigio).

**Edge case:** master impersonando una agency suspendida + invoca actions cliente → bypass por el `impersonatingSlug !== slug` no se cumple → CONTINUA. Master puede operar acciones. ✅

### 5.3 `crm-v2/proxy.ts`

**Sin cambios.** Decidido en DT3.

### 5.4 `crm-v2/src/app/(public)/account-suspended/page.tsx`

**Archivo nuevo.** Server component. Path bajo route group `(public)` (que aun no existe — crearlo: `mkdir src/app/(public)/`). Si el founder prefiere `/account-suspended` directo en `app/`, ambos funcionan; route group es para clarificar que NO requiere auth.

**Decision menor:** ponerlo en `src/app/account-suspended/page.tsx` sin route group. Mas simple, mismo efecto. `proxy.ts` no requiere auth para esta ruta (no es `/master/*` ni `/a/*`).

**Pseudo-codigo:**

```tsx
// src/app/account-suspended/page.tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/auth/actions';

type Props = {
  searchParams: Promise<{ slug?: string; from?: string }>;
};

export default async function AccountSuspendedPage({ searchParams }: Props) {
  const { slug } = await searchParams;

  // Lookup amistoso del nombre. Admin client no porque RLS deja al user
  // ver agency donde es member (incluso suspendida). Si no es member, name=null.
  let agencyName: string | null = null;
  if (slug) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('agencies').select('name').eq('slug', slug).maybeSingle();
    agencyName = data?.name ?? null;
  }

  return (
    <main className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-line bg-surface-elevated p-6 sm:p-8">
          <h1 className="font-display text-2xl sm:text-3xl text-ink mb-3">
            Cuenta suspendida
          </h1>
          <p className="text-ink-soft text-sm sm:text-base mb-6 leading-relaxed">
            {agencyName ? (
              <>Tu acceso al espacio <strong className="text-ink">{agencyName}</strong> esta suspendido temporalmente.</>
            ) : (
              <>Tu acceso a este espacio esta suspendido temporalmente.</>
            )}{' '}
            Si crees que es un error, escribinos a{' '}
            <a href="mailto:soporte@momentum-ai.com" className="text-accent underline underline-offset-2">
              soporte@momentum-ai.com
            </a>.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-elevated transition-colors"
            >
              Volver al inicio
            </Link>
            <form action={signOut} className="flex-1">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center rounded-lg bg-ink px-4 py-2 text-sm font-medium text-surface hover:bg-ink/90 transition-colors"
              >
                Cerrar sesion
              </button>
            </form>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-muted font-mono">
          Momentum AI CRM
        </p>
      </div>
    </main>
  );
}
```

**Dir de arte:** consistente con login + master (warm monochrome, terracota accent, sin gradients, sin shadows pesados). No usar amber/red dramatico — el founder fue claro: diferenciador, NO AI-slop. El tono es **informativo, no alarmante**.

**Mobile-first:** todos los breakpoints son `sm:` upward. El layout es card centrada con max-w-md (~28rem), funciona perfecto en 375px.

### 5.5 `crm-v2/src/components/agency/agency-suspended-banner.tsx` (nuevo)

Server component que se monta en `layout.tsx` JUNTO al `ImpersonationBanner`. Solo renderiza si:
- La agency cargada tiene `is_active=false`.
- El user es master (porque si no es master, ya esta redirigido).

```tsx
// pseudo
type Props = { isActive: boolean; isMaster: boolean; agencyName: string };

export function AgencySuspendedBanner({ isActive, isMaster, agencyName }: Props) {
  if (isActive || !isMaster) return null;
  return (
    <div className="sticky top-0 z-30 w-full border-b border-pale-red/40 bg-pale-red/15 text-pale-red-ink">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-sm">
        <Warning size={14} weight="bold" />
        <p className="flex-1">
          <strong className="font-semibold">{agencyName} esta suspendida.</strong>{' '}
          <span className="text-pale-red-ink/80">Estas operando como master para diagnostico.</span>
        </p>
      </div>
    </div>
  );
}
```

**Stacking con banner ambar:** si master impersona Y la agency esta suspendida, los dos banners se apilan. Ambar arriba (`z-30 top-0`), rojo debajo. Visualmente OK: el rojo queda **abajo** porque se monta despues. Decision menor (DT7b): el orden importa narrativamente (primero "estas impersonando", luego "y esta suspendida"), pero NO afecta funcionalidad. Implementador puede decidir orden final.

### 5.6 `crm-v2/src/app/a/[slug]/layout.tsx` — montaje del nuevo banner

```tsx
return (
  <>
    <ImpersonationBanner />
    <AgencySuspendedBanner
      isActive={agency.is_active}
      isMaster={Boolean(master)}
      agencyName={agency.name}
    />
    <AgencyShell ...>
      {children}
    </AgencyShell>
  </>
);
```

### 5.7 `crm-v2/supabase/functions/ycloud-webhook/index.ts`

**Cambio:** dentro de `handleInboundMessage`, **despues de los UPSERTs** de lead/conversation/message (para no perder datos), chequear `is_active`. Si false: marcar la fila `webhook_events_raw.processing_error='skipped: agency_suspended'` y retornar `processed: false` para que N8N nunca dispare el flujo desde su lado del worker.

Pero atencion: el ycloud-webhook **NO dispara N8N**. N8N tiene su propio webhook node que recibe los mensajes (segun el flujo del workflow). El edge function escribe a Supabase, y N8N esta o bien suscrito (no es el caso) o bien tiene su propio HTTP webhook de YCloud (es el caso real).

**Verificacion necesaria para el implementador:** abrir `chatbot-momentum-bot-v6-v1.json` y confirmar que el trigger es un Webhook node de N8N que recibe DIRECTAMENTE de YCloud. Si asi es, el edge ycloud-webhook y N8N reciben el **mismo payload en paralelo** desde YCloud. Esto significa:

- **El corte en edge NO previene que N8N reciba el mensaje.** Solo evita procesamiento adicional en Supabase (audit limpio).
- **El corte real del bot tiene que estar en N8N tambien.** Lo que confirma DT1: ambos cortes son necesarios, no redundantes.

**Cambio concreto en `handleInboundMessage`:**

```ts
// Despues de UPSERTs (linea ~677 original):
const result = await insertInboundMessageIdempotent(sb, { ... });

// NUEVO: chequear is_active. Si suspendida, marcar como skipped.
const { data: agencyRow } = await sb
  .from('agencies')
  .select('is_active')
  .eq('id', agencyCtx.agency_id)
  .maybeSingle();

if (agencyRow && agencyRow.is_active === false) {
  return {
    processed: false,
    reason: 'agency_suspended',
    details: {
      agency_id: agencyCtx.agency_id,
      lead_id: leadId,
      conversation_id: conversationId,
      message_inserted: result.inserted,
    },
  };
}

return { processed: true, details: { ... } };
```

**Por que despues de los UPSERTs:** el mensaje del lead se persiste (no se pierde), pero el `processed_at` queda null y el `processing_error` queda con razon explicita. Al reactivar, los mensajes pasados estan en el inbox. ✅

**Para el caller del webhook (YCloud):** sigue recibiendo `200 OK` con `processed: false, reason: 'agency_suspended'`. YCloud no reintenta (es comportamiento esperado).

### 5.8 `crm-v2/n8n/workflows/chatbot-momentum-bot-v6-v1.json`

Cambio en el SQL del nodo `Resolve Agency` (linea 1458):

**Antes:**

```sql
WITH ag AS (
  SELECT ac.agency_id, ac.phone_number, a.is_active, a.bot_config, a.settings,
         (a.is_active AND COALESCE((a.settings->>'bot_enabled')::boolean, true)) AS bot_enabled
  FROM public.agency_channels ac
  JOIN public.agencies a ON a.id = ac.agency_id
  WHERE ac.channel = 'whatsapp'
    AND regexp_replace(ac.phone_number, '\D', '', 'g') = regexp_replace($1, '\D', '', 'g')
    AND ac.is_active = true
    AND a.is_active = true  -- <-- esto filtra
  LIMIT 1
)
SELECT ...
```

**Despues:**

```sql
WITH ag AS (
  SELECT ac.agency_id, ac.phone_number, a.is_active, a.bot_config, a.settings,
         (a.is_active AND COALESCE((a.settings->>'bot_enabled')::boolean, true)) AS bot_enabled
  FROM public.agency_channels ac
  JOIN public.agencies a ON a.id = ac.agency_id
  WHERE ac.channel = 'whatsapp'
    AND regexp_replace(ac.phone_number, '\D', '', 'g') = regexp_replace($1, '\D', '', 'g')
    AND ac.is_active = true
    -- removido: AND a.is_active = true. El filtro se hace via bot_enabled.
  LIMIT 1
)
SELECT
  ag.agency_id,
  ag.phone_number,
  ag.is_active,                 -- NUEVO: exponer al downstream para telemetria
  ag.bot_enabled,                -- ya existe: false cuando is_active=false
  ag.bot_config,
  ag.settings,
  ...
```

El IF `Chatbot Activado?` (linea 445-497) ya lee `bot_enabled === true`. Cuando `is_active=false`, `bot_enabled=false`, IF toma rama negativa → noop. ✅ **Cero cambios al IF.**

**Telemetria (DT-1.1):** agregar nodo Code-node despues de la rama negativa del IF (boolean false). Insert minimo a `bot_observability.bot_turn_events` (tabla ya existe segun migration 0015):

```javascript
// Code-node "Log Agency Suspended Skip"
const agency = $('Resolve Agency').first().json;
const ctx = $('Extract Variables').first().json;
return [{
  json: {
    event_kind: 'bot_skipped_agency_suspended',
    agency_id: agency.agency_id,
    metadata: { phone: ctx.businessPhone, lead_phone: ctx.leadPhone }
  }
}];
```

Seguido de un Postgres node que inserta a `bot_turn_events`. (Verificar shape exacto de la tabla en migration 0015 antes de codear — fuera de esta spec.)

**Sticky note nueva** en N8N explicando el path "agency suspendida": "Si `Resolve Agency.bot_enabled=false`, el IF toma rama negativa. Razones posibles: `agencies.is_active=false` (suspended por master) o `agencies.settings.bot_enabled=false` (cliente apago el bot). El path negativo loguea a bot_turn_events y termina sin invocar al LLM."

**Versionado:** seguir skill `n8n-workflow-versioning`:
1. Snapshot del workflow actual antes de modificar (`snapshots/bot-v6-v1-PRE-ADM4B-2026-06-04.json`).
2. Editar `chatbot-momentum-bot-v6-v1.json` directo + commit en repo.
3. PUT del workflow via API a N8N. Tag `bot-v6-v1-adm4b-2026-06-04`.
4. Rollback procedure: re-deployar el snapshot.

---

## 6. Cambios al frontend (resumen)

| Archivo | Cambio | Esfuerzo |
|---|---|---|
| `src/app/account-suspended/page.tsx` | Crear pagina nueva (mobile-first, branded, dos CTAs) | 1h |
| `src/components/agency/agency-suspended-banner.tsx` | Crear banner rojo soft. Renderizado condicional. | 0.5h |
| `src/app/a/[slug]/layout.tsx` | Montar el nuevo banner + select extendido | 0.25h |
| (Opcional DT7-extra) `src/app/master/clientes/[slug]/_components/agency-detail-header.tsx` | Mostrar fecha de suspension debajo del badge | 0.5h (puede ir a polish bloque C) |

**Dir de arte recordatoria:**
- Mobile-first sin excepcion.
- Warm monochrome del proyecto: surface / surface-elevated / line / ink / ink-soft / accent (terracota) / pale-red / pale-green.
- Sin gradients, sin shadow pesado, sin emojis.
- Iconos: phosphor-icons (ya usado en `ImpersonationBanner` y otros). `Warning` o `Lock` para `/account-suspended`.

---

## 7. Cambios a edge functions

Ver §5.7. Solo `ycloud-webhook/index.ts` — un solo bloque agregado en `handleInboundMessage`. Deploy via supabase MCP (`mcp__supabase__deploy_edge_function`, multipart, NUNCA JSON body — feedback registrado `feedback_supabase_function_multipart_deploy`).

**Verificar antes del deploy:** smoke test local con un mensaje a la agency suspendida → ver `webhook_events_raw.processing_error='skipped: agency_suspended'` + `messages` tiene fila nueva.

---

## 8. Cambios al N8N

Ver §5.8. Resumen:
1. Modificar SQL de `Resolve Agency` (mover `is_active` del WHERE al SELECT).
2. Agregar nodo Code + Postgres para log de skip.
3. Sticky note nueva.
4. Snapshot + commit + PUT API + tag.

Tiempo estimado N8N: 1.5h (incluye snapshot, edicion JSON, deploy via API, smoke test).

---

## 9. Testing manual (paso a paso del founder en localhost)

Pre-condicion: dos workspaces en el ambiente — uno activo (Momentum AI CRM) y otro de test creado para suspender/reactivar (ej. crear "Test Suspension" via boton master). Idealmente con un owner-test distinto a Hans (crear con email tipo `+test1@hans.com`).

**Test 1 — Suspension corta login del owner.**
1. Login como owner del workspace test. Confirmar entra a `/a/test-suspension/inbox`. OK.
2. Logout.
3. Login como Hans (master). Ir a `/master/clientes/test-suspension`.
4. Click "Suspender" → confirmar modal. Toast OK. Badge cambia.
5. Logout.
6. Login como owner del workspace test (mismo de paso 1).
7. **Expected:** redirect inmediato a `/account-suspended?slug=test-suspension`. Pagina muestra "Tu acceso al espacio Test Suspension esta suspendido temporalmente." Dos botones funcionando.
8. Click "Volver al inicio" → si el user solo tenia esta agency, lo lleva a `/` y `/` renderiza empty state (no hay agencies activas). Si tiene otras agencies activas, lo lleva a la primera.
9. Click "Cerrar sesion" → login.

**Test 2 — Suspension corta el bot.**
1. Confirmar workspace test tiene `agency_channels` con un numero WhatsApp (sandbox YCloud o un numero de prueba).
2. Suspender desde master (si no esta suspendido).
3. Enviar mensaje WhatsApp al numero. Esperar ~5s.
4. **Expected:**
   - `webhook_events_raw` tiene fila con `processing_error='skipped: agency_suspended'`.
   - `messages` tiene fila nueva del mensaje (lead persistido).
   - N8N executions: una execucion con path "Chatbot NO Activado" (rama negativa del IF).
   - `bot_observability.bot_turn_events` tiene fila con `event_kind='bot_skipped_agency_suspended'`.
   - NO hay invocacion a `bot-actions`. NO hay invocacion al LLM.

**Test 3 — Master impersonando agency suspendida.**
1. Hans logueado. Ir a `/master/clientes/test-suspension` (sigue suspendida).
2. Click "Ingresar como este cliente".
3. **Expected:** redirect a `/a/test-suspension/inbox`. Banner ambar visible. Banner rojo visible debajo: "Test Suspension esta suspendida. Estas operando como master para diagnostico."
4. Navegar al inbox, ver leads/mensajes. Todo funciona.
5. Salir de impersonacion → vuelve a `/master/clientes/test-suspension`.

**Test 4 — Reactivacion inmediata.**
1. Hans en `/master/clientes/test-suspension`. Suspendida.
2. Click "Reactivar". Toast OK.
3. Owner del workspace test (sin re-login) entra a `/a/test-suspension/inbox` → entra normal.
4. Mandar mensaje WhatsApp al numero → bot responde como antes.
5. **Expected:** `webhook_events_raw` con `processed_at != null`. N8N tiene execucion con LLM invocado. Todo normal.

**Test 5 — Multi-agency (DT5b).**
1. Crear un user que es owner de A (activa) y agent de B (test-suspension, suspendida). Manual via SQL o usar el panel cliente de A.
2. Login con ese user.
3. Entrar a `/a/A/inbox` → OK normal.
4. Cambiar URL a `/a/test-suspension/inbox`.
5. **Expected:** redirect a `/account-suspended?slug=test-suspension`. Click "Volver al inicio" → lleva a `/a/A/inbox` (la activa). ✅

**Test 6 — Sesion activa pre-suspension (DT6 — caso edge).**
1. Owner logueado y CON LA PESTANA ABIERTA en `/a/test-suspension/inbox`.
2. Hans suspende desde otra pestana.
3. Owner ve su inbox SIN CAMBIOS (es un snapshot SSR).
4. Owner navega a `/leads` (o cualquier otra ruta `/a/test-suspension/*`).
5. **Expected:** redirect a `/account-suspended`. **NO se invalida la sesion en tiempo real** — solo en proxima navegacion. Comportamiento documentado.

**Verificacion final pre-PR:**
- `supabase migrations list` — ninguna nueva aplicada.
- `pnpm build` pasa local.
- Lint pasa.
- Smoke test 1-6 anteriores PASSED por el founder en localhost.

---

## 10. Migration nueva

**Ninguna.** Verificado:
- `agencies.is_active` ya existe (migration 0002, linea 47, `boolean not null default true`).
- `bot_observability.bot_turn_events` ya existe (migration 0015).

Si el implementador encuentra que `bot_turn_events` no tiene shape compatible para el log de skip (`event_kind` no existe, o la tabla tiene constraint que no acepta el insert), tiene 2 opciones:
- Opcion 1: ajustar el JSON del Code-node al shape real.
- Opcion 2: skipear la telemetria DETALLADA y conformarse con el log de N8N execution (rama negativa visible). DT-1.1 degrada a "best-effort".

---

## 11. Estimacion final

| Capa | Tarea | Horas |
|---|---|---|
| Backend | Layout `/a/[slug]/*` extendido + select + redirect | 0.5 |
| Backend | Helper `requireAgencyOwner` con gate is_active | 0.5 |
| Backend | Edge function `ycloud-webhook` con chequeo + deploy | 1.0 |
| Backend | N8N: snapshot + SQL update + Code+Postgres nodes + sticky + deploy + tag | 1.5 |
| Frontend | Pagina `/account-suspended` mobile-first | 1.0 |
| Frontend | Banner `<AgencySuspendedBanner />` + montaje en layout | 0.5 |
| Testing | Tests 1-6 manuales del founder + smoke en agency real | 1.5 |
| Buffer | Bugs imprevistos, fricciones N8N, deploy issues | 1.5 |
| **TOTAL** | | **8.0h** |

Cabe en el rango objetivo 6-10h. **1 jornada de trabajo.**

---

## 12. Riesgos y casos edge

| # | Riesgo / edge case | Comportamiento esperado / mitigacion |
|---|---|---|
| R1 | Race: master suspende mientras owner esta mandando mensaje desde inbox | El UPDATE del send action puede pasar si llega antes del UPDATE de `is_active`. La action en si misma NO chequea `is_active` (solo el helper de requireAgencyOwner). **Acepto:** el ultimo mensaje del owner se manda; proxima accion lo bloquea. Equivale al test 6. |
| R2 | Race: master reactiva mientras N8N esta procesando un mensaje "viejo" recibido durante suspension | El mensaje viejo ya fue marcado `processed=false, reason=agency_suspended` por el webhook. NO se re-procesa. El proximo mensaje fresco si entra normal. Aceptable — los mensajes pendientes de la ventana de suspension se quedan en el inbox para que el owner los lea cuando entre. |
| R3 | Master suspende durante una conversation activa entre owner y lead | Owner ve banner solo en proxima navegacion. Conversation visible en inbox no se ve afectada (SSR snapshot). Lead manda mensaje → webhook persiste + N8N skipea. Aceptable. |
| R4 | El nodo Code+Postgres de telemetria falla porque `bot_turn_events` tiene constraint inesperado | Aislar el insert: `onError: continueRegularOutput`. Si falla, el path principal (skip + noop) sigue funcionando. Telemetria mejor que silencio, pero no critical. |
| R5 | Master tiene cookie `master_impersonating` de una agency suspendida, sesion master expira → cookie queda huerfana | Proxy ya tiene branch defensivo (linea 36-71): si el user no es master activo, borra la cookie. Cae a path normal → layout redirige a `/account-suspended`. Cubierto. |
| R6 | `/account-suspended` accedido sin slug en query string | Pagina muestra texto generico "Tu acceso a este espacio esta suspendido". Funciona. |
| R7 | User no-autenticado entra a `/account-suspended` | El proxy actual NO requiere auth para esta ruta (matcher la deja pasar; `updateSession` solo redirige si es ruta protegida). La pagina renderiza sin friccion. Si quiere "Cerrar sesion" sin estar logueado, el form no hace nada visible — UX aceptable. |
| R8 | `agencies.is_active` se cambia via SQL directo bypaseando `suspendAgency` | El audit log no se llena, pero el corte funciona igual (la verdad de fuente es la columna). Aceptable. Edge case raro fuera de soporte. |
| R9 | Implementador deploya el cambio al webhook PERO no al N8N (parcial) | Edge corta → webhook devuelve `processed=false`. N8N sigue procesando (su trigger es independiente). Bot responde. **MITIGACION:** orden de deploy obligatorio = N8N primero, edge despues. Documentado en §13 abajo. |
| R10 | El SELECT extra del layout (`is_active`) suma latencia | Es la misma query, no es un select extra. Cambia solo el campo. Costo cero. |
| R11 | Owner intenta hacer login (`signInWithPassword`) cuando su unica agency esta suspendida | Login pasa (Supabase Auth no sabe nada de agencies). Redirect a `/` (default). `/` rutea a la primera agency disponible → no hay ninguna activa para este user → layout de `/` debe manejar. **Pendiente verificar:** ¿como maneja `src/app/page.tsx` el caso "user sin agencies activas"? Si no lo maneja, agregar fallback "no tenes acceso a ningun espacio activo. Contacta a soporte." Asumo que ya existe — sino, es un fix de 15 min para el implementador. |
| R12 | Bot N8N actualmente filtra ADEMAS de `is_active` por `agency_channels.is_active` | Sin cambios. Si el master quiere "apagar el bot SOLO en un canal", existe esa otra columna. No conflicta. |

---

## 13. Orden de deploy obligatorio

Para no dejar una ventana donde el bot responde a agencies suspendidas:

1. **Deploy N8N** (workflow PUT via API). Verificar via N8N UI: rama "Chatbot NO Activado" sigue conectada al noop. Tag `bot-v6-v1-adm4b-2026-06-04`.
2. **Deploy edge function** `ycloud-webhook` (multipart Management API).
3. **Deploy Next.js** (Vercel preview de la PR). Verificar smoke test del founder pasa.
4. **Merge a main** → Vercel produccion auto-deploy.

Reverso (rollback):
1. Revert merge a main.
2. Re-deploy `ycloud-webhook` previo (snapshot del git).
3. PUT workflow snapshot pre-ADM4B (path: `n8n/workflows/snapshots/bot-v6-v1-PRE-ADM4B-2026-06-04.json`).

---

## 14. Pre-Mortem — Si esto sale mal en produccion, ¿como sale mal?

### Escenario 1: "Suspender NO corta el bot y un cliente moroso sigue consumiendo tokens"

**Como:** el N8N no se deploya correctamente (PUT falla silencioso o se hace al workflow equivocado). Edge funciona pero N8N sigue con `Resolve Agency` viejo. Resultado: edge marca skipped, pero N8N procesa igual porque su trigger es webhook directo de YCloud.

**Como la spec lo evita:**
- Test 2 del founder (§9) verifica explicitamente que **N8N execution toma path negativo y NO hay invocacion a LLM**. Si el test falla, no se mergea.
- DT1 explicito: defense in depth — edge + N8N, no uno solo.
- Orden de deploy §13: N8N primero, edge segundo. Si N8N falla, no se sigue.

**Si igual pasa en prod:** monitorear consumo de tokens OpenAI diariamente. Si un cliente suspendido tiene activity en `bot_turn_events`, alerta. (Fuera de scope ADM-4-B pero deberia ser un check trivial en el dashboard master post-ADM-4.)

### Escenario 2: "El owner pierde el acceso a TODAS sus agencies, incluyendo las activas"

**Como:** bug en `/` (la home rooting) — si una de las agencies del user esta suspendida, la home defaultea a esa primero y redirige a `/account-suspended` en loop.

**Como la spec lo evita:**
- DT5b explicito: el corte es POR AGENCY, no por user.
- Test 5 del founder verifica multi-agency.
- Layout solo redirige cuando `agency.is_active=false`, no afecta a otras agencies.

**Si pasa:** el implementador tiene que revisar `src/app/page.tsx` y asegurar que la logica de "elegir primera agency" filtre por `is_active=true`. Esto NO es responsabilidad de ADM-4-B sino de la home — pero **es un riesgo aceptado si la home no lo hacia bien antes**. Recomendacion: el backend-builder revisa ese archivo y, si encuentra el bug, lo arregla en el mismo PR (es <15 min).

### Escenario 3: "Master suspende a un cliente y no puede entrar para diagnosticar"

**Como:** el bypass para master no funciona porque hay un edge case con la cookie `master_impersonating` (expiro, no se setea bien, etc.).

**Como la spec lo evita:**
- DT4 explicito + Test 3 del founder verifica explicitamente este caso.
- El bypass usa `master.role` populado en el layout, **no la cookie**. La cookie es solo marcador de UI. Si el user es master real (chequeado server-side cada request), entra. ✅

**Si pasa:** el master siempre tiene acceso via `/master/clientes/[slug]` (panel). No es bloqueante porque puede ver detalle + audit_log + counters desde alli. El gap es solo "no puede ver el inbox del cliente" — workaround inmediato es reactivar 1 min, ver, suspender. No es catastrofico.

---

## 15. Decisiones que NECESITAN input del founder antes de construir (bloqueantes)

**Ninguna.** Las 8 DT estan resueltas. Si el founder discrepa con alguna, abrir hilo antes de despachar al builder. Pero la spec esta lista para ejecucion.

Lista de cosas que **NO bloquean** pero seria bueno confirmar en una linea con el founder:
- ✋ DT5: ¿OK la copy de `/account-suspended`? "Tu acceso al espacio X esta suspendido temporalmente. Si crees que es un error, escribinos a soporte@momentum-ai.com." — copy default; cambiar si el founder prefiere algo mas frio o mas calido.
- ✋ DT7: ¿OK el banner rojo soft cuando master impersona? Alternativa: solo el ambar (mas sutil). Opto por rojo soft porque la info es importante para no confundir al master.
- ✋ DT8: el dominio de soporte. Asumo `soporte@momentum-ai.com`. Si es otro, replace.

Estos son ajustes cosmeticos de 5 min, no bloquean el despacho.

---

## 16. Lo que NO entra en este spec (recordatorio congelado)

- Polish UX bloque C (empty states, animaciones, tooltips custom).
- Edicion de info del cliente desde `/master/clientes/[slug]` (Settings tab, mencionado en plan §5 ADM-5).
- Settings cliente-facing P1.2 (bot scheduling, equipo expandido, integraciones).
- Suspension parcial (solo bot, solo login, solo canal X). Hoy es binaria. Si el founder quiere granularidad, abrir nuevo spec.
- Notification al owner cuando se suspende su cuenta (email transaccional). Hoy el owner se entera al intentar entrar. Si el founder quiere "avisarle por email", es feature nueva.
- Auto-suspension por billing (cliente moroso → auto-suspend N dias sin pagar). Eso es ADM-5 o Bloque 4 del roadmap (billing).
- Reporting de suspensions (cuantas, cuando, por que). Hoy esta en `master_audit_log` — UI de lectura es polish.
- Cleanup de la cookie `master_impersonating` en `signOut` (gap menor identificado en ADM-2 §9 pero no implementado en `auth/actions.ts`). Si vale agregarlo en este PR, son 2 lineas; lo dejo a criterio del implementador.

---

## 17. Anexo — checklist final pre-merge

- [ ] Migracion: ninguna nueva (confirmar).
- [ ] Build pasa local (`pnpm build`).
- [ ] Lint sin warnings.
- [ ] N8N workflow snapshot guardado en `snapshots/`.
- [ ] N8N workflow tag aplicado: `bot-v6-v1-adm4b-2026-06-04`.
- [ ] Edge function `ycloud-webhook` deployada via multipart Management API. Verificacion GET de version OK.
- [ ] Test 1 (login owner suspendido → redirect) PASSED.
- [ ] Test 2 (bot N8N corte real + telemetria) PASSED.
- [ ] Test 3 (master impersona suspended) PASSED.
- [ ] Test 4 (reactivacion inmediata) PASSED.
- [ ] Test 5 (multi-agency) PASSED.
- [ ] Test 6 (sesion activa pre-suspension) PASSED.
- [ ] PR a `main` via feature branch + Vercel preview (cumple `feedback_github_workflow.md`).
- [ ] Update `memory/decisions.md` con D7 (cableado real de `is_active`).
- [ ] Update `memory/plan-sistema-admin.md` marcando ADM-4 Bloque B como completado.

---

**Fin del spec ADM-4 Bloque B.**
