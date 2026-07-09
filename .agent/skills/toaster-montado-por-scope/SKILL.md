# Skill: Toasts que no aparecen sin error — falta el `<Toaster>` en ese scope

## Cuándo usar esta skill

- Llamás `toast(...)` / `toast.success(...)` (sonner, react-hot-toast, etc.) y **no aparece nada** — ni error en consola.
- Una acción "no da feedback": guardaste algo, no pasó nada visible, pero el write sí funcionó.
- Los toasts funcionan en UNA parte de la app (ej. el panel de admin) pero no en otra (ej. el área de cliente).

## Por qué existe esta skill

Las librerías de toast necesitan su **contenedor montado en el árbol** (`<Toaster/>` de sonner, `<Toaster/>` de react-hot-toast, etc.). `toast()` solo **encola** el aviso; si no hay un `<Toaster>` montado en un layout que envuelva a quien llama, **el toast se descarta en silencio** — no tira error, simplemente no hay nada que lo renderice.

En apps con **varios scopes de layout** (ej. `/master/*` con su layout y `/a/[slug]/*` con otro), es facilísimo montar el `<Toaster>` en UN solo layout y que todo el otro scope llame `toast()` al vacío.

Caso real (Casa CRM, 2026-07-08): el `<Toaster>` de sonner estaba **solo** en `app/master/layout.tsx`. Todo el scope de agencia (`/a/[slug]/*`) llamaba `toast()` desde varios lados —invitar/remover miembro, probar-bot, cambiar contraseña— y **ninguno mostraba nada**. Se descubrió porque "cambié la contraseña y no me avisó". Un bug latente que afectaba una clase entera de acciones.

## Proceso

### 1. Confirmar que el `<Toaster>` existe en ESE scope

```bash
grep -rn "Toaster" src/ | grep -v "toast("   # dónde está montado el contenedor
```
Fijate en QUÉ layouts está el `<Toaster>` y desde qué rutas se llama `toast()`. Si hay un scope (grupo de rutas con su propio `layout.tsx`) que llama `toast()` pero no tiene un `<Toaster>` que lo envuelva → ese es el bug.

### 2. Montar un `<Toaster>` que cubra todos los scopes

Dos estrategias:
- **Uno global** en el layout raíz (`app/layout.tsx`) → cubre toda la app. Lo más simple si el estilo es único.
- **Uno por scope** (un `<Toaster>` en cada `layout.tsx` de scope) → si querés config distinta por área. **Calcá la config** (position, richColors, className) entre scopes para consistencia visual.

```tsx
// app/a/[slug]/layout.tsx  (el scope que no lo tenía)
import { Toaster } from 'sonner';
// ...
<>
  <AgencyShell ...>{children}</AgencyShell>
  <Toaster richColors position="top-right" toastOptions={{ className: 'font-sans' }} />
</>
```

### 3. Verificar en vivo

Disparar un `toast()` desde el scope que estaba mudo y confirmar que ahora aparece.

## Output esperado

- Cero `toast()` que caen al vacío: todo scope desde donde se llama `toast()` tiene un `<Toaster>` que lo envuelve.
- Config del `<Toaster>` consistente entre scopes.

## Ejemplo concreto (Casa CRM, 2026-07-08)

- `<Toaster>` de sonner solo en `app/master/layout.tsx`. Toasts del scope `/a/[slug]` (invitar/remover miembro, probar-bot, Mi perfil) se disparaban al vacío. Fix: montar `<Toaster richColors position="top-right">` en `app/a/[slug]/layout.tsx` (config espejo del master). Arregló de una toda la clase de "no me avisó".

## Gotchas / antipattern

- **NO** asumas que porque `toast()` funciona en una pantalla, funciona en todas — depende del scope de layout que la envuelve.
- **NO** confundas "el toast no aparece" con "el código no llegó a llamar `toast()`" — primero verificá que el `<Toaster>` exista en ese scope; después mirá si el código corre.
- **NO** montes dos `<Toaster>` que se pisen en el mismo árbol (duplicaría avisos). Uno por scope, o uno global.
- **SIEMPRE** que agregues toasts a un scope/layout nuevo, verificá que ese scope tenga su `<Toaster>`.

## Skills relacionadas

- `refrescar-vista-server-tras-mutacion-cliente` — otra causa de "hice algo y no pasó nada visible" en el mismo sistema.
- `dialogo-confirmacion-no-nativo` — misma familia de UX de feedback: usar el sistema de diálogos/avisos propio, no los nativos.
