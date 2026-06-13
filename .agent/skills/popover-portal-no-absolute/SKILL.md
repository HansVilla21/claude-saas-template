# Skill: Popovers y dropdowns SIEMPRE con portal, NUNCA con `absolute`

## Cuándo usar esta skill

- Vas a crear o tocar **cualquier elemento flotante** en el CRM: dropdown, popover, menú contextual, panel desplegable, selector custom, tooltip clickeable, combobox.
- Un dropdown/popover existente se ve **cortado, recortado, o queda detrás de otro contenido** en vez de flotar por encima de todo.
- Estás revisando un componente de UI nuevo antes de mergear.

**Regla de oro:** en este proyecto, **un panel flotante NUNCA se posiciona con `position: absolute` dentro del flujo**. Siempre se renderiza con el componente compartido `<Popover>` (portal al `body`).

## Por qué existe esta skill (el bug recurrente)

Capturada el 2026-06-12 tras la 3ª+ vez que aparece el MISMO bug. El founder, con razón: *"si ya pasó una vez y se corrigió, no puede seguir pasando. Crear las cosas bien, que funcionen."*

**El bug:** un popover con `position: absolute` se posiciona relativo a su contenedor. Pero los contenedores del CRM (el sidebar del shell tiene `overflow-y-auto`, los paneles del inbox también, y varios crean stacking contexts por `transform`/`position`) **atrapan y recortan** ese popover. El `z-index: 50` no salva porque **el z-index solo compite DENTRO del stacking context del ancestro**, no contra el viewport. Resultado: el panel queda cortado por el `overflow` o detrás del contenido principal.

**Por qué se repite:** la solución correcta (portal) existía hace tiempo en `bits.tsx` (`ProvenancePopover`), pero cada componente nuevo la re-implementaba a mano con `absolute` y volvía a romperse. La cura definitiva fue **extraer el patrón a un componente compartido** para que NUNCA se re-implemente.

## La regla (no negociable)

Para cualquier panel flotante, usá el componente:

```
src/components/ui/popover.tsx  →  <Popover>
```

Ejemplo de uso real (API controlada, render-prop para el trigger):

```tsx
import { useState } from 'react';
import { Popover } from '@/components/ui/popover';

const [open, setOpen] = useState(false);

<Popover
  open={open}
  onOpenChange={setOpen}
  align="end"               // 'start' | 'end' — borde de alineación al trigger
  side="bottom"             // 'bottom' | 'top' — lado preferido (hace auto-flip si no entra)
  width={224}               // opcional, px
  panelRole="menu"          // 'dialog' | 'menu' | 'listbox'
  panelAriaLabel="Opciones"
  trigger={({ ref, triggerProps, toggle }) => (
    <button ref={ref} onClick={toggle} {...triggerProps}>Abrir</button>
  )}
>
  {/* contenido del panel */}
</Popover>
```

El `<Popover>` ya resuelve TODO lo que un panel flotante necesita (ver checklist). No reimplementes nada de eso a mano.

## Qué garantiza el componente (y qué debe tener cualquier popover)

Si alguna vez tenés que tocar el componente o auditás uno, debe cumplir TODO esto:

- [ ] **Renderiza con `createPortal(node, document.body)`** — escapa de cualquier `overflow`/stacking del ancestro. NUNCA `absolute` en el flujo del componente.
- [ ] **`position: fixed`** con coords calculadas por `getBoundingClientRect()` del trigger.
- [ ] **Auto-flip** vertical (si no entra abajo y sí arriba, flipea) + **clamp** horizontal al viewport.
- [ ] **Recalcula en `scroll` (capture: true)** — para capturar scrolls de contenedores anidados — **y en `resize`**.
- [ ] **SSR guard** — `document` no existe en SSR (en este repo, React 19 + ESLint prohíbe `setState` en efecto → usar `useSyncExternalStore`/`useIsClient`, no `useState`+`useEffect`).
- [ ] **z-index alto** (>= 1000) tanto en backdrop como en panel.
- [ ] **Backdrop** invisible `fixed inset-0` para cerrar al click afuera **+ cerrar con Escape**.
- [ ] **Accesible:** `aria-haspopup` + `aria-expanded` en el trigger; `role` en el panel; manejo de foco.

## Cómo detectar el bug (síntoma → causa)

Si ves un dropdown **cortado por el borde de un panel**, **detrás del contenido**, o que **no aparece entero** → casi seguro es un popover `absolute` atrapado. Buscá en el componente `className="... absolute ... z-..."` para el panel. Ese es el patrón prohibido. Migralo a `<Popover>`.

## Dropdowns legacy pendientes de migrar (al 2026-06-12)

Estos todavía usan el patrón vulnerable (`absolute` + backdrop manual). Migrarlos a `<Popover>` cuando se toquen, o en una tanda dedicada:

- `src/components/inbox/agent-filter.tsx`
- `src/components/inbox/card-config.tsx`
- `src/components/inbox/tag-editor.tsx`
- `src/components/inbox/ai-assist.tsx` (abre hacia arriba → `side="top"`)
- `src/components/contactos/inline-dropdowns.tsx` (dos instancias)

(Los `*-modal.tsx` NO aplican: son overlays centrados full-screen, no popovers anclados a un trigger.)

## Tooltips: `<Tooltip>`, NUNCA el `title=` nativo

El MISMO principio aplica a los tooltips. El atributo `title=` HTML dispara el tooltip **nativo del navegador** — gris, lento, "de sistema predeterminado", look de baja calidad. **Prohibido** en cualquier elemento que el usuario vea.

**La regla:** para un tooltip usá el componente compartido `<Tooltip>` (`src/components/ui/tooltip.tsx`), portal-based igual que `<Popover>`.

```tsx
import { Tooltip } from '@/components/ui/tooltip';

<Tooltip label="Marcar como leída" side="top">
  <button aria-label="Marcar como leída">…</button>
</Tooltip>
```

- `<Tooltip>` envuelve el trigger (children). Props: `label`, `side` ('top'|'bottom'|'left'|'right', con auto-flip), `align`, `delay` (ms), `disabled`. Para el caso `title={cond ? 'x' : undefined}` → `<Tooltip label="x" disabled={!cond}>`.
- **CONSERVÁ el `aria-label`** del elemento — el tooltip es visual, el `aria-label` es accesibilidad; no son lo mismo, no borres el aria-label.
- NUNCA `title="..."` sobre un `button`/`span`/`div`/`p`/`select` que el usuario ve. (El `title` como PROP de un componente React propio — `<SectionCard title=...>`, `<PageHeader title=...>` — es OTRA cosa y está bien; no lo toques.)

**Cómo detectarlo:** `grep -rn 'title=' src/ --include='*.tsx'`. Si está sobre un elemento DOM nativo → migrá a `<Tooltip>`. Si es prop de un componente tuyo → dejalo.

**Pendiente de migrar (al 2026-06-12):** ~7 `title=` nativos en `src/app/master/**` (panel de salud/clientes — solo lo ve el master, no el cliente). Migrar en una segunda tanda.

## Output esperado

Cualquier elemento flotante nuevo usa el componente compartido de `src/components/ui/` (`<Popover>` para paneles/dropdowns, `<Tooltip>` para tooltips) y flota por encima de TODO, sin cortarse, en desktop y mobile, con auto-flip y clamp. **Cero `absolute` para paneles flotantes y cero `title=` nativo en código que el usuario ve.**

## Ejemplo

**Input:** "Agregá un menú de acciones (•••) a la tarjeta de conversación con opciones marcar no leída / archivar."

**Output correcto:** un `<Popover>` con `panelRole="menu"`, trigger = el botón •••, children = la lista de acciones. NO un `<div className="absolute ...">`.

Origen del patrón: `src/components/inbox/bits.tsx` (`ProvenancePopover`). Componente compartido: `src/components/ui/popover.tsx`.
