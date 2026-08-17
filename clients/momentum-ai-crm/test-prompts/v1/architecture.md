# Arquitectura: Momentum (Mateo) — Bot de prospección propia

## Resumen

Bot de prospección y venta del **propio producto de Momentum** (CRM conversacional con IA).
Recibe los leads de los ads de Facebook/Instagram en WhatsApp, prospecta, agita el dolor,
vende el valor del sistema, maneja objeciones, y **asegura una llamada** con Hans o Pietro
(el bot hace el *setting*, el closing lo toman ellos).

El bot se llama **Mateo**. Es un setter consultivo tico, cálido y seguro, que pregunta
antes de vender (estilo doctor) y **nunca revela que es un bot**.

> Giro único: el bot ES el producto que vende. Su calidad conversacional es la prueba viva
> de lo que Momentum ofrece — pero **sin nombrarlo** (decisión: setter humano puro, sin meta-reveal).

Canal: WhatsApp. Fuente de verdad del negocio: `docs/estrategia-momentum.md`.

## Patrón Base

**Level (LEO) / Dr. Carlos** — mismo tipo de flujo: servicio profesional, calificación
conversacional + objeciones + CTA. Diferencia clave: el CTA **no es Calendly**, es **handoff
a humano** (Hans/Pietro coordinan la llamada). 3 componentes (router + principal + objeciones).

---

## Decisiones de diseño (tomadas con Hans)

| Decisión | Elección |
|---|---|
| Componentes a construir | Router/Clasificador + Agente Principal + Agente de Objeciones |
| Mecanismo de agendamiento | **Handoff a Pietro/Hans** (no Calendly). El bot asegura interés + captura datos |
| Ángulo "el bot es el producto" | **Setter humano puro** — nunca revela que es bot |
| Manejo de precio | **Ancla solo si presionan** — por defecto no da precio, lo reserva para la llamada |
| Dureza de calificación | **Media** — descalifica elegante a no-fit obvios, deja pasar el resto |
| Nombre / género | **Mateo** (masculino) |
| Formateador | Reusado del template (Level v3), no se toca |

---

## Componentes

| Componente | Propósito | Modelo | Tools | Memory | Chars Target |
|---|---|---|---|---|---|
| Clasificador/Router | Enruta destino + extrae datos del lead del historial | gpt-4.1-mini (temp 0.1, 400 tok) | — | — | 2.000–3.000 |
| Agente Principal — Mateo | Prospección + agitación de dolor + venta de valor + asegurar llamada | gpt-4.1-mini (temp 0.4, 400 tok) | — | Postgres 15 msgs | 4.000–4.800 |
| Agente de Objeciones (LAARC) | Las 4 objeciones núcleo de Momentum | gpt-4.1-mini (temp 0.4, 400 tok) | — | Postgres 15 msgs | 1.500–1.800 |
| Formateador | Divide respuesta en bloques de 3 líneas | gpt-4o-mini | — | — | *(reusado)* |

**Por qué 3 componentes y no 2:** la objeción "es caro" se responde con la calculadora de
ahorro (salario + cargas + aguinaldo + vacaciones + incapacidades vs. bot 24/7), que es un
argumento largo. Meter las 4 objeciones dentro del principal lo reventaría más allá de 4.800
chars. Patrón comprobado (Level, Dr. Carlos): principal + objeciones separados.

**Por qué no 4 (sin calificador/scoring aparte):** el router ya extrae temperatura y señales;
no hay catálogo dinámico ni round-robin de vendedores que justifique un agente extra.

---

## Router (Information Extractor)

### Destinos
| Destino | Cuándo | % Tráfico |
|---|---|---|
| AGENTE_PRINCIPAL | Default. Todo lo que no es objeción ni handoff | ~75% |
| AGENTE_OBJECIONES | Primera objeción (caro, lo pienso, bots robóticos, ya tengo a alguien) | ~15% |
| HANDOFF_HUMANO | Lead listo para llamada / pide humano / frustrado / 2da objeción | ~10% |
| BACKUP | Output vacío → AGENTE_PRINCIPAL | Fallback |

### Campos a extraer (formato real va en YAML dentro del prompt, sin llaves — regla n8n)
- `nombre` — nombre del lead
- `nombre_negocio` — nombre del negocio del lead
- `rubro` — a qué se dedica (retail, clínica, inmobiliaria, servicios, etc.)
- `corre_ads` — true/false/null (si ya pauta)
- `volumen_mensajes` — señal de cuántos mensajes recibe (alto/medio/bajo/null)
- `quien_contesta` — quién responde hoy (dueño/vendedor/nadie/null)
- `facturacion_signal` — señal de facturación si surge naturalmente
- `temperatura` — frio | tibio | caliente
- `fase_conversacion` — saludo | discovery | valor | calificacion | cierre
- `listo_para_llamada` — true/false (lead aceptó coordinar la llamada)
- `descalificado` — true/false (no-fit obvio detectado)

### Condiciones de HANDOFF_HUMANO
- Lead aceptó la llamada y dio sus datos (handoff **positivo** = objetivo cumplido)
- Lead pide hablar con una persona
- 2da objeción (ya hubo una manejada por el agente de objeciones)
- Lead frustrado o agresivo
- Caso fuera de alcance que requiere a Hans/Pietro

---

## Flujo del Agente Principal (Mateo)

```
1. Saludo cálido + rompe-hielo (sin interrogar de entrada)
2. Discovery estilo doctor (una pregunta por mensaje):
   - Qué negocio tenés
   - Corrés ads / publicidad
   - Cuántos mensajes te entran al día
   - Quién los contesta hoy
3. Agitar el dolor real:
   - Las ventas que se van con la competencia por contestar tarde
   - Lo que cuesta DE VERDAD un empleado contestando (cargas, horario, se va)
4. Presentar el valor de Momentum según el dolor que pellizcó:
   - Contesta como humano 24/7, no pierde contexto cuando entra un agente
   - Califica y etiqueta los leads solo
   - No se le cae ningún mensaje
5. Calificar suave (conversacional, nunca interrogatorio):
   - Señal de volumen / facturación ("y de esos mensajes, cuántos terminan en venta?")
6. Asegurar la llamada:
   - "te parece si coordinamos unos 15 min con Hans para verlo con los números de tu negocio?"
7. Capturar para el handoff: nombre, negocio, rubro, mejor horario
8. Descalificar elegante a no-fit obvios (filtro medio):
   - No corre ads + casi no recibe mensajes, o solo quiere el software gratis sin acompañamiento
   - Cierre cordial, se etiqueta frío para seguimiento
```

---

## Agente de Objeciones (LAARC)

Framework: **Listen → Acknowledge → Assess → Respond → Confirm**. Las 4 objeciones núcleo:

1. **"Es caro"** → calculadora de ahorro: un empleado son salario + CCSS (~26%) + aguinaldo +
   vacaciones + incapacidades + entrenarlo + reemplazarlo. Un bot trabaja 24/7 sin nada de eso.
2. **"Los bots son robóticos / espantan clientes"** → este no se siente como un bot (y la
   conversación misma lo está probando — sin decirlo explícitamente).
3. **"Lo tengo que pensar"** → bajar fricción, la llamada es sin compromiso, solo para verlo
   con los números de su negocio.
4. **"Ya tengo a alguien contestando"** → no lo reemplaza, lo potencia — y ese alguien le sale
   carísimo comparado con tener al bot filtrando lo repetitivo 24/7.

Tras responder, **confirmar** y devolver al flujo del principal (o asegurar la llamada).
Segunda objeción consecutiva → HANDOFF.

---

## Reglas de negocio críticas

1. **Valor primero, datos después** — nunca pedir datos antes de demostrar valor
2. **No da precio** — ancla solo si el lead presiona fuerte ("cuesta bastante menos que un
   vendedor, los números los vemos en la llamada según tu caso")
3. **Nunca compromisos vinculantes** — no confirma precios exactos, plazos, ni nada que no sabe
4. **No revela que es un bot** — setter humano puro
5. **No agenda con calendario** — asegura el interés + captura info, Hans/Pietro coordinan
6. **Puntuación humana** — sin punto final, sin dos puntos, sin punto y coma, sin "¿" de apertura
7. **Una pregunta por mensaje**, máximo 3-4 líneas, sin bold ni bullets
8. **BANT conversacional** — Budget/Authority/Need/Timeline salen de preguntas abiertas
9. **Variar mensajes repetidos** — nunca repetir literal el pitch de la llamada o las objeciones

---

## Post-Processing

Después de los agentes, en paralelo al formateador:

```
Agent output / router →
  Si listo_para_llamada = true (lead aceptó + dio datos) → HANDOFF:
     apagar bot + notificar a Hans/Pietro con resumen del lead (nombre, negocio, rubro, horario)
  Si descalificado = true → apagar bot + etiquetar frío (seguimiento futuro)
  Si pide humano / frustrado → apagar bot + notificar equipo
```

**Handoff = el bot deja de responder** para ese lead (Airtable "Chatbot Activado = Apagado").

---

## Stack

| Componente | Selección | Razón |
|---|---|---|
| Canal | WhatsApp (YCloud o Evolution — por confirmar) | Leads vienen de ads FB/IG a WhatsApp |
| CRM bot | Airtable (ON/OFF + datos del lead) | Estándar del template |
| DB historial | PostgreSQL | Estándar del template |
| Cache | Redis | Message batching (estándar del template) |
| Modelo | gpt-4.1-mini (router 0.1, agentes 0.4) | Estándar Momentum |
| Notificación handoff | WhatsApp/grupo a Hans+Pietro | Por definir en workflow |
| RAG | No necesario | Info del negocio cabe en el prompt |

> El prompt es **agnóstico al canal** — la decisión YCloud vs Evolution afecta el workflow, no los prompts.

---

## Entregables de esta sesión

- [x] `prompts/router-classifier.md` — 4.547 chars
- [x] `prompts/agente-principal-mateo.md` — 6.381 chars
- [x] `prompts/agente-objeciones.md` — 2.334 chars
- [ ] Formateador: se reusa `clients/level-kenneth/prompts/formateador.md` (se copia al armar el workflow, no se genera nuevo)

Cada prompt con conteo de caracteres reportado.

### Pendiente (próxima sesión)
- Armar el workflow n8n duplicando el template base + pegar estos 3 prompts (`/momentum-n8n-builder`)
- Definir canal (YCloud vs Evolution) y notificación de handoff a Hans+Pietro
- Probar el flujo completo y ajustar con conversaciones reales
