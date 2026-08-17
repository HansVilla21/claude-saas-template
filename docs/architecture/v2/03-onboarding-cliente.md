# Momentum AI CRM — Proceso de Onboarding de Cliente

**Fecha:** 2026-05-27
**Estado:** Draft operativo — usable con Robert + plantilla replicable
**Propósito:** Definir qué se le pide al cliente y cómo esa información se traduce en la configuración del sistema (prompt del bot, extracción, canales, catálogo). Esto se hace UNA vez bien y se reusa con cada cliente nuevo.

---

## Filosofía: el onboarding alimenta el sistema

Cada pregunta del onboarding tiene un **destino concreto** en el sistema. No se pregunta por preguntar — cada respuesta llena una pieza de la configuración:

```
Onboarding (info del cliente)  →  Configuración del sistema
─────────────────────────────────────────────────────────────
Info del negocio               →  agency record + Capa 2 del prompt (identidad)
Tono / estilo deseado          →  agency.bot_config.tone + Capa 3 del prompt
Objetivo del bot + hasta dónde →  Capa 4 (venta) + config de handoff
Qué capturar de cada lead      →  extractor_field_defs (qué extrae el bot)
Catálogo (propiedades)         →  módulo propiedades (tabla properties)
Canales (WhatsApp/IG)          →  agency_channels
Equipo                         →  agency_memberships
Material existente (FAQs, etc.)→  Capa 6 (custom) o documents (RAG)
```

Esto demuestra que la arquitectura **absorbe el onboarding limpiamente** — no hay info del cliente que no tenga dónde vivir.

---

## El cuestionario de descubrimiento (lo que se le pide al cliente)

Organizado en bloques. Se puede mandar como formulario o hacer en una llamada de descubrimiento (recomendado: llamada, se saca más).

### Bloque 1 — El negocio (identidad)

1. Nombre del negocio / marca (como querés que el bot se presente)
2. ¿A qué se dedican exactamente? (1-2 párrafos)
3. ¿Qué los diferencia de la competencia? (propuesta de valor)
4. Zona / ubicación de operación
5. Horarios de atención (¿el bot atiende 24/7 o avisa horarios?)
6. Sitio web / redes (si tienen)

### Bloque 2 — El cliente ideal y la conversación

7. ¿Quién es el cliente típico que les escribe? (perfil)
8. ¿Cuáles son las 5-10 preguntas más frecuentes que les hacen?
9. ¿Cuáles son las objeciones más comunes? (precio, ubicación, confianza, etc.)
10. ¿Qué información NECESITAN saber de cada lead para atenderlo bien? (ej. inmobiliaria: presupuesto, zona, compra/alquiler) → **esto define qué extrae el bot**
11. ¿Hay algo que el bot NUNCA debe decir o hacer? (límites, temas prohibidos)

### Bloque 3 — Objetivo del bot y flujo

12. ¿Qué querés que logre el bot principalmente? (calificar leads / agendar / vender / responder dudas / todo)
13. ¿Hasta dónde llega el bot y cuándo querés que un humano tome el control? (ej: cuando el lead está listo para comprar / cuando pide hablar con persona / cuando se traba)
14. **Comportamiento de cierre:** cuando el lead quiere comprar/avanzar, ¿el bot cierra todo en el chat, manda un link de pago/agenda, o avisa a un humano para que cierre?
15. ¿Cómo querés enterarte cuando pasa algo importante en un chat? (notificación)

### Bloque 4 — Tono y personalidad

16. ¿Cómo querés que suene el bot? (vendedor / consultivo / amigable / formal / cercano)
17. Dame 2-3 ejemplos de cómo respondería tu mejor vendedor a un cliente
18. ¿Hay palabras, jerga o frases que usan mucho? ¿Alguna que eviten?
19. ¿El bot tutea o trata de usted?

### Bloque 5 — Datos / catálogo (depende del módulo)

20. (Inmobiliaria) ¿Cómo tenés hoy tus propiedades? (Excel, fotos, sitio, en la cabeza)
21. ¿Cuántas propiedades activas en promedio?
22. ¿Con qué frecuencia cambian / se actualizan?
23. ¿Qué datos tiene cada propiedad? (precio, zona, m², habitaciones, fotos, etc.)

### Bloque 6 — Canales y leads

24. ¿Por qué canal te escriben los clientes? (WhatsApp / Instagram / Messenger / web)
25. ¿Qué número de WhatsApp vas a usar? ¿Es WhatsApp Business?
26. ¿Tenés campañas de ads activas? ¿De dónde vienen la mayoría de leads?
27. ¿Cuántos mensajes/leads recibís en promedio por día? (para dimensionar)

### Bloque 7 — Equipo

28. ¿Quién más va a usar el CRM además de vos? (nombres + qué hace cada uno)

### Bloque 8 — Material existente (acelera todo)

29. ¿Tenés scripts de venta / respuestas que ya usás? (mandalos)
30. ¿Tenés un FAQ escrito?
31. ¿Podés pasar 5-10 conversaciones reales exitosas? (oro para calibrar el bot)
32. Material de marketing, brochures, catálogos (PDF, lo que sea)

---

## Assets concretos a pedir (checklist)

- [ ] Logo (PNG/SVG, alta resolución)
- [ ] Catálogo de propiedades (Excel/CSV con: título, precio, zona, tipo, m², habitaciones, descripción, fotos)
- [ ] Fotos de propiedades (carpeta / links)
- [ ] Scripts de venta o FAQs existentes
- [ ] 5-10 conversaciones reales exitosas (screenshots o export)
- [ ] Acceso al WhatsApp Business (o número a conectar)
- [ ] Acceso a Meta Business (si IG/Messenger)
- [ ] Datos de contacto del negocio (horarios, dirección, web)

---

## El flujo de onboarding paso a paso (timeline)

### Día 1-2 — Descubrimiento

1. Llamada de descubrimiento (1 hora) recorriendo los 8 bloques
2. Cliente manda los assets (catálogo, material, accesos)

### Día 3-5 — Configuración base

3. Crear la `agency` en el sistema (datos del negocio del Bloque 1)
4. Conectar canales (`agency_channels`) — WhatsApp primero
5. Cargar el catálogo (propiedades) al módulo
6. Definir `extractor_field_defs` (qué captura el bot, del Bloque 2 pregunta 10)
7. Configurar `pipeline_stages` (etapas del lead que tenga sentido para su negocio)

### Día 5-8 — Construcción del bot (el prompt)

8. Armar el prompt usando el Prompt Compositor:
   - Capa 2 (identidad): del Bloque 1
   - Capa 3 (tono): del Bloque 4
   - Capa 4 (venta): del Bloque 3 pregunta 14
   - Capa 6 (custom): FAQs, scripts, límites del Bloque 2 y 8
   - Capa 5 (módulo): automática al prender propiedades
9. Calibrar con las conversaciones reales del Bloque 8 (¿el bot responde como respondería su mejor vendedor?)
10. Usar la skill `langchain-agent-prompt-design` para estructurar + la skill `sales-framework-spsp-whatsapp` para el flujo de venta

### Día 8-12 — Testing interno

11. Simular conversaciones (los casos del Bloque 2: preguntas frecuentes + objeciones)
12. Verificar extracción (¿captura presupuesto, zona, etc.?)
13. Verificar handoff (¿pasa a humano cuando debe?)
14. Verificar envío de fotos de propiedades (el flujo que ya resolvimos en v5.5)

### Día 12-18 — Prueba con tráfico real (soft launch)

15. Conectar a un volumen chico de leads reales
16. Monitorear conversaciones, ajustar prompt según lo que falle
17. Iterar (el prompt casi nunca sale perfecto a la primera — por eso el período de ajuste)

### Día 18+ — Go live + monitoreo

18. Abrir al tráfico completo
19. Monitoreo continuo + ajustes del prompt según resultados
20. Reportes de resultados al cliente (leads capturados, conversaciones, conversiones)

---

## Para Robert específicamente (caso concreto)

- **Módulo:** propiedades (inmobiliaria)
- **Lo que necesito de él ya:** catálogo de propiedades (formato actual), fotos, scripts de venta que use, conversaciones reales, número de WhatsApp, logo
- **Entrega:** semana 4 → tenemos margen para hacer descubrimiento + construcción + testing + soft launch sin apurar
- **El bot:** reusamos Sofia (ya funciona end-to-end con texto + imagen), reconfigurado con el prompt de Robert

---

## Por qué este onboarding es un activo (no solo un trámite)

1. **Es replicable:** el mismo cuestionario sirve para el cliente 2, 3, N. Cambia el contenido, no el proceso.
2. **Es vendible:** un onboarding profesional justifica el fee de setup ($1000). El cliente siente que está comprando un servicio serio, no un software pelado.
3. **Define el producto:** al hacer onboarding de varios clientes, vas a ver qué se repite → eso te dice qué automatizar y qué módulos construir.
4. **Candidato a skill:** cuando lo hagamos 2-3 veces y se estabilice, se captura como skill `onboarding-cliente-crm` (directriz permanente del proyecto).
