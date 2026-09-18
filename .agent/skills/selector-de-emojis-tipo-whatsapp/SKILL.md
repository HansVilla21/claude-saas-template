# Skill: Selector de emojis en el chat, como el de WhatsApp

## Cuándo usar esta skill

- Un chat web (inbox, soporte, CRM) necesita **elegir emojis** y el pedido es "que funcione igual que en WhatsApp": buscador, categorías, recientes, tono de piel.
- Antes de armar uno a mano: **no se construye**, se compra hecho (ver "Decisión") y el trabajo real está en los bordes que este documento lista.
- Un chat ya muestra emojis y las **banderas salen como letras** ("CR", "US") en Windows.
- Se está por agregar un botón más a una fila de composer que **ya está apretada** y hay que saber si cabe.

## Por qué existe esta skill

Capturada el **2026-09-18** de un CRM con bandeja de WhatsApp. Pedido del founder: *"todos los emojis que uno tiene en WhatsApp… que funcione exactamente igual"*. El picker en sí se montó en una hora; **lo caro fueron cuatro cosas que ningún tutorial cuenta**, todas medidas en el navegador:

1. El buscador **no ignora tildes**: "corazón" encontraba 31 emojis y "corazon" solo 4. En un chat casi nadie escribe la tilde.
2. En **Windows (Chromium)** las banderas no existen: 🇨🇷 sale como "CR". El picker **no las oculta** (cree que las soporta) y aparecen como una grilla de letras. El bug ya existía en las burbujas de mensajes recibidos; nadie lo había asociado con emojis.
3. Al sumar el botón, el campo de texto quedó en **71px de ancho a 375px** (una línea de 9 caracteres). La fila ya tenía 4 botones + enviar. Y **también pasaba a 1280px** con el panel de contacto abierto: el modo "compacto" se decidía por la ventana, no por la columna.
4. En celular, enfocar el campo al elegir un emoji **sube el teclado del sistema encima del panel**.

## Decisión: comprar hecho, cargar tarde, datos propios

| Opción | Veredicto |
|---|---|
| Construir el panel (grilla, categorías, búsqueda, tonos, recientes, detección de emojis que el sistema no dibuja) | No. Semanas, y siempre falta un caso. |
| `emoji-picker-element` (web component, Apache-2.0) | **Elegida.** Categorías, búsqueda, tono de piel, "usados frecuentemente" (IndexedDB), oculta los emojis que el dispositivo no dibuja, español incluido, se estila por variables CSS. |
| Librerías con imágenes (sprites de Apple/Twemoji) | Solo si hace falta el MISMO dibujo en todos los sistemas; pesa y hay licencias. Acá el emoji es texto plano: cada quien ve el de su sistema, igual que en WhatsApp. |

Tres reglas que se toman de entrada:

- **`import()` recién al abrir el panel.** Es un web component: solo corre en el navegador (en el servidor da `requestAnimationFrame is not defined`) y nadie debería pagar su peso antes de usarlo.
- **Datos propios, no CDN.** El paquete baja el JSON de un CDN por defecto. Se sirve desde `/public` (377 KB, 60 KB comprimido): sin tercero en el camino crítico y sin depender de que el CDN esté arriba.
- **El emoji viaja como texto plano (unicode).** Backend, base y WhatsApp no necesitan ningún cambio.

## Proceso

### 1. Dependencia y datos en español

```bash
pnpm add emoji-picker-element          # NO el paquete de datos: pesa 31 MB (todos los idiomas)
```

Los datos en español (`es/cldr-native/data.json` de `emoji-picker-element-data`; ojo, en español **no existe** la carpeta `emojibase/`) se bajan con un script reproducible que **además agrega a cada emoji las palabras sin tilde** (gotcha 1):

```js
const sinTildes = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
for (const e of datos) {
  const propias = new Set([...(e.tags ?? []), ...(e.shortcodes ?? []), e.annotation]
    .flatMap((t) => t.split(/[\s_]+/).filter(Boolean)));
  const nuevas = new Set(e.tags ?? []);
  for (const p of propias) if (sinTildes(p) !== p) nuevas.add(sinTildes(p));
  e.tags = [...nuevas];
}
```

Fijar la versión del paquete de datos en la URL, para que el resultado sea reproducible. Resultado medido: "corazon" pasó de 4 a 26 resultados; 955 de 1.923 emojis ganaron palabras.

### 2. El panel: un componente que carga el picker cuando se monta

```tsx
useEffect(() => {
  let cancelado = false;
  (async () => {
    const [{ Picker }, { default: es }] = await Promise.all([
      import('emoji-picker-element'), import('emoji-picker-element/i18n/es'),
    ]);
    if (cancelado) return;
    const p = new Picker({ locale: 'es', dataSource: '/emoji/es-data.json', i18n: es });
    p.addEventListener('emoji-click', (e) => onPickRef.current(e.detail.unicode));
    contenedor.appendChild(p);
    /* …variables CSS, ResizeObserver de columnas… */
  })();
  return () => { cancelado = true; /* quitar listener y el elemento */ };
}, []);
```

- **`onPick` por una `ref`, no por el cierre.** El picker se crea una sola vez; un listener registrado con el `onPick` del primer render inserta con un estado viejo.
- **Colores por variables CSS** (`--background`, `--border-color`, `--indicator-color`, `--input-*`, `--emoji-size`…) apuntando a los tokens del diseño. Vive en un shadow DOM: solo se le habla así. Sigue al tema sin más.
- **Columnas según el ancho real** (`--num-columns = clamp(6, ancho/38, 16)`, con `ResizeObserver`): 9 en celular, ~17 en escritorio ancho, como WhatsApp Web.
- **Altura** `clamp(14rem, 35dvh, 20rem)`, en el flujo (no flotante): en celular empuja el chat en vez de taparlo.
- Esc cierra (el `keydown` sale del shadow DOM, sube hasta el contenedor). También se cierra al enviar y al cambiar de conversación.

### 3. Insertar donde está el cursor, no al final

Función pura (probable sin DOM) que reemplaza la selección y devuelve dónde queda el cursor:

```ts
export function insertarEnCursor(valor, inicio, fin, texto) {
  const largo = valor.length;
  const desde = Math.min(Math.max(inicio ?? largo, 0), largo);
  const hasta = Math.min(Math.max(fin ?? desde, desde), largo);
  return { valor: valor.slice(0, desde) + texto + valor.slice(hasta), cursor: desde + texto.length };
}
```

- **Se lee el `textarea`, no el estado.** `el.value` y `selectionStart` siempre están al día, aunque lleguen dos toques antes de que React repinte. `selectionStart` **sobrevive al blur**, así que funciona aunque el foco esté en el panel.
- UTF-16: `length` y `slice` cuentan igual que `selectionStart`, así que 🇨🇷 y 👨‍👩‍👧 entran enteros. Probar con esos dos.
- **Escritorio:** después de insertar, `setSelectionRange` y `focus()`; el panel sigue abierto para agregar más. Y `onMouseDown={e => e.preventDefault()}` en el botón de abrir para que el foco no salga del campo.
- **Celular: NO enfocar** (gotcha 4). Al abrir el panel, `blur()` del campo (baja el teclado); al cerrarlo desde el botón, `focus()` (vuelve el teclado, como WhatsApp).

### 4. El botón, adentro del campo y a la izquierda

Como WhatsApp. El área táctil (36px) es mayor que el ícono y sobresale del padding del campo con márgenes negativos (`-my-2 -ml-2 size-9`), sin agrandarlo. `aria-pressed` y `aria-label` que cambian abierto/cerrado.

### 5. Banderas en Windows

El polyfill `country-flag-emoji-polyfill` inyecta una fuente de banderas (77 KB) **solo** si el navegador soporta emojis pero no banderas. Cuatro piezas, las cuatro necesarias:

1. Copiar `TwemojiCountryFlags.woff2` a `/public` y llamar `polyfillCountryFlagEmojis('Twemoji Country Flags', '/emoji/TwemojiCountryFlags.woff2')` una vez, en un componente cliente del layout raíz (si no, baja de un CDN).
2. Agregar el nombre de la fuente al `font-family` del body (`var(--font-sans), "Twemoji Country Flags"`). Si nunca se inyectó, el nombre se ignora. Esto **arregla también las banderas de las burbujas**, no solo las del panel.
3. En el picker, `--emoji-font-family` con esa fuente **primero**.
4. **Licencia:** los gráficos son de Twemoji, CC-BY 4.0. Dejar el crédito en un `LICENSE.txt` junto a los archivos.

### 6. Que el composer no se aplaste: medir la COLUMNA

Antes de dar el botón por terminado, medir el ancho del campo con el botón puesto (`textarea.getBoundingClientRect().width`). Si baja de ~150px, la fila no alcanza.

Arreglo: los botones secundarios pasan a su propia fila **cuando la columna del chat es angosta**. Con un *container query*, no con la ventana:

```tsx
<div className="@container …">                       {/* el composer: su ancho = el de la columna */}
  <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
    <div className="flex basis-full items-center gap-1.5 @lg:contents">   {/* 4 botones */}
      …
    </div>
    <div className="… flex-1">campo + emoji</div>  <button>enviar</button>
  </div>
</div>
```

`@lg:contents` deja los botones como hijos de la fila (el layout de siempre) cuando la columna mide ≥32rem; debajo, van solos arriba. Con `isCompact` por ventana (`max-width: 1023px`) esto **no** cubre 1280px con el panel de contacto abierto: la columna del chat mide ~310px y la ventana dice "escritorio".

## Gotchas

- **Web component + SSR:** `import()` dentro de un efecto, nunca en el nivel del módulo. Si no, el build o el primer render rompen.
- **El 404 de `/node_modules/emoji-picker-element/database.js` en la consola es solo de desarrollo** (el sourcemap de Turbopack). No aparece en el build de producción; se confirma con `next build` y `next start`, no se persigue.
- **Detener el servidor de desarrollo antes de `next build`** en la misma carpeta.
- **El proxy de autenticación puede redirigir los `.json` y `.woff2` de `/public`** (el matcher suele excluir solo imágenes). Sin sesión dan 307 al login: no se verifican con `curl` en producción, pero el picker los pide con la sesión y anda. Si el picker se usa en una pantalla pública, excluir `/emoji/`.
- **Probar con teclas del automatizador no mueve el cursor del `textarea`**: `Home`/flechas simuladas no cambian `selectionStart`. Poner el cursor con `el.setSelectionRange(5,5)` y **tocar el emoji con un clic real**; después leer `value` y `selectionStart`.
- **El indicador de desarrollo de Next** (la "N" abajo a la izquierda) tapa un botón en esa esquina y se come el clic. Cerrar su menú con Esc y accionar el botón con `.click()`.
- **Un deep link en celular puede abrir la lista, no el chat** (si la app usa vistas por estado): para probar el composer a 375px hay que entrar por la lista.
- El "usados frecuentemente" del picker es local del navegador (IndexedDB), no de la cuenta: cada quien tiene los suyos.

## Verificación (en el navegador, no "compila")

En local **y** con el build de producción:

1. Elegir un emoji con el cursor en medio del texto: `valor` y `selectionStart` quedan como en la función pura.
2. Buscar "corazon" y "corazón": mismos resultados.
3. Categoría Banderas: banderas dibujadas, no letras. Confirmar `document.fonts` con la fuente `loaded`.
4. Esc cierra; abrir/cerrar tres veces sin errores; el foco vuelve al campo en escritorio y NO en celular.
5. **375px:** `scrollWidth === clientWidth`, sin elementos fuera de la pantalla; celdas y pestañas ≥36px; el campo de texto con ancho de más de una línea.
6. **1280px con y sin** el panel de contacto abierto.
7. Enviar **nada** al chat real para probar: el emoji es texto plano; se prueba insertando.

## Lo que esta skill NO cubre (a propósito)

- Emojis solos (1 a 3) en burbuja **grande**, como WhatsApp.
- Autocompletar con `:` (`:cora…`).
- El mismo dibujo en todos los sistemas (Windows dibuja Segoe, Mac/iPhone dibujan Apple; el destinatario ve el de su teléfono).

## Ejemplo

**Input:** *"Necesito que el chat tenga todos los emojis, exactamente como WhatsApp."*

**Output:** un botón de carita dentro del campo que abre un panel con buscador, categorías, tono de piel y recientes, en español, cargado solo al abrir; el emoji entra donde está el cursor; las banderas se ven en Windows; el campo de texto conserva ancho a 375px y a 1280px con el panel de contacto abierto. Medido: búsqueda sin tilde 4 → 26 resultados, 0 desbordes a 375px, `next build` OK.
