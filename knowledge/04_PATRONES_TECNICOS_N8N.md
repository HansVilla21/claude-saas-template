# PATRONES TÉCNICOS N8N - CÓDIGO Y CONFIGURACIONES
## Snippets, integraciones y patrones reutilizables de Momentum AI

---

# 1. PATRONES DE NODOS N8N

## 1.1 Estructura Base de Workflow

```yaml
WORKFLOW ESTÁNDAR:
  
  [Webhook/Canal Trigger]
      ↓
  [Code Node: Message Classifier]
      ↓
  [Switch Node: Router]
      ↓ ←──── ↓ ←──── ↓
  [AI Agent    [AI Agent    [AI Agent
   Principal]   Esp. 1]      Esp. 2]
      ↓             ↓             ↓
  [Merge/Set Node: Unify Response]
      ↓
  [Code Node: Response Formatter]
      ↓
  [Canal Response Node]
      ↓
  [PostgreSQL: Save State]
      ↓ (conditional)
  [Discord/Email: Notification]
```

## 1.2 Trigger por Canal

### WhatsApp (Evolution API)
```yaml
Trigger: Webhook
URL: https://[tu-n8n]/webhook/whatsapp-evolution
Method: POST
Body contains:
  - data.message.conversation (texto del mensaje)
  - data.key.remoteJid (número del usuario)
  - data.pushName (nombre del usuario)
```

### WhatsApp (YCloud)
```yaml
Trigger: Webhook
Particularidad: Templates requieren aprobación Meta
App Coexistence: bot + app personal coexisten en mismo número
Broadcast: nativo para campañas proactivas
```

### Instagram DM (ManyChat)
```yaml
Trigger: Webhook desde ManyChat
Flow: ManyChat recibe DM → Webhook a n8n → n8n procesa → Response a ManyChat
Particularidad: ManyChat maneja el canal, n8n maneja la lógica AI
```

## 1.3 AI Agent Node - Configuración

```yaml
Node Type: AI Agent (@n8n/n8n-nodes-langchain)
Model: OpenAI Chat Model
  - Model Name: gpt-4o (principal) o gpt-4o-mini (classifier/simple)
  - Temperature: 0.3-0.5 (ventas requiere consistencia)
  - Max Tokens: 500-1000 (respuestas cortas)

Memory: Window Buffer Memory
  - Context Window Length: 10 (mensajes)

System Message: [prompt del agente]

Tools (opcional):
  - Google Sheets (inventory, CRM simple)
  - HTTP Request (APIs externas)
  - Supabase (vector store, state)
```

---

# 2. CODE SNIPPETS REUTILIZABLES

## 2.1 Message Classifier (Code Node - Sin LLM)

```javascript
// INPUT: $json.mensaje, $json.historial
const mensaje = ($json.mensaje || '').toLowerCase().trim();

// ===== ROUTING POR KEYWORDS =====

// Precios
if (mensaje.match(/precio|costo|cuánto|tarifa|cobr|vale|inversión/)) {
  return { 
    agente: 'AGENTE_PRECIOS', 
    confidence: 0.9,
    razon: 'Detectada consulta de precio' 
  };
}

// Disponibilidad / Fechas
if (mensaje.match(/disponib|fecha|calendario|cuándo|horario|agenda/)) {
  return { 
    agente: 'AGENTE_DISPONIBILIDAD', 
    confidence: 0.9,
    razon: 'Detectada consulta de disponibilidad' 
  };
}

// Inventario / Stock
if (mensaje.match(/inventario|stock|tienen|hay|queda|modelo|opcion/)) {
  return { 
    agente: 'AGENTE_INVENTARIO', 
    confidence: 0.85,
    razon: 'Detectada consulta de inventario' 
  };
}

// Objeción detectada
if (mensaje.match(/caro|costoso|mucho|no creo|no sé|pensarlo|después/)) {
  return { 
    agente: 'AGENTE_OBJECIONES', 
    confidence: 0.75,
    razon: 'Posible objeción detectada' 
  };
}

// DEFAULT: Agente principal maneja todo lo demás
return { 
  agente: 'AGENTE_PRINCIPAL', 
  confidence: 1.0,
  razon: 'Default - no match específico' 
};
```

## 2.2 Round-Robin por Hora

```javascript
// Asignación de vendedores basada en hora actual
const hora = new Date().getHours();
const esHoraPar = hora % 2 === 0;

// Configurar vendedores
const vendedores = {
  par: {
    nombre: "Mario Rodriguez",
    whatsapp: "https://wa.me/506XXXXXXXX",
    calendly: "https://calendly.com/mario"
  },
  impar: {
    nombre: "Mauricio Monge",
    whatsapp: "https://wa.me/506XXXXXXXX",
    calendly: "https://calendly.com/mauricio"
  }
};

const vendedor = esHoraPar ? vendedores.par : vendedores.impar;

return {
  vendedor_nombre: vendedor.nombre,
  vendedor_whatsapp: vendedor.whatsapp,
  vendedor_calendly: vendedor.calendly,
  hora_asignacion: hora,
  regla_aplicada: esHoraPar ? 'hora_par' : 'hora_impar'
};
```

## 2.3 Response Formatter

```javascript
// INPUT: $json.respuesta_agente
let respuesta = $json.respuesta_agente || '';

// ===== LIMPIEZA DE FORMATO =====

// Remover bold markdown (no funciona en WhatsApp)
respuesta = respuesta.replace(/\*\*(.*?)\*\*/g, '$1');
respuesta = respuesta.replace(/__(.*?)__/g, '$1');

// Remover bullets y listas
respuesta = respuesta.replace(/^[\-\*]\s/gm, '');
respuesta = respuesta.replace(/^\d+\.\s/gm, '');

// Remover headers markdown
respuesta = respuesta.replace(/^#+\s/gm, '');

// Limitar longitud (máximo ~500 chars por mensaje WhatsApp)
if (respuesta.length > 500) {
  // Cortar en el último punto o salto de línea antes de 500
  const cortado = respuesta.substring(0, 500);
  const ultimoPunto = cortado.lastIndexOf('.');
  const ultimoSalto = cortado.lastIndexOf('\n');
  const corte = Math.max(ultimoPunto, ultimoSalto);
  if (corte > 200) {
    respuesta = respuesta.substring(0, corte + 1);
  }
}

// Asegurar que no termine con pregunta doble
const preguntas = respuesta.match(/\?/g);
if (preguntas && preguntas.length > 1) {
  // Mantener solo la última pregunta
  const partes = respuesta.split('?');
  respuesta = partes.slice(0, -1).join('.') + '?' + (partes[partes.length-1] || '');
}

return { mensaje_formateado: respuesta.trim() };
```

## 2.4 Discord Notification (String Detection)

```javascript
// INPUT: $json.respuesta_agente, $json.nombre_usuario, $json.telefono
const respuesta = $json.respuesta_agente || '';
const nombre = $json.nombre_usuario || 'Usuario';
const telefono = $json.telefono || 'N/A';

let notificaciones = [];

// Detectar derivación a vendedor (WhatsApp link)
if (respuesta.includes('wa.me/')) {
  notificaciones.push({
    tipo: 'LEAD_DERIVADO',
    mensaje: `🟢 **Lead derivado a vendedor**\nNombre: ${nombre}\nTel: ${telefono}`,
    canal: 'discord_ventas'
  });
}

// Detectar Calendly enviado
if (respuesta.includes('calendly.com')) {
  notificaciones.push({
    tipo: 'CALENDLY_ENVIADO',
    mensaje: `📅 **Calendly enviado**\nNombre: ${nombre}\nTel: ${telefono}`,
    canal: 'discord_ventas'
  });
}

// Detectar descalificación
if (respuesta.includes('lamentablemente') || 
    respuesta.includes('no podemos ayudarte') ||
    respuesta.includes('fuera de nuestro rango')) {
  notificaciones.push({
    tipo: 'LEAD_DESCALIFICADO',
    mensaje: `🔴 **Lead descalificado**\nNombre: ${nombre}\nTel: ${telefono}`,
    canal: 'discord_ventas'
  });
}

// Detectar solicitud de handoff humano
if (respuesta.includes('hablar con') || 
    respuesta.includes('alguien del equipo')) {
  notificaciones.push({
    tipo: 'HANDOFF_HUMANO',
    mensaje: `🟡 **Handoff solicitado**\nNombre: ${nombre}\nTel: ${telefono}\nÚltimo mensaje: ${respuesta.substring(0, 200)}`,
    canal: 'discord_urgente'
  });
}

return { notificaciones, hay_notificacion: notificaciones.length > 0 };
```

## 2.5 Conversión de Moneda (Colones ↔ USD)

```javascript
// INPUT: $json.monto_mencionado (string del usuario)
const texto = ($json.monto_mencionado || '').toLowerCase();

let monto_usd = null;
let moneda_detectada = null;

// Detectar colones
if (texto.includes('millones') || texto.includes('mill') || texto.includes('₡')) {
  moneda_detectada = 'CRC';
  const numeros = texto.match(/[\d.,]+/);
  if (numeros) {
    let valor = parseFloat(numeros[0].replace(',', '.'));
    if (texto.includes('millones') || texto.includes('mill')) {
      valor = valor * 1000000;
    }
    monto_usd = Math.round(valor / 500); // ₡500 = $1
  }
}

// Detectar dólares
if (texto.includes('k') || texto.includes('usd') || texto.includes('$') || texto.includes('dólares')) {
  moneda_detectada = 'USD';
  const numeros = texto.match(/[\d.,]+/);
  if (numeros) {
    let valor = parseFloat(numeros[0].replace(',', ''));
    if (texto.includes('k')) {
      valor = valor * 1000;
    }
    monto_usd = Math.round(valor);
  }
}

// Determinar rango de presupuesto
let rango = 'desconocido';
if (monto_usd !== null) {
  if (monto_usd < 100000) rango = '<100K';
  else if (monto_usd <= 130000) rango = '100K-130K';
  else if (monto_usd <= 150000) rango = '130K-150K';
  else if (monto_usd <= 200000) rango = '150K-200K';
  else rango = '>200K';
}

return { monto_usd, moneda_detectada, rango_presupuesto: rango };
```

## 2.6 Extracción de Datos del Mensaje

```javascript
// INPUT: $json.mensaje
const msg = $json.mensaje || '';

const datos = {
  nombre: null,
  email: null,
  telefono: null,
  ubicacion: null
};

// Extraer email
const emailMatch = msg.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
if (emailMatch) datos.email = emailMatch[0];

// Extraer teléfono CR (8 dígitos)
const telMatch = msg.match(/(?:\+?506\s?)?[2-8]\d{3}[\s-]?\d{4}/);
if (telMatch) datos.telefono = telMatch[0].replace(/[\s-]/g, '');

// Detectar nombre (patrones comunes)
const nombrePatterns = [
  /(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚa-záéíóú]+(?:\s[A-ZÁÉÍÓÚa-záéíóú]+)?)/i,
  /^([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s[A-ZÁÉÍÓÚ][a-záéíóú]+)?)$/m
];
for (const pattern of nombrePatterns) {
  const match = msg.match(pattern);
  if (match) { datos.nombre = match[1]; break; }
}

// Detectar ubicación (provincias CR)
const ubicaciones = ['san josé', 'alajuela', 'heredia', 'cartago', 'guanacaste', 
                     'puntarenas', 'limón', 'escazú', 'santa ana', 'grecia'];
const msgLower = msg.toLowerCase();
for (const ubi of ubicaciones) {
  if (msgLower.includes(ubi)) { datos.ubicacion = ubi; break; }
}

return datos;
```

---

# 3. CONFIGURACIÓN DE BASES DE DATOS

## 3.1 PostgreSQL/Supabase Schema

```sql
-- Tabla de estado de conversación
CREATE TABLE conversation_state (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  session_id VARCHAR(50),
  current_agent VARCHAR(50) DEFAULT 'AGENTE_PRINCIPAL',
  bant_budget VARCHAR(50),
  bant_authority VARCHAR(50),
  bant_need TEXT,
  bant_timeline VARCHAR(50),
  bant_score INT DEFAULT 0,
  lead_name VARCHAR(100),
  lead_email VARCHAR(100),
  lead_company VARCHAR(100),
  conversation_stage VARCHAR(50) DEFAULT 'inicio',
  message_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Tabla de analytics
CREATE TABLE chat_analytics (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20),
  session_id VARCHAR(50),
  agent_used VARCHAR(50),
  message_direction VARCHAR(10), -- 'in' or 'out'
  message_text TEXT,
  response_time_ms INT,
  tokens_used INT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de leads calificados
CREATE TABLE qualified_leads (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20),
  name VARCHAR(100),
  email VARCHAR(100),
  budget_range VARCHAR(50),
  need_summary TEXT,
  timeline VARCHAR(50),
  lead_score INT,
  qualification_date TIMESTAMP DEFAULT NOW(),
  assigned_to VARCHAR(100),
  status VARCHAR(50) DEFAULT 'new',
  notes TEXT
);

-- Índices
CREATE INDEX idx_conv_phone ON conversation_state(phone_number);
CREATE INDEX idx_conv_session ON conversation_state(session_id);
CREATE INDEX idx_analytics_phone ON chat_analytics(phone_number);
CREATE INDEX idx_leads_status ON qualified_leads(status);
```

## 3.2 Google Sheets como CRM Simple

```yaml
Estructura recomendada:
  Sheet: "Leads"
  Columnas:
    A: Timestamp
    B: Nombre
    C: Email
    D: Teléfono
    E: Empresa/Negocio
    F: Necesidad
    G: Presupuesto
    H: Timeline
    I: Lead Score (0-4)
    J: Estado (Nuevo, Contactado, Calificado, Cerrado)
    K: Agente Asignado
    L: Notas

n8n Operation: "appendOrUpdate"
Match Column: Email (para no duplicar)
```

---

# 4. DECISIONES TÉCNICAS POR TIPO DE NEGOCIO

## 4.1 Matriz de Stack

```yaml
E-Commerce / Productos:
  Canal: WhatsApp (Evolution) o Instagram (ManyChat)
  CRM: Google Sheets o Airtable
  Modelo: GPT-4o-mini (conversaciones simples)
  Agentes: 3 (Principal, Inventario, Checkout)

Servicios B2B / SaaS:
  Canal: WhatsApp + Web Chat
  CRM: Airtable o HubSpot
  Modelo: GPT-4o (conversaciones complejas)
  Agentes: 4 (Principal/SPIN, Demo, Pricing, Técnico)

Servicios Locales (Clínicas, Salones):
  Canal: WhatsApp (Evolution) o Instagram (ManyChat)
  CRM: Google Sheets
  Modelo: GPT-4o-mini
  Agentes: 3 (Principal, Citas, Precios)

Real Estate / Rentals:
  Canal: WhatsApp + Instagram
  CRM: Airtable
  Modelo: GPT-4o (tickets altos)
  Agentes: 3-4 (Principal, Disponibilidad, Precios, Tours)

Microfinanzas / Formularios:
  Canal: WhatsApp
  CRM: Sistema propio del cliente
  Modelo: GPT-4o-mini (flujo ultra-simple)
  Agentes: 1 (enviar formulario inmediatamente)

Asesoría / Consulting:
  Canal: WhatsApp (YCloud para proactivo)
  CRM: Notion, Airtable
  Modelo: GPT-4o
  Agentes: 2 (Calificación + Agendamiento)
```

---

# 5. CONFIGURACIÓN DE HERRAMIENTAS EXTERNAS

## 5.1 Evolution API
```yaml
Función: Conectar WhatsApp a n8n
Hosting: Self-hosted
Webhook: POST a n8n con cada mensaje
Formato: No bold, no bullets, emojis moderados
Limitación: Sin templates de Meta (a diferencia de YCloud)
```

## 5.2 ManyChat
```yaml
Función: Conectar Instagram/Facebook DM a n8n
Modelo: ManyChat maneja canal, n8n maneja lógica
Webhook: Bidireccional
Costo: $15/mes+
Ventaja: Multi-canal (IG, FB, WA en un lugar)
```

## 5.3 YCloud
```yaml
Función: WhatsApp Business API oficial
Ventaja: App Coexistence, 0% markup, broadcasts nativos
Requisito: Email empresarial con dominio del website
Templates: Requieren aprobación Meta (24-48h)
Costo: Solo tarifas Meta
```

## 5.4 Chatwoot
```yaml
Función: Inbox compartido para equipo humano
Uso: Cuando hay handoff, el humano ve la conversación completa
Integración: n8n actualiza estado de conversación
```

## 5.5 Airtable
```yaml
Función: CRM flexible
Tablas típicas: Leads, Conversaciones, Productos
Ventaja: Interfaz visual para el equipo del cliente
n8n: Nodos nativos (create, update, search)
```

## 5.6 Calendly
```yaml
Función: Agendamiento de citas/demos/visitas
Integración: Link hardcoded en prompt del agente
NO hacer: Conectar API para verificar disponibilidad (innecesario, el link ya la muestra)
SÍ hacer: Notificar equipo cuando se comparte el link
```

## 5.7 Discord
```yaml
Función: Notificaciones internas del equipo
Método: String detection en output del agente (no JSON del agente)
Canales típicos: #ventas, #leads-calificados, #urgente
Ventaja: Real-time, gratuito, el equipo ya lo usa
```
