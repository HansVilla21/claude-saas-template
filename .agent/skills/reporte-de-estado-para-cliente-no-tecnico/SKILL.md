# Skill: Reporte de estado para un cliente que no es técnico

Un HTML autocontenido que se manda por WhatsApp y se abre de un toque. Sin PDF,
sin build, sin login. Es el entregable que hace que el cliente **vea** el avance
en vez de creerte, y el que convierte una reunión de quejas en una de decisiones.

## Cuándo usar esta skill

- Se viene una reunión de seguimiento y pasaron semanas desde la última.
- El cliente "no ve" el trabajo hecho, o cree que no avanzó nada.
- Hay que pedirle insumos y decisiones, y ya se pidieron por WhatsApp sin éxito.
- Terminaste una tanda de mejoras y querés que se noten antes de que las pida otra vez.

## Los tres documentos son distintos — no los mezcles

Es el error que cuesta la reunión: mandar un solo documento que intenta servir
para todo. Son tres, con audiencias y objetivos distintos.

| Documento | Para quién | Qué hace |
|---|---|---|
| **Resumen del cliente** | El dueño, en el celular, en 2 minutos | *"Todo lo que ya tiene tu sitio"*. Solo logros, en su idioma, con checks. Cero jerga, cero pendientes |
| **Hoja de revisión** | Para trabajar **durante** la reunión | Lo que él tiene que decidir o marcar, con espacio para responder. Es un formulario, no un informe |
| **Reporte de estado** | Vos, tu equipo, el handoff | Todo: métricas, decisiones, bloqueos, deuda técnica, qué falta y por qué. En Markdown, versionado en el repo |

El cliente recibe el primero. El segundo se abre en pantalla compartida. El
tercero no se manda casi nunca — es tu memoria del proyecto.

## Por qué HTML autocontenido y no PDF ni Notion

- **Se abre.** Un link de WhatsApp abre en el navegador del celular, sin
  descargar, sin app, sin cuenta. Un PDF de 3 MB en un teléfono viejo no se abre.
- **Se ve bien en el celular**, que es donde el cliente lo va a ver. Un PDF A4 en
  un teléfono se lee con zoom, y no se lee.
- **Lo generás y lo regenerás en minutos**, con los números de la base al día.
- **Un solo archivo.** CSS inline, sin imágenes externas, sin fuentes de Google:
  funciona offline y no se rompe en 6 meses.
- **Respeta el modo oscuro** del teléfono, que es como la mitad de la gente lo
  tiene. Un documento que quema la pantalla de noche se cierra.

Plantilla lista para parametrizar: [`plantilla-resumen-cliente.html`](plantilla-resumen-cliente.html).

## Proceso

1. **Sacá los números de la base, no de la memoria.** El antes/después es el
   corazón del documento: `83 → 230 productos`, `2 → 213 con precio`,
   `0 → 504 variantes`. Un número concreto vale más que diez adjetivos.
2. **Escribí en el idioma del cliente.** No "se implementó `localStorage` para
   persistir favoritos": *"Tus clientes pueden guardar los muebles que les
   gustaron y volver después"*. Si una línea no se entiende sin saber programar,
   está mal escrita.
3. **Encabezá con el link vivo.** Un punto verde y *"Entrá a verlo"*. Lo primero
   que hace el cliente es abrir su sitio; dale el botón.
4. **Destacá la novedad de esta entrega** en una caja arriba, con etiqueta
   "Nuevo". Es lo que quiere ver y es lo que justifica la reunión.
5. **Agrupá por lo que le importa al negocio**, no por módulo técnico: "El
   catálogo", "La experiencia del cliente", "Lo que podés administrar vos".
6. **Los pendientes van en el OTRO documento.** El resumen del cliente no lleva
   pendientes ni bloqueos: eso convierte un logro en una queja.
7. **En la hoja de revisión, una decisión por bloque**, redactada como pregunta
   concreta y con las opciones. *"¿Cómo se cotiza el mueble de cocina: por metro,
   por rango, o son dos acabados?"* — no *"definir cotización de cocina"*.
8. **Fechá el archivo** (`resumen-cliente-2026-08-11.html`) y guardalo en `docs/`.
   La serie de reportes fechados **es** la historia del proyecto, y salva la
   conversación de "esto no lo habíamos pedido".

## Gotchas

- **Antes de pedir un insumo, verificá que sea de él.** El error real: se le
  pidió al cliente "las reseñas de Google copiadas" durante dos reportes. Las
  reseñas **ya son públicas**: tomarlas y publicarlas era trabajo nuestro. Cada
  ítem de la lista "lo que necesito de vos" que en realidad podés resolver vos
  te hace ver lento y le da al cliente una excusa para no avanzar. Revisá esa
  lista con esa pregunta, ítem por ítem.
- **No mezcles logros con pendientes en el mismo documento.** El ojo va al rojo.
  Un documento con 20 checks y 8 pendientes se lee como "faltan 8 cosas".
- **Nada de rutas de archivos, nombres de tablas ni nombres de ramas.** Si
  aparece `producto_opciones` o `PR #15`, es el documento equivocado.
- **`prefers-color-scheme` con override.** Definí la paleta clara en `:root`,
  redefinila en el media query oscuro, y de nuevo en `[data-theme]` por si el
  visor fuerza un tema.
- **Sin imágenes externas ni fuentes remotas.** Si el archivo depende de un CDN,
  en 6 meses es una página rota. Fuentes del sistema, todo inline.
- **Ancho máximo ~760px y `clamp()` en los paddings.** Se lee igual de bien en un
  celular de 375px que en una laptop.
- **Un compromiso de fecha que se venció, se nombra.** El reporte interno del
  27/07 decía "la reunión de seguimiento ya venció (era el 20/07)". Escribirlo
  duele menos que la conversación de no haberlo escrito.
- **Regeneralo el día de la reunión**, no la semana anterior. Los números
  cambiaron.

## Output esperado

- `docs/resumen-cliente-<fecha>.html` — autocontenido, mobile-first, modo oscuro,
  solo logros, con link vivo arriba.
- `docs/hoja-revision-<tema>-<fecha>.html` — decisiones e insumos, redactados como
  preguntas, para abrir en pantalla compartida.
- `docs/reporte-estado-<fecha>.md` — el completo, versionado, con métricas,
  bloqueos, deuda y qué falta. Sirve de handoff.
- Todos fechados y guardados; la serie queda como historia del proyecto.

## Ejemplo

**Input:**
"Reunión con el cliente el lunes. Hace 4 semanas de la última y siente que no
avanzamos, aunque metimos dos tandas completas de mejoras."

**Output:**
Tres archivos. Al cliente le llega por WhatsApp `resumen-cliente-2026-08-11.html`:
abre en el celular, ve el link vivo con el punto verde, la caja "Nuevo: un
asistente virtual en tu página", y 14 checks agrupados en "El catálogo" / "La
experiencia del cliente" / "Lo que podés administrar vos". En la reunión se abre
la hoja de revisión con las 6 decisiones pendientes redactadas como preguntas.
El reporte largo queda en el repo. La reunión pasa de "¿en qué vamos?" a resolver
las 6 decisiones.

## Skills relacionadas

`auditar-datos-antes-de-programar-features` (de donde salen los números del antes/después) ·
`fotos-de-pdf-con-revision-humana` (mismo patrón de HTML autocontenido para que el cliente marque) ·
`reporte-in-app-con-snapshot-efimero` · `onboarding-cliente-crm` ·
`completitud-de-contenido-en-el-panel` (el contador de progreso que se cita en el reporte).
