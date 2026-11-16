# Skill: Ventana con dirección propia — un modal que se abre encima de donde estás y sigue teniendo URL

El pedido (2026-09-26, el founder, con capturas de Notion): *"Configuración se abre con un
menú muy grande y tapa casi toda la columna… quiero que se abra un modal, que se oscurezca
todo lo demás, y que esté todo ordenado por categorías"*.

Parece un `<Modal>` con estado local. No lo es:
- **Las pantallas de adentro ya existen como rutas,** con su carga de datos en el servidor y su gate.
- **Hay enlaces que apuntan a esas rutas:** un «Ir a Plantillas» en Novedades, notificaciones, links pegados en WhatsApp.
- **Un modal sin dirección obliga a rehacer las 10 pantallas** para que carguen desde el cliente, y rompe todos esos enlaces.

La salida es el patrón de **rutas paralelas + rutas interceptadas** de Next.js:
- navegando dentro de la app, la ruta se dibuja **encima** de la pantalla actual;
- cargada directo, se ve **como página**, con el mismo marco.

Lo que no dice la documentación son **siete detalles**. Cada uno se aprendió en el CRM con una medición. Cuatro los encontró una revisión independiente después de que todo "andaba".

## Cuándo usar esta skill

- Configuración, un perfil, una ficha, una foto, un carrito: algo que se abre **encima** de lo que estabas mirando, sin sacarte de ahí.
- Esas pantallas ya son rutas, o necesitan serlo para poder compartir el link, recargar y enlazar desde otros lados.
- Un menú desplegable creció tanto que tapa la barra lateral y alguien pide "como en Notion".

**Cuándo NO usarla:** un diálogo sin dirección propia (confirmar, un formulario corto, "invitar a alguien"). Eso es un modal común; ver `dialogo-confirmacion-no-nativo`.

## Proceso

### 1. La estructura de archivos (Next.js 16, App Router)

La ranura cuelga del layout que tiene que quedar **detrás** (en el CRM, `app/a/[slug]/layout.tsx`):

```
app/a/[slug]/
├── layout.tsx                      ← recibe { children, modal } y dibuja {modal} después del shell
├── @modal/
│   ├── default.tsx                 ← null: carga directa de cualquier dirección
│   ├── page.tsx                    ← null: navegar a la raíz cierra la ventana
│   ├── [...resto]/page.tsx         ← null: navegar a CUALQUIER otra pantalla la cierra
│   └── (.)settings/                ← la intercepción: (.) porque @modal NO cuenta como segmento
│       ├── layout.tsx              ← <MarcoConfiguracion modo="modal">
│       ├── loading.tsx             ← esqueleto: el marco ya se ve, solo espera el contenido
│       ├── page.tsx                ← export { default } from '@/app/a/[slug]/settings/page'
│       └── estados/page.tsx        ← export { default } from '@/app/a/[slug]/settings/estados/page'
└── settings/
    ├── layout.tsx                  ← <MarcoConfiguracion modo="pagina">
    ├── loading.tsx
    └── estados/page.tsx            ← la pantalla REAL: datos, gate, todo
```

- **Las páginas interceptadas re-exportan las reales.** Cada pantalla existe en UN lugar, con sus datos y su gate (`requireAdmin`). Antes, fijate que ninguna exporte `metadata` ni configuración de segmento, porque el re-export no las arrastra.
- **`page.tsx` y `[...resto]` en la ranura no son opcionales.** Con navegación dentro de la app, una ranura que deja de coincidir con la dirección **queda visible**. Sin ellos, la ventana sigue abierta encima de Contactos. La doc lo dice en una nota al pie.
- **La ranura es hermana del shell,** así que no recibe sus props. El rol y el slug le llegan por un contexto que monta el layout alrededor del shell **y** de `{modal}`, sin volver a consultar la base.

### 2. Cambiar de sección reemplaza; cerrar es un solo "atrás"

- **Dentro de la ventana, los enlaces entre secciones van con `<Link replace scroll={false}>`.** Así el historial no suma una entrada por sección y "atrás" siempre cierra la ventana. Se mide: `history.length` igual antes y después de recorrer cinco secciones.
- **Cerrar es `router.back()`,** pero **uno por ventana:**

```tsx
const cerrando = useRef(false);
const cerrar = useCallback(() => {
  if (cerrando.current) return;
  cerrando.current = true;
  router.back();
}, [router]);
```

Sin el ref, un doble clic en la X (común en usuarios no técnicos) dispara dos `back()` y deja a la persona en la pantalla **anterior** a la de origen. Medido: terminaba en `/settings/equipo` en vez de `/leads`.

### 3. El modo página: mismo marco, enlaces COMUNES

Al recargar o pegar el link, no hay intercepción y la ruta se ve como página. Dos trampas:

- **Ahí las secciones NO pueden ser `<Link>`.** Una navegación dentro de la app a `/settings/x` la intercepta `@modal` y abre la ventana **encima de esta misma página**. Medido: la dirección cambiaba y el título seguía siendo el de la sección anterior. En modo página, cada sección es un `<a href>` común (navegación completa).
- **La columna de secciones va desde `lg:`, no desde `md:`.** En `md:` la barra lateral de la app ya ocupa su lugar, y a 768 px el contenido quedaba en **282 px**, más angosto que un celular. Con la columna desde `lg:` y el selector arriba por debajo de eso quedó en **506 px**. En la ventana, que tapa la barra, la columna sí va desde `md:`.

### 4. Escape es de lo que está más arriba

La ventana escucha `keydown` **en fase de captura** en `window`, para correr antes que los modales de adentro. Si corriera después, el de adentro ya se habría desmontado y la ventana se cerraría con él. A cambio, tiene que ceder a mano. El predicado es puro y se prueba con `node --test`:

```ts
export function escapeCierraLaVentana(e: {
  tecla: string; repetida: boolean; modalesAbiertos: number;
  focoFueraDeLaVentana: boolean; enCampoEditable: boolean;
}): boolean {
  return e.tecla === 'Escape' && !e.repetida && e.modalesAbiertos <= 1
    && !e.focoFueraDeLaVentana && !e.enCampoEditable;
}
// modalesAbiertos       = document.querySelectorAll('[aria-modal="true"]').length (incluye la ventana)
// focoFueraDeLaVentana  = el foco está en un desplegable, que vive en un portal fuera de la caja
// enCampoEditable       = input de texto, textarea, select o contenteditable (NO casillas ni botones)
```

El caso del campo es el que se escapa: **Escape en un input cerraba la ventana y tiraba lo que se estaba escribiendo.** También rompe cualquier "Escape cancela el renombre" de adentro.

### 5. La caja no puede quedar con `transform`, `filter` ni `backdrop-filter`

Los modales de adentro ("Nuevo estado", "Invitar miembro") suelen ser `fixed inset-0` **sin portal**. Cualquiera de esas tres propiedades en un ancestro los encierra dentro de la caja en vez de la pantalla.
- **La animación de entrada puede usar `transform`,** siempre que sea un keyframe **sin `animation-fill-mode: forwards`**: dura 220 ms y no deja nada puesto.
- **Se mide:** con un modal de adentro abierto, su capa `fixed` tiene que medir `innerWidth × innerHeight`.

### 6. Cambios sin guardar: la ventana pregunta antes de irse

Una página con "Guardar" explícito pierde lo escrito sin aviso ante varias salidas accidentales que la ventana suma: un clic en el fondo, cambiar de sección o Escape.

```tsx
const AvisoSinGuardar = createContext<(pendiente: boolean) => void>(() => {});
export function useAvisoSinGuardar(pendiente: boolean) {
  const avisar = useContext(AvisoSinGuardar);
  useEffect(() => { avisar(pendiente); return () => avisar(false); }, [avisar, pendiente]);
}
// En la ventana: pedir(accion) → si hay algo pendiente, abre un ConfirmDialog
// («Tenés cambios sin guardar» · Seguir editando / Salir sin guardar); si no, ejecuta.
// La X, el fondo, Escape y el clic en otra sección (preventDefault + router.replace) pasan por pedir().
```

- **Fuera de la ventana, el contexto por defecto no hace nada:** en modo página, salir es navegar, igual que antes.
- **El `ConfirmDialog` va dentro de la capa de la ventana:** así queda encima y cuenta como `aria-modal`, y su Escape lo cierra a él y no a la ventana.

### 7. La prueba que agarra la sección olvidada

Una sección nueva sin su archivo interceptado **se abre como página completa y nadie se entera.** La lista de secciones vive en una función pura, y una prueba exige los DOS archivos:

```ts
test('cada sección tiene su página y su versión en ventana', () => {
  for (const s of seccionesConfiguracion('owner').flatMap((g) => g.secciones)) {
    const tramo = s.ruta ? `/${s.ruta}` : '';
    assert.ok(existsSync(`src/app/a/[slug]/settings${tramo}/page.tsx`), `falta la página de ${s.etiqueta}`);
    assert.ok(existsSync(`src/app/a/[slug]/@modal/(.)settings${tramo}/page.tsx`), `falta la ventana de ${s.etiqueta}`);
  }
});
```

### 8. Verificar en el navegador (con la sesión real)

1. Abrir desde otra pantalla:
   - existe el `[role="dialog"]`;
   - la pantalla de atrás **sigue en el DOM**.
2. Recorrer todas las secciones:
   - cada una marca `aria-current="page"`;
   - **cada una tiene un título distinto**. Si todos los títulos son iguales, la medición miente: estás midiendo la pantalla de atrás, o la navegación no ocurrió.
3. Revisar el historial:
   - `history.length` no crece al cambiar de sección;
   - `history.back()` vuelve a la pantalla de origen.
4. Salir hacia otras pantallas, con un clic por JS en la barra lateral (Contactos y la raíz): la ventana desaparece.
5. Recargar: aparece el modo página, con columna o selector según el ancho.
6. Escape:
   - con un modal de adentro abierto, 2 `aria-modal` pasan a 1;
   - un segundo Escape cierra la ventana;
   - Escape dentro de un campo, con un cambio sin guardar, no cierra nada.
7. Doble clic en la X: vuelve **un** paso.
8. **Guardar algo desde adentro** (la recomendación que más se olvida):
   - la ventana sigue abierta;
   - al recargar, el cambio está en la base;
   - revertirlo y confirmarlo.

   El `refresh` dentro de rutas interceptadas es donde Next se rompió otras veces.
9. En 375, 768 y 1280, correr el script de desborde de `auditar-responsive-midiendo`, **descontando lo que vive en un scroller horizontal intencional**. En la ventana, los filtros de la pantalla de atrás aparecían como "desbordes".

## Gotchas

- 🔴 **Sin `page.tsx` y `[...resto]` en la ranura, la ventana queda pegada** al navegar a otra pantalla.
- 🔴 **`<Link>` en modo página abre la ventana encima de la propia página** (paso 3).
- 🔴 **Escape en fase de captura sin ceder a los campos** tira lo que se estaba escribiendo (paso 4).
- ⚠️ **`(.)` y no `(..)`:** la ranura `@modal` no es un segmento.
- ⚠️ **En dev, los errores de un estado intermedio** (cambiaste un archivo y todavía no su importador) **quedan en la consola** aunque ya estén resueltos. Recargá y volvé a leer antes de perseguirlos.

## Output esperado

- **La ranura `@modal`** con sus tres `null` (default, raíz, resto) y la intercepción que re-exporta las páginas reales.
- **Un marco con dos modos** (`modal` / `pagina`), la lista de secciones en una función pura y el contexto de "sin guardar".
- **Las pruebas:**
  - la de archivos;
  - la del predicado de Escape;
  - la verificación en el navegador del paso 8, con números: historial, anchos, `aria-modal` antes y después.

## Ejemplo (CRM Momentum, 2026-09-26)

**Input:**
- Configuración era un grupo desplegable de **9 renglones** en la barra lateral: abierto, la tapaba entera.
- El founder mostró Notion: el menú de la cuenta abajo y la configuración en una ventana con categorías.

**Output:**
- **Abajo de la barra:** un botón de cuenta con un menú hacia arriba.
- **Configuración en una ventana** con 10 secciones en 5 grupos:
  - Tu cuenta;
  - Tu negocio;
  - Contactos;
  - Mensajes y chatbot;
  - Anuncios.
- **El shell** pasó de **688 a 323 líneas**, porque se fue toda la lógica de "qué subítem está activo".
- **Una revisión independiente** encontró 3 problemas importantes que la verificación propia no había visto, y los tres se arreglaron con su medición antes y después:
  - el modo página a **282 px** en tablet;
  - Escape en un campo;
  - cambios sin guardar perdidos con un clic en el fondo.
- **Otros dos arreglos de la misma pasada:**
  - el doble clic que volvía dos pasos;
  - los pasos de Novedades que no explicaban el celular.
- **Pruebas:** suite completa 897/897.
- `momentum-ai-crm` #367, en producción.

## Skills relacionadas

- `popover-portal-no-absolute`: los desplegables de adentro van en portal. Por eso "foco fuera de la caja" significa "está en un desplegable".
- `dialogo-confirmacion-no-nativo`: el `ConfirmDialog` de "cambios sin guardar", nunca `window.confirm`.
- `auditar-responsive-midiendo`: el script de desborde y por qué hay que descontar los scrollers intencionales.
- `verificar-visual-midiendo-contraste`: los títulos chicos de los grupos, con el gris de siempre (`text-muted`), daban 3,84:1 medido. Oscurecidos, 5,07:1.
- `verificar-funcionamiento-end-to-end`: guardar desde adentro y confirmar contra la base tras recargar.
