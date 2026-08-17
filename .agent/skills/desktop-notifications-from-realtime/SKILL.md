# Skill: Notificaciones de escritorio del SO enganchadas a un realtime por-usuario

## Cuándo usar esta skill

- Ya tenés un centro de notificaciones in-app que recibe eventos en vivo por un canal de realtime por-usuario (`user:<id>`, evento `notification`) y querés que además aparezca un **toast nativo del sistema operativo** (Windows/macOS/Linux) cuando llega algo nuevo.
- El requerimiento es "que me lleguen avisos a la compu" en un CRM/dashboard/inbox que el operador tiene abierto durante su jornada.
- Querés el camino **simple** (Web Notifications API) antes de comprometerte con el camino **grande** (Web Push + service worker + VAPID).

Es el **consumidor** del patrón productor `supabase-realtime-broadcast-pattern`: ese crea el trigger que emite el broadcast; esta skill lo convierte en toast del SO.

## Decisión de alcance ANTES de construir (no te saltees esto)

| | **A — Web Notifications API** | **B — Web Push + SW + VAPID** |
|---|---|---|
| Aparece cuando | el sitio está abierto en **alguna pestaña** (puede estar en segundo plano/minimizada) | incluso con el **navegador cerrado** |
| Backend nuevo | **ninguno** — se cuelga del realtime que ya existe | tabla de subscriptions + sender server-side (Edge Function) + claves VAPID + service worker |
| Costo / superficie | ~3 archivos de frontend | varias piezas, ciclo de vida de subscriptions (410 → limpiar) |
| Cuándo | operador con el CRM abierto durante el día (90% de los casos B2B) | hace falta alcanzar al usuario fuera de la app |

**Regla:** empezá por A. **No es trabajo tirado** — el helper `showDesktopNotification` se reusa tal cual en B; lo único que se agrega encima es el transporte push + el service worker. Planteale la decisión al founder con este trade-off y esperá su elección antes de escribir código.

## Arquitectura (alcance A)

Tres piezas + un enganche quirúrgico al hook de datos que ya existe:

1. **`lib/notifications/desktop.ts`** — helper PURO del navegador (sin React): soporte, permiso, `showDesktopNotification(row, { onClick })`.
2. **`components/notifications/use-desktop-notifications.ts`** — hook: estado de permiso (`supported`, `permission`, `request()`) + `notify(row)` que navega al recurso en el click.
3. **enganche en el hook de datos** (`use-notifications.ts`): un callback opcional `onIncoming(row)` disparado SOLO en el INSERT genuino. El hook de datos sigue **agnóstico** del escritorio.
4. **banner de permiso en la UI** (dentro del panel del bell): se pide el permiso **por gesto del usuario**, nunca auto al cargar.

```
realtime INSERT (canal user:<id>) ──> use-notifications.handle()
                                          │  (op === 'INSERT' && !firedRef.has(id))
                                          ▼
                                     onIncoming(row) ──> desktop.notify(row)
                                                            └─> showDesktopNotification(row)
                                                                  guard: soporte + permiso + viewer NO activo
```

## Los 6 gotchas no-obvios (el valor de esta skill)

### 1. El side-effect va FUERA del updater de setState, con dedupe propio por id
El punto donde detectás "entró una notificación nueva" suele estar dentro de `setState(prev => …)`. Ese updater **debe ser puro** — no podés llamar al side-effect ahí. Solución: un `useRef<Set<string>>` de IDs ya despachados; disparás el callback en el cuerpo del handler (antes del setState) solo si `op === 'INSERT' && !firedRef.has(id)`.

```typescript
const firedRef = useRef<Set<string>>(new Set());
// dentro del handler del broadcast, ANTES de setNotifications(...):
if (op === 'INSERT' && !firedRef.current.has(row.id)) {
  firedRef.current.add(row.id);
  onIncomingRef.current?.(row);
}
```
El `firedRef` arranca vacío y solo se llena con lo que llega por broadcast → **nunca** notificás las viejas del fetch inicial. Es un dedupe independiente del guard de la lista (que vive en el updater).

### 2. Pedir permiso SOLO con un gesto del usuario
`Notification.requestPermission()` llamado en un `useEffect` de montaje hace que el navegador lo **penalice o auto-deniegue**. Tiene que colgar de un `onClick` (un botón "Activar" en el panel). Nunca automático.

### 3. "No molestar si ya lo estás viendo"
Si el usuario tiene el CRM **visible y enfocado**, NO dispares el toast — el badge in-app alcanza, un toast encima es ruido. Guard:
```typescript
const isViewerActive = () =>
  document.visibilityState === 'visible' &&
  (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
// mostrar el toast solo si !isViewerActive()
```
Combiná `visibilityState` (pestaña en primer plano de su ventana) **y** `hasFocus()` (la ventana del navegador es la app activa del SO). Así notificás cuando el usuario está en otra app/pestaña/minimizado, y callás cuando mira el CRM. **Este es el error #1 al testear:** vas a estar mirando el CRM esperando el toast y no sale — porque funciona correctamente.

### 4. El broadcast es efímero → para ver el toast hay que estar suscrito EN VIVO
El `realtime.send()` no persiste: si el cliente no está suscrito al canal **en el momento** del evento, no recibe el toast (la notif sí queda en la tabla y aparece en el fetch siguiente, sin toast). Implicaciones:
- **Testing:** el operador tiene que tener la app abierta + permiso concedido + pestaña en segundo plano ANTES de disparar el evento.
- **Por qué A no cubre "navegador cerrado":** sin pestaña viva no hay suscripción → no hay toast. Eso es exactamente lo que resuelve B (Web Push).

### 5. SSR + la regla `react-hooks/set-state-in-effect`
El estado de permiso depende de `Notification.permission`, que no existe en SSR. Inicializá en un valor neutro (`'unsupported'`) y resolvé el real en un efecto **diferido a microtask** (no síncrono en el cuerpo del efecto), para no romper hidratación ni violar la regla del linter:
```typescript
const [permission, setPermission] = useState<DesktopPermission>('unsupported');
useEffect(() => {
  let cancelled = false;
  Promise.resolve().then(() => { if (!cancelled) setPermission(getDesktopPermission()); });
  return () => { cancelled = true; };
}, []);
```

### 6. `tag = row.id` + fuente única de la URL
- `new Notification(title, { tag: row.id })` colapsa reentregas del mismo evento en un solo toast (un re-subscribe no apila dos).
- Extraé la construcción de la URL del recurso a **una sola función** (`inboxHrefForNotification(row, slug)`) y usala TANTO en el click in-app COMO en el `onClick` del toast, para que el destino no diverja entre los dos caminos.
- El `onclick` del toast: `window.focus()` (trae el navegador al frente) → `notification.close()` → navegar.

## Cómo probar end-to-end (la única verificación que vale)

"Compila" / "el badge sube" **no** es "el toast sale". El toast solo se ve en la máquina del operador. Verificación real:

1. Confirmá contra la fuente de verdad que un INSERT directo dispara el broadcast: leé el trigger (`pg_get_functiondef`) y comprobá que hace `realtime.send(..., 'notification', 'user:'||user_id, true)`. Si es un trigger AFTER INSERT, **un INSERT por SQL dispara exactamente la misma cadena que el evento real**.
2. El operador se monta: dev server en la rama correcta (¡el código nuevo puede no estar deployado!), login, abrir el bell → "Activar" → "Permitir", y **pasar a otra app** (CRM en segundo plano).
3. Disparás el INSERT real:
```sql
INSERT INTO public.notifications (agency_id, user_id, type, title, body, resource_type, resource_id, data)
VALUES ('<agency>', '<user>', 'new_message', 'Mensaje nuevo de X', 'preview…',
        'conversation', '<conv_id>',
        jsonb_build_object('conversation_id','<conv_id>'));
```
4. El operador confirma: salió el toast + el click abre el recurso. **Recién ahí es "hecho".**
5. **Limpiá la notif de prueba** de la tabla (la metiste vos en producción): `DELETE … WHERE id = '<id>'`. Ojo: si no hay trigger de broadcast para DELETE, su UI no se actualiza en vivo → un F5 la saca (esperado).

Ver `verificar-funcionamiento-end-to-end`.

## Output esperado

1. `lib/notifications/desktop.ts` con guards de soporte/permiso/viewer-activo.
2. `use-desktop-notifications.ts` con estado de permiso + `notify(row)` + navegación.
3. Enganche `onIncoming` en el hook de datos (quirúrgico, no toca la lógica de la lista).
4. Banner de permiso por gesto en la UI.
5. `tsc` + `eslint` + `build` limpios **y** toast confirmado por el usuario en su SO.

## Gotchas / antipattern

- **NO** pidas permiso en un efecto de montaje (penalización del navegador). Solo por gesto.
- **NO** dispares el side-effect dentro del updater de `setState` (impuro). Usá un ref de IDs disparados.
- **NO** notifiques si la pestaña está visible+enfocada (ruido).
- **NO** asumas que el toast salió porque insertaste la fila: el broadcast es efímero, hay que estar suscrito en vivo, y depende de permiso + "Asistente de concentración"/No molestar del SO (fuera del código).
- **NO** dupliques la lógica de la URL del recurso entre el click in-app y el del toast — una sola fuente.
- **NO** vendas "navegador cerrado" con alcance A. Eso es B (Web Push) y es un proyecto aparte.

## Skills relacionadas

- `supabase-realtime-broadcast-pattern` — el **productor** del evento (trigger + `realtime.send`) que esta skill consume.
- `verificar-funcionamiento-end-to-end` — el toast solo cuenta como hecho cuando el usuario lo ve en su SO.
- `inbox-message-bubble-render` / `crm-inbox-conv-list-filters-strip` — otros consumidores del mismo realtime.

## Ejemplo concreto (Momentum AI CRM v2, 2026-06-13)

- Realtime existente: canal `user:<id>`, evento `notification`, trigger `broadcast_notification` (AFTER INSERT en `public.notifications`).
- Se agregaron `desktop.ts` + `use-desktop-notifications.ts`, el callback `onIncoming` en `use-notifications.ts`, y el banner de permiso en `notification-bell.tsx`.
- Verificado end-to-end: INSERT de prueba en la base → toast nativo confirmado por el founder en Windows + click abre la conversación. PR #28. Alcance B (navegador cerrado) quedó como Nivel 2 futuro, no comprometido.
