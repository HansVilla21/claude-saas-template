# Session Handoff — 2026-09-09 (madrugada)

**Propósito:** snapshot del estado al 2026-09-09 01:05 (CR). Lectura obligatoria al inicio de cualquier sesión que toque **el bot de Givi**, el **workflow `bot-c-v1`** o la configuración de horarios de un tenant.

**Reemplaza al handoff anterior** (`session-handoff-2026-08-11.md` queda como histórico).

Cargar también:
- `memory/decisions.md` (entrada 2026-09-09)
- `crm-v2/memory/backlog.md` — fuente de verdad operativa del CRM
- `.agent/skills/webhook-fanout-sin-reconciliacion/SKILL.md` (apéndice nuevo: la carrera)
- `.agent/skills/config-que-deja-el-sistema-mudo/SKILL.md`

---

## Qué pasó en esta sesión

El founder reportó que el bot de Givi estaba encendido y no atendía. Se destaparon **dos causas independientes**, se arregló una en producción y la otra resultó ser diseño intencional.

## Estado de Givi al cierre

| Pieza | Estado |
|---|---|
| `bot_enabled` | ❌ **false** — apagado a pedido del founder al terminar las pruebas |
| Ventana | ✅ **18:00 → 05:00**, todos los días, `America/Costa_Rica` |
| Modo | ✅ `office_hours_silencioso` (fuera de ventana NO manda nada) |
| Prompts | ✅ v3 en `bot_config.agent_prompts` (principal, objeciones, router) |
| Número | ✅ vivo en `agency_channels` |
| Conversación de prueba del founder | `handler = bot`, sin pausa (termina en `bbb4b3`) |

## Los dos defectos

### 1. La carrera del lead — ARREGLADO en producción

El bot llegaba a `Buscar Lead (Supabase)` antes de que la Edge Function hubiera creado el lead. Query vacía → `Abort - Lead No Encontrado` → el lead no recibía **nada**, ni el aviso de fuera de horario. Sin error en ningún log.

**Medido:** perdió por **29 ms** en una ejecución, ganó por 46 ms en otra. El lead aparece **~3,7 s** después del webhook, muy consistente.

**Fix aplicado:** nodo `Esperar a que exista el Lead` (Wait 6 s) entre `Resolve Agency` y `Buscar Lead (Supabase)` en `bot-c-v1` (`Jsh4krhC9HRUh7Ly`).
Script: `crm-v2/scripts/build-esperar-lead-carrera.js` (idempotente, con snapshot y verificación releyendo del n8n).
Snapshot: `crm-v2/n8n/workflows/snapshots/Jsh4krhC9HRUh7Ly-PRE-ESPERA-LEAD-2026-09-09.json`

**Por qué NO se hizo con un nodo de reintento:** 26 nodos aguas abajo leen `$('Buscar Lead (Supabase)')` por nombre; un reintento aparte los haría leer la búsqueda vacía.

**Impacto medido antes del fix (leads nuevos sin ninguna respuesta):**

| Día | Leads nuevos | Sin respuesta |
|---|---|---|
| 01–04 sep | 59 | 0 |
| 05 sep | 13 | 1 (8 %) |
| 06 sep | 17 | 2 (12 %) |
| 07 sep | 17 | 0 |
| 08 sep | 13 | **4 (31 %)** |

### 2. `handler` es terminal — NO se toca (decisión del founder)

En 10 días, dentro de la ventana: **282 mensajes** en conversaciones `handler = human` (el bot no las toca por diseño; 146 sin respuesta, de personas) contra **47** en `handler = bot`.

**El bot ve el 14 % del tráfico.** Cuando una persona contesta desde el inbox, la conversación pasa a `human` y el bot no vuelve nunca.

El founder lo rechazó explícitamente: *"eso de hecho es una funcionalidad que ni siquiera hemos implementado"*. **No construir retoma automática.**

## Verificado end-to-end esta sesión

- **Horario:** el código real del nodo `Calcular Estado de Horario`, con el reloj inyectado, en 11 casos con bordes — contesta 18:00 en punto, 23:30, 01:30 y 04:59; se calla 17:59, 05:00 en punto, 10:00 y fines de semana de día.
- **Conversación por el playground** (funciona con `bot_enabled = false`): 5 turnos, abre con la fórmula del equipo, califica, manda el link y maneja la objeción de precio.
- **Un mensaje real por WhatsApp con el bot encendido:** ejecución completa de 66 nodos hasta `Send Chunk via YCloud`, respondió *"Hola, que bueno que te intereso Givi / antes de todo cuentame, que tipo de negocio tienes?"*. Después se volvió a apagar.

## Trampa que se repitió dos veces (2026-08-27 y 2026-09-09)

La conversación de prueba del founder quedó en `handler = unassigned` y el portón la bloqueó en silencio. **Antes de que el founder pruebe con su propio número, verificar `handler = 'bot'` y `bot_paused_until IS NULL`.** Un lead nuevo no tiene este problema; solo las conversaciones que ya tocó una persona.

## Pendientes

1. **Al prender Givi en producción**, mirar las primeras conversaciones reales y confirmar que ya no hay abortos por lead no encontrado.
2. **Video para la objeción "mandame info"** — sigue sin URL; el prompt no lo promete a propósito.
3. **Decisión abierta del estudio de 64 conversaciones:** el equipo nunca manda link (0 de 64) ni da precio en números (0 de 64); el bot hace las dos por pedido del cliente.
4. **El formateador no es determinista** con la puntuación: mejoró tras el fix de comas del 2026-08-27, pero en una de tres corridas el mismo saludo salió sin comas. El arreglo de fondo es hacerlo con código en vez de un LLM.
5. **Snapshots de workflow con secreto:** `n8n/workflows/snapshots/` NO está en `.gitignore` y los snapshots contienen el `BOT_TEST_SECRET` hardcodeado del nodo `Auth Guard`. Sin commitear.

## Cómo trabajar con Hans

- **Respuestas cortas.** Lo pidió el 2026-09-07 y se volvió a violar el 2026-09-09 con un diagnóstico de seis secciones. Límite operativo en `feedback_respuestas_cortas.md`: ~6 líneas, cero `##`, máximo una tabla.
- **No concluir en la primera lectura de una herramienta** — ver `feedback_no_concluir_en_la_primera_lectura.md`. Esta sesión produjo 4 afirmaciones falsas por eso.
- Si él dice que algo pasa y los datos dicen que no, **la medición está mal hasta demostrar lo contrario**. Pasó literal esta sesión.
- Habla en lenguaje natural, no usa slash commands.

## Última actualización

2026-09-09 01:05 (CR) — sesión del bot de Givi. Próximo update sugerido: cuando se prenda en producción.
