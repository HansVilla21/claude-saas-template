# Skill: Manual de ayuda DENTRO del producto (leído de las pantallas reales, no de memoria)

## Cuándo usar esta skill

- Vas a **entregar** un sistema a un cliente y su equipo tiene que usarlo sin vos al lado.
- El cliente pregunta lo mismo por WhatsApp cada semana ("¿dónde meto el presupuesto?",
  "¿esto qué hace?"). Cada pregunta repetida es una página del manual que no existe.
- Estás por escribir un PDF, un Loom o un Notion "de capacitación". **Pará y leé esto**: eso
  envejece el día que toques el sistema, y nadie lo abre.
- Vas a hacer **offboarding** o pasar el proyecto a un PM / a otro dev.
- Sumaste roles y ya no está claro quién ve qué.

**Costo de no usarla:** el manual externo (PDF/video) queda desactualizado en la primera semana y
el cliente vuelve a preguntarte a vos. El soporte "gratuito" nunca termina.

---

## Por qué existe esta skill

Dos ideas, y la segunda es la que casi nadie aplica:

**1. El manual vive dentro del producto.** Una ruta `/ayuda`, un enlace fijo en el menú. No es un
archivo que se manda por correo: es una pantalla más, que se despliega con el sistema y por lo
tanto se actualiza con el sistema.

**2. El contenido se LEE de las pantallas reales, no se escribe de memoria.** Esta es la parte
que decide si el manual sirve o miente. Si lo redactás recordando cómo era la pantalla, vas a
documentar botones que renombraste, vas a olvidar los que agregaste el mes pasado, y vas a
describir el flujo como lo diseñaste — no como quedó. **Un manual que miente es peor que no tener
manual**, porque el usuario deja de confiar en él después del primer error y no vuelve.

Y una tercera, estructural: **el contenido es dato tipado, no JSX.** El texto vive en
`lib/help/content/*.ts` como estructuras; el componente solo lo dibuja. Eso permite que un
buscador indexe todo, que el estilo sea consistente, y que actualizar una frase no sea tocar un
componente de React.

---

## Proceso

### 1. Inventariar las pantallas REALES (esta parte no se saltea)

Listá cada ruta del sistema y **leé el código de cada una** para extraer, factualmente:

- qué es la pantalla y para qué sirve
- **botón por botón**: nombre exacto en pantalla + qué hace exactamente al tocarlo
- qué roles la ven (el gate real, no el que creés)
- los estados vacíos y los mensajes de error que puede ver el usuario

Si son muchas pantallas, repartí el inventario entre varios lectores en paralelo, cada uno con un
grupo de rutas y con la instrucción explícita de **devolver inventario factual, no prosa**. En el
CRM de Josué fueron **19 pantallas** repartidas en 4 tandas.

> Regla dura: si un botón no lo viste en el código, **no va al manual**. Y si lo viste y no
> entendés qué hace, se investiga — no se adivina.

### 2. Modelar el contenido como dato

```ts
// lib/help/types.ts
export type HelpBlock =
  | { kind: "parrafo";      texto: string }
  | { kind: "pasos";        items: string[] }                             // se numeran
  | { kind: "lista";        items: string[] }
  | { kind: "botones";      items: { nombre: string; hace: string }[] }   // <-- el corazón
  | { kind: "definiciones"; items: { termino: string; que: string }[] }
  | { kind: "nota";         tono: "info" | "ojo" | "tip"; texto: string }

export type HelpArticle = {
  id: string; titulo: string; ruta?: string; quienLaVe?: string
  resumen: string                 // se ve cerrado y pesa en el buscador
  bloques: HelpBlock[]
  keywords?: string[]             // sinónimos que la gente TECLEA, no los que usás vos
}
```

El bloque `botones` es el que convierte el manual en algo que se usa: es lo que la persona busca
cuando está parada frente a la pantalla sin saber qué tocar.

### 3. Estructurar el manual

Siete partes que cubren a cualquier sistema de negocio:

1. **Primeros pasos** — entrar, el menú, cómo leer la pantalla principal.
2. **Glosario** — el vocabulario del sistema en cristiano (lead, etapa, fuente, colocación...).
3. **Los roles** — quién es quién y qué puede hacer cada uno.
4. **Operación del día a día** — las pantallas que se tocan todos los días.
5. **Adquisición** — de dónde entra el trabajo nuevo.
6. **Sistema / configuración** — lo que se toca de vez en cuando.
7. **Preguntas frecuentes** — literalmente las que ya te hizo el cliente.

### 4. Decidir: ¿uno para todos o uno por rol?

**Uno solo para todos**, con una nota arriba: *"según tu rol, algunas secciones quizá no te
aparezcan"*. Filtrar por rol suena prolijo y sale caro: duplica el mantenimiento, y cuando el
admin le explica algo a su asistente por teléfono, los dos tienen que estar viendo lo mismo.

### 5. La UI: buscador y todo cerrado

- **Todo cerrado por defecto** (acordeón). Un manual abierto de 24 artículos es un muro.
- **Buscador que ignora acentos** — normalizar a NFD y quitar el rango de marcas diacríticas
  combinantes (`U+0300`–`U+036F`) antes de comparar — y que filtra por **varias palabras con AND**.
  Los resultados **se auto-abren**.
- **El enlace de Ayuda lo ven TODOS los roles.** No pasa por la matriz de permisos del menú: si el
  gate del nav filtra la Ayuda, el rol que más la necesita es justo el que no la encuentra.
- **En mobile no hay sidebar** → un "?" en la barra superior. Si no, el manual no existe en el
  celular, que es donde la gente lo va a abrir.
- La ruta pide sesión (`requireAuth`) y nada más.

### 6. Verificarlo sin pedirle al cliente que lo pruebe

Montá una ruta temporal pública (bajo el grupo de rutas sin login), leé la página renderizada,
probá el buscador, y **borrala**. No mandes "probalo y decime".

---

## Output esperado

- Ruta `/ayuda` desplegada, enlazada desde el menú (todos los roles) y desde mobile.
- Contenido como dato tipado en `lib/help/content/*`, la UI solo dibuja.
- Cada pantalla documentada con: qué es · para qué · cómo se usa · **qué hace cada botón** · quién
  la ve.
- Buscador sin acentos, multi-palabra, resultados auto-abiertos.
- Verificado renderizando de verdad, no de memoria.

---

## Gotchas / antipatrones

- 🔴 **Escribirlo de memoria.** Es el modo por defecto y es el que produce un manual que miente.
  Se lee el código de cada pantalla, siempre.
- 🔴 **Meter la Ayuda en la matriz de permisos del menú.** El rol con menos permisos es el que más
  la necesita.
- 🔴 **PDF / video como entregable de capacitación.** Nace desactualizado y no se busca.
- ⚠️ **Hardcodear el texto en JSX.** Mantenerlo se vuelve refactor y el buscador no puede indexar.
- ⚠️ **Olvidar el mobile.** Sin sidebar, sin "?" → no hay ayuda.
- ⚠️ **Keywords en tu vocabulario y no en el del cliente.** El usuario teclea "presupuesto", no
  "fuente de adquisición". Las palabras que te pregunta por WhatsApp SON las keywords.
- ⚠️ **Que quede huérfano.** Cuando agregás una pantalla, el artículo va en el mismo commit.

---

## Ejemplo concreto (CRM Josué R. Miranda, 2026-08-17)

**Input:** Josué preguntando lo mismo cada semana por WhatsApp; su equipo (6 roles, gente no
técnica) por entrar al sistema.

**Proceso:** 19 pantallas leídas por 4 lectores en paralelo devolviendo inventario factual botón
por botón → contenido tipado en `lib/help/content/*` → `components/help/HelpManual.tsx`.

**Output:** `/ayuda` con **7 partes / 24 artículos** (primeros pasos · glosario · los 6 roles ·
Operación 5 pantallas + perfil + papelera + ficha de producto · Adquisición 5 · Sistema 7 ·
12 preguntas frecuentes). Enlace fijo al pie del sidebar para los 6 roles + "?" en mobile.
Verificado con una ruta temporal pública, después borrada. Commit `0184cc8`, EN VIVO.

**Efecto lateral que vale:** hacer el inventario destapó un bug real — la matriz "Permisos por
rol" de `/team` se leía **en diagonal** porque la grilla tenía `repeat(5,...)` y ya había 6 roles.
Documentar obliga a mirar, y mirar encuentra.

---

## Skills relacionadas

- `reporte-de-traspaso-del-proyecto` — el documento hermano, pero para el que va a MANTENER el
  sistema (no para el que lo usa).
- `onboarding-cliente-crm` — el momento en que este manual se entrega.
- `fuente-unica-derivar-de-hijos` — por qué la matriz de permisos derivada no se rompe sola.
