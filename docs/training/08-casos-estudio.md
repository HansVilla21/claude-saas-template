# 08 — Casos de estudio reales

Siete proyectos en producción, cada uno con su contexto, decisiones de diseño y lecciones aprendidas. Este capítulo es el repositorio de jurisprudencia del sistema: cuando un cliente nuevo tenga características similares, este es el primer lugar para mirar antes de inventar arquitectura.

---

## 1. Jacó Dream Rentals (Liliana) — alquiler de villas de lujo

### 1.1 Contexto

- **Negocio:** alquiler de 7 villas de lujo en Jacó, Costa Rica
- **Canal:** WhatsApp + Instagram (ManyChat)
- **Propiedad insignia:** Vida Palace (capacidad 18 personas)
- **Estado:** producción, iteraciones constantes (v14 del prompt principal)
- **Cliente ideal:** familias y grupos vacacionales, multilingüe (ES/EN/PT/FR/DE)

### 1.2 Arquitectura

```yaml
Tipo: Agente único simplificado
Componentes:
  - Filtro Inicial (Information Extractor #1)
  - Router (Information Extractor #2)
  - Agente Liliana (único)
  - Formateador
Modelo: GPT-4.1-mini
Memory: Postgres 15 mensajes
Tools: Supabase Vector Store (RAG_JACO)
```

### 1.3 Decisiones clave

**Agente único en vez de multi-agent.** El negocio es simple: mostrar propiedades y guiar a reserva. Multi-agente sería overkill. El router solo decide entre AGENTE_PRINCIPAL y HANDOFF_HUMANO.

**RAG para inventario de propiedades.** Las 7 villas tienen mucha info (capacidad, amenidades, fotos, etc.) y se actualizan. RAG_JACO en Supabase Vector Store permite que el agente consulte detalles sin tenerlos hardcoded en el prompt.

**Sin APIs de precio/disponibilidad.** Los precios son dinámicos según temporada y demanda. La estrategia es redirigir a links de cada villa (presentar como ventaja, no limitación). El bot NUNCA confirma precio ni disponibilidad.

**Siempre promocionar Vida Palace primero.** Es la propiedad premium con margen mayor. Incluso para grupos pequeños, mostrar como aspiracional.

**Multilingüe via campo en el router.** El router detecta `idioma_detectado` (es/en/pt/fr/de) y el agente responde en ese idioma. Una sola plantilla de prompt sirve para 5 idiomas.

### 1.4 Lecciones aprendidas

- **Controlar crecimiento del prompt.** V14 = +5.8% tamaño vs original. Sin monitoreo activo, los prompts crecen 1-2% por iteración hasta volverse ingobernables.
- **Recomendaciones por tamaño exacto, no rangos amplios.** "Para 6 personas, te recomiendo X" funciona mejor que "Tenemos opciones de 3-8 personas".
- **Links de propiedades como experiencia positiva.** Bien presentados ("Acá podés ver fotos, amenidades y disponibilidad: [URL]") son percibidos como valor, no como evasiva.
- **El bot debe EDUCAR el proceso.** Los usuarios no saben cómo funciona el sitio web de reservas. El bot guía paso a paso: "click en Reserva Ahora → seleccioná fechas → ves el precio automático".
- **Capacidades de villas hardcoded en el prompt, no solo en RAG.** Si RAG falla, el bot debe seguir sabiendo que Vida Palace es para 18 personas máximo (no inventar).
- **Política de noches mínimas explícita.** Viernes/sábado mínimo 2 noches. Sin esto, el bot decía "1 noche disponible" y generaba reservas inválidas.

### 1.5 Resultados

Implementación en producción con iteraciones continuas desde noviembre 2025. Métricas internas: coherencia >95%, tickets de reserva exitosos creciendo mes a mes.

---

## 2. Condominium El Canal (Eva) — real estate

### 2.1 Contexto

- **Negocio:** condominio sostenible en Grecia, Costa Rica
- **Canal:** WhatsApp (Evolution API)
- **CRM:** Airtable
- **Inventario:** Google Sheets (live queries)
- **Vendedores:** Mario Rodriguez, Mauricio Monge (round-robin por hora)
- **Estado:** producción, múltiples iteraciones
- **Cliente ideal:** compradores B2C con presupuesto >$159,900 USD

### 2.2 Arquitectura

```yaml
Tipo: Multi-agente (3 agentes)
Componentes:
  - Router (Information Extractor con extracción de 10+ campos BANT)
  - Agente Eva (principal, 80% tráfico)
  - Agente Inventario (Google Sheets)
  - Agente Agendamiento (round-robin vendedores)
  - Detector de Descalificación (post-respuesta)
  - Formateador
Modelo: GPT-4.1-mini (todos los agentes)
Memory: Postgres 15 mensajes
```

### 2.3 Evolución del proyecto

1. **Dic 2025:** diseño inicial 4 agentes. Optimización de flujo de 22 mensajes.
2. **Dic 2025:** fixes críticos — Eva preguntaba nombre dos veces, pedía aclaración de moneda innecesaria, preguntaba días/horas sin tener acceso a calendario.
3. **Dic 2025:** classifier con extracción de datos, round-robin JavaScript, descalificación elegante.
4. **Ene 2026:** propuesta de lead nurturing para reactivar leads dormidos.
5. **Feb 2026:** transición de Calendly a WhatsApp directo. Eva menos pushy, más consultiva.
6. **Mar 2026:** eliminación del agente de Derivación. Classifier simplificado a 2 rutas. Round-robin por hora.

### 2.4 Decisiones clave

**Calificación con presupuesto mínimo de $159,900 USD.** Lead que no califica recibe descalificación elegante.

**Detección automática de moneda.** "millones" = colones, "K" = dólares. Sin preguntar "¿colones o dólares?".

**Descalificación elegante con script específico:**

> "Los precios arrancan desde $159,900. Puedo pasarte info por si lo considerás a futuro."

**Round-robin por hora.** Hora par → Mario, hora impar → Mauricio. Implementación en Code Node:

```javascript
const hora = new Date().getHours();
const esHoraPar = hora % 2 === 0;
const vendedor = esHoraPar ? mario : mauricio;
```

**Link wa.me en vez de Calendly.** El cliente prefirió que los leads calificados vayan directo a WhatsApp del vendedor (más control humano sobre el cierre).

**Bebida antes del cierre.** Eva pregunta "¿Té, café o agua durante la visita?". Humaniza la interacción, oportunidad de engagement.

**Eliminación del agente de Derivación.** Originalmente había un agente específico para coordinar fechas/horas de visita. Se eliminó porque el bot no tiene acceso a calendarios reales y "te paso al vendedor" cumple la misma función.

### 2.5 Errores reales y cómo se resolvieron

| Error | Causa | Solución |
|---|---|---|
| Eva preguntaba nombre dos veces | Classifier no extraía datos del historial | Agregar extracción de datos al classifier |
| Bot pedía aclaración de moneda | "5 millones" se interpretaba ambiguamente | "millones" = colones automáticamente |
| Bot preguntaba días/horas | No tenía acceso a calendario | Eliminar agente de agendamiento, compartir WhatsApp directo |
| Token limit del classifier muy bajo | JSON vacío o cortado | Subir a 500-1000 tokens |

### 2.6 Lecciones aprendidas

- **A veces la optimización es QUITAR pasos, no agregar.** Eliminar el agente de agendamiento mejoró el flujo.
- **Bot no debe coordinar lo que no controla.** Si no hay acceso al calendario, no preguntar por horarios. Derivar a humano.
- **Detección contextual de moneda > preguntar al usuario.** Inferir del contexto reduce fricción.
- **Round-robin temporal es suficiente.** No se necesita lógica compleja de "vendedor disponible ahora"; alternar por hora funciona y es predecible.

### 2.7 Bugs potenciales documentados

- El clasificador menciona 2 rutas en el prompt pero el Switch tiene 3 outputs. Verificar consistencia.
- El Code JS busca links de Calendly pero los agentes usan wa.me. El detector de post-procesamiento debe coincidir con los links reales.
- El formateador dice "GIVI" en el título (copypaste de otro cliente). Limpiar antes de production.

---

## 3. Dr. Carlos Hernández — clínica especialista en ansiedad

### 3.1 Contexto

- **Negocio:** consultorio médico, protocolo CBD para ansiedad
- **Canal:** Instagram DM (vía ManyChat → n8n)
- **CRM:** Airtable
- **Agendamiento:** Calendly
- **Notificaciones:** Discord
- **Estado:** reconstruido desde cero (se perdieron automatizaciones previas)
- **Cliente ideal:** personas con síntomas de ansiedad de >2 años, alta urgencia

### 3.2 Arquitectura

```yaml
Tipo: Multi-agente (2 AI agents + handoff Discord)
Componentes:
  - Router con scoring 0-8 puntos
  - Agente Dr. Carlos (principal)
  - Agente Objeciones (LAARC)
  - Discord notification (handoff)
  - Formateador
Modelo: GPT-4.1-mini (todos)
Memory: Postgres 15 mensajes
Tools: ninguno
```

### 3.3 Sistema de scoring (único de este cliente)

```
Variables calificadoras (cada una 0-2 pts, except tiempo_oculto):
- Dolor: 0 (leve) / 1 (le incomoda) / 2 (lo sobrepasa)
- Tiempo percibido: 0 (<3m) / 1 (3m-2a) / 2 (>2 años)
- Tiempo oculto: 0 (es nuevo) / 2 (ya existía antes) — EL MÁS IMPORTANTE
- Historial: 0 (nada aún) / 1 (algo leve) / 2 (múltiples sin resultados)

Clasificación:
- 0-3 pts → BAJO → comunidad Skool (link)
- 4-5 pts → MEDIO → VSL de 3 min (Loom link) → setter humano
- 6-8 pts → ALTO → validación + VSL obligatorio → Calendly directo
```

### 3.4 Decisiones clave

**El bot se hace pasar por el doctor.** "Sos el Dr. Carlos, nunca mencionás que sos bot." Decisión del cliente. Documentada explícitamente en el discovery.

**Mensaje de apertura fijo.** "Hola, por acá el Dr. Carlos para servirte..." — único caso donde la regla de "variar mensajes" no aplica (la apertura es la primera impresión).

**Flujo rígido de 6 pasos.** Diferente al patrón conversacional flexible. Este negocio requiere captura completa del scoring antes de actuar. El bot no improvisa.

**Scoring oculto al usuario.** "Nunca mencionás puntajes ni niveles." El usuario no sabe que está siendo evaluado en escala numérica.

**Agente de Objeciones especializado en CBD/cannabis.** Las 3-4 objeciones recurrentes del negocio son únicas (precio, timing, desconfianza en cannabis, preferencia por medicación tradicional).

**HANDOFF_HUMANO va directo a Discord** — no a un AI agent. Es una notificación pura, sin bot involucrado.

**String detection para Calendly y wa.me.** Cuando el bot envía un Calendly, un Code Node detecta `calendly.com` en el output y dispara notificación Discord + apaga el chatbot para ese lead.

### 3.5 Lecciones aprendidas

- **Keywords de emergencia deben ser exhaustivos.** En testing se pasó un caso de "no puedo más" que el router clasificó como objeción cuando debió ser emergencia psiquiátrica. Lista expandida después: "suicidio", "hacerme daño", "no puedo más", "crisis", "ayuda urgente", etc.
- **El CTA de ManyChat ("SILENCIO" u otros) debe ser regla de ignore explícita.** El primer mensaje del usuario era el CTA de apertura ("SILENCIO"), y el bot lo trataba como nombre.
- **Contenido educativo solo para awareness bajo (1-2 pts).** Niveles alto no necesitan educar — ya saben que tienen un problema, quieren la solución.
- **Closing pitch ANTES del link.** No solo tirar el link de Calendly. Contextualizar: "Sé que estás listo para resolver esto. Acá podés agendar la consulta inicial..."
- **Follow-up automations van en workflow SEPARADO.** No mezclar el bot reactivo con campañas de re-engagement; complica ambos.

### 3.6 Nodos huérfanos detectados

El JSON del workflow tiene nodos "Crear Lead1" y "Update Timestamp" que referencian una tabla de vehículos — leftover de otro proyecto. Cleanup pendiente.

---

## 4. SmartCheck Costa Rica — inspecciones vehiculares

### 4.1 Contexto

- **Negocio:** inspecciones pre-compra de vehículos usados
- **Canal:** WhatsApp (Evolution API)
- **Técnico:** Esteban (handoff humano para coordinar inspección)
- **Estado:** producción, optimizaciones continuas
- **Cliente ideal:** compradores de vehículos usados antes de cerrar transacción

### 4.2 Arquitectura

```yaml
Tipo: Agente principal + Classifier
Componentes:
  - Classifier/Orquestador
  - Agente SmartCheck (principal)
Modelo: GPT-4.1-mini
Memory: Postgres 15 mensajes
Tools: ninguno
```

### 4.3 Flujo de conversación

```
1. Saludo + preguntar año del vehículo
   → Si <2012: rechazar con contacto de técnico externo
   → Si ≥2012: continuar

2. Capturar: marca, modelo, nombre del usuario
   (ADAPTATIVO: si da todo junto, no re-preguntar)

3. Dar precio según categoría:
   - Sedan: ₡59,000
   - SUV/Crossover/Pickup: ₡64,000 - ₡69,000
   - Premium: precio a confirmar
   NUNCA en dólares — SIEMPRE en colones

4. Preguntar ubicación del vehículo

5. Confirmar interés ("¿Listo para que el técnico te contacte?")

6. Si necesita factura → capturar: cédula + correo + actividad comercial

7. Handoff a Esteban (técnico)
```

### 4.4 Decisiones clave

**Año mínimo 2012.** Lista explícita en el prompt: 2012-2026 válidos. Año <2012 → rechazo con contacto de técnico externo (Johan Andrés Coles).

**Framing crítico.** El usuario es COMPRADOR, no DUEÑO del vehículo. Decir "veo que querés REVISAR un..." (NO "veo que tenés un...").

**Adaptativo a múltiples datos en un mensaje.** Si el usuario da marca + modelo + año en un solo mensaje, capturar todo, no re-preguntar.

**Precios en colones, NUNCA en dólares.** Cambio de USD a colones requería actualizar TODOS los puntos del prompt (no solo uno).

**Handoff post-confirmación.** Cuando el usuario confirma interés, se ejecuta el handoff a Esteban con todos los datos capturados.

### 4.5 Errores reales y soluciones

| Error | Causa | Solución |
|---|---|---|
| Redundancia masiva en anti-repetición | 30% del prompt era reglas repetidas | Consolidar en 1 regla clara |
| ASCII diagrams en prompts | Cuestionable valor para LLMs | Removidos |
| Mezcla USD/colones | Cambio parcial | Actualizar TODOS los puntos del prompt |
| Bot confundía "querés revisar" con "tenés" | Detalle de framing | "veo que querés REVISAR" explícito |

### 4.6 Lecciones aprendidas

- **Redundancia masiva en anti-repetición = desperdicio.** Consolidar en 1 regla clara al inicio.
- **Cambiar de USD a colones requiere actualizar TODOS los puntos.** Hacer search global.
- **Detalles de framing importan.** "Querés revisar" (comprador) vs "tenés" (dueño) cambia la experiencia.
- **Si el usuario pausa para consultar/coordinar → cerrar cordialmente, NO continuar el flujo.** El bot no debe insistir si el usuario dice "déjame consultarlo y vuelvo".

---

## 5. Microcréditos Grandit (Alexa) — microfinanzas

### 5.1 Contexto

- **Negocio:** microfinanzas / préstamos en Costa Rica
- **Canal:** WhatsApp
- **Objetivo:** llevar al usuario a completar formulario de solicitud
- **Estado:** optimizado y en producción
- **Cliente ideal:** personas que necesitan préstamo pequeño rápido

### 5.2 Arquitectura

```yaml
Tipo: Agente único ultra-simple
Componentes: 1 (Alexa)
Modelo: GPT-4o-mini (suficiente para flujo simple)
Memory: ninguna (no necesita)
Tools: ninguno
Chars del prompt: ~3,200 (optimizado desde 4,800)
```

### 5.3 Problema original y solución

**Versión 1 (rota):**
- Bot pedía nombre → cédula → tipo de crédito ANTES de dar el link del formulario
- Usuarios abandonaban antes de recibir el formulario
- Conversión bajísima (estimada <5%)

**Versión optimizada:**
- Enviar link del formulario INMEDIATAMENTE en el primer mensaje
- "¡Hola! Soy Alexa, para saber si calificás completá este formulario (2 min): [URL]"
- Eliminar toda fricción pre-formulario
- El formulario ya captura todos los datos necesarios

**Resultado:**
- Prompt reducido de 4,800 a 3,200 chars
- Eliminadas secciones redundantes
- FAQs acortados a 2-3 líneas
- Flujo ultra-directo

### 5.4 Decisiones clave

**Enviar formulario inmediatamente.** Si el mismo formulario sirve para todos, no preguntar datos antes. El formulario los captura.

**Sin BANT.** Para microfinanzas no aplica calificación previa por el bot — el formulario hace eso con preguntas estructuradas.

**FAQs ultra-cortos.** 2-3 líneas por respuesta. El usuario quiere su préstamo, no una explicación detallada.

### 5.5 Lecciones aprendidas

- **Si el mismo formulario se usa para todos → NO preguntar datos antes.**
- **URLs con variables no resueltas en producción = error fatal.** Verificar que el link es absoluto y funciona en producción.
- **Instrucciones repetidas 3-4 veces en el prompt = desperdicio + confusión.**
- **Inconsistencia entre "misión" y "flujo" del prompt = bot confundido.** Si la "misión" dice "calificar leads" pero el "flujo" dice "enviar formulario", el modelo no sabe qué hacer.
- **A veces la optimización más poderosa es QUITAR pasos, no agregar.**

---

## 6. Level (LEO) — asesoría financiera de inversiones

### 6.1 Contexto

- **Negocio:** asesoría financiera / inversiones
- **Canal:** WhatsApp (YCloud - oficial)
- **CRM:** Notion
- **Agendamiento:** Calendly (calendly.com/kenvarela/asesoria)
- **Equipo:** Ken Varela (asesor) + Valeria (setter)
- **Estado:** en producción
- **Cliente ideal:** capital >= ₡5M, interés en inversión

### 6.2 Arquitectura

```yaml
Tipo: Bot con dos modos
Modos:
  - REACTIVO (inbound): Lead escribe → LEO califica → agenda → notifica
  - PROACTIVO (outbound): Notion → n8n segmenta → YCloud template → si responde → LEO activo

Modelo: GPT-4.1-mini
Memory: Postgres 15 mensajes
```

### 6.3 Flujo proactivo diseñado

**Segmentación de leads en Notion:**

- **Grupo A (Tibios):** contacto reciente, monto registrado → CTA directo a Calendly
- **Grupo B (Fríos):** sin contacto >3 meses → valor primero, luego CTA

**Secuencia tibios:**

```
Día 0: "Soy LEO de Level. Ken quiere retomar contacto. ¿15 min esta semana? [Calendly]"
Día 3 (si no respondió): Recordatorio suave + monto aproximado de Notion
Si responde → LEO toma conversación y califica
```

**Secuencia fríos:**

```
Día 0: Dato educativo sobre inversiones 2025 (valor primero)
Día 1: Dato corto + CTA suave a Calendly
Día 5: Cierre elegante + pregunta abierta
```

### 6.4 Decisiones de stack

**YCloud seleccionado sobre ManyChat porque:**
- Solo necesitan WhatsApp (no Instagram)
- App Coexistence (Ken sigue usando WhatsApp normal)
- 0% markup en mensajes (solo paga tarifas Meta)
- Nodo nativo en n8n
- Mejor para broadcasts proactivos
- Shared inbox para Ken/Valeria

### 6.5 Lecciones aprendidas (las más importantes — ver `08_LECCIONES_LEVEL_KENNETH.md`)

**Patrón: tres versiones por cliente.** Producción + TEST + TELEGRAM, todos con mismos prompts (verificación MD5).

**Los prompts del cliente son la única fuente de verdad.** En Level, un subagente regeneró prompts al crear el JSON de TELEGRAM, cambiando `{nombre}` a `Nombre` y emojis `❌ ✅` a `NO/SI`. Se detectó con hash MD5. Regla: copiar byte-por-byte, NUNCA modificar al generar JSON.

**Information Extractor: los 3 gotchas críticos:**

1. El schema NO es contrato — el LLM renombra campos espontáneamente. Solución: usar nombres cortos (`destino`), meter el formato dentro del prompt, listar nombres prohibidos.
2. NUNCA llaves `{` `}` sueltas en `systemPromptTemplate` — rompe el nodo. Usar YAML dentro del prompt.
3. El Switch debe leer el nombre REAL del campo — no asumir por el schema, inspeccionar el output real.

**Router classifier: patrón completo.** Estructura validada de 9 secciones (ver [Cap 04 §4](04-diseno-prompts.md)).

**Agente principal: estructura de 13 secciones validada.** Empezando con regla anti-repetición, terminando con sección de puntuación.

**Cierre en 2 pasos (CRÍTICO):**
- Paso 5A: PROPONER ("Te interesa que te pase el link?") — SIN link todavía
- Paso 5B: ENVIAR LINK — solo después de confirmación afirmativa
- Después de resolver objeción: 1-2 turnos normales antes de volver a proponer
- Variar cada mensaje que envía el link

**Agente Objeciones LAARC:** todo en UN solo mensaje fluido (no pasos separados). El agente NUNCA intenta agendar directamente — si el lead quiere agendar, redirige al link.

**Sintaxis n8n — gotchas:**
- `.first()` en vez de `.item` (rompe pairedItem)
- Postgres `operation: "deleteTable"` + `deleteCommand: "delete"`
- Telegram `appendAttribution: false`

---

## 7. 97 Display — referencia externa de n8n Community

### 7.1 Contexto

- **Tipo:** agencia de marketing digital para gimnasios/artes marciales
- **Fuente:** template documentado de community.n8n.io
- **Relevancia:** ejemplo de intake flow estructurado
- **No es cliente Momentum** — se incluye como referencia comparativa

### 7.2 Arquitectura

```yaml
Workflow:
  Chat Trigger → AI Agent (GPT-4o) → Window Buffer (10 msgs)
  Tools: Google Sheets (append leads) + HubSpot (CRM) + Gmail (notificación)

Agente: "Ray" (male, friendly, witty)
Intake: 8 preguntas secuenciales obligatorias
```

### 7.3 Intake flow (referencia)

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

### 7.4 Diferencias con la metodología Momentum

| Aspecto | 97 Display | Momentum |
|---|---|---|
| BANT | Interrogatorio (8 preguntas seq) | Conversacional |
| Pedir datos | Antes de dar valor | Después de dar valor |
| Tono | Casual (witty) | Semi-formal costarricense |
| Tools | HubSpot + Google Sheets + Gmail | Airtable o Google Sheets |
| Flujo | Lineal forzado | Adaptativo |

### 7.5 Lo que sí se aprovecha

- **Google Sheets como CRM simple** (appendOrUpdate matching por Email) — patrón útil para clientes pequeños
- **Personalidad casual como referencia de tono** (cuando aplica al cliente)
- **Deflection rule:** si usuario habla de algo no relacionado → redirigir amablemente

---

## 8. Patrones extraídos por tipo de negocio

Esta es la síntesis cross-cliente para guiar decisiones de nuevos proyectos:

### 8.1 Servicios locales (clínicas, salones, inspecciones)

**Casos:** Dr. Carlos, SmartCheck
**Patrón:**
- Arquitectura simple: 1-2 agentes + classifier
- Agendamiento vía Calendly link (hardcoded en prompt)
- Precios en moneda local
- GPT-4.1-mini o GPT-4o-mini si prompt <3k chars
- Canal: WhatsApp o Instagram

### 8.2 Real estate / alquileres

**Casos:** El Canal, Jacó Dream Rentals
**Patrón:**
- Arquitectura: 2-3 agentes + classifier con extracción de datos
- Google Sheets para inventario (live queries) o RAG para catálogo grande
- Round-robin para asignación de vendedores
- NUNCA confirmar disponibilidad/precios exactos
- GPT-4.1-mini siempre (tickets altos, conversaciones complejas)

### 8.3 Microfinanzas / formularios

**Caso:** Grandit
**Patrón:**
- Agente único ultra-simple
- Enviar formulario INMEDIATAMENTE (no preguntar datos antes)
- GPT-4o-mini suficiente
- Flujo ultra-directo: saludo → link → FAQs

### 8.4 Asesoría / consulting

**Caso:** Level
**Patrón:**
- Bot con modo reactivo (inbound) + proactivo (outbound)
- YCloud para broadcasts proactivos
- Segmentación: tibios (CTA directo) vs fríos (valor primero)
- CRM: Notion
- GPT-4.1-mini

---

## 9. Decisiones que funcionaron (resumen cross-cliente)

1. **Eliminar agente de Derivación** (El Canal) — redundante. El agente principal puede compartir WhatsApp del vendedor.
2. **Enviar formulario inmediatamente** (Grandit) — eliminó abandono masivo.
3. **Agente único con RAG** (Jacó) — para negocios simples, multi-agente es overkill.
4. **String detection para notificaciones** (Dr. Carlos) — no requiere JSON estructurado del agente.
5. **Descalificación elegante** (El Canal) — script específico evita ofender al lead.
6. **Preguntar bebida antes de la cita** (El Canal) — humaniza la interacción.
7. **Scoring 0-5 para calificación** (Dr. Carlos) — Hot/Warm/Cold con respuesta diferenciada.
8. **Detector de descalificación post-respuesta** (El Canal) — segunda capa de defensa.
9. **Round-robin por hora** (El Canal) — simple, predecible, suficiente.
10. **Multilingüe vía campo del router** (Jacó) — una plantilla, 5 idiomas.

---

## 10. Errores comunes documentados (resumen cross-cliente)

1. **Bot pregunta dos veces lo mismo** — classifier no extrae datos del historial → solución: agregar extracción.
2. **Bot pide aclaración de moneda innecesaria** — "millones" se interpretaba ambiguamente → solución: detección contextual.
3. **Bot pregunta horarios sin acceso a calendario** → solución: eliminar pregunta, derivar a humano.
4. **Token limit del classifier bajo** → JSON vacío o cortado. Solución: subir a 500-1000 tokens.
5. **Redundancia masiva en anti-repetición** → 30% del prompt era duplicado. Solución: consolidar.
6. **Bot confundía framing comprador vs dueño** → detalle de palabras importa. Solución: framing explícito en prompt.
7. **CTA de ManyChat tratado como nombre** → "SILENCIO" era el CTA de apertura. Solución: regla de ignore.
8. **Prompt creció 5.8% sin razón** → control activo de longitud necesario.
9. **Nodos huérfanos en workflows** → leftover de otros proyectos. Solución: cleanup pre-deploy.
10. **Drift de prompts entre n8n y repo** → equipo edita prompts directo en n8n. Solución: el `.md` es fuente de verdad.

---

## 11. Casos legales como recordatorios

### 11.1 Air Canada (2023)

- Bot prometió descuento por duelo que no existía
- Compañía rechazó reembolso
- Terminó en lawsuit, corte falló contra Air Canada
- **Lección:** la empresa es legalmente responsable de lo que su chatbot promete. El bot NUNCA hace compromisos vinculantes.

### 11.2 Chevy Dealership (2023)

- Bot confirmó compra de Tahoe por $1 (sin guardrails de precio)
- No se concretó la venta, pero daño reputacional viral
- **Lección:** SIEMPRE validar rangos de precio. NUNCA permitir transacciones directas.

---

**Siguiente:** [Capítulo 09 — Troubleshooting y optimización](09-troubleshooting.md)

**Anterior:** [Capítulo 07 — Variantes del workflow](07-variantes-canal.md)
