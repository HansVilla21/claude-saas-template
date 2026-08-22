# Skill: Conectar Meta Ads (oficial, sin App Review)

## Cuándo usar esta skill

- Un cliente quiere ver el **gasto de sus campañas** de Facebook/Instagram dentro de
  tu sistema.
- Aparece la palabra **Marketing API**, **Ads Manager** o **Meta Business**.
- Alguien dice *"conectemos Meta"* y te da miedo la revisión de Meta.
- Vas a mostrar **plata que viene de una API externa** (aunque no sea Meta: los
  gotchas 4 y 5 aplican igual).

> Capturada el 2026-07-16 del CRM de Josué R. Miranda, donde se construyó entera en
> una sesión. Cross-project: nada de lo que mata esto tiene que ver con ese cliente.

## Proceso

### 1. Contar ANTES de construir — y no confundir el conteo con su significado

`select source_id, count(*) from leads group by 1`

**El error más caro del día fue de interpretación, no de conteo.** Dio *0 leads de
Meta* y se concluyó "no construyas: nacería muerto". El conteo era correcto; la
conclusión, no. El cliente **sí tenía campañas activas** — o sea que el 0 significaba
**"las campañas existen y el sistema no se entera"**, que es justo lo que justifica
construir.

**Un conteo responde qué HAY, no qué SIGNIFICA.** Antes de concluir, preguntá.

### 2. Elegir el camino: NO es OAuth

Meta parte los permisos en dos, y la diferencia no es cosmética:

| | **Standard Access** | **Advanced Access** |
|---|---|---|
| Revisión de Meta | no | sí, semanas |
| Verificación de negocio | no | sí, documentos legales |
| **Quién puede autorizar** | **solo usuarios con rol en la app** | cualquiera |

Doc de Meta, textual: los permisos con acceso estándar *"solo se pueden solicitar a
usuarios de la app que tengan un rol en la app solicitante"*.

**Traducido: un cliente NO puede apretar "Conectar con Facebook".** Un botón que solo
funciona para gente que agregaste como developer no es un botón, es una trampa.

**El camino que sí funciona, y que escala sin trámites:**

> El cliente comparte su cuenta publicitaria con vos en Meta Business → **tu** token
> la lee → tu sistema la muestra.

**Probalo antes de creerlo.** Si ya administrás cuentas de terceros, tenés el
experimento montado: pedile el gasto a una cuenta de un negocio que no sea tuyo. En
Josué devolvió **$2.155,92 reales** con Standard Access puro.

### 3. Crear la app (5 min, sin trámites)

1. `developers.facebook.com/apps` → *Create App*
2. Caso de uso: **"Crear y administrar anuncios con la API de marketing"**.
   ⚠️ La de al lado se llama parecido y dice literal *"No incluye acceso a la API de
   marketing"*.
3. Elegir el portafolio de negocio.
4. **No publicar, no pedir revisión, no verificar el negocio, no ser Tech Provider.**

> **El cartel de "Conviértete en proveedor de tecnología"** dice que hace falta para
> *"acceder a los datos de otros negocios"*. **No aplica a este flujo** — aplica al
> de OAuth, el que no usás.

### 4. El token se PEGA, como una API key

Mismo patrón que la key de OpenAI: se pega en Configuración, **cifrado en la base**
(AES-256-GCM), en una columna fuera del alcance del cliente (GRANT por columna).

**Al sistema no le importa de dónde salió el token.** Lo guarda, lo valida y lee. Eso
te deja construir HOY con un token del Graph Explorer (2 horas) y decidir después el
definitivo, sin tocar código.

| Tipo | Dura |
|---|---|
| Graph API Explorer | 1–2 h — solo para probar |
| Largo de usuario | **60 días** |
| **De usuario de sistema** | **no vence** ← el que va a producción |

### 5. Validar ANTES de guardar, contra la API

Tres preguntas, en orden, y si alguna falla **no se guarda nada**:

1. `debug_token` → ¿es válido? ¿trae `ads_read`? **¿cuándo vence?**
2. `act_<id>` → ¿puede leer **esa** cuenta? ¿está activa? **¿en qué moneda y zona?**
3. recién ahí, cifrar y guardar.

Una conexión rota guardada es una tarjeta en verde que dice "conectado" y una
pantalla que revienta después, lejos de quien podía arreglarla.

### 6. Fijar la cuenta. Nunca listar.

El ID se pega a mano y se guarda. Se lee **esa y ninguna otra**.

## Output esperado

- `client.ts` (llamada cruda + códigos de error), `ads.ts` (conexión), `insights.ts`
  (campañas + gasto, **en vivo, sin guardar**), `formato.ts` (plata, en el server).
- Tarjeta en Configuración: token + ID de la cuenta, **con el vencimiento a la vista**.
- Pantalla de campañas que muestra **lo que Meta sabe** y **dice lo que no sabe**.
- Un test contra la API y la base reales, idempotente.
- Doc con **lo probado y lo NO probado separados**.
- **Probablemente cero migraciones:** si ya tenés una tabla de cuentas de integración
  (por otro proveedor), seguro ya tiene la forma.

## Gotchas (los que cuestan caro)

**1. ⚠️ El token vence y NO avisa.** Es el mismo animal que mata las apps de Google en
"Testing" a los 7 días: todo anda durante la demo y un martes cualquiera deja de
andar. Meta: 60 días para un token de usuario, y **90 días sin usar un permiso** →
hay que re-otorgarlo.
**La vacuna:** `debug_token` **te dice la fecha**. Guardala y mostrala en pantalla,
con alarma anticipada. *Un token que vence sin aviso es un bug; uno que vence con la
fecha en pantalla es un mantenimiento.*

**2. ⚠️ El gasto viene en la MONEDA DE LA CUENTA y no avisa.** Una cuenta en colones
devuelve `37912`. Con un `$` adelante eso dice *"gastaste $37.912"* cuando fueron
**~$74**. Leé `currency` de la cuenta al conectar, guardala, y **nunca asumas**.

**3. ⚠️ Los días se cortan en la ZONA DE LA CUENTA, no en la tuya.** La cuenta de
prueba estaba en `America/Los_Angeles` con el cliente en Costa Rica. Un "gasto de
hoy" con días locales **no cuadra con lo que el dueño ve en su Ads Manager**, y no
falla ruidosamente: **corre el número**. Usá `date_preset` (que Meta resuelve en la
zona de la cuenta) en vez de calcular fechas vos, y **decí en pantalla en qué zona
se cortan**.

**4. Un token ve VARIAS cuentas — fijá la tuya.** El de la prueba veía **5**, de
negocios distintos y de otras personas. Un sistema que "descubre" cuentas puede
mostrarle a un cliente **el gasto de un tercero**.
**El regalo:** listar (`/me/adaccounts`) exige `business_management`; leer una cuenta
que ya conocés solo necesita `ads_read`. **No listar te deja pedir menos permiso.**

**5. Si la API falla, TIRÁ. Nunca devuelvas 0.** Un *"gastaste $0"* es peor que un
error: parece un dato. Mismo bug que el `[]` de `freeBusy` de Google, que se leía
como "está todo libre".

**6. Meta manda todos los números como STRING.** `Number("")` da **0** — o sea que un
campo vacío se convierte solito en una mentira sobre plata. Que dé `NaN` y explote.

**7. 🔴 El gasto NO trae los leads. Ese es el hoyo, y hay que decirlo.** Meta te da la
mitad de arriba de la división. El *costo por lead* necesita que algo marque a un
lead como venido de Meta — y eso **no existe** hasta que lo construyas (webhook de
Lead Ads, o UTM en la landing).
**No muestres "Leads: 0" al lado del gasto.** Es técnicamente cierto y prácticamente
una mentira: le echa la culpa a las campañas de un agujero tuyo. **Decí qué falta y
por qué.** El campo `objective` de cada campaña dice cuál de las dos soluciones
aplica (`OUTCOME_LEADS` → formularios; el resto → landing), pero **informa, no decide
solo**: `OUTCOME_LEADS` también puede mandar a una landing.

**8. Lo que se guarda es solo lo que la API es dueña.** Si te tienta una tabla
`campaigns` con `spend` **y** `leads` **y** `conversion`: la mitad se deriva de tu
base y se va a desincronizar sin que nadie se entere. Guardá lo de Meta, derivá el
resto. Ver `.agent/skills/datos-reales-vs-seed-demo/`.

## Ejemplo

**Input:**
"El cliente quiere ver sus campañas de Meta y el costo por lead dentro del CRM."

**Output (lo que pasó en el CRM de Josué, 2026-07-16):**

- Se probó Standard Access contra una cuenta de un negocio ajeno → **leyó $2.155,92**
  → multi-negocio sin App Review, confirmado **con la API y no con un blog**.
- Se conectó la cuenta de prueba: **CRC**, zona **`America/Los_Angeles`**, 1 campaña,
  **₡37 912 · 15 178 impresiones · 510 clics** → costo por clic **₡74**.
- **El costo por LEAD no se construyó**, y esa fue la entrega más valiosa: hay 0 leads
  de Meta porque **no existe la cañería**, no porque las campañas fallen. La pantalla
  lo dice con todas las letras.
- **El vencimiento se disparó en la primera corrida** ("El token vence hoy") — el
  token del Explorer moría esa medianoche. La alarma funcionó antes de hacer falta.
- **4 tablas de agregados sembrados se tiraron** en el camino (42 números
  inventados). Una de ellas tenía **3 campañas de Meta falsas con nombres de
  productos REALES del cliente**: lo primero que habría aparecido al cablear la
  pantalla.
- **Un bug que solo aparece así:** el `replace` que limpia los espacios invisibles de
  `Intl` estaba escrito con **dos espacios normales** — invisiblemente idénticos, o
  sea un no-op que "se veía bien". Se cazó imprimiendo los code points, no mirando.
