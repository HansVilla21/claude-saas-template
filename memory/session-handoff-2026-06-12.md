# Session Handoff — 2026-06-12 — Bot Momentum pulido (prompts v4.2, gpt-4.1 full, 3 bugs de flujo resueltos)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-08-11.md`**
> Se conserva como registro del estado al 2026-06-12. Para el estado actual, leer el handoff nuevo primero.

**Propósito:** Snapshot del estado al cierre del 2026-06-12. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-10.md` queda como histórico).

Cargar también:

- `memory/leccion-2026-06-12-pipeline-completo-bot-momentum.md` ⭐⭐ — **EL documento de esta etapa.** Playbook completo del flujo del bot (prompts, formateador, router, flujo de salida, parser, modelos) + los 3 bugs de raíz + el camino a la replicabilidad modular. Léelo antes de tocar cualquier cosa del bot.
- `memory/decisions.md` (entrada 2026-06-12)
- `memory/leccion-2026-06-10-por-que-mateo-funciona.md` — por qué Mateo funciona (sigue vigente)
- `memory/feedback-prompting.md` — canon de prompting
- `clients/momentum-ai-crm/test-prompts/` ⭐ — **CANON de los prompts** (el founder los maneja; yo no los edito). Carpetas `v{N}` por iteración; `v4/v4.2/formateador.md` es la última del formateador.

---

## Estado del bot Momentum (lo más importante)

**Responde bastante bien.** Tras la sesión: prompts v4.x aplicados, modelos en gpt-4.1 full, los 3 bugs de flujo resueltos, lista numerada llegando bien al lead con sus saltos de línea.

| Ítem | Valor |
|---|---|
| Workflow N8N | `Chatbot Momentum - bot-c v1` (id `Jsh4krhC9HRUh7Ly`), 97 nodos, active |
| Host N8N | `n8n-n8n.v5qn6d.easypanel.host` (API key en `.env` raíz) |
| Bot | Mateo — setter humano puro, NUNCA revela ser bot |
| Agente Principal | prompt v4.1 (escenarios de calificación, cierre solo consigue el "sí") |
| Formateador | prompt v4.2 ("bobo": mapea bloques + limpia puntuación; lista numerada en 1 mensaje con `\n`) |
| Router | prompt v4 (interpreta respuestas cortas según último mensaje del bot; aceptar llamada = HANDOFF) |
| Objeciones | prompt v4 |
| Modelos | los 6 nodos LLM en `gpt-4.1` FULL |
| Memoria | Postgres Chat Memory 30 msgs (Principal + Objeciones) |
| Parser | "Generate From JSON Example" con `{output:{MENSAJE 1..4}}` (editado por el founder) |

---

## Lo que se arregló esta sesión (3 bugs de raíz, ninguno del prompt)

1. **`Expand Property Images` aplastaba los `\n`** (`/\s+/g`). Fix SET24: preserva saltos con `[^\S\n]`. La lista numerada ahora llega con cada item en su línea.
2. **Parser cortaba a 3 mensajes.** Founder lo pasó a fromJson con 4. (Vigilar: con fromJson todos los campos quedan required → posible relleno en turnos cortos.)
3. **`bot_paused_until` dejaba el bot mudo tras handoff.** El botón "Devolver al bot" del inbox no limpiaba la pausa de 24h. **PR #25** (`momentum-ai-crm`) lo arregla. Conversación de Hans ya reactivada manualmente.

---

## Estado de git (IMPORTANTE — hay trabajo sin commitear)

- **crm-v2** (repo `momentum-ai-crm`): el workflow JSON + scripts SET15→25 + snapshots **están SIN commitear** en la rama `fix/bot-c-handoff-leak` (working tree). El backup del JSON vivo está en `~/bot-c-v1-wip-backup-d437fec.json`.
- **PR #25** abierto: `fix/devolver-al-bot-limpia-pausa` → `main` (1 archivo, limpio). Pendiente: probar el preview de Vercel y mergear.
- `main` de momentum-ai-crm está varios commits atrás (trabajo de N8N de días previos sin mergear). **Conviene ordenar esto** (commitear SET15-25, decidir merge a main).

---

## Pipeline de trabajo (cómo se aplica un cambio de prompt)

1. Founder agrega carpeta `test-prompts/v{N}/` con los prompts que cambian.
2. Build script idempotente `crm-v2/scripts/build-bot-c-v1-set{N}-*.js`: lee el `.md` → extrae el bloque del prompt → rename `listo_para_llamada`→`lead_listo_para_agendar` → snapshot PRE-SET{N} → smoke tests → escribe JSON + compilados → `PUT /api/v1/workflows/{id}` (solo `name,nodes,connections,settings`).
3. **Verificar contra N8N vivo:** hash SHA-256 de cada prompt vs el `.md` + listar modelos/memoria. Demostrar, no afirmar.
4. Gotcha: el editor de N8N cachea — cerrar y reabrir la pestaña para ver los cambios.

---

## Objetivo del founder (a futuro)

**Replicar la calidad de prompts a otros clientes de forma modular, personalizable y rápida.** El camino identificado: hoy el Agente Principal usa un systemMessage hardcodeado, pero la agencia ya tiene un `bot_config` modular en Supabase (`core_template`, `system_rules_template`, `custom_instructions`, `business_info`, `conversation_flow`). Cablear el agente a `bot_config` haría que dar de alta un cliente = llenar una fila, no editar el workflow. (Detalle en la lección §6.)

---

## Pendientes operativos inmediatos

1. **Commitear** el trabajo de N8N sin commitear (SET15-25 + JSON + snapshots).
2. **Probar PR #25** en el preview de Vercel y mergear.
3. **Vigilar** relleno del parser en turnos cortos (1-2 mensajes).
4. **Testear** paths no ejercitados: objeción de precio, "lo pienso", pedir humano, descalificación.
5. **Evaluar** cablear el Agente Principal a `bot_config` (paso hacia modularización).
6. Meta Ads (blocker previo: Calendly de Hans/Pietro, alerta de gasto OpenAI).

---

## Cómo trabajar con Hans (recordatorio)

Partner crítico, no yes-man. Verificar antes de afirmar (sobre todo "X no existe" — buscar el texto literal en español). Cambios simples = entrega directa, sin gimnasia de proceso. No redactar prompts (los maneja él). Demostrar el estado con datos del N8N vivo, no con mi palabra.

## Última actualización

2026-06-12 — sesión de pulido del bot + checkpoint grande. Próximo update sugerido: tras mergear PR #25 y commitear el trabajo de N8N.
