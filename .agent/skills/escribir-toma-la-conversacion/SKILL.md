# Skill: Escribirle al cliente toma la conversación (y el bot se entera a tiempo)

## Cuándo usar esta skill

- Un bot y un equipo humano atienden **la misma conversación**, y el bot **sigue contestando** cuando alguien del equipo ya le escribió al cliente.
- La queja suena así: *"que el bot se dé cuenta cuando yo lo tomo y no responda"*.
- El equipo escribe desde el CRM **o desde la app de WhatsApp Business del teléfono** (modo coexistencia) y ninguna de las dos cosas le avisa al bot.
- Cuando le devuelven la conversación al bot, el bot **no sabe** lo que el equipo le dijo al cliente y pierde el hilo.

## Por qué existe esta skill

Capturada el **2026-09-15** en el CRM, por la queja de un cliente de fisioterapia. **Se midió antes de tocar nada**, y no era un error de uso:

- El equipo contestaba desde el CRM: **423 mensajes en 45 días**. Escribir **no cambiaba** `conversations.handler`, así que la conversación seguía siendo del bot.
- Un caso concreto: alguien del equipo le escribió a varias conversaciones; los clientes contestaron y **el bot les respondió encima, con 6 burbujas**. Unos 15 minutos después alguien apretó "Tomar" y el bot se calló.

El portón funcionaba. **Lo que faltaba era que escribir significara lo mismo que apretar el botón.** Y aparecieron dos problemas más al mirar de cerca: una carrera de tiempos dentro del turno del bot, y que la memoria del bot nunca veía lo que escribía el equipo.

Decisión del founder: **para todos los negocios**, no como opción por cliente.

## Proceso

### 1. Medir quién escribe y por dónde

```sql
select sender_kind, sent_via, (sender_user_id is not null) as con_usuario, count(*)
from public.messages
where direction = 'outbound'
  and created_at > now() - interval '45 days'
group by 1, 2, 3 order by 4 desc;
```

Ahí salen las puertas reales y, sobre todo, **qué más se guarda con la misma marca** que un mensaje de persona.

### 2. Definir "una persona escribió", con la trampa adentro

```
direction = 'outbound'
AND sender_kind = 'agent'
AND (sender_user_id IS NOT NULL      -- alguien del equipo, desde el CRM
     OR sent_via = 'coexistence')    -- desde el celular del negocio
```

⚠️ **`sender_kind = 'agent'` solo NO alcanza.** Los **seguimientos automáticos** también se guardan como `'agent'` (sin usuario y con `sent_via = 'api_crm'`). Si contaran, **cada seguimiento le quitaría la conversación al bot**. Las burbujas del bot son `'bot'` y los avisos de fuera de horario son `'system'`: esos ya no cuentan.

Si usás el trigger de "marcar el pase como atendido al primer mensaje del agente" de `bot-handoff-system-end-to-end`, revisá su predicado: usa `sender_kind = 'agent'` solo, y si tu sistema guarda los seguimientos como `'agent'`, **un seguimiento marca el pase como atendido** sin que nadie lo haya visto.

### 3. Un trigger en `messages`, no en la acción de enviar

Una persona le escribe al cliente por **tres puertas**: el composer de la bandeja, iniciar una conversación con plantilla, y el celular del negocio (que entra por el webhook). Arreglarlo en una deja las otras dos rotas, y la próxima pantalla que mande un mensaje sería la cuarta. **En la base pasan todas.**

```sql
create or replace function public.tg_mensaje_de_persona_toma_conversacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.conversation_id is null then
    return null;
  end if;

  update public.conversations c
     set handler = 'human',
         -- Si NADIE la tenía, queda asignada a quien escribió. Si ya tenía dueño, no cambia:
         -- escribir no es reasignar.
         assigned_user_id = coalesce(c.assigned_user_id, new.sender_user_id),
         assigned_set_by = case when c.assigned_user_id is null and new.sender_user_id is not null
                                then 'human' else c.assigned_set_by end,
         assigned_set_at = case when c.assigned_user_id is null and new.sender_user_id is not null
                                then now() else c.assigned_set_at end,
         assigned_set_by_user = case when c.assigned_user_id is null and new.sender_user_id is not null
                                     then new.sender_user_id else c.assigned_set_by_user end
   where c.id = new.conversation_id
     and c.handler is distinct from 'human';   -- si ya era de una persona, no toca nada

  return null;
end;
$$;

revoke all on function public.tg_mensaje_de_persona_toma_conversacion() from public, anon, authenticated;

drop trigger if exists mensaje_de_persona_toma_conversacion on public.messages;
create trigger mensaje_de_persona_toma_conversacion
after insert or update of sender_kind, sent_via, sender_user_id on public.messages
for each row
when (
  new.direction = 'outbound'
  and new.sender_kind = 'agent'
  and (new.sender_user_id is not null or new.sent_via = 'coexistence')
)
execute function public.tg_mensaje_de_persona_toma_conversacion();
```

Lo que no es obvio:

- **`UPDATE OF`, no solo `INSERT`.** En coexistencia, el aviso de estado del proveedor puede llegar **antes** que el eco del mensaje e insertar la fila como `'bot'`. El eco llega después y la corrige a `'agent'` + `'coexistence'`. Sin el `UPDATE OF`, esa corrección no toma la conversación (ver `estado-antes-que-mensaje`).
- **La marca de asignación es la misma que usa el botón "Tomar"** (`assigned_set_by = 'human'` + quién). Es la que hace que el aviso de "Te asignaron una conversación" **no le llegue a quien se la tomó sola**. Con otra marca, cada persona que escribe recibe una notificación de sí misma.
- **El `when` del trigger filtra antes de entrar a la función**: los mensajes del bot, que son la mayoría, no pagan ni la llamada.
- **SECURITY DEFINER con EXECUTE revocado**, incluido `public` (`revocar-execute-incluye-public`). Una función de trigger no se llama sola, pero se cierra igual.
- **Devolver la conversación al bot sigue siendo explícito** (el botón). Escribir toma; nunca devuelve.

### 4. La carrera: mirar los portones otra vez, después de esperar y después de pensar

El trigger resuelve "escribí y el bot contesta el mensaje siguiente". **No resuelve el turno que ya estaba en curso.** El turno del bot:

```
t=0      llega el mensaje del cliente → portones: ¿es del bot?  SÍ
t=0-45s  espera para juntar lo que el cliente manda seguido
         ← acá alguien del equipo escribe: handler = 'human'
t=45s+   el modelo piensa (segundos)
         ← o acá
t=fin    manda las burbujas  ← encima de lo que escribió la persona
```

Los portones se miraron **más de un minuto antes** de mandar. Hay que mirarlos **dos veces más**, y cada vez cuesta una lectura:

```ts
// (a) Después de la espera del lote, antes de gastar en el modelo.
const otraVez = await sigueSiendoDelBot();
if (!otraVez.contesta) return soltarTurno(otraVez.motivo, 'tomada_durante_la_espera');

// ... historial, prompt, modelo ...

// (b) Después del modelo, ANTES de aplicar decisiones, escribir memoria o mandar.
const sigue = await sigueSiendoDelBot();
if (!sigue.contesta) {
  return soltarTurno(sigue.motivo, 'tomada_mientras_pensaba', {
    uso: r.uso,                     // el modelo ya se pagó: el costo se anota igual
    metadata: { herramientas: r.herramientas },
  });
}
```

`sigueSiendoDelBot` vuelve a cargar el contexto **de la base** y corre **los mismos portones** del arranque (bot del negocio prendido, bot del contacto prendido, `handler`, pausa). Un turno de prueba (el playground) siempre contesta.

**En (b) el turno tampoco aplica decisiones.** Si la conversación ya la tiene una persona, el bot no mueve la etapa del cliente, no la pasa a una persona (ya la tiene alguien) y no le escribe encima.

### 5. Soltar el turno sin perder lo que dijo el cliente

```ts
const soltarTurno = async (motivo, branch, extra = {}) => {
  // Lo que dijo el cliente SÍ va a la memoria: el webhook no lo escribió porque, al
  // llegar el mensaje, la conversación era del bot. Y el bot ya no lo va a hacer.
  const { error } = await admin.from('n8n_chat_histories')
    .insert(filasDeIntercambio(sesion, textoDelTurno, ''));
  if (error) console.error('[bot] NO se pudo escribir la memoria', traceId, error.message);

  await cerrar('skipped', { ...extra, motivo, metadata: { ...(extra.metadata ?? {}), branch } });
  return { estado: 'skipped', motivo, burbujas: [], acciones: [], traceId };
};
```

- **`skipped` con motivo y rama con nombre**, no un `return` mudo. "No contestó porque alguien la tomó" tiene que poder distinguirse de "está roto" (`distinguir-detenido-a-proposito-de-roto`). Las dos ramas (`tomada_durante_la_espera`, `tomada_mientras_pensaba`) además dicen **en qué momento** se tomó.
- **El texto del cliente a la memoria, con la respuesta vacía.** Es el hueco que deja el reparto de quién escribe la memoria: el webhook escribe lo del cliente **solo** cuando la conversación no es del bot, y el bot escribe el intercambio **cuando contesta**. Un turno soltado a mitad no cae en ninguno de los dos. Sin esto, cuando le devuelven la conversación, el bot no sabe qué preguntó el cliente.

### 6. Lo que escribe el equipo también entra a la memoria del bot

Sin esto, cuando le devuelven la conversación, el bot **retoma como si la persona nunca hubiera hablado**. La memoria solo recibía lo que decía el bot y el eco del celular (que el webhook ya escribía). Lo que el equipo manda desde el CRM (423 mensajes en 45 días en este caso) **el bot no lo veía nunca**.

```ts
/** Mensajes del negocio que el bot no escribió: una persona o un seguimiento. */
export function vaALaMemoriaDelBot(m: { sender_kind: string | null }): boolean {
  return m.sender_kind === 'agent';
}

/** La MISMA llave de sesión que usan el webhook y el motor: `<tel cliente>@<tel negocio>`. */
export function sesionDeMemoria(telefonoCliente: string, numeroNegocio: string): string {
  return `${telefonoCliente}@${numeroNegocio}`;
}

/** Cómo queda en la memoria. `null` si no aporta nada al hilo. */
export function textoParaLaMemoria(m: MensajeSaliente, transcripcion?: string | null): string | null {
  const cuerpo = (m.body ?? '').trim();
  const conPie = (marca: string) => (cuerpo ? `${marca} ${cuerpo}` : marca);
  switch (m.kind) {
    case 'text':     return cuerpo || null;
    case 'template': return cuerpo || (m.media_metadata?.template_name ? `[Plantilla ${m.media_metadata.template_name}]` : null);
    case 'audio':    return transcripcion?.trim() ? `[Nota de voz] ${transcripcion.trim()}` : '[Nota de voz]';
    case 'image':    return conPie('[Foto]');
    case 'video':    return conPie('[Video]');
    case 'document': return conPie(m.media_metadata?.filename ? `[Documento ${m.media_metadata.filename}]` : '[Documento]');
    default:         return cuerpo || null;
  }
}
```

Y en el camino de entrega, **después** de que el mensaje salió:

```ts
async function anotarEnLaMemoriaDelBot(msg: MsgRow, sesion: string): Promise<void> {
  if (!vaALaMemoriaDelBot(msg)) return;
  const escribir = async (transcripcion: string | null) => {
    const texto = textoParaLaMemoria(msg, transcripcion);
    if (!texto) return;
    const { error } = await admin.from('n8n_chat_histories').insert(filasDeIntercambio(sesion, '', texto));
    if (error) console.error('[memoria] no se pudo anotar el mensaje del equipo', msg.id, error.message);
  };

  if (msg.kind !== 'audio' || !msg.media_url) return escribir(null);

  // La nota de voz se transcribe DESPUÉS de responder: quien la mandó no tiene
  // por qué esperar a Whisper para ver su audio enviado.
  const conTranscripcion = async () => {
    const t = await transcribirAudio({ mediaUrl: msg.media_url! });
    await escribir(t.ok ? t.texto : null);   // si falla, queda al menos "[Nota de voz]"
  };
  try {
    after(conTranscripcion);                  // next/server
  } catch {
    await conTranscripcion();                 // fuera de un request, se hace ya
  }
}
```

Decisiones:

- **Entra como `'ai'`** (el lado del negocio), igual que el eco del celular. Para el cliente, el bot y el equipo son **la misma voz**.
- **Los seguimientos automáticos también entran.** Si el cliente contesta *"sí, ya lo vi"* a un seguimiento, el bot tiene que saber qué le preguntaron. Por eso acá el predicado es `sender_kind = 'agent'` a secas, y en el trigger del paso 3 no: **tomar la conversación** y **recordar lo que se dijo** son preguntas distintas.
- **La misma llave de sesión y el mismo formato de fila** que el nodo de memoria de LangChain (`n8n-langchain-agent-postgres-memory`). Si un negocio vuelve al flujo viejo, tiene que poder leer esta memoria sin perder el hilo.
- **Fotos, videos y documentos entran como texto** (`[Foto]`, `[Documento estudio.pdf]`), con el pie si lo tienen. El bot no ve la foto que mandó el equipo, pero sabe que se mandó.
- **No se duplica el eco del celular**: ese ya lo escribe el webhook. Este camino es solo para lo que sale desde el CRM.
- **Best-effort**: el mensaje ya salió. Si la memoria falla, se loguea y listo.

## Cómo se verifica

**El trigger**, con el bloque que siempre aborta (`probar-migracion-contra-base-viva-con-rollback`), **antes y después** de aplicar la migración:

| Caso | Sin la migración (control) | Con la migración |
|---|---|---|
| una persona escribe desde el CRM | queda `bot` | `human` y asignada a quien escribió |
| un seguimiento automático | queda `bot` | **queda `bot`** |
| una burbuja del bot | queda `bot` | **queda `bot`** |
| eco del celular (coexistencia) | queda `bot` | `human` |
| la conversación ya tenía dueño | — | **el dueño no cambia** |
| avisos de "te asignaron" a quien escribió | — | **0** |

El control sin migración es lo que hace que el verde valga: si "queda `bot`" no aparece en la columna de la izquierda, la prueba no está midiendo el trigger. Las filas en negrita de la derecha son las que **discriminan** el predicado del paso 2: con `sender_kind = 'agent'` a secas, el seguimiento pasaría a `human`.

**La memoria**, con pruebas puras:

- `vaALaMemoriaDelBot`: `agent` sí; `bot`, `system` y `null` no. Si las burbujas del bot entraran por acá, quedarían **dos veces** en la memoria, porque el turno ya las escribe.
- `sesionDeMemoria(...) === claveDeSesion(...)`, la función con la que **lee** el motor. Una llave distinta escribe en una memoria que nadie lee: **sin error y sin efecto**. Es la prueba más barata y la que más protege.
- `textoParaLaMemoria` por tipo: texto (y vacío → `null`), audio con y sin transcripción, foto con pie, video, documento con nombre, plantilla con texto o solo con nombre.

**El turno: la prueba que conviene escribir y que el CRM no tiene todavía.** La doble revisión se verificó leyendo el lazo y en uso real, pero no tiene una prueba propia. La que la cubre usa un contexto falso que **cambia entre la primera y la segunda lectura**:

| Caso | Esperado |
|---|---|
| tomada durante la espera | `skipped` + `tomada_durante_la_espera`, **el modelo no se llama** |
| tomada mientras pensaba | `skipped` + `tomada_mientras_pensaba`, uso anotado, **0 burbujas y 0 decisiones aplicadas** |
| sigue siendo del bot en las dos lecturas | contesta normal (regresión) |
| en los dos casos soltados | el texto del cliente quedó en la memoria |

Sin esa prueba, alguien puede mover la revisión (b) **después** de aplicar las decisiones "para que quede más ordenado", y el bot vuelve a mover etapas de conversaciones que ya tiene una persona, sin que falle nada.

## Output esperado

1. La medición de puertas y marcas (paso 1), con el predicado escrito a partir de ella.
2. Migración con el trigger en `messages` (`INSERT` y `UPDATE OF`), SECURITY DEFINER y revoke completo.
3. Doble revisión de portones en el turno, con `skipped` + motivo + rama y la memoria del cliente escrita al soltar.
4. `memoria-equipo.ts` y su llamada en el camino de entrega, con la transcripción de audios en `after()`.
5. La tabla de verificación con el control negativo.

## Ejemplo

**Input:** *"Le escribo al paciente desde el CRM y el bot le contesta encima. Y cuando le devuelvo la conversación, el bot no sabe lo que le dije."*

**Output:** la medición da 423 mensajes del equipo en 45 días y ninguno cambiaba `handler`. Con el trigger, escribir pasa la conversación a `human` y la asigna a quien escribió, si nadie la tenía; los seguimientos no cuentan. El turno que ya estaba esperando mira los portones otra vez y se suelta como `skipped / tomada_durante_la_espera`, guardando lo que dijo el paciente. Cuando la persona la devuelve, la memoria del bot tiene su respuesta como `[Nota de voz] le paso el horario del jueves...`, y el bot sigue desde ahí.

## Skills relacionadas

`marca-del-pase-en-el-chat` (escribir deja el chip "tomó la conversación") · `bot-handoff-system-end-to-end` (el pase completo; revisar su predicado de "atendido") · `estado-antes-que-mensaje` (por qué el trigger escucha `UPDATE OF`) · `whatsapp-coexistencia-embedded-signup` (de dónde sale el eco del celular) · `n8n-langchain-agent-postgres-memory` (el formato de la memoria) · `distinguir-detenido-a-proposito-de-roto` (por qué `skipped` con motivo) · `revocar-execute-incluye-public` · `probar-migracion-contra-base-viva-con-rollback` · `bot-lee-pdf-del-cliente`.
