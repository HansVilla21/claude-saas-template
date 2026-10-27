# Skill: Novedades dentro del producto (y que nunca se olvide anunciar)

Un SaaS que cambia todas las semanas y no avisa nada: el cliente no usa lo nuevo
porque no sabe que existe, y cuando algo cambia de lugar piensa que se rompió. La
cita del founder que originó esto (2026-09-25): *"siempre agregamos cosas nuevas
y nunca avisamos nada"*. Y la segunda, que es la que decide el diseño: *"que
siempre se haga cada vez que se trabaja algo... no tengo que estar todo
recordando"*.

Son dos problemas distintos, y la skill resuelve los dos:
1. **El producto:** una sección "Novedades" con cada cambio por fecha, y un
   aviso por usuario que invita a entrar hasta que entra una vez.
2. **El proceso:** que cada cambio visible llegue ahí **en el mismo PR**, con un
   candado que no depende de que nadie se acuerde.

La segunda es la importante. Una sección de novedades que se llena "cuando hay
tiempo" queda con tres entradas y después muere.

## Cuándo usar esta skill

- Un producto con usuarios que no son el equipo (clientes, sus empleados) y que
  se sigue construyendo.
- El founder dice alguna versión de "la gente no sabe lo que agregamos" o "nadie
  usa X".
- Ya existe una sección de novedades y está desactualizada: el candado es la
  parte que falta.

## Proceso

### 1. El contenido es CÓDIGO, no base

`src/lib/novedades/entradas.ts`: un array tipado, de la más nueva a la más vieja.

```ts
{ id: '2026-09-25', fecha: '2026-09-25', titulo: 'Actualización del 25 de septiembre',
  bajada: 'Una línea con lo más importante.',
  portada: ['visual-a', 'visual-b', 'visual-c'],     // opcional
  items: [{ tipo: 'nuevo' | 'mejora' | 'arreglo', titulo, detalle,
            enlace?: { ruta: 'inbox', texto: 'Ir a…', soloAdmin? }, visual?: 'visual-a' }] }
```

**Por qué código:** el cambio y su anuncio viajan en el MISMO PR, se revisan
juntos y el anuncio no puede quedar "para después". Un panel de administración
con una tabla invita a eso.

Un validador puro con pruebas se pone rojo si hay:
- un id repetido;
- una fecha que no existe;
- un id que no empieza con su fecha;
- una entrada fuera de orden;
- una ruta con barra inicial;
- una ilustración inexistente;
- más de 6 destacados.

La prueba corre contra el registro REAL. Agregale un control negativo por cada
rotura, o no prueba nada.

### 2. "Visto" por usuario, en el servidor, por id

- **Una columna** `users.novedades_vista text`: el id de la entrada más nueva
  que ese usuario vio. `null` = nunca vio ninguna.
- **Nunca localStorage:** es por dispositivo, y el aviso reaparecería en cada
  celular nuevo (ver `onboarding-estado-server-side`).
- **Hay novedades** = `entradas[0].id !== vista`. **Nuevo para vos** = todo lo
  que está antes de ese id en el array.
- **Por id y no por fecha:**
  - Una entrada nueva, aunque sea del mismo día (`'2026-09-25-b'`), vuelve a
    encender el aviso para todos.
  - Sumar ítems a una entrada ya publicada NO lo enciende: quien ya la vio no se
    entera. Si ya subió, la siguiente va con sufijo.
  - Cambiarle el id a una publicada la muestra de nuevo a todos: los ids no se
    tocan.
- **La lectura va en la MISMA consulta** que el layout ya hace del usuario:
  cero viajes nuevos por navegación.
- **Marcar visto:**
  - Server action, con el cliente de la sesión.
  - Valida el id contra el registro: nunca guarda un string del navegador.
  - Trata 0 filas como error. Bajo RLS un update filtrado responde "éxito" sin
    escribir (ver `detectar-escritura-filtrada-rls`).
  - Es optimista con revert, sin `router.refresh()`: refrescar vuelve a correr
    todo el layout para apagar un punto.

### 3. El aviso: una tarjeta clara, sin flecha

Iteración real: la primera versión fue un globo oscuro con flecha, anclado al
ítem del menú. El founder: *"no me gusta cómo se ve, la flecha apunta a otro
lado... seamos más serios"*.

La que quedó:
- **Una tarjeta** de fondo claro, con borde y sombra de elemento flotante.
- **Arriba, la portada** de la actualización.
- **Debajo:** "NOVEDADES · 25 DE SEPTIEMBRE", el título, "16 cambios en el CRM"
  y dos botones: **Ver novedades** y **Ahora no**. Los dos marcan visto.
- **Ubicación:**
  - Desktop: abajo a la izquierda del contenido, pegada a la barra lateral.
  - Celular: debajo de la barra superior, de borde a borde con margen, y un
    punto en el botón de menú.
- **Sin flecha:** una flecha que apunta a un ítem de menú se ve desalineada
  apenas el menú se mueve, y la tarjeta no necesita señalar nada.
- **Escape la cierra solo con el foco adentro.** Escuchado en todo el
  documento, quien cierra un modal con Escape marcaría las novedades como vistas
  sin haberlas mirado.
- **Portal y `fixed`,** nunca `absolute` (ver `popover-portal-no-absolute`).

### 4. Con imágenes, pero NUNCA capturas

- El founder pidió imágenes *"para que se note más, algo más profesional"*.
- **Las capturas de la pantalla real quedan descartadas:** mostrarían nombres y
  teléfonos de contactos reales a TODOS los clientes.
- **Las ilustraciones son réplicas de la interfaz:** componentes chicos
  (`w-[15rem]`) con los tokens del sistema y datos de ejemplo ("Laura Rojas").
  Son decorativas (`aria-hidden`); lo que dicen lo dice el texto de al lado.
- **Registro tipado:** `VISUALES` es un `as const` en `lib` y
  `Record<VisualId, Component>` en los componentes, así que un id sin dibujo no
  compila.
- **Destacados** = ítems con `visual`: tarjeta grande arriba, en 2 columnas si
  la tarjeta es ancha. Como máximo 6. El resto va en una lista sobria.
- **Portada:**
  - Tarjeta ancha: 3 ventanas, la del medio adelante.
  - Tarjeta angosta: un collage de 2 encimadas. Una sola ventana centrada se
    leía igual que la ilustración del primer destacado, justo abajo.
- **Container queries** (`@container`, `@xl:`), no breakpoints de viewport: la
  barra lateral y la columna de la fecha se comen ancho y la tarjeta no mide lo
  que mide la pantalla.
- **Nunca dibujes lo que el producto no hace.** Una ilustración mostraba un
  "historial" de quién cambió las etiquetas que no existía y se sacó: el cliente
  lo iba a buscar.

### 5. El candado: pre-push, no pre-commit

Una regla escrita depende de acordarse (ver `enforcement-con-hook-no-con-regla`).
Por eso el candado es un hook `.githooks/pre-push`, versionado.

**Qué hace:**
- En cada push de una rama, calcula qué cambió contra `origin/main`.
- Si toca archivos que el usuario ve y **no** toca `entradas.ts`, frena y explica
  qué hacer.
- "Lo que el usuario ve" es una heurística: pantallas del negocio, componentes,
  login y estilos; nunca master, API, lib, base ni pruebas.
- La lógica es pura (`regla-push.ts`) y tiene pruebas. El hook solo le pasa lo
  que git manda por stdin.

**Por qué pre-push y no pre-commit:**
- Un commit intermedio no tiene por qué traer su anuncio.
- El push de la rama es el momento en que el trabajo se vuelve un PR.

**Escapes a propósito:**
- `Sin-Novedad: <motivo>` en un commit de la rama. El motivo es obligatorio y con
  cuerpo: "x" no alcanza, y así queda escrito por qué no se anunció.
- Emergencia: `SIN_NOVEDAD=1 git push`. El hook avisa que se saltó.

**Lo que no ve:**
- Un cambio en `lib` que sí se nota (una métrica calculada distinto). Ahí manda
  la regla escrita.
- La heurística se equivoca para los dos lados, y está bien: el escape cubre el
  falso positivo.

**Cómo se prueba de punta a punta sin tocar ramas:**
- Tres commits sueltos con `git commit-tree` sobre un índice temporal
  (`GIT_INDEX_FILE`), pasados al hook por stdin.
- Resultado esperado: sin novedad frena, con motivo pasa, con novedad pasa.

### 6. Que TODA sesión lo sepa, sin recordárselo

- **Regla** en el `AGENTS.md`/`CLAUDE.md` del proyecto, con la cita del founder.
- **Skill del proyecto** en `.claude/skills/novedades-en-cada-cambio/`, con la
  descripción empezando por "Usar SIEMPRE que se cambie algo que el usuario
  nota…". Las skills de subcarpetas aparecen solas en las sesiones abiertas
  desde la raíz.
- **El candado,** que funciona aunque la sesión no haya leído nada de lo
  anterior.

## Cómo se escribe una novedad

- **Para el usuario final,** en el tono del producto (voseo, tildes): qué puede
  hacer ahora y dónde.
- **Nada técnico:** "migración", "PR", "RLS", nombres de tablas.
- **Un arreglo se cuenta desde lo que se veía:** "el chat ya no baja solo
  mientras leés", nunca "fix en el scroll".
- **Una o dos oraciones.** Pasalo por `matar-el-olor-a-ia`.
- **No va:** refactors, velocidad que nadie nota, cosas internas, lo que solo ve
  el equipo interno.

## Output esperado

- La sección `/novedades`, la tarjeta de aviso y la columna de "visto".
- `entradas.ts` con su validador y sus pruebas.
- `regla-push.ts` con sus pruebas, más el hook `.githooks/pre-push` y el script
  que lo corre.
- La regla escrita y la skill del proyecto.

## Ejemplo

- **Input:** un PR que agrega un botón "Agendar cita" al chat.
- **Output:**
  - Un ítem `nuevo` en la entrada del día: "Agendar una cita desde el chat —
    En la conversación hay un botón para agendar: el contacto y la hora ya vienen
    cargados", con enlace a Conversaciones y `visual: 'agendar-chat'`.
  - Si esa entrada ya estaba en producción, una nueva `'AAAA-MM-DD-b'` arriba.
  - Al push, el hook pasa por `trae-novedad`.
  - Cada usuario ve la tarjeta una vez, entra y se apaga sin recargar.

## Extensión (2026-09-25 noche): contarlo como "¿Querés hacer X?"

Con Novedades ya en producción, el founder cambió el enfoque: *"que todo sea para
qué me sirve y después lo uso… ¿querés que el bot te organice tus contactos? y si
le doy sí me explica… no como 'este tool hace esto'"*. Una lista de cambios dice
qué hay nuevo; esto le dice a la persona qué puede lograr y cómo hacerlo parada
frente a la pantalla.

- **Cada ítem que se puede usar lleva `uso = { pregunta, pasos }`:**
  - `pregunta`: lo que la persona QUIERE ("¿Querés que el chatbot te ordene los
    contactos solo?"), nunca el nombre de la función ("Nuevo interruptor en
    Etiquetas"). Va entre ¿ y ?.
  - `pasos`: de 1 a 4, con los nombres de la pantalla entre «» (se muestran en
    negrita). **Sacados del código de la pantalla, no de memoria:** un paso que
    nombra un botón que no existe es peor que no tener pasos. Si un botón es
    solo un ícono, se describe ("el ícono de calendario de arriba del chat").
- **En pantalla:** la pregunta, una línea con lo que gana, y "Sí, mostrame cómo",
  que despliega los pasos y el botón para ir. Los pasos van en el DOM desde el
  principio (grid `0fr → 1fr`, `inert` cerrado): abrir no hace saltar la página.
- **Tres secciones:** lo que podés hacer ahora (con imagen), más para probar, y
  "además, sin que tengas que hacer nada" (arreglos, sin pregunta).
- **El validador lo exige** en todo lo nuevo y lo destacado, con control negativo
  por cada regla (pregunta sin ¿, sin pasos, 5 pasos, títulos repetidos).
- **El aviso del menú pregunta por UNA cosa**, elegida según el rol: a un agente
  no se le ofrece algo de Configuración. "Sí, mostrame cómo" lleva a
  `/novedades?ver=<ancla>` con ese ítem abierto. `?ver=` se lee en el servidor
  para que el HTML ya llegue abierto. El salto al ítem es directo, no suave: se
  llega a la página, no se mueve dentro de ella.
- **Lo que es de owner/admin**, para el resto dice "Esto lo configura el dueño o
  un administrador de la cuenta" en vez del botón.
- **Republicar para que el aviso vuelva a salir:** fue una excepción deliberada a
  "los ids no se tocan". La misma entrada con sufijo `-b` reenciende el aviso para
  todos, incluso para quien vio la versión anterior. Solo con OK del founder.

## Gotchas

- **Antes de verificar el aviso, reiniciá tu propia marca:** si ya entraste a
  `/novedades`, la tarjeta no aparece, y eso es lo correcto, no un bug. Poné
  `users.novedades_vista = null` para tu propio usuario.
- **Un dev server con caché vieja puede servir el CSS sin las clases nuevas:**
  el globo se veía sin fondo. Si una clase no aplica y el archivo la tiene,
  reiniciá el servidor antes de tocar el código (ver `verificar-frontend-sin-ver`).
- **Si un agente edita `AGENTS.md`, revisá `git diff --stat` contra
  `--ignore-cr-at-eol`:** en Windows la herramienta de edición puede reescribir
  los finales de línea de medio archivo, y un cambio de 3 líneas se ve de 70.
  Se rearma desde la versión de `main` más las líneas nuevas.
