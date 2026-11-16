# Skill: Dos suscriptores al mismo canal de Realtime — uno queda sordo

## Cuándo usar esta skill

- Un componente con Realtime que se puede montar **dos veces a la vez**:
  - la versión de celular y la de escritorio, cuando la oculta está escondida con CSS pero **montada**;
  - la campana del sidebar y la del topbar;
  - una lista y un panel de detalle abiertos juntos.
- El síntoma es *"a veces llega en vivo y a veces no"* o *"la campana deja de actualizarse después de un rato, hasta que recargo"*.
- Muchas veces **pasa en un solo tamaño de pantalla**, o solo después de ~1 hora con la pestaña abierta.
- Antes de escribir un hook que llama a `supabase.channel(...)`: preguntate si puede quedar instanciado dos veces.

## Por qué existe esta skill

**Caso real (CRM, 2026-09-27).** El ticket decía "llegan 3 notificaciones repetidas" y, en un comentario posterior, "las notificaciones no son confiables".

**Lo que había en la base:** ninguna copia repetida, medido en 30 días.

**El bug real estaba en el cliente.** El shell montaba **dos campanas**:
- la del sidebar de escritorio;
- la del topbar de celular, oculta con `md:hidden` pero montada.

Cada una llamaba a su propio `useNotifications`, y las dos pedían el canal `user:<id>`.

Nada de esto lo ven `tsc`, el build ni el linter. En dev, con una sola ventana y sesiones cortas, "funciona". Y quien lee el código no piensa en el componente oculto: para la cabeza no existe, pero para React sí.

## Lo no obvio (leído en el código de realtime-js 2.106 y medido)

1. **El cliente del navegador es uno solo.** `createBrowserClient` de `@supabase/ssr` lo cachea en el navegador. Todos los hooks usan el mismo `RealtimeClient`.
2. **`channel(topic)` devuelve el canal que ya existe.** En `RealtimeClient.channel`:
   ```js
   const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
   if (!exists) { /* crea uno nuevo */ } else { return exists; }
   ```
   Las dos instancias reciben **el mismo objeto** `RealtimeChannel`.
3. **El segundo `subscribe()` no hace nada.** `RealtimeChannel.subscribe` solo engancha los callbacks de estado (`_onError`, `_onClose`) si el canal está cerrado. Sobre un canal ya unido es un no-op, así que **la segunda instancia nunca se entera de una caída**.
4. **La reconexión de una mata a la otra.** El patrón de reconexión de [[realtime-canal-muere-en-silencio]] hace `removeChannel` y crea un canal nuevo cuando llega `CLOSED`, que es lo que pasa cuando el JWT vence a la hora.
   - La instancia que sí se enteró borra el canal **compartido** y se suscribe a uno nuevo.
   - La otra sigue con los listeners puestos en el objeto borrado: **sorda hasta F5**.
   - Si la sorda es la que se ve en ese tamaño de pantalla, el usuario ve la campana congelada.
5. **Encima, doble trabajo.** Los dos listeners viven en el mismo canal, así que cada evento corre los dos handlers. Eran dos avisos de escritorio por notificación; el `tag` los colapsaba, pero igual era trabajo duplicado.

## Proceso

1. **Inventario de suscriptores por topic.** `grep -rn "\.channel(" src` y agrupá por el string del topic (`user:${id}`, `agency:${id}`…).
2. **Para cada topic con más de un hook: ¿pueden estar montados A LA VEZ?**
   - **Mismo layout, versiones responsive montadas, o lista y panel juntos:** sí. **Es el bug.**
   - **Páginas distintas:** no. Al navegar, React corre los cleanups de lo que se desmonta antes que los efectos de lo que se monta, así que el canal viejo se borra y el nuevo nace limpio. No hace falta tocar nada.
3. **Arreglo: un solo dueño del canal.** Un `Provider` en el ancestro común se suscribe **una vez** y expone el estado por contexto. Los componentes solo leen:
   ```tsx
   export function NotificationsProvider({ userId, children }: { userId: string; children: ReactNode }) {
     const center = useNotifications(userId); // la ÚNICA llamada: abre `user:<id>`
     return <Ctx.Provider value={center}>{children}</Ctx.Provider>;
   }
   export function useNotificationCenter() {
     const v = useContext(Ctx);
     if (!v) throw new Error('useNotificationCenter se usa dentro de <NotificationsProvider>');
     return v;
   }
   // En el shell: <NotificationsProvider> envuelve TODO, y las dos campanas llaman useNotificationCenter().
   ```
   También los efectos colaterales (avisos de escritorio, sonidos) pasan a estar en un solo lugar.
4. **Una prueba que falle si vuelve a pasar.** Tiene que leer el código fuente y exigir dos cosas:
   - que el hook de suscripción se llame desde **un solo archivo**, el proveedor;
   - que `.channel(\`<topic>:` aparezca en **un solo archivo**.

   Cuidado con que el patrón no confunda la llamada con la definición (`(?<!function\s)\buseX\(`). **Control negativo:** correrla contra el código viejo tiene que fallar.
5. **Verificar en vivo, no solo leer.** Insertá un evento de prueba desde la base (una notificación para tu usuario) y comprobá que **todas** las instancias se actualizan sin recargar. Por ejemplo, las dos campanas pasaron de 9 a 10.
   - Probalo a 1280 y a 375.
   - **La pestaña tiene que estar visible:** con la pestaña oculta el navegador frena la hidratación, y los clics sobre los checkboxes no llegan a React.

## Qué NO hacer

- **Topics distintos por instancia** (`user:<id>:a`, `user:<id>:b`): el topic es el que emite el servidor, así que no llega nada.
- **Un contador de referencias casero sobre el canal:** reinventa lo que un Provider da gratis, y la reconexión se vuelve un problema de coordinación entre N dueños.
- **Desmontar la instancia oculta con JS según el ancho:** el día que otro componente se monte dos veces, el bug vuelve. La garantía tiene que ser estructural: un solo dueño.

## Output esperado

- Un único dueño por topic, un `Provider` en el ancestro común de los que lo usan.
- La prueba que lo asegura, con su control negativo.
- La verificación en vivo con un evento real a los dos tamaños.

## Ejemplo

**Input:** *"La campana a veces no avisa, y el cliente dice que le llegaban 3 notificaciones iguales."*

**Output:**
- **Medición:** no hay duplicados en la base.
- **Causa:** `agency-shell` monta dos `<NotificationBell/>` y cada una llama `useNotifications`. Dos suscriptores a `user:<id>` sobre el mismo canal compartido.
- **Arreglo:** `NotificationsProvider` en el shell; las campanas pasan a `useNotificationCenter()`.
- **Prueba:** `pruebas-una-suscripcion.test.ts` exige un solo archivo que llame al hook y un solo `.channel(\`user:`. La campana vieja la hacía fallar.
- **Verificación en vivo:** una notificación insertada movió las dos campanas de 9 a 10 sin recargar.

Relacionadas: [[realtime-canal-muere-en-silencio]] (por qué el canal se cae y cómo reconectarlo; es justo esa reconexión la que borra el canal compartido) · [[supabase-realtime-broadcast-pattern]] · [[desktop-notifications-from-realtime]].
