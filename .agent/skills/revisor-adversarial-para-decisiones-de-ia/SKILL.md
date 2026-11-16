---
name: revisor-adversarial-para-decisiones-de-ia
description: Usar cuando un LLM toma una decisión con criterios que escribió una persona (mover el estado de un contacto, calificar un lead, clasificar un ticket, aprobar algo, moderar) y la decisión se adelanta o se inventa. La verificación robusta y barata es un SEGUNDO pase con otro encargo, "¿qué falta?", no más instrucciones de autocontrol al mismo pase. Se dispara con "el modelo mueve antes de tiempo", "marca de más", "le dije que si duda no mueva y sigue", "¿cómo verifico lo que decide la IA?".
---

# Skill: Revisor adversarial para decisiones de IA

## Cuándo usar esta skill

- Un modelo **decide algo que dispara una acción** (cambia un estado, asigna una categoría, aprueba, descarta) leyendo criterios que **escribió un humano** en lenguaje natural: la descripción de una etapa, una política, una rúbrica.
- La decisión se **adelanta**: el modelo marca el estado con medio criterio cumplido ("dijo que sí" cuando el criterio pedía "confirmó y ya se le mandó el link").
- Ya probaste "cuando dudes, no muevas" o "solo si se cumplen TODAS las condiciones" en el prompt y **no alcanzó**.
- Cada retoque del prompt arregla unos casos y **rompe otros**, y no tenés cómo saber cuáles hasta que pasa en producción.
- Cross-project: clasificadores de tickets, scoring de leads, aprobaciones automáticas, moderación, cualquier pipeline donde un LLM elige y el código ejecuta.

## Por qué existe esta skill

Capturada el 2026-10-19 de MOM-133 en el CRM de Momentum (17 al 19-10). Un "analista" (gpt-4.1) lee las conversaciones de WhatsApp y mueve el estado del contacto según la **descripción de cada estado** que escribe el negocio.

Del 12 al 17-10, **10 de 10 pases automáticos a «Llamada agendada» fueron antes de tiempo.** La descripción decía "confirmó día y hora y ya se le envió el link de la llamada", y el modelo movía con un "sí", un "a las 9am?" o un correo. El prompt ya decía "cuando dudes, no muevas".

| Lo que parecía el arreglo | Lo que pasó, medido con el modelo real |
|---|---|
| "Cuando dudes, no muevas" | Siguió moviendo: el modelo no "duda", está seguro de que un "sí" alcanza |
| Pedirle al MISMO modelo que parta la descripción en condiciones y cite un mensaje por cada una | Reescribía las condiciones para que le cerraran ("el negocio propuso el link **o** la reunión es por Meet"), contaba "día" y "hora" como dos condiciones y **se olvidaba de la del link**, o juntaba dos mensajes en una cita ("…mañana 1pm? Lead: Está bien") |
| Poner el campo de evidencia ANTES del de decisión en el JSON schema | Dejaba la evidencia vacía y elegía igual |
| Una instrucción sobre las condiciones negativas ("las que dicen que algo todavía NO pasó no se citan") | Rompió la detección del link, que antes funcionaba |
| **Un revisor aparte, con otro encargo: buscar qué falta** | **26 de 26.** Los 10 prematuros frenados en 20 de 20 corridas, sin frenar los pases buenos |

Y había una causa de fondo que ningún prompt arreglaba: **el analista decidía solo con los mensajes del lead**, pero media descripción hablaba de lo que hizo el negocio (mandar el link). Con esa entrada el estado **no se podía cumplir con evidencia**: el modelo o lo marcaba de más o no lo marcaba nunca.

> La idea central: **el que decidió no es buen juez de su propia decisión.** El autocontrol del mismo pase es frágil y cambia con cada retoque. Un segundo pase cuyo único trabajo es encontrar lo que falta no tiene nada que justificar, y por eso encuentra.

## Proceso

### 1. Ver si el criterio se puede cumplir con lo que le das al modelo

Antes de tocar el prompt, por cada criterio: **¿la evidencia que lo cumple está en lo que el modelo lee?**

- Si el criterio habla de lo que hizo **el otro lado** (el negocio mandó el link, el agente respondió, el pago se acreditó), el modelo tiene que **ver ese lado**. En el CRM: los "mensajes nuevos" pasaron a ser de los dos lados.
- Separar qué decisión usa qué evidencia: **el estado** se decide con los dos lados; **los datos y la calificación** del contacto siguen saliendo solo de lo que dijo el lead (si no, el modelo le atribuye al lead lo que dijo el negocio).
- Si un criterio no se puede cumplir con nada de lo que el modelo ve, no hay prompt que lo salve. Se arregla la entrada, no las instrucciones.

### 2. Armar el banco de replay ANTES de tocar nada

Sin banco, cada retoque es una apuesta (ver el gotcha de las condiciones negativas). El banco reproduce **casos reales de producción** con el código actual contra el **modelo real**:

- Por cada decisión real, reconstruir **lo que vio el modelo en ese momento**: los mensajes que existían, el cursor del análisis anterior y el estado que tenía el contacto ANTES.
- Dos corridas por caso (el modelo no es determinista ni con temperatura baja).
- Casos de los dos tipos: los que **no** tienen que moverse (los prematuros) y los que **sí** (el link mandado por el equipo, el primer pase legítimo). Sin los segundos, un revisor que frena todo saca 100%.
- La expectativa de cada caso se escribe **contra la regla escrita del negocio**, no contra lo que hizo el sistema viejo.

En el CRM: `crm-v2/scripts/replay-analista-etapas.ts` (no escribe en la base: usa la función que piensa, no la que aplica).

### 3. No pedirle autocontrol al mismo pase

Lo que hay que resistir es la tentación de seguir agregando reglas al prompt del que decide: "partí la descripción", "citá cada condición", "si falta una no muevas". El modelo que ya eligió reescribe las condiciones para que encajen con lo que eligió. Esto se midió (ver la tabla) y no es un problema de redacción: **es un problema de encargo.**

### 4. El revisor: segunda llamada, otro encargo

- **Cuándo corre:** solo cuando el primer pase quiere **actuar** (mover un estado) **y** el criterio de destino tiene texto escrito. Sin descripción no hay qué revisar: eligió por el nombre. En el CRM son unas 175 veces por semana entre todos los negocios, menos de US$1 por semana.
- **Configuración:** temperatura 0, tope de ~300 tokens, JSON schema estricto con **el repaso primero y el veredicto después**:

```ts
const ESQUEMA_DEL_REVISOR = {
  type: 'object', additionalProperties: false,
  required: ['revision', 'falta'],
  properties: {
    revision: { type: 'string' },          // primero: el modelo escribe en orden
    falta: { type: ['string', 'null'] },   // null = todo cumplido
  },
};
```

- **El prompt** (el del CRM, generalizable a cualquier criterio):

```
Revisás un cambio de etapa antes de que se aplique. No decidís la etapa: buscás si le falta algo.
Te paso la descripción de la etapa y la conversación. Tu trabajo es encontrar qué parte de la
descripción NO está cumplida por algo que esté escrito en la conversación.

Cómo revisar
- Leé la descripción frase por frase. Cada cosa que dice que pasó tiene que estar en un mensaje concreto.
- Si la descripción junta varias cosas con "y", son varias: tienen que estar todas.
- Proponer, preguntar o aceptar un horario no es una cita confirmada.
- Que el negocio diga que lo va a hacer ("te mando el link") no es que lo hizo.
- Lo que la descripción dice que todavía NO pasó se cumple si nada en la conversación lo contradice.
- En la descripción, "vos" se refiere al negocio.

revision: en dos o tres frases, qué pide la descripción y qué encontraste de cada parte.
falta: null si TODO está cumplido. Si falta algo, en una frase qué falta.
```

- **Si el revisor falla o responde roto, no se actúa.** Una respuesta que no se puede leer cuenta como "falta". Es fallar hacia el lado barato: un estado adelantado le dice al equipo que algo pasó cuando no pasó; uno atrasado se corrige en el próximo mensaje. (En otros dominios el lado barato puede ser el opuesto: decidilo explícito, ver `config-que-deja-el-sistema-mudo` y `clasificar-por-lista-no-por-fallback`.)
- **Guardar el motivo.** Cuando el revisor frena, queda en los avisos del análisis (`revisor: no va llamada-agendada, falta: …`). Sin eso, "no movió" es indistinguible de "no se dio cuenta".

### 5. Red complementaria contra lo INVENTADO: citas verificadas por código

El revisor ataca lo que **falta**. Lo que el modelo **inventa** (una cita parafraseada, una que pega dos mensajes) se ataca con código, que no se deja convencer:

- El primer pase devuelve las citas de los mensajes que justifican la decisión.
- El código **parte la conversación en mensajes** por rótulo (`Lead:` / `Negocio:`), uniendo las líneas de un mismo mensaje.
- Normaliza las dos cosas (minúsculas, sin tildes, sin puntuación, espacios colapsados) y exige que **cada cita esté dentro de UN SOLO mensaje.** Contra el texto corrido se escapaba justo la cita que juntaba dos mensajes.
- Le saca a la cita el rótulo que el modelo a veces antepone (`Lead: …`) y las comillas sueltas.
- Sin cita, o con una cita que no está en ningún mensaje: no se actúa.

### 6. Medir con el banco y comparar versiones

Correr el banco con el código viejo, con cada variante y con la final. Mirar **las regresiones**, no solo el total: una variante que sube de 41 a 47 rompiendo casos que antes pasaban no es una mejora estable.

## Gotchas

- **El historial del estado incluye el cambio que hizo el propio análisis.** Para saber qué estado tenía el contacto ANTES, se corta en `created_at − ms` del análisis (con un margen de un par de segundos). Si no, el replay arranca con el estado ya movido y el caso "pasa" sin probar nada.
- **Las expectativas copiadas del pasado mienten.** Tres casos del banco tenían como esperado "lo que hizo el original", y el original también estaba mal según la descripción del negocio (pasaban a «En conversación» con el PRIMER mensaje, y la descripción decía que se queda en «Nuevo» hasta que responda algo). Revisar cada expectativa contra la regla escrita.
- **Lo que el replay no reconstruye invalida el caso.** Las notas de voz entran sin la transcripción que tuvo el modelo real: un caso que depende de un audio no sirve para comparar. Marcalo o sacalo.
- **El banco cuesta.** ~US$0,30 por corrida con 2 pasadas por caso. Avisar antes de correrlo varias veces.
- **El orden de los campos no es un control.** `revision` antes de `falta` ayuda al revisor porque revisar ES su trabajo; poner `evidencia` antes de `decision` en el primer pase no obligó a nada: la dejó vacía y eligió igual.
- **Cada retoque al prompt del que decide mueve casos que no tocaste.** La instrucción sobre condiciones negativas rompió la detección del link. Solo el banco lo muestra.
- **El criterio lo escribe el cliente, en segunda persona.** "Vos ya le mandaste el link" es el negocio hablándole al bot. Decirle al revisor quién es "vos", o lee la descripción al revés.
- **El revisor no reemplaza ver los dos lados.** Si el modelo no ve la acción del negocio, el revisor frena siempre (correcto, pero inútil): el pase legítimo nunca ocurre. Primero el paso 1.

## Cómo verificar

1. **Banco con el código viejo primero**: tiene que reproducir el problema (en el CRM: 27 de 54). Si el banco viejo da verde, el banco no mide el problema.
2. **Banco con la versión nueva, 2 corridas por caso**: los prematuros frenados en todas las corridas **y** los casos que sí tienen que moverse, moviéndose. Ese segundo grupo es el control negativo: un revisor que contesta siempre "falta" pasa todos los prematuros.
3. **Tests unitarios** de lo determinista: lectura del veredicto (null → cumple; string vacío → cumple; JSON roto → falta), partición de mensajes multilínea, cita que junta dos mensajes → rechazada, cita con rótulo o tildes distintas → aceptada.
4. **En producción**, una semana después: contar los cambios de estado automáticos y los avisos `revisor:`. Leer a mano una muestra de los frenados para confirmar que faltaba lo que dice.

## Output esperado

- La entrada del modelo corregida para que cada criterio se pueda cumplir con evidencia.
- Un revisor (segunda llamada) que solo corre cuando el primer pase quiere actuar, con su schema, su prompt y la regla de no actuar si falla.
- La verificación por código de que cada cita está en un solo mensaje.
- Un banco de replay con casos reales de los dos tipos, y los números viejo contra nuevo.

Referencia en el CRM (`crm-v2/`): `src/lib/bot/analisis-verificador.ts` (el revisor), `src/lib/bot/analisis-evidencia.ts` (las citas), `src/lib/bot/analisis-mensajes.ts` (los mensajes de los dos lados), `scripts/replay-analista-etapas.ts` (el banco).

## Ejemplo

**Input:**
"El analista mueve a «Llamada agendada» antes de tiempo. La descripción del negocio dice 'confirmó día y hora y ya se le envió el link de la llamada', y lo movió con 'a las 9am?'. Ya le puse que si duda no mueva."

**Output:**
- **Entrada:** el analista no veía los mensajes del negocio, así que "ya se le envió el link" nunca podía estar cumplido con evidencia. Pasa a ver los dos lados; los datos del contacto siguen saliendo solo del lead.
- **Banco:** 10 prematuros reales + los pases legítimos + uno sintético con el link de Meet mandado por el equipo. Código viejo: 27 de 54.
- **Lo que se probó y no sirvió:** que el mismo modelo partiera la descripción y citara cada condición (41 y después 47 de 54, con regresiones; se comía la condición del link).
- **Lo que quedó:** el revisor ("¿qué falta?"), temperatura 0, `revision` antes de `falta`; si falla, no se mueve. Más la verificación de citas en un solo mensaje. Banco: 26 de 26; prematuros frenados 20 de 20.
- **Costo:** unas 175 revisiones por semana, menos de US$1.
- **Revisor sobre el caso del input:** `revision: "Pide día y hora confirmados por los dos y el link enviado. El lead preguntó 'a las 9am?' y el negocio no lo confirmó; no hay link en ningún mensaje del negocio."` · `falta: "la confirmación del horario y el link de la llamada"` → el estado queda como estaba, con el motivo en los avisos.
