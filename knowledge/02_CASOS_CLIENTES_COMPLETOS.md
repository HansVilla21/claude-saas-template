# CASOS DE CLIENTES - ARQUITECTURAS Y DECISIONES
## Referencia completa de todos los proyectos de Momentum AI

---

# 1. JACÓ DREAM RENTALS (Liliana)

## Resumen
- **Negocio:** Alquiler de villas de lujo en Jacó, Costa Rica
- **Canal:** WhatsApp + Instagram
- **Propiedad insignia:** Vida Palace (18 personas max)
- **Total propiedades:** 7 villas
- **Estado:** En producción, iteraciones constantes

## Arquitectura Final
```yaml
Tipo: AGENTE ÚNICO simplificado
Agente: "Liliana" (Property Agent)
Modelo: GPT-4o-mini (funciona por ser agente único con RAG)
Memory: Window Buffer 10 mensajes
Tools: RAG_JACO (información de propiedades unificada)
Multiidioma: ES/EN/PT/FR/DE (detectado por classifier)
```

## Componentes
1. **Classifier/Extractor** - Detecta idioma, nuevo mensaje vs continuación, extrae info (personas, fechas, propiedad mencionada). Output JSON puro.
2. **Property Agent "Liliana"** - Agente único que maneja 100% del tráfico. ~4,200+ chars (v14). Personalidad de dueña de la empresa.
3. **Handoff Analyzer** - Detecta cuándo pasar a Liliana humana (frustración, objeciones persistentes, solicitudes específicas).
4. **Message Formatter** - Formatea respuestas, corta mensajes largos para WhatsApp.

## Decisiones Clave y Por Qué
- **Sin APIs de precio/disponibilidad** → No existen. Redirigir a links de cada propiedad es la estrategia (presentar como ventaja, no limitación)
- **Agente único en vez de multi-agent** → El negocio es simple: mostrar propiedades y guiar a reserva. No necesita agentes separados.
- **Siempre promocionar Vida Palace primero** → Es la propiedad premium. Incluso para grupos pequeños, mostrarla como aspiracional.
- **NUNCA confirmar disponibilidad** → El bot no tiene acceso a calendarios reales. Decir "está disponible" es inventar información.
- **NUNCA dar precios exactos** → Solo puede decir "los precios están en el link". Precios son dinámicos.

## Reglas de Negocio Críticas (Última versión Abril 2026)
```yaml
Capacidades de propiedades:
  Vida Palace: MÁXIMO 18 personas (NUNCA decir 20)
  Zen Villa 3: MÁXIMO 16 personas (NUNCA decir 20)
  Zen Villa 2: hasta 6 personas
  Vida Studio: hasta 6 personas
  Zen Villa 4: hasta 6 personas
  Zen Villa 1: hasta 12 personas
  Casa Tranquility: para grupos 13+

Propiedades ELIMINADAS (no mencionar):
  - Casa Mojito (ya no existe)

Recomendaciones por tamaño:
  3-6 personas: Zen Villa 2, Vida Studio, Zen Villa 4
  7-12 personas: Zen Villa 1
  13-16 personas: Zen Villa 3 (16) y Vida Palace (18)
  17-18 personas: Solo Vida Palace
  19+ personas: Combinar propiedades

Política de noches mínimas:
  Viernes/Sábado: mínimo 2 noches
  Domingo-Jueves: 1 noche permitida

Privacidad:
  - NUNCA compartir dirección exacta de villas
  - Solo referencias generales de zona hasta después de reserva confirmada

Links de Airbnb:
  - SÍ compartir si el usuario pregunta explícitamente
  - No ofrecerlos proactivamente
```

## Evolución del Proyecto (Timeline)
1. Nov 2025: Diseño inicial desde cero, arquitectura multi-componente
2. Nov 2025: Mejoras en routing, sistema de notificaciones 3 niveles, formato natural sin bold/emoji
3. Feb 2026: v14 del Property Agent con 13 mejoras específicas. Capacidades corregidas.
4. Abr 2026: Reglas de privacidad (no dar direcciones), política noches mínimas weekend, links Airbnb, capacidades definitivas.

## Aprendizajes Clave
- Controlar el crecimiento del prompt (v14 = +5.8% tamaño vs original)
- Recomendaciones por tamaño exacto > rangos amplios (no mezclar villa de 6 con villa de 20)
- Links de propiedades = experiencia positiva si se presentan bien
- El bot debe EDUCAR el proceso de reserva (usuarios no saben cómo funciona el sitio web)

---

# 2. DESARROLLOS ECOLÓGICOS / CONDOMINIUM EL CANAL

## Resumen
- **Negocio:** Proyecto inmobiliario - condominio sostenible
- **Ubicación:** Grecia, Costa Rica (faldas del Poás)
- **Canal:** WhatsApp (Evolution API)
- **CRM:** Airtable
- **Inventario:** Google Sheets (live queries)
- **Agendamiento:** Calendly → luego WhatsApp directo
- **Estado:** En producción, múltiples iteraciones

## Arquitectura (Última versión - Marzo 2026)
```yaml
Tipo: MULTI-AGENTE MODULAR (simplificado)
Componentes: 3 (reducido desde 4)

1. MESSAGE CLASSIFIER (LLM-based):
   - Routing a 2 destinos: EVA_PRINCIPAL o AGENTE_INVENTARIO
   - Extrae 10 campos de información del historial
   - Output JSON puro

2. EVA PRINCIPAL (80% tráfico):
   - Discovery y calificación BANT conversacional
   - ~4,200 caracteres
   - Descalificación elegante <$100K
   - Comparte WhatsApp de vendedor directamente al calificar

3. AGENTE INVENTARIO (20% tráfico):
   - Consultas de disponibilidad y precios
   - Google Sheets integration
   - ~1,500 caracteres
   - También comparte WhatsApp de vendedor cuando aplica

ELIMINADO: Agente de Agendamiento/Derivación (redundante)
```

## Campos que Extrae el Classifier
```json
{
  "nombre": "string",
  "email": "valid@email.com",
  "origen_lead": "FB | IG | Google | Referidos | Driving | Portal_inmobiliario | Otro",
  "presupuesto": "<100K | 100K-130K | 130K-150K | 150K-200K | >200K",
  "tipo_propiedad": "Apartamento | Vivienda",
  "timeline": "0-3 meses | 3-6 meses | Más de 6 meses",
  "proposito": "Vivir | Inversión",
  "bebida": "Café | Agua | Jugo Natural | Otro",
  "conversacion_count": 0
}
```

## Reglas de Negocio Críticas
```yaml
Calificación:
  - Presupuesto mínimo: $100K USD (descalificar elegantemente si menor)
  - Conversión automática: ₡500 = $1 USD
  - "millones" = colones automáticamente, "K" = dólares
  - NO preguntar "¿colones o dólares?" si es obvio del contexto

Descalificación elegante:
  - Presupuesto <$100K: "Los precios arrancan desde $117K. Puedo pasarte info para que lo consideres a futuro."
  - Busca alquiler: "Somos un proyecto de venta. Para alquiler te recomiendo [alternativa]."
  - No interesado en Grecia: "Entiendo, nuestra ubicación es en Grecia específicamente."

Vendedores (Round-Robin):
  - Mario Rodriguez: horas pares
  - Mauricio Monge: horas impares
  - Links: wa.me/506XXXXXXXX (usar links oficiales wa.me, no terceros)
  - Presentar como "tu asesor de inversión" en primera mención

Visitas:
  - Preguntar preferencia de bebida ANTES del link/contacto
  - Opciones: Café, Agua, Jugo Natural, Otro

Diferenciadores del proyecto:
  - Cascada natural dentro del condominio
  - 60% áreas verdes preservadas
  - 20,000+ m² áreas verdes, 25,000 plantas
  - Sendero 1 km junto al río
  - Piscina vista panorámica
  - Amenidades: gimnasio, yoga, sauna, surfskate, huerta comunal
  - Mascotas permitidas (con restricciones)
```

## Evolución del Proyecto
1. Dic 2025: Diseño inicial 4 agentes. Optimización de flujo de 22 mensajes.
2. Dic 2025: Fixes críticos - Eva preguntaba nombre dos veces, pedía aclaración de moneda innecesaria, preguntaba días/horas sin tener acceso a calendario.
3. Dic 2025: Classifier con extracción de datos, round-robin JavaScript, descalificación elegante.
4. Ene 2026: Propuesta de lead nurturing para reactivar leads dormidos.
5. Feb 2026: Transición de Calendly a WhatsApp directo. Eva menos pushy, más consultiva.
6. Mar 2026: Eliminación del agente de Derivación. Classifier simplificado a 2 rutas. Round-robin por hora.

## Aprendizajes Clave
- En n8n, cada agente responde directamente al usuario — NO hay chaining de agentes en un solo turno
- "Te voy a pasar el contacto" + esperar = UX ROTO. Dar el contacto EN EL MISMO mensaje.
- Classifier con demasiadas rutas = confusión. Máximo 2-3 destinos.
- Token limit del classifier demasiado bajo = JSON vacío/cortado
- Preguntas de validación (bebida) son oportunidad para humanizar

---

# 3. SMARTCHECK COSTA RICA

## Resumen
- **Negocio:** Inspecciones pre-compra de vehículos usados
- **Canal:** WhatsApp (Evolution API)
- **Técnico:** Esteban (handoff humano para coordinar inspección)
- **Estado:** En producción, optimizaciones continuas

## Arquitectura
```yaml
Tipo: AGENTE PRINCIPAL + CLASSIFIER/ORQUESTADOR
Componentes: 2

1. CLASSIFIER/ORQUESTADOR:
   - Routing entre agente y handoff humano
   - Extrae datos del vehículo y cliente
   - Trigger handoff cuando se cumplen condiciones
   - Output JSON con datos estructurados

2. AGENTE SMARTCHECK (principal):
   - Flujo adaptativo de calificación
   - ~prompts optimizados (reducción 30% de redundancia)
   - Pricing en colones
```

## Flujo de Conversación
```
1. Saludo + preguntar año del vehículo
   → Si <2012: rechazar con contacto de técnico externo
   → Si ≥2012: continuar

2. Capturar: marca, modelo, nombre del usuario
   (ADAPTATIVO: si da todo junto, no re-preguntar)

3. Dar precio según categoría:
   - Sedan: ₡59.000
   - SUV/Crossover/Pickup: ₡64.000 - ₡69.000
   - Premium: precio a confirmar
   NUNCA en dólares — SIEMPRE en colones

4. Preguntar ubicación del vehículo

5. Confirmar interés ("¿Listo para que el técnico te contacte?")

6. Si necesita factura → capturar: cédula + correo electrónico + actividad comercial

7. Handoff a Esteban (técnico)
```

## Reglas de Negocio Críticas
```yaml
Vehículos:
  - Año mínimo: 2012 (lista explícita: 2012-2026 válidos)
  - "veo que querés REVISAR un..." (NO "veo que tenés un..." — son compradores, no dueños)
  - Si da múltiples datos juntos → extraer todo, no re-preguntar
  - Si da solo marca sin modelo → preguntar modelo
  - Si da solo modelo sin año → preguntar año

Precios:
  - SIEMPRE en colones costarricenses (₡)
  - NUNCA dar precios en dólares
  - Categorías: sedan, suv_pickup, premium
  - Precio incluye IVA
  - Descuento a partir del tercer vehículo

FAQs clave:
  - Duración: ~1 hora
  - Pago: Sinpe y transferencia (no tarjeta)
  - Garantía: No emiten garantías post-revisión
  - 150+ puntos de revisión con fotos e informe detallado
  - NO hacen pruebas de compresión ni presión de cilindros
  - No trabajan domingos (L-S)
  - No factura electrónica actualmente (en proceso)

Rechazo (año <2012):
  - Dar contacto de técnico externo: Johan Andrés Coles Venegas +506 7143 6373
  - Aclarar: SmartCheck NO tiene relación comercial con él
  - FIN de conversación
```

## Campos Pendientes de Implementar
```yaml
Post-confirmación de precio, pre-billing:
  - Transmisión (automático/manual)
  - Tipo de motor (gasolina/diesel/híbrido/eléctrico)
  - Tracción (4x2/4x4)
  - Origen del vehículo (nacional/importado)
  - Condición (nuevo/usado)
  - Fuente del lead (cómo nos encontró)
```

## Aprendizajes Clave
- Redundancia masiva en anti-repetición = desperdicio de tokens. Consolidar en 1 regla clara.
- ASCII diagrams en prompts = cuestionable valor para LLMs
- Cambiar de USD a colones requiere actualizar TODOS los puntos del prompt (no solo uno)
- Bot confundía "querés revisar" (comprador) con "tenés" (dueño) — detalles de framing importan
- Si el usuario pausa para consultar/coordinar → cerrar cordialmente, NO continuar el flujo

---

# 4. DR. CARLOS HERNÁNDEZ

## Resumen
- **Negocio:** Consultorio médico (ortodoncia/dental)
- **Canal:** Instagram DM (via ManyChat → n8n)
- **CRM:** Airtable
- **Agendamiento:** Calendly
- **Notificaciones:** Discord
- **Estado:** Reconstruido desde cero (se perdieron automatizaciones previas)

## Arquitectura
```yaml
Tipo: MULTI-AGENTE (3 agentes + classifier)
Stack: ManyChat (IG) → n8n (lógica) → Airtable + Calendly + Discord

1. CLASSIFIER (LLM):
   - Output JSON con 3 destinos: DR_CARLOS, AGENTE_OBJECIONES, HANDOFF_HUMANO
   - Detecta emergencias con keywords expandidos
   - Regla: CTA "SILENCIO" = ignorar (no tratar como nombre)

2. AGENTE PRINCIPAL "Dr. Carlos":
   - Se presenta como el doctor (nunca revela que es bot)
   - Mensaje de apertura fijo
   - Sistema de scoring 5 criterios (0-5 puntos):
     * Tiene diagnóstico previo
     * Presenta síntomas específicos
     * Ha buscado tratamiento antes
     * Edad/perfil demográfico apropiado
     * Nivel de interés/urgencia
   - Contenido educativo condicional (solo awareness score 1-2)
   - Closing pitch completo ANTES del link de Calendly
   - URL de Calendly hardcoded en prompt

3. AGENTE DE OBJECIONES (LAARC):
   - 4 tipos específicos + catch-all:
     * Precio/costo
     * Miedo/dolor
     * Tiempo/duración del tratamiento
     * Desconfianza/segunda opinión
   - Respuestas con framework LAARC completo

Handoff = bot simplemente DEJA DE RESPONDER (sin mensaje al usuario)
```

## Calificación de Leads
```yaml
Sistema de scoring 0-5:
  Hot (4-5): Enviar Calendly inmediatamente
  Warm (2-3): Educar + Calendly
  Cold (0-1): Descalificar elegantemente

Descalificación requiere:
  - NO tiene diagnóstico Y NO tiene síntomas (ambas condiciones)
  - Solo "no tiene diagnóstico" NO es suficiente para descalificar
```

## Notificaciones Discord (String Detection)
```yaml
Templates:
  1. Escalación (handoff): Trigger cuando bot deja de responder
  2. Calendly enviado: Detectar "calendly.com" en respuesta
  3. Descalificación: Detectar frase de descalificación
  4. Referral WhatsApp: Detectar "wa.me/" en respuesta

Método: String detection en output del agente — NO requiere JSON estructurado del agente
```

## Aprendizajes Clave
- Keywords de emergencia deben ser exhaustivos (se pasó un caso en testing)
- El opening CTA de ManyChat ("SILENCIO" u otros) debe ser regla de ignore explícita
- Contenido educativo solo para awareness bajo (1-2), no para todos
- Closing pitch ANTES del link — no solo tirar el link
- Follow-up automations van en workflow SEPARADO, no en el bot principal

---

# 5. MICROCRÉDITOS GRANDIT (Alexa)

## Resumen
- **Negocio:** Microfinanzas / préstamos en Costa Rica
- **Canal:** WhatsApp
- **Objetivo:** Llevar al usuario a completar formulario de solicitud
- **Estado:** Optimizado y en producción

## Arquitectura
```yaml
Tipo: AGENTE ÚNICO ultra-simple
Agente: "Alexa"
Prompt original: ~4,800 chars → Optimizado a ~3,200 chars
Modelo: GPT-4o-mini (suficiente para flujo simple)
```

## Problema Original y Solución
```yaml
PROBLEMA:
  Bot pedía nombre → cédula → tipo de crédito ANTES de dar el link del formulario
  = Usuarios abandonaban antes de recibir el formulario
  = Conversión bajísima

SOLUCIÓN:
  Enviar link del formulario INMEDIATAMENTE en el primer mensaje
  "¡Hola! Soy Alexa, para saber si calificás completá este formulario (2 min): [URL]"
  = Eliminar toda fricción pre-formulario
  = El formulario ya captura todos los datos necesarios

RESULTADO:
  - Prompt reducido de 4,800 a 3,200 chars
  - Eliminadas secciones redundantes
  - FAQs acortados a 2-3 líneas
  - Flujo ultra-directo
```

## Aprendizajes Clave
- Si el mismo formulario se usa para todos → NO preguntar datos antes del formulario
- URLs con variables no resueltas en producción = error fatal
- Instrucciones repetidas 3-4 veces en el prompt = desperdicio + confusión
- Inconsistencia entre "misión" y "flujo" del prompt = bot confundido
- A veces la optimización más poderosa es QUITAR pasos, no agregar

---

# 6. LEVEL - ASESORÍA DE INVERSIONES (LEO)

## Resumen
- **Negocio:** Asesoría financiera / inversiones
- **Canal:** WhatsApp (YCloud - oficial)
- **CRM:** Notion
- **Agendamiento:** Calendly (calendly.com/kenvarela/asesoria)
- **Equipo:** Ken Varela (asesor) + Valeria (setter)
- **Estado:** En planificación/onboarding

## Arquitectura Planificada
```yaml
Tipo: BOT CON DOS MODOS
Bot: "LEO" (semi-formal, español + inglés si cliente inicia)
Canal: YCloud (WhatsApp oficial con App Coexistence)
CRM: Notion (base de leads existente)
Agendamiento: Calendly

MODO REACTIVO (Inbound):
  Lead escribe → LEO califica → agenda sesión → notifica a Ken/Valeria

MODO PROACTIVO (Outbound):
  Notion → n8n segmenta → YCloud envía template → Si responde → LEO activo
```

## Flujo Proactivo Diseñado
```yaml
SEGMENTACIÓN:
  Grupo A (Tibios): Contacto reciente, monto registrado → CTA directo a Calendly
  Grupo B (Fríos): Sin contacto >3 meses → Valor primero, luego CTA

SECUENCIA TIBIOS:
  Día 0: "Soy LEO de Level. Ken quiere retomar contacto. ¿15 min esta semana? [Calendly]"
  Día 3 (si no respondió): Recordatorio suave + monto aproximado de Notion
  Si responde → LEO toma conversación y califica

SECUENCIA FRÍOS:
  Día 0: Dato educativo sobre inversiones 2025 (valor primero)
  Día 1: Dato corto + CTA suave a Calendly
  Día 5: Cierre elegante + pregunta abierta

ARQUITECTURA TÉCNICA:
  Notion → n8n (segmenta) → YCloud (template Meta) → Si responde → LEO → Si agenda → notifica
```

## Decisiones de Stack
```yaml
YCloud seleccionado sobre ManyChat porque:
  - Solo necesitan WhatsApp
  - App Coexistence (Ken sigue usando WhatsApp normal)
  - 0% markup en mensajes (solo paga tarifas Meta)
  - Nodo nativo en n8n
  - Mejor para broadcasts proactivos
  - Shared inbox para Ken/Valeria
```

## Calificación de Lead
```yaml
Lead bueno:
  - Capital ≥ ₡5M
  - Interés real en inversión
  - Dispuesto a agendar sesión gratuita

Horario atención:
  - L-S 6:30am - 7:30pm
```

---

# 7. 97 DISPLAY (Referencia Externa de n8n Community)

## Resumen
- **Tipo:** Agencia de marketing digital para gimnasios/artes marciales
- **Fuente:** community.n8n.io template documentado
- **Relevancia:** Ejemplo de intake flow estructurado

## Arquitectura
```yaml
Workflow:
  Chat Trigger → AI Agent (GPT-4o) → Window Buffer (10 msgs)
  Tools: Google Sheets (append leads) + HubSpot (CRM) + Gmail (notificación)

Agente: "Ray" (male, friendly, witty)
Intake: 8 preguntas secuenciales obligatorias
```

## Intake Flow (Referencia)
```
1. First name
2. Last name
3. Email
4. Phone number
5. Business name
6. Website (si/no + dominio)
7. Industry
8. Goals
→ Después de capturar: usar first name en toda la conversación
```

## Relevancia para Momentum AI
- Ejemplo de Google Sheets como CRM simple (appendOrUpdate matching por Email)
- Personalidad casual pero profesional como referencia de tono
- Deflection rule: si usuario habla de algo no relacionado → redirigir amablemente
