# Skill: Verificar funcionamiento REAL end-to-end antes de declarar "hecho" — en toda capa

## Cuándo usar esta skill

- Estás por declarar **terminada / funcionando** cualquier cosa: una feature de UI, una Edge Function, una migración, un trigger, un workflow de n8n, un prompt deployado, un webhook, una integración.
- Hiciste un cambio que "compila", "respondió 200", "corrió sin error" o "se ve bien" y estás por reportarlo como hecho.
- Algo *parece* funcionar pero no estás 100% seguro de que el efecto quedó en la fuente de verdad.
- Estás revisando trabajo (propio o de un agente) antes de mergear / entregar al founder.

**Regla de oro:** **"Compila" / "corrió" / "respondió 200" / "se ve bien" NO son "funciona".** Algo está hecho solo cuando verificaste su efecto real **contra la fuente de verdad de su capa** — la base, la ejecución viva, el workflow deployado, no la apariencia ni la suposición.

## Por qué existe esta skill (el patrón de falla, transversal a capas)

Capturada el 2026-06-12. El founder, tras una sesión con fallos repetidos en capas distintas: *"no es solo a nivel gráfico ni de interfaz, es a nivel de funcionamiento interno, base de datos, funcionalidad del sistema como tal. Si ni siquiera notificaciones se puede hacer bien a la primera, no me quiero ni imaginar cuando hagamos cosas más complejas."*

El sistema **ya no está en fase de prototipo descartable.** Cada cosa a medias compuesta sobre otra cosa a medias se vuelve imposible de debuggear cuando llegan las features grandes.

**La raíz NO es falta de conocimiento — es falta de disciplina de verificación.** Se declara "hecho" sobre lo que *parece* correcto en vez de lo que está *probado*. Ejemplos reales de la misma falla, en capas distintas:

| Capa | Falla | Lo que faltó |
|---|---|---|
| n8n / deploy | "los prompts/modelos están deployados" | verificar contra el N8N vivo (estaban viejos) |
| Lógica | predije el output del parser y lo di por bueno | correr una ejecución real |
| DB / cliente | `void supabase…update()` sin `await` → no-op silencioso | refrescar y confirmar que persistió |
| UI / scope | "ese botón no existe" / migré 2 de 8 y dije "resuelto" | buscar el texto real / terminar el barrido |

Mismo error, distinta capa. La cura es una sola: **verificar el efecto real contra la fuente de verdad, siempre.**

## La regla, según la capa (cuál es la "fuente de verdad" en cada una)

### UI / estado persistido
- **Fuente de verdad:** la base tras un **refresh**. La pantalla optimista NO prueba nada.
- Mutar → **F5 / recargar** → confirmar que el cambio quedó.
- UI optimista = mentira hasta que el write se confirma: siempre `await` del write + **revert en error**.
- **Nunca `void` un query** de supabase-js (es *thenable lazy*: sin `await`/`.then()` el request HTTP no sale). `void supabase.from(...).update(...)` = no-op silencioso.

### Base de datos
- **Fuente de verdad:** la fila, consultada directo. `select <campo> from <tabla> where id = '<id>';` después de la acción.
- Si el write "no toma" y no hay error visible, sospechar RLS. Probarlo bajo el contexto del usuario en transacción con rollback:
  ```sql
  begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
  update <tabla> set <campo> = <valor> where id = '<id>' returning id, <campo>;
  rollback;
  ```
  Devuelve fila → RLS permite, el bug está en el cliente. No devuelve nada → es la policy.

### n8n / chatbot
- **Fuente de verdad:** la **ejecución real** (`GET /api/v1/executions/{id}?includeData=true` — el output nodo por nodo), y el **estado vivo del workflow** (hash SHA-256 del JSON deployado contra el JSON local). NO "el PUT respondió 200", NO "lo veo en el editor" (el editor cachea).
- Después de un deploy: re-fetch del workflow vivo + comparar hash. Después de un cambio de lógica: disparar una ejecución y leer el `includeData`, no asumir por el prompt.
- **"El nodo corrió" NO es "el nodo escribió"** (agregado 2026-08-18). Un nodo de INSERT reportaba `executionStatus: success` y **no escribía nada**: el enum se llamaba `message_sender_kind` y no `sender_kind`, y el `onError: continueRegularOutput` del nodo —que es **correcto** en producción, para que un fallo de esa rama no corte al bot— convertía el error en **un ítem silencioso**. O sea: el manejo de errores que necesitás en producción es exactamente el que esconde el bug en la prueba. **Mirá el output del nodo Y contá filas en la base**, nunca el estado de la ejecución. Y contá duplicados también, si el nodo pretende ser idempotente.
- Ver skills del proyecto: `n8n-workflow-build-script` (deploy + verificación por hash), `bot-multibubble-output-flow`, `bot-handoff-system-end-to-end`, `probar-camino-produccion-sin-efectos-externos` (probar el camino real sin mandar nada afuera).

### Backend / Edge Functions / API / webhooks
- **Fuente de verdad:** el camino ejecutado al menos una vez, con su respuesta Y su error mirados. No asumir por leer el código.
- Webhook: disparar un evento real (o un curl que lo simule) y confirmar el efecto downstream (la fila creada, la notificación emitida), no solo el 200.
- Edge Function: invocarla con payload real y leer logs/output.

## Definition of Done (3 preguntas — antes de decir "hecho", en CUALQUIER capa)

1. **¿El camino completo se ejecutó de verdad al menos una vez?** (no "compila", no "debería")
2. **¿El resultado quedó en la fuente de verdad de su capa?** (la base / la ejecución viva / el workflow deployado — no la pantalla optimista ni la suposición)
3. **¿Qué pasa si falla?** (¿revierte, loguea, avisa — o queda mintiendo un estado que no es?)

Si no respondiste las tres con evidencia, **no está hecho.** No lo reportes como hecho.

## Cómo detectar el problema (síntoma → causa)

- **"Se ve funcionar pero al refrescar vuelve atrás"** → write que no salió (`void`/`await` faltante) o no revierte en error y enmascara un fallo de RLS/constraint. Buscar `grep -rn 'void supabase' src/` y todo `.update/insert/delete/upsert` sin `await`/`.then()`/`return`.
- **"En el editor lo veo bien pero el bot responde viejo"** → editor cacheado; verificar contra el workflow vivo por hash + ejecución real.
- **"Respondió 200 pero no pasó nada"** → el 200 no implica efecto; verificar el efecto downstream en la fuente de verdad.
- **"Yo creo que / debería funcionar"** → señal de que NO se verificó. Verificar antes de afirmar.

## Output esperado

Nada se reporta como hecho sin haber verificado su efecto real contra la fuente de verdad de su capa. Cero "debería funcionar", cero "el PUT respondió 200" como prueba, cero UI optimista sin write confirmado + revert. El estándar es el mismo para notificaciones que para el chatbot o una migración: **probado, no presumido.**

## Ejemplo

**Input:** "Listo el trigger que emite la notificación cuando entra un mensaje del lead."

**Output incorrecto:** "Creé el trigger, la función y la policy. Quedó listo." (nunca se insertó un mensaje de prueba).

**Output correcto:** "Creé el trigger. Lo verifiqué: inserté un mensaje inbound de prueba → `select * from notifications order by created_at desc limit 1` devuelve la fila correcta con el `user_id` del asignado y el `data.conversation_id` esperado; y `select event,topic from realtime.messages where event='notification'` confirma el broadcast. Quedó probado, no presumido."

Relacionado: `.agent/skills/popover-portal-no-absolute/SKILL.md` (mismo principio: "crearlo bien para que no se repita"), `n8n-workflow-build-script`.

---

## Extensión (2026-08-28): cuando el que miente es TU CHEQUEO

Todo lo de arriba asume que la verificación dice la verdad. Estos tres casos salieron el
mismo día, verificando el onboarding del CRM, y en los tres **el código estaba bien y el
chequeo estaba mal**. Dos dieron falso NEGATIVO (asusté al pedo) y uno dio falso POSITIVO
(el peligroso).

### 1. Una función que devuelve FILAS dentro del `select` hace desaparecer la fila

```sql
-- MIENTE: con answers = '{}', jsonb_object_keys devuelve CERO filas
-- y se lleva puesta toda la respuesta → el chequeo dice "no existe".
select o.status, o.updated_at, jsonb_object_keys(o.answers) as bloques from ...;

-- Bien:
select o.status, o.updated_at,
       (select coalesce(array_agg(k),'{}') from jsonb_object_keys(o.answers) k) as bloques
from ...;
```

Reporté que la fila no se había creado. Estaba creada. **Delator:** el chequeo devuelve 0
filas para una condición que sabés que se cumple.

### 2. `now()` está CONGELADO dentro de una transacción

Probando "el aviso vuelve si el cliente edita después de que lo miré", el paso dio `false`
y parecía un bug de la regla. No lo era: dentro de la misma transacción, el "lo miré" y el
"lo editó" quedan con **la misma hora**, así que `updated_at > reviewed_at` no puede ser
verdadero jamás.

Cuando el test involucra **orden temporal**, `now()` no sirve: simulá el instante real
(fijar la fecha anterior a mano) o usá `clock_timestamp()`.

### 3. Medir una UI que nunca se hidrató (falso POSITIVO)

Medí el responsive de 8 bloques contra el dev server en el panel del navegador: **cero
desbordes, todo verde**. Era mentira. React nunca se había hidratado ahí (el websocket de
recarga en caliente no conecta en ese panel), así que mis clics no hacían nada y estaba
midiendo **solo el bloque que ya venía abierto**.

- **Delator:** los 8 bloques daban resultados **idénticos**, carácter por carácter.
- **El control que lo confirmó:** abrir la pantalla de login del propio proyecto — tampoco
  reaccionaba. Si un control conocido tampoco funciona, el problema es el entorno, no tu
  código.
- **El arreglo:** medir contra un **build de producción**, sin recarga en caliente.
- **Y antes de medir interacción, comprobá que la página esté viva:** un clic que no cambia
  `aria-expanded`, o un elemento sin props de React adjuntas, significa que estás midiendo
  HTML muerto.

### La regla que resume las tres

**Antes de creerle a una verificación, preguntá: ¿qué tendría que pasar para que este
chequeo FALLE?** Si no hay respuesta, no está midiendo nada — y esa pregunta hay que
hacérsela igual cuando el resultado es el que esperabas.

Corolario barato: **inyectá el fallo a propósito una vez.** Un `<div>` de 500px para probar
que el auditor de desborde lo ve; un preset inválido para probar que la base lo rechaza. Si
el chequeo no se pone rojo con el error puesto a mano, tampoco se va a poner rojo con el
error de verdad.
