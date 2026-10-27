# Skill: Conectar la cuenta que el cliente eligió, no todas las que administra

> Nació el 2026-09-24 en el CRM de Momentum, conectando Instagram y Messenger.
> El botón funcionó a la primera: el founder autorizó con su cuenta de Meta y el
> sistema conectó **todas** las páginas que la API devolvió. Eran 9 páginas y 7
> cuentas de Instagram — **16 canales** — de cuatro clientes distintos, todas
> metidas en la agencia de pruebas y todas suscritas al webhook del CRM. Desde
> ese momento, un mensaje a la página de cualquiera de esos clientes habría
> entrado en el negocio equivocado. Nadie escribió en esos minutos (medido: 0
> mensajes, 0 conversaciones, 0 contactos), así que la única consecuencia fue el
> susto y el rescate.

## Cuándo usar esta skill

- Vas a conectar una cuenta de un proveedor por OAuth: Meta (páginas, Instagram,
  cuentas publicitarias), Google (propiedades de Analytics, calendarios,
  canales), Shopify, Slack, HubSpot, Stripe Connect.
- La respuesta del proveedor es una LISTA (`/me/accounts`, `/properties`,
  `/channels`) y tu código hace `for` sobre ella.
- Tu producto es multi-tenant: lo que conectás queda colgando de UN negocio.

## El error de fondo

Quien autoriza casi nunca administra una sola cuenta. Un dueño tiene su página y
la personal; una agencia tiene las de todos sus clientes; un contador, las de
media ciudad. **La lista que devuelve el proveedor no es "las cuentas de este
negocio": es "todo lo que esta persona administra".**

Conectarlas todas es tentador porque parece servicial —"así no tiene que
elegir"— y porque en la cuenta del desarrollador suele haber una sola, así que
en la prueba no se nota. Se nota el día que lo usa alguien con varias, y para
entonces ya hay datos de un cliente dentro de otro.

Tres cosas empeoran el caso:

1. **La suscripción al webhook es un efecto de verdad**, no una fila en tu base:
   el proveedor empieza a mandarte eventos de cuentas ajenas.
2. **Es silencioso.** Nadie recibe un error; simplemente aparecen canales de más
   en una pantalla que quizás nadie mira ese día.
3. **El daño crece con el tiempo**: cada minuto conectado es otra oportunidad de
   que entre un mensaje al tenant equivocado.

## El arreglo: dos pasos, y el segundo es del cliente

```
1. listar   → el servidor pide la lista y la devuelve SIN credenciales
2. conectar → el cliente elige UNA, y solo esa se guarda
```

```ts
// Paso 1 — solo lee. No toca la base, no guarda tokens.
export async function listarCuentas({ slug, accessToken }) {
  const ctx = await gateDelTenant(slug);            // el tenant sale del slug
  const cuentas = await proveedor.listar(accessToken);
  // La pantalla necesita elegir, no credenciales.
  return cuentas.map((c) => ({ id: c.id, nombre: c.nombre, extra: c.loQueAyudaAElegir }));
}

// Paso 2 — conecta UNA, y verifica que sea suya.
export async function conectarCuenta({ slug, accessToken, cuentaId }) {
  const ctx = await gateDelTenant(slug);
  // Pedir ESA cuenta al proveedor ES la verificación: si quien autorizó no la
  // administra, el proveedor no devuelve su credencial.
  const cuenta = await proveedor.leerUna(cuentaId, accessToken);
  …guardar credencial, suscribir webhook, crear la fila…
}
```

Detalles que hacen la diferencia:

- **Con una sola cuenta, no se pregunta.** Elegir entre una opción es fricción
  pura: se conecta sola.
- **El id de la cuenta viene del navegador, y está bien**, porque el paso 2 lo
  verifica contra el proveedor. Lo que NUNCA viene del navegador es el tenant.
- **Los tokens no salen del servidor**, ni siquiera en el paso de listar.
- El texto de la lista tiene que dejar elegir sin adivinar: nombre + lo que
  distingue (el usuario de Instagram vinculado, el dominio, el último uso).

## Verificación

- Probalo con una cuenta que administre **varias** (la del founder sirve; la del
  desarrollador casi nunca).
- Después de conectar, contá en la base: **una** cuenta conectada, no N.
- Mirá el lado del proveedor: ¿a cuántas cuentas quedó suscrita tu app? Es la
  parte que la base no te cuenta.

## Si ya pasó: cómo se revierte

En orden, porque el orden importa:

1. **Cortar el flujo primero:** desuscribir tu app de cada cuenta ajena. Mientras
   siga suscrita, siguen llegando eventos.
2. Borrar las filas y las credenciales guardadas.
3. **Medir el daño real** antes de dar el parte: ¿entró algún mensaje, contacto o
   registro por esas cuentas? Un rescate sin ese número no es un parte, es una
   promesa.

El script del rescate se escribe UNA vez y se guarda: lee las credenciales del
almacén cifrado, llama al proveedor y **no imprime tokens** — solo el id de la
cuenta y el resultado. Empezalo con un simulacro (sin `--aplicar`) que imprima
qué haría: el mismo script que revierte puede borrar de más.

## Anti-patrones

- **"Conecto todas y que después borre las que no quiera".** El borrado es
  trabajo del cliente y el daño ya ocurrió.
- **Probar solo con la cuenta del desarrollador.** Es la que tiene una sola
  cuenta: el bug es invisible ahí.
- **Guardar la credencial de cada cuenta "por si acaso".** Cada token guardado es
  una credencial que hay que custodiar y rotar.
- **Pedirle al cliente que elija DESPUÉS de conectar** ("desmarcá las que no
  son"). El default ya hizo el daño.
- **Un aviso en vez de una elección** ("vamos a conectar 9 cuentas, ¿seguimos?").
  Sirve solo si conectar de más fuera aceptable; si no lo es, la pregunta
  correcta es cuál.
