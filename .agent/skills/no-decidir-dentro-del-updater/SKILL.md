# Skill: No decidir nada adentro del updater de `setState` (React)

## Cuándo usar esta skill

- Una acción de la UI **se ve** hecha pero **no se guardó**: al recargar vuelve el estado viejo. "Marco el chat como leído y al rato aparece otra vez sin leer."
- El código tiene esta forma, o una parecida:

  ```ts
  let hayQueGuardar = false;
  setItems((prev) => prev.map((x) => {
    if (x.id !== id || x.leido) return x;
    hayQueGuardar = true;          // ← la decisión vive ADENTRO del updater
    return { ...x, leido: true };
  }));
  if (hayQueGuardar) guardarEnServidor(id);   // ← y se usa AFUERA, enseguida
  ```

- Funciona "a veces": en un camino sí guarda y en otro no, o dejó de andar después de un cambio que no tocó esa función.
- Revisando código React antes de mergear: cualquier variable que un updater asigne y que se lea después del `setState` es este bug.

## Por qué existe esta skill

Capturada el **2026-09-18** en la bandeja de mensajes de un CRM. Reporte: *"cuando me meto a un chat, el leído no se quita… y quiero marcarlo como no leído y más bien no se pone"*.

El patrón de arriba estaba **desde el primer commit** (cuatro meses) y nadie lo vio, porque React a veces SÍ corre el updater en el momento:

- **React corre el updater enseguida** (optimización *eager state*) solo si el componente **no tiene otra actualización pendiente**.
- En el clic, justo antes, se llamaba `setSeleccionado(id)`. Eso deja una actualización pendiente, así que React **encola** el updater para el render siguiente. La bandera seguía en `false` cuando se preguntaba, y **el guardado no salía nunca**.
- La pantalla mostraba el chat leído (el updater corre en el render, tarde pero corre) y la base seguía con el no leído.

Por qué se escondió cuatro meses: hasta un cambio de junio, cada clic cambiaba la URL con el router, que volvía a montar la pantalla, y el efecto de montaje llamaba a la misma función **sin nada pendiente**: ahí sí guardaba. Cuando la URL pasó a `history.replaceState` (para no pedirle al servidor en cada clic) el camino que tapaba el bug desapareció. **El cambio que lo destapó no tocó la función rota.**

Los dos síntomas salían de lo mismo. Con la pantalla y la base desalineadas, recargar o cualquier cambio en vivo devolvía el no leído. Y con el contador local en más de 0, la opción "Marcar como no leída" ni aparecía, o la acción salía sin hacer nada. Parecían dos bugs y era uno.

## Proceso

### 1. Medir el orden real con un registro temporal

No se adivina, se mide. Tres líneas alcanzan:

```ts
console.log('[DEBUG] entra', id);
setItems((prev) => prev.map((x) => {
  if (x.id !== id) return x;
  console.log('[DEBUG] updater corre, estado local =', x.leido);
  ...
}));
console.log('[DEBUG] después del set, hayQueGuardar =', hayQueGuardar);
```

Si en la consola aparece **"después del set, false"** ANTES que **"updater corre"**, es este bug. En desarrollo el updater aparece dos veces (modo estricto), y eso también es señal: un updater que se corre dos veces no puede tener efectos.

Además se mira **la red** (o el log del servidor): si nunca sale el POST de la acción, el guardado no se está pidiendo. En el caso real, el log de desarrollo de Next no mostraba ningún `POST` al abrir el chat.

### 2. Sacar la decisión del updater

El updater tiene que ser **puro**: recibe el estado anterior y devuelve el nuevo, sin asignar nada de afuera, sin llamar a nada. Hay tres formas de sacar la decisión, en este orden de preferencia:

1. **Que decida el servidor.** Si la acción del servidor ya mira el dato (acá: `if (unread_count === 0) return ok`), llamarla SIEMPRE. Cuesta una ida y vuelta de más cuando no hacía falta, y a cambio la fuente de verdad es la base y no una copia local que puede estar desalineada. Fue la elegida.
2. **Decidir con el valor que ya tenés.** Si el componente tiene el item en la mano (props, el estado del render actual, un `ref` al estado), preguntarle a ESE valor antes del `setState`, no adentro.
3. **Mover el efecto a un `useEffect`** que reaccione al cambio de estado, si el guardado depende de verdad del estado nuevo.

```ts
// Bien: updater puro, el guardado no depende de él.
setItems((prev) => prev.map((x) => (x.id === id && !x.leido ? { ...x, leido: true } : x)));
guardarEnServidor(id).then((r) => {
  if (!r.ok) console.error('no se pudo guardar', id, r.error);   // y el fallo se VE
});
```

Y nunca `void guardarEnServidor(id)` sin mirar el resultado: el bug anterior era un guardado que no salía, el siguiente es un guardado que falla en silencio.

### 3. Buscar el mismo patrón en todo el repo

Si pasó una vez, el patrón está copiado. Una búsqueda gruesa alcanza para revisar a mano:

```bash
grep -rn -A8 "let [a-zA-Z]* = false;" src --include=*.tsx --include=*.ts | grep -E "let [a-zA-Z]+ = false;|set[A-Z][a-zA-Z]*\(\(prev|= true;"
```

Lo que importa es una variable declarada afuera, asignada adentro de un `set…((prev) => …)` y leída después. Una bandera `cancelled` de un efecto, o una asignada en un `try/catch` común, no es este caso.

### 4. Verificar el ciclo completo contra la base, no contra la pantalla

La pantalla es justo lo que mentía. Se verifica cada paso mirando la base:

1. abrir → la base pasa a leído;
2. marcar no leído → la base cambia, y **sigue así después de recargar**;
3. volver a abrir → leído otra vez.

Y el control negativo: con el código viejo, el mismo clic deja la base igual. Si el control no falla, la prueba no está probando nada.

## Gotchas

- **"Funciona en un camino y no en otro" es la firma de este bug.** El efecto de montaje llama a la función sin nada pendiente (guarda); el clic la llama con algo pendiente (no guarda). Cuando un mismo código se comporta distinto según quién lo llama, preguntá qué otros `setState` corren antes.
- **El cambio que lo destapa no toca la función rota.** Acá fue pasar la URL de `router.replace` a `history.replaceState`. Buscar en el historial de la función no lo encuentra: hay que preguntar qué dejó de pasar alrededor.
- **Automatizar clics puede dar falsos negativos.** Probando "Marcar como no leída", los primeros clics automáticos no hacían nada: caían en el instante en que el menú todavía se estaba ubicando (el panel medía su posición oculto y se movía). No era el bug. Se reconoce porque la función ni siquiera entra (el registro de entrada no aparece). Esperar a que el menú esté visible, captura de por medio, antes de hacer clic.
- **Probar sobre el chat que está abierto engaña.** Al devolverle el no leído a la conversación de prueba por SQL, la pestaña que la tenía abierta la volvió a marcar leída al instante (es lo correcto: la estás mirando). Para restaurar datos de prueba, primero cerrar el chat en todas las pestañas.
- **Un updater con efectos se corre dos veces en desarrollo** (modo estricto). Si "funciona en local y no en producción" o al revés, es otra pista de lo mismo.

## Output esperado

1. La causa medida, con el orden real de los registros (decisión → chequeo → updater).
2. El updater puro y la decisión afuera: servidor, valor en la mano o `useEffect`.
3. El fallo del guardado registrado, no descartado con `void`.
4. El repo revisado por el mismo patrón.
5. El ciclo completo verificado contra la base, con el control negativo, y los datos de prueba restaurados.

## Ejemplo

**Input:** "Cuando me meto a un chat el leído no se quita, y cuando lo marco como no leído no se pone."

**Output:** registro temporal en la función de "marcar leído": el chequeo `hayQueGuardar = false` aparecía antes que el updater (que encontraba 1 sin leer), y no salía ningún POST. Arreglo: llamar siempre a la acción del servidor (que ya no escribe si está en 0) y registrar si falla. Verificado en local y en producción contra la base: abrir → 0, marcar no leído → 1 y sigue en 1 después de recargar, volver a abrir → 0. El mismo patrón no estaba en ningún otro lado del repo.

## Skills relacionadas

- `detectar-escritura-filtrada-rls` — el otro "se ve guardado y no lo está": un UPDATE que RLS filtra devuelve éxito con 0 filas.
- `intencion-ui-persistir-sessionstorage` — por qué "marcar como no leído" necesita recordar la intención del usuario.
- `refrescar-vista-server-tras-mutacion-cliente` — cuando el guardado sí salió pero la vista no se entera.
- `verificar-funcionamiento-end-to-end` — la pantalla no es la fuente de verdad.
- `debugging-silent-errors` — registros estructurados antes de hipotetizar.
