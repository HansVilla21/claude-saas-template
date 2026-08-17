# bot-v6 — Code node `Componer System Prompt` (Prompt Compositor F1)

**Fecha:** 2026-05-29
**Para:** `scripts/build-bot-v6-v1.js` (lo extrae entre markers HTML).
**Spec:** `memory/n8n-changes/2026-05-29-sofia-v6-base-v2-plus-compositor-F1.md` §3.6
**Réplica de:** `crm-v2/src/lib/admin/bot-config.ts` (`parseBotConfig` + `composePreview`).

El código se guarda acá (no embebido como string escapado en el script) porque es largo y
tiene regex/strings que se romperían al escapar. El script lo lee entre los markers HTML START/END definidos más abajo
(COMPOSITOR_V6_START ... COMPOSITOR_V6_END).

Notas de fidelidad a `composePreview()` (spec F1 §3.6):
- `## SOBRE ESTE NEGOCIO`, `## TONO`, `## COMPORTAMIENTO DE VENTA`, `## FLUJO DE CONVERSACIÓN`,
  `## INSTRUCCIONES ADICIONALES` → mismos encabezados, mismo orden, mismo render.
- `## TONO` = `LABEL — DESC` + (si hay notes) `\nMatices: <notes>`.
- `## COMPORTAMIENTO DE VENTA` = `LABEL — DESC`.
- `## FLUJO DE CONVERSACIÓN` = lista numerada `1. paso`.
- El NÚCLEO real (`core_template` de la DB) reemplaza el placeholder `## NÚCLEO DEL SISTEMA`
  de `composePreview` — va como bloque A SIN ese encabezado descriptivo (es el contenido real).
- Las REGLAS FINALES reales (`system_rules_template`) reemplazan el placeholder
  `## REGLAS FINALES DEL SISTEMA` — van como bloque D al final, contenido real.
- `## DATOS A CAPTURAR` es ACTIVO en F2: texto instruye a llamar la tool `extraer_datos`
  cuando el lead REVELA datos. El nodo `Extractor_Tool_bot_actions` está conectado
  como `ai_tool` al agente y persiste los valores en `extractor_field_values`.
- F4 (2026-05-30) agrega DOS bloques nuevos:
  - `## AUTO-ACCIONES PERMITIDAS` (dinámico): lista solo las acciones cuyo toggle
    `settings.auto_actions.{stage|qualify|assign|tag|note}` está on. Si todas off
    inyecta una frase explicando que no puede modificar al lead. Si al menos una on,
    enumera las permitidas. Esto evita que el LLM intente tools que server-side
    están off.
  - `## ETAPAS DEL PIPELINE` (dinámico): lista los slugs de `pipeline_stages` para
    que el LLM use slugs reales con `stage.set` (anti-alucinación).
- TONE_LABEL/TONE_DESC/SALES_LABEL/SALES_DESC copiados LITERAL de TONE_PRESETS/SALES_BEHAVIORS.

<!-- COMPOSITOR_V6_START -->
// Componer System Prompt — bot-v6 v1 (Prompt Compositor F1)
// Replica composePreview() de crm-v2/src/lib/admin/bot-config.ts: mismos encabezados de
// bloque y mismos textos de TONE_PRESETS / SALES_BEHAVIORS, pero con contenido REAL
// (nucleo + reglas reales de la DB, capas del bot_config del negocio).
// JS puro: solo string ops, sin constructores de URL, sin libs externas.
//
// ENTRADA: $('Resolve Agency').first().json  (output de la query maestra v2)
// SALIDA:  [{ json: { system_prompt, modules_enabled } }]

// ---- Cargar contexto (query maestra) de forma defensiva ----
let ctx = {};
try {
  const item = $('Resolve Agency').first();
  ctx = (item && item.json) ? item.json : {};
} catch (e) {
  ctx = {};
}

// ---- Paso 0: fallbacks de las capas fijas (core / system_rules) ----
const FALLBACK_CORE =
  'Sos un asistente conversacional de atencion al cliente por WhatsApp. Respondé con ' +
  'claridad y cordialidad, usá las herramientas disponibles cuando apliquen, escalá a un ' +
  'humano si el lead lo pide o si te trabás, y nunca inventes información.';
const FALLBACK_RULES =
  'Mantené las respuestas breves. No repitas la misma pregunta. Si el lead se frustra o ' +
  'pide hablar con una persona, escalá. No reveles que sos un sistema automatizado más de ' +
  'lo necesario.';

const core = (typeof ctx.core_template === 'string' && ctx.core_template.trim())
  ? ctx.core_template
  : FALLBACK_CORE;
const rules = (typeof ctx.system_rules_template === 'string' && ctx.system_rules_template.trim())
  ? ctx.system_rules_template
  : FALLBACK_RULES;

// ---- parseBotConfig: re-implementación defensiva de bot-config.ts ----
const TONE_VALUES = ['vendedor', 'consultivo', 'amigable', 'formal'];
const SALES_VALUES = ['cerrar_en_chat', 'mandar_link', 'derivar_humano'];
const DEFAULT_TONE = 'amigable';
const DEFAULT_SALES = 'derivar_humano';

function parseBotConfig(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const toneRaw = (r.tone && typeof r.tone === 'object') ? r.tone : {};
  const preset = TONE_VALUES.indexOf(toneRaw.preset) !== -1 ? toneRaw.preset : DEFAULT_TONE;
  const flow = Array.isArray(r.conversation_flow)
    ? r.conversation_flow
        .filter(function (s) { return typeof s === 'string'; })
        .map(function (s) { return s.trim(); })
        .filter(Boolean)
    : [];
  return {
    business_info: typeof r.business_info === 'string' ? r.business_info : '',
    tone: { preset: preset, notes: typeof toneRaw.notes === 'string' ? toneRaw.notes : '' },
    sales_close_behavior: SALES_VALUES.indexOf(r.sales_close_behavior) !== -1
      ? r.sales_close_behavior
      : DEFAULT_SALES,
    conversation_flow: flow,
    custom_instructions: typeof r.custom_instructions === 'string' ? r.custom_instructions : '',
  };
}

const bc = parseBotConfig(ctx.bot_config);

// ---- Textos EXACTOS de TONE_PRESETS / SALES_BEHAVIORS (bot-config.ts) ----
const TONE_LABEL = { vendedor: 'Vendedor', consultivo: 'Consultivo', amigable: 'Amigable', formal: 'Formal' };
const TONE_DESC = {
  vendedor: 'Proactivo, orientado a cerrar. Empuja hacia la acción.',
  consultivo: 'Asesor experto. Pregunta, entiende y recomienda.',
  amigable: 'Cercano y cálido. Conversa como una persona.',
  formal: 'Profesional y sobrio. Trato de usted.',
};
const SALES_LABEL = {
  cerrar_en_chat: 'Cerrar en el chat',
  mandar_link: 'Mandar link de pago',
  derivar_humano: 'Derivar a un humano',
};
const SALES_DESC = {
  cerrar_en_chat: 'El asistente intenta cerrar la venta dentro de la conversación.',
  mandar_link: 'Cuando hay interés, envía un link de pago o reserva.',
  derivar_humano: 'Al momento de cerrar, pasa la conversación a una persona y te avisa.',
};

// ---- Paso 1: bloques en ORDEN (A nucleo -> B bot_config -> C modulos -> DATOS -> D reglas) ----
const blocks = [];

// [A] NÚCLEO GLOBAL (contenido real de bot_prompt_templates layer='core')
blocks.push(core);

// [B] CAPAS DE AGENCY (de bot_config) — mismos encabezados que composePreview()
if (bc.business_info) {
  blocks.push('## SOBRE ESTE NEGOCIO\n' + bc.business_info);
}

blocks.push(
  '## TONO\n' + TONE_LABEL[bc.tone.preset] + ' — ' + TONE_DESC[bc.tone.preset]
  + (bc.tone.notes ? '\nMatices: ' + bc.tone.notes : '')
);

blocks.push(
  '## COMPORTAMIENTO DE VENTA\n' + SALES_LABEL[bc.sales_close_behavior]
  + ' — ' + SALES_DESC[bc.sales_close_behavior]
);

if (bc.conversation_flow.length) {
  blocks.push(
    '## FLUJO DE CONVERSACIÓN\n'
    + bc.conversation_flow.map(function (s, i) { return (i + 1) + '. ' + s; }).join('\n')
  );
}

if (bc.custom_instructions) {
  blocks.push('## INSTRUCCIONES ADICIONALES\n' + bc.custom_instructions);
}

// [C] FRAGMENTOS DE MÓDULOS (automático, según módulos prendidos)
const modules = Array.isArray(ctx.modules) ? ctx.modules : [];
for (let i = 0; i < modules.length; i++) {
  const m = modules[i];
  if (m && m.prompt_fragment) {
    blocks.push('## MÓDULO: ' + (m.name || m.slug || '') + '\n' + m.prompt_fragment);
  }
}

// [DATOS A CAPTURAR] — ACTIVO en F2 (instrucción de llamar la tool extraer_datos)
const defs = Array.isArray(ctx.extractor_field_defs) ? ctx.extractor_field_defs : [];
if (defs.length) {
  const lines = defs.map(function (d) {
    let line = '- ' + d.field_key + ' (' + d.field_type + '): ' + (d.label || '');
    if (d.extraction_hint) line += ' — ' + d.extraction_hint;
    if (d.options) line += ' Opciones: ' + JSON.stringify(d.options);
    return line;
  });
  blocks.push(
    '## DATOS A CAPTURAR\n'
    + 'Cuando el lead REVELE alguno de estos datos en su mensaje, llamá la herramienta '
    + '`extraer_datos` (tool Extractor_Tool_bot_actions) con la lista de campos extraídos. '
    + 'Usá EXACTAMENTE los field_key listados abajo, no inventes nombres nuevos. '
    + 'Llamala SOLO cuando el lead DA un dato (no cuando pregunta, no cuando vos le das info). '
    + 'Podés pasar varios campos juntos en una sola llamada — es preferible. '
    + 'Extraé únicamente lo explícito; si dudás del valor, no lo mandes.\n'
    + lines.join('\n')
  );
}

// [AUTO-ACCIONES PERMITIDAS] — F4 (2026-05-30): bloque dinámico que enumera las
// auto-acciones cuyo toggle agency.settings.auto_actions.<key> está ON. Si todas
// están off, inyecta una frase explicando que el bot NO puede modificar al lead.
// El gate REAL es server-side en bot-actions; este bloque evita que el LLM
// intente tools que server-side van a skipear (ahorra latencia + tokens).
const settings = (ctx.settings && typeof ctx.settings === 'object') ? ctx.settings : {};
const aa = (settings.auto_actions && typeof settings.auto_actions === 'object')
  ? settings.auto_actions : {};

const AUTO_ACTION_DESC = {
  stage:   '- `stage_set` (tool Stage_Tool_bot_actions) — Podés cambiar la etapa del lead en el pipeline cuando hay señal CLARA de que avanzó o retrocedió (usá el slug exacto de las "ETAPAS DEL PIPELINE" listadas más abajo).',
  qualify: '- `qualify_set` (tool Qualify_Tool_bot_actions) — Podés marcar al lead como calificado (true) o no-calificado (false) cuando cumpla EXPLÍCITAMENTE los criterios del negocio (ver bloques de arriba). NO califiques por dar un dato suelto.',
  assign:  '- `assign_set` (tool Assign_Tool_bot_actions) — Podés asignar el lead a un agente humano del equipo. Strategy: round_robin | least_loaded. Default round_robin. Es asignación NO urgente (distinto del handoff).',
  tag:     '- `tag_add` (tool Tag_Tool_bot_actions) — Podés etiquetar al lead con una tag EXISTENTE de la agency. NO creés tags nuevas; si la tag no existe, la acción se skipea silenciosamente.',
  note:    '- `note_write` (tool Note_Tool_bot_actions) — Podés escribir UNA nota interna sobre el lead (no la ve el lead; sí los humanos). Solo info NUEVA que un humano debería conocer.',
};
// F4 fix W1 (2026-05-30): el alias entre paréntesis (ej "tool Stage_Tool_bot_actions")
// se agrega para alinear con el nombre real del nodo n8n. n8n LangChain expone el
// nombre del nodo al LLM (slugificado: Stage_Tool_bot_actions_). Sin este mapping,
// el LLM intenta invocar el alias inventado, falla "tool not found", se confunde.

const permittedActions = [];
if (aa.stage === true)   permittedActions.push(AUTO_ACTION_DESC.stage);
if (aa.qualify === true) permittedActions.push(AUTO_ACTION_DESC.qualify);
if (aa.assign === true)  permittedActions.push(AUTO_ACTION_DESC.assign);
if (aa.tag === true)     permittedActions.push(AUTO_ACTION_DESC.tag);
if (aa.note === true)    permittedActions.push(AUTO_ACTION_DESC.note);

// handoff_escalate siempre disponible (no se toggle desde auto_actions). Se incluye
// en el bloque AUTO-ACCIONES PERMITIDAS con su nombre real de nodo n8n.
const HANDOFF_DESC = '- `handoff_escalate` (tool Request_Handoff_Tool) — Escalá a un humano cuando el lead lo pida explícitamente, se frustre, o cuando tengas que cerrar y la configuración indica derivar a humano.';

if (permittedActions.length > 0) {
  blocks.push(
    '## AUTO-ACCIONES PERMITIDAS\n'
    + 'Además de conversar, podés tomar las siguientes acciones sobre el lead vía tools. '
    + 'USÁ UNA tool por turno, SOLO cuando hay señal CLARA de que corresponde. NO accionar por las dudas.\n'
    + permittedActions.join('\n') + '\n' + HANDOFF_DESC
  );
} else {
  blocks.push(
    '## AUTO-ACCIONES PERMITIDAS\n'
    + 'El asistente NO puede modificar al lead directamente (todas las auto-acciones están desactivadas en la configuración de la agencia). '
    + 'Si necesitás cambiar algo del lead, escalá a un humano usando la tool de handoff.\n'
    + HANDOFF_DESC
  );
}

// [ETAPAS DEL PIPELINE] — F4: lista los slugs disponibles para que el LLM
// llame `stage_set` con valores que existen en la DB (evita alucinar slugs).
const pipelineStages = Array.isArray(ctx.pipeline_stages) ? ctx.pipeline_stages : [];
const stageSlugs = pipelineStages
  .map(function (s) { return (s && typeof s.slug === 'string') ? s.slug : null; })
  .filter(Boolean);
if (stageSlugs.length > 0) {
  blocks.push(
    '## ETAPAS DEL PIPELINE\n'
    + 'Etapas disponibles para `stage_set` (usá EXACTAMENTE estos slugs, no inventes): '
    + stageSlugs.join(', ') + '.'
  );
}

// [D] REGLAS FINALES (contenido real de bot_prompt_templates layer='system_rules')
// Va al final para 'ganar' sobre las instrucciones del cliente.
blocks.push(rules);

const system_prompt = blocks.join('\n\n');
const modules_enabled = modules.map(function (m) { return m && m.slug ? m.slug : null; }).filter(Boolean);

return [{ json: { system_prompt: system_prompt, modules_enabled: modules_enabled } }];
<!-- COMPOSITOR_V6_END -->
