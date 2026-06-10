# Session Handoff — 2026-06-06 — Deploy del Agente Principal + kit N8N mergeado

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-10.md`**
> Este archivo se conserva como registro del estado al 2026-06-06. Para estado actual
> (prompts Mateo deployados, bug de leads duplicados fixeado), leer el handoff nuevo primero.

**Propósito:** Snapshot del estado del proyecto al cierre del 2026-06-06. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-05-noche.md` queda como histórico — describe el estado al cierre del 2026-06-05 noche, antes del deploy del Agente Principal).

Cargar también:

- `memory/principios-desarrollo.md` ⭐ — **3 patrones nuevos críticos agregados esta sesión** (clonar template N8N en vez de improvisar nodos; renombrar nodo = reemplazar TODAS las refs; post-procesar después del LLM regenerador)
- `memory/decisions.md` (entrada 2026-06-06 — deploy + merge kit N8N)
- `memory/leccion-sesion-2026-06-06-deploy-router-limpiar-puntuacion.md` ⭐ — **documento reflexivo** con 6 cagadas específicas + 6 patterns de recuperación + decisiones críticas + humor del founder
- `memory/feedback-n8n-build.md` ⭐ NUEVO — 14 errores reales de construcción N8N + fix (checklist anti-estupideces obligatorio antes de declarar un workflow terminado)
- `memory/metodologia-core.md` — reglas no-negociables del kit
- `knowledge/00_CURRICULUM_CONSTRUCCION_N8N.md` ⭐ NUEVO — currículum de construcción N8N en 11 módulos
- `knowledge/workflows-reference/dr-carlos/workflow.json` ⭐ — **template a clonar para cualquier cambio al bot Momentum** (arquitectura más cercana: 2 agentes + objeciones + router)
- `clients/momentum-ai-crm/architecture.md` v1.1 — arquitectura del bot Momentum
- `clients/momentum-ai-crm/prompts/_compiled/*.txt` — prompts compilados listos para inyectar

---

## Resumen ejecutivo de la sesión

Sesión densa de ~6 horas. **6 pushes al workflow N8N** (SET2-3-4-5-6) y **1 update del `bot_config`** de Momentum.

**Fase 1 (SET2):** intento de deploy improvisando nodos del Router/Switch sin consultar templates. Pantallazo del founder mostró el Router con icono `?` (tipo desconocido). Founder señaló: *"te estás inventando un nodo llamado 'router'"*.

**Fase 2 (kit N8N):** founder pasó `_transfer-n8n-build-kit/` (hermano del de prompting de ayer). Mergeé el kit completo: 5 skills nuevas (`momentum-n8n-builder` ⭐, `momentum-workflow-variants`, `n8n-postgres-prepared-statements`, `chatbot-manychat-supabase-multicanal`, `chatbot-db-schema-supabase` versión kit), 5 knowledge files (00 currículum + 03, 04, 07, 09), 4 templates JSON (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO), `feedback-n8n-build.md` (14 errores), snippet integrado a `CLAUDE.md`.

**Fase 3 (SET3 fix):** clóne dr-carlos literal para Router + Switch + OpenAI Chat Model. Encontré 6 cagadas técnicas mías: typeVersion 1.3 (no existe), Chat Model 1.2 sin responseFormat, Switch con mode (no debe), backup con fallbackOutput (no debe), faltaba operator `notExists` para backup. SET3 las arregló. 20/20 smoke tests.

**Fase 4 (SET4 fix):** después del rename Sofia C → Agente Principal, quedaron 3 referencias huérfanas a `$('Sofia C')` en `parameters` de `Capturar Contexto Para Extractor` + `Cerrar Trace de Turno`. Founder lo vio como error rojo en N8N. SET4 las arregló con scan recursivo.

**Fase 5 (SET5 → SET6):** agregué Code "Limpiar Puntuación" entre los agentes y el Formateador. NO funcionó porque el Formateador es un LLM (gpt-4o-mini) que regenera texto con `¿` y puntos finales aunque el input venga limpio. Moví el Code DESPUÉS del Formateador en SET6 y funcionó. Test e2e: *"Hola! Gracias por escribir a Momentum / Contame, que te llevo a escribirnos hoy?"* — sin `¿`, sin punto final, suena natural.

**Cierre:** commit + tag git `bot-c-v1-agente-principal-2026-06-06`. Documento reflexivo creado. Founder pidió checkpoint + prompt de continuación para migrar a sesión nueva por context bloat.

---

## Estado del proyecto al 2026-06-06 cierre

### Bot Momentum AI CRM

- **Workflow N8N en producción:** `Chatbot Momentum - bot-c v1` (id `Jsh4krhC9HRUh7Ly`) **funcionando, deployado, validado e2e**
- **versionId actual:** `7e45c6aa-505a-4cd7-8f57-0565b39f1a50` (SET6 push final)
- **Nodos:** 98 (87 originales + 9 SET2 + Structured Output Parser1 del founder + Limpiar Puntuacion del SET6)
- **`bot_config` Momentum:** actualizado con prompt SetterX (8,095 chars en `custom_instructions`)
- **Tag git de retorno:** `bot-c-v1-agente-principal-2026-06-06` (estado funcional clavado)
- **Backups:**
  - `crm-v2/n8n/workflows/snapshots/bot-c-v1-PRE-AGENTPRINCIPAL-2026-06-06.json` (pre-deploy)
  - `crm-v2/n8n/workflows/snapshots/bot-c-v1-LIVE-2026-06-06-post-founder-formatter-fix.json` (post-cambios manuales del founder, pre-SET6)
  - `memory/prompts-momentum/_backup-botconfig-pre-update-2026-06-06_set2.json` (bot_config previo)

### Arquitectura final del bot deployado

```
Webhook YCloud
  ↓ ... batching + memory ...
Componer System Prompt (lee bot_config dinámicamente)
  ↓
Capturar Prompt Hash
  ↓
ROUTER (Information Extractor gpt-4.1-mini, clasificador 3 destinos)
  ↓
SWITCH (4 outputs):
  ├─ 0: AGENTE_PRINCIPAL → Agente Principal (ex-Sofia C, gpt-4.1-mini, prompt SetterX)
  ├─ 1: AGENTE_OBJECIONES → Agente Objeciones (NUEVO, gpt-4.1-mini, 8 objeciones)
  ├─ 2: HANDOFF_HUMANO → Silent Handoff (Postgres UPDATE bot_apagado + HTTP notify equipo, sin mensaje al lead)
  └─ 3: BACKUP → Agente Principal (fallback seguro, notExists)
  ↓ (output del agente)
Formateador de Mensajes (Basic LLM Chain gpt-4o-mini, canónico + Structured Output Parser)
  ↓
LIMPIAR PUNTUACION (Code, post-procesamiento determinista)
  ↓
Split Out → ... → YCloud send
  
[En paralelo: el agente también dispara hacia "Cargar Tags Permitidos" → Information Extractor C →
 Switch1/2/3 → HTTPs (qualify/stage/tag/assign/note/handoff.escalate) — cascada determinista INTACTA]
```

### Lo que cambió del kit N8N (mergeado a este proyecto)

**Skills nuevas en `.claude/skills/`:**

- `momentum-n8n-builder` ⭐ — configurar workflow nodo por nodo sobre template duplicado
- `momentum-workflow-variants` — generar variantes TEST / Telegram / YCloud
- `n8n-postgres-prepared-statements` — queries Postgres robustas
- `chatbot-manychat-supabase-multicanal` — patrón multi-canal WA + IG
- `chatbot-db-schema-supabase` (versión kit en `.claude/skills/`, la del `.agent/skills/` queda preservada para uso interno de agentes)

**Knowledge nuevos en `knowledge/`:**

- `00_CURRICULUM_CONSTRUCCION_N8N.md` ⭐ — 11 módulos de construcción
- `03_TEMPLATES_Y_RECURSOS.md`
- `04_PATRONES_TECNICOS_N8N.md`
- `07_REPOSITORIOS_GITHUB_RECOMENDADOS.md`
- `09_INTEGRACION_YCLOUD.md`
- `workflow-variants-templates/` (4 JSON: TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO)

**Memory nuevo:**

- `feedback-n8n-build.md` ⭐ — 14 errores reales + fix (checklist obligatorio)

**CLAUDE.md actualizado:** sección nueva "Construcción de Workflows n8n (Momentum AI) — kit hermano del de prompts" con reglas, skills, herramientas externas recomendadas (n8n-mcp + skills globales de czlonkowski).

**Kit archivado:** `memory/_transfer-n8n-build-kit/` → `memory/_transfer-n8n-build-kit.merged/`

### Scripts nuevos en `crm-v2/scripts/`

- `build-bot-c-v1-set2-agentprincipal.js` — rename Sofia C + Router/Switch (con 6 cagadas técnicas iniciales — sirve como referencia de qué NO hacer)
- `build-bot-c-v1-set3-fix-router.js` — fix de las 6 cagadas clonando dr-carlos literal
- `build-bot-c-v1-set4-fix-orphan-refs.js` — scan recursivo de referencias huérfanas a Sofia C
- `build-bot-c-v1-set5-limpiar-puntuacion.js` — primer intento de limpieza PRE-Formateador (no funcionó, queda como referencia)
- `build-bot-c-v1-set6-limpiar-post-formateador.js` ⭐ — fix definitivo: limpieza POST-Formateador
- `update-momentum-bot-config.js` — PATCH del `bot_config` en Supabase con prompt del Agente Principal

---

## Realidad financiera (sin cambios)

- 1 cliente pago activo: **Mueblería Pérez Luna** — $2,000 setup + $200/mes — en onboarding sin tráfico real
- Momentum AI CRM = cliente cero (donde estamos validando)
- Pre-Meta-Ads (~2026-06-11): **5 días restantes**
- Vercel Hobby (free), Supabase free
- Costo de la sesión de hoy en LLMs: ~0 (todo conversacional + lectura/escritura de archivos)

---

## Marco mental activo

**Pre-Meta-Ads (~2026-06-11):**

- Foco en validar más casos del bot Mateo/Agente Principal (precio, objeción, handoff agendar)
- Después: configurar bot para Pérez Luna usando el mismo workflow N8N (cambiar `bot_config` per-agency)
- Lanzar Meta Ads cuando 2-3 casos de validación pasen

---

## Pipeline real al 2026-06-06 cierre

| Lead | Estado | Notas |
|---|---|---|
| **Mueblería Pérez Luna** | Onboarding (cerrado 2026-06-03) | $2K setup + $200/mes. Sin tráfico real todavía. |
| **Momentum AI CRM** | Cliente cero — bot deployado y validando | Test e2e PASS (saludo). Falta validar: precio, objeción, handoff agendar. |

---

## Pendientes operativos inmediatos

### Founder (esta semana)

1. **Lanzar Meta Ads ~2026-06-11** con bot Agente Principal validado
2. **Configurar Pérez Luna** después de Meta Ads
3. **Mover backup `crm-v2/backups/2026-06-05_04-51_momentum-full.dump`** a Google Drive (sigue pendiente desde 2026-06-04) — **YA MOVIDO 2026-06-06 mañana confirmado por founder**

### Próxima sesión (continúa el deploy del bot)

1. **Test e2e más casos del bot:**
   - Pregunta de precio sola: `"cuánto cuesta"` → no debe dar precio, debe rebotar a la llamada con Hans
   - Insistencia precio 2-3x: `"dame un rango"`, `"decime algo aproximado"` → recién ahí $500-$1000 setup + $150-$200 mensualidad
   - Objeción "es caro" → debe ir al Agente Objeciones (mensaje fluido + cierra invitando a llamada con Hans)
   - Aceptar agendar: `"dale mañana en la tarde"` → bot debe **dejar de responder** (silent handoff), verificar `bot_apagado = true` en `conversations`
2. Si pasa todos los casos: tag git `bot-c-v1-validado-2026-06-XX` + configurar Pérez Luna aparte
3. Si NO pasa: ajustar prompt del Agente Principal o reglas de Limpiar Puntuación
4. Después: BOT-CTX-1 (mirror humanos al history del bot), Bloque 6A multimedia, 6B templates, 6C notas timeline

### Mes futuro (post-Meta-Ads)

- OBS-2 alertas push (requiere Vercel Pro $20/mes)
- TODO CRM: campo `assistant_name` configurable en panel admin per-agency
- Backlog de §1.4 inbox: imágenes, videos, audios, templates

---

## Cómo trabajar con Hans (recordatorios reforzados HOY)

Reglas operativas confirmadas en sangre esta sesión:

1. **El template base se DUPLICA, NUNCA se construye de cero.** Aplica a workflows N8N tanto como a prompts. Si hay un `dr-carlos/workflow.json` validado en producción, abrirlo antes de armar un nodo nuevo. Las 6 cagadas del SET2 fueron todas por improvisar desde memoria.
2. **Renombrar nodo N8N requiere recorrido recursivo de TODAS las referencias `$('NombreViejo')` en `parameters` de OTROS nodos.** No solo `node.name` + `connections`. Smoke test post-rename: 0 referencias al nombre viejo.
3. **Post-procesar determinísticamente después de TODOS los LLMs.** Si hay Formateador LLM downstream del agente, el Code de limpieza va entre Formateador y Split Out, NO entre agente y Formateador. El LLM regenera y reintroduce los signos.
4. **`MEMORY.md` tiene reglas operativas — releerlas antes de proponer pánico.** Ej: *"Fase de test: workflow n8n activo es OK"*. Si no lo consultás, vas a ignorar tu propia memoria.
5. **NO menús de opciones cuando se sabe la respuesta correcta.** Ejecutar con criterio explícito.
6. **Sesiones largas degradan calidad por context bloat.** Cortar y migrar a sesión nueva con prompt de continuación cuando se detecta repetición de patrones ya documentados.
7. **El founder valora cierre profesional, no defensivo.** Reconocer cagadas específicas con cita textual. No genéricos como "perdón voy a hacerlo mejor".
8. **El founder NO tiene paciencia para repetir patrones que YA explicó al inicio del día.** Si lo señaló como básico, era básico.

---

## Última actualización

**2026-06-06 (cierre, ~15:30 CR)** — Sesión cerrada con bot deployado funcionando + tag git + checkpoint completo. Founder pidió migrar a sesión nueva por context bloat.

**Próximo update sugerido:** después del test e2e completo del bot en la próxima sesión.
