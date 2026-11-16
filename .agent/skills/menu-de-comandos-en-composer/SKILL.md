# Skill: Menú de comandos en el composer del chat (`/plantilla`, `:emoji`)

## Cuándo usar esta skill

- El chat necesita que **escribir un carácter** (`/`, `:`, `@`) abra un menú de opciones arriba del campo: plantillas con `/`, emojis con `:`, menciones con `@`.
- Ya existe un botón o un panel para lo mismo y el pedido es "hacerlo más rápido": *"cuando escribo `/` que me salgan las plantillas de una vez"*, *"con `:` y la palabra que busque el emoji"*.
- Vas a colgar un **segundo** menú del mismo `<textarea>` (ya hay uno y se está por sumar otro).
- Hay una **lista de opciones con mucho texto** que hace difícil encontrar algo (plantillas con su cuerpo entero dentro de cada fila).

## Por qué existe esta skill

Capturada el **2026-09-18** de la bandeja de un CRM con WhatsApp: se armaron dos menús (`/` para plantillas, `:` para emojis) sobre el mismo campo. Cada uno parece un `onChange` y un `<ul>`, y **casi todo lo difícil está en los bordes**, que se descubrieron uno por uno probando en el navegador:

- se disparaba con `1/2`, con la hora `10:30` y con las caritas escritas a mano (`:)`, `:D`);
- **Enter enviaba el mensaje** en vez de elegir la opción;
- el menú se abría solo cuando una plantilla o una sugerencia de IA cambiaba el texto por otro camino;
- la lista de emojis ofrecía primero las caras con corazones y dejaba fuera al ❤️;
- un emoji compuesto se dibujaba como **dos** y tapaba el nombre de al lado;
- desde un popover, la vista grande de una plantilla **cerraba el popover** con Escape en vez de cerrarse ella.

## Diseño (las decisiones, con su porqué)

| Decisión | Porqué |
|---|---|
| **El menú va en el flujo**, arriba de la fila del composer, no flotante | Un menú `absolute` se recorta con el `overflow` del panel (el mismo bug de los popovers, tres veces), y en celular tapa lo que se está escribiendo. En el flujo empuja el chat y nunca se corta |
| **Detección = función pura** `(texto, cursor) → { desde, consulta } \| null` | Se prueba sin navegador, con controles negativos. Es donde viven los falsos disparos |
| **Solo cuenta lo anterior al cursor** | Con el cursor en medio del texto, lo que viene después no es parte de lo que se está escribiendo |
| **El carácter tiene que EMPEZAR una palabra** (inicio del mensaje o después de espacio o salto de línea) | Es lo que descarta `1/2`, `y/o`, `https://…`, `10:30` y `Nota:algo` |
| **Con `:`: mínimo 2 caracteres y al menos una letra**, solo letras, números, `_` y `-` | Descarta `:`, `:D`, `:P`, `:3`, `:)`, `:-)`, `:30`. Un espacio o un segundo `:` cierran la palabra |
| **El cursor se guarda junto con el texto al que pertenece** (`{ valor, cursor }`) | Si `draft !== valor`, el texto cambió por otro camino (plantilla, IA, panel de emojis): el cursor no vale y **el menú no se abre**. Solo abre lo que se ESCRIBE |
| **Elegir reemplaza el rango `[desde, cursor)`** leyendo el `textarea`, no el estado | `el.value` y `selectionStart` están siempre al día, aunque lleguen dos toques antes del repintado |

## Proceso

### 1. La detección, pura y con controles negativos

```ts
export function detectarSlash(valor: string, cursor?: number | null) {
  const fin = Math.min(Math.max(cursor ?? valor.length, 0), valor.length);
  const antes = valor.slice(0, fin);
  const ini = Math.max(antes.lastIndexOf(' '), antes.lastIndexOf('\n'), antes.lastIndexOf('\t')) + 1;
  const palabra = antes.slice(ini);
  return palabra.startsWith('/') ? { desde: ini, consulta: palabra.slice(1) } : null;
}
```

Para `:` es la misma forma más `consulta.length >= 2 && /^[\p{L}\p{N}_-]+$/u.test(consulta) && /\p{L}/u.test(consulta)`. **Las pruebas que importan son las que NO abren nada**: `1/2`, `y/o`, una URL, `10:30`, `:30`, `:)`, `:D`, `Nota:algo`, cursor antes del `/`, palabra cerrada por un espacio. Una prueba solo de casos felices aprueba un detector que se dispara con todo.

### 2. El estado: cursor atado al texto, "descartado" por posición, opción activa

```tsx
const [posicion, setPosicion] = useState<{ valor: string; cursor: number } | null>(null);
const [descartado, setDescartado] = useState<number | null>(null); // posición del `/` cerrado con Esc
const [activo, setActivo] = useState(0);

const cursor = posicion && posicion.valor === draft ? posicion.cursor : null; // null = texto cambió por otro lado
const trigger = canSend && cursor !== null ? detectarSlash(draft, cursor) : null;
const abierto = trigger !== null && fuente.length > 0 && descartado !== trigger.desde;
```

- **Esc marca `descartado = trigger.desde`**: el menú no vuelve a abrir mientras siga ese mismo `/`, aunque se siga escribiendo. Se limpia **en el `onChange`** cuando el trigger desaparece (`if (!detectar(nuevo)) setDescartado(null)`), no en un efecto.
- El cursor se sincroniza en `onChange` y en `onSelect` (React dispara `onSelect` también al mover el cursor con flechas o clic).

### 3. Teclado: quién se queda con qué tecla

```tsx
onKeyDown(e): boolean {                       // true = el menú se comió la tecla
  if (e.nativeEvent.isComposing || !abierto) return false;   // IME: nunca interceptar
  if (e.key === 'Escape')    { e.preventDefault(); descartar(); return true; }
  if (lista.length === 0)    return false;    // sin resultados NO se intercepta nada
  if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((i + 1) % n); return true; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); setActivo((i - 1 + n) % n); return true; }
  if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); elegir(lista[i]); return true; }
  return false;
}
```

**Con resultados, Enter elige y NO envía.** Sin resultados, Enter sigue enviando como siempre: un menú que se traga el Enter de alguien que escribió `/` por otro motivo es peor que no tener menú. En el `textarea`: `if (menu.onKeyDown(e)) return;` **antes** del manejo de Enter del composer.

### 4. Elegir: reemplazar el rango y devolver el cursor

```ts
const r = insertarEnCursor(draft, trigger.desde, cursor, textoElegido); // reemplaza [desde, cursor)
setDraft(r.valor);
requestAnimationFrame(() => { el.setSelectionRange(r.cursor, r.cursor); el.focus(); });
```

Las opciones llevan `onMouseDown={(e) => e.preventDefault()}` (el campo no pierde el foco al tocar) y **`onMouseMove`, no `onMouseEnter`**, para resaltar: cuando las flechas mueven la lista debajo de un mouse quieto, un `mouseenter` falso le roba la opción al teclado.

### 5. Dos menús en el mismo `textarea`

Cada uno es un hook con su propio estado de cursor. Los handlers se **componen**, y solo uno guarda el texto:

```tsx
onChange={(e) => { slash.onChange(e); emoji.onCambio(e.target); }}   // slash.onChange hace el setDraft; el otro solo sincroniza
onSelect={(e) => { slash.onSelect(e); emoji.onSelect(e); }}
onKeyDown={(e) => { if (slash.onKeyDown(e)) return; if (emoji.onKeyDown(e)) return; /* …Enter normal */ }}
{...slash.ariaProps} {...emoji.ariaProps}
```

Nunca están abiertos a la vez: la palabra que termina en el cursor empieza con `/` o con `:`, no con los dos. `ariaProps` solo devuelve algo cuando el menú está abierto: `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant`. **No** ponerle `role="combobox"` ni `aria-expanded` al `textarea`: `aria-expanded` no está soportado por el rol `textbox` y el linter lo rechaza con razón.

### 6. El menú de emojis (`:palabra`)

- **Buscar en la misma base que el panel de emojis** (`emoji-picker-element`, API `Database`): comparten la base del navegador y los mismos datos, así que las tildes y los nombres en español coinciden. Se carga con `import()` recién al escribir el **primer** `:` (`new Database(...)` ya empieza a cargar: es el calentamiento).
- **Reordenar el resultado.** La base devuelve por número de emoji, y así `:corazon` ofrecía caras con corazones antes que ❤️. Se ordena por qué tan bien responde el NOMBRE: exacto → empieza con la palabra → otra palabra empieza → está adentro → solo es palabra clave; a igual grupo, **el nombre más corto** (lo más genérico). Función pura con pruebas.
- **Mostrar la lista anterior mientras llega la nueva** si la palabra es una extensión o un recorte de la anterior (sin parpadeo por tecla); una lista de otra palabra no se muestra.
- **Tono de piel:** `getPreferredSkinTone()` y elegir la variante en `skins`.
- **Sumar a "usados frecuentemente":** `incrementFavoriteEmojiCount(unicode)` al elegir.
- **Descartar lo que el sistema no dibuja.** Canvas achicado a un pixel, relleno blanco y negro: si el pixel es igual y no es transparente, es a color. **Además**, para un emoji compuesto (contiene `‍`): si `measureText(emoji).width` es ≥ 1,5 veces el de su primera pieza, se dibuja como piezas sueltas (🧑‍🎄 salía "👦🎄") y se descarta. Una bandera de país se da por buena si la app tiene la fuente de banderas.
- **La celda del emoji lleva alto suficiente** (`h-8 w-8 grid place-items-center overflow-hidden`): con `leading-none` y `overflow-hidden` sin alto propio, los emojis altos (🎅) salían con la cabeza cortada.

### 7. El menú de plantillas (`/texto`)

Mismo esqueleto, con una diferencia que importa: **según la ventana de 24h de WhatsApp** la lista es otra (internas, editables, caen en el input / aprobadas por Meta, que no se editan). La de Meta **no se manda al elegirla**: se quita el `/texto` del campo y se abre la confirmación con el texto final. Filtrar por nombre **y por cuerpo**, sin tildes (el equipo se acuerda de una frase del mensaje más seguido que del nombre).

### 8. La lista de plantillas: solo el nombre, y el contenido aparte

La lista con el cuerpo dentro de cada fila hace imposible encontrar algo. Cada fila es **solo el nombre** + un botón de ojo ("Ver contenido") que abre una vista grande (hoja desde abajo en celular) con el texto completo, las variables ya rellenadas, scroll por dentro y "Usar plantilla".

- **Por qué se veía todo el texto:** la fila tenía `line-clamp-2` **y** `block` en el mismo elemento; `block` pone `display:block` y le gana al `display:-webkit-box` del clamp, así que **nunca recortaba**. No lo ve `tsc` ni el linter.
- **Vista grande encima de un popover** (que es `position:fixed` en un portal, con `z-index` 1000/1001 y cierra con Escape en captura sobre `document`): la vista lleva `z-[1100]`, se renderiza **fuera** del panel del popover (un `transform` en el ancestro le rompe el `fixed`) y su Escape se escucha en **captura sobre `window`** con `stopPropagation()`, que corre antes. Así Escape cierra la vista y el popover sigue abierto atrás.

## Gotchas de la prueba (cada uno hizo perder un intento)

- **`Enter` sí, `Return` no:** la herramienta de automatización manda `Return` con otro `key` y el handler nunca lo ve. Y **las flechas simuladas no mueven el cursor del `textarea`**: poner el cursor con `setSelectionRange` y elegir la opción con un **clic real**.
- **Probar la selección con `Tab`, no con `Enter`, si el chat de prueba puede enviar.** Un bug en el `Enter` habría mandado un mensaje a una persona real. Con `Tab` no hay forma de enviar; el camino de `Enter` se prueba en un chat donde el envío está bloqueado (ventana vencida).
- **Vaciar un `textarea` controlado sin enviar nada:** el setter nativo + un evento `input`. Asignar `.value = ''` a secas no actualiza el estado de React.
- **El indicador de desarrollo de Next** (la "N" abajo a la izquierda) se come el clic sobre un botón de esa esquina: accionarlo con `.click()`.
- **Un cambio de código en pleno test recarga la página** y se pierde el chat abierto (en celular un enlace directo abre la lista, no el chat): comprobar que el `textarea` existe antes de escribir. "Los resultados vinieron vacíos" tras un cambio de código casi siempre es esto.
- **Abrir un chat lo marca leído** y cualquier dato de prueba (plantillas) ensucia la cuenta: al terminar, restaurar el `unread_count` y borrar lo creado, y verificarlo con una consulta.

## Verificación (en el navegador, no "compila")

1. El carácter al inicio y **a mitad** de un mensaje abre el menú; elegir reemplaza solo el `/texto` o `:texto`, deja el cursor al final y el foco en el campo.
2. Los **negativos no abren nada**: `1/2`, hora, URL, `:)`, `:D`, `:30`, `Nota:algo`.
3. Flechas mueven la opción activa; Tab elige; Esc cierra y el menú **no reabre** mientras se sigue escribiendo la misma palabra.
4. Con resultados, Enter **no envía**; sin resultados, Enter envía (o en un chat bloqueado, no pasa nada raro).
5. Con y sin tilde da lo mismo; lo elegido con `:` figura en "usados frecuentemente" (`getTopFavoriteEmoji`).
6. **375px:** `scrollWidth === clientWidth`, opciones de al menos 36px, celda de emoji sin recorte, el campo sigue con ancho de una línea.
7. En producción, al menos la ruta feliz, sin enviar nada.

## Lo que esta skill NO cubre (a propósito)

- Menciones `@` con una lista que viene del servidor (la búsqueda asíncrona y el rate limit son otro problema).
- Emojis solos en burbuja grande, y la vista previa de una plantilla al pasar el mouse.
- El teclado real de un celular: solo se probó con el navegador emulado.

## Ejemplo

**Input:** *"Que cuando escribo `/` me salgan las plantillas, y que con `:` y la palabra busque el emoji."*

**Output:** dos hooks sobre el mismo campo, con menú en el flujo. `/ret` filtra plantillas y Enter usa la elegida (la de Meta pide confirmar); `Hola :feliz` + Tab da "Hola 😊" con el cursor al final. `1/2`, `10:30` y `:)` no abren nada. Medido: `:corazon` ofrece ❤️ (antes quedaba fuera), un emoji compuesto roto se descarta, 0 desbordes a 375px.
