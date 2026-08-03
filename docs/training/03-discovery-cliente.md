# 03 — Discovery con el cliente

El discovery es la conversación de 15-30 minutos en la que se extrae del cliente toda la información necesaria para diseñar el chatbot. Es la fase donde se cometen los errores más caros: lo que no se pregunta aquí, se descubre cuando el bot ya está en producción.

---

## 1. Objetivos del discovery

El discovery termina con un archivo `clients/{cliente}/discovery.json` que contiene todos los datos para que el resto del pipeline pueda ejecutarse sin necesidad de volver a contactar al cliente. Específicamente:

- **Definición del negocio**: qué vende, a quién, por qué su producto es diferente
- **Proceso de venta actual**: cómo califican leads hoy, cuál es el ciclo, qué objeciones reciben
- **Acción objetivo**: qué quiere el cliente que el bot logre (agendar, calificar, vender, derivar)
- **Restricciones de negocio**: qué el bot NO puede prometer
- **Materiales disponibles**: qué links/recursos puede compartir el bot
- **Accesos técnicos**: canales, CRMs, sistemas conectables
- **Operación del handoff**: quién recibe leads, cuándo, cómo

---

## 2. Framework de 15 minutos (3 fases)

### 2.1 Fase 1 — Entender el negocio (5 min)

Cinco preguntas obligatorias:

1. **"¿Qué vende [empresa] y a quién?"** → producto + perfil del cliente ideal
2. **"¿Cuál es el ticket promedio?"** → determina complejidad de venta y modelo LLM
3. **"¿Ciclo de venta típico?"** → días/semanas/meses (impacta cuántos turnos manejar)
4. **"¿Principal diferenciador vs competencia?"** → qué destacar en el prompt del agente
5. **"¿Volumen actual de consultas?"** → dimensiona la solución y el costo operativo

**Señales a captar:**
- Si el ticket es <$500 USD: probable GPT-4o-mini, agente único o + objeciones
- Si el ticket es >$500 USD: probable GPT-4.1-mini o GPT-4o, multi-agente
- Si el volumen es <5 chats/semana: cuestionar si vale la pena el proyecto
- Si el cliente no puede articular el diferenciador: red flag de definición de negocio

### 2.2 Fase 2 — Mapear proceso de ventas (5 min)

1. **"¿De dónde vienen los leads?"** → ads, orgánico, referidos, eventos
2. **"¿Qué preguntan primero?"** → los Top 5 que el bot debe responder bien
3. **"¿Cuáles son las objeciones más comunes?"** → Top 3 (precio, timing, miedo, otros)
4. **"¿Qué los convence de comprar/agendar?"** → demo, casos de éxito, prueba gratis
5. **"¿Cómo cierran actualmente?"** → llamada, email, compra directa, visita presencial

**Señales a captar:**
- Si las objeciones comunes son >3 → necesitará Agente de Objeciones (LAARC)
- Si las preguntas top son de inventario/disponibilidad → tool de Google Sheets o RAG
- Si el cierre requiere humano → diseñar handoff cuidadosamente
- Si el cliente no tiene proceso de ventas formal → el bot tendrá que enseñarles a operarlo

### 2.3 Fase 3 — Decisiones técnicas (5 min)

En base a las respuestas de las fases 1 y 2, decidir junto al cliente:

- **Canal**: WhatsApp (Evolution/YCloud), Instagram (ManyChat), Telegram (solo demos)
- **CRM**: existente (Airtable/HubSpot/Notion) o nuevo (Google Sheets simple)
- **Agendamiento**: Calendly (recomendado) o WhatsApp directo a vendedores
- **Notificaciones**: Discord, Slack, WhatsApp grupal del equipo
- **Stack del bot** (decisión del implementador): número de agentes, modelo LLM, tools

---

## 3. Checklist completo de onboarding

Este es el checklist exhaustivo. No se cierra el discovery hasta que todos los items tengan respuesta o status (Sí/No/Pendiente).

### 3.1 Información del negocio

- [ ] Descripción del producto/servicio en 1-2 líneas
- [ ] Cliente ideal: perfil demográfico (edad, nivel socioeconómico, ubicación)
- [ ] Cliente ideal: perfil psicográfico (qué quiere, qué teme, qué valora)
- [ ] Ticket promedio y rango de precios
- [ ] Ciclo de venta típico (días/semanas/meses)
- [ ] Top 5 preguntas frecuentes que reciben
- [ ] Top 3 objeciones comunes
- [ ] Diferenciador clave vs competencia (en 1 frase)
- [ ] Volumen actual de consultas (por día/semana)
- [ ] Tipo de negocio: B2C / B2B / B2B2C

### 3.2 Contenido para el bot

- [ ] Documentos de servicios/productos disponibles (PDFs, brochures)
- [ ] Lista de precios actualizada (o rangos si los precios son dinámicos)
- [ ] Políticas relevantes (reembolsos, tiempos, restricciones, garantías)
- [ ] FAQs documentadas (si las tienen)
- [ ] Casos de éxito o testimonios disponibles
- [ ] **Material descargable con link compartible** (CRÍTICO: si no hay link, el bot no puede prometer ese material — ver [Cap 01 §3.2](01-filosofia-metodologia.md))

### 3.3 Accesos técnicos

- [ ] Email empresarial con dominio del website (necesario para YCloud)
- [ ] Canal de mensajería elegido:
  - WhatsApp: número del negocio, quién tiene la SIM/dispositivo
  - Instagram/Facebook: acceso a la cuenta, posiblemente cuenta de ManyChat
- [ ] CRM actual o decisión de crear uno nuevo
- [ ] Calendly o sistema de citas (acceso o crear)
- [ ] Si tiene website: dominio, plataforma (WordPress, Webflow, custom)

### 3.4 Operación y handoffs

- [ ] ¿Quién recibe leads calificados? (nombre, contacto, canal preferido)
- [ ] Horario de atención humana
- [ ] ¿Qué pasa fuera de horario? (bot deja mensaje? toma datos? deriva?)
- [ ] Criterio de calificación: ¿qué hace a un lead "bueno" para esta empresa?
- [ ] ¿Hay script de ventas que el equipo use actualmente?
- [ ] Si tiene múltiples vendedores: ¿cómo asignar? (round-robin, geográfico, por especialidad)

### 3.5 Tono y personalidad

- [ ] ¿Nombre del bot? (recomendado: nombre propio humano)
- [ ] Tono: formal, semi-formal, casual
- [ ] Idioma o mezcla (español, inglés, ambos)
- [ ] ¿Se hace pasar por humano o se identifica como bot?
- [ ] ¿Hay emojis aceptables? ¿Cuáles evitar?

### 3.6 Restricciones legales y de negocio

- [ ] ¿Qué el bot NUNCA debe prometer? (precios exactos, disponibilidad, descuentos no autorizados)
- [ ] ¿Hay productos descontinuados que NO debe mencionar?
- [ ] ¿Hay temas que requieren handoff obligatorio? (médicos, legales, financieros sensibles)
- [ ] ¿Existe disclaimer legal que debe aparecer en alguna fase?
- [ ] ¿Datos personales que NO se pueden almacenar?

### 3.7 Métricas y KPIs

- [ ] ¿Cómo mide éxito hoy el cliente? (conversaciones, leads, ventas)
- [ ] ¿Qué métrica del bot le importaría más? (volumen, calificación, conversión)
- [ ] ¿Quiere dashboard? ¿Quién lo va a ver?

---

## 4. Lo que más se escapa (4 cosas críticas)

Estos puntos se olvidan en 80% de los discoveries iniciales y luego generan retrabajo. Hay que preguntar explícitamente:

### 4.1 Accesos al canal

**Preguntar:** "¿Quién tiene físicamente el celular o la SIM del WhatsApp del negocio? ¿Pueden cederlo durante 1-2 días para el setup?"

**Por qué importa:** WhatsApp Evolution requiere escanear un QR code con el dispositivo, lo que implica acceso físico. YCloud requiere verificación con un código que llega al número. Si nadie sabe quién tiene acceso, el setup se atasca.

### 4.2 Definición clara del handoff

**Preguntar:**
- "Cuando el bot identifica un lead listo para comprar, ¿a quién específicamente le llega? ¿Por qué medio?"
- "Si esa persona no está disponible, ¿quién es el backup?"
- "¿Cuánto tiempo máximo aceptable entre que el bot pasa el lead y un humano responde?"

**Por qué importa:** un handoff sin proceso claro destruye la conversión. El bot puede calificar perfectamente pero si el lead espera 6 horas a un humano, abandona.

### 4.3 Templates de WhatsApp aprobados (si aplica)

**Preguntar:** "¿Vas a usar WhatsApp Business API oficial o Evolution? Si oficial, ¿tenés templates aprobados por Meta?"

**Por qué importa:** YCloud (BSP oficial) requiere templates (HSM) aprobados por Meta para iniciar conversaciones fuera de la ventana de 24h. El proceso de aprobación toma 24-48h. Si el cliente quiere mensajes proactivos/broadcast y no tiene templates, hay que crearlos y esperar.

### 4.4 Diferencia entre "lo que el bot puede prometer" y "lo que no"

**Preguntar:** "Si el bot le dice a un cliente 'el precio es $500' y luego resulta que para ese cliente específico es $600, ¿quién asume la diferencia?"

**Por qué importa:** define qué información puede compartir el bot literal vs solo redirigir a un link. Caso Air Canada ([Cap 01 §3.1](01-filosofia-metodologia.md)) es el precedente: la empresa fue legalmente responsable de lo que su chatbot prometió.

---

## 5. Output del discovery: `discovery.json`

El discovery termina con un archivo JSON estructurado en `clients/{cliente}/discovery.json`. Schema:

```json
{
  "cliente": {
    "nombre": "Nombre del negocio",
    "industria": "real_estate|clinica|asesoria|microfinanzas|...",
    "ubicacion": "Costa Rica - Provincia",
    "contacto_principal": {
      "nombre": "...",
      "rol": "...",
      "whatsapp": "+506..."
    }
  },
  "negocio": {
    "descripcion": "1-2 lineas",
    "cliente_ideal": "descripcion demografica + psicografica",
    "ticket_promedio_usd": 5000,
    "ciclo_venta_dias": 30,
    "diferenciador": "...",
    "volumen_consultas_semana": 50
  },
  "ventas": {
    "origen_leads": ["Facebook Ads", "Google Ads", "Referidos"],
    "top_preguntas": ["precio", "ubicacion", "financiamiento", "...", "..."],
    "top_objeciones": ["es muy caro", "lo voy a pensar", "no es el momento"],
    "convince_factor": "case studies + visita presencial",
    "cierre_actual": "visita a oficina + firma contrato"
  },
  "bot": {
    "nombre": "Eva|LEO|Liliana|...",
    "tono": "semi-formal-cr",
    "idioma_principal": "es",
    "idiomas_adicionales": ["en"],
    "objetivo_principal": "calificar leads y derivar a vendedor",
    "se_identifica_como_bot": false
  },
  "restricciones": {
    "nunca_promete": [
      "precios exactos por unidad",
      "disponibilidad confirmada",
      "descuentos sin autorizacion"
    ],
    "productos_eliminados": ["nombre1"],
    "temas_handoff_obligatorio": ["legal", "tecnico", "post-venta"],
    "disclaimer_legal": null
  },
  "materiales": {
    "links_compartibles": [
      {
        "tipo": "calendly",
        "url": "https://calendly.com/...",
        "uso": "agendar visita"
      },
      {
        "tipo": "catalogo_web",
        "url": "https://...",
        "uso": "ver propiedades"
      }
    ],
    "sin_link_no_prometer": ["brochure PDF antiguo", "video de tour"]
  },
  "stack": {
    "canal": "whatsapp_ycloud",
    "crm": "airtable",
    "agendamiento": "calendly",
    "notificaciones": "discord",
    "credenciales_disponibles": {
      "ycloud_api_key": false,
      "airtable_pat": true,
      "openai_api_key": true,
      "calendly_url": true,
      "discord_webhook": false
    }
  },
  "handoff": {
    "destinatario_principal": "Mario Rodriguez",
    "whatsapp_destinatario": "+506...",
    "horario_atencion": "L-V 8am-6pm",
    "fuera_horario": "bot toma datos y notifica para seguimiento siguiente dia laboral",
    "tiempo_respuesta_objetivo_min": 15
  },
  "criterio_calificacion": {
    "presupuesto_minimo": 100000,
    "moneda": "USD",
    "campos_obligatorios": ["nombre", "presupuesto", "timeline", "proposito"],
    "definicion_lead_calificado": "presupuesto >= minimo + intencion de compra en proximos 6 meses"
  },
  "arquitectura_sugerida": {
    "num_agentes": 2,
    "agentes": ["principal", "objeciones"],
    "modelo_principal": "gpt-4.1-mini",
    "tools": [],
    "complejidad": "media"
  },
  "metricas_target": {
    "conversion_chat_a_lead": 0.35,
    "latencia_max_seg": 3,
    "coherencia_min": 0.95
  },
  "notas_libres": "Observaciones adicionales del discovery"
}
```

Este archivo es input para `/momentum-architect` que genera el `architecture.md`.

---

## 6. Señales de alerta durante el discovery

Estas señales son indicadores de que el proyecto puede ser problemático. No son automáticamente "no aceptar el proyecto" pero requieren conversación adicional con el cliente:

| Señal | Por qué es alerta | Cómo manejarlo |
|---|---|---|
| Cliente no sabe articular su diferenciador | El negocio no tiene posicionamiento claro; el bot no tendrá qué destacar | Trabajar el posicionamiento antes de hacer el bot |
| Cliente quiere "que el bot venda todo" sin handoff | Expectativa irreal; los bots califican, los humanos cierran | Reset de expectativas, explicar caso Air Canada |
| Volumen <5 chats/semana | ROI bajo, el cliente no verá impacto | Cuestionar si es el producto adecuado ahora |
| Cliente no tiene CRM ni proceso de leads documentado | El handoff fallará por falta de organización en el equipo del cliente | Incluir Google Sheets básico como parte del scope |
| Cliente quiere bot multilingüe sin razón de negocio clara | Aumenta complejidad sin valor; cada idioma requiere testing separado | Empezar con un idioma, agregar después si hay demanda |
| Cliente menciona "templates de Meta" pero no tiene aprobados | Tiempo de aprobación 24-48h, puede atrasar lanzamiento | Iniciar proceso de aprobación día 1 del proyecto |
| Cliente quiere que el bot maneje pagos directos | Riesgo legal alto (caso Chevy); fuera del scope del producto | Limitar al envío del link de pago, sin manejar la transacción |
| El "diferenciador" del cliente es "precio bajo" | El bot que vende por precio compite mal vs e-commerce; el chatbot brilla en venta consultiva | Re-pensar si chatbot es la herramienta correcta |

---

## 7. Discovery iterativo

El discovery no siempre termina en una sola sesión. Puede tener fases:

1. **Sesión inicial (30 min)** — completar campos obligatorios del discovery.json
2. **Recolección de materiales** — cliente envía PDFs, links, FAQs durante 2-3 días
3. **Sesión de validación (15 min)** — revisar materiales recibidos, completar gaps
4. **Decisión de arquitectura** — cuando el discovery.json esté >90% completo

**Regla:** no avanzar a generación de prompts si el discovery está <80% completo. Lo que falta se inventará, y el inventar es la fuente de errores.

---

## 8. Plantilla de preguntas para el discovery

Usar este script como guía. No leer literal — adaptarlo a la conversación, pero asegurarse de que todas las áreas queden cubiertas.

```
APERTURA (2 min)
- Gracias por el tiempo. Hoy quiero entender bien tu negocio y tu proceso 
  de ventas para diseñar el bot correctamente. Voy a hacerte una serie 
  de preguntas, algunas pueden parecer básicas pero son importantes.

NEGOCIO (5 min)
- Cuéntame en 1-2 frases qué vende [empresa] y a quién.
- ¿Cuál es el ticket promedio de una venta?
- ¿Cuánto tiempo pasa típicamente entre primer contacto y cierre?
- ¿Qué te diferencia de tu competencia más fuerte?
- ¿Cuántas consultas recibís hoy por semana?

VENTAS (5 min)
- ¿De dónde vienen tus leads? (canales)
- Cuando alguien te escribe, ¿qué pregunta primero la mayoría?
- ¿Cuáles son las 3 objeciones más comunes que recibís?
- ¿Qué los convence cuando dudan?
- ¿Cómo cerrás la venta hoy? (call, visita, email)
- ¿Tenés un script o proceso de ventas que el equipo siga?

OPERACIÓN (3 min)
- Cuando el bot identifique un lead listo, ¿a quién le llega?
- ¿Por qué canal? (WhatsApp grupal, Discord, email)
- ¿Cuál es el horario de atención humano?
- ¿Y fuera de horario?
- ¿Hay backup si la persona principal no está?

MATERIALES Y RESTRICCIONES (3 min)
- ¿Tenés PDFs, brochures, lista de precios para que el bot pueda consultar?
- ¿Tenés Calendly o sistema de citas?
- ¿Qué NO querés que el bot prometa o diga jamás?
- ¿Hay productos o servicios que ya no ofreces y no debería mencionar?

PERSONALIDAD (2 min)
- ¿Cómo querés que se llame el bot?
- ¿Querés que se identifique como bot o que se haga pasar por humano?
- ¿Tono más formal o casual? ¿Más cálido o profesional?
- ¿Algún emoji que te encante o que odies?

CIERRE (5 min)
- ¿Qué métrica te importaría más después de 30 días? 
  (volumen de conversaciones, leads calificados, ventas cerradas)
- Voy a procesar todo esto y te mando una propuesta de arquitectura 
  para revisar antes de empezar a construir.
```

---

## 9. Después del discovery

Con el `discovery.json` completo, los siguientes pasos del pipeline son automáticos o semi-automáticos:

1. **`/momentum-architect`** lee el discovery y genera `architecture.md`
2. **Revisión humana** del architecture.md con el cliente (opcional pero recomendado para proyectos grandes)
3. **`/momentum-prompt-gen`** genera los prompts individuales
4. **Revisión humana** de los prompts antes de pasar al workflow
5. **`/momentum-n8n-builder`** configura el workflow
6. **Testing interno** con el workflow TEST
7. **Demo con cliente** usando el workflow TELEGRAM
8. **Ajustes finales** quirúrgicos basados en feedback
9. **Deploy a producción**
10. **`/momentum-delivery`** genera el documento de entrega
11. **Monitoreo intensivo semana 1**

Detalles operativos de cada paso en los capítulos correspondientes.

---

**Siguiente:** [Capítulo 04 — Diseño de prompts](04-diseno-prompts.md)

**Anterior:** [Capítulo 02 — Arquitectura modular](02-arquitectura-modular.md)
