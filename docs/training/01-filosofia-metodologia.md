# 01 — Filosofía y metodología núcleo

Este capítulo establece las reglas que rigen todo el sistema. Ninguna de las decisiones de los capítulos posteriores tiene sentido sin entender estos principios.

---

## 1. Los tres principios rectores

### 1.1 Arquitectura modular sobre monolítica

**Regla:** un chatbot Momentum se compone siempre de múltiples componentes especializados, nunca de un único prompt grande que intente hacerlo todo.

**Justificación:** la evidencia de 18+ proyectos en producción es categórica. Un prompt de >5,000 caracteres ejecutado por GPT-4o-mini produce los siguientes fallos repetibles:
- Olvido de instrucciones tempranas del prompt en conversaciones de más de 8-10 turnos
- Repetición de preguntas ya respondidas por el usuario
- Invención de datos cuando la información no está en contexto
- Inconsistencia entre la sección de "misión" y la sección de "flujo"

Un sistema modular con un router + un agente principal + 0-3 agentes especializados + un formateador mantiene coherencia >95% porque cada componente tiene un solo propósito y un prompt corto que el modelo no puede ignorar.

**Implicación operativa:** cuando un cliente pida algo nuevo, la pregunta no es "¿cómo lo agrego al prompt?" sino "¿debe ir en el agente principal, en un especialista nuevo, o en post-processing?". Ver [Capítulo 02](02-arquitectura-modular.md) para los criterios de decisión.

### 1.2 Cambios quirúrgicos sobre reescrituras

**Regla:** cuando un prompt funciona en un 70-80%, los cambios se hacen aislando los puntos exactos que fallan y modificando solo esos. La reescritura completa es la última opción.

**Justificación:** los prompts en producción contienen, además del contenido visible, una historia de ajustes finos que resolvieron problemas concretos. Reescribir desde cero borra esa historia y reintroduce los problemas que ya estaban resueltos. Además, un cambio quirúrgico es verificable (se mide el impacto del cambio aislado) y reversible (si empeora, se revierte ese punto sin perder lo demás).

**Operativa:**
- Identificar el síntoma específico (ej: "el bot repite el nombre del usuario en cada mensaje")
- Localizar la sección del prompt responsable
- Hacer un único cambio
- Probar con 5 conversaciones que previamente reproducían el problema
- Verificar que el conteo total de caracteres no se disparó
- Documentar el cambio y su efecto

### 1.3 Valor primero, datos después

**Regla:** el bot nunca pide datos de contacto (email, teléfono, cédula) antes de demostrar valor concreto al usuario.

**Justificación:** este principio se documentó con datos duros en el caso Microcréditos Grandit ([Capítulo 08 §5](08-casos-estudio.md)). Cuando el bot pedía nombre + cédula + tipo de crédito **antes** de enviar el link del formulario, el abandono era del 70%. Al cambiar a "enviar el link inmediatamente y dejar que el formulario capture los datos", la conversión se invirtió.

**Excepción documentada:** los datos sí se piden cuando el usuario ya recibió valor (ej: el bot dio la información que pedía) y se está en fase de cierre. La regla es sobre el **orden**, no sobre nunca pedir datos.

---

## 2. Las 22 reglas no negociables

Esta es la lista de referencia. Cada regla está expandida en su capítulo correspondiente. Si una regla se viola, hay consecuencias documentadas; no son preferencias estéticas.

### 2.1 Arquitectura (5 reglas)

| # | Regla | Cap |
|---|---|---|
| 1 | Arquitectura modular siempre — 3-5 componentes especializados, nunca mega-prompt | [02](02-arquitectura-modular.md) |
| 2 | Un propósito por agente — si hace dos cosas, dividir | [02](02-arquitectura-modular.md) |
| 3 | Agente principal = DEFAULT — cuando hay duda en routing, va al principal | [02](02-arquitectura-modular.md) §3.3 |
| 4 | Máximo 3-4 destinos en routing — demasiadas rutas confunden al clasificador | [02](02-arquitectura-modular.md) §3 |
| 5 | Template base se duplica — nunca se crea workflow desde cero | [06](06-workflow-n8n.md) |

### 2.2 Prompts (7 reglas)

| # | Regla | Cap |
|---|---|---|
| 6 | Agente principal: 3,000-5,000 chars (hasta 6,500 con gpt-4.1-mini) | [04](04-diseno-prompts.md) §3 |
| 7 | Agentes especializados: 1,000-2,000 chars | [04](04-diseno-prompts.md) §3 |
| 8 | Router/Classifier: 1,500-3,500 chars, output JSON puro | [04](04-diseno-prompts.md) §4 |
| 9 | Cambios quirúrgicos, nunca reescrituras | [04](04-diseno-prompts.md) §2 |
| 10 | Si no sabe, no inventa — "Dejá verifico eso" | [04](04-diseno-prompts.md) §5 |
| 11 | Regla anti-repetición una sola vez, en las primeras 500 chars | [04](04-diseno-prompts.md) §6 |
| 12 | Conteo de caracteres reportado después de cada cambio | [04](04-diseno-prompts.md) §2.1 |

### 2.3 Ventas (4 reglas)

| # | Regla | Cap |
|---|---|---|
| 13 | Valor primero, datos después | [04](04-diseno-prompts.md) §7 |
| 14 | BANT conversacional, nunca interrogatorio | [04](04-diseno-prompts.md) §7.2 |
| 15 | Nunca compromisos vinculantes (precios exactos, disponibilidad confirmada) | §3 abajo |
| 16 | Handoff = el bot deja de responder — sin mensaje "te paso con alguien" | [02](02-arquitectura-modular.md) §5 |

### 2.4 Formato y tono (6 reglas)

| # | Regla | Cap |
|---|---|---|
| 17 | Máximo 3-4 líneas por mensaje, una pregunta por mensaje | [04](04-diseno-prompts.md) §8 |
| 18 | Sin bold (`**texto**`), sin bullets, emojis moderados | [04](04-diseno-prompts.md) §8 |
| 19 | Tono semi-formal costarricense por default — "vos", "querés", "tenés" | [04](04-diseno-prompts.md) §9 |
| 20 | Siempre nombre propio del bot, personalidad consistente | [04](04-diseno-prompts.md) §9 |
| 21 | Puntuación humana — sin `:`, sin `;`, sin `¿`, sin punto final, sin `—` | [04](04-diseno-prompts.md) §10 |
| 22 | Variar mensajes repetidos — la repetición textual delata al bot | [04](04-diseno-prompts.md) §11 |

---

## 3. Restricciones legales y operativas

### 3.1 Compromisos vinculantes (CRÍTICO)

El bot NUNCA debe hacer compromisos que la empresa podría no poder cumplir. Esto incluye:

- **Precios exactos sin verificar** — solo dar rangos o redirigir a un link donde el cliente vea el precio dinámico
- **Disponibilidad confirmada** — el bot no tiene acceso a calendarios reales; decir "está disponible" es inventar
- **Descuentos o promociones** — solo los que estén explícitamente autorizados y vigentes
- **Productos o servicios que no se ofrecen** — incluye condiciones especiales, financiamiento no aprobado, entregas fuera de cobertura
- **Tiempos de entrega o respuesta** — solo si están en políticas oficiales del cliente

**Casos documentados:**

- **Air Canada (2023):** un chatbot prometió un descuento por duelo que no existía en la política. La compañía rechazó el reembolso, terminó en lawsuit y la corte falló a favor del usuario. Precedente: la empresa es responsable de lo que su chatbot promete.
- **Chevy Dealership (2023):** un chatbot confirmó la "venta" de una camioneta Chevy Tahoe por $1 sin guardrails de precio. Aunque la venta no se concretó, el incidente fue viral y daño reputacional.

**Implicación operativa:** en cada prompt del agente principal, debe haber una sección explícita de "NUNCA prometás X" enumerando lo que el bot no puede ofrecer en ese negocio específico.

### 3.2 Promesas vacías de material (CRÍTICO)

El bot solo puede entregar dos cosas:

- **Links** (Calendly, web, comunidades, formularios, propiedades)
- **Texto conversacional**

NO puede enviar (y por lo tanto **no debe prometer**):

- PDFs, brochures, catálogos
- Videos grabados, audios
- Imágenes
- Material educativo genérico que no tenga un link concreto

**Regla operativa:** durante el discovery, verificar para cada material que el cliente menciona si existe un **link concreto** que el bot pueda compartir. Si no hay link, el material no debe aparecer en el prompt. Es preferible cerrar cordialmente que prometer algo que nunca llega.

**Frase comprobada para evitar:** _"Te puedo compartir contenido educativo"_ — sin un link real detrás, es promesa vacía.

### 3.3 Handoff a humano

**Definición:** cuando el bot deja de responder a un lead específico, y un humano del equipo del cliente toma la conversación. No es un saludo automático ni un mensaje de "te paso con alguien".

**Criterios universales de handoff:**

1. Usuario pide explícitamente hablar con un humano
2. 3+ mensajes de frustración consecutivos del usuario
3. Objeción que requiere negociación real (no manejable por LAARC)
4. Lead altamente calificado listo para cerrar
5. Información que el bot no puede verificar (consultas técnicas, legales, médicas específicas)
6. Loop sin avance: 3+ mensajes consecutivos completamente fuera de contexto

**Mecanismo técnico:**

- En Airtable: se setea el campo "Chatbot Activado = Apagado" para ese lead
- En la próxima recepción de mensaje del mismo número/usuario, el workflow lee Airtable y termina inmediatamente
- Notificación al equipo por Discord/WhatsApp para que tomen la conversación

**Por qué sin mensaje de despedida:** decir "te paso con alguien" + esperar genera la expectativa inmediata de respuesta humana. Si el humano no responde en minutos, el usuario abandona. Es mejor que la conversación simplemente continúe con un humano (el lead no nota la transición si el handoff es rápido).

---

## 4. El loop de mejora

El sistema mejora con cada cliente. La disciplina operativa es:

```
Cliente nuevo → Pipeline (7 pasos) → Deploy → Monitoreo semana 1
        ↑                                              ↓
        ↑                                       Iteración (semanas 2-4)
        ↑                                              ↓
        ↑                                       Patrones nuevos identificados
        ↑                                              ↓
        ←──── Extraer a templates anonimizados ←──────┘
```

**Lo que se extrae al templates después de cada cliente:**

- **Patrones de prompt nuevos** — frases que funcionaron especialmente bien, estructuras de flujo, manejo de objeciones específicas
- **Nodos n8n nuevos** — integraciones con servicios no usados antes (ej: Calendly API, Stripe, Notion)
- **Configuraciones técnicas críticas** — descubrimiento de un gotcha (ej: `responseMode: "onReceived"` en YCloud) se documenta en [09 — Troubleshooting](09-troubleshooting.md) y se aplica a todos los workflows futuros
- **Tipos de agente especializado nuevos** — si emergió uno (ej: agente de descalificación post-respuesta), se anonimiza y se agrega al catálogo

**Lo que NO se extrae:**

- Información específica del cliente (nombres reales, links, precios)
- Decisiones de negocio del cliente (su política interna)

**Dónde viven los templates anonimizados:**

- [`knowledge/workflows-reference/`](../knowledge/workflows-reference/) — workflows reales de clientes (template-base de Jacó, Dr. Carlos, El Canal) con sus prompts originales como referencia
- [`knowledge/workflow-variants-templates/`](../knowledge/workflow-variants-templates/) — templates genéricos por canal (TEST, TELEGRAM, YCLOUD, YCLOUD-AUDIO)

---

## 5. Errores fatales comprobados

Esta es la lista de cosas que destruyen conversiones, en orden de impacto. Cada una está documentada con un caso real:

1. **Mega-prompt con GPT-4o-mini** — olvida instrucciones, inventa. Síntoma: el bot da respuestas inconsistentes a la misma pregunta. Fix: dividir en módulos o subir a GPT-4o.
2. **Pedir email/teléfono antes de dar valor** — 70% de abandono. Caso: Grandit pre-optimización.
3. **BANT como interrogatorio** — el usuario se siente encuestado. Caso: prototipos iniciales de El Canal.
4. **Sin nombre ni personalidad del bot** — desenganche en 8 segundos.
5. **Bot confirma disponibilidad que no sabe** — información falsa = liability legal. Caso: Air Canada.
6. **Bot da precios exactos sin verificar** — compromisos incumplibles. Caso: Chevy.
7. **Instrucciones repetidas 3-4 veces en el prompt** — desperdicio + confusión del modelo. Caso: SmartCheck pre-optimización (30% del prompt era redundante).
8. **Demasiados edge cases "por si acaso"** — complejidad innecesaria, el modelo prioriza casos raros sobre el flujo normal.
9. **"Te voy a pasar X" sin darlo en el mismo mensaje** — UX roto en n8n. En n8n cada agente responde una vez por turno; no hay chaining intra-turno. Caso: El Canal v1.
10. **Formato bold/bullets en WhatsApp** — no renderiza, se ve como texto literal con asteriscos.

---

## 6. Métricas objetivo

Toda implementación se mide contra estos números. Si la implementación no los alcanza en producción dentro de las primeras 4 semanas, hay un problema que debe diagnosticarse con el [Capítulo 09](09-troubleshooting.md).

```yaml
Conversión (chat → lead calificado): 30-40%
Coherencia conversacional: >95%
Latencia total por turno: <3 segundos
Abandono: <20%
Calificación BANT (3 de 4 criterios capturados): >60%
Costo por chat completo: <$0.10
Sweet spot de conversación: 10-15 mensajes para calificación exitosa
```

**Contexto de industria:**

- E-commerce sin chatbot: 3.1% conversión
- E-commerce con chatbot estándar: 12.3% conversión
- B2C Products top performers: 35.2%
- Software/SaaS: 27.3%
- Real Estate: 18-46% (alta varianza)
- Regla 100-10-1 (baseline): 100 ven el bot → 10 chatean → 1 convierte

Un chatbot Momentum bien hecho supera el percentil 90 de la industria.

---

## 7. Cuándo este sistema NO es la solución correcta

Por completitud, los casos donde un chatbot conversacional Momentum no es la herramienta indicada:

- **Procesos transaccionales puros** sin ventas — si el cliente solo necesita aceptar pagos o consultar un estado, un formulario web es más barato y más confiable
- **Compliance estricto** con auditoría completa de cada interacción — un bot generativo siempre tiene riesgo residual de alucinación
- **Soporte técnico de productos complejos** — un sistema de tickets con knowledge base estructurada funciona mejor que un LLM para troubleshooting determinista
- **Volumen extremadamente bajo** (<5 conversaciones/semana) — el costo de implementación no se justifica
- **Cliente que quiere un "agente totalmente autónomo"** que cierre ventas sin supervisión — el bot califica y deriva; el cierre lo hace un humano

En estos casos, comunicar honestamente al cliente que no es el producto adecuado fortalece la marca más que aceptar un proyecto que va a fallar.

---

**Siguiente:** [Capítulo 02 — Arquitectura modular](02-arquitectura-modular.md)

**Anterior:** [README](README.md)
