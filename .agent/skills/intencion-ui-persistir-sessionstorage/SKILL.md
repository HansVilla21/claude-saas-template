# Skill: Persistir una intención de UI que la DB no puede distinguir (caso: marcar no-leído)

## Cuándo usar esta skill

- Una acción del usuario expresa una **intención** que el estado en DB **no distingue** de otro estado idéntico. Caso canónico: "marcar como **no leída**" una conversación ya leída → en DB queda `unread_count = 1`, exactamente igual que "tiene mensajes nuevos sin leer". La DB no sabe *por qué* está en 1.
- Hay un **auto-comportamiento** (auto-marcar-leído al abrir/montar, o vía realtime) que **pisa** esa intención apenas se recarga o se navega.
- Síntoma: el usuario marca algo (no-leído, fijado, pospuesto) y al hacer F5 / volver con "atrás" / llegar un evento, la marca **se borra sola**.

## Por qué existe esta skill

(Momentum CRM, M6, 2026-06-22) Marcar "no leída" escribe `unread_count = 1` en la DB. Pero el inbox **auto-marca leída** la conversación inicial al montar (`doMarkRead(initialSelectedConversationId)`), y `keepUnreadRef` (el guard en memoria) nace `null` en cada mount. Resultado: marcabas no-leída, hacías F5, y el auto-read del mount la volvía a poner en 0. La DB sola no alcanza porque `unread_count = 1` es ambiguo.

La solución: **persistir la intención por sesión** (qué convs marcó el usuario como no-leídas) en `sessionStorage`, re-armar el guard al montar desde ese set, y saltear el auto-read para esas convs. La DB guarda el *estado*; el sessionStorage guarda el *por qué*.

## El patrón

### 1. Persistir el set de "intención" aparte del estado de DB

```ts
// id→nombre de la clave por agency/tenant para no mezclar.
const key = (agencyId) => `inbox:keepUnread:${agencyId}`;
function readKeepUnread(agencyId): Set<string> { /* JSON.parse del sessionStorage, try/catch */ }
function setKeepUnread(agencyId, id, keep) { /* add/delete + JSON.stringify, try/catch */ }
```

`try/catch` siempre: en modo privado / cuota, `sessionStorage` tira — no debe ser crítico.

### 2. Al ejecutar la acción: escribir DB + set + guard en memoria

```ts
keepUnreadRef.current = convId;           // guard vivo para el realtime
setKeepUnread(agencyId, convId, true);    // persistencia para sobrevivir F5
await supabase.update({ unread_count: 1 });
// en error: revertir los tres.
```

### 3. Guard en el auto-comportamiento (TODAS las rutas)

El auto-read tiene varias entradas (mount, selección, restore). Poné el guard **en la función común**, no en cada caller:

```ts
const doMarkRead = useCallback((convId) => {
  if (keepUnreadRef.current === convId) return;   // respeta la intención
  /* ...marcar leído... */
}, []);
```

### 4. Re-armar el guard al montar desde el set persistido

El ref nace `null` en cada mount → sin esto, el F5 pierde la intención. Al montar, si la conv inicial está en el set: armá el ref y **NO** la auto-leas.

```ts
if (readKeepUnread(agencyId).has(initialId)) { keepUnreadRef.current = initialId; return; }
queueMicrotask(() => doMarkRead(initialId));
```

### 5. Distinguir "seleccionar" de "abrir-para-leer"

Restaurar una selección (al volver a la vista) NO debería leer una conv marcada no-leída. Si tu handler de selección siempre lee, dale un flag:

```ts
handleSelect(id, { markRead: false }); // restore: selecciona sin leer (y re-arma el guard)
handleSelect(id);                       // click del usuario: sí lee (y limpia el set)
```

Abrir explícitamente (click) = leer → **sacá** la conv del set para que no resucite tras el próximo F5.

## Output esperado

1. La intención persiste por sesión en `sessionStorage` (scoped por tenant), aparte del estado de DB.
2. Guard único en la función de auto-comportamiento (cubre mount + selección + restore).
3. Re-armado del guard al montar desde el set → sobrevive F5 / back-nav.
4. La acción de "abrir explícito" limpia la intención; las acciones de "restaurar/auto" la respetan.
5. El realtime ya respeta el guard en memoria (sin cambios si ya existía).
6. Verificación: marcar → F5 → sigue marcada (y `unread_count = 1` en DB); abrir → se limpia.

## Ejemplo concreto (Momentum CRM, M6, 2026-06-22, PR #55)

- Todo en [crm-v2/src/components/inbox/inbox-client.tsx](crm-v2/src/components/inbox/inbox-client.tsx): helpers `readKeepUnread`/`setKeepUnread`, guard en `doMarkRead`, re-armado en el efecto de mount, flag `markRead` en `handleSelect`, persistencia en `handleMarkUnread`.
- El realtime ya respetaba `keepUnreadRef` ([use-inbox-realtime.ts](crm-v2/src/components/inbox/use-inbox-realtime.ts)).
- Bonus de la misma misión: la **selección** de conversación se persiste en la URL (`?conv=` vía `history.replaceState`, sin refetch) para que F5 / "atrás" reabran la conv correcta; el `sessionStorage` cubre el regreso por link de navegación.

## Gotchas / antipattern

- **NO** confíes solo en la DB para una intención que el estado no distingue: `unread_count=1` no sabe si fue "marca deliberada" o "mensaje nuevo". Necesitás un canal aparte para el *por qué*.
- **NO** pongas el guard en un solo caller del auto-comportamiento: ponelo en la función común (hay 2-3 rutas que leen).
- **NO** olvides re-armar el guard al montar: el `ref` nace `null`, así que sin leer el set persistido, el F5 pierde la marca.
- **NO** limpies el guard de forma incondicional al seleccionar: limpialo solo para la conv que se abre; si tenés un ref de un solo slot, las demás siguen protegidas por el set persistido.
- **NO** uses `router.replace` para reflejar selección en la URL (refetchea el server component en cada click): `window.history.replaceState` actualiza la URL sin navegación; el server la lee en el próximo F5/back.
- **SIEMPRE** `try/catch` alrededor de `sessionStorage` (modo privado / cuota) y degradá suave: la persistencia es un plus, no un requisito de funcionamiento.

## Skills relacionadas

- `crm-inbox-conv-list-filters-strip` — la lista del inbox donde se ve el badge de no-leído.
- `supabase-realtime-broadcast-pattern` — el realtime cuyo auto-read hay que guardar.
- `verificar-funcionamiento-end-to-end` — verificar "marcar → F5 → sigue marcada" contra la DB real.
