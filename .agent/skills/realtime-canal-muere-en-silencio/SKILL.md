# Skill: El canal de Realtime muere en silencio (UI vieja hasta F5)

## Cuándo usar esta skill

- Un usuario reporta *"hago algo / llega algo y no aparece hasta que refresco la página"*.
- Tenés Supabase Realtime (broadcast o postgres_changes) y **a veces** funciona y a veces no.
- El bug parece de navegación ("solo pasa al volver con atrás") pero también ocurre con la pantalla quieta.
- Estás por escribir `.subscribe()` en cualquier proyecto con Realtime.

## Por qué existe esta skill

Un canal de Realtime **se cae, y por defecto nadie se entera**. La UI no muestra un error: sigue mostrando datos viejos como si fueran frescos. Eso es peor que un error visible — el usuario confía en lo que ve.

Caso real (CRM, 2026-07-15): *"llegó un WhatsApp y no apareció hasta recargar"*. Estaba anotado como bug de back-nav durante semanas. **No era.** Era el canal muerto, y el diagnóstico viejo mandaba a mirar el lugar equivocado.

## La causa raíz #1: el JWT vence (y dura 1 hora)

Los canales **privados** (`{ config: { private: true } }`) autorizan con RLS sobre `realtime.messages`, y esa policy necesita `auth.uid()`. **El JWT de Supabase dura 3600s por defecto.** Al vencer:

- La policy se evalúa con `auth.uid() = NULL` → el join se rechaza.
- En los logs de Realtime aparece: `Unauthorized: You do not have permissions to read from this Channel topic: <topic>`.

**El síntoma de que es esto y no otra cosa:** buscá en los logs un usuario que **debería pasar por dos vías distintas** de la policy (ej. es `is_master()` **y** dueño del topic). Si ESE usuario recibe `Unauthorized`, la única explicación posible es `auth.uid() = NULL`. Es una prueba, no una corazonada.

## Los 3 hallazgos NO obvios (medidos, no leídos)

### 1. Al vencer el token el estado es `CLOSED`, no `CHANNEL_ERROR`

Es la trampa principal. Casi todos los ejemplos manejan solo `CHANNEL_ERROR`/`TIMED_OUT` y tratan `CLOSED` como "desmontaje normal" → **el fix no atrapa el caso que importa**. Medido:

```
21:19:51  CHANNEL_ERROR "socket closed: 1006"  -> SUBSCRIBED en 2s   (corte de red: se cura solo)
21:27:40  CHANNEL status=CLOSED                <- el token vencía 21:27:42
21:29:41  socket=DISCONNECTED, eventos congelados... 10 min después seguía muerto
```

→ `CLOSED` **es** una falla, salvo que el desmontaje lo hayas pedido vos. Distinguilo con un flag `disposed` que ponés en `true` ANTES de `removeChannel`.

### 2. NO se reconecta solo

Un corte transitorio (código 1006) sí se auto-cura. El cierre por token vencido **no**: el socket queda `DISCONNECTED` para siempre. La reconexión tiene que ser **explícita** (rearmar el canal).

### 3. El auto-refresco del token está apagado sin que lo sepas

`supabase-js` llama `realtime.setAuth(token)` con un token **explícito** al refrescar la sesión. Eso marca `_manuallySetToken = true` en `realtime-js`, y con eso **`_setAuthSafely()` queda no-op** → se apaga el refresco automático por heartbeat. La renovación del socket queda colgada de un solo evento (`TOKEN_REFRESHED`), que no dispara si el auto-refresh de auth estuvo pausado (pestaña en background, equipo suspendido).

```js
// realtime-js
_setAuthSafely(context) {
  if (!this._isManualToken()) { this.setAuth()... }   // <- nunca entra si seteaste token explícito
}
```

## El fix: 3 capas (las 3, o no sirve)

### (a) Detectar — `.subscribe()` SIEMPRE con callback

```js
.subscribe((status, err) => {
  if (disposed) return;                    // desmontaje nuestro: el CLOSED que sigue es normal
  if (status === 'SUBSCRIBED') {
    if (degraded) { degraded = false; void onResync(); }   // volvimos: re-sincronizar
    return;
  }
  if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
    degraded = true;
    console.warn(`realtime ${status}: ${err?.message ?? 'sin detalle'}`);
    void refreshRealtimeAuth(supabase).then(() => {
      if (!disposed) setTimeout(() => setRejoinNonce(n => n + 1), 3000);  // rearme explícito
    });
  }
})
```

### (b) Recuperar — token fresco + rearmar el canal

```js
export async function refreshRealtimeAuth(supabase) {
  const { data } = await supabase.auth.getSession();   // refresca solo si venció
  const token = data.session?.access_token;
  if (!token) return false;
  await supabase.realtime.setAuth(token);
  return true;
}
```
El rearme: un `rejoinNonce` en las deps del `useEffect` → re-corre → canal nuevo.

### (c) Re-sincronizar — LA QUE TODOS OLVIDAN

> **El broadcast NO tiene replay.** Reconectar trae los eventos **futuros**; lo que pasó con el canal muerto **se perdió para siempre**.

Si solo reconectás, la lista sigue igual de vieja y el bug **parece** seguir vivo. Al volver de una caída hay que **releer la base**.

Y usá el **mismo query** que el server component (un módulo compartido), no una copia: si el re-sync lee otras columnas u otro orden, la vista queda distinta según cómo llegaste a ella — un bug que solo aparece en prod.

### Bonus: `visibilitychange` como red

Cubre suspensión / pestaña en background, donde el socket queda mudo **sin emitir ningún error**:

```js
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  void refreshRealtimeAuth(supabase).then(() => onResync());
});
```

## Cómo debuggearlo contra la fuente de verdad (no adivines)

Orden que funciona — de abajo hacia arriba, descartando capas con evidencia:

1. **¿La base emite?** `select topic, event, payload->>'table', inserted_at from realtime.messages where inserted_at > now() - interval '1 hour' order by inserted_at desc;` Si hay filas, la base está sana: el problema es del cliente, no del trigger.
2. **¿La policy está?** `select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'realtime.messages'::regclass;`
3. **¿Los logs acusan?** Logs de Realtime → buscá `Unauthorized`. Cruzá el `user:<uuid>` con tu tabla de usuarios y **con el horario del repro**.
4. **Probá con token fresco** (cliente Node idéntico al browser): minteá un JWT real vía `admin/generate_link` + `/auth/verify`, `setAuth(token)`, suscribite, y emití un broadcast de prueba **sin tocar tablas de negocio**:
   ```sql
   select realtime.send(jsonb_build_object('op','INSERT','table','messages','new','{}'::jsonb), 'INSERT', 'agency:<id>', true);
   ```
   Si llega → transporte sano; el problema es el token o el cliente.
5. **Probá con token inválido** (usá la anon key como token): tiene que dar **el error idéntico** al de los logs. Eso cierra el caso.
6. **Medí el vencimiento**: dejá un cliente suscrito >1h y mirá qué estado emite. Es la única forma de descubrir lo de `CLOSED`.

## Gotchas

- **`.subscribe()` sin callback = ceguera total.** Es el default de todos los ejemplos y de la doc.
- **`CLOSED` ignorado** = el fix no cubre el caso real (el vencimiento). Ya pasó: la primera versión del fix tenía este agujero y lo cazó la verificación, no la revisión del código.
- **Reconectar sin re-sincronizar** = el usuario sigue viendo datos viejos. El bug "sigue vivo" para él.
- **El canal del layout es el canario.** Un canal que vive en el layout (campana de notificaciones) está abierto horas y cruza el vencimiento; uno de página se remonta al navegar y lo disimula. Si ves `Unauthorized` solo del topic del layout, **no** significa que el otro esté sano.
- No confundas un corte transitorio (se cura solo en 2s) con el vencimiento (no vuelve nunca). Tienen fixes distintos.

## Verificación (Definition of Done)

- [ ] Los logs de Realtime NO muestran `Unauthorized` nuevos para usuarios legítimos.
- [ ] Con la pantalla abierta >1 hora, sigue llegando en vivo (la prueba que importa).
- [ ] Matando la red y volviendo: el canal rearma **y** la lista se pone al día.
- [ ] El re-sync usa el mismo query que el server (probado contra la base: mismos conteos y orden).
- [ ] Verificado contra la fuente de verdad, no "compila".
