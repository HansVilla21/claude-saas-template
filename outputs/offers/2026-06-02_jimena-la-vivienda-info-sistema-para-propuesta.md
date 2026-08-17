# Info del Sistema — Insumo para Propuesta a Jimena Mateo (La Vivienda)

**Cliente:** Jimena Mateo · La Vivienda (inmobiliaria) + también opera MediCheck.
**Fecha llamada:** 2026-06-02 (52 min — Hans + Pietro + Jimena).
**Estado actual con nosotros:** ya tiene a Eva (chatbot custom de la casa) corriendo en ManyChat + ChatGPT + Soho CRM. Pago caótico (tarjeta del papá, licencias separadas), uptime frágil.
**Acuerdo verbal en la llamada:** propuesta con descuento por ser cliente existente. Respuesta de Jimena esperada **fin de esta semana**.

---

## 1. Cómo usar este documento

Este archivo NO es la propuesta. Es el **brief de información** para alimentar al proyecto donde armás las propuestas.

Contiene:
- Pain points literales de Jimena (con citas).
- Mapeo dolor → cómo el sistema lo resuelve (una columna por cosa).
- Términos cerrados con ella ($499 setup, $150/mes, 1 mes).
- Módulos del sistema con descripción no técnica.
- Lista priorizada de pantallazos a capturar + dónde meter cada uno en la propuesta.
- Reglas de redacción (qué incluir, qué evitar).

**Regla maestra de tono (cita literal de Pietro post-llamada):**
> "No le mandes pantallazos como out of the blue, así, como de la nada. Mandale una propuesta como la que le hiciste a Roberto, pero con pantallazos de referencia, en donde dice 'un CRM completo' [pantallazo de referencia], y así."

Cada pantallazo es ancla de un punto que ya está escrito en texto. No al revés.

---

## 2. Los pain points reales de Jimena (de la llamada, ordenados por dolor)

### #1 — WhatsApp/ManyChat se cae 3-4 días al mes → quema $160/mes en ads (mínimo)

Cita literal:
> "Para mí eso nos mata, y nos hace perder mucho presupuesto, porque en lo que me doy cuenta, una actualización de WhatsApp por fin de semana, cuatro días, que gasté 40 dólares al día en campañas, y nada, porque estaba desconectado ManyChat, se pierde todo."

> "Puedo cuantificar y hay mucha pérdida en tener algo que nos cae todos los meses."

**Importancia:** este es SU dolor #1, lo mencionó tres veces en la llamada. La propuesta debe atacarlo de frente y temprano.

### #2 — Stack fragmentado, paga 4-5 herramientas separadas, ingestiona pagos por la tarjeta del papá

Cita literal:
> "Las cuentas de la empresa se llama la vivienda y por alguna razón hay una que ya van creo que dos veces que le he tenido que pasar el simple Hans... Soho lo pagamos con la tarjeta de mi papá y es un lío, pero era una pesadilla y se nos caía el CRM todos los días por tres días, cada cambio de mes era un lío."

Pago estimado actual (Pietro lo calculó en vivo): **~$70/mes** entre ChatGPT API + licencias ManyChat + costos varios. Más Soho aparte.

### #3 — Leads de WhatsApp NO entran automáticamente a Soho. Los meten a mano

Cita literal:
> "Bueno, estamos haciendo todo manual, entonces de ahí... pero los de Eva sí son un volumen alto, y nos gustaría como ver si de alguna manera se pudiese automatizar que aparecieran en el CRM. Y yo no lo he logrado ni con ManyChat."

> "Mantenemos Soho [como CRM principal] porque los leads de WhatsApp no son nuestros únicos leads, tenemos leads de correo, leads de llamada, leads de login..."

**Importancia:** ella NO quiere abandonar Soho ahora (su histórico, dashboard, fechas). Quiere que Momentum **alimente** a Soho, no lo reemplace. Migración full a Momentum es proyecto 2027.

### #4 — En ManyChat no distingue qué conversaciones necesitan atención

Cita literal (Pietro hablando):
> "Es muy difícil darse cuenta realmente qué conversación está teniendo Carmita. O sea, qué conversación realmente quedó en un mensaje de 'hola, quiero más info' o qué conversación puedo entrar a simple vista y revisarla."

### #5 — Bot pierde contexto cuando humano interviene (problema universal de chatbots)

Cita literal (Pietro):
> "Cuando uno interviene la conversación con un chatbot, como esa conexión está pasando como en otro universo, uno interviene, ya el chatbot no puede retomar, porque pierde el contexto de lo que se habló entre humanos."

### #6 — Calidad de leads de campañas WhatsApp es baja, no hay filtro inicial

Cita literal:
> "Los leads de WhatsApp, por más que sean el 70% de mis leads, y el volumen... no son leads que por ahora han tenido un valor alto, todavía ninguno lo hemos logrado convertir."

> "Tal vez hay un tema de filtro que nos está faltando."

### #7 — Inmobiliaria-específico: el bot actual no maneja propiedades, no manda fotos, no filtra inventario por preferencias del lead

Lo dijo Jimena cuando vio el módulo de propiedades:
> "Esta parte está chidísima... si dentro de la conversación con el bot se queda muy claro que esa persona busca una casa de tres habitaciones, entonces ya uno le puede mandar opciones mucho más específicas y no las 20 propiedades que tiene uno."

### #8 — No quiere depender de Meta Forms (no la podemos integrar todavía) pero sí quiere formularios para website

Cita literal:
> "Sería genial que en algún futuro se puedan integrar los otros leads... yo desde Soho saco muchas tendencias."

Acordado: le entregamos **formularios link + embed** (no Meta Forms). Ella los pone en su web y campañas con form.

---

## 3. Cómo el sistema ataca cada pain (mapeo directo)

Esta tabla es para que la propuesta pueda construir el argumento "tu dolor X → nuestra solución Y" sin inventar nada.

| # | Dolor de Jimena | Cómo el sistema lo resuelve |
|---|---|---|
| 1 | Caídas de WhatsApp/ManyChat 3-4 días/mes | Plataforma propia, monitoreo 24/7 desde nuestro lado. Cliente paga UNA mensualidad, nosotros somos responsables de que esté open running. Sin tarjetas dispersas, sin licencias de terceros que se renueven mal. |
| 2 | Stack fragmentado (ManyChat + ChatGPT + Soho + servidor) | Todo en un solo sistema: WhatsApp + bot + CRM + agendas + propiedades + AI + formularios. Una mensualidad cubre todo (servidor, tokens AI, licencias). |
| 3 | Leads no entran auto a Soho | **Integración directa con Soho** (no Zapier). Cada lead que entra al sistema se pushea al CRM de ella en tiempo real con los campos que ya tenga configurados. Ella mantiene su histórico y dashboard. |
| 4 | No sabe qué conversación atender | Inbox con: contador de mensajes sin leer destacado por conversación, alertas de handoff visibles, filtros por estado del lead, ordenamiento por urgencia. |
| 5 | Bot pierde contexto al humano intervenir | Handoff con un botón "devolver al bot". El bot retoma con todo el contexto de los mensajes que se hablaron entre humanos. **Funcionalidad única, no existe en ManyChat ni alternativas.** |
| 6 | Calidad de leads de WhatsApp baja, sin filtro | El bot se configura para preguntar filtros al inicio (presupuesto, tipo de propiedad, urgencia) ANTES de calificar. Bot descarta o etiqueta leads automáticamente. |
| 7 | Bot no maneja propiedades ni fotos ni filtros | **Módulo de propiedades:** base de datos con fotos, atributos (habitaciones, baños, m², precio, ubicación), destacadas. Bot lee inventario y filtra según lo que el lead pide. Envía fotos directamente en WhatsApp. |
| 8 | Sin formularios para sumar leads que no sean WhatsApp | Módulo de formularios: link público para campañas + código embed para pegar en su website. Las respuestas caen al mismo CRM (Soho + Momentum) con etiqueta de fuente. |

---

## 4. Lo que la propuesta DEBE incluir (acuerdo verbal cerrado)

### Precio (decidido en vivo por Hans + Pietro):
- **Setup: $499 USD** (precio normal $2,999 — descuento por cliente existente. El "ya pagaste algo conmigo" la chinea).
- **Mensualidad: $150 USD** (normal $250 — pensado para que no se sienta el cambio de los ~$70/mes actuales).
- **Tiempo de entrega: 1 mes calendario.**

### Lo que entra dentro del setup + mensualidad:
1. Migración del bot Eva al nuevo sistema (lo que ya tiene + mejoras).
2. CRM completo (inbox, leads, contactos, agendas, tareas, reportes).
3. Módulo de propiedades con lectura del bot.
4. **Integración bidireccional con Soho** (push automático de cada lead nuevo).
5. **Formularios** (link público + embed para website) — para sumar leads que no vengan de WhatsApp.
6. Hosting + servidor + tokens AI + licencias = responsabilidad de Momentum, ella no toca nada.
7. Monitoreo 24/7 del uptime desde nuestro lado.
8. Soporte por modificaciones del bot ("queremos que pregunte X al inicio" = nosotros ajustamos rápido, no pasa por capas de ManyChat).

### Lo que NO entra (acordado en la llamada, mencionar como roadmap si surge):
- Migración full de Soho a Momentum → proyecto 2027 de ella.
- Landing pages completas (solo formularios, no constructor de páginas).
- Integración con Meta Lead Ads forms (requiere conexión con Meta API que aún no está construida — solo formularios propios por ahora).
- Audios con voz custom (lo pidió otro cliente fisio, está en roadmap).
- App móvil dedicada.

---

## 5. Módulos del sistema (descripción no técnica)

Para que la propuesta pueda referenciar cada módulo sin entrar en detalle técnico:

| Módulo | Qué hace |
|---|---|
| **Inbox unificada** | Una sola pantalla donde aparecen todas las conversaciones de WhatsApp, ordenadas, con alertas de handoff, mensajes sin leer destacados y tiempos de respuesta en amarillo/rojo. |
| **Bot integrado** | El chatbot vive dentro del sistema, no es una pieza separada. El humano puede tomar la conversación con un botón y devolvérsela cuando quiera — el bot retoma con todo el contexto. |
| **AI inline** | Dentro de cada conversación hay un asistente IA que sugiere respuestas leyendo el contexto. Vos le decís "respondele formal" o "explicale los precios" y él redacta. No tenés que ir a ChatGPT a copiar y pegar. |
| **CRM de leads/contactos** | Lista de leads con estado, etiquetas, score, asignación a agente, fuente. Todo se puede auto-actualizar por el bot (estado, etiquetas, notas, asignación). Cada modificación queda registrada con quién la hizo y cuándo. |
| **Módulo de propiedades** | Base de datos de propiedades con fotos, atributos (habitaciones, baños, m², precio, zona), propiedades destacadas. Conectado al bot: el bot lee el inventario y ofrece solo lo que matchea con lo que el lead pide. |
| **Agendas** | Calendario integrado al bot. El bot agenda citas en conversación: "tengo campo a las 3 y a las 5, ¿cuál te sirve?" Sin mandar links externos donde la gente se pierde. |
| **Insights de conversación** | Por cada conversación: tiempo promedio de respuesta del humano, respuestas más lentas, picos de actividad. Para revisar performance del equipo o auditar conversaciones que se cayeron. |
| **Formularios** | Constructor simple de formularios con link público + código embed. Las respuestas caen al CRM con fuente identificada. |
| **Integraciones externas** | Push automático de leads a Soho (en este caso). Sin Zapier — directo. |
| **Reportes / dashboard** | Métricas agregadas: leads por fuente, tasa de conversión, tiempos de respuesta, etc. |

---

## 6. Diferenciadores vs ManyChat / Soho / stack actual

Para construir la sección de "por qué Momentum y no seguir parchando":

| Lo que tienen hoy | Lo que Momentum les da |
|---|---|
| ManyChat (chatbot) + ChatGPT API (sugerencias) + Soho (CRM) + servidor + tarjeta papá | Una sola plataforma, una sola factura, una sola contraseña |
| Cae 3-4 días/mes por updates de WhatsApp/ManyChat | Monitoreo nuestro 24/7. Si algo se cae, lo arregla Momentum antes de que ella se entere |
| Bot pierde contexto cuando interviene humano | Bot retoma con contexto completo (funcionalidad única) |
| Lead llega a WhatsApp → metido manual a Soho | Lead llega a WhatsApp → entra auto al CRM + push a Soho |
| Modificación del bot = ticket, tiempos largos, depende de capas de ManyChat | Modificación del bot = pedido directo a Momentum, respuesta en horas o días, no semanas |
| 4-5 herramientas separadas que hay que mantener vivas | Una sola plataforma, responsabilidad total nuestra |
| No tiene módulo de propiedades, bot no manda fotos ni filtra | Propiedades centralizadas, bot las ofrece filtradas, manda fotos en WhatsApp |
| Leads de Meta WhatsApp Ads sin forma de filtrar calidad | Bot puede hacer preguntas de filtro al inicio antes de calificar |

---

## 7. Pantallazos sugeridos — qué capturar, dónde meterlos en la propuesta

**Regla:** cada pantallazo va junto al párrafo de texto que ya describe lo que muestra. Nunca solo. Máximo 6-8 imágenes en toda la propuesta (más se vuelve catálogo de features, no propuesta).

**Hans tiene el dev server del CRM v1 corriendo en `localhost:3000`. Necesita capturar:**

### Pantallazos a capturar AHORA (faltan, son críticos):

1. **Listado de propiedades** del módulo properties — necesario para sección "módulo de propiedades". Que se vean al menos 4-5 cards con foto, precio, atributos.
2. **Detalle de una propiedad** mostrando: leads interesados en esa propiedad + agendas generadas. Esto demuestra que la data está conectada (no son módulos aislados).
3. **Bot mandando fotos de propiedad en WhatsApp** — captura del lado WhatsApp (puede ser real con cuenta test o mockup). Esto es lo que más impactó a Jimena ("aquí hasta tiene la capacidad de mandar fotos").
4. **Cards de propiedades destacadas** (vista en el CRM con badge "destacada") — apoya el punto de "el bot ofrece primero las destacadas".

### Pantallazos que ya tenés (en `Screenshots CRM V1/` o root del repo):

| Pantallazo | Carpeta | Sección de la propuesta donde meterlo |
|---|---|---|
| `Inbox.png` o `Inbox-2.png` | Screenshots CRM V1/ | "Inbox unificada" — todas las conversaciones, mensajes sin leer destacados |
| `Leads.png`, `Leads2.png`, `Leads3.png` | Screenshots CRM V1/ | "CRM de leads" — escoger UNA, la más completa |
| `Dashboard.png` | Screenshots CRM V1/ | "Reportes / métricas" |
| `Agenda.png` | Screenshots CRM V1/ | "Agendas integradas" |
| `inbox-v2-ai-popover.png` o `inbox-v2-ai-result.png` | root | "AI inline" — el asistente IA dentro de la conversación |
| `inbox-v2-provenance.png` | root | "Auto-actualización" — tooltip mostrando "modificado por chatbot" |
| `inbox-v2-insights-config.png` | root | "Insights de conversación" — tiempos lentos del humano |

### Orden recomendado de pantallazos en la propuesta:

1. Inbox unificada (impacto visual + cita del primer pain).
2. Bot con handoff + botón devolver (ancla del diferenciador clave).
3. AI inline (ancla del "no más copy/paste de ChatGPT").
4. Listado de propiedades (anchor inmobiliaria).
5. Bot mandando foto en WhatsApp (cierre emocional, lo que más le brilló).
6. CRM de leads / contactos con auto-actualización (apoyo).

**No metas:**
- Pantallazos del módulo de configuración / settings.
- Pantallazos técnicos de migraciones, DB, código.
- Pantallazos del módulo master (es para vos, no para clientes).

---

## 8. Reglas de redacción para la propuesta

**Tono:**
- Directo, sin sobreexplicar. Jimena no es técnica pero es despierta.
- Habla en pains, no en features. "Hoy perdés $160/mes por caídas → te lo solucionamos" antes que "tenemos plataforma propia con monitoreo 24/7".
- Usa números literales que ella mencionó: $40/día de ads, 4 días, 70% leads WhatsApp, 2 veces tarjeta rebotada.

**Cosas que NO incluir:**
- Tecnologías por nombre (Next.js, Supabase, OpenAI, etc.). No le importa, la pierde.
- Mención de que esto está "en construcción" o "en beta". Pietro y Hans acordaron vender como producto listo.
- Comparaciones largas con ManyChat por nombre — basta con "tu stack actual".
- Migración a Momentum del CRM Soho — eso es 2027, no se vende ahora.
- Audios voz / app móvil / cualquier feature que no esté en el scope de los $499/$150.

**Cosas que SÍ incluir, breve:**
- 1 sola línea sobre que ya tenemos otro cliente inmobiliario validando el flujo (Pietro le dijo esto en la llamada para dar tracción social — Hans dijo "ahí me fui al riel" pero Pietro le respondió "yo dije 20 clientes, no importa, eso hay que usarlo").
- Mensaje claro de "no más tarjeta del papá": una mensualidad nuestra, todo cubierto.
- "Si necesitás cambios al bot, lo modificamos directo, no pasa por capas externas" — esto le importa porque ya sufrió con Eva.

**Closing:**
- CTA: confirma esta semana para arrancar la entrega de 1 mes.
- Mencionar que el descuento ($499 vs $2,999 setup) es por ser cliente existente — refuerza el "hoy o nunca".

---

## 9. Quick-reference

| Item | Valor |
|---|---|
| Cliente | Jimena Mateo |
| Empresa | La Vivienda (inmobiliaria) |
| Industria | Inmobiliaria |
| Setup | $499 USD |
| Mensualidad | $150 USD |
| Plazo de entrega | 1 mes calendario |
| Plazo de respuesta esperado | Fin de esta semana (2026-06-06 aprox) |
| Pain #1 | Caídas WhatsApp/ManyChat → $160/mes en ads quemados |
| Diferenciador clave | Bot retoma contexto post-handoff humano + módulo de propiedades + integración Soho |
| Anchor visual #1 | Bot mandando foto de propiedad en WhatsApp |
| Soho | Mantenerlo como repositorio principal de ella, Momentum lo alimenta |
| Cliente inmobiliario de referencia | Mencionar genéricamente que hay otro (Pietro lo autorizó) |
