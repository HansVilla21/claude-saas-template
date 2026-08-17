# Skill: "Hago algo y tengo que refrescar para verlo" — refrescar la vista server tras una mutación cliente

## Cuándo usar esta skill

- Hacés una acción en el navegador (guardar un nombre, cambiar un estado, togglear algo) y **la parte que muestra ese dato no se actualiza hasta F5**.
- Lo que queda viejo lo pinta un **Server Component** (un layout, el sidebar, otra página) — no el mismo componente donde escribiste.
- El founder dice "esto pasa por todo el sistema": hago algo pero tengo que recargar para que se refleje.

## Por qué existe esta skill

En Next.js App Router (RSC), una mutación **client-side** (un `supabase...update()`, un server action que escribe) **NO re-ejecuta los Server Components por su cuenta**. El estado local del componente donde escribiste cambia (o hacés update optimista), pero cualquier cosa **renderizada en el server** queda con el valor viejo hasta que algo revalide.

Caso real (Mi perfil, 2026-07-08): guardar el nombre actualizaba el input (estado cliente) pero el **bloque "Mi perfil" del sidebar** —que lo pinta el layout server leyendo `public.users`— seguía mostrando el email hasta F5. Se ve como "no se guardó", pero sí se guardó: lo que no se refrescó es la vista server.

## Proceso

### 1. Clasificar QUÉ está viejo

- ¿El dato desactualizado lo renderiza un **Server Component** (layout, page, algo que hace `await supabase...` en el server)? → necesitás revalidar el server (paso 2).
- ¿Es **estado cliente** del mismo componente? → actualizalo con `setState` (no necesitás refresh).
- ¿Es un cambio hecho por **OTRO usuario/pestaña**? → eso NO lo arregla refresh; necesitás **realtime** (broadcast/subscription).

### 2. Si es server-rendered: `router.refresh()` tras el write

```tsx
const router = useRouter(); // next/navigation
// ...tras el write que persistió OK:
await supabase.from('users').update({ full_name }).eq('id', userId);
router.refresh(); // re-corre los Server Components → re-leen la fuente → la vista server se actualiza
```
- `router.refresh()` re-ejecuta los server components de la ruta actual y re-fetchea, **sin re-montar** los client components (preservan su estado). Por eso el input no se pierde, pero el sidebar (server) sí se actualiza.
- En un Server Action, el equivalente es `revalidatePath(...)` / `revalidateTag(...)` dentro de la action.

### 3. Si es cross-usuario: realtime, no refresh

Si el cambio lo hace otra persona (o el mismo user en otra pestaña), `router.refresh()` en tu sesión no se entera. Ahí va un broadcast/subscription (ej. un trigger `realtime.send()` en UPDATE + un hook que escucha). Ver `desktop-notifications-from-realtime`.

### 4. Verificar

Hacé la acción y confirmá que la vista server se actualiza **sin F5**. (No te fíes de que "compiló": es un bug de runtime, verificalo en vivo.)

## Output esperado

- Tras la mutación, la vista server-rendered refleja el cambio **sin recargar**.
- El estado del client component NO se pierde (router.refresh no re-monta).
- Si el caso era cross-usuario, se resolvió con realtime, no con refresh.

## Ejemplo concreto (Casa CRM, 2026-07-08)

- Mi perfil: `saveName()` escribía `public.users.full_name` client-side + sync a auth metadata. El input se actualizaba, pero el sidebar (layout server que lee `public.users`) quedaba viejo hasta F5. Fix: `router.refresh()` al final de `saveName()`.
- Notificaciones: marcar leída una notificación es un UPDATE; para que la campana (otro componente) bajara el badge EN VIVO se hizo que el trigger `broadcast_notification` emitiera también en UPDATE (op=TG_OP) → la campana lo recibe por realtime. (Ese caso era "sincronizar entre componentes/pestañas" → realtime, no refresh.)

## Gotchas / antipattern

- **NO** confundir este bug con "UI optimista que se traga el error" (otro problema: el write falló y revertiste en silencio; ahí verificá que el write persistió — ver `verificar-funcionamiento-end-to-end`). Acá el write SÍ persistió, solo faltó revalidar la vista server.
- **NO** uses `router.refresh()` para datos que solo viven en estado cliente — es innecesario y re-corre todo el server.
- **NO** uses `router.refresh()` para reflejar cambios de OTRO usuario — no los ve; eso es realtime.
- **NO** lo pongas en un efecto que corre en loop; disparalo puntualmente tras la mutación.
- **SIEMPRE** verificá en vivo que la vista server se actualiza sin F5.

## Skills relacionadas

- `desktop-notifications-from-realtime` — el otro lado: sincronizar cambios cross-usuario/pestaña por realtime en vez de refresh.
- `verificar-funcionamiento-end-to-end` — descartar que sea un write que no persistió antes de asumir que es staleness.
- `toaster-montado-por-scope` — otra causa de "hice algo y no pasó nada visible" del mismo sistema.
