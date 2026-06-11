// Template — Classifier Code Node (Sin LLM)
// Usar cuando solo se necesita routing por keywords, sin extraccion de datos
// Latencia: <50ms | Costo: $0 | Accuracy: 95%+ en casos obvios

// INPUT: $json.mensaje (texto del usuario)
const mensaje = ($json.mensaje || '').toLowerCase().trim();

// ===== ROUTING POR KEYWORDS =====

// {{agente_1_nombre}} — {{agente_1_descripcion}}
if (mensaje.match(/{{agente_1_keywords}}/)) {
  return {
    agente: '{{agente_1_id}}',
    confidence: 0.9,
    razon: '{{agente_1_razon}}'
  };
}

// {{agente_2_nombre}} — {{agente_2_descripcion}}
if (mensaje.match(/{{agente_2_keywords}}/)) {
  return {
    agente: '{{agente_2_id}}',
    confidence: 0.9,
    razon: '{{agente_2_razon}}'
  };
}

// Objeciones detectadas
if (mensaje.match(/caro|costoso|mucho|no creo|no sé|pensarlo|después/)) {
  return {
    agente: 'AGENTE_OBJECIONES',
    confidence: 0.75,
    razon: 'Posible objecion detectada'
  };
}

// DEFAULT: Agente principal maneja todo lo demas
return {
  agente: '{{agente_principal_id}}',
  confidence: 1.0,
  razon: 'Default - no match especifico'
};
