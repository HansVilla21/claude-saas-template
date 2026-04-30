# Skill: Construir Oferta

## Cuándo usar

- Cuando ya tenemos ICP primario + avatar definidos
- Para diseñar la oferta (planes, pricing, bonus, garantías) que vamos a poner en la landing
- Para iterar la oferta cuando los números no funcionan (bajo conversion, alto churn)
- Antes de cualquier campaña paga — sin oferta sólida, ads queman dinero

Aplicación directa de los frameworks de Hormozi: **Value Equation + Grand Slam Offer + Money Model** (los 3 vienen de `memory/frameworks/hormozi.md`).

## Filosofía

> "El cliente debería sentirse **estúpido** al decir no. No 'interesado', no 'lo voy a pensar' — sino 'cómo no lo iba a comprar'." — Hormozi

Eso solo se logra si el valor percibido es **10x el precio**. La oferta es el vehículo para crear ese gap.

## Proceso

### Paso 1: Recoger inputs previos
Leer antes de empezar:
- `docs/positioning/avatar-[nombre].md` — el avatar primario
- `docs/positioning/pains-discovered.md` — los pains validados
- `memory/frameworks/hormozi.md` — Value Equation, Grand Slam, Money Model
- Cualquier oferta existente que estemos iterando

### Paso 2: Definir el resultado del sueño
Hormozi: el resultado del sueño debe ser **específico, medible, conectado a status**.

```
Pregunta clave: ¿Qué cambio concreto en su vida/negocio quiere el avatar?

Ejemplo malo: "Crear contenido de calidad"
Ejemplo bueno: "Publicar 12 reels al mes que se sientan a TI, en 3 horas totales (no 30), con al menos 3 que superen el promedio de tu cuenta — sin perder los lunes paralizada en blanco."
```

Anotar:
- **Resultado tangible:** [output concreto]
- **Plazo:** [cuándo lo logra]
- **Conexión a status:** [cómo lo perciben los demás]
- **Lo que NO tiene que hacer:** [el sacrificio que evita]

### Paso 3: Aplicar la Value Equation
Para cada driver, listar cómo la oferta lo mueve:

```
                Resultado del sueño  ×  Probabilidad percibida
Valor =   ───────────────────────────────────────────────────
                Tiempo de retraso  ×  Esfuerzo y sacrificio
```

| Driver | Cómo Hookly lo mueve hoy | Cómo lo podríamos mover más |
|---|---|---|
| **Resultado del sueño ↑** | [...] | [...] |
| **Probabilidad ↑** | [...] | [...] |
| **Tiempo retraso ↓** | [...] | [...] |
| **Esfuerzo ↓** | [...] | [...] |

**Test:** si en alguno de los 4 estamos plano (no movemos nada), la oferta no es Grand Slam. Empujar más.

### Paso 4: Stack de bonus
Hormozi recomienda agregar bonuses de alto valor percibido pero bajo costo de fulfillment para inflar el numerador.

Tipos de bonus que aplican a un SaaS de contenido:
1. **Library / asset bundle** — biblioteca de hooks virales, templates, prompts (cero costo marginal)
2. **Onboarding 1:1** — sesión de 15-30 min con el founder/team (caro pero mata churn temprano)
3. **Comunidad privada** — Discord/Slack con creadores del mismo nicho (cero costo, alta retención)
4. **Garantía premium** — money-back doble si no logra X
5. **Bonus de afiliados** — comisión 30-40% por referidos
6. **Acceso temprano a features V1** — Spy Agent, búsqueda viral

Ejercicio: listar 5-7 bonus posibles, asignar valor percibido vs costo real:

| Bonus | Valor percibido (USD) | Costo real fulfillment | Ratio |
|---|---|---|---|
| Onboarding 1:1 | $200 | 30 min de tiempo | Alto |
| Library 100 hooks | $97 | $0 (one-time creation) | Infinito |
| ... | | | |

Escoger los 3-5 con mejor ratio (alto valor percibido, bajo costo).

### Paso 5: Garantía
Hormozi: una garantía fuerte invierte el riesgo de la decisión. Variantes en orden de fortaleza:

1. **Money-back garantía** — devolvemos lo que pagaste si no estás satisfecho
2. **Performance garantía** — "si no logras X, devolvemos"
3. **Anti-garantía** ("you keep everything") — "si no funciona, devolvemos Y te quedas con todos los bonus"
4. **Garantía 200%** — "si no funciona, devolvemos el doble"

Para Hookly tentativo: "Si en 30 días no publicaste al menos 4 reels que superen tu promedio histórico de views, devolvemos lo pagado + te regalamos $50 USD por tu tiempo."

**Regla de Hormozi:** la garantía debe ser tan agresiva que TÚ la dudes. Si te sientes cómodo dándola, no es lo suficientemente fuerte.

### Paso 6: Scarcity y urgency (real, no fake)
Hormozi distingue urgency falsa (cuenta regresiva infinita) de urgency real:
- **Cohort enrollment** — solo abrimos cupos al inicio de cada mes
- **Bonus que expira** — "los que entran esta semana incluyen onboarding 1:1, después no"
- **Pricing legacy** — "los primeros 100 clientes mantienen precio de por vida"

Elegir UNA, no varias (mata credibilidad).

### Paso 7: Naming
El nombre del plan/oferta comunica el resultado, no el método.

Ejemplos:
- ❌ "Plan Pro" — genérico, no comunica nada
- ❌ "Plan Premium 50 créditos/mes" — habla de input
- ✅ "Hookly Operator Pack" — comunica posición (operador serio)
- ✅ "El Reel Studio" — comunica capacidad (estudio de reels)
- ✅ "Anatomy Pro" — comunica el método único (análisis anatómico)

Probar 3-5 nombres y elegir el que un avatar diría sin esfuerzo en una conversación.

### Paso 8: Money model integral
Conectar la oferta principal a un sistema:

```
[Attraction Offer] → [Core Offer] → [Upsell] → [Continuity]
        ↑                  ↑              ↑              ↑
   Free trial        Monthly plan   Add-ons    Annual upgrade
   14 días           $79/mes        Equipos    20% off anual
   50 créditos       
```

Cada pieza tiene un rol:
- **Attraction:** baja barrera, demuestra valor (no busca ganar dinero, busca convertir)
- **Core:** plan principal donde se cobra real
- **Upsell:** features adicionales para clientes que crecen
- **Continuity:** descuento por commitment más largo (pre-paga annual)
- **Downsell (opcional):** plan más barato si rechaza el core

### Paso 9: Sintetizar la oferta completa

```markdown
# Oferta: [Nombre del plan]

## Para quién
[Avatar primario en 1 línea]

## El resultado del sueño
[Específico, medible, con plazo, conectado a status]

## Lo que incluye
- [Core feature 1]
- [Core feature 2]
- ...

## Bonus (incluidos sin costo extra)
1. [Bonus 1] — valor percibido $X
2. [Bonus 2] — valor percibido $Y
3. [Bonus 3] — valor percibido $Z

**Valor total:** $[suma]
**Precio real:** $[mucho menor]

## Garantía
[Garantía agresiva en lenguaje del cliente]

## Scarcity / urgency (real)
[Una limitación específica]

## Money model
- **Attraction:** [free trial X días + Y créditos]
- **Core:** [$79/mes o $XX]
- **Upsell:** [...]
- **Continuity:** [annual con descuento Z%]
- **Downsell:** [opcional — plan Lite $XX]
```

### Paso 10: Test de los 5 puntos de Grand Slam Offer
Antes de declarar la oferta lista, pasar este test:

- [ ] **Test 1:** ¿el cliente se sentiría estúpido al decir no?
- [ ] **Test 2:** ¿el valor percibido es ≥ 10x el precio?
- [ ] **Test 3:** ¿la garantía me incomoda darla?
- [ ] **Test 4:** ¿el resultado del sueño está descrito en el lenguaje del avatar (no en el nuestro)?
- [ ] **Test 5:** ¿la oferta tiene un nombre que el avatar repetiría en una conversación?

Si fallás en cualquiera, volvé al paso correspondiente.

## Output esperado

`docs/positioning/oferta-[nombre]-[fecha].md` con la oferta completa siguiendo la estructura del Paso 9.

**Adicionalmente actualizar `memory/posicionamiento.md`** con la oferta vigente.

## Reglas

- **No diseñar oferta sin avatar definido** — sin avatar, oferta es genérica
- **No copiar competencia** — mirá pero no clones, tu oferta tiene que ser categóricamente distinta
- **Bonus de bajo costo, alto valor** — 90% del peso de la oferta debe estar en bonus que no escalan tu fulfillment
- **Garantía agresiva o no es Grand Slam** — la incomodidad es señal de buena garantía
- **Una sola scarcity** — más de una mata credibilidad
- **Naming en lenguaje del cliente** — no del producto
- **Iterar en clientes reales** — la mejor oferta es la que sale de 5 conversaciones reales con el avatar, no de un Notion lleno de teoría

## Anti-patterns que evitamos

- "Plan Free / Pro / Enterprise" — copy genérico de cualquier SaaS
- "Acceso ilimitado a XYZ" — no comunica resultado
- Lista de 30 features con checkmarks — es feature dump, no oferta
- "Precio limitado por tiempo" sin razón real — fake urgency mata trust
- Garantía blanda ("satisfacción 100%") — no invierte el riesgo, no es Grand Slam
