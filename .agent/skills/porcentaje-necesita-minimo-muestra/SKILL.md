# Skill: Un porcentaje que ordena una lista necesita un mínimo de muestra

## Cuándo usar esta skill

- Vas a mostrar una **tasa** (conversión, cierre, apertura, respuesta, error, rating) **por fila** de una tabla o lista.
- Esa lista se **ordena** o se **compara** por ese porcentaje.
- El que la lee va a **tomar una decisión** con ella: dónde poner presupuesto, a quién ascender, qué plantilla usar, qué producto destacar.
- Estás por escribir `.sort((a, b) => b.tasa - a.tasa)`.

## Por qué existe esta skill

Capturada el **2026-08-13** en el CRM de Momentum, rediseñando la tabla "Por campaña" del Resumen — la pantalla donde el cliente decide **en qué anuncio pone la plata**.

La tabla ordenaba por conversión. Con los datos reales de una agencia:

| Anuncio | Leads | Cierres | Conversión |
|---|---|---|---|
| el que trajo volumen | **89** | 3 | **3%** |
| uno recién lanzado | **1** | 1 | **100%** ← encabezaba la tabla |

Ese 100% es **un solo lead que casualmente cerró**. Y estaba arriba de todo, en verde, en la pantalla que el cliente mira para decidir dónde invertir.

El fondo del asunto, y es lo que lo vuelve un error de razonamiento y no de diseño:

> Una tasa es una **estimación**, y su incertidumbre depende del **denominador**.
> Con n=1, el intervalo de confianza de "100%" va de ~2% a 100%.
> Ordenar por el valor puntual **sin mirar n** pone el ruido arriba, siempre.

Y no es una curiosidad estadística: **el orden de esa lista es una recomendación de inversión.**

## Dónde aparece esto (casi nunca solo una vez)

- conversión por campaña / anuncio / canal / landing
- **tasa de cierre por vendedor** — el que atendió 2 leads y cerró 1 sale "el mejor del equipo"
- % de respuesta por plantilla de mensaje
- rating promedio por producto (5 estrellas con una reseña)
- tasa de error por endpoint, por versión, por dispositivo
- "mejor hora / mejor día para enviar"

Si en tu producto hay una tabla con una columna `%` y un `ORDER BY`, ya tenés este problema.

## Proceso

### 1. Primero: ¿este porcentaje ORDENA algo?

| | |
|---|---|
| Se muestra **aislado** (un KPI, una ficha) | el problema es menor: agregá el denominador al lado y seguí |
| **Ordena o compara** filas | crítico — seguí leyendo |

La pregunta no es "¿el número está bien calculado?" (lo está). Es **"¿qué le estoy diciendo al que lo lee?"**.

### 2. Elegir el umbral, y saber que es un juicio

No hay número mágico. La regla práctica: **el mínimo n tal que una conversión más no mueva el número más de unos pocos puntos.**

- Tasas altas esperadas (>30%): n≥10 ya dice algo.
- Tasas bajas (1–5%, típico en ads): n≥10 es el **piso**; 30+ es cómodo.
- Si podés, mirá el rango real de tus datos antes de fijarlo.

Nombralo y comentá el porqué — sin eso, en seis meses alguien lo baja a 3 "porque se veían pocas filas":

```ts
/** Sin esto, un anuncio con 1 lead y 1 cierre da 100% y se sienta arriba del
 *  que trajo 89. Ese orden le dice al cliente que invierta en el equivocado. */
export const MIN_LEADS_SIGNIFICATIVO = 10;
```

### 3. ⭐ Segmentar, NO filtrar

El instinto es esconder las filas de poca muestra. **No lo hagas**: el cliente quiere ver el anuncio que lanzó ayer, y si no aparece cree que el sistema no lo está midiendo.

Mostralas, pero **abajo y marcadas**:

```ts
.sort((a, b) => {
  if (a.esVacio !== b.esVacio) return a.esVacio ? 1 : -1;   // el "sin dato" al final
  if (a.significativo !== b.significativo) return a.significativo ? -1 : 1;
  if (a.significativo) return b.tasa - a.tasa;               // con datos: por tasa
  return b.total - a.total;                                  // sin datos: por volumen
})
```

Entre los que **no** alcanzan el mínimo, ordená por **volumen**, no por tasa: ahí el porcentaje todavía no dice nada, pero "cuántos trajo" sí.

### 4. Apagar el color y la barra — es la mitad del daño

El color se lee **antes** que el número. Pintar de verde un 100% que sale de un lead ya comunicó la mentira aunque el texto diga "pocos datos".

```ts
if (!significativo) return { text: 'text-muted', bg: 'bg-line-strong' };  // apagado
```

Y **escalá la barra solo con los significativos**. Si el máximo sale del 100% ruidoso, todas las barras reales quedan aplastadas al 3% de su ancho y la columna pierde toda su información:

```ts
const maxTasa = filas.reduce((m, f) => (f.significativo ? Math.max(m, f.tasa) : m), 0);
```

### 5. Decirlo en la pantalla, no solo en el código

Una etiqueta bajo la fila (*"Pocos datos todavía"*) y una línea al pie que explique el orden:

> *Ordenado por conversión · los de menos de 10 leads van al final, su % todavía no significa nada*

Si el usuario no entiende por qué su anuncio nuevo está abajo, va a creer que la tabla está rota.

### 6. Que el export lo lleve

El CSV se abre en Excel y ahí lo primero que hace cualquiera es **reordenar por la columna de %**. Sin una columna `datosSuficientes`, tu ordenamiento cuidadoso se pierde en el primer clic.

### 7. Verificar con el control negativo que importa

El test tiene que probar que el criterio **discrimina**, y para eso hay que construir el caso venenoso a propósito:

```ts
check('el anuncio de 1 lead con 1 cierre da 100%…', chico.tasa === 1);
check('🔑 …pero NO encabeza la tabla',        filas.indexOf(grande) < filas.indexOf(chico));
check('⟂ control negativo: ordenar SOLO por tasa lo pondría primero',
  [...filas].sort((a, b) => b.tasa - a.tasa)[0] === chico);
```

Ese tercer check es el que vale: sin él, el test pasaría igual con el bug puesto.

## Si querés la versión fina (y por qué a veces no conviene)

El umbral duro es la versión **explicable**. Hay dos mejores estadísticamente:

- **Ordenar por el límite inferior del intervalo de Wilson** en vez de por la tasa. Es el *lower bound sort* clásico (Reddit, Evan Miller). No necesita umbral: la incertidumbre entra sola en el orden, y 1/1 cae solo hasta abajo.
- **Suavizado bayesiano**: `(éxitos + α) / (total + α + β)`, con la tasa global como prior. Un ítem nuevo arranca cerca del promedio y se despega a medida que junta evidencia.

**Por qué el CRM eligió el umbral duro igual:** en un dashboard de cliente, el número que se muestra tiene que ser el que el usuario puede recalcular a mano. Si la fila dice "3%" pero ordena por 1,8%, no hay forma de explicar el orden sin dar una clase de estadística. El umbral se explica en una línea.

Si tu lista es interna o el orden no se expone, usá Wilson.

## Output esperado

- Una constante nombrada con el mínimo y **el comentario de por qué**.
- Orden en tres niveles: significativos por tasa → el resto por volumen → los vacíos al final.
- Color y barra **apagados** bajo el mínimo, y escala calculada solo con los significativos.
- Una línea en la UI que explique el orden, y una columna en el CSV.
- Un test con el caso 1/1 y el **control negativo** del orden ingenuo.

## Ejemplo

**Input:** tabla de conversión por anuncio, 16 anuncios, uno con 1 lead y 1 cierre.

**Antes:**
```
Anuncio nuevo ............  1 lead   ████████ 100%  (1)   ← primero, en verde
El que trae volumen ......  89 leads █░░░░░░░   3%  (3)
```

**Después:**
```
El que trae volumen ......  89 leads ███░░░░░   3%  (3)
…
Anuncio nuevo ............  1 lead   ░░░░░░░░ 100%  (1)
  Pocos datos todavía
```

## Regla de oro

**Un porcentaje sin su denominador no es un dato, es una opinión.**
Y si ese porcentaje ordena una lista que alguien usa para decidir, dejó de ser una opinión: es una recomendación — y vos la firmaste.

## Skills relacionadas

- `drill-down-numero-a-lista` — el otro modo en que un número del dashboard miente: llevar a una lista que cuenta distinto.
- `fuente-unica-derivar-de-hijos` — cuando dos vistas muestran "lo mismo" y divergen.
- `verificar-funcionamiento-end-to-end` — por qué "el cálculo corre" no es "el número dice la verdad".
