# 02 — Arquitectura modular

Este capítulo define la estructura técnica de un chatbot Momentum. Cómo se decompone en componentes, cómo se decide cuántos agentes usar, qué stack elegir, y cómo se conectan las piezas.

---

## 1. La estructura universal

Todo chatbot Momentum, sin excepción, está compuesto por los siguientes bloques lógicos. La cantidad de componentes dentro de cada bloque varía según la complejidad del caso, pero los bloques siempre están presentes.

```
┌────────────────────────────────────────────────────────────────┐
│                       BLOQUE 1: ENTRADA                         │
│  Trigger del canal (Webhook/Telegram/ManyChat) →                │
│  Filtro ON/OFF (Airtable: chatbot activo para este lead?) →    │
│  Detección de tipo (texto vs audio) →                          │
│  Extracción de ID y mensaje                                    │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 2: CONTROL DE CONVERSACIÓN              │
│  Comando de reinicio (palabras clave) →                        │
│  Búsqueda/creación de lead en CRM →                            │
│  Filtro inicial (¿es lead nuevo válido o conversación vieja?) │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 3: BATCHING DE MENSAJES                 │
│  Push mensaje a Redis →                                        │
│  Wait 45-60 segundos →                                         │
│  Recolectar todos los mensajes del usuario →                   │
│  ¿Es el último? Sí → continuar / No → terminar                 │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 4: CONTEXTO                             │
│  Leer historial Postgres →                                     │
│  Formatear historial (Code Node) →                             │
│  Unificar variables                                            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 5: RUTEO INTELIGENTE                    │
│  Information Extractor (router) →                              │
│  Switch por destino                                            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 6: AGENTES                              │
│  Agente Principal (default, 70-80% del tráfico)                │
│  + 0-3 Agentes Especializados (objeciones, inventario, etc.)  │
│  + ruta HANDOFF_HUMANO (sin LLM, solo notificación)            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 7: POST-PROCESSING                      │
│  Detector de descalificación (opcional, LLM) →                 │
│  Detección de strings clave (Calendly, wa.me) →                │
│  Notificación a Discord/Slack                                  │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│                  BLOQUE 8: SALIDA                               │
│  Formateador (Basic LLM Chain) →                               │
│  Split Out mensajes → Loop →                                    │
│  Envío al canal (Telegram/ManyChat/YCloud) +                   │
│  Wait entre mensajes (1-2s)                                    │
└────────────────────────────────────────────────────────────────┘
```

El [Capítulo 06](06-workflow-n8n.md) detalla la implementación n8n de cada bloque. Este capítulo se enfoca en las **decisiones de diseño**: qué componentes incluir, cuántos, con qué configuración.

---

## 2. Componentes del bloque AGENTES

### 2.1 Router (Information Extractor)

**Tipo:** nodo `@n8n/n8n-nodes-langchain.informationExtractor`
**Modelo:** GPT-4.1-mini
**Temperature:** 0.1 (consistencia, no creatividad)
**Max tokens:** 300-400

**Función:** clasificar el mensaje del usuario en uno de N destinos posibles y extraer datos del historial completo.

**Decisión de diseño — ¿Cuándo router LLM vs Code Node?**

| Característica | Router LLM | Code Node (keywords) |
|---|---|---|
| Necesita extraer datos del historial (nombre, presupuesto, BANT) | ✅ Sí | ❌ No |
| Solo necesita rutear por palabras clave | ❌ Innecesario | ✅ Sí |
| Latencia | 1-2s | <50ms |
| Costo | ~$0.0005 por llamada | $0 |
| Maneja casos ambiguos | ✅ Sí | ❌ No |
| Maneja contexto multi-turno | ✅ Sí | ❌ Limitado |

**Recomendación práctica:** los workflows reales (Dr. Carlos, El Canal, Jacó) usan **router LLM** porque siempre necesitan extraer datos del historial. Si el caso es ultra-simple (un bot que solo envía un formulario), no se necesita router en absoluto.

**Máximo de destinos:** 3-4. Más destinos confunden al clasificador. Si necesitás más de 4, considerá sub-routers o reorganización del flujo.

### 2.2 Agente principal

**Tipo:** nodo `@n8n/n8n-nodes-langchain.agent`
**Modelo:** GPT-4.1-mini (o GPT-4o si el prompt supera 5,000 chars)
**Temperature:** 0.4 (conversacional con consistencia)
**Max tokens:** 400
**Memory:** Postgres Chat Memory, context window 15 mensajes

**Función:** maneja el 70-80% del tráfico. Es el agente que conduce el discovery, califica BANT, presenta el producto, da información general, y propone el cierre. Es **siempre el DEFAULT** cuando hay duda en el routing.

**Tools opcionales:**
- **Supabase Vector Store (RAG)** — cuando el negocio tiene un catálogo con muchas propiedades/productos cuya información cambia. Ejemplo: Jacó Dream Rentals usa RAG para info de villas.
- **Google Sheets** — cuando hay un inventario simple consultable en tiempo real. Ejemplo: El Canal usa Google Sheets para disponibilidad de unidades del condominio.
- **Sin tools** — la mayoría de casos. La información está hardcoded en el prompt o no es necesaria en tiempo real.

### 2.3 Agentes especializados

Son agentes con **un único propósito** que el router invoca para situaciones específicas. Si tu candidato a "agente especializado" hace dos cosas, está mal diseñado: divídelo en dos.

**Tipos comprobados:**

| Tipo | Propósito | Cuándo usarlo |
|---|---|---|
| Agente de Objeciones (LAARC) | Manejar objeciones de precio, timing, miedo, desconfianza | Negocios con ciclo de venta consultivo (Dr. Carlos, Level) |
| Agente de Inventario | Consultar disponibilidad en tiempo real (Google Sheets, API) | Real estate, e-commerce con stock variable |
| Agente de Agendamiento | Asignar vendedor (round-robin) y compartir contacto | Negocios con equipo de ventas humano que cierra |
| Agente de Precios | Cotizar según variables del cliente | Servicios con pricing dinámico por configuración |

**Configuración estándar:**
- Modelo: GPT-4.1-mini
- Temperature: 0.4
- Max tokens: 400
- Memory: Postgres 15 mensajes (compartida con el agente principal — misma session_id)
- Prompt: 1,000-2,000 chars

**Anti-patrón:** crear un agente especializado para algo que el agente principal ya hace bien. Si el agente principal puede contestar "¿cuáles son los horarios?" con la info en su prompt, no se justifica un "agente de FAQs".

### 2.4 Agente de objeciones (LAARC)

Caso especial de agente especializado que merece su propia sección porque aparece en la mayoría de proyectos con ciclo consultivo.

**Framework: LAARC**

- **L — Listen:** no defender, mostrar que escuchaste
- **A — Acknowledge:** validar que la preocupación tiene sentido
- **A — Assess:** preguntar la causa raíz
- **R — Respond:** estrategia según tipo de objeción
- **C — Confirm:** verificar que quedó resuelto

**Implementación crítica:** todo en UN solo mensaje fluido, máximo 4 líneas. No como pasos separados. El usuario no debe notar que hay un framework.

**Distribución típica de objeciones (datos HubSpot):**
- 47% precio
- 22% timing
- 18% product fit
- 13% otros

**Regla:** el agente de objeciones NUNCA ofrece descuento directo. Primero explora ("¿comparado con qué?", "¿qué necesita pasar?"). Si después de 2 turnos no resuelve, segundo intento de objeción debe ir a `HANDOFF_HUMANO`, no quedarse en bucle.

**Detalle clave:** el agente de objeciones NUNCA intenta agendar directamente. No tiene acceso a calendario. Si el lead quiere agendar, redirige al link de Calendly o al agente principal.

### 2.5 Formateador

**Tipo:** nodo `@n8n/n8n-nodes-langchain.chainLlm` (Basic LLM Chain)
**Modelo:** GPT-4o-mini (no GPT-4.1-mini — esto es deliberado)
**Output Parser:** Structured Output Parser + Auto-fixing

**Función:** dividir la respuesta del agente principal o especialista en múltiples mensajes cortos para WhatsApp/Instagram/Telegram. Aplica reglas de formato:

- Máximo 3 líneas por mensaje
- Separa bullets pegados (`• item1 • item2` → cada uno en su línea)
- Preguntas en mensaje separado
- Respeta párrafos existentes
- No divide ideas a la mitad

**Output:**
```json
{
  "MENSAJE 1": "Texto del primer bloque...",
  "MENSAJE 2": "Texto del segundo bloque...",
  "MENSAJE 3": "Texto del tercer bloque..."
}
```

Después del formateador, un Split Out + Loop + Wait envía cada bloque al canal con 1-2 segundos entre cada uno, simulando ritmo humano.

**Decisión de diseño — ¿Formateador LLM vs Code Node?**

| Característica | LLM (Basic LLM Chain) | Code Node (regex) |
|---|---|---|
| Maneja división semántica (no parte ideas) | ✅ Sí | ❌ Difícil |
| Detecta y separa bullets pegados | ✅ Sí | ⚠️ Solo casos simples |
| Latencia | 1-2s | <50ms |
| Costo | ~$0.0001 por llamada | $0 |
| Mantenibilidad | Prompt | Código |

**Recomendación:** LLM. La división semántica es difícil de lograr con regex y la diferencia en calidad de UX es notable. El formateador es la pieza que más impacta la "naturalidad" percibida del bot.

---

## 3. Decisiones de routing

### 3.1 Cuántos agentes necesito

Decisión basada en complejidad del negocio:

| Complejidad | Agentes | Cuándo aplica | Ejemplo |
|---|---|---|---|
| **1 agente** | Principal solo | Negocio simple: una propuesta, un flujo lineal | Jacó Dream Rentals, Grandit |
| **2 agentes** | Principal + Objeciones | Negocio con ciclo consultivo y objeciones comunes | Dr. Carlos, Level |
| **3 agentes** | Principal + Objeciones + Inventario/Agendamiento | Real estate, e-commerce con stock, servicios con equipo de ventas | El Canal |
| **>3 agentes** | (Reconsiderar arquitectura) | Caso muy raro. Si necesitás >3 agentes, probablemente el agente principal está haciendo cosas que deberían estar en post-processing | — |

**Regla empírica:** empezá con el mínimo necesario. Es más fácil agregar un agente después de ver datos que quitarlo.

### 3.2 Cuándo NO hay router

Si solo tenés un agente principal sin especialistas, **no necesitás router**. Simplemente el webhook va directo al agente. Ejemplo: Grandit (un solo agente "Alexa" que envía el link del formulario inmediatamente).

### 3.3 El agente principal como DEFAULT

**Regla crítica:** cuando el router está en duda entre dos destinos, debe ir al agente principal. NUNCA al especialista.

**Justificación:** un falso positivo en "este mensaje es una objeción" cuando en realidad era una pregunta, manda al usuario a un flujo de manejo de objeciones cuando solo quería información. La experiencia se rompe. En cambio, si el router manda una objeción al agente principal por error, el agente principal está entrenado para reconocerla y, en el siguiente turno, el router lo enviará al de objeciones.

**Implementación técnica:**
- El schema del router siempre tiene el agente principal como `default`
- El Switch tiene una salida `BACKUP` (output vacío del router) que va al agente principal
- En el prompt del router: "En caso de duda → AGENTE_PRINCIPAL"

### 3.4 Backup route en el Switch

**Regla:** todo Switch que sigue al router debe tener una ruta de fallback al agente principal. Si el Information Extractor devuelve output vacío o null (caso edge: timeout, error transitorio), el Switch envía al principal en lugar de romper el workflow.

**Implementación en n8n:**
```
Switch (modo: expression)
  - Caso 1: $json.output.destino === "AGENTE_PRINCIPAL"
  - Caso 2: $json.output.destino === "AGENTE_OBJECIONES"
  - ...
  - Caso N (fallback): true → AI Agent Principal
```

---

## 4. Stack technológico por tipo de negocio

Esta matriz se construyó observando los 7 casos reales documentados ([Capítulo 08](08-casos-estudio.md)). Es una guía, no una regla rígida.

### 4.1 Servicios locales (clínicas, salones, inspecciones)

```yaml
Canal: WhatsApp (Evolution API) o Instagram (ManyChat)
CRM: Google Sheets o Airtable
Modelo: GPT-4o-mini (prompt simple <3k chars) o GPT-4.1-mini
Agentes: 1-2 (Principal, opcionalmente Objeciones)
Agendamiento: Calendly link en prompt
Memory: Postgres 15 mensajes
Tools: ninguno (precios y FAQs en el prompt)
Precios: en moneda local, sin USD
```

Ejemplos: Dr. Carlos (clínica médica), SmartCheck (inspecciones vehiculares).

### 4.2 Real estate / alquileres

```yaml
Canal: WhatsApp + Instagram (multi-canal)
CRM: Airtable
Inventario: Google Sheets (live queries) o RAG Supabase
Modelo: GPT-4.1-mini (tickets altos, conversaciones complejas)
Agentes: 2-3 (Principal, Inventario, Agendamiento opcional)
Round-robin: vendedores asignados por hora par/impar
Memory: Postgres 15 mensajes
Reglas: NUNCA confirmar disponibilidad/precios exactos, redirigir a links
```

Ejemplos: Jacó Dream Rentals (1 agente + RAG), El Canal (3 agentes + Google Sheets).

### 4.3 Microfinanzas / formularios

```yaml
Canal: WhatsApp
CRM: Sistema propio del cliente (no integrar)
Modelo: GPT-4o-mini
Agentes: 1 (ultra-simple)
Estrategia: enviar formulario INMEDIATAMENTE, no preguntar datos antes
```

Ejemplo: Grandit (Alexa).

**Anti-patrón comprobado:** preguntar datos al usuario antes de enviar el link del formulario. El formulario ya captura los datos; cualquier paso adicional genera abandono.

### 4.4 Asesoría / consulting

```yaml
Canal: WhatsApp (YCloud para mensajes proactivos/broadcast)
CRM: Notion o Airtable
Modelo: GPT-4.1-mini o GPT-4o
Agentes: 2 (Principal calificador + Objeciones LAARC)
Modo dual: reactivo (inbound) + proactivo (outbound segmentado)
Segmentación: tibios (CTA directo) vs fríos (valor primero)
```

Ejemplo: Level (LEO).

### 4.5 E-commerce / productos físicos

```yaml
Canal: WhatsApp + Instagram
CRM: Airtable o sistema del cliente
Modelo: GPT-4.1-mini
Agentes: 2-3 (Principal, Inventario, Checkout opcional)
Tools: Google Sheets para stock
```

### 4.6 B2B / SaaS

```yaml
Canal: WhatsApp + Web Chat
CRM: HubSpot o Airtable
Modelo: GPT-4o (conversaciones complejas, alto valor)
Agentes: 3-4 (Principal/SPIN, Demo, Pricing, Técnico)
Framework: SPIN simplificado (Situación → Problema → Implicación → Necesidad)
```

---

## 5. Mecanismos de handoff a humano

El handoff es el momento en que el bot deja de atender a un lead específico y un humano del equipo del cliente toma la conversación. Hay tres mecanismos posibles según el caso:

### 5.1 Handoff por apagado en CRM (recomendado)

Es el patrón usado en el template base y en la mayoría de clientes.

**Mecanismo:**
1. Cuando se cumple un criterio de handoff (lead calificado, frustración, solicitud explícita), el agente principal o el router envía el destino `HANDOFF_HUMANO`
2. El workflow actualiza Airtable: campo "Chatbot Activado = OFF" para ese lead
3. Notificación a Discord/WhatsApp para el equipo
4. En el siguiente mensaje del usuario, el workflow lee Airtable al inicio, ve que el chatbot está apagado para ese lead, y termina inmediatamente
5. La conversación continúa con un humano que ya tiene contexto

**Ventaja:** el bot literalmente deja de responder. Sin "te paso con alguien", sin promesas de respuesta humana.

### 5.2 Handoff por string detection post-respuesta

Patrón usado en Dr. Carlos. Detecta cuándo el agente compartió un Calendly o un wa.me y eso es señal de handoff implícito.

**Mecanismo:**
1. Después de que el agente responde, un Code Node revisa el output buscando strings: `calendly.com`, `wa.me/`, frases de descalificación
2. Si encuentra match, dispara la notificación Discord + apagado del bot en Airtable
3. El usuario ya recibió el link/contacto, no necesita más respuestas del bot

### 5.3 Handoff por detector de descalificación

Patrón usado en El Canal. Un Information Extractor adicional evalúa cada respuesta del bot y detecta si fue una descalificación elegante.

**Mecanismo:**
1. Después del agente principal/inventario, un Information Extractor evalúa la respuesta del bot
2. Output JSON: `{ "es_descalificacion": true/false, "tipo": "presupuesto_bajo|sin_fit|..." }`
3. Si es true, se apaga el chatbot para ese lead en Airtable

**Cuándo usarlo:** negocios donde la descalificación es frecuente y se quiere asegurar que el bot no insista. Real estate de gama alta (El Canal con presupuesto mínimo de $159,900) es el caso típico.

---

## 6. Memoria y batching

### 6.1 Memoria conversacional: Postgres Chat Memory

**Nodo:** `@n8n/n8n-nodes-langchain.memoryPostgresChat`
**Context Window Length:** 15 mensajes
**Session ID:** el identificador único del usuario (número de WhatsApp, chat_id de Telegram, user_id de ManyChat)

**Justificación de 15 mensajes:**
- <10 mensajes: el bot olvida información temprana de la conversación
- >20 mensajes: aumenta el costo (más tokens) sin mejora proporcional
- 15 es el sweet spot empírico que mantiene coherencia sin disparar costo

**Importante:** la memoria está compartida entre el agente principal y todos los agentes especializados. Usan la misma `session_id`, leen la misma tabla `n8n_chat_histories`. Esto permite que el agente de objeciones tenga contexto de lo que dijo el principal.

### 6.2 Batching de mensajes con Redis

**Problema que resuelve:** los usuarios escriben en mensajes cortos sucesivos en WhatsApp ("hola" + "tengo una pregunta" + "es sobre los precios"). Si el bot responde a cada uno por separado, la conversación se siente robótica y rota.

**Mecanismo:**
1. Cada mensaje del usuario se hace `PUSH` a una lista Redis con key = `session_id`
2. Se inicia un `Wait` de 45 segundos (texto) o 60 segundos (audio)
3. Después del wait, se hace `GET` de toda la lista
4. Se verifica: ¿es este el último mensaje que llegó? Si sí, se procesan todos juntos. Si no, este turno termina (otro proceso paralelo procesará).

**Configuración estándar:**
- Wait: 45s para texto, 60s para audio (transcripción tarda más)
- TTL de las keys: 5 minutos (cleanup automático)

**Después de la respuesta del agente:** se borra la key de Redis para esa sesión.

### 6.3 Tabla de Postgres para historial

Schema mínimo:

```sql
CREATE TABLE n8n_chat_histories (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(50) NOT NULL,
  message JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session ON n8n_chat_histories(session_id);
```

El nodo de Postgres Chat Memory de n8n maneja la lectura y escritura automáticamente. No necesitás SQL custom para esto.

**Reinicio de conversación:** cuando un usuario escribe `REINICIAR` (o palabra clave configurada), el workflow ejecuta DELETE en `n8n_chat_histories` filtrando por `session_id`, más limpieza de Redis. Detalles técnicos en [Capítulo 06 §5.3](06-workflow-n8n.md).

---

## 7. Tools — cuándo agregarlos

Las tools (Supabase RAG, Google Sheets, HTTP Request) le dan al agente acceso a datos que cambian o son demasiado grandes para hardcodear en el prompt. Pero introducen latencia y complejidad. La regla es: **no agregar tools si el dato puede vivir en el prompt**.

### 7.1 RAG (Supabase Vector Store)

**Cuándo usarlo:**
- Catálogo con >10 items (propiedades, productos, servicios)
- La información de los items se actualiza frecuentemente (semanal o más)
- El cliente puede mantener una fuente de verdad estructurada

**Cuándo NO usarlo:**
- Catálogo pequeño (<10 items) → al prompt
- Información estable (políticas, horarios) → al prompt
- Cliente no puede o no quiere mantener una fuente de verdad → al prompt

**Caso real:** Jacó Dream Rentals tiene 7 villas pero cada una con muchas amenidades, fotos, precios dinámicos. RAG en Supabase + tool `RAG_JACO`.

### 7.2 Google Sheets

**Cuándo usarlo:**
- Inventario simple que se actualiza desde una hoja existente del cliente
- El cliente ya usa Google Workspace y prefiere editar en Sheets
- <500 filas (limitación práctica de latencia)

**Caso real:** El Canal tiene una hoja con 50 unidades del condominio (Tipo, Modelo, Precio desde, Habitaciones, Disponibilidad). El agente de inventario consulta la hoja en tiempo real con el nodo Google Sheets de n8n.

### 7.3 HTTP Request (APIs externas)

**Cuándo usarlo:**
- Información en tiempo real que solo existe en un sistema del cliente (su CRM, su ERP)
- El cliente puede exponer una API REST simple
- El uso es ocasional (no en cada turno)

**Anti-patrón:** conectar APIs solo "por si acaso". Cada tool conectada al agente aumenta el contexto que el LLM debe procesar y reduce la precisión de cuándo invocarla.

### 7.4 Calendly — NO conectar la API

**Caso especial:** Calendly tiene API para verificar disponibilidad real, pero **no la conectamos**. El link de Calendly ya muestra la disponibilidad al usuario, y conectar la API genera latencia adicional sin mejorar la experiencia.

**Patrón:** el link de Calendly va hardcoded en el prompt. El agente lo comparte con texto contextualizado (no solo el link suelto). String detection post-respuesta dispara notificación al equipo cuando se compartió.

---

## 8. Patrones de routing por número de agentes

### 8.1 Patrón "Solo Principal"

```
Router → AGENTE_PRINCIPAL → Formateador → Canal
       └ HANDOFF_HUMANO → Notificación (sin AI)
```

Aplicable: Grandit (Alexa). Negocio con flujo único y deterministic.

### 8.2 Patrón "Principal + Objeciones"

```
Router → AGENTE_PRINCIPAL → Formateador → Canal
       → AGENTE_OBJECIONES → Formateador → Canal
       └ HANDOFF_HUMANO → Notificación
```

Aplicable: Dr. Carlos, Level. Ciclo consultivo con objeciones recurrentes.

### 8.3 Patrón "Principal + Inventario"

```
Router → AGENTE_PRINCIPAL → Formateador → Canal
       → AGENTE_INVENTARIO (tool: Google Sheets) → Formateador → Canal
       └ HANDOFF_HUMANO → Notificación
```

Aplicable: real estate con inventario consultable.

### 8.4 Patrón "Principal + Objeciones + Inventario"

```
Router → AGENTE_PRINCIPAL → Formateador → Canal
       → AGENTE_OBJECIONES → Formateador → Canal
       → AGENTE_INVENTARIO → Formateador → Canal
       └ HANDOFF_HUMANO → Notificación
```

Aplicable: El Canal (con `AGENTE_AGENDAMIENTO` en lugar de objeciones). Ciclo de venta consultivo + inventario en tiempo real.

### 8.5 Patrón con doble Information Extractor

El template base (Jacó Dream Rentals) usa un patrón más sofisticado: **dos Information Extractors en serie**.

```
[Buscar Lead en Airtable]
    └─ No existe → IE #1 (Filtro Inicial): ¿es lead nuevo válido?
                       ├─ Sí → Crear Lead → continuar
                       └─ No → Stop (no interferir con conversación pre-existente)
    └─ Existe → continuar

[Batching Redis] → [Postgres historial] → [Formatear historial]
    ↓
IE #2 (Router): ¿qué agente responde?
    → Switch → Agentes
```

**Por qué:** el cliente Jacó ya tenía conversaciones existentes con leads cuando el bot se desplegó. El filtro inicial previene que el bot interrumpa una conversación humana en curso ("ya hablé con alguien hace dos días, ahora me responde otro").

**Cuándo aplicarlo:** clientes con cuentas WhatsApp/Instagram que ya tienen historial humano que no debe ser tocado por el bot. Si es una cuenta nueva o sin historial relevante, omitir IE #1.

---

## 9. Diagrama de decisión: qué arquitectura usar

```
┌─────────────────────────────────────────────────────┐
│ ¿Cuántos productos/servicios diferentes ofrece?     │
└─────────────────────────────────────────────────────┘
        ↓                          ↓
       1-3                       >3
        ↓                          ↓
┌──────────────────┐    ┌────────────────────────────┐
│ ¿Hay catálogo    │    │ Agente Principal + RAG/    │
│ consultable?     │    │ Sheets para inventario      │
└──────────────────┘    └────────────────────────────┘
   ↓         ↓                          ↓
   No        Sí                         ↓
   ↓         ↓                          ↓
┌──────┐ ┌──────────────┐         ┌──────────────────┐
│Solo  │ │Principal +   │         │ ¿Ciclo consultivo│
│Principal│ │Inventario  │         │ con objeciones?  │
└──────┘ └──────────────┘         └──────────────────┘
                                     ↓             ↓
                                    Sí            No
                                     ↓             ↓
                                ┌──────────┐   ┌──────────┐
                                │+Objeciones│  │OK con 2  │
                                │(LAARC)    │  │agentes   │
                                └──────────┘   └──────────┘
```

---

## 10. Checklist de arquitectura

Antes de pasar al diseño de prompts, verificar:

- [ ] Está claro cuántos agentes especializados se necesitan (justificación documentada)
- [ ] Se definió qué destinos puede devolver el router (máximo 4)
- [ ] El agente principal está identificado como DEFAULT
- [ ] Backup route en el Switch hacia el agente principal
- [ ] Decidido el modelo LLM por agente (GPT-4.1-mini default)
- [ ] Decidido si hay tools (RAG, Sheets) y por qué
- [ ] Definido el mecanismo de handoff (apagado CRM, string detection, descalificador)
- [ ] Canal y stack técnico decididos (WhatsApp/IG/Telegram, Evolution/YCloud/ManyChat)
- [ ] CRM elegido (Airtable, Sheets, Notion)
- [ ] Documentado en `clients/{cliente}/architecture.md`

---

**Siguiente:** [Capítulo 03 — Discovery con el cliente](03-discovery-cliente.md)

**Anterior:** [Capítulo 01 — Filosofía y metodología](01-filosofia-metodologia.md)
