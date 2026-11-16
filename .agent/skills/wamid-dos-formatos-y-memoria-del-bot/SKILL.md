# Skill: Mensaje borrado o editado en WhatsApp — que el CRM lo encuentre y que el bot lo olvide

El pedido que la originó (2026-09-25, un cliente del CRM vía el socio comercial):
alguien del negocio le manda a una clienta un mensaje sobre OTRO procedimiento, se
da cuenta y lo borra en WhatsApp Web. *"Pero si en el CRM queda y el bot agarra
esa conversación, va a usar ese mensaje de error como parte de su contexto."*

Parecía un botón nuevo. Eran **dos fallas silenciosas** en un camino que ya existía,
y ninguna daba error:

1. **El CRM no encontraba el mensaje borrado.** Meta nombra al MISMO mensaje con
   dos wamid distintos. 18 borrados del negocio quedaron en
   `revoke_target_not_found` y el CRM los siguió mostrando como si nada.
2. **Aun cuando lo encontraba, el bot no se enteraba.** El CRM marcaba "Mensaje
   eliminado", pero el bot no lee la tabla de mensajes: lee su propia memoria
   (`n8n_chat_histories`), y ahí el mensaje seguía. *Parece resuelto y no lo está.*

## Cuándo usar esta skill

- Un CRM o inbox sobre la API de WhatsApp (Meta Cloud API o un BSP como YCloud)
  con un bot que tiene memoria propia.
- Alguien pide "borrar" o "editar" un mensaje, o que el bot "olvide" algo.
- Un webhook de `revoke`/`edit` reporta `target_not_found` y nadie lo miró.
- Cualquier cambio a la tabla de mensajes que el bot debería notar: si su memoria
  es otra tabla, el cambio no le llega.

## Proceso

### 1. Antes de construir un botón: ¿la API lo permite?

**No.** Ni la Cloud API de Meta ni los BSP permiten borrar ("eliminar para todos")
ni editar un mensaje ya enviado (verificado en la documentación de Meta y del BSP,
2026-09). Un botón en el CRM solo lo escondería de TU lado: el cliente lo sigue
viendo. Se le dice así al founder y se descarta, o se construye con otro nombre
("que el bot lo ignore") y avisando en pantalla que el cliente lo sigue viendo.

**El camino real es el revés:** el negocio borra o edita en la app o en WhatsApp
Web, y Meta avisa. Con coexistencia, un mensaje enviado DESDE EL CRM también
aparece en el WhatsApp del negocio y se puede borrar ahí.

### 2. Contar los eventos antes de tocar nada

```sql
select event_type,
  case when jsonb_path_exists(raw_payload, '$.** ? (@.type == "revoke")') then 'revoke'
       when jsonb_path_exists(raw_payload, '$.** ? (@.type == "edit")')   then 'edit' end as tipo,
  count(*), count(*) filter (where processing_error is not null) as con_error
from webhook_events_raw
where jsonb_path_exists(raw_payload, '$.** ? (@.type == "revoke" || @.type == "edit")')
group by 1, 2;
```

Llegan por DOS caminos: el del lead (`inbound_message.received`) y el del negocio
desde su celular (`smb.message.echoes`). Medido: 68 + 36 borrados, 47 + 45
ediciones. Y mirá los errores agrupados: 23 de los 36 borrados del negocio tenían
error. Ese número es la mitad de la skill.

### 3. El mismo mensaje, dos wamid: comparar por la clave

Decodificado (base64 después de `wamid.`), un wamid es:

```
1c 18 <largo> <quién>                15 .. 00 11 18 <largo> <clave del mensaje> 00
       "50600000000"  (teléfono)                  "ABCDEF0123456789ABCD"
       "CR.1000000000000000" (id de usuario)      "ABCDEF0123456789ABCD"
```

```
guardado  wamid.HBgLNTA2MDAwMDAwMDAVAgARGBRBQkNERUYwMTIzNDU2Nzg5QUJDRAA=
en revoke wamid.HBgTQ1IuMTAwMDAwMDAwMDAwMDAwMBUUABEYFEFCQ0RFRjAxMjM0NTY3ODlBQkNEAA==
```

(Ejemplos sintéticos.) Cambia cómo se nombra a la persona —por teléfono o por su
id de usuario de WhatsApp— y **la clave del mensaje es idéntica**. Desde
septiembre de 2026 Meta usa a veces una forma y a veces la otra. Por eso
comparar el texto del wamid falla, y comparar un pedazo del base64 también: la
clave queda en otra alineación de bytes.

```ts
export function claveDeWamid(wamid: string | null | undefined): string | null {
  if (typeof wamid !== "string" || !wamid.startsWith("wamid.")) return null;
  let b64 = wamid.slice(6).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  let bin: string;
  try { bin = atob(b64); } catch { return null; }
  let fin = bin.length;
  while (fin > 0 && bin.charCodeAt(fin - 1) === 0) fin--;
  for (let i = fin - 2; i >= 0; i--) {
    if (bin.charCodeAt(i) === 0x18 && i + 2 + bin.charCodeAt(i + 1) === fin) {
      const clave = bin.slice(i + 2, fin);
      return /^[\x21-\x7e]{8,}$/.test(clave) ? clave : null;
    }
  }
  return null;
}
```

**La clave es única dentro de un chat, no en todo WhatsApp:** se busca primero
por wamid exacto y, si no está, por clave **dentro de la conversación** (los
últimos ~500 mensajes alcanzan: WhatsApp deja borrar ~2 días después y editar 15
minutos). Nunca en toda la agencia.

### 4. Corregir la memoria del bot, no solo la tabla de mensajes

La memoria (el Postgres Chat Memory de LangChain) es `{ session_id, message: {
type, content } }`, **sin id del mensaje**. Se ubica por el texto:

- **Sesión** del chat (`+<lead>@+<negocio>`) y **rol**: `ai` si lo mandó el
  negocio, `human` si fue el lead.
- **De la fila más nueva a la más vieja.**
- **Solo como mensaje ENTERO:** desde el principio de una línea (o después de una
  marca de adjunto como `"[Foto] "`) hasta el final de una línea. Si no, borrar
  un "si" le come el principio a "sistema". Este es el control negativo que
  tiene que tener la prueba.
- **Una fila puede tener varios mensajes** (el bot junta lo que el lead manda
  seguido): se saca solo esa línea, con UN salto de línea.
- **Borrado:** si la fila queda vacía o solo con la marca (`"[Foto]"`), se borra
  la fila.
- **Edición del negocio:** se reescribe el texto y se conserva la marca. La
  edición del LEAD no se toca si el motor ya recibe la versión nueva con el
  aviso "esta reemplaza a la anterior".
- **Reentregas:** si el borrado ya estaba aplicado (`revoked_at` puesto), NO se
  vuelve a buscar el texto. Si no, la segunda copia del evento se lleva OTRO
  mensaje igual ("ok").
- **Best-effort:** nunca rompe el webhook. Devuelve qué pasó (`borrado`,
  `reescrito`, `no_estaba`, `sin_texto`) y queda en el evento.

### 5. Simular contra la base real antes de subir

Un script que importa las MISMAS funciones puras y corre sobre los eventos que
fallaron, **solo leyendo**. Medido: 18 de 18 borrados perdidos encontrados, 16
todavía en la memoria del bot. Es la prueba de que la clave funciona con datos
reales, no con el ejemplo de la prueba unitaria.

### 6. Corregir lo que ya pasó, conservador

- Marcar los borrados perdidos con la **hora real del borrado** (la del evento),
  no la de ahora.
- Sacar de la memoria lo ya borrado **solo si el texto aparece UNA vez** como
  mensaje entero en esa sesión. Si hay dos "ok", no se adivina: se saltea y se
  reporta. Medido: 46 corregidos y 6 salteados.
- Correrlo dos veces: la segunda tiene que dar 0 cambios.
- Verificarlo con el caso real que originó el pedido: eliminado en el CRM **y**
  fuera de la memoria. Una sola de las dos no alcanza: la falla original era
  justo que pasaba la primera y no la segunda.

### 7. Deploy del webhook

Es una Edge Function: **mergear no la despliega**. Se despliega desde el disco
con la verificación de JWT apagada (es un webhook público con firma propia), y se
confirma `verify_jwt=false` antes y después. Si no, el BSP deja de entrar para
TODOS los clientes. La versión se sube en el mismo commit, y el health check dice
cuál quedó viva.

## Output esperado

- `clave-wamid.ts` y `memoria-sin-mensaje.ts`: funciones puras con pruebas y
  controles negativos (otro mensaje del mismo chat NO coincide; "si" no toca
  "sistema").
- El webhook: búsqueda exacta → por clave en la conversación; corrección de la
  memoria en borrados y en ediciones del negocio.
- La corrección de datos, simulada primero y aplicada después, más un ticket para
  verificar el primer borrado real en vivo.
- Novedad para el cliente, contada desde lo que quiere: *"¿Mandaste un mensaje
  por error y no querés que el chatbot lo use? Borralo desde WhatsApp con
  'Eliminar para todos'"*.

## Ejemplo

**Input:** "Si borran un mensaje en WhatsApp Web, el bot lo sigue usando. ¿Se puede
borrar desde el CRM?"

**Output:**
1. **Desde el CRM no:** la API no lo permite y el cliente lo seguiría viendo. Desde
   la app o Web sí, y Meta avisa.
2. **Conteo:** 36 borrados del negocio, 23 con `revoke_target_not_found`.
3. **Causa:** el mismo mensaje con dos wamid, por teléfono o por id de usuario,
   con la misma clave.
4. **Arreglo:** búsqueda por clave dentro del chat, y la memoria del bot corregida
   por texto y rol, solo como mensaje entero.
5. **Simulación:** 18/18 encontrados y 16 en memoria. Corrección de datos: 18
   marcados, 46 fuera de la memoria y 6 salteados por texto repetido.
