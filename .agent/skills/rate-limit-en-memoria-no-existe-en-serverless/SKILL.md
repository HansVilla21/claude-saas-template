# Skill: El rate limit en memoria no existe en serverless

## Cuándo usar esta skill

- Vas a poner un **rate limit** en un endpoint público: formulario de contacto, solicitud, login,
  reenvío de código, cualquier cosa que dispare un email o un SMS.
- Ya hay uno implementado con un `Map` o un objeto en memoria del módulo.
- Estás por marcar "rate limiting" como hecho en una auditoría de seguridad.
- El endpoint público es la **única** defensa de una ruta que a propósito no pide sesión.

**Costo de no usarla:** en Grandir CRM el rate limit de `POST /api/applications` era un `Map` en
memoria. En Vercel eso es **decorativo**: cada invocación puede correr en una instancia distinta.
El formulario público quedó sin control real, y en el checklist figuraba como resuelto — que es
peor, porque nadie lo vuelve a mirar.

---

## Por qué existe esta skill

**En serverless no hay "el proceso".** Cada request puede caer en una instancia nueva, fría, con
la memoria vacía. Un contador guardado en el módulo:

```ts
// ❌ no cuenta nada en producción
const intentos = new Map<string, number[]>()
```

...se resetea cuando la plataforma decide, sin avisar. Y escala **al revés** de lo que necesitás:
cuanto más tráfico —o sea, cuanto más te están abusando— más instancias hay, y menos ve cada una.

Lo que lo hace peligroso no es que falle: es que **funciona perfecto en local**, donde hay un solo
proceso vivo. Lo probás, te frena al sexto intento, y lo das por hecho.

> Este es el mismo patrón que `verificar-funcionamiento-end-to-end` describe: el control existe,
> parece funcionar, y no está protegiendo nada. La diferencia entre un control y un adorno es
> dónde vive el estado.

---

## Proceso

### 1. El estado del límite vive fuera del proceso

Tres opciones, de menos a más infraestructura:

**a) Una tabla en la base que ya tenés** — cero servicios nuevos, y suele alcanzar:

```sql
create table rate_limits (
  clave       text        not null,          -- ip, email, o ip+ruta
  ventana     timestamptz not null,          -- inicio de la ventana
  intentos    int         not null default 1,
  primary key (clave, ventana)
);
create index on rate_limits (ventana);        -- para la limpieza
```

```ts
const ventana = new Date(Math.floor(Date.now() / 60000) * 60000)   // ventana de 1 min
const { data } = await db.rpc("registrar_intento", { p_clave: clave, p_ventana: ventana })
if (data.intentos > LIMITE) return new Response("Demasiados intentos", { status: 429 })
```

El incremento va en una función atómica (`insert … on conflict do update set intentos = intentos + 1
returning intentos`), no en un read-modify-write desde la app — si no, dos requests simultáneos
leen lo mismo y el límite se escapa.

**b) Redis / Upstash** — si ya lo tenés o el volumen lo justifica. `INCR` + `EXPIRE`, atómico.

**c) La del proveedor** — si tu plataforma o WAF lo ofrece a nivel de ruta, es lo más barato.

### 2. Elegir la clave con cuidado

- **Solo IP** castiga oficinas y redes móviles con NAT.
- **Solo email** deja pasar a quien varía el email.
- Para formularios públicos: **IP + ruta** para el abuso masivo, y **email** para el reenvío de
  códigos. Dos límites distintos, no uno.

Y anclá de dónde sale la IP: en Vercel es el header que pone la plataforma, no `remoteAddress`.

### 3. Limpiar las ventanas viejas

Una fila por clave y por ventana crece rápido. Un borrado de `ventana < now() - interval '1 day'`
en el cron diario alcanza. Sin limpieza, la tabla del rate limit termina siendo más grande que la
de datos.

### 4. Probarlo donde importa: en producción, no en local

En local **siempre** va a funcionar. La prueba real es contra el deploy:

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " -X POST https://tu-app/api/applications \
    -H "content-type: application/json" -d '{"email":"prueba@ejemplo.com"}'
done; echo
# esperado: 200 200 200 200 200 429 429 429 …
```

Si ves doce `200`, no hay límite. Repetilo unos minutos después para confirmar que la ventana
**expira** (un límite que no libera es un bloqueo permanente esperando a un cliente real).

### 5. Si decidís no arreglarlo ahora, que quede dicho

A veces el volumen no lo justifica todavía. Está bien — pero entonces **no figura como resuelto**.
Va al backlog con el riesgo escrito: *"el formulario público no tiene rate limit efectivo; el
`Map` no persiste entre invocaciones"*. Un ítem marcado como hecho nadie lo vuelve a mirar.

---

## Output esperado

- El estado del límite fuera del proceso (tabla, Redis o el WAF).
- Incremento **atómico**, no read-modify-write.
- Claves pensadas (IP para masivo, email para reenvíos), con la IP tomada del header correcto.
- Limpieza de ventanas viejas.
- Probado **contra producción**, incluyendo que la ventana expire.

---

## Gotchas / antipatrones

- 🔴 **`Map` / objeto de módulo como rate limit.** En serverless no cuenta nada.
- 🔴 **Marcarlo como hecho porque frena en local.** Es el modo de fallo de esta skill.
- ⚠️ **Read-modify-write desde la app.** Dos requests a la vez leen el mismo valor y el límite se
  escapa justo bajo la carga que te importa.
- ⚠️ **Solo IP.** Bloquea oficinas enteras; y un atacante rota IPs más fácil que emails.
- ⚠️ **`remoteAddress` detrás de un proxy.** Vas a limitar al edge de la plataforma, no al visitante.
- ⚠️ **Ventana que no expira.** Un cliente real queda bloqueado sin forma de salir.
- ⚠️ **Rate limit sin límite de tamaño del cuerpo.** Diez requests con 10 MB también son un ataque.

---

## Ejemplo concreto (Grandir CRM)

`POST /api/applications` —el formulario público de solicitud, sin sesión por diseño— tenía su
rate limit en un `Map` en memoria. En Vercel no persiste entre invocaciones serverless, así que
en producción el endpoint estaba **sin control efectivo**, mientras el checklist lo daba por
resuelto.

Quedó anotado en los learnings del proyecto con el arreglo nombrado (Redis o una tabla de Supabase
con `expires_at`) en vez de tacharlo de la lista.

---

## Skills relacionadas

- `service-role-con-cookies-fuga-de-pii` — las rutas públicas necesitan **su propio** control; el
  rate limit suele ser ese control.
- `verificar-funcionamiento-end-to-end` — el control que parece funcionar y no protege nada.
- `programar-envios-cron-vercel` — dónde colgar la limpieza de las ventanas viejas.
