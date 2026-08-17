# Skill: Diálogos de confirmación con el design system (nunca `window.confirm`/`alert`/`prompt`)

## Cuándo usar esta skill

- Vas a pedir una confirmación antes de una acción (borrar, apagar algo, un paso irreversible o de peso).
- Estás por escribir `window.confirm(...)`, `alert(...)` o `prompt(...)`.
- Necesitás avisar/alertar/pedir un dato al usuario en una app con identidad visual propia.
- Ves un `window.confirm` existente que "funciona" pero se ve como popup gris del navegador.

## Por qué existe esta skill

Regla del founder (2026-07-08, a partir del toggle "apagar chatbot" de Givi): **cada vez que aparece una ventana de confirmación, tiene que verse con el diseño del sistema — nunca el diálogo nativo del navegador.**

Los diálogos nativos (`confirm`/`alert`/`prompt`):
- Rompen visualmente: popup gris del SO, sin marca, tipografía y colores ajenos, posición fija arriba. En una app cuidada se ve como un bug.
- No se pueden estilizar ni hacer responsive.
- Bloquean el hilo (síncronos) y algunos navegadores los suprimen/limitan.
- Dan sensación de producto barato justo en el momento de más fricción (una acción destructiva).

## Proceso

### 1. Buscá un componente de confirmación reusable ANTES de escribir uno

La mayoría de los proyectos ya tienen un modal (o un patrón de modal). Ordená así:
1. Un `<ConfirmDialog>` genérico en `components/ui/` (o equivalente) → usalo tal cual.
2. Si no hay genérico pero SÍ hay modales de dominio (ej. "borrar X", "remover miembro") → calcá su patrón visual (backdrop + card animados, Escape cierra, scroll-lock) para el genérico nuevo. NO inventes un estilo distinto.
3. Recién si no hay nada, construí el genérico siguiendo el design system (tokens de color, radios, sombras del proyecto).

### 2. Forma del componente genérico

Props mínimas: `open`, `title`, `description`, `confirmText`, `cancelText`, `variant` (`default | warning | destructive`), `pending`, `onConfirm`, `onCancel`.
- `variant` mapea a color/ícono (destructive = rojo + warning-circle; default = acento).
- `pending` para deshabilitar botones + spinner mientras corre la acción async (y no permitir doble-submit).
- Accesible: `role="alertdialog"`, `aria-modal`, Escape cierra (salvo `pending`), click en backdrop cierra, foco manejado.
- Theme-aware / responsive: full-screen en mobile, card centrada en desktop.

### 3. Reemplazá el `window.confirm` por estado + modal

Antipattern:
```tsx
onChange={(v) => { if (!v && !window.confirm('¿Seguro?')) return; patch(v); }}
```
Patrón:
```tsx
const [confirming, setConfirming] = useState(false);
// ...
onChange={(v) => { if (!v) { setConfirming(true); return; } patch(v); }}
// ...
<ConfirmDialog open={confirming} variant="warning"
  title="¿Apagar X para todo el negocio?"
  description="..."
  confirmText="Sí, apagarlo" onCancel={() => setConfirming(false)}
  onConfirm={() => { patch(false); setConfirming(false); }} />
```

### 4. Dejalo como regla del proyecto

Anotá en las reglas operativas del proyecto (`AGENTS.md`/`CLAUDE.md`): "Nunca `window.confirm`/`alert`/`prompt`. Usar `<ConfirmDialog>` (o el patrón de modal del design system)."

## Output esperado

- Cero `window.confirm`/`alert`/`prompt` en código user-facing.
- Un `<ConfirmDialog>` reusable (o el reuso del que ya existía) con variante destructive/warning/default, `pending`, accesible y responsive.
- La regla anotada en el `AGENTS.md`/`CLAUDE.md` del proyecto.

## Ejemplo concreto (Casa CRM, 2026-07-08)

- Gatillo: el toggle "Chatbot activado" (apagar el bot por agencia, caso Givi) usaba `window.confirm`. El founder lo marcó como feo → regla permanente.
- No existía genérico; sí `delete-agency-confirm-modal` y `remove-member-confirm-modal`. Se extrajo el patrón a `src/components/ui/confirm-dialog.tsx` (`<ConfirmDialog>` con variantes) y se reusó en el toggle + luego en el borrar-nota del feed de notas.
- Regla agregada a `crm-v2/AGENTS.md` §4.

## Gotchas / antipattern

- **NO** `window.confirm/alert/prompt` en nada que vea el usuario.
- **NO** inventes un modal nuevo si el proyecto ya tiene un patrón — calcalo (consistencia > originalidad).
- **NO** olvides el estado `pending` en confirmaciones que disparan una acción async → si no, doble-click = doble acción.
- **NO** cierres el modal en medio de una acción en curso (dejá `pending` bloqueando Escape/backdrop hasta que resuelva).
- **SIEMPRE** variante `destructive` (roja) para borrar/irreversibles — el color comunica el peso antes de leer.

## Skills relacionadas

- `popover-portal-no-absolute` — misma familia: overlays con portal en vez de `position: absolute`, del mismo design system.
- `crm-contact-detail-tabs` / `inbox-message-bubble-render` — otros patrones de UI reusables del proyecto.
