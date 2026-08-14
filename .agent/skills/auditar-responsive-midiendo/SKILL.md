# Skill: Lo que no encoge, desborda — auditar responsive MIDIENDO

## Cuándo usar esta skill

- Alguien reporta que una pantalla "se ve fea" o "se sale" en el celular.
- Vas a declarar terminada cualquier UI (regla mobile-first del proyecto).
- Estás por escribir `grid-cols`, `flex-1`, `h-[calc(100dvh - …)]` o un `<input>` dentro de una fila flex.
- Te pidieron "revisar el responsive de todo el sistema" y no sabés por dónde empezar.

## Por qué existe esta skill

Capturada el **2026-08-14** en el CRM de Momentum. El founder abrió el inbox en el celular y mandó una captura: las burbujas del chat **cortadas contra el borde derecho**, el botón de enviar fuera de la pantalla, scroll horizontal.

El instinto dice "es un tema de estilos, se ajusta un padding". **No lo era.** El backlog venía arrastrando *"falta la validación visual a 375px"* en **cuatro features seguidas** — o sea que no era un descuido puntual, era deuda sistemática. Y tenía una causa concreta y repetible.

> El desborde horizontal casi nunca es "algo es muy ancho".
> Es **algo que se niega a encogerse**, y en CSS eso tiene tres formas.

Lo que vuelve esto una skill y no una anécdota: **ninguna de las tres la ve `tsc`, ni el linter, ni el build.** Compila perfecto, pasa CI, y está roto en el único dispositivo donde el cliente lo usa.

---

## Las tres trampas (todas son la misma: `min-width: auto`)

### 1. Un track de grid `1fr` NO es `minmax(0, 1fr)`

`1fr` es azúcar para `minmax(auto, 1fr)`. Ese `auto` es un **piso**: el track se estira hasta el min-content de lo que contiene en vez de encogerse.

```diff
- const cols = isCompact ? '1fr' : '340px minmax(0, 1fr)';
+ const cols = isCompact ? 'minmax(0, 1fr)' : '340px minmax(0, 1fr)';
```

**Olor característico:** el caso de desktop ya usa `minmax(0, 1fr)` (porque ahí alguien ya se peleó con esto) y el de mobile quedó en `1fr`. Fue exactamente el caso.

### 2. `flex-1` sin `min-w-0`, y peor si adentro hay un control de formulario

Un hijo de flex tampoco baja de su min-content. Con texto largo ya es problema; con un `<input>`/`<textarea>`/`<select>` es peor, porque **su ancho intrínseco (~180px, el `size` por defecto) pasa a ser un piso duro**.

```diff
- <div className="flex flex-1 items-center …">
-   <textarea className="flex-1 …" />
+ <div className="flex min-w-0 flex-1 items-center …">
+   <textarea className="w-full min-w-0 flex-1 …" />
```

**Regla mecánica:** todo `flex-1` que contenga texto largo o un control de formulario lleva `min-w-0`. Va en el wrapper **y** en el control.

### 3. Texto que no tiene por dónde cortarse

Correos, URLs, ids, slugs y teléfonos son **una sola palabra** sin espacios. O `truncate`, o `break-words`/`break-all`, o `flex-wrap` en la fila que los contiene.

**Dónde muerde de verdad:** los campos que caen a un email cuando falta el nombre (`nombre ?? email`). En dev tenés "Hans"; en producción tenés `cristel.somosgivi@gmail.com`.

---

## La cuarta trampa: restar alturas a mano

```diff
- <div className="h-[calc(100dvh-49px)] md:h-dvh">
+ <div className="h-full">
```

Ese `49` era un número medido una vez, a ojo, que **(a)** no era el alto real de la topbar y **(b)** ignoraba por completo los banners condicionales. En el CRM había un banner de impersonación que se enciende **justo en el caso de todos los días** (el master entrando a la cuenta de un cliente): con él, la pantalla quedaba más alta que la ventana y el composer caía debajo del fold.

**El arreglo estructural:** el shell define el alto real y las pantallas piden `h-full`.

```jsx
// layout: columna de alto de ventana
<div className="flex h-dvh flex-col overflow-hidden">
  <Banner />                                   {/* shrink-0 */}
  <Shell>                                      {/* min-h-0 flex-1 */}
    <aside className="hidden md:block">…</aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="shrink-0 md:hidden">…</header>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  </Shell>
</div>
```

⚠️ **Esto cambia el modelo de scroll de la app** (antes scrollea el `body`, ahora `main`). Es correcto y elimina los números mágicos, pero **avisalo explícitamente** — se siente en desktop también. Los popovers/tooltips sobreviven si escuchan `scroll` con `capture: true` (captura scrolls de contenedores anidados); si no, hay que arreglarlos.

---

## Proceso

### 1. Medir, no mirar

Un screenshot que "se ve bien" **no alcanza**: el desborde puede quedar debajo del fold, o taparlo el propio recorte. Pegá esto en la consola con la pantalla cargada:

```js
window.__audit = () => {
  const d = document.documentElement, vw = d.clientWidth, out = [];
  // ignorar lo que vive dentro de un scroller horizontal INTENCIONAL
  const enScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right <= vw + 1 && r.left >= -1) return;
    if (enScroller(el)) return;
    if (el.parentElement && out.some(o => o.node === el.parentElement)) return; // solo el culpable más alto
    out.push({ node: el, tag: el.tagName, cls: (el.getAttribute('class')||'').slice(0,80),
               txt: (el.textContent||'').trim().slice(0,28), l: Math.round(r.left), r: Math.round(r.right) });
  });
  const small = [];
  document.querySelectorAll('button, a[href], [role="button"], input:not([type=checkbox]), select, textarea')
    .forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (r.height >= 24 && r.width >= 24) return;
      small.push({ t: el.tagName, lbl: (el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,28),
                   h: Math.round(r.height), w: Math.round(r.width) });
    });
  return { path: location.pathname, over: d.scrollWidth - vw,
           offenders: out.map(({node, ...r}) => r), bajo24: small, bajo24N: small.length };
};
__audit()
```

**Pasa solo si `over === 0` y `offenders` viene vacío.** Anchos: **375** (el que importa), 320 (estrés), 768, 1280.

Las dos piezas no obvias del script:

- **`enScroller`** — sin eso, un strip de filtros con `overflow-x-auto` (que scrollea **a propósito**) aparece como 8 elementos rotos. Distinguir desborde de scroll intencional es la mitad del valor de la herramienta.
- **`out.some(o => o.node === el.parentElement)`** — si el padre ya desborda, los 40 hijos también. Reportar solo el ancestro más alto convierte 200 líneas de ruido en 2 culpables reales.

### 2. Control negativo: probar que la medición discrimina

Si arreglás y ahora da cero, **eso no prueba nada por sí solo** — puede que el test no midiera nada. Medí el ANTES contra el DESPUÉS, en una caja del ancho real:

```js
const box = document.createElement('div');
box.style.cssText = 'position:absolute;left:-9999px;width:375px';
document.body.appendChild(box);
const medir = (html) => { box.innerHTML = html; return box.firstChild.scrollWidth; };
// ANTES: 398 en una caja de 375 → desborda 23px
// AHORA: 375 exacto
```

En el caso real, esto fue lo que convirtió "creo que lo arreglé" en **"el composer viejo pide 398px en una caja de 375; con el fix mide exactamente 375"**.

### 3. Blancos táctiles, por niveles

El área la da **el botón**, no el ícono: un `<List size={22}/>` suelto es un blanco de 22px — y en el caso real ese era el **botón de abrir el menú**, el control de navegación principal del celular.

| Nivel | Mínimo | Qué entra |
|---|---|---|
| Suelto / principal | **44px** | abrir menú, enviar, FAB, íconos de topbar |
| Denso en grupo | **36px** | chips de segmented control, acciones de fila |
| Piso duro | **24px** | WCAG 2.2 AA, criterio 2.5.8 — por debajo está mal |

Truco para no engordar la UI: **agrandar el área sin agrandar lo que se ve.**

```jsx
{/* la casilla se VE de 16px y se TOCA en 36; el margen negativo evita que la fila se mueva */}
<label className="-m-2.5 inline-grid size-9 place-items-center sm:m-0 sm:size-4">
  <input type="checkbox" className="size-4 …" />
</label>
```

El `<label>` reenvía el click al input **con el `shiftKey` intacto** (si tenés selección por rango, la necesitás). Probalo clickeando la **esquina** del área ampliada, fuera de la casilla visible.

Y el patrón general para texto/íconos: `min-h-9 px-2 -mx-2` en mobile, `sm:min-h-0` para devolver la densidad en desktop.

### 4. ⭐ NO infles lo que WCAG exime

WCAG 2.5.8 exime los targets **inline**: los que están dentro de una frase, con el tamaño limitado por el `line-height` del texto que los rodea.

En el caso real, `/master/salud` reportaba **50 enlaces bajo 24px**. Eran todos ids dentro de una oración (`lead 4d8ec702`). **Se dejaron así a propósito**: agrandarlos habría roto el renglón de la tabla.

> Un reporte en cero puede ser peor producto. La métrica es una guía, no el objetivo.

### 5. La acción que no existe: `hover` en una pantalla sin hover

Este no es un bug de tamaño, es de **existencia**, y por eso se escapa de cualquier auditoría de anchos:

```diff
- className="opacity-0 group-hover:opacity-100"
+ className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
```

En el caso real, **responder y reaccionar a un mensaje** estaban colgados de `group-hover`. En el celular no hay hover: esas dos acciones **simplemente no existían**. Mobile-first también acá — visible por defecto, y el escondite es lo que se *agrega* en desktop.

**Buscalo con:** `grep -rn "group-hover:opacity\|hover:opacity-100\|invisible group-hover" src`

### 6. Recorrer TODO, no solo lo que reportaron

El bug entra por una pantalla pero la causa es un patrón compartido. En el caso real, el mismo botón de cerrar a 30×30 estaba replicado **idéntico en 14 modales** — se arregló de una sola pasada con `perl -0pi -e`, verificando después que quedaran **0 ocurrencias** del patrón viejo.

Cubrí también las superficies que **solo existen en mobile**: el drawer del menú y los modales como bottom-sheet (`items-end sm:items-center`).

---

## Gotchas de la MEDICIÓN (los que hacen mentir al reporte)

Estos cuatro me dieron resultados falsos en la sesión real. Sin ellos, el reporte da verde y el bug sigue vivo.

1. **Medir sobre el esqueleto de carga.** Un `loading.tsx` no tiene texto ni botones → `over: 0`, `offenders: []`, todo verde. **Siempre exigí una señal de contenido real** antes de medir (`main.textContent.length > 100`) **y** que `location.pathname` sea el esperado. Mi primer barrido "limpio" de 6 pantallas era todo esqueleto.

2. **El bucle que no espera el cambio de ruta.** Si medís apenas hacés click, medís la pantalla **anterior**. Síntoma delator: **el mismo número de caracteres en rutas distintas**. Esperá `location.pathname === ruta` **Y** contenido.

3. **Un panel que no compone frames congela las animaciones.** Medí un modal y daba `top: 16, bottom: 820` en un viewport de 812 → "desborda 8px". Era el **primer frame** de su animación de entrada (`translateY(12px) scale(0.99)`), detenida porque el panel estaba oculto. `getComputedStyle(el).height` daba los 812 correctos. **Ante una geometría rara en algo animado, mirá el `transform` antes de reportar el bug.**

4. **El rol de la sesión decide qué podés ver.** Con un usuario `agent` recibía **404** en Configuración y el chat mostraba "Tomar esta conversación" **en lugar del composer** — justo la pieza rota. Media auditoría era invisible. **Averiguá con qué rol estás mirando antes de concluir**, y decí explícitamente qué quedó sin cubrir en vez de dar por barrido lo que no viste.

**Y uno de entorno:** si el panel del navegador no resuelve los boundaries de streaming en carga directa (se queda en el esqueleto), **no es la app** — comprobalo contra el baseline sin tus cambios. Solución: entrar por una ruta que cargue y **navegar por la UI** (`document.querySelector('a[href="…"]').click()`), que usa el router del cliente.

---

## Output esperado

1. **Tabla de medición por pantalla**, no adjetivos:

   | Pantalla | `over` | offenders | blancos < 24px |
   |---|---|---|---|

2. **Los arreglos**, cada uno con el mecanismo en el comentario del código (no "fix responsive": *por qué* no encogía).
3. **Lo que NO se pudo verificar y por qué** — rol insuficiente, pantalla vacía de datos, feature apagada. Explícito, nunca dado por bueno.
4. La regla en el `AGENTS.md`/`CLAUDE.md` del proyecto, para que el próximo no lo redescubra.

## Ejemplo

**Input:**
> "El chat se ve fea en el celular. Hay que mejorar el responsive en todo el sistema."

**Output:**

Diagnóstico medido, no visual:

- `1fr` en la rama compact del inbox → el track se estiraba hasta el min-content.
- El composer pedía **398px en una caja de 375** (4 botones + `<textarea>` con `flex-1` sin `min-w-0`) → **23px de desborde**, que cortaba las burbujas.
- `calc(100dvh - 49px)` ignoraba el banner de impersonación → con banner, el composer caía bajo el fold.

Arreglos + **20 y pico de pantallas medidas a 320/375/768/1280** con `scrollWidth === clientWidth` y cero elementos fuera del viewport. Verificaciones que cierran el caso:

- composer real: fila de **355px con `scrollWidth` 355**, enviar completo en 44×44.
- banner de 40px inyectado → `main` se achica **exactamente 40px**, scroll del documento en **0**.
- responder/reaccionar: 4 botones, `opacity: 1`, 32px — antes no existían en celular.

## Relacionadas

- `verificar-funcionamiento-end-to-end` — "se ve bien" ≠ "funciona"; esta skill es su versión para UI.
- `verificar-visual-midiendo-contraste` — misma idea aplicada al color: medir el ratio real en vez de confiar en el instinto.
- `dialogo-confirmacion-no-nativo` — un `window.confirm` no es responsive ni estilizable.
- `ui-distintiva-no-ai-default` — mobile-first es el piso; esa es el techo.
