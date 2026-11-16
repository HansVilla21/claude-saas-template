# Skill: Pantalla que se actualiza sola, sin recargar

## Cuándo usar esta skill

- El cliente dice alguna de estas cosas:
  - "siempre hay que refrescar para que actualice";
  - "salgo y vuelvo a entrar a ver si es algo que hago mal";
  - "no aparece hasta que recargo".
- La pantalla cambia por cosas que pasan **fuera de ella**:
  - una agenda donde reservan por un link público;
  - otra persona del equipo agenda o edita;
  - un webhook mete datos nuevos;
  - un tablero que se deja abierto todo el día.
- Un modal o un selector guarda datos en el navegador mientras está abierto (una caché por mes o por página), y el servidor puede rechazar lo que muestra.
- El stack es Next.js App Router: los datos vienen del servidor como props y la página es `force-dynamic`.

**Costo de no usarla.** En el CRM de Josué (JRM-78, 2026-10), él recargaba "constantemente", y a veces salía y volvía a entrar pensando que el error era suyo. Una pantalla que miente un rato hace que el cliente deje de confiar en todas las demás.

---

## Primero: ¿de verdad es información vieja?

Antes de construir nada, encontrá **el momento exacto** en que el cliente recargó: en la transcripción de la llamada o reproduciéndolo. Después seguí el dato hasta la pantalla.

**Caso real.** Josué guardó sus horarios, fue a la Agenda, recargó y "no salía todavía". La información NO estaba vieja: el modal pedía los horarios frescos al abrirse. El problema era el cálculo de huecos, que era otro ticket. Recargar no cambiaba nada, pero el cliente lo vivió como "hay que refrescar".

Dónde puede quedarse vieja una pantalla en Next.js App Router:

| Dónde | Cómo se ve | ¿Lo arregla esta skill? |
|---|---|---|
| Caché del servidor (`unstable_cache`, `"use cache"`, `revalidate`) | No cambia ni recargando | No: revalidar o sacar la caché |
| Caché del router del cliente (`staleTimes`, `<Link prefetch>`, volver con Atrás) | Cambia al recargar | En parte: Next 15 ya pide de nuevo al navegar (`dynamic: 0`) |
| Cambios hechos por **otros**: un lead por el link, una asistente, un webhook | La pestaña abierta nunca se entera | **Sí** |
| Una pestaña o un celular que quedó abierto horas | Muestra lo de cuando se abrió | **Sí** |
| Una caché propia en el cliente (`useRef(new Map())`) que vive mientras el componente está montado | Sigue ofreciendo algo que ya no está | **Sí** |

Con `grep -rn "unstable_cache\|use cache\|revalidate =\|staleTimes\|prefetch"` se descartan las dos primeras filas en un minuto.

---

## Proceso

### 1. Auditar las pantallas antes de elegir dónde va
`router.refresh()` vuelve a armar la página en el servidor y React cambia solo lo que cambió. **El estado del cliente se conserva**: un modal abierto, lo escrito en un campo, `useState(prop)`.

Lo que sí se pierde es todo lo que se reinicia cuando llegan props nuevas. Revisá cada componente de cliente de la pantalla:
- un `useEffect(() => reset(), [prop])` donde `prop` es un array u objeto que llega del servidor: con cada refresco llega una referencia nueva y se dispara;
- un efecto que hace foco al montarse está bien (`[]`); uno que depende de `onClose` en línea se vuelve a correr en cada render, así que fijate qué hace;
- **caso real:** el kanban de leads tenía `useEffect(() => { setExtra({}); setPendiente({}) }, [columnas])`, así que cada refresco lo devolvía a 25 tarjetas por columna. Por eso el componente **no va en el layout**: va solo en las pantallas auditadas.

### 2. El componente: `RefrescoAutomatico`
Va en cada pantalla auditada. No dibuja nada.

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const VOLVER_MS = 10_000;      // al volver, solo si lo visto tiene más que esto
const QUIETO_MS = 10 * 60_000; // sin mouse ni teclado durante esto, no pide
const TIC_MS = 10_000;         // cada cuánto se revisa si toca pedir

export function RefrescoAutomatico({ cadaSeg = 60 }: { cadaSeg?: number }) {
  const router = useRouter();
  useEffect(() => {
    const paso = cadaSeg * 1000;
    let ultimo = Date.now();
    let actividad = Date.now();
    const visible = () => document.visibilityState === "visible";
    const refrescar = () => { ultimo = Date.now(); router.refresh(); };
    const alVolver = () => { if (visible() && Date.now() - ultimo > VOLVER_MS) refrescar(); };
    const alMostrar = (e: PageTransitionEvent) => { if (e.persisted) alVolver(); }; // bfcache
    const alUsar = () => { actividad = Date.now(); };
    const tic = setInterval(() => {
      const ahora = Date.now();
      if (visible() && ahora - actividad < QUIETO_MS && ahora - ultimo >= paso) refrescar();
    }, TIC_MS);
    const uso = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", alVolver);
    window.addEventListener("pageshow", alMostrar);
    for (const ev of uso) window.addEventListener(ev, alUsar, { passive: true });
    return () => {
      clearInterval(tic);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", alVolver);
      window.removeEventListener("pageshow", alMostrar);
      for (const ev of uso) window.removeEventListener(ev, alUsar);
    };
  }, [router, cadaSeg]);
  return null;
}
```

Si la pantalla tiene un `return` temprano, por ejemplo un estado vacío, el componente también va ahí. Si no, la pantalla vacía nunca se entera de lo primero que entra.

### 3. Por qué el freno por inactividad
En Vercel Hobby cada refresco es una invocación con CPU contada, más una lectura en la base. Una pestaña olvidada toda la noche, refrescando cada minuto, son cientos de renders y se comen el plan.

Con el freno, la pestaña sin nadie enfrente no pide nada. Cuando alguien mueve el mouse, se pone al día en el siguiente tic. `visibilityState` no alcanza solo: una ventana a la vista en un segundo monitor sigue siendo "visible".

### 4. Las cachés del cliente: refresco silencioso
Si un selector guarda lo que ya pidió (por ejemplo, la disponibilidad por mes mientras el modal está abierto), hacen falta tres cosas:

- **Volver a pedir al volver a la pestaña.** Se limpia la caché y se pide de nuevo. Usá un umbral **corto** (5 s), que solo sirve para no pedir doble cuando `focus` y `visibilitychange` llegan juntos. Con 30 s se escapaba el caso "guardo en la otra pestaña y vuelvo".
- **Una prop `recargar`** (un contador) que el padre sube cuando el servidor rechaza lo elegido, por ejemplo "ese horario ya no está libre". Así el horario rechazado desaparece; antes, el selector lo seguía ofreciendo hasta recargar.
  - **Trampa:** ignorá el valor inicial al montar, con un ref que guarde el último visto. Si el padre ya tenía `recargar = 2` de una apertura anterior del modal, el selector pide dos veces al abrirse.
- **Refresco silencioso.** Si lo que se refresca es lo que está en pantalla:
  - no muestres "Cargando…": se ve lo anterior hasta que llega lo nuevo;
  - si el pedido falla, quedate con lo que había;
  - el error se muestra solo si no había nada en pantalla.

```tsx
const alDia = mostrando.current === clave;  // ¿es lo que ya se ve?
if (!alDia) setCargando(true);
pedir().then((r) => {
  if (r.ok) cache.current.set(clave, r);
  if (!vivo || (!r.ok && alDia)) return;    // un error no tapa lo que había
  setRes(r);
  mostrando.current = r.ok ? clave : "";
});
```

Los efectos que ya limpian la selección cuando deja de estar disponible ("el horario elegido tiene que seguir a la vista") hacen el resto, sin código nuevo.

### 5. Refresco periódico o tiempo real
- **Refresco periódico + al volver** (esta skill): no toca la base ni la infraestructura, y la demora es de un minuto como mucho. Alcanza para "no tengo que recargar".
- **Supabase Realtime** (`postgres_changes`): es instantáneo, pero hay que agregar la tabla a la publicación `supabase_realtime`, que es un cambio en producción. Además suma conexiones abiertas y la RLS se evalúa por suscriptor. Usalo cuando importan los segundos, como en una bandeja de chat (ver `supabase-realtime-broadcast-pattern`).

### 6. Verificar sin sesión
Las pantallas reales piden login. Lo que se prueba es la mecánica:

1. **Una página local fuera del middleware de sesión**, por ejemplo `app/agendar/preview-x/`, con `force-dynamic`. Muestra la hora del servidor y monta `<RefrescoAutomatico cadaSeg={15} />`.
2. **El componente REAL copiado con `sed`, cambiando solo el import de la acción** por una acción falsa que devuelve algo distinto en cada pedido (un contador en el módulo). Confirmá con `diff --strip-trailing-cr` que esa es la única diferencia.
3. **Las pruebas, por JS en el navegador:**
   - **Rechazo:** desaparece lo rechazado, se limpia la selección y hay exactamente N pedidos. Para confirmar que no aparece "Cargando…", usá un `MutationObserver`.
   - **Foco:** un foco antes del umbral no pide; uno después sí.
   - **Refresco solo:** la hora del servidor cambia sin perder lo elegido.
   - **Inactividad:** adelantá `Date.now` 11 minutos y en 25 s no tiene que pedir nada. Después mandá un `pointermove`: tiene que pedir en un tic como mucho.
4. **Antes del commit:**
   - borrá la página **y** `.next/types/app/.../preview-x`, porque si no rompe el typecheck;
   - parás el servidor de desarrollo antes de `next build`, porque los dos escriben en `.next`.

### 7. Decírselo al usuario
Poné una nota en la ayuda de cada pantalla: *"Se actualiza sola: cuando volvés a ella y cada minuto mientras la usás. No hace falta recargar."* El hábito de recargar no se va solo; hay que contárselo.

## Output esperado
- `components/ui/RefrescoAutomatico.tsx`, montado solo en las pantallas auditadas.
- Las cachés del cliente con refresco silencioso y la prop `recargar` conectada al rechazo del servidor.
- La nota en la ayuda de cada pantalla.
- El banco de prueba con los cuatro resultados (rechazo, foco, refresco solo, inactividad), borrado antes del commit.

## Ejemplo
**Input:** JRM-78, "la agenda no se actualiza sola: hay que refrescar la página".

**Output:**
1. **Diagnóstico:**
   - el momento de la llamada era el cálculo de huecos (otro ticket), no información vieja;
   - la queja de fondo sí era real: ni la Agenda ni Hoy se enteraban de una reserva por el link o de una cita que agendaba la asistente;
   - el selector del modal seguía ofreciendo un horario que el servidor ya había rechazado.
2. **Arreglo:**
   - `RefrescoAutomatico` en Agenda y Hoy, que no va en `/leads` por el kanban;
   - el selector refresca en silencio al volver a la pestaña y con `recargar`;
   - la nota en la ayuda.
3. **Verificado** en el banco local:
   - el rechazo dejó 2 pedidos y no 3, sin "Cargando…";
   - el foco temprano no pidió y el tardío sí;
   - la hora del servidor cambió cada ~20 s con lo elegido intacto;
   - con el reloj adelantado no pidió, y al mover el mouse refrescó en 10 s.
