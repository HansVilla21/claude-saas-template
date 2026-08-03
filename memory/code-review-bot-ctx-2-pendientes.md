# Code Review BOT-CTX-2 — Tracking de issues

**Fechas:**
- 1ra pasada code-review: 2026-06-05
- 2da pasada code-review: 2026-06-05 (post-fixes)

**Resultado final:** **APROBADO** (todos los críticos + 5 medios fixeados antes de QA del founder).

---

## ✅ Issues fixeados

### CRIT-1 — `sender_kind: "human"` no es valor válido del enum
- **Detectado:** 1ra pasada
- **Fix aplicado:** cambio a `sender_kind: "agent"` en `ycloud-webhook/index.ts:869`
- **Verificado:** 2da pasada PASS
- **Impacto si no se hubiera fixeado:** 100% de mensajes coexistencia perdidos en silencio (INSERT fallaba con enum violation, 200 OK al webhook, error solo en log)

### CRIT-2 — Workflow v2 con id duplicado del v1
- **Detectado:** 1ra pasada
- **Fix aplicado:** build script borra `wf.id`, `wf.versionId`, `wf.meta`, `wf.triggerCount`. Webhook path sufijado con `-v2`. Smoke tests 9-11 verifican
- **Verificado:** 2da pasada PASS
- **Impacto si no se hubiera fixeado:** riesgo humano de sobreescribir workflow LIVE con `n8n-push.mjs Jsh4krhC9HRUh7Ly v2.json`

### CRIT-3 — Paso "actualizar URL en YCloud" faltaba en doc operativo
- **Detectado:** 2da pasada
- **Fix aplicado:** doc operativo y `memory/cutover-bot-ctx-2.md` ahora incluyen el paso T4b explícito
- **Impacto si no se hubiera fixeado:** bot dormido en producción post-cutover

### MED-2 — Reconciliar wamid podía marcar `status='sent'` con `external_id=NULL`
- **Detectado:** 1ra pasada
- **Fix aplicado:** `AND $1 IS NOT NULL` agregado al WHERE
- **Verificado:** 2da pasada PASS

### MED-7 — Retry delay 300ms insuficiente bajo presión DB
- **Detectado:** 1ra pasada
- **Fix aplicado:** 300ms → 500ms en edge function
- **Verificado:** 2da pasada PASS

### MED-9 — Sticky note del workflow desincronizado tras CRIT-1
- **Detectado:** 2da pasada
- **Fix aplicado:** texto del sticky en build script actualizado a `sender_kind=agent`

### MED-10 — Spec, migration, doc operativo con valores legacy
- **Detectado:** 2da pasada
- **Fix aplicado:** `'human'` → `'agent'` y `300ms` → `500ms` en spec, migration, doc operativo

### MED-11 — Comentario en `index.ts:744` con valor legacy
- **Detectado:** 2da pasada
- **Fix aplicado:** comentario actualizado

---

## 🟡 Issues aceptados como deuda V2 (no bloqueantes)

### MED-1 — Sin guardrail para orden de deploy migration vs edge function
- **Razón aceptado:** el plan operativo `cutover-bot-ctx-2.md` documenta explícitamente que migration va antes de edge function. Con un solo founder operando es manejable. V2 podríamos agregar un check programático
- **Re-evaluar cuando:** entren más operadores al equipo o el deploy se automatice

### MED-3 — Pre-registro con `onError: continueRegularOutput` sin observabilidad
- **Razón aceptado:** D7 del spec lo documenta explícitamente como trade-off. Mejor mensaje mal-clasificado que lead sin respuesta
- **Re-evaluar cuando:** veamos en producción >5% de mensajes del bot caer al backfill (síntoma de pre-registro fallando silente)

### MED-4 — Falta assert defensivo `lead_id IS NOT NULL` en INSERT pre-registro
- **Razón aceptado:** el flujo upstream nunca llega al Pre-registro sin `lead_id` válido (pasa por `Lead Encontrado?` rama true). Defensa redundante
- **Re-evaluar cuando:** se modifique upstream el `Lead Encontrado?` o se agreguen rutas alternas al Loop

### MED-5 — Pre-registro hardcodea `kind = image | text`, no cubre audio/video/document
- **Razón aceptado:** el bot HOY solo emite texto + imagen. Cuando llegue Bloque 6A (multimedia), revisar el `Pre-registro Message` para extender el `kind`
- **Re-evaluar cuando:** se implemente Bloque 6A multimedia (especialmente audios del bot futuros)

### MED-6 — Webhook path -v2 puede convivir con v1 si por error ambos están activos
- **Razón aceptado:** ya fixeado parcialmente con el sufijo `-v2`. La defensa adicional sería desactivar v1 antes de cambiar URL, pero eso introduce ventana de bot dormido (peor trade-off)
- **Re-evaluar cuando:** se agregue otro workflow N8N que también escuche el path `-v2`

### MED-8 — Pre-registro setea `created_at = NOW()` aunque la columna tiene default
- **Razón aceptado:** ruido, no bug. Setearlo explícito mata el default pero el valor es idéntico
- **Re-evaluar:** nunca, salvo si el schema cambia el default

---

## 💭 Sugerencias (SUG-1 a SUG-6)

Todas marcadas como nice-to-have. Resumen:

- **SUG-1** (rollback procedure con comandos curl exactos): incluido en `memory/cutover-bot-ctx-2.md`
- **SUG-2** (smoke test del path del webhook): incluido como smoke test 10 del build script
- **SUG-3** (renombrar "doble SELECT" a "SELECT con 1 retry"): aplicado en comentarios y docs
- **SUG-4** (trailing newline al output JSON): ya estaba en el build script original
- **SUG-5** (logs adicionales en path del backfill): pendiente — bajo prioridad, podemos agregar cuando veamos métricas reales en producción
- **SUG-6** (acortar nombre del workflow v2): aplicado (`(BOT-CTX-2)` en lugar de `(BOT-CTX-2 pre-register)`)

---

## Métrica de calidad de este review

- **Tiempo total:** ~45 min de verificación post-build (builder ~12 min + code-review 1ra ~8 min + fixes ~10 min + code-review 2da ~5 min + fixes documentación ~10 min)
- **Bugs críticos detectados:** 3 (CRIT-1, CRIT-2, CRIT-3)
- **Bugs críticos que llegaron a producción:** 0
- **Validación post-deploy:** pendiente (founder ejecuta cutover)

**Lección operativa:** la directriz del founder de "cuidado profesional, gastar más tokens en verificación" se validó completamente en este caso. Sin las 2 pasadas de code-review independiente, CRIT-1 hubiera llegado a producción y silenciosamente perdido el 100% de los mensajes coexistencia. Reforzar la práctica para todos los builds futuros que toquen infra crítica.
