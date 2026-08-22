# Skill: Generar Creativos de Anuncios con IA

## Cuándo usar esta skill

- Cuando hay que producir **imágenes de anuncios** (para un SaaS/producto/servicio) desde cero
  con la API de imágenes de OpenAI (gpt-image), sin partir de una foto real.
- Cuando el founder quiere "unas primeras opciones para ver cómo se ven" y encontrar un diseño.
- Cuando se itera sobre un ángulo ganador (más variaciones, otro formato).

## Regla de oro (la que evita el error caro)

**El creativo debe ENCARNAR lo que vende el producto.** Si el producto vende simplicidad
(anuncios limpios, sin complicaciones), el anuncio del producto tiene que ser **limpio y
mínimo** — NO recargado de features en filas. Anunciar simplicidad con un diseño saturado se
contradice y baja la credibilidad. Coherencia marca > vistosidad.

## Proceso

1. **Definir ángulos distintos** (1 prompt por ángulo). Semilla: `transformación` (antes→después),
   `dolor` (la frustración), `velocidad`, `marca/hook` (tipográfico audaz), `oferta`, `autoridad`.
   Cubrir motivaciones distintas para que el test encuentre el ganador.
2. **Aplicar la marca propia:** logo + wordmark reales del producto (o su aproximación). Nunca
   marcas ajenas.
3. **Escribir el prompt** con: composición + headline **corto en español** + `"correct Spanish
   spelling"` (ayuda con ñ/tildes) + paleta de marca (hex) + si va limpio, `"NO feature lists,
   NO clutter, lots of negative space"`.
4. **Generar:** `POST /v1/images/generations`, `model: gpt-image-2`, `size: 1024x1024`
   (1:1 feed), `quality: medium` (~$0.06/img). **Concurrencia baja (2)** y timeout alto
   (~60s/img) para no cortar.
5. **Guardar + mostrar → iterar** sobre el ganador (más titulares/productos/layouts; luego 9:16
   para Stories/Reels).

## Gotchas

- **Billing hard limit de OpenAI:** si la cuenta topó su límite de gasto, la generación falla con
  400 `billing_hard_limit_reached`. Subir el límite antes de tandas grandes.
- Cada imagen tarda ~50-60s en `quality: medium` → un `bash` con timeout de 2 min corta; usar
  timeout 300s o correr por lotes.
- El **logo lo aproxima** la IA (fiel pero no exacto). Para la versión final de producción,
  incrustar el logo real por encima.
- Pedir explícitamente el wordmark entre comillas (`the wordmark "MarcaX"`) para que lo escriba bien.

## Output esperado

N archivos PNG 1:1 en `outputs/ads-<proyecto>/` (y `/v2` para iteraciones). Se muestran al
founder para elegir dirección.

## Ejemplo

**Input:** "Generame unos 4 anuncios para FreshAdFlow (SaaS que hace anuncios), limpios y con
nuestra marca."

**Output:** 4 PNG en `outputs/ads-freshadflow/v2/`: v2-01 hook de marca ("SUBÍ UNA FOTO. BAJÁ
ANUNCIOS."), v2-02 transformación, v2-03 dolor ("SIN DISEÑADOR. SIN DRAMA."), v2-04 velocidad —
todos con el logo F + wordmark FreshAdFlow, mínimos, sin saturación.
