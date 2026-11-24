# Skill: Coordinar sesiones en paralelo con un registro único y decisiones numeradas

## Cuándo usar esta skill

- Un día con **varios frentes a la vez**: un coordinador (la sesión con la que habla el founder) y varias sesiones hijas, cada una con su punto.
- El founder pierde el hilo:
  1. le llega una decisión;
  2. antes de contestarla, llega otra;
  3. contesta la primera y la segunda se pierde.
- Hay que entregar por bloques («el B arranca recién cuando el A esté completo y probado»).

**Por qué existe.** El 2026-11-24, en el CRM de Momentum, Hans pidió este método para un día de 6 puntos urgentes más 8 tickets. Al terminar el bloque dijo: «me encanta ese registro que estamos llevando, así no me pierdo de nada… así me encanta trabajar».

Esa mañana:
- **7 decisiones** salieron de a una;
- **4 sesiones hijas** trabajaron en paralelo sin escribirle;
- y Hans nunca tuvo dos preguntas abiertas a la vez.

## Las cuatro reglas

### 1. Un registro de avance único, que lleva el coordinador

- Un archivo `progreso-AAAA-MM-DD.md` en la raíz del proyecto, **excluido de git**: se agrega a `.git/info/exclude`, porque puede nombrar clientes y el repo puede ser público.
- Se actualiza **cada vez que algo cambia**, no al final.
- Tiene una tabla por bloque con cada punto, su estado y la sesión que lo lleva. Los estados son estos cinco:
  - **por hacer**;
  - **en curso**, y en qué sesión;
  - **esperando una decisión**, y cuál;
  - **bloqueado**, y por qué;
  - **probado y listo**.
- Además tiene estas secciones:
  - «Decisiones pendientes»;
  - «Decisiones tomadas», con la cita textual del founder;
  - «Para <quien escribe los prompts>», si aplica;
  - «Fuera de los bloques», con lo que sigue abierto pero no se trabaja hoy;
  - una bitácora corta.

La plantilla está en `assets/progreso-plantilla.md`.

### 2. Las decisiones, de a una y numeradas

- Cada decisión entra en «Decisiones pendientes» con:
  - un **número fijo** (D1, D2…) que no cambia nunca;
  - el punto al que pertenece;
  - lo que se sabe, en 2 o 3 líneas;
  - las opciones;
  - **una recomendación**.
- Se pregunta **solo la más vieja**. La siguiente no sale hasta que conteste esa.
- Si una sesión hija necesita una decisión mientras el founder tiene otra abierta, se anota en la lista y **la hija sigue con otra cosa**.
- Cuando contesta, el coordinador repite **«D3: decidiste tal cosa»**, la pasa a «Decisiones tomadas» con sus palabras y le reenvía a la hija esas mismas palabras.
- **Si contesta algo que no corresponde** a la decisión preguntada, se le dice y no se aplica a otra.
- **Lo menor lo decide el coordinador.** Por ejemplo, un detalle técnico con una respuesta segura y medida. Se anota en «Decisiones tomadas» como «(Menor, la tomé yo)», con el número que lo justifica. No se le pregunta al founder lo que sale de los datos.

### 3. El reporte: corto y en un cuadrito

Hans pidió explícitamente: «que no sea tanto texto… como en un cuadrito así».

```
| # | Punto | Estado |
|---|---|---|
| A1 | Disumed: fotos de productos | 🟢 Aprobado; la Cola lo está subiendo |
| A2 | Plantilla a mano desde el chat | 🔵 Probado; falta la revisión y el merge |
| A3 | EPK: chats viejos | ✅ Listo |
| A4 | EPK: catálogo | ⚪ Arranca cuando suba A1 |

**Te toca:** <una sola cosa: la decisión más vieja o algo que tiene que probar>
**Hecho:** <1-2 líneas desde el reporte anterior>
```

- Íconos: ⚪ por hacer · 🔵 en curso · 🟡 espera decisión · 🔴 bloqueado · 🟢 probado (falta subir) · ✅ listo.
- Sin código ni detalle técnico, salvo que lo pida.
- Si la decisión se presenta con un diálogo de opciones, el cuadrito va arriba y la pregunta abajo.

### 4. Las sesiones hijas no le escriben al founder

Todo brief de una hija dice esto:
- Reporta solo al coordinador (con su id), corto y en el idioma del founder.
- Las decisiones van al coordinador con opciones y recomendación, y **mientras espera sigue con otra cosa**.
- Antes de cambiar la config de un cliente, aplicar una migración, desplegar una función o pedir un merge, pide el OK por el coordinador.
- Si necesita que el founder pruebe algo (tocar un botón, mirar el celular), se lo pide al coordinador, que se lo trae en el «Te toca».

## Cómo se arma el día

1. **Partir los puntos por archivos que tocan.** Dos sesiones nunca editan lo mismo a la vez. Si dos puntos tocan lo mismo, van en la misma sesión uno detrás del otro, o el segundo espera el merge del primero. Esto queda escrito en el registro como «espera el merge de A1».
2. **Elegir el modelo por punto:** Opus para causa de fondo, concurrencia o bot en vivo; Sonnet para pantallas con el plan claro. La revisión de Opus va antes de cada merge que toque producción.
3. **Abrir las hijas en un solo mensaje**, cada una con su brief completo, y crear el registro.
4. **Cerrar cada punto solo cuando está probado de verdad.** Que compile no cuenta. Cuenta, por ejemplo:
   - la foto llegando al WhatsApp;
   - el botón tocado y la etiqueta vista en la base, con un control negativo;
   - la plantilla borrada y desaparecida del proveedor.

## Gotchas medidos el 2026-11-24

- **Los mensajes a una sesión que está trabajando quedan en cola.** Una hija pidió dos veces el OK de una migración que ya se le había dado, porque el mensaje no le había llegado. Si una hija vuelve a pedir algo ya contestado, se le reenvía con la cita y la D correspondiente; no se le pregunta otra vez al founder.
- **Una hija puede responder a lo viejo y cruzarse con lo nuevo.** El coordinador pidió que un arreglo fuera opcional por negocio, y la hija mandó un «listo» sin eso, escrito antes de leer el pedido. **Antes de pasar algo a la Cola, se mira el diff**, por ejemplo con `git diff origin/main...origin/<rama> | grep <la llave>`, y no solo el reporte.
- **Para probar pantallas sin pedirle al founder que inicie sesión,** se usa el servidor local con el usuario de prueba del proyecto (en `.env.local`). El founder solo hace lo que exige su teléfono o su cuenta.
- **Dos hijas que mandan cosas al mismo número de prueba** pueden confundir al founder. Si una ya mandó la plantilla que la otra iba a usar, se reaprovecha, y el «Te toca» dice exactamente cuál mensaje tocar y cuál NO.
- **Los pedidos nuevos que aparecen en el camino** entran al registro con su propio número (A7) y se asignan a la sesión que ya trabaja esa zona.

## Relacionado

- `cosechas-en-paralelo-sin-pisarse`: varias sesiones sobre el mismo repo.
- `rama-de-salida-varios-prs`: juntar varios PRs y subirlos de una vez.
- `perfil-de-operador-del-founder`: documentar cómo se le responde al humano que dirige.
- `tarjeta-de-hoy-una-sola-cosa`: el mismo principio de «una sola cosa» para el founder.
