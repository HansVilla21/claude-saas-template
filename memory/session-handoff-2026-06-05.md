# Session Handoff — 2026-06-05 (tarde) — BOT-CTX-2 intentado + rollback + directriz cuidado profesional persistida

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-06-05-noche.md`**
> Este archivo describe el estado del proyecto al cierre de la **tarde** del 2026-06-05. Para estado actual leer el handoff de la **noche** primero. Highlights del 2026-06-05 noche: refactor profundo del bot Momentum + kit de prompting Momentum AI instalado + arquitectura Mateo v1.1 + 5 prompts listos para deploy + 5 patrones nuevos en `principios-desarrollo.md` (sobreingenierización, no verificar modelo LLM, bot_config vs workflow, framing de venta, atajo seguro no existe).

**Propósito:** Snapshot completo del estado de **Momentum AI CRM** al 2026-06-05 (tarde). Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-04.md` queda como histórico).

Cargar también al arrancar:

- `memory/rituales.md` ⭐ — backup semanal (último 2026-06-04, no toca todavía hasta 2026-06-11)
- `memory/principios-desarrollo.md` ⭐ — directriz "cuidado profesional" + 6 patrones de detección temprana (los 2 últimos agregados esta sesión)
- `memory/decisions.md` (entrada 2026-06-05 tarde — BOT-CTX-2 + rollback + lecciones)
- `memory/ideas-futuras/portal-cliente.md` + `memory/ideas-futuras/roi-tracking.md` (capturadas esta sesión)
- `memory/spec-bloque-6a-multimedia-composer.md` + `6b` + `6c` (specs entregadas, listas para implementar)
- `memory/spec-bot-ctx-1-mirror-history.md` (próximo módulo a construir)
- `memory/spec-bot-ctx-2-coexistence-sync.md` (referencia histórica del intento que falló)
- `memory/cutover-bot-ctx-2.md` (plan operativo del intento de cutover — bugs reales descubiertos quedan documentados)
- `memory/code-review-bot-ctx-2-pendientes.md` (tracking de los issues medios aceptados como deuda V2)

---

## Resumen de la sesión 2026-06-05

Sesión doble fase:

**Fase 1 — Planificación + ideas (mañana):**
- 2 ideas capturadas en `memory/ideas-futuras/`: portal del cliente (gestión interna de clientes Momentum) + ROI tracking del bot (cuantificar $ generado y tiempo ahorrado)
- Plan Bloque 6 acordado: 6A multimedia composer (imágenes + videos + audios) → 6B templates → 6C notas timeline + fix RLS
- Spec BOT-CTX-1 + BOT-CTX-2 entregadas por arquitecto en paralelo a las del Bloque 6
- Founder confirma plan A: hacer todo, sin tráfico real Pérez Luna no está bloqueando

**Fase 2 — Intento de BOT-CTX-2 (tarde) — el evento importante de la sesión:**
- Pipeline completo: spec arquitecto → backend-builder → 2 pasadas de code-review independiente → 5 fixes aplicados → commit + PR #24 → cutover atómico
- Durante el cutover en producción se descubrió bug arquitectónico que NINGÚN code-review había detectado: el response del nodo `Send Chunk via YCloud` no contiene el `wamid` de Meta, solo el `body.id` interno de YCloud
- El `Reconciliar wamid` extraía null, los pre-registros quedaban huérfanos, cada respuesta del bot generaba 2 rows en `messages` (1 huérfano + 1 backfill)
- Rollback completo ejecutado en ~10 min: v1 reactivado, v2 eliminado, edge function rolled back a v1.1.1, DB limpia, URL YCloud restaurada
- BOT-CTX-2 pospuesto indefinidamente — el bug original que pretendía resolver es cosmético (mensajes desde app coexistencia aparecen como `bot` en CRM), cero impacto operativo

### Cambios persistentes (NO rolleados back)

- **Migration 0022** sigue aplicada en prod (`messages.sent_via` columna nullable + CHECK constraint). Aditiva, backward compatible, sin impacto
- **`SUPABASE_ACCESS_TOKEN` agregado a `.env.local`** — Claude ahora puede deployar edge functions vía Supabase Management API sin acción founder. Capability nueva permanente del proyecto
- **`memory/principios-desarrollo.md`** — directriz founder "cuidado profesional, gastar tokens en verificación" persistida + 2 patrones nuevos:
  - "Asumir formato de API externo sin verificar empíricamente" (lección del rollback BOT-CTX-2)
  - "API de N8N no genera webhookId al activar vía API" (lección operativa cross-project)
- **`memory/decisions.md`** entrada gigante 2026-06-05 tarde con episodio completo
- **Snapshot del v1 LIVE** + tag git `bot-c-v1-pre-bot-ctx-2-2026-06-05` (referencia futura)
- **Branch `feat/bot-ctx-2-coexistence-sync`** queda en GitHub con todo el código del intento + commit WIP final como referencia histórica
- **PR #24** cerrado con explicación detallada (NO mergeado)

---

## Estado del founder hoy

Sesión técnicamente densa y emocionalmente exigente. El founder pasó por:

1. **Inicio: alta energía, queriendo cerrar todo.** "Démosle con todo." Confianza alta en el plan.
2. **Mid-cutover: frustración constructiva.** Cuando le pedía abrir N8N UI, hacer clicks específicos, etc., respondió firme: *"vos tenés todo el acceso, todo el conocimiento y sabés exactamente qué es lo que hay que hacer. Hacéte cargo de eso, hacéte responsable de esas cosas para agilizar el trabajo y quitarme estrés a mí, porque yo no sé, no tengo ni puta idea de lo que me estás pidiendo."* — directriz operativa clara, NO mecha emocional.
3. **Cuando detecté el bug arquitectónico: paciencia profesional.** *"tranquilo, esto nadie lo está usando, vamos paso a paso sin hacer cosas a la carrera ni a hacer un drama de volver rápido a la versión anterior sólo porque algo dió error cuando ahorita nadie está usando el sistema."* — me corrigió mi modo emergencia exagerado.
4. **Decisión final delegada a Claude:** *"aquí no sé por qué yo ya me presentó que vos es el experto del que está construido todo; entonces decidí qué es lo mejor."* — autoridad técnica delegada limpia.
5. **Cierre: tranquilidad y enfoque.** Pidió checkpoint para persistir las lecciones. Sin drama, sin culpa, sin "fracaso". Solo: documentamos, seguimos.

### Patrón importante observado y persistido

El founder NO quiere hacer trabajo operativo en interfaces técnicas (N8N UI, Supabase Dashboard, YCloud Dashboard) cuando Claude tiene acceso API. **Cada vez que se pueda automatizar vía API → hacerlo, no pedirle al founder.** Solo pedirle acción manual cuando NO hay otra alternativa (ej. cambiar URL en YCloud Dashboard, único caso donde Claude no tiene API access).

Esta es la razón por la que se agregó `SUPABASE_ACCESS_TOKEN` al `.env.local` y se persistió la nueva capability (Claude deploya edge functions sin intervención).

---

## Realidad financiera

Sin cambios desde el handoff anterior:

- 1 cliente pago activo: **Mueblería Pérez Luna** — $2,000 setup + $200/mes mantenimiento — en onboarding (sin tráfico real todavía)
- Momentum AI CRM = cliente cero
- Vercel Hobby (free) — Vercel Cron Jobs bloqueado, requiere Pro $20/mes para retomar OBS-2
- Supabase free (no Pro) — sin backup automático, ritual manual semanal con script `backup-db.mjs`
- Costo BOT-CTX-2 v1 (intento fallido hoy): ~50 min de operación + 0 días downtime + 0 pérdida de data + 0 impacto cliente externo

---

## Marco mental activo

**Pre-Meta-Ads (~2026-06-11):**

- Foco en estabilidad operativa + features visibles al cliente externo
- BOT-CTX-2 pospuesto: bug cosmético no justifica esfuerzo de re-implementación con investigación empírica
- Siguiente: BOT-CTX-1 (cierra el dolor real de ManyChat sin tocar workflow N8N estructuralmente)
- Después: Bloque 6 polish (multimedia + templates + notas timeline)
- Post-ads con data real: retomar BOT-CTX-2 v2 + OBS-2 + OBS-4

---

## Pipeline real al 2026-06-05

| Lead | Estado | Notas |
|---|---|---|
| **Mueblería Pérez Luna** | Onboarding (cerrado 2026-06-03) | $2K setup + $200/mes. Estructura en `clientes/muebleria-perez-luna/`. Pendiente que el founder reciba inputs del cliente (catálogos, accesos Meta/WhatsApp, etc.) |

Otros leads mencionados históricamente pero sin track formal: Dr. Carlos (SmartCheck), Varela (Condominio del Canal), Givy, Jimena.

---

## Entregables / clientes activos

| Cliente | Producto contratado | Status |
|---|---|---|
| **Mueblería Pérez Luna** | Chatbot + CRM + Sitio web | Onboarding, sin tráfico real |
| **Momentum AI CRM** | Self-hosted (cliente cero) | En desarrollo continuo. Bot v1 (`bot-c v1` id `Jsh4krhC9HRUh7Ly`) en producción |

---

## Productos / activos del founder

**En producción (operando):**

- Momentum AI CRM en `momentum-ai-crm.vercel.app` (Vercel auto-deploy desde main)
- Bot N8N `bot-c v1` (87 nodos, arquitectura C híbrida determinista con F5 observabilidad)
- Edge functions Supabase: `bot-actions` v0.6.0 (post-rollback hoy quedó intacta), `ycloud-webhook` v1.1.1 (rolled back hoy desde v1.2.0)
- 13 PRs mergeados a main al cierre del 2026-06-04 (#12-#23)
- Dashboard `/master/salud` (OBS-1) con healthchecks de N8N + edges + YCloud + counters 24h
- Rate limiting webhook YCloud (OBS-3): 30 msj/h por número, drop silencioso, fail-open
- Pg_cron daily cleanup 3 AM UTC (rate limit buckets, OBS-3)

**Pre-deploy en branches:**

- Branch `feat/bot-ctx-2-coexistence-sync` con código del intento fallido (PR #24 cerrado)

**Specs listas para implementar (no codeadas):**

- BOT-CTX-1 (mirror humanos al history del bot)
- Bloque 6A multimedia composer
- Bloque 6B templates de respuesta
- Bloque 6C notas timeline + fix RLS lead_notes
- OBS-2 alertas push (pendiente Vercel Pro)

---

## Pendientes operativos inmediatos

### Founder (esta semana)

1. **Mover el backup `crm-v2/backups/2026-06-05_04-51_momentum-full.dump` a Google Drive / Dropbox.** Pendiente desde el 2026-06-04 (`memory/rituales.md`)
2. Recibir inputs de Pérez Luna para arrancar la implementación del bot suyo
3. Lanzar Meta Ads (~2026-06-11) con el sistema actual estable

### Próxima sesión

**BOT-CTX-1** primero. Razones:

- Resuelve el dolor real de ManyChat (bot no pierde contexto cuando intervenís manual desde el CRM)
- NO toca workflow N8N estructuralmente — solo `sendMessageViaYCloud` (server action) + `ycloud-webhook` (edge function)
- Spec ya escrita, audit empírico ya hecho (session_id confirmado en producción)
- Blast radius mínimo
- 1 sesión esperada

**Después de BOT-CTX-1:** Bloque 6A multimedia composer (~2 sesiones), después 6B templates (~1 sesión), después 6C notas timeline (~1 sesión).

### Mes futuro

- Cuando upgradees Vercel Pro: retomar OBS-2 (alertas push via Cron, spec lista en `memory/spec-obs-2-alertas-push.md`)
- Post-Meta-Ads con data real: retomar BOT-CTX-2 v2 con investigación empírica del response YCloud Send (qué campos hay además de `body.id`)
- Post-ads (cuando entren usuarios externos): OBS-4 (2FA opcional)

---

## Sesiones paralelas activas

Una sola sesión activa (este chat). Founder no mencionó sesiones paralelas en otros proyectos durante la sesión.

---

## Cómo trabajar con Hans (recordatorios para próxima sesión)

Reglas operativas confirmadas o reforzadas hoy:

1. **Hablar en lenguaje plano.** Cuando el founder dice "no entiendo, hazme un resumen" → terminar con tablas/jergas, hablar como amigo a amigo
2. **Asumir trabajo operativo cuando hay acceso API.** No pedirle hacer clicks en interfaces si Claude puede hacerlo vía API. Si hace falta auth, pedir token UNA vez y persistirlo en `.env.local` (caso `SUPABASE_ACCESS_TOKEN` agregado hoy)
3. **Cuidado profesional con cambios a infra crítica.** 2 pasadas de code-review obligatorias antes de cualquier deploy. Verificar empíricamente el formato de APIs externas antes de aprobar (lección de BOT-CTX-2). Mejor gastar tokens que tener bugs en producción
4. **Partner crítico, no yes-man.** Decirle al founder cuando se equivoca con fundamento. Reconocer cuando él hace algo bien que Claude no sugirió. Reconocer errores propios sin victimizarse ni usar "fue mi error" como muletilla
5. **NO drama.** El founder maneja problemas técnicos con calma. Cuando algo falla, NO entrar en modo emergencia exagerado. Pensar, decidir bien, ejecutar con tiempo
6. **Decisión técnica delegada a Claude.** Cuando el founder dice "vos sos el experto, decidí" → asumir responsabilidad técnica completa. NO devolverle la decisión con menús
7. **Capturar lecciones inmediatamente.** Cada bug no-obvio → skill o entry en `principios-desarrollo.md` mientras está fresco. Si no, se pierde el aprendizaje y hay que re-debuggear meses después

---

## Última actualización

**2026-06-05 (tarde)** — BOT-CTX-2 intentado + rollback + lecciones persistidas + directriz cuidado profesional aplicada exitosamente en el primer caso real.

**Próximo update sugerido:** después de BOT-CTX-1 implementado en la próxima sesión, o cuando arranquen las Meta Ads (~2026-06-11).
