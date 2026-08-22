# Skill: El selector que obliga a una elección consciente (y no arrastra tipos)

## Cuándo usar esta skill

- Una pantalla pide elegir entre 2–4 opciones que **cambian de raíz lo que el sistema hace después** (modo de generación, tipo de cuenta, plantilla, plan).
- Hay evidencia de que los usuarios **eligen mal**: soporte repetido, outputs malos, abandono en ese paso.
- El selector actual son palabras sueltas, con una preseleccionada "porque es la más común".

**No usar** para preferencias reversibles y baratas (tema claro/oscuro, orden de una lista). Ahí un default es correcto y obligar a elegir es fricción gratis.

## Por qué existe esta skill

FreshAdFlow, 2026-07-11. El paso `/crear` ofrecía tres modos como **tres palabras sueltas** — `Producto · Servicio · Concepto` — con **Producto preseleccionado** en el estado inicial del contexto.

Resultado con usuarias reales: **las dos** generaron todo en Producto. Una vende masajes; la otra un e-book. El motor, obligado a "mantener el producto exactamente igual", inventó un tarro de crema y un libro pegado. 21 imágenes malas, dos usuarias quemadas, cero compras.

Dos defectos concretos, ambos de UI:

1. **El default eligió por ellas.** Nadie toca un radio que ya viene marcado.
2. **"Concepto" es jerga interna.** Quien vende un e-book no se identifica con esa palabra. Se renombró a **"Digital"**.

## Proceso

### 1. Cero preselección + validación antes de avanzar

```tsx
// Estado LOCAL de la pantalla: null = todavía no eligió
const [chosen, setChosen] = useState<Mode | null>(null);

function onContinue() {
  if (!chosen) { setError("Elegí qué vas a promocionar"); return; }
  setMode(chosen);            // recién acá toca el estado compartido
  router.push("/crear/estilo");
}
```

### 2. Tarjeta, no palabra: nombre + qué significa + ejemplos

La regla: **el usuario tiene que reconocerse en la opción sin saber tu vocabulario.** Nombre corto, una frase en primera persona, y ejemplos concretos de su mundo.

| Opción | Descripción (en su idioma) | Ejemplos |
|---|---|---|
| **Producto** | "Algo físico que puedo fotografiar" | Crema, aretes, comida, ropa… |
| **Servicio** | "Atiendo a personas" | Masajes, uñas, corte, asesoría… |
| **Digital** | "Sin un producto físico que fotografiar" | E-book, curso, app, evento… |

Los ejemplos hacen el trabajo pesado: "e-book" en la tarjeta Digital resuelve el caso que la palabra "Concepto" perdía.

### 3. Que la elección cambie la pantalla

Al elegir, cambiá el texto del uploader, el placeholder de los campos y el copy de ayuda. Confirma visualmente que el sistema entendió, y hace obvio el error antes de generar.

### 4. Resolver la "no selección" SIN tocar los tipos compartidos (el detalle que ahorra un día)

La tentación es hacer `mode` **nullable a nivel global** (`FlowState.mode: Mode | null`). Eso propaga el `null` al contexto del flujo, a `createJob`, al worker, a las recetas y a cada `switch` del sistema — mucho riesgo, mismo beneficio.

**En su lugar:** el `null` vive **solo en el estado local de esa pantalla**. El tipo compartido sigue siendo `Mode` requerido; el handler valida y recién ahí escribe. En FreshAdFlow eso dejó el cambio en **un solo archivo** (`crear/page.tsx`, +117/-34), `tsc` verde y sin ripple.

> Regla general: **un estado transitorio de UI no debe ascender al tipo del dominio.** Si algo es "todavía no elegido" solo mientras la pantalla está abierta, no es parte del modelo.

### 5. Verificar E2E antes de declararlo

Que las tarjetas rendericen, que **no** haya preselección, que bloquee sin elegir, y que al elegir cambien los textos. Si la ruta está detrás de auth, ver [[verificar-ui-detras-de-auth-en-local]].

## Gotchas

- **Un default no es neutral:** es tu apuesta sobre el usuario, y cuando falla, falla caro. Si la opción equivocada produce un output destructivo, no puede venir marcada.
- **No pongas la explicación en un tooltip ni detrás de un "?".** Nadie lo abre. Va en la tarjeta.
- **Renombrar la opción es parte del fix**, no cosmético: la palabra es la interfaz.
- Esto **no es una feature nueva** — es quitar el obstáculo que frena la compra. Cuenta distinto en un backlog congelado por "no construir features hasta la primera venta".
- Si el sistema ya tiene datos con la elección equivocada, sumá una **red en el motor** (guards) además de la UI: la UI arregla a los que vienen, no a los que ya eligieron.

## Ejemplo (input -> output)

- **Input:** "las usuarias eligen el modo equivocado y salen anuncios malos".
- **Output:** selector de 3 tarjetas con descripción + ejemplos, ninguna preseleccionada, validado antes de avanzar, "Concepto" renombrado a "Digital". Un archivo tocado, shippeado el mismo día.

## Relacionadas

[[causa-raiz-mala-calidad-ia-esta-en-el-input]] · [[embudo-activacion-saas]] · [[verificar-ui-detras-de-auth-en-local]] · [[ui-distintiva-no-ai-default]]
