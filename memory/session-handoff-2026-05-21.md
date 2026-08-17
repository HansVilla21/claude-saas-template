# Session Handoff — 2026-05-21 (día completo, sesión muy larga)

> ⚠️ **HANDOFF HISTÓRICO — superado por `session-handoff-2026-05-27.md`**
> Este archivo se conserva como registro del estado al 2026-05-21. Para estado actual, leer el handoff nuevo primero.


**Propósito:** Snapshot del estado de Casa CRM al cierre de la sesión del 21 de mayo 2026. Sesión histórica: dejó funcionando el envío de imágenes vía WhatsApp end-to-end (Sofia → YCloud → WhatsApp → CRM inbox) y simplificó el pipeline de cambios N8N. Lectura obligatoria al inicio de cualquier sesión nueva.

**Reemplaza al handoff anterior** (`session-handoff-2026-05-20.md` queda como histórico).

Cargar también:
- `memory/decisions.md` (entradas 2026-05-21, las más recientes — la última cubre el pipeline simplificado y el bug del URL constructor)
- `memory/proyecto.md`
- `memory/stack.md`
- `memory/n8n-pipeline.md`

---

## Estado del founder al cierre

Hans logró cerrar el día con un win MUY grande: el bot Sofia ahora **manda fotos reales a WhatsApp** y el CRM las renderiza en el inbox. Era un fuego que venía arrastrando desde hace 2 sesiones (5.0, 5.1) con bugs en cascada.

Cerró la jornada satisfecho y agradecido. Tono muy positivo al final ("bieeeeen", "muy buen trabajo, te felicito").

Hubo frustración significativa en el medio porque cada iteración del pipeline architect→builder→reviewer le tomaba demasiado tiempo. Lo que disparó la decisión más estratégica del día: **eliminar el agente reviewer, founder revisa él mismo**. Ver decisions.md.

---

## Marco mental activo

- **Fase actual:** estabilización del bot Sofia para demos. El bot es la columna vertebral del producto y cada bug en producción es un riesgo de demo perdida.
- **Disciplina nueva (definida hoy):** pipeline rápido sin reviewer agente. Builder + validator determinístico + founder revisa. Cualquier fix quirúrgico (≤3 nodos) va directo, sin architect.
- **Regla operativa nueva:** cuando un Code node falla silenciosamente, NUNCA confiar en `try/catch` mudo. Siempre console.log + debug item visible en output.

---

## Logros operativos del día (en orden cronológico)

### 1. Pipeline simplificado (decisión estratégica)

- **Antes:** architect → prompt-designer → builder → reviewer → founder. Cada change duraba ~30 min de orquestación pesada.
- **Ahora:** builder directo (yo) + validator determinístico (`scripts/validate-n8n-expressions.js`) + founder revisa en n8n.
- Reviewer agente: ELIMINADO del flujo operativo. Sigue existiendo `.claude/agents/n8n-reviewer.md` por si se necesita para cambios estructurales grandes (>3 nodos).
- Reglas vigentes:
  - Cambio quirúrgico (≤3 nodos) → builder directo.
  - Cambio estructural (>3 nodos o lógica nueva) → architect + builder.
  - Siempre validator después del build.
  - Founder es el único revisor humano antes de activar en prod.

### 2. Sofia v5.2 — marker preservation en Formateador

- **Bug v5.1:** Sofia emitía `[IMG:CR-2075]` correctamente, pero el LLM intermedio "Formateador de Mensajes" lo BORRABA al chunkear el output. Resultado: Expand Property Images nunca veía el marker → nunca fetcheaba foto → nunca enviaba imagen.
- **Fix v5.2:** prompt del Formateador reforzado (2109 → 3913 chars) con regla CRÍTICA explícita: preservar `[IMG:CR-XXXX]` literal en MENSAJE 1, ejemplos del caso real, prohibiciones explícitas.
- **Archivos:** `scripts/build-workflow-v5.2.js`, `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.2.json`.

### 3. Sofia v5.3 — URL normalization para WhatsApp

- **Bug observado:** v5.2 emite marker, Expand procesa, Send Chunk POSTea a YCloud y YCloud responde `status: "accepted"` + `statusCode: 200`. Pero la foto NO llega a WhatsApp.
- **Causa raíz:** las URLs de Unsplash tienen `auto=format&fit=crop`. Cuando Meta fetcha la URL para reenviar la foto al destinatario, Unsplash le sirve WebP. **Meta SOLO acepta JPG/PNG** para `image.link` — descarta silenciosamente, YCloud nunca lo sabe.
- **Fix v5.3:** función `normalizeImageUrl` en Expand Property Images que stripea `auto=format` y agrega `&fm=jpg`. Además: en Send Chunk se habilitó `fullResponse: true` + `neverError: true` para que cualquier error de YCloud quede visible.
- **Archivos:** `scripts/build-workflow-v5.3.js`, `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.3.json`.

### 4. Sofia v5.4 — debug visible cuando fetch falla

- **Bug observado:** v5.3 importado pero seguía sin enviar foto. Expand emitía 3 text items sin marker, 0 image items, **sin debug**. No teníamos diagnóstico.
- **Fix v5.4:**
  - **Multi-source agency_id resolver:** fallback en 6 nodos (Resolve Agency → Variables → Buscar Lead → Unificacion → ID y Mensaje → Extract Variables). Esto sobrevive re-imports y cambios de path.
  - **Debug item emit:** si `fotoUrls.length === 0`, se emite item `type: 'debug'` con `codigo, agencyId, agencyIdSource, error, message`. El item NO llega a WhatsApp (filtrado por IF "Mensaje no vacio?") pero queda visible en el output del nodo Expand.
  - **Console.log explícito** en cada paso (visible en tab Logs del nodo).
- **Archivos:** `scripts/build-workflow-v5.4.js`, `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.4.json`.

### 5. Sofia v5.5 — fix del URL constructor (BUG REAL)

- **Bug observado:** v5.4 corriendo. Debug item dice `agencyId` resuelve correctamente desde Resolve Agency, pero `error: "unknown"` y NO se emiten image items. Significa que `fetchPropertyImages` retornó success (`error: null`) pero con `fotoUrls = []`. Las URLs estaban ahí pero algo las filtraba a todas.
- **Causa raíz REAL (descubierta esta sesión):** el **constructor `URL` no funciona en el sandbox del Code node de n8n**. Mi función `normalizeImageUrl` usaba `new URL(url)` para parsear y manipular query params. El constructor tiraba excepción silenciosa, el try/catch retornaba `''`, y el filter posterior eliminaba todas las URLs.
- **Fix v5.5:** reescribir `normalizeImageUrl` con **string ops puros** (regex + .replace). Sin `URL`, sin `URLSearchParams`. Funciona en el sandbox.
- **Resultado:** la foto llega a WhatsApp. WIN 🎉.
- **Status del archivo:** el código v5.5 está pegado MANUALMENTE en el nodo Expand Property Images del workflow live en n8n. **NO está versionado en el repo todavía** — pendiente crear `scripts/build-workflow-v5.5.js` y `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json` para persistirlo. (Hecho en este checkpoint, ver Outputs nuevos.)

### 6. CRM inbox — render de mensajes image

- **Bug observado:** la imagen llegó a WhatsApp pero el CRM inbox solo mostraba el caption ("CR-2031 — Casa moderna en Escazú, $485,000") como texto. El componente `MessageBubble` no tenía rama para `kind === 'image'`.
- **Fix aplicado a 2 archivos:**
  - `crm/src/lib/types.ts`: `InboxMessage` ahora tiene `kind`, `mediaUrl`, `mediaMime`. `toInboxMessage()` los popula desde la row de DB.
  - `crm/src/components/inbox/chat-panel.tsx`: `MessageBubble` ahora tiene 3 ramas — PropertyCard → image (con `<img>` clickeable + caption opcional) → text default.
- **Backend (ya estaba bien):** la edge function `ycloud-webhook` ya mapea `type='image'` → `kind='image'` y guarda `media_url`. No requirió cambios.
- TypeScript de mis cambios: limpio. Errores TS pre-existentes del proyecto siguen ahí (no relacionados).

---

## Aprendizajes técnicos para futuro (CRÍTICO grabar esto)

1. **El constructor `URL` no funciona en el sandbox del Code node de n8n.** Para manipular URLs en Code nodes, usar regex/string ops puros, NUNCA `new URL()` ni `URLSearchParams`. Esto nos costó 2 iteraciones (v5.3, v5.4) hasta descubrirlo.

2. **WhatsApp Business API: image.link SOLO acepta JPG/PNG.** Las URLs con `auto=format` de Unsplash sirven WebP cuando Meta fetchea, y Meta descarta silenciosamente sin avisar a YCloud. YCloud responde `status: "accepted"` pero el mensaje nunca llega. **Siempre forzar `&fm=jpg` en URLs Unsplash.**

3. **Cuando un Code node falla, NUNCA confiar en try/catch mudo.** Emitir SIEMPRE un debug item visible en el output + console.log explícito. Sin eso, debugging es ciego.

4. **`status: "accepted"` en YCloud ≠ "WhatsApp lo entregó".** YCloud solo confirma que recibió tu request. La entrega real depende de Meta y queda silenciosa si Meta rechaza por formato.

5. **n8n importa workflows con dedup por ID.** Si pegás el mismo workflow ID al importar, n8n puede no actualizar los nodos. Workaround: si un cambio "no se aplica", verificar el código del nodo directamente, no asumir que el import funcionó.

---

## Pipeline Sofia funcionando (end-to-end al cierre)

1. **Sofia (LLM)** → emite `[IMG:CR-XXXX] <texto>` con marker mandatory en MENSAJE 1.
2. **Formateador de Mensajes (LLM)** v5.2 → chunkea preservando marker literal en MENSAJE 1.
3. **Split Out** → split del campo `output` (objeto con MENSAJE 1/2/3) en N items.
4. **Expand Property Images (Code)** v5.5 →
   - Multi-source `agency_id` resolver.
   - Match marker `[IMG:CR-XXXX]` en `item.json.output`.
   - Fetch `properties-search` por código.
   - `normalizeImageUrl` con string ops puro (strip `auto=format`, force `fm=jpg`).
   - Emite N items `type: 'image'` (max 3) + 1 item `type: 'text'` con marker limpio.
   - Si falla: emite item `type: 'debug'` (no llega a YCloud, sí visible al humano).
5. **Loop Over Items → Mensaje no vacio? (IF)** → branchea por `type === 'text'` o `type === 'image'`.
6. **Send Chunk via YCloud (HTTP)** → POST con body branched por type:
   - `image`: `{ from, to, type: 'image', image: { link, caption } }`
   - `text`: `{ from, to, type: 'text', text: { body } }`
   - `fullResponse: true, neverError: true` para debug visible.
7. **YCloud → Meta → WhatsApp** → imagen entregada.
8. **YCloud webhook `whatsapp.message.updated`** → edge function `ycloud-webhook` inserta en `messages` con `kind='image'` + `media_url`.
9. **Realtime** → CRM recibe row → `toInboxMessage` → `MessageBubble` renderiza `<img>` con caption.

---

## Estado del workflow al cierre

- **v5.5 corre live en n8n** (pegado a mano en el nodo Expand Property Images del workflow que importaste como v5.4).
- **v5.5 ya está versionado en el repo:** `scripts/build-workflow-v5.5.js` + `n8n/workflows/chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json` (creados en este checkpoint).
- Sofia v5.1 prompt, Formateador v5.2 prompt, Send Chunk YCloud (con fullResponse): **vigentes**.

---

## Pendientes operativos inmediatos (próxima sesión)

1. **Importar `chatbot-inmobiliaria-demo-ycloud-sofia-v5.5.json`** como workflow nuevo en n8n (ya versionado). Deactivar la versión actual con el código pegado a mano. Activar v5.5 oficial.
2. **Probar todo completo end-to-end** (lo que el founder mencionó: "ahorita voy a probarlo bien todo completo"). Casos a cubrir:
   - Lead pide propiedad → imagen llega a WhatsApp ✓ (ya verificado)
   - Lead pide propiedad → imagen se renderiza en inbox CRM ✓ (fix aplicado, falta verificar visualmente)
   - Multi-imagen: si una propiedad tiene 3 fotos, ¿llegan las 3? (CR-2031 tiene 4 — anoche solo llegó 1, verificar si fue throttling de WhatsApp o un cap del código).
   - Orden de mensajes: ¿imagen primero, texto después? O al revés? El founder mencionó orden raro en v5.2 — verificar que con v5.5 quede coherente.
3. **Persistir v5.5 a git** (pendiente commit). El JSON y el script ya están escritos pero falta commit.
4. **Test del flujo de handoff** (heredado del 20-may) — sigue pendiente verificar end-to-end después de la integración de v5.5.

---

## Acuerdos vigentes con personas

(Sin cambios respecto al handoff del 20-may.)

---

## Cómo trabajar con Hans (recordatorio breve)

- Habla en lenguaje natural, NUNCA pide ni espera slash commands.
- Ejecutar directo cuando sabe la respuesta. Menús de opciones solo para forks reales de producto.
- Pipeline rápido vigente: builder directo + validator + founder revisa. NO architect/reviewer agentes para cambios quirúrgicos.
- Cuando hay bug en producción: diagnóstico con DATOS reales (logs, outputs), no asumir. Emitir debug items visibles.
- Idioma: español.
- UI: mobile-first siempre (founder usa tablet con clientes).

---

## Última actualización

- Fecha: 2026-05-21, fin del día.
- Sesión: muy larga, con 4 iteraciones del workflow (v5.2 → v5.3 → v5.4 → v5.5) más fix del inbox CRM.
- Próximo update sugerido: después de la próxima prueba end-to-end completa que mencionó el founder.
