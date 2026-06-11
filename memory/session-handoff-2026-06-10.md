# Session Handoff — 2026-06-10 — Mateo en producción de test + fix duplicación de leads

**Propósito:** Snapshot del estado del proyecto al cierre del 2026-06-10. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-06.md` queda como histórico).

Cargar también:

- `memory/leccion-2026-06-10-por-que-mateo-funciona.md` ⭐ — análisis verificado de POR QUÉ los prompts Mateo funcionan y los anteriores no (6 principios + 5 hipótesis)
- `memory/feedback-prompting.md` ⭐ — §7-8 nuevos (principios Mateo + canon actualizado del Formateador + regla del parser required)
- `memory/decisions.md` (entrada 2026-06-10)
- `memory/feedback-n8n-build.md` — checklist N8N (sigue vigente)
- `clients/momentum-ai-crm/test-prompts/` ⭐ — **CANON de los prompts del bot Momentum** (architecture.md + 4 prompts). Los de `prompts/` son referencia histórica, NO editarlos.

---

## Estado del bot Momentum (lo más importante)

**FUNCIONA.** Primera conversación e2e validada por el founder ("demasiado bien, me encanta"):
hook → discovery → agitación → pitch → calificación → cierre directivo → handoff silencioso.
Sin re-preguntas, sin mensajes intrusos, sin tells de bot.

| Ítem | Valor |
|---|---|
| Workflow N8N | `Chatbot Momentum - bot-c v1` (id `Jsh4krhC9HRUh7Ly`), **97 nodos**, active |
| versionId vigente | `957f0906-684d-454d-ae3b-d962759923ea` (SET14) |
| Tag git de retorno | `bot-c-v1-mateo-2026-06-10` (crm-v2, commit `013da72`) |
| Bot | **Mateo** — setter humano puro, NUNCA revela ser bot |
| Edge function | `ycloud-webhook` **v1.2.0** (v9) — fallback por phone en upsertLead |
| Migración nueva | 0022 — índice único `(agency_id, whatsapp_phone)` leads vivos |

### SETs aplicados hoy (cronológico)

- **SET10:** fix tilde en key `Historial de conversacion` del Router (undefined silencioso)
- **SET11:** los 4 prompts Mateo del founder. Agente Principal INLINE (sin `Componer System Prompt`). `Limpiar Puntuacion` eliminado (el Formateador nuevo limpia puntuación él mismo)
- **SET12:** parser del Formateador a schema manual, solo `MENSAJE 1` required → mata los mensajes inventados por el Auto-fixing Parser (causa raíz del bug P2 histórico)
- **SET13:** Formateador divide por saltos de línea, pregunta SIEMPRE sola (directriz founder)
- **SET14:** `ORDER BY` actividad reciente en `Buscar Lead` (defensa ante duplicados)

### Snapshots de rollback

`crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-SET{10,11,12,13,14}-2026-06-*.json` — todos commiteados.

---

## El incidente de leads duplicados (fixeado hoy — IMPORTANTE para producción)

**YCloud rotó masivamente los contact-record IDs** (`wa_user_id`: `CR.*`/`GB.*` → `*.2174*`) alrededor del 06-09/10. El dedupe de `ycloud-webhook` era SOLO por `wa_user_id` → **3 leads duplicados** (Hans, Kevin Herra, +44): historial partido en dos conversaciones, handoff marcado en la muerta, bot resucitado para Kevin que estaba en handoff.

**Fixes aplicados (los 4):**
1. `ycloud-webhook` v1.2.0: fallback por teléfono + re-pin del `wa_user_id` nuevo (el teléfono es la identidad estable, el CR.* es alias)
2. SET14: `ORDER BY` en `Buscar Lead` de N8N
3. Los 3 pares mergeados (mensajes consolidados, handoffs preservados, duplicados soft-deleted con `wa_user_id=NULL`)
4. Migración 0022: la BD bloquea físicamente duplicados futuros

**Verificado e2e:** mensaje post-handoff de Hans cayó en la conversación canónica, sin lead nuevo, bot calló.

---

## Otros entregables de la sesión

- **MCP Supabase fixeado** (global `~/.claude.json`, PAT del `.env.local`, project `fahujscodhqlopycorzn` = "CRM System"). El `.mcp.json` del proyecto se eliminó (interpolación rota + precedencia). Backups: `~/.claude.json.backup-pre-mcp-fix-2026-06-09`, `.mcp.json.backup-pre-removal-2026-06-09`.
- **Demo agency "Inmobiliaria Costa Verde"** (`11111111-aaaa-aaaa-aaaa-000000000001`, owner Valeria Solís): 10 leads / 10 convs / 73 msgs / 5 stages / 4 tags / 17 bot_turns / 4 razones de handoff. Para demos de venta. Borrable por el agency_id.
- **Análisis Mateo vs v1** persistido (lección + feedback-prompting §7-8).
- CRM v1 corre en `localhost:3000` (si sigue vivo el proceso).

---

## Pendientes inmediatos (próxima sesión)

1. **Testear paths del bot NO ejercitados** (la conversación validada fue happy path con el founder):
   - "es caro" / "lo pienso" → Agente Objeciones (LAARC, 1 mensaje, cierre con pregunta)
   - Pregunta de precio → deflect sin número; insistencia → ancla sin cifras exactas
   - "pasame con alguien" → handoff user_requested
   - Lead sin ads + pocos mensajes → descalificación elegante
2. **Evaluar reincorporar al Router** lo que el nuevo perdió vs el viejo: campos `pain_principal`/`authority`/`timeline`/`calificacion` (si el CRM los consume) + los 10 ejemplos clasificados + caso fuera-de-scope (HIPAA).
3. **Capturar skills** (contexto fresco): `mcp-supabase-config-precedence`, `n8n-structured-parser-required-fields`, `ycloud-wa-user-id-rotation`, `supabase-demo-agency-seed`.
4. **Meta Ads** (~2026-06-11): bloqueante principal resuelto (bot funciona). Falta: link Calendly de Hans/Pietro en `bot_config`, campañas Meta configuradas, alerta de gasto OpenAI, RLS de `lead_notes` (advisory crítico pendiente).
5. Bug viejo del CRM: inbox no refresca con back nav (F5 manual).

## Cómo trabajar con Hans (reforzado hoy)

- Un fix → un test → siguiente. NO empujar múltiples cambios sin validar entre cada uno.
- Cuando algo funciona bien, ANALIZAR POR QUÉ y persistirlo (lo pidió explícitamente hoy).
- Sus specs valen: el Formateador hacía lo que SU spec decía (Criterio A+B) — explicarle la diferencia entre bug y spec antes de tocar, pero ejecutar su directriz sin pelear.
- Sigue siendo fase test: workflow activo OK, sin pánico.

## Última actualización

2026-06-10, cierre de sesión (sesión larguísima: MCP + demo agency + SET10-14 + edge function v1.2.0 + migración 0022 + análisis Mateo). Próximo update: tras testear los paths de objeciones/precio/handoff.
