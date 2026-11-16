# Skill: Guía interactiva sobre las pantallas reales (el recorrido es un dato, y el catálogo se prueba)

## Cuándo usar esta skill

- El cliente pide que **el sistema acompañe** a su gente —marcar el botón real y avanzar cuando la persona lo toca— en vez de un manual que nadie abre.
- Ya hay una guía y hay que **sumarle tareas**. Cada tarea es un dato, no una pantalla.
- Se renombraron botones, se movió una pantalla o se cambió un rol, y hay que comprobar que **el catálogo sigue diciendo la verdad**.
- Una persona del equipo pregunta "¿cómo hago X?" por tercera vez. Esa pregunta es una tarea del catálogo.

**No es para:** un tour de bienvenida de 5 pasos que se muestra una vez (usá una librería), ni para documentar (la Ayuda **explica**; la guía **acompaña**: son dos cosas y conviven).

## Por qué existe esta skill

Capturada el **2026-11-03** en el sistema de operación de una clínica (Next.js + Supabase, 7 roles). Primero salieron 80 preguntas y 5 recorridos; después, 60 tareas y 6 flujos más, todo sobre pantallas reales.

El motor fue lo fácil. Lo caro fue que **un recorrido miente sin avisar**: se renombra un botón y el anillo no se dibuja; el texto promete "el botón pasa a «Llamado»" y la fila desaparece de la lista. Ninguna prueba unitaria lo ve. Hicieron falta una batería que lee el código, **dos revisiones con un modelo fuerte** y un **barrido en un navegador real** para encontrar lo que 149 pruebas de la guía daban por bueno.

## La idea central: un recorrido es un DATO

El motor es una función pura que se prueba sin navegador. Lo que cambia por tarea es un objeto:

```ts
type Tarea = {
  id: string;        // NO se cambia una vez publicado: lo guardan «la guía a medias» y «ya lo hiciste»
  version: number;   // sube si el recorrido cambió tanto que conviene ofrecerlo de nuevo
  titulo: string;
  frase: string;     // lo que la persona quiere, con SUS palabras (≤ 110 caracteres, sin punto final)
  roles: Rol[];      // los que de verdad pueden: leídos del requireRol y de quién ve el botón
  categoria: CategoriaId;
  nivel: "acompana" | "lleva" | "explica";
  ayuda?: string;    // artículo que se abre si no tiene pasos
  palabras?: string[]; // otras formas de buscarla
  diario?: Rol[];    // sale en «lo de todos los días» de esos roles (tope 6 por rol)
  frecuente?: boolean;
  pasos?: PasoGuia[];
};

type PasoGuia = {
  id: string;
  ruta: string;      // la pantalla; `:id` es un tramo cualquiera
  ancla?: string;    // data-guia="…" del elemento real que se marca
  archivo?: string;  // dónde vive esa ancla (una prueba lo exige)
  titulo: string; texto: string;
  listo: Senal;
  vacio?: { ancla, archivo, titulo, texto };  // «no hay nada con qué hacer este paso»
  volverSi?: { ancla: string; paso: string }; // retroceso si se cerró lo que el paso necesitaba abierto
  tambienEn?: string; // otra pantalla que el texto sugiere: ahí no se dice «te saliste del camino»
};
```

**Tres niveles, una decisión de quien escribe (la persona nunca la ve):**

| Nivel | Qué hace | Pasos |
|---|---|---|
| `acompana` | Panel + anillo paso a paso. Se anota como hecha | 3 a 7 (un flujo, hasta 8) |
| `lleva` | Para una **pregunta** ("¿quién no ha firmado?"): abre la pantalla, marca dónde mirar. **No** se anota como hecha | 1 o 2 |
| `explica` | Sin pasos: abre su artículo de Ayuda | 0 |

## Las cuatro señales de "listo" (y la que está prohibida)

| Señal | Se cumple cuando | Ojo |
|---|---|---|
| `ruta` | la dirección **cambia** al patrón | si la persona ya estaba ahí, **no** avanza |
| `campo` | el campo ancla tiene valor | **no muestra «Siguiente»**: si el campo desaparece sin llenarse, el paso queda trabado |
| `hecho` | la pantalla publicó un hecho (`pago_registrado`) | se publica **solo después** de que la acción salió bien, nunca al tocar el botón |
| `manual` | la persona toca «Siguiente» (o, con `alTocar`, el ancla) | el **último paso siempre es `manual`** y no afirma lo que la guía no vio |

⛔ **Prohibida: "avanza cuando algo aparece en pantalla".** Miente con esqueletos de carga y avisos que parpadean.

Reglas del motor que quien escribe un texto tiene que saber (cada una costó un bug):

- **«Siguiente» no cambia de pantalla ni aplica los filtros** (`?estado=…`) de la ruta del paso que sigue. Solo el primer paso los pone. Si el paso 3 dice "acá están las que ya tienen factura", es falso: el texto tiene que decirle a la persona **que elija** el filtro.
- **«Saltar» termina la tarea** (no pasa de paso). En el último paso el botón es «Terminar» (o «Listo» si era `lleva`), y ahí no hay «Pausar» ni «Saltar».
- **`vacio` suelta el recorrido** con «Entendido» y **no lo anota** como hecho (la persona no hizo nada). Solo vale con la pantalla tal como la abrió la guía. Nunca "todo bien" si no se sabe.
- **El id que la guía recuerda (el de la venta recién guardada) se usa solo en las rutas de ESA entidad** (`/cierres/:id`). En cualquier otra ruta con `:id`, ese `:id` es de otra cosa: sin esta regla, «Volver a este paso» llevaba a `/contratos/<id de la venta>`, que no existe.
- **El anillo marca el elemento visible** cuando el ancla se repite (la columna de la compu y la del celular comparten ancla).

## La lista que ve la persona: simple y sin abrumar

Es una regla del cliente, no un detalle de diseño: lo que se ve al entrar es **poco**.

- Un **buscador** (desde 2 letras, sin tildes ni mayúsculas, todas las palabras tienen que estar, hasta 10 respuestas; si no hay, ofrece buscar en la Ayuda).
- **«Lo de todos los días»**: hasta 6 tareas **del rol**.
- **«Todo lo demás»**: categorías cerradas; cada una abre con hasta 6 frases (las `frecuente`) y «Ver más» para el resto. Una categoría sin nada para ese rol **no aparece**.
- Cada fila es **una frase que se toca entera**. Sin etiquetas, sin números, sin tres botones.
- Al navegador viaja **solo** lo que la lista necesita: nunca los pasos ni los roles. Una prueba lo impide (el catálogo no se importa desde el cliente).

## Proceso: sumar una tarea

1. **Mirá la pantalla de verdad, no el inventario.** El inventario (la lista de tareas pensadas) es un punto de partida; **manda la pantalla**.
2. **Escribí la `frase` con las palabras de la persona**, en voseo y sin jerga ("Registré una venta que no era o la dupliqué", no "anular un cierre").
3. **Elegí el nivel.** ¿Es una pregunta? `lleva`. ¿Hace algo que cambia datos? `acompana`.
4. **Los roles salen del código**: el `requireRol` de la acción y quién ve el botón. No de la intuición ("Completar datos del contrato" no es del closer: no edita la ficha).
5. **Poné las anclas** (`data-guia="…"`) en la pantalla —solo atributos— y anotá en el paso el `archivo` donde viven.
6. **Escribí los pasos**: de 3 a 7, el último `manual` con "Cómo saber que quedó". Los nombres entre « » tienen que existir **tal cual** en el código.
7. **Si el paso ocurre dentro de una ventana**, usá la skill `guia-pasos-dentro-de-ventanas`.
8. **Corré las pruebas** (abajo) y después el **barrido** en navegador real.
9. **Cada tarea en el archivo de su categoría** (`catalogo/<categoria>.ts`, partido en `-2`, `-3` al pasar de 300 líneas). Los flujos, cada uno en su `flujo-<nombre>.ts`: así los ayudantes en paralelo no se pisan.

## Las pruebas que mantienen honesto al catálogo

Cada una lee el código y **trae su control negativo** (un recorrido roto a propósito que la prueba tiene que detectar; si no discrimina, el verde es falso):

| Prueba | Atrapa |
|---|---|
| Cada `data-guia` existe **en su `archivo`** Y ese archivo forma parte de la pantalla de la `ruta` | ancla renombrada; ancla que existe pero en otra pantalla |
| Cada nombre entre « » de un paso existe en el código de `src/` (sin contar el catálogo ni la Ayuda) | botón renombrado; botón inventado |
| Cada rol de la tarea **ve la pantalla del primer paso** (el `requireRol` de la página y el menú) | tarea ofrecida a quien no puede abrir la pantalla |
| Cada hecho que espera un recorrido **se publica** en el código | paso que espera para siempre |
| Forma por nivel: cantidad de pasos, último `manual`, ids únicos, `campo` con ancla | recorrido mal armado |
| `volverSi` apunta a un paso **anterior** que se cumple tocándolo | retroceso a la nada |
| Voseo, sin jerga (`RPC`, `webhook`…), sin emojis, sin siglas raras, frase ≤ 110 | texto que suena a sistema |
| Cobertura contra el inventario | tarea pensada que nunca se hizo |

Todas se apoyan en un archivo chico de soporte (`pruebas-soporte.ts`, no es un test y nada de la app lo importa) con tres funciones. Es lo que permite exigir "el ancla está en **esta** pantalla" y no solo "existe en algún lado":

```ts
// La ruta de un paso → el page.tsx que la sirve (`:id` es la carpeta `[id]`)
paginaDe("/cierres/:id")  // "src/app/(privado)/cierres/[id]/page.tsx"

// Todos los archivos que arman una pantalla: su page.tsx, lo que importa, y lo que eso importa
function archivosDeLaPantalla(pagina: string): Set<string> {
  const vistos = new Set<string>(); const pendientes = [pagina];
  while (pendientes.length) {
    const f = pendientes.pop()!;
    if (vistos.has(f) || !existe(f)) continue;
    vistos.add(f);
    for (const m of leer(f).matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)) {
      const r = resolver(f, m[1]);   // `@/…` o relativo → archivo real, o null si no es del proyecto
      if (r) pendientes.push(r);
    }
  }
  return vistos;
}

// Los roles que una página deja entrar: se leen de su `requireRol("a", "b")` (sin argumentos = todos)
rolesDeLaPagina(pagina)
```

El ancla se busca como `data-guia="x"` y también como `guia="x"` (los componentes del sistema que la pasan, como un botón-enlace o una tarjeta).

## La revisión que ninguna prueba hace

Un revisor con un modelo fuerte, **leyendo el código real y sin tu conclusión**. Qué buscarle:

- **Textos que afirman lo que la guía no vio.** "Se mandó el WhatsApp" cuando la guía solo vio que la persona tocó un botón.
- **Textos que no valen para ese rol** o para ese estado ("tocá «Reenviar»" cuando al closer no le aparece).
- **Filtros** que «Siguiente» no aplica (ver arriba).
- **Pasos que se traban**: un `campo` que puede desaparecer, un `ruta` que la persona ya cumplió.
- **Ventanas** que tapan el panel o instrucciones que la ventana oculta.

Reglas de oro de la revisión:

1. **Dos pasadas, y la segunda es SOLO sobre los arreglos.** La primera encontró casi todo lo grave; la segunda encontró una **regresión que metió un ayudante al seguir la primera** (un `volverSi` que hacía retroceder la guía con el editor ya abierto). Un arreglo es código nuevo: se revisa con el mismo rigor.
2. **Si dos revisores se contradicen, se prueba en un navegador real.** Uno pedía sumar un `volverSi`; el otro, quitarlo. No se votó: se probó, y el que lo quitaba tenía razón.
3. **Aflojá las pruebas compartidas una sola vez antes de repartir** (ver `worktree-para-no-pisar-el-checkout`, apéndice de trabajo en paralelo).

## El barrido en navegador real

Las pruebas leen el código; el barrido mira **lo que de verdad se dibuja**. Para cada rol, con una cuenta de PRUEBA, visitá cada pantalla que usa el catálogo y contá, por ancla, cuántas hay y cuántas son visibles.

```bash
# 1. Qué pantallas y qué anclas, por rol (desde la raíz del proyecto)
node --experimental-strip-types --no-warnings --import ./scripts/register-alias.mjs \
  <skill>/barrido/generar-rutas.mjs <carpeta>
# 2. Un servidorcito para pasar datos al navegador y recibir los resultados
node <skill>/barrido/servidor.mjs <carpeta>        # escucha en :4001
```

En cada pantalla (reemplazando `:id` por un registro de PRUEBA), esperá a que hidrate y corré:

```js
const contar = (anclas) => Object.fromEntries(anclas.map((a) => {
  const todos = [...document.querySelectorAll(`[data-guia="${a}"]`)];
  return [a, [todos.length, todos.filter((e) => e.getClientRects().length > 0).length]];
}));
// guardá [{ ruta, final: location.pathname, titulo: document.title, res: contar(...) }] con un POST a :4001/resultado-<rol>-<n>.json
```

```bash
# 3. El informe
node <skill>/barrido/informe.mjs <carpeta> <rol>
```

Cómo leer el informe:

| Línea | Qué es | Qué hacer |
|---|---|---|
| `FALTA  ancla` | ninguna en la pantalla | ¿es un estado vacío esperable (sin comisiones, sin datos)? Si sí, el paso necesita su `vacio`. Si no, ancla perdida |
| `OCULTA ancla (n)` | está, pero invisible | ventana cerrada, pestaña no activa, o el elemento del celular |
| `x2 ancla` | visible más de una vez | columna de la compu + la del celular: el anillo tiene que elegir la visible |
| `ruta → otra` | la pantalla **redirigió** | ese rol no puede entrar: la tarea no es suya |

⚠️ Gotchas del barrido (cada uno hace **mentir** al informe):

- **Un navegador en segundo plano no hidrata bien**: las cargas directas se quedan en "Cargando…" y medís el esqueleto. Verificá con una pestaña visible o navegá con clics.
- **Medir antes de hidratar** da "FALTA" masivo. Esperá a que el título sea el de la pantalla y haya pasado un respiro.
- **El rol decide qué hay**: con otro rol, medio catálogo "falta" porque el botón ni se renderiza. Barré **un rol a la vez** con su cuenta.
- **Los datos que hoy no hay** (una venta que espera términos, una comisión pendiente) no se pueden ver: anotalo como "no verificado", no como "bien".
- **Un registro de prueba que no gaste numeración ni mande nada**: armalo antes (con el contador intacto dentro de una transacción) y anulalo al terminar.

## Output esperado

- Un catálogo en `src/lib/guia/catalogo/*.ts`, con la batería de pruebas verde y cada regla con su control negativo.
- Un informe del barrido por rol, con lo no verificado **dicho**.
- La lista de qué se probó y qué no (celular real, datos que no existen todavía).

## Ejemplo

**Input:** la persona que administra el sistema preguntó cómo cambiar cuántas sesiones de médico o psicología lleva un producto, y la guía no lo decía.

**Qué pasó:** la pregunta tenía **dos** respuestas según qué cambia: el producto (para las ventas nuevas) o el programa de un paciente en particular. Las dos frases se confundían ("…trae un programa" se leía como el programa de un paciente).

**Output:** dos tareas con frases que no se pisan:

- *Quiero cambiar cuántas sesiones con médico y con psicología lleva un producto, para las ventas nuevas* → Configuración → Productos → «Con qué pasos nace el programa».
- *A este paciente le tocan más (o menos) sesiones con médico o psicología que las del producto* → su ficha → Tratamiento.

Una pregunta del cliente casi nunca es una tarea: suele ser **dos** que comparten palabras.
