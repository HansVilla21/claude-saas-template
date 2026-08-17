# TEMPLATES Y RECURSOS REUTILIZABLES
## Plantillas, checklists, curriculum y GPTs de Momentum AI

---

# 1. CHECKLIST DE ONBOARDING - CLIENTE NUEVO

## Información del Negocio (Discovery)
- [ ] Descripción del producto/servicio
- [ ] Cliente ideal (perfil demográfico/psicográfico)
- [ ] Ticket promedio y rango de precios
- [ ] Ciclo de venta típico (días/semanas/meses)
- [ ] Top 5 preguntas frecuentes que reciben
- [ ] Top 3 objeciones comunes
- [ ] Diferenciador vs competencia
- [ ] Qué acción quieren que el bot genere (agendar, cotizar, vender, redirigir)
- [ ] Volumen actual de consultas (por día/semana)

## Contenido para Entrenar el Bot
- [ ] Documentos de servicios/productos (PDFs, brochures, catálogos)
- [ ] Precios actualizados (o rangos)
- [ ] Políticas relevantes (reembolsos, tiempos, restricciones)
- [ ] FAQs escritas (si las tienen documentadas)
- [ ] Casos de éxito o testimonios (si quieren incluirlos)

## Accesos Técnicos
- [ ] Correo de la empresa (acceso)
- [ ] Canal de mensajería:
  - WhatsApp → número del negocio + quién tiene SIM/acceso
  - Instagram/Facebook → acceso a página/cuenta
  - ManyChat → cuenta existente o crear nueva
- [ ] CRM actual (acceso) o decisión de usar nuevo
- [ ] Calendly/sistema de citas (acceso o crear)

## Operación y Handoffs
- [ ] ¿Quién recibe leads calificados? (nombre, WhatsApp, Discord, email)
- [ ] Horario de atención humana
- [ ] ¿Qué pasa fuera de horario?
- [ ] Criterio de calificación: ¿qué hace a un lead "bueno"?
- [ ] ¿Hay script de ventas que el equipo use actualmente?

## Tono y Personalidad
- [ ] ¿Nombre del bot? (o sin nombre)
- [ ] Tono: formal, semi-formal, casual
- [ ] Idioma o mezcla de idiomas
- [ ] ¿Se hace pasar por humano o se identifica como bot?

## Lo que MÁS se suele escapar:
1. Accesos al canal (WhatsApp/IG) — el número, quién lo tiene
2. Definición clara del handoff — quién recibe y cómo
3. Templates de WhatsApp aprobados por Meta (si usan API oficial)
4. Diferencia entre lo que el bot puede prometer y lo que no

---

# 2. DISCOVERY FRAMEWORK (15 MINUTOS)

## Fase 1: Entender el Negocio (5 min)
```
1. "¿Qué vende [empresa] y a quién?" → Producto + cliente ideal
2. "¿Cuál es el ticket promedio?" → Complejidad de venta
3. "¿Ciclo de venta típico?" → Días/semanas/meses
4. "¿Principal diferenciador vs competencia?" → Qué destacar
5. "¿Volumen actual de consultas?" → Dimensionar solución
```

## Fase 2: Mapear Proceso de Ventas (5 min)
```
1. "¿De dónde vienen los leads?" → Ads, orgánico, referidos
2. "¿Qué preguntan primero?" → Precio, características, disponibilidad
3. "¿Cuáles son las objeciones más comunes?" → Top 3
4. "¿Qué los convence de comprar/agendar?" → Demo, trial, social proof
5. "¿Cómo cierran actualmente?" → Call, email, compra directa, visita
```

## Fase 3: Decisiones Técnicas (5 min)
```
Basado en respuestas, determinar:
- Complejidad: simple (3 agentes) / media (4) / compleja (5)
- Modelo: GPT-4o-mini (ticket <$500) o GPT-4o (ticket >$500)
- Canal: WhatsApp (Evolution/YCloud) / Instagram (ManyChat) / Multi
- CRM: Google Sheets (simple) / Airtable (medio) / Supabase (complejo)
```

---

# 3. PLANTILLA DE PROMPT - AGENTE PRINCIPAL

```markdown
# Rol
Eres [Nombre], [rol] de [Empresa] especializado en [producto/servicio principal].

# Fecha actual
{{ $now.format('yyyy-MM-dd') }}

# Objetivo Principal
[Calificar leads / Agendar citas / Vender producto] identificando necesidad, 
presupuesto aproximado y urgencia, mientras construyes relación y confianza.

# Información de Contexto
- [Empresa] ofrece [descripción en 1 línea]
- Precio aproximado: [rango] (nunca dar exacto sin calificar)
- Clientes ideales: [descripción breve]
- Diferenciador clave: [qué nos hace únicos]

# Flujo Conversacional

## Inicio (Primeros 2-3 mensajes)
1. Saludo cálido con nombre del bot
2. Pregunta abierta sobre situación/necesidad
3. Escuchar y follow-up relevante

## Exploración (Mensajes 3-6)
- Entender situación actual
- Identificar pain points específicos
- Gauge presupuesto indirectamente

## Calificación (Mensajes 7-10)
- Si hay fit: Amplificar problema → presentar solución
- Si no hay fit: Ofrecer recurso gratuito → cerrar cordialmente
- Si objeciones: LAARC (no defender, explorar)

## Cierre (Mensajes 11-15)
- CTA claro: "[acción específica]"
- Capturar información de contacto
- Confirmar próximos pasos

# Reglas Críticas
1. NUNCA más de 3-4 líneas por mensaje
2. SIEMPRE una pregunta por mensaje (máximo)
3. NUNCA dar precio sin entender necesidad
4. RECORDAR lo que dijeron (no preguntar dos veces)
5. Si no sabés algo: "Dejá verifico eso para vos..."
6. Tono costarricense: "vos", "querés", "tenés"
7. NO usar bold, bullets, ni emojis excesivos

# Preguntas Frecuentes
- Precio: "Depende de [variable]. Típicamente entre [rango]. ¿Qué [variable] manejás?"
- Tiempo: "[Tiempo típico]. ¿Para cuándo lo necesitarías?"
- Diferencia con competencia: "[Diferenciador]. ¿Has evaluado otras opciones?"

# [SECCIÓN ESPECÍFICA DEL NEGOCIO]
[Agregar información específica: servicios, productos, políticas, etc.]
```

**Target: 3,000-5,000 caracteres**

---

# 4. PLANTILLA DE PROMPT - CLASSIFIER (LLM)

```markdown
# ROL
Clasificador del sistema [NOMBRE] de [EMPRESA].
Analiza mensaje actual + historial para:
1. Redirigir al agente correcto
2. Extraer información del usuario

# DESTINOS POSIBLES
- AGENTE_PRINCIPAL: [cuándo enviar aquí]
- AGENTE_[ESPECIALISTA]: [cuándo enviar aquí]
- [Máximo 3-4 destinos]

# DATOS A EXTRAER
{
  "nombre": "string o null",
  "email": "formato válido o null",
  "[campo_específico]": "opciones válidas o null"
}

# REGLAS
1. Si el mensaje es ambiguo → AGENTE_PRINCIPAL (default seguro)
2. Si es primer mensaje genérico ("hola") → AGENTE_PRINCIPAL
3. Extraer SOLO datos explícitos, no inferir
4. Output: JSON PURO, sin markdown, sin backticks, sin texto adicional

# OUTPUT REQUERIDO
{
  "agente_destino": "AGENTE_PRINCIPAL",
  "informacion_extraida": { ... },
  "razon": "explicación breve"
}
```

**Target: 1,500-3,000 caracteres**

---

# 5. PLANTILLA DE PROMPT - AGENTE DE OBJECIONES (LAARC)

```markdown
# ROL
Agente especializado en resolver objeciones de [EMPRESA].
Usas el framework LAARC (Listen, Acknowledge, Assess, Respond, Confirm).

# OBJECIONES QUE MANEJAS

## Precio/Costo
LISTEN: "Entiendo tu preocupación sobre la inversión"
ACKNOWLEDGE: "Es importante que tenga sentido para vos"
ASSESS: "¿Comparado con qué te parece alto?"
RESPOND:
  - Si vs competencia: [diferencial de valor]
  - Si vs nada: [costo de no actuar]
  - Si vs presupuesto: [opción reducida]
CONFIRM: "¿Eso te aclara el tema?"

## Timing ("No es buen momento")
ASSESS: "¿Qué necesita pasar primero?"
UNCOVER: "¿Es timing o hay algo más?"
URGENCY: "[Costo de esperar] / [disponibilidad limitada]"

## [Objeción específica del negocio]
[Adaptar LAARC al caso]

# REGLA: NUNCA ofrecer descuento de inmediato. Siempre explorar primero.
# Si resuelve → devolver a Agente Principal para cierre
# Si no resuelve después de 2 intentos → ofrecer alternativa o handoff
```

**Target: 1,000-2,000 caracteres**

---

# 6. PLANTILLA DE PROMPT - AGENTE ESPECIALISTA (GENÉRICA)

```markdown
# Rol Único
[Una línea describiendo el ÚNICO propósito de este agente]

# Fuente de Datos
[API / Google Sheets / Cache / Hardcoded]

# Respuestas (Variar entre 3 opciones)
1. "[Respuesta variante 1 + pregunta de follow-up]"
2. "[Respuesta variante 2 + pregunta de follow-up]"
3. "[Respuesta variante 3 + pregunta de follow-up]"

# Reglas Absolutas
- [Regla 1 - lo que NUNCA debe hacer]
- [Regla 2 - lo que SIEMPRE debe hacer]
- MÁXIMO 2-3 líneas de respuesta
- SIEMPRE hacer pregunta de follow-up
```

**Target: 800-1,500 caracteres**

---

# 7. MOMENTUM AI ACADEMY - MÓDULO CHATBOTS

## Estructura del Módulo (8 clases × 40-50 min)

### Clase 1: Anatomía de un Chatbot que Convierte
- Qué diferencia un bot de 3% de uno de 35%
- Arquitectura modular vs monolítica
- Los 5 errores fatales
- Demo: 3 bots reales (bueno, medio, malo)
- **GPT #1: Arquitecto de Chatbots**

### Clase 2: Discovery en 15 Minutos
- Template de discovery (preguntas exactas)
- Roleplay en vivo
- Qué info importa vs nice-to-have
- **GPT #2: Preparador de Discovery**

### Clase 3: De Discovery a Arquitectura
- Mapeo: proceso de ventas → agentes necesarios
- Cuándo usar 3 vs 4 vs 5 agentes
- Decisiones de stack (Evolution vs ManyChat, GPT-4o vs mini)
- **GPT #3: Diseñador de Arquitectura**

### Clase 4: Setup Técnico Completo
- Evolution API + WhatsApp
- Chatwoot setup
- Supabase/PostgreSQL
- Redis para memory
- n8n workflow base

### Clase 5: Prompts - Extractor y Principal
- Crear classifier desde template
- Crear agente principal con BANT conversacional
- Testing con conversaciones simuladas
- **GPT #4: Generador de Prompts**

### Clase 6: Prompts - Agentes Especializados
- Crear 2-3 agentes especializados
- Precios, disponibilidad, objeciones
- Templates reutilizables

### Clase 7: Canal + CRM + Handoffs
- Conectar Evolution API
- Setup Chatwoot
- Google Sheets/Airtable como CRM
- Etiquetas y estados de lead
- Handoff a humano

### Clase 8: Entrega Profesional
- Testing completo
- Documento de entrega (sin jerga técnica)
- Métricas y monitoring
- Checklist pre-deploy

## 4 GPTs para la Academia

### GPT #1: Arquitecto de Chatbots
```
Input: Descripción del negocio + stack + info a extraer + handoffs
Output: Arquitectura completa (agentes, propósito, routing, JSON para siguiente GPT)
Límite: 8,000 chars (límite de ChatGPT)
```

### GPT #2: Generador Prompt - Extractor
```
Input: JSON del GPT #1 + campos a extraer + routing
Output: Prompt del classifier <3k caracteres con formato JSON
```

### GPT #3: Generador Prompt - Agente Principal
```
Input: JSON del GPT #1 + objeciones comunes + diferenciador
Output: Prompt <5k caracteres
```

### GPT #4: Generador Agentes Especializados
```
Input: Tipo (Precios/Disponibilidad/Soporte) + contexto del GPT #1
Output: Prompt <2k caracteres + reglas de escalación
```

## Proyecto Build-Along: Clínica Dental Bot
```yaml
Stack: Evolution API + Chatwoot + Google Sheets
Arquitectura:
  - Extractor de Información
  - Agente Principal (info tratamientos)
  - Agente Citas (agendar consultas)
  - Agente Precios (cotizaciones)

Progreso por clase:
  1. Arquitectura definida
  2. n8n configurado
  3. Extractor + Principal
  4. Agentes especializados
  5. Testing funcional
  6. Canal + CRM
  7. Handoffs + etiquetas
  8. Documento entrega
```

## Recursos del Módulo
```yaml
n8n Workflows:
  - chatbot_base_template.json
  - evolution_api_integration.json
  - manychat_hybrid.json
  - crm_update_module.json
  - chatwoot_integration.json

SQL/Configs:
  - postgres_schema.sql
  - redis_setup.md
  - evolution_config.json

Documentación:
  - pre_build_checklist.pdf
  - client_delivery_template.docx
  - testing_scenarios.pdf
  - monitoring_guide.pdf
```

## Duración Total
- 8 clases × 40-50 min = ~6.5 horas
- Proyecto entre clases: ~4 horas
- Total: 2 semanas part-time

## Resultado Final del Estudiante
- 1 chatbot completo funcional (portfolio)
- 4 GPTs que automatizan 80% del trabajo
- Todas las plantillas para replicar
- Proceso repetible para cualquier cliente

---

# 8. DOCUMENTO DE ENTREGA - TEMPLATE (NO TÉCNICO)

## Estructura para cliente:

```markdown
# [NOMBRE DEL BOT] - Tu Asistente de [FUNCIÓN]

## Qué hace [Nombre]
[2-3 líneas explicando en lenguaje simple]

## Cómo funciona
[Explicar flujo sin mencionar n8n, APIs, modelos, etc.]
"Cuando alguien te escribe por WhatsApp, [Nombre] responde automáticamente..."

## Qué puede hacer
- [Capacidad 1]
- [Capacidad 2]
- [Capacidad 3]

## Qué NO puede hacer
- [Limitación 1 - importante para expectativas]
- [Limitación 2]

## Cuándo te notifica
- [Trigger de notificación 1]
- [Trigger de notificación 2]

## Resultados esperados
- [Métrica target 1]
- [Métrica target 2]

## Soporte y mantenimiento
[Qué incluye el servicio post-entrega]
```

**REGLA: NUNCA mencionar "n8n", "API", "LLM", "GPT", "prompt" en documentos para cliente.**

---

# 9. PROPUESTA COMERCIAL - TEMPLATE

## Estructura para nuevos clientes:

```markdown
# Propuesta: Asistente Inteligente para [EMPRESA]

## Diagnóstico
[Situación actual del cliente y oportunidad]

## Solución Propuesta
[Qué se va a construir, en lenguaje de negocio]

## Fases de Implementación
Fase 1 (Semana 1): Setup y configuración
Fase 2 (Semana 2): Desarrollo y testing
Fase 3 (Semana 3): Lanzamiento y ajustes

## Inversión
[Precio y estructura de pago]

## Resultados Esperados
[Métricas target del primer mes]

## Siguientes Pasos
[1-2 decisiones que el cliente necesita tomar]
```

**REGLA: Modular — que el cliente pueda elegir scope. Sin jerga técnica.**
