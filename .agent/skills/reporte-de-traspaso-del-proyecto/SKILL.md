# Skill: Reporte de traspaso — entregar un sistema sin que muera contigo

## Cuándo usar esta skill

- El proyecto pasa a **otra persona**: un PM, otro dev, el equipo interno del cliente, o tu yo de
  dentro de seis meses.
- Termina la etapa de construcción y arranca **soporte** (o se cierra el contrato).
- El cliente pregunta *"¿qué pasa si mañana no estás?"* — que es la pregunta correcta y hay que
  poder contestarla con un link.
- Vas a cotizar mantenimiento: sin este documento no sabés qué estás manteniendo.
- **Antes** de que aparezca la urgencia. Un traspaso escrito con el proyecto ya frío pierde
  justo la mitad que importa: **por qué** las cosas son así.

**Costo de no usarla:** el conocimiento que hace funcionar el sistema vive en la cabeza de quien
lo construyó y en el historial de un chat. La cuenta de Vercel es del cliente pero la llave de
la API es tuya; el deploy tiene un truco que no está escrito; hay una integración que solo
funciona si alguien renueva un token. Nada de eso está en el código.

---

## Por qué existe esta skill

Un repo **no** es un traspaso. El código dice **qué** hace el sistema. Un traspaso tiene que
contestar tres cosas más, y ninguna está en el código:

1. **De quién es cada cosa.** Cuentas, dominios, llaves, tokens: quién es el dueño, quién paga,
   qué se vence y cuándo. Es lo primero que se rompe y lo último que alguien documenta.
2. **Por qué está así.** Las decisiones con su motivo — sobre todo las raras. Sin el porqué, el
   que llega "arregla" algo que era a propósito.
3. **Qué está pendiente y de quién depende.** Separando lo tuyo de lo que espera al cliente. Si
   no lo separás, todo lo pendiente parece deuda tuya.

Y hay una razón práctica: **escribirlo encuentra bugs.** Enumerar las pantallas obliga a mirarlas
de verdad. En el CRM de Josué el inventario destapó una matriz de permisos rota y un `.env.example`
desactualizado que nadie había notado.

---

## Proceso

### 1. Escribilo con el proyecto caliente

El mejor momento es la última sesión de construcción, no la primera de soporte.

### 2. Las 13 secciones (probadas en un CRM real de 3 apps)

```
 0. Resumen ejecutivo         qué es, en qué estado, qué falta. Media página.
 1. Historia de construcción  cronología: qué se construyó cuándo y POR QUÉ.
 2. Las apps del repo         cuántas, dónde vive cada una, cómo se despliega cada una.
 3. Pantallas                 TODAS, con qué rol ve cada una.
 4. Endpoints API             ruta, quién la llama, cómo se autentica.
 5. Modelo de datos           tablas, convención de RLS, vistas, funciones, storage.
 6. Auth, roles y permisos    los roles y qué puede hacer cada uno.
 7. Integraciones externas    qué está conectado, con qué cuenta, qué se vence.
 8. Accesos e identificadores ⭐ el más valioso: DE QUIÉN es cada cuenta.
 9. Variables de entorno      + scripts, y qué hace cada uno.
10. Cómo se trabaja           el runbook: deploy, migraciones, gotchas operativos.
11. Skills capturadas         el conocimiento reusable que salió de este proyecto.
12. Pendientes                partidos en: bloqueados por el CLIENTE / técnicos / comerciales.
13. Links de referencia       paneles, dominios, repos, tableros.
```

### 3. La sección 8 es la que salva el proyecto

Por cada cuenta: **quién es el dueño · quién paga · qué llave/token vive ahí · cuándo vence ·
qué se rompe si se cae.** Vercel, Supabase, GitHub, DNS, Google Cloud, Meta, el proveedor de
correo, el de IA, el de WhatsApp.

> 🔴 **Sin secretos en el documento.** Van los **nombres** de las variables y **dónde viven**
> (`Vercel → Settings → Environment Variables, solo Production`), nunca los valores. Este
> documento se comparte por WhatsApp y termina en un Drive.

Marcá explícitamente lo que **vence**: tokens de larga duración, refresh tokens de OAuth,
certificados. Un token que se vence un martes cualquiera es cómo mueren los sistemas entregados.

### 4. Partí los pendientes por dueño

```
Bloqueados por el CLIENTE   → necesitan que él haga algo (pasar una cuenta, dar una key,
                              confirmar un dato, probar algo). Con nombre y apellido.
Técnicos / operativos       → deuda real tuya o del que siga.
Comerciales                 → lo que hay que cotizar aparte, con el motivo.
```

Sin esta partición, una lista de 20 pendientes se lee como 20 cosas que quedaste debiendo.

### 5. Los gotchas operativos van SÍ o SÍ

Lo que no se deduce mirando el repo:

- cómo se deploya de verdad (¿`git push` deploya? casi nunca en cuenta de cliente)
- migraciones: cómo se corren, contra qué base, si hay staging (y si **no** hay, decirlo)
- las trampas conocidas — cada una con su síntoma, para que se reconozca cuando aparezca
- qué NO tocar y por qué

### 6. Dos versiones, dos lectores

- **Markdown en `outputs/`** — para el PM / el dev. Completo.
- **HTML autocontenido** — para el cliente, que lo abre en el celular. Mismo contenido, sin jerga.

### 7. Al final: qué se lleva el template

Sección 11: las skills capturadas. El traspaso es el último momento en que tenés el proyecto
entero en la cabeza — es cuando mejor se ve qué de esto sirve para el próximo proyecto.

---

## Output esperado

- `outputs/reporte-<proyecto>-offboarding.md` con las 13 secciones.
- (Opcional) la versión HTML para el cliente.
- Cero secretos; solo nombres de variables y ubicaciones.
- Pendientes partidos por dueño.
- Las skills nuevas del proyecto, capturadas y listadas.

---

## Gotchas / antipatrones

- 🔴 **Pegar valores de variables de entorno.** El documento circula. Nombres y ubicaciones.
- 🔴 **Escribirlo de memoria.** Igual que el manual de usuario: se lee el repo. Un traspaso que
  miente es peor que ninguno, porque el que llega le cree.
- 🔴 **Dejarlo para cuando el proyecto ya se enfrió.** El *por qué* se evapora antes que el *qué*.
- ⚠️ **Un solo bloque de "pendientes".** Se lee como deuda tuya.
- ⚠️ **Omitir lo incómodo** (una cuenta en un plan que no corresponde, un riesgo de términos de
  servicio, deuda técnica conocida). Va escrito, con su costo y su riesgo, para que el cliente
  decida. Callarlo lo vuelve tuyo.
- ⚠️ **Confundirlo con el manual de usuario.** Son dos documentos y dos lectores: el manual es
  para **usar** el sistema (y va dentro del producto); el traspaso es para **mantenerlo**.
- ⚠️ **Que quede como un deliverable suelto.** Si el proyecto sigue vivo, se actualiza. Si no,
  lleva fecha grande arriba: *"estado al AAAA-MM-DD"*.

---

## Ejemplo concreto (CRM Josué R. Miranda, 2026-08-17)

**Input:** entra un PM al proyecto; hay que pasarle un CRM de 3 apps en un mismo repo (CRM +
landings + web de marca), 6 roles, 35 migraciones y 6 integraciones externas.

**Output:** `outputs/reporte-crm-offboarding-completo.md` — las 13 secciones, incluyendo el
detalle de las 3 apps y sus **tres formas distintas de deployar**, la convención de RLS, quién es
dueño de cada cuenta (la de Vercel es de Josué, la de Meta era de Hans y hay que pasarla), y los
pendientes partidos en *bloqueados por Josué* / *técnico* / *comercial*.

**Lo que destapó el proceso:** el `.env.example` estaba desactualizado y la matriz de permisos de
`/team` se leía en diagonal. Documentar obliga a mirar.

---

## Skills relacionadas

- `manual-de-ayuda-dentro-del-producto` — el documento hermano, para quien **usa** el sistema.
- `trabajar-en-la-cuenta-del-cliente` — de dónde sale la mitad de la sección 8.
- `creador-de-skills` — cómo se capturan las skills de la sección 11.
- `onboarding-cliente-crm` — el otro extremo del ciclo.
