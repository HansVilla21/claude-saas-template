# Skill: Ayuda que se encuentra (buscador tolerante, mapa del producto, subsecciones y grafo)

## Cuándo usar esta skill

- Un producto ya tiene su manual adentro (ver `manual-de-ayuda-dentro-del-producto`), pero **la gente no encuentra nada**: «se va a perder, no va a saber qué hacer… buscar algo se vuelve complicado» (Hans, sobre la Ayuda del CRM, 2026-11-20).
- La Ayuda es una lista larga de acordeones por sección, el buscador exige la palabra exacta y una pregunta escrita como habla la gente («¿cómo hago para mandar una plantilla?») no trae nada.
- Hay que rediseñar algo con cara visible y **que elija el founder**: esta skill trae el método de maquetas que funcionan, que le sirve a cualquier pantalla.
- Se viene un asistente de IA que va a leer el mismo manual y necesita citar respuestas y encontrar las vecinas.

**Por qué existe.** En el CRM de Momentum, la Ayuda (275 artículos tipados) estaba en producción y Hans la miró: «está fea, está mal colocada». El rediseño salió en un día:
- maquetas funcionales con los datos reales;
- Hans combinó piezas de cada una y pidió dos ajustes;
- construcción, verificación y producción (PR #614 del CRM).

**Lo transferible es el método y cuatro piezas puras:** el buscador, el tema derivado, las subsecciones con prueba y el grafo con backlinks.

> Código listo para copiar en `assets/` (ver «Assets» al final).

---

## Proceso

### 1. Maquetas que funcionan, no dibujos (antes de construir nada)

1. **Exportá el contenido real a un JSON** con un script de una vez, que importe el módulo del manual y escriba `{ articulos }`. Así las maquetas buscan sobre los 275 artículos de verdad.
2. **Armá 3 direcciones bien distintas** sobre una base compartida (`comun.js` con datos, buscador e íconos, y `base.css` con los tokens del producto y una réplica de la barra lateral). Cada dirección es un HTML que cambia la idea, no el color. En el CRM fueron:
   - **«Completá la pregunta»:** el buscador es la frase «¿Cómo hago para ___?».
   - **«Como Conversaciones»:** las preguntas a la izquierda, como chats, y la respuesta a la derecha.
   - **«El mapa del CRM»:** los temas ordenados como el menú.
3. **Una sola página de comparación** con cada dirección en un marco de celular (iframe a 375) y otro de computadora (iframe a 1280, escalado). Sumale una barra rayada «Maqueta» para simular desde qué pantalla se entró y con qué rol. Publicala como artifact privado: el founder la abre en su celular de verdad.
4. **Esperá que combine.** Hans no eligió una: armó la «D» con piezas de las tres, y después pidió subsecciones y un buscador «que parezca buscador». Por eso conviene que la base sea compartida: la combinación salió en minutos.
5. **Respaldá las fuentes** de las maquetas fuera del scratchpad (en las notas compartidas). El scratchpad se borra.

### 2. El buscador tolerante (`assets/buscar.ts`)

Pensado para quien escribe como habla. En orden:
- **Relleno fuera:** «cómo hago para quiero puedo…» no cuentan. Si TODO es relleno («cómo»), se usa igual: si no, la búsqueda queda vacía.
- **«no» NO es relleno:** «el bot no contesta».
- **Sinónimos de la gente → palabras del manual:** `bot → chatbot`, `wasap/wsp → whatsapp`, `cliente → contacto`, `clave → contraseña`, `excel → csv`.
- **Raíz tosca** (sacar `ar/er/ir/as/es/os/a/e/o/s` si quedan ≥4 letras): «mandar» encuentra «mando», «plantillas» encuentra «plantilla».
- **Errores de tipeo:** distancia de edición con trasposición, cortada en un tope (1 error hasta 6 letras, 2 desde 7), más «escribiendo con un error» (prefijo a distancia 1). «plantila», «etiketa» y «conversasion» encuentran lo suyo.
- **Pesos:** título 6 · palabras clave, pantalla y resumen 3 · cuerpo 1, más un bonus si la frase entera está en el título.
- **Todas las palabras… casi:** con 3 o más puede faltar una (la gente usa palabras que el manual no tiene). Si así no sale nada, devuelve **«lo más parecido» y lo dice**. No muestra cero en silencio.
- **Índice armado una sola vez** (palabra → artículo y campo) en un `WeakMap` por lista: con 275 artículos, cada tecla tarda entre 5 y 20 ms.
- **La respuesta más probable sale abierta**, con sus 3 primeros pasos, arriba de «Otras preguntas parecidas». Es lo que más le gustó a Hans: buscás y ya tenés el cómo.

**Probalo contra el manual real**, con preguntas como las haría el equipo y el id que tiene que salir entre los 3 primeros. Es la prueba que de verdad dice si sirve. En el CRM son 11 casos («quiero saber de donde vienen mis clientes» → `faq-de-donde-vienen-mis-contactos`). Sumá un control negativo: algo que no está no trae nada.

### 3. Temas que espejan el menú, y el tema se deriva

- **Los temas son los nombres e íconos del menú del producto** (Conversaciones, Contactos, Agenda…) más «Lo básico» y «Dudas». La persona busca la ayuda donde ya busca la pantalla.
- **El tema de un artículo sale de su pantalla principal** (`temaDe(a)` mira `pantallas[0].ruta`). Así un artículo nuevo cae solo en su tema. Las excepciones van en una lista corta por id.
- **En la computadora es un mapa a la izquierda** (sticky) con tres estados:
  - en reposo: cuántas preguntas tiene cada tema y el número de paso de «Empezá por acá»;
  - con un tema abierto: despliega sus subsecciones como ramas;
  - **buscando, se enciende**: cada tema dice cuántas respuestas encontró y los que no tienen nada se apagan (opacidad, no se sacan: la forma no se rearma). Tocar uno filtra.
- **En el celular** es la misma lista, a todo el ancho, debajo de «Empezá por acá». Buscando, salen chips con conteo.

### 4. Subsecciones curadas, con una prueba que obliga a ubicar todo

- Una lista de 34 preguntas no se lee. Se parte en grupos de 2 a 9 con nombre: Conversaciones quedó en «Lo básico · Encontrar y ordenar la lista · Escribir y mandar plantillas · Fotos, audios y emojis · El chatbot y tu equipo · El contacto sin salir del chat».
- **La subsección se elige a mano.** Un archivo `secciones.ts` con `[título, 'id id id']` por tema, una línea por subsección.
- **La prueba exige que cada artículo esté en UNA sola subsección de su tema.** Lo que no está anotado cae en «Otras» y la prueba se pone roja, nombrando cuáles faltan. Sin esto, el artículo 276 aparece suelto en una lista que alguien ordenó con cuidado.
- Documentá la regla en el AGENTS.md del proyecto y en la skill de mantenimiento del manual: el que agregue un artículo se va a chocar con la prueba.

### 5. El grafo de «Mirá también» (`assets/grafo.ts`)

- **Los enlaces escritos** (`relacionados`) son los salientes. **Los entrantes (backlinks) no se escriben: se calculan al leer**, igual que el cerebro de Nexus OS. Más los de la misma pantalla, como conexión tenue.
- **Medí antes de dibujar:** en el CRM, 242 de 275 artículos formaban una sola red con mediana de 3 conexiones. O sea que el grafo ya existía y solo faltaba mostrarlo.
- **No uses un grafo de fuerzas.** En Nexus OS la «madeja» de círculos con líneas se descartó porque escondía todo. Se dibuja **en abanico**:
  - la respuesta al centro-izquierda;
  - las vecinas en una lista de texto de verdad, agrupadas en «Se conecta con» y «En la misma pantalla»;
  - las curvas en un SVG encima, midiendo dónde quedó cada nodo.
- **Al tocar una vecina se abre esa respuesta**, que pasa al centro: así se recorre el manual de conexión en conexión.
- **Al asistente le sirve igual:** cita el id del artículo y el chat lo vuelve enlace. `vecinosDe(id)` le da el contexto de al lado para no contestar a medias.

### 6. Cada respuesta en su página, y «Volver» que vuelve

- **`/ayuda/<id>`** como dirección propia: es lo que cita el asistente y lo que se comparte. Las direcciones viejas (`?ver=<id>`) redirigen.
- **A pantalla completa,** con una columna a la derecha:
  - **«Dónde queda»:** el menú en miniatura con la pantalla marcada y el camino escrito («Tu nombre, al pie del menú › Configuración › Canales»). Los nombres salen **del mismo armador del menú** que usa la barra lateral: si el menú cambia, la ayuda lo sigue.
  - **Debajo, el grafo.** En el celular, todo eso va después de los pasos.
- **Los pasos van como tarjetas numeradas**, y los nombres de botón entre «» se ven **como teclitas** (borde y sombra abajo). La lista completa de botones de la pantalla va plegada.
- **El estado de la ayuda vive en la dirección:**
  - el tema, con `pushState`: el botón atrás vuelve;
  - la búsqueda, con `replaceState` y una pausa de 350 ms: no llena el historial;
  - cada respuesta lleva `?volver=` con la búsqueda o el tema de donde se abrió, así «Volver a la búsqueda» trae lo escrito. Acepta **solo** esas llaves (`q`, `tema`, `pantalla`).

### 7. Verificar

- **Prueba pura** del buscador (tolerancia y control negativo), del manual real (top 3), de las subsecciones (cada artículo en una sola), del grafo (backlinks calculados) y de «Dónde queda».
- **En el navegador, con el producto de verdad:** buscar con un error; abrir la respuesta; saltar por el grafo; «Volver»; abrir un tema y usar la flecha de atrás; entrar con el «?» de una pantalla; probar la dirección vieja.
- **Medí los desbordes a 375, 768 y 1280** en el inicio, un tema, los resultados y una respuesta. Excluí los carruseles horizontales que son a propósito (chips).
- **Mirala en producción con sesión** después del merge. Si pide entrar, pedile al founder que entre en el navegador de la app.

---

## Output esperado

- Una página de maquetas (artifact privado) con las direcciones, y la elección del founder anotada.
- En el producto:
  - `buscar.ts`, `temas.ts`, `secciones.ts`, `grafo.ts`, `donde.ts`, `enlaces.ts` (todo puro, con pruebas);
  - el inicio de la Ayuda (buscador, mapa y vistas) y la ruta `/ayuda/[id]`;
  - la regla nueva en AGENTS.md y en la skill de mantenimiento del manual;
  - una entrada en Novedades.

---

## Gotchas

- **En un shell de app, la que scrollea suele ser `<main>`, no la ventana.** `window.scrollTo(0, 0)` no hace nada; hay que pedirle a `main` que suba.
- **Usá container queries, no breakpoints de ventana.** Con la barra lateral de 262 px, a 768 px de ventana el contenido mide 506. Los `md:` mienten.
- **El input de búsqueda va con estado local** y la dirección se sincroniza aparte. Si el valor sale de `useSearchParams`, cada tecla pasa por una transición del router y el cursor salta.
- **Un archivo de pruebas con punto en el nombre no se importa** con el cargador de alias (`./pruebas-x.test` busca la extensión «.test»). Si el pre-push corre un solo archivo, importale el nuevo y nombralo sin `.test`.
- **`setState` dentro de un efecto, de forma sincrónica, lo rechaza el linter de React.** Las líneas del grafo se miden solo desde el `ResizeObserver`, que avisa una vez apenas empieza a observar.
- **La prueba que valida los nombres entre «» también cuida la interfaz nueva.** Se renombró «Quién la ve» a «Quién lo ve» y la prueba se puso roja, porque un artículo cita ese texto. La interfaz mantuvo el nombre.
- **Python en Windows y los finales de línea:** reescribir un archivo con finales mezclados lo pasó a LF y el diff fue de 254 líneas por un cambio de una. Escribí en bytes.
- **Los textos de ejemplo del buscador** van en el placeholder, rotando, y como botones debajo («Probá: el bot no contesta · invitar a alguien»). La frase gigante como buscador no le sonó al founder: «no parece tanto como un buscador».

---

## Ejemplo

**Input:** «la gente se mete aquí y se va a perder… buscar algo se vuelve complicado», con 275 artículos en acordeones y un buscador que exige todas las palabras exactas.

**Output (CRM Momentum, 2026-11-20, PR #614):**
- Maquetas A, B y C; Hans armó la D y pidió subsecciones y un buscador normal.
- En producción:
  - «mandar plantila» trae «¿Cómo mando una plantilla aprobada por WhatsApp?» abierta con sus pasos, y el mapa marca en qué temas hay respuestas;
  - la respuesta tiene «Dónde queda» con Conversaciones marcado y un grafo de 8 conexiones;
  - «Volver a la búsqueda» vuelve con lo escrito;
  - el «?» desde Shopify ya no deja una columna vacía.
- 57 pruebas en verde, y sin desbordes a 375, 768 y 1280.

---

## Assets

| Archivo | Qué es |
|---|---|
| `assets/tipos.ts` | El modelo del artículo (`ArticuloAyuda`: id, título, pantallas, quién la ve, resumen, bloques, palabras, relacionados). |
| `assets/normalizar.ts` | Minúsculas y sin tildes; la ñ queda como n a propósito. |
| `assets/buscar.ts` | El buscador tolerante entero: relleno, sinónimos, raíz, distancia, índice, «lo más parecido» y `coincidePalabra` para resaltar. |
| `assets/grafo.ts` | `vecinosDe`: enlazados en los dos sentidos (los entrantes calculados) y los de la misma pantalla. |

Los cuatro son puros y no importan nada fuera de la carpeta. Los sinónimos de `buscar.ts` son del vocabulario del CRM: cambialos por los del producto nuevo.

## Skills relacionadas

- `manual-de-ayuda-dentro-del-producto`: cómo se escribe el manual. Esta skill trata de cómo se encuentra.
- `ui-distintiva-no-ai-default`: el proceso de direcciones antes de codear.
- `auditar-responsive-midiendo`: la medición de desbordes.
- `verificar-funcionamiento-end-to-end`: mirarlo en producción con sesión.
