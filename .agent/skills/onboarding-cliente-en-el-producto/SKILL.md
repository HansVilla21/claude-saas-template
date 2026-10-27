# Skill: Onboarding del cliente DENTRO del producto

> Capturada 2026-08-28, construyendo y probando en producción el onboarding del CRM
> (6 misiones, PR #158, primer cliente real dado de alta con el flujo nuevo).

## Cuándo usar esta skill

- Vendés un servicio que hay que **configurar con información del cliente** (un bot, un
  CRM, una automatización) y hoy esa información se pide por fuera del producto: un Word,
  un Google Form, una llamada, mensajes sueltos de WhatsApp.
- El síntoma que confirma que aplica: **las carpetas de onboarding de tus clientes están
  vacías**. El cuestionario existe, se manda, y nadie lo llena.
- También aplica al revés: estás por escribir "un formulario de onboarding" desde cero y
  querés saltarte los cuatro bugs que salen sí o sí.

## Por qué falla el cuestionario por fuera (el diagnóstico, antes del proceso)

El cliente que acaba de pagar está en su **pico de entusiasmo y su piso de paciencia
burocrática**. Si el primer contacto post-pago es un documento con 32 preguntas y 8
archivos que buscar, gastás ese pico en trámite.

Medido en el proyecto: 3 clientes, 3 carpetas de onboarding vacías. El material que
terminó cambiando el bot de uno de ellos (precios, rangos, 14 testimonios) llegó **meses
después y suelto**, porque se volvió a pedir en una conversación.

La inversión que funciona: **nosotros extraemos, el cliente habla.** El cuestionario deja
de ser su tarea y pasa a ser tu guion; el producto se encarga de recogerlo.

## Proceso

### 1. Cortar el cuestionario a lo que tiene DESTINO

Regla dura: **una pregunta que no llena una pieza de la configuración, sobra.** Al lado de
cada pregunta, escribí a dónde va (identidad del prompt, campos que captura el bot, reglas
de handoff, catálogo). Lo que no tiene destino, se cae.

En el caso real: de 32 preguntas quedaron **8 bloques**. Las que se cayeron eran las que
"estaría bueno saber".

Las cuatro que nadie contesta si no se preguntan explícitamente, y que después cuestan caro:

1. **Los precios, y si el bot puede decirlos** (las dos respuestas son válidas; lo que no
   es válido es no haberlo decidido).
2. **Qué NUNCA puede decir ni prometer.**
3. **Dónde termina el bot y QUIÉN sigue** — con nombre y teléfono, porque sin ese número
   el aviso no le llega a nadie.
4. **Qué pasa DESPUÉS de que el cliente dice que sí.** La corrección más fuerte que dio un
   cliente real en todo el proyecto fue exactamente ésta: *"¿qué pasa si reservé y con
   quién hablo si ya puse la plata?"*.

### 2. Una sola forma de respuesta para todo

```
{ text?: string, files?: [...], skipped?: boolean }
```

Texto, opción y lista guardan en `text`; audios y archivos en `files`; `skipped` es el
"esto lo hablamos en la llamada". **Una sola forma hace que guardar, derivar el avance y
renderizar no tengan casos especiales.**

**Saltar CUENTA como contestar.** Es deliberado: si no contara, una sola pregunta que el
cliente no sabe responder deja el formulario incompleto para siempre, y un formulario que
no se puede terminar se abandona.

### 3. El audio no es un extra: es el canal principal

El mejor material del proyecto fueron los audios de una clienta. Un dueño de negocio
escribe una línea sobre su propuesta de valor y te habla dos minutos de oro. El campo de
texto es la opción; **el audio es la invitación**.

⚠️ **No reuses el grabador del chat si el tuyo exige un formato.** El del inbox graba
Ogg/Opus porque lo exige Meta, y por eso **no se ofrece en Safari/iOS**. Acá el audio lo
escuchás vos: grabá con lo que el navegador sepa (`MediaRecorder.isTypeSupported`, cayendo
a `audio/mp4` en Safari). Reusar el otro deja sin audio justo al cliente que contesta desde
el iPhone.

Y el chequeo de soporte va **al tocar el botón, no al renderizar**: mirar `MediaRecorder`
durante el render hace que el servidor diga una cosa y el navegador otra, y rompe la
hidratación.

### 4. Dónde vive el formulario

**Dentro del espacio del cliente**, no en Configuración ni en el selector de cuentas.
Configuración es para un negocio que ya opera; el selector es un pasillo que con un solo
negocio ni se ve. Adentro del espacio hereda el `agency_id` (RLS y rutas de archivos salen
gratis) y el avance queda visible para él y para vos **en el mismo lugar**.

### 5. La regla que decide a quién se le pide

```
sin fila  = este cliente NO entró por el flujo → no se le muestra NADA
con fila  = entró por el flujo → se le pide, y el avance sale de las respuestas
```

**Sin backfill, a propósito.** Los clientes que ya se onboardearon a mano no pueden ver un
recordatorio de algo que nadie les pidió. Es la primera pregunta que hace el founder
cuando ve la feature — llegá con la respuesta puesta.

La fila la crea el ALTA del cliente. Para uno viejo que sí quiera llenarlo, se inserta a
mano.

### 6. Se puede saltar, pero no perder

El founder lo pidió así y es lo correcto: obligar produce **respuestas de relleno**, que
son peores que no tenerlas porque contaminan el prompt con material que nadie dijo en
serio.

La contraparte obligatoria: **aterrizaje la primera vez** (al entrar, lo llevás al
formulario **una sola vez**) + **recordatorio permanente** hasta que lo mande.

⚠️ Para el aterrizaje hace falta `opened_at` — **no alcanza con el estado del
formulario**. "Pendiente" significa "no contestó nada", no "no lo vio": con eso, el que
abre el formulario, lo mira y se va a explorar queda atrapado en un rebote eterno.

Y va en la base, **no en `localStorage`**: el "ya lo vi" tiene que valer en el celular y en
la computadora, o el que arrancó en el teléfono vuelve a ser tratado como recién llegado al
abrir la laptop.

El aterrizaje es **solo para el dueño**: a un admin del equipo no le corresponde, y a un
master mirando la cuenta de un cliente secuestrarle la pantalla es un bug.

### 7. El recordatorio va donde el usuario YA está

En la pantalla a la que entra (el resumen), no como banda fija en todas: mientras contesta
mensajes, un cartel repitiéndole una tarea pendiente estorba. Un badge en el menú completa.

### 8. Del lado tuyo: leer sin poder romper

La vista de las respuestas es **de solo lectura**. La alternativa —impersonar al cliente y
abrir su formulario— existe y es justamente el problema: ahí el formulario es **editable y
guarda solo**, así que un clic distraído te cambia las respuestas del cliente sin que nadie
se entere.

Mostrá también **lo que falta** por bloque: la mitad del valor de esa pantalla es saber qué
reclamar en la llamada.

### 9. El aviso, donde el founder entra de verdad

Textual del founder: *"al panel admin casi no entro; si tengo que pasar por muchas
pantallas para saber si alguien llenó algo, no me entero"*. El aviso va en la **primera
pantalla** y en una **campana visible desde cualquier lugar del panel**.

Ver la skill hermana `aviso-derivado-que-se-apaga-solo` para cómo hacer que ese aviso se
apague sin inventar un "marcar como leído".

## Los cuatro bugs que salen sí o sí (los cuatro salieron probando, no compilando)

### 1. El cliente que YA tenía cuenta se queda sin ningún aviso

El sistema hace lo correcto —si el correo ya existe, no manda invitación, le da acceso
directo— pero eso deja un hueco invisible:

- el mensaje #1 dice "revisá tu correo", y no hay correo que revisar;
- el mensaje #2 cuelga de **fijar la contraseña**, y quien ya tiene cuenta nunca pasa por
  ahí → **no le llega nada, nunca**.

**Regla general:** cuando colgás un aviso de un evento, preguntá *"¿este evento puede no
ocurrir?"*. Si puede, ese camino necesita su propio disparo.

### 2. Borrar el cliente NO borra sus archivos

Ver `borrar-entidad-deja-sus-archivos`. Se detectó **borrando el cliente de prueba**: la
base quedó impecable y los 768 KB de audio y foto siguieron ahí.

### 3. La fecha de "último cambio" pisada por quien la mira

Ver `aviso-derivado-que-se-apaga-solo`.

### 4. Guardar lo que nadie cambió

Abrir y cerrar un bloque sin tocar nada escribía en la base igual, y dejaba bloques vacíos
(`"voz": {}`) en las respuestas. Marcá el bloque como sucio en el `onChange`, no en el
`onToggle`.

## Gotchas de implementación (los caros)

- **Las subidas NO pasan por el servidor.** Vercel corta el cuerpo de todo request en
  **4,5 MB** en el edge, **antes** de que corra tu función: tu validación de tamaño nunca
  se ejecuta y el usuario no ve tu mensaje. El servidor **firma**, el navegador sube
  directo, y recién ahí se registra el metadato. **En local no se reproduce**: todo lo que
  probaste con el dev server es falso.
- **El path lo arma el SERVER, y se re-valida al LEER.** El dueño de una agencia puede
  escribir lo que quiera dentro de su propia fila (la RLS se lo permite, es suya). Si
  guardara a mano un path apuntando a la carpeta de otro cliente y vos firmaras la lectura
  sin mirar, le entregarías archivos ajenos.
- **El merge del bloque lo hace la base, no JavaScript.** Leer-mezclar-escribir hace que
  dos pestañas abiertas se pisen y el último en guardar borre lo del otro, en silencio.
  Un `update ... set answers = answers || jsonb_build_object($1,$2)` lo resuelve.
- **Esa función va `SECURITY INVOKER`.** Con `DEFINER` saltaría la RLS y cualquiera con
  sesión escribiría el cuestionario de cualquier cliente pasando otro id.
- **Devolvé la fila y CONTÁ.** Bajo RLS, una escritura filtrada **no da error**: afecta 0
  filas y responde éxito. Sin contar, la pantalla dice "Guardado" mientras la base no
  cambió.
- **El bucket es PRIVADO.** Distinto del de fotos del catálogo, que es público porque el
  proveedor de WhatsApp tiene que bajarlas. Acá no hay tercero que necesite leer: son
  precios, conversaciones reales y audios del negocio.
- **`try/catch` en el guardado automático.** Si se cae la red o vence la sesión, la acción
  TIRA en vez de devolver un error, y sin el catch el estado queda colgado en "Guardando…"
  para siempre mientras el cliente sigue escribiendo.

## Output esperado

Un cliente nuevo que, sin que nadie le explique nada: recibe su acceso, aterriza en el
formulario, contesta por audio desde el celular, deja lo que no sabe para la llamada, y al
mandarlo te aparece un aviso con un clic hasta sus respuestas. Y los clientes viejos, sin
enterarse de que la feature existe.

## Ejemplo

**Input:** *"Cuando un cliente paga, le mando un Word con 32 preguntas al grupo de
WhatsApp y nunca lo llena."*

**Output:** 8 bloques dentro de su CRM con audio y archivos, guardado automático, aterrizaje
la primera vez, recordatorio hasta que lo mande, vista de solo lectura del lado del founder
y campana de avisos. Primer cliente real dado de alta con el flujo: espacio + embudo + 5
campos + invitación por correo + puesta en marcha esperándolo, **todo verificado contra la
base**, en 1 minuto y sin tocar SQL.
