# Session Handoff — 2026-08-11 (tarde)

**Propósito:** snapshot del estado al 2026-08-11 13:20 (CR). Lectura al inicio de cualquier sesión que toque **Jacó Dream Rentals**, el **bot de producción** o **`catalog-search`**.

**Reemplaza al handoff anterior** (`session-handoff-2026-06-12.md` queda como histórico).

Cargar también:
- `crm-v2/memory/backlog.md` ← **la fuente de verdad operativa del CRM** (actualizado en esta sesión)
- `memory/decisions.md` (entrada 2026-08-11)
- `.agent/skills/onboarding-cliente-crm/SKILL.md` (gotcha **#-1** nuevo)

---

## Qué pasó en esta sesión

Se puso **Jacó Dream Rentals en producción** con su número de WhatsApp, y se destaparon 5 defectos encadenados que impedían que el bot usara el catálogo real. Todo verificado contra la base y las ejecuciones de n8n — nada dado por supuesto.

## Estado de Jacó (verificado end-to-end)

| Pieza | Estado |
|---|---|
| Número `+50671328394` | ✅ conectado (`agency_channels`, dígitos sin `+`, WABA `1037141215851911`) |
| Ingesta al CRM | ✅ lead + conversación (`handler:bot`) + mensajes, con status `delivered` |
| Bot | ✅ responde con prompt v10, multi-burbuja, ~69s (debounce 45s) |
| Catálogo | ✅ 7 villas exactas (se despublicaron 2 fantasma) |
| Búsqueda por capacidad | ✅ "8 personas" → **solo Zen Villa 1** (antes: 6 villas, ninguna correcta) |
| Foto | ✅ llega como imagen real (`kind:image` + `media_url`) |

Prueba real (19:02–19:04 UTC): *"somos 8 personas"* → Zen Villa 1, 7-10 personas, 4 hab, 2,5 baños, 180 m2, **con foto**, + mención del 8% de descuento. Sin marcador `[IMG:` crudo, sin amenidades de otras villas.

## Arquitectura confirmada (cablear esto mal es el error #1)

```
YCloud (2 endpoints activos, fan-out del MISMO evento)
  ├─→ Edge Function ycloud-webhook  → persistencia: lead/conversación/mensajes
  └─→ n8n bot-c-v1 (webhook ycloud-inmobiliaria-demo) → el BOT
```

- Los dos resuelven el tenant **por número** (`agency_channels`), normalizando a dígitos.
- Los 2 workflows viejos de Jacó (`Chatbot Jaco - Multi-canal`, `Chatbot WA - Jacó v2`) están ACTIVE en n8n pero **YCloud no les manda nada** — huérfanos, sin riesgo de doble respuesta.
- **El playground (`bot-test-playground`) y producción (`bot-c-v1`) son workflows DISTINTOS.** Los prompts viajan solos (mismo `bot_config`); **las tools NO**. Probar en "Probar bot" no prueba producción.

## Los 5 defectos que se cerraron

1. `bot-c-v1` no tenía la `Catalog Search Tool` que su prompt exigía.
2. `byCap` leía `capacidad_min`/`capacidad_max` — campos inexistentes (el catálogo guarda `capacidad` como TEXTO: `"7-10 personas"`).
3. `diversify` ordenaba con `Number("x") = NaN` → comparador inconsistente.
4. La tool no exponía sus parámetros al LLM (`query:{}`) → el bot recibía 6 villas y mezclaba amenidades ("villa Frankenstein").
5. `Expand Property Images` esperaba un código (`[IMG:CR-2031]`), no una URL → el marcador llegaba crudo al lead.

## Reglas que quedaron establecidas

- **Lo que el flow puede saber, lo pone el flow — nunca el LLM** (`agency_id`, y ahora `capacidad`).
- **Portar nodos copiándolos**, con script idempotente + snapshot + verificación por hash contra el n8n vivo.
- **Merge quirúrgico en `bot_config`** — nunca reescribir el objeto entero (borra `routes` del tenant).
- **Antes de tocar `catalog-search`**, chequear qué otros tenants la consumen y si tienen el atributo cargado.

## Git — todo mergeado

| PR | Qué |
|---|---|
| momentum-ai-crm #95 | recorte de persona del asistente (9k→24k + head/tail) |
| momentum-ai-crm #96 | canal + port de la Catalog Search Tool |
| momentum-ai-crm #102 | guarda multi-tenant + capacidad desde el flow + `[IMG:url]` |
| momentum-ai-crm #104 | eslint: slug derivado en el render |
| claude-saas-template #5 | prompt v10 + snapshot v9 + gotcha #-1 |

`main` ya **no tiene drift** con producción. Lint del repo: 0 errores.

## Pendientes

1. 🔴 **Rotar el token de Apify** hardcodeado en el nodo `Apify - Scrape Link` de `bot-c-v1`. **Ya está en el historial de git** (5+ workflows trackeados, 5+ commits). Moverlo a `$env` y barrer los demás workflows. Mismo problema con `BOT_TEST_SECRET` en el `Auth Guard` del playground.
2. **4 snapshots de workflow fuera de git** (rollback local en `crm-v2/n8n/workflows/snapshots/`), sin commitear justamente por ese token.
3. **2 warnings de lint** preexistentes: `master-shell.tsx` (unused var), `provenance.ts` (unused eslint-disable).
4. ~~**Drift editorial en el prompt de Jacó**~~ → ✅ **CERRADO el mismo día.** El `.md` pasó a **v11**, *regenerado desde `_compiled/`* (que está verificado char a char contra `bot_config` en la base: 14.971 = 14.971). Se regenera en vez de editarse a mano justamente para que el drift no vuelva. Incluye el bloque `## CATÁLOGO DE PROPIEDADES`, que es el `prompt_fragment` del preset `catalog-inmobiliaria` — **no es del cliente**, y si el preset cambia hay que re-sincronizar el `.md` (anotado en su metadata). Snapshot del anterior en `versions/agente-principal-v10-rag-jaco.md`.
5. **Roberto tiene número en YCloud** (`+50672053814`) pero **no está en `agency_channels`** — su bot de producción no dispara. Revisar si es intencional.

## Cómo trabajar con Hans

- Habla en lenguaje natural, **no usa slash commands**. Detectar intención y ejecutar.
- **Verificar contra la fuente de verdad de cada capa** antes de decir "hecho". "Compila" / "respondió 200" / "se ve bien" no cuentan.
- **Partner crítico, no yes-man.** Decirle cuando algo está mal, con fundamento. Corregirse cuando corresponde, sin ceremonia.
- **Nunca commits a `main`.** Feature branch → PR → preview → merge. En `crm-v2` hay hook (`core.hooksPath=.githooks`); **el repo madre NO lo tiene configurado**.
- Trabaja **en paralelo en otras sesiones**: verificar el estado real de ramas y archivos antes de asumir (esta sesión encontró el prompt, el backlog y la rama de crm-v2 cambiados por fuera).

## Última actualización

2026-08-11 13:20 CR — sesión "Jacó a producción". Próximo update: al cerrar el pendiente del token de Apify o al conectar el próximo cliente.
