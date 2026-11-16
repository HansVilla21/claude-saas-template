# Skill: Cotizar el CRM desde una llamada

> Capturada 2026-11-03, de dos cotizaciones reales hechas el mismo día y aprobadas por el founder.

## Cuándo usar esta skill

- El founder pasa la transcripción de una llamada y pide una cotización del CRM: implementación más mensualidad.
- Dice "armá la cotización", "mandale los números", "le prometí la cotización".

**No aplica a un sistema a medida.** Eso lleva propuesta y contrato (skill global `blindaje-cr`). Las dos líneas no se mezclan.

**El generador** (PDF y Word con la línea gráfica de Momentum) vive en el repo privado Momentum PM OS, en `templates/contratos/generador/cotizacion/`. Su `README.md` dice cómo correrlo. Esta skill es lo que no está ahí: de dónde sale cada dato y qué revisar para no prometer de más.

## Proceso

### 1. Reunir los datos sin pedírselos al founder

Casi nunca hay ficha, y "esto es lo único que tenemos" suele ser falso:

| Dato | De dónde sale |
|---|---|
| Qué pidió el cliente | La **transcripción**, no el resumen automático |
| Nombre de la persona | El contacto en el CRM, buscado por su teléfono |
| Cuántos números, cuántas personas, qué canales usa | La conversación del lead con el bot, que suele ser más precisa que la llamada |
| Si ya se le dijo un precio | Esa misma conversación |
| Razón social | El pie del sitio del cliente ("X es una marca de Y S.A.") |
| Reglas de su negocio, para el alcance | Su sitio: mínimo de compra, envíos, horario |
| Quién decide y el cargo de quien llamó | La página de equipo o "Nosotros" de su sitio: gerencia, junta, el nombre bien escrito |

**El contacto se busca solo en la cuenta de Momentum.** El mismo teléfono puede aparecer en las cuentas de otros clientes del CRM, porque esa persona también les escribió. Esas conversaciones no se leen ni se usan.

Si falta la cédula, **no se inventa ni se frena el documento**: se quita esa línea y la condición de pago dice "con los datos que nos confirmen al contratar". Avisale al founder de dónde salió cada dato que no le dio el cliente.

### 2. Anotar lo que dijo el founder, literal

El precio y qué cubre salen de sus palabras en la llamada, nunca de otra cotización. Dos cotizaciones del mismo día tuvieron condiciones distintas: en una la implementación cubría el primer mes y en la otra la mensualidad corría desde el inicio. La plantilla traía la primera. Copiarla habría cambiado el precio dicho.

Anotá también lo que prometió de palabra, como plazos o funciones "que implementamos de una".

**Un número dicho con duda no va al documento.** Si dijo "creo que el siguiente plan es 350", se escribe genérico ("el plan que corresponda") y se le pregunta.

**El IVA se decide por cliente.** Por defecto, los montos van más IVA. Si el founder pidió cobrar sin IVA a un cliente, eso no pasa al siguiente.

### 3. Verificar cada promesa contra el código vivo

Se mira `origin/main` del CRM, no la carpeta local. Cada fila cae en una de cuatro:

| Estado | Qué se escribe en la cotización |
|---|---|
| Existe y anda | Se promete en términos de lo que queda funcionando |
| Existe a medias | Se escribe **exactamente** lo que hace, y lo que le falta va en "No incluye" |
| Construido, pero espera a un tercero | Se dice que depende de esa aprobación, sin fecha, y qué pasa mientras tanto |
| No existe | Si el founder lo prometió y es del alcance, va con su plazo real y se lo avisás. Si no, no se escribe |

Una demo hace que todo parezca terminado. También pasa al revés: en un caso el founder dijo "eso no está", y ya existía buena parte. Lo mencionó de pasada ("el bot puede agendar") y no se prometió, porque no existía.

Buscá también el **permiso**: una función puede existir y solo poder usarla el dueño. En el caso real, quien iba a actualizar las unidades del inventario no era quien podía editarlas.

### 4. Llenar la plantilla

- **Cada fila del alcance empieza con las palabras del cliente,** no con el nombre de la función.
- **Lo que el cliente pidió ver por escrito** va en el recuadro de arriba.
- **Lo que le dolió antes:** si ya le falló un proveedor, la fila lo responde sin nombrarlo. A quien le hicieron un inventario instalado en una sola computadora se le escribe "en un sistema web, sin instalar nada".
- **"No incluye" lleva lo que se conversó para después.** Si no, la cotización parece prometerlo. Lo que el founder recomendó dejar para otra etapa se nombra y se dice que se cotiza aparte.
- **Una adaptación "que incluimos" necesita borde:** puntual, que quepa en el plazo y por escrito. "Lo que ocupen" es un alcance sin fondo.

### 5. Cruzar con los Términos del servicio

La cotización contradice a propósito algunas cláusulas de los Términos. Hay que decirlo en el documento, con "en lo específico manda esta cotización", y nombrar cada caso. Los que aparecieron:

- la implementación que cubre el primer mes, si acá la mensualidad corre desde el inicio;
- el mes de aprendizaje del bot, si se le prometió salir antes;
- la exclusión de adaptaciones, si se incluye una.

Sin esa frase, al firmar los Términos el cliente firma lo contrario de lo que le cotizaron.

### 6. Generar y mirar cada página

- Se revisa imagen por imagen. El Word no se puede abrir por automatización en esta máquina: decí que quedó sin revisar.
- **Si se pasa a una página casi vacía, se recorta el texto,** nunca la letra. En el caso real sobraban cuatro renglones: se juntaron dos filas y se acortaron frases. Lo que más espacio devuelve es convertir una tabla corta (por ejemplo, las etapas del plazo) en una sola frase.
- Cada recorte se relee: el texto corto no puede prometer más que el largo.

### 7. Dejar el rastro y avisar

- Ficha en `clients/<slug>/00-perfil.md` con lo pedido, el trato y **qué hay que construir o decidir si cierra**.
- Una fila en `clients/_cotizaciones.md`. Todo esto queda fuera de git: **este repo es público** y nada del cliente va a un archivo versionado.
- Al founder: conclusión, precio, de dónde salieron los datos, y solo lo que tiene que decidir.
- **El envío lo hace el founder.** Nunca se le manda nada al cliente.

## Gotchas

| Pasó | Cómo se evita |
|---|---|
| El resumen automático decía que había que integrar dos CRM; uno era del proveedor anterior | Leer la transcripción |
| El resumen tomó el nombre de la cuenta de Meet como nombre de la empresa | Cruzar con el chat y el sitio |
| Se partió el correo en dos renglones al final del documento | Mirar la página. Se quitó el correo, porque el WhatsApp ya estaba |
| El bot le había dicho al cliente que "podés tener varios agentes", y la llamada hablaba de "3 o 4 números" | El chat decía 3. Se usó el dato que escribió el cliente |
| Prometer un canal que el cliente ya usa en su herramienta actual, y que todavía espera a Meta | Decir qué pasa mientras tanto. Apagar la herramienta vieja le quitaría ese canal |
| El cliente quería que el bot diera un dato que vive en su sistema (un saldo) y que cambia durante el día | No se promete con un Excel que queda viejo. Va en "No incluye" y la fila dice lo que sí hace: explicar las condiciones, mandar el enlace de su portal y pasar el caso a una persona |
| Quien llamó no decide: tiene que presentarlo ante la gerencia junto con otras propuestas | Un recuadro arriba con el resumen en tres líneas, para que lo lea quien decide |
| Meta le había bloqueado el número por mandar mensajes en masa | Los envíos masivos van en "No incluye", y antes de conectar se revisa dónde está la restricción |

## Output esperado

- `clients/<slug>/propuesta-y-contrato/Cotizacion-Momentum-<Cliente>-01.pdf`, `.docx` y `contenido.js`, fuera de git.
- La ficha del cliente y su fila en el registro.
- Un mensaje corto al founder, con lo que tiene que decidir.

## Ejemplo

**Input:** transcripción de 44 minutos con una distribuidora mayorista, más cuatro mensajes de WhatsApp como "la única info que tenemos".

**Output:** una cotización de 3 páginas. La razón social salió del pie de su sitio, el nombre del contacto del CRM, y "3 números" del chat. Antes de mandarla, el founder recibió cuatro avisos:

1. El inventario ya existe a medias, y se describe tal cual.
2. Instagram y Messenger esperan a Meta, y hoy el cliente los atiende en la herramienta que quiere dejar.
3. El sistema maneja un número por negocio, y quedan dos por resolver.
4. Dos condiciones contradicen los Términos, y quedaron escritas a propósito.
