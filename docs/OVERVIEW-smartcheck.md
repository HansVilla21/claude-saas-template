# SmartCheck — Documento General

> Resumen del negocio, el servicio y el sistema construido a la fecha. Sirve como base de contexto para evaluar nuevas implementaciones.

---

## 1. ¿Qué es SmartCheck?

SmartCheck es un servicio de **revisión técnica pre-compra de vehículos usados** en Costa Rica. El objetivo del negocio es simple: antes de que alguien compre un carro usado, SmartCheck lo revisa a fondo para que el comprador sepa el estado real del vehículo y no se lleve sorpresas costosas.

La cara operativa del negocio es **Esteban**, el técnico que realiza las revisiones. Trabaja en campo (va a donde está el vehículo), por lo que pasa la mayor parte del día en la calle con poco tiempo para responder mensajes — ese es el contexto que motivó la automatización.

---

## 2. ¿Qué hace? (el servicio)

- **Revisión de 150+ puntos** del vehículo: mecánicos, eléctricos y de seguridad.
- **Prueba de manejo** incluida — el técnico maneja el vehículo para evaluar su comportamiento real.
- **Verificación de kilometraje** (con restricciones — depende de poder hacer el procedimiento con el vehículo presente).
- **Fotos + informe detallado** que se entrega al cliente para que tome la decisión de compra.
- **Duración:** aproximadamente 1 hora.

### Condiciones del servicio
- Solo vehículos **año 2012 o más recientes** (los anteriores se rechazan).
- **Horario:** lunes a sábado. No se trabaja domingos.
- **Pago:** SINPE móvil y transferencia electrónica (no tarjeta).
- **Descuento** a partir del tercer vehículo revisado.
- El precio ya **incluye IVA**.

### Precios de referencia
| Categoría | Precio |
|-----------|--------|
| Sedán / hatchback / compacto | ₡59.000 |
| Crossover / SUV / Pickup | ₡64.000 a ₡69.000 |
| Premium / versiones especiales (híbridos, eléctricos, alta gama) | A confirmar por el técnico |

> El precio final y la disponibilidad los confirma el técnico al coordinar la cita. Si el vehículo está fuera del GAM puede aplicar un cargo adicional, pero eso lo maneja el técnico directamente (el chatbot no lo menciona).

---

## 3. ¿En qué consiste el negocio? (modelo operativo)

```
Anuncio en Facebook/Instagram
        ↓
Cliente escribe por WhatsApp (o Instagram)
        ↓
Chatbot califica el lead y captura datos
        ↓
Handoff a Esteban (técnico)
        ↓
Esteban coordina cita, precio final y pago
        ↓
Cliente paga (SINPE/transferencia) → manda comprobante
        ↓
Revisión del vehículo en sitio
        ↓
Informe entregado al cliente
```

El embudo arranca con publicidad pagada (Meta Ads). Los leads entran al WhatsApp/Instagram del negocio, donde un **chatbot de ventas** los atiende, los califica, les explica el servicio y prepara el handoff. Esteban entra a cerrar (coordinar cita + cobro) y luego ejecuta la revisión.

---

## 4. ¿Cómo trabaja el sistema? (lo que se ha construido)

El corazón del sistema es un **chatbot de ventas** en n8n que atiende WhatsApp e Instagram vía ManyChat, más un conjunto de **automatizaciones de soporte**.

### 4.1 Stack tecnológico

| Componente | Herramienta |
|------------|-------------|
| Orquestación de flujos | n8n (self-hosted en Easypanel) |
| Canal de mensajería | ManyChat (WhatsApp + Instagram) |
| Modelos de IA | OpenAI GPT-4.1-mini (agente), GPT-4o-mini (clasificadores/vision) |
| Memoria de conversación | PostgreSQL |
| CRM de leads | Airtable (base "Gestión de Vehículos", tabla "Vehículos") |
| Notificaciones internas | Telegram (avisos a Esteban) |

### 4.2 Arquitectura del chatbot (flujo principal)

```
Webhook (recibe de ManyChat)
    ↓
Clasificador / Orquestador (Information Extractor)
   - Extrae datos del lead (nombre, marca, modelo, año, ubicación, etc.)
   - Decide routing
   - Marca trigger_handoff (datos completos)
   - Marca trigger_escalation (cliente pide humano o está frustrado)
    ↓
Switch (3 ramas):
   1. trigger_escalation → escalación a humano (Telegram + apaga bot)
   2. trigger_handoff    → handoff a Esteban (apaga bot + mensaje de cierre)
   3. default            → Agente Principal (conversa)
    ↓
Formateador (divide la respuesta en mensajes cortos estilo WhatsApp)
    ↓
Respuesta al cliente vía ManyChat
```

### 4.3 Flujo conversacional del agente

1. Saludo + pregunta **marca, modelo y año** (en un solo mensaje).
2. **Validación de año:** si es <2012, rechazo cordial y fin.
3. Captura el **nombre**.
4. Da el **precio** según categoría + pide **ubicación**.
5. Pregunta si está listo para que el técnico **se ponga en contacto**.
6. Pregunta si necesita **factura electrónica**.
7. Si necesita factura: pide cédula, correo y actividad comercial.
8. **Handoff:** el bot se apaga y el sistema envía el mensaje de cierre. Esteban toma el control.

### 4.4 Automatizaciones de soporte construidas

| Automatización | Qué hace |
|----------------|----------|
| **Seguimientos automáticos** | Reactiva leads que no responden: a las 2h (mensaje generado por IA según el historial), 23h (mensaje fijo) y 48h (template de ManyChat fuera de la ventana de 24h) |
| **Detector de conversaciones cerradas** | Cada 30 min revisa leads activos y, con un LLM, decide si la conversación ya terminó (despedida, handoff hecho, sin interés) para apagar el bot |
| **Automatización A — timer de pago** | Cuando Esteban pone la etiqueta "pendiente pago" en ManyChat, arranca un timer de 45 min y avisa por Telegram si el cliente no manda comprobante |
| **Automatización B — detección de comprobante** | Cuando el cliente manda una imagen, la analiza con OpenAI Vision para ver si es un comprobante de pago y notifica a Esteban por Telegram con los datos extraídos |
| **Automatización C — recordatorio de handoff** | Una vez al día avisa a Esteban de leads que quedaron en handoff sin que les pusiera la etiqueta de pago (red de seguridad) |

### 4.5 Estados que maneja en Airtable

| Campo | Valores | Para qué |
|-------|---------|----------|
| `Chatbot Activado` | Encendido / Apagado | Si el bot responde o no a ese lead |
| `estado_pago` | en_handoff / esperando_comprobante / recibido / expirado | Etapa del proceso de pago |
| `Seguimiento 2h / 23h / 48h` | checkbox | Control de qué seguimientos ya se enviaron |
| Datos del lead | nombre, WhatsApp, ID ManyChat, marca, modelo, año, ubicación, etc. | CRM del lead |

---

## 5. Principios de diseño (metodología Momentum AI)

El chatbot sigue reglas no negociables de la metodología con la que se construyen estos sistemas:

- **Arquitectura modular** — clasificador + agente + formateador, nunca un mega-prompt.
- **Valor primero, datos después** — no se piden datos sensibles antes de demostrar valor.
- **Handoff = el bot se apaga** para ese lead; el humano toma el control.
- **Tono costarricense semi-formal** — "vos", "querés", "tenés".
- **Mensajes cortos** (máx 3-4 líneas), una pregunta por mensaje.
- **Si no sabe, no inventa** — no compromete precios ni disponibilidad.

---

## 6. Estado actual

El sistema está **en producción y funcionando**. Las revisiones y reservas se están gestionando con este flujo. Las automatizaciones de pago y comprobante ya están detectando correctamente (según feedback de Esteban, Telegram avisa cuando un cliente manda comprobante aunque no se haya puesto la etiqueta).

Se itera de forma continua a partir del feedback de conversaciones reales: ajustes de wording, manejo de objeciones, claridad en precios y detección de cuándo escalar a un humano.

---

## 7. Notas para la nueva implementación

*(Sección a completar según el alcance de la nueva propuesta.)*

- Qué problema/oportunidad nueva se quiere resolver
- Qué del sistema actual se reutiliza vs. qué se construye nuevo
- Alcance, supuestos y restricciones
- Criterios de éxito
