Proyecto: Momentum AI CRM — plataforma multi-tenant (multi-agencia) que centraliza
el inbox de WhatsApp + el pipeline comercial de cada cliente, con un bot de IA (n8n)
que atiende y califica leads. Stack: Next.js 16 (App Router) + React 19 + Tailwind 4
+ Supabase (Postgres + RLS + Realtime Broadcast) + WhatsApp vía YCloud. En producción.

Dónde vive el código: `crm-v2/` (repo git independiente, rama prod = main). pnpm.

ANTES de empezar (regla del proyecto, en crm-v2/AGENTS.md):
1. Leé `crm-v2/memory/backlog.md` → fuente de verdad del estado (hecho/pendiente/cómo
   se verificó). No reconstruyas el estado de memoria.
2. Leé `crm-v2/AGENTS.md` y `crm-v2/CLAUDE.md` → reglas operativas no negociables.

Mapa del código (`crm-v2/src/`):
- app/a/[slug]/   → app de cada agencia (tenant): page.tsx (Resumen/dashboard),
                    inbox/ (conversaciones), leads/ (contactos + leads/[id] detalle),
                    admin/, settings/ (+equipo/), agenda|seguimientos|tareas (próximamente)
- app/master/     → panel super-admin: clientes/, salud/
- app/login, app/auth/reset, app/account-suspended, app/privacy|terms
- components/     → por feature: agency/ (shell+sidebar, dashboard, settings, admin),
                    contactos/ (tabla, kanban, detail), inbox/ (3 paneles), notifications/, ui/
- lib/            → auth/ (roles+RLS helpers), supabase/ (client/server/admin),
                    contactos/, dashboard/, inbox/, health/, notifications/
- supabase/       → migraciones SQL

Gotchas del stack (importantes):
- Next 16 tiene breaking changes vs lo conocido: si una API/convención te suena rara,
  leé node_modules/next/dist/docs/ antes de escribir.
- Multi-tenant con RLS: casi todo scopeado por agency_id; service_role bypassa RLS.
- Realtime: Broadcast (triggers + realtime.send sobre canal privado agency:<id>),
  NO postgres_changes (deprecado).
- UI token-driven (Tailwind tokens en globals.css), sistema visual "Aurora", mobile-first.
- Correr: `pnpm dev`. Verificar: `pnpm build`.

Workflow (no negociable):
- Nunca commit directo a main → feature branch (feat/ o fix/) → `pnpm build` limpio →
  PR → preview Vercel → merge.
- Verificá el efecto REAL contra la fuente de verdad de la capa (la DB tras refresh,
  el build, la ejecución viva) antes de decir "hecho". "Compila"/"se ve bien" ≠ "funciona".
- Un task, un chat.

TAREA DE HOY: <describí en lenguaje natural lo que querés lograr>.
