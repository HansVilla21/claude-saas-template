# Skill: Coexistencia — "leído" en WhatsApp y "sin leer" en el CRM

Cuando un negocio usa **coexistencia** (el mismo número en la app de WhatsApp
Business del celular Y en la Cloud API vía un BSP como YCloud), el "leído" y el
"sin leer" viajan entre dos mundos que no se hablan igual. Esta skill cubre los
dos sentidos:

- **CRM → celular:** marcar como leído desde la API **también lo marca en el
  celular del negocio**. Si tu sistema marca cada mensaje al entrar, el chat
  aparece abierto en la app aunque nadie lo haya visto, y el lead ve el doble
  check azul sin respuesta.
- **Celular → CRM:** WhatsApp **no avisa** cuando alguien abre un chat en el
  celular. Lo único que llega es la copia (eco) de lo que el negocio contesta, y
  ese eco llega **idéntico** sea una persona, un saludo automático o una
  difusión.

## Cuándo usar esta skill

- Un cliente con coexistencia dice que "los chats se abren solos" en el celular,
  que "no queda la burbujita de nuevos", o que el lead ve azul y nadie le
  contestó.
- Vas a portar un flujo (n8n u otro) que marcaba como leído "para que el lead vea
  el azul": antes de copiarlo, decidí CUÁNDO se marca.
- Querés que contestar desde el celular quite el "sin leer" del CRM.
- Preguntan si "la API apaga las notificaciones del celular".

## Regla madre

**"Leído" es una afirmación: alguien lo atendió.** Se marca cuando alguien
atiende, nunca cuando el mensaje llega. Y como el sistema no ve todo lo que pasa
en el celular, lo que no se puede saber se decide por el lado barato: ante la
duda, el mensaje queda **sin leer** (el costo es abrir el chat; el otro error
esconde un lead sin atender).

## Proceso

### Parte 1 — Marcar como leído solo cuando alguien atiende

1. **Buscá QUIÉN marca hoy.** Grep de `markAsRead` / `status: 'read'` en el
   webhook, el motor del bot y el CRM. En el caso real lo hacía el webhook con
   cada entrante, antes de cualquier portón (bot prendido, apagado, en pausa),
   heredado de un flujo de n8n que lo hacía "para que el lead vea el azul".
2. **Sacalo de la entrada.** El webhook solo guarda; no marca nada.
3. **Un solo módulo que marca** (`marcarLeidoEnWhatsApp(conversationId)`),
   best-effort, que nunca tira:
   - toma el **último** mensaje entrante de la conversación por su `wamid` —
     WhatsApp da por leídos también todos los anteriores;
   - resuelve el proveedor con la misma función que ya usa el envío (no dupliques
     credenciales ni URLs);
   - **YCloud:** `POST /v2/whatsapp/inboundMessages/{wamid}/markAsRead` — acepta
     el `wamid` aunque la doc hable de "id" ("A wamid … is also acceptable"). Si
     solo guardás el `wamid`, no hace falta guardar el id de YCloud. Escapalo con
     `encodeURIComponent` (trae `=`).
   - **Meta directo:** `POST /{phone_number_id}/messages` con
     `{ messaging_product: 'whatsapp', status: 'read', message_id: wamid }`.
4. **Llamalo cuando alguien CONTESTA, no cuando abre el chat:**
   - **El bot contesta** → en paralelo con el envío (`Promise.all`), así no
     demora la respuesta y si falla la respuesta sale igual. El lead ve el azul
     junto con la respuesta.
   - **Una persona contesta desde el CRM** (texto, adjunto, audio, plantilla) →
     en la acción de envío, **solo si la entrega salió**, con `after()` para no
     demorar el composer. Reaccionar con un emoji también cuenta: el lead lo ve.
   - **Alguien lo abre en el celular** → lo marca WhatsApp solo.
   ⚠️ **Por qué no al abrir el chat en el CRM** (se probó y se cambió el mismo
   día): **no existe "marcar como no leído"** ni en la Cloud API de Meta ni en
   YCloud — el leído es de una sola vía, y el "no leído" de la app es manual y
   local. Si abrir marcara, el "marcar como no leída" del CRM quedaría
   desmentido en el celular para siempre, y el lead vería el azul de alguien que
   solo miró. Marcando al contestar, el lead nunca ve azul sin respuesta y el
   celular conserva el contador hasta que alguien responda. De yapa, el
   master/soporte que entra a mirar el negocio de un cliente no le borra nada.
5. **Quién NO marca:**
   - El **aviso automático de fuera de horario**: nadie atendió; a la mañana el
     chat tiene que seguir apareciendo como nuevo en el celular.
   - Los **seguimientos automáticos** (salen por el cron, no por la acción de
     envío de una persona).
   - Abrir, mirar o marcar "no leída" en el CRM.

### Parte 2 — Contestar desde el celular quita el "sin leer" del CRM

6. **Contá los tipos de evento antes de prometer** (ver
   `webhook-contar-event-types-antes-de-arreglar`). Medido en 3 días: 5 tipos
   (entrantes, estados de salientes, ecos de la app, historial, plantillas) —
   **ninguno dice "el negocio leyó"**. Decile al founder desde el principio:
   *abrir el chat en el celular sin contestar NO puede quitar el circulito del
   CRM*. Lo que sí se puede usar es el eco de la respuesta.
7. **Mirá los ecos de verdad antes de escribir la regla.** Agrupá los ecos de 30
   días por `md5(body)` y medí, por grupo, cuántas veces se repite el texto y
   cuántos segundos pasan desde el último mensaje del lead. Aparecen tres cosas
   que un eco "de persona" no distingue por campos (mismo `type`, mismo
   `pricingCategory: service`, sin `context`):
   - **Respuesta automática de la app** (saludo/ausencia): el mismo texto largo,
     ~1,5 s de mediana, mínimo 0,07 s. **Y la mitad llega ANTES que el mensaje
     del lead que la disparó** (16 de 30), así que "X segundos después" solo no
     alcanza.
   - **Difusión**: el mismo texto largo a cientos de chats, días después.
   - **Respuestas rápidas** del equipo: texto repetido, pero escrito por una
     persona.
   ⚠️ No le creas al "ningún cliente nuestro usa saludo automático": en el caso
   real uno sí lo tenía (30 veces en 30 días). Medí.
8. **La regla (versión final, después de dos pruebas del founder que la
   rompieron).** El eco quita el "sin leer" salvo que:
   - llegue a **menos de 10 s** del mensaje del lead **Y** tenga **≥ 40
     caracteres** (nadie escribe 40 caracteres a mano tan rápido; lo corto y
     rápido —"Hola", "Ok", una foto— es una persona);
   - llegue **más de 24 h** después (no responde a lo que quedó sin leer; ahí
     caen las difusiones);
   - su texto tenga **≥ 40 caracteres** y el negocio ya lo haya mandado desde la
     app en los últimos 30 días (plantilla: automática, difusión, respuesta
     rápida larga).
   Por qué el corte de 40: la automática repetida más corta medía 282 caracteres
   y la difusión 409; las respuestas a mano repetidas arrancan en 2 ("Ok").
   **Las dos versiones que fallaron**, para no repetirlas:
   - "texto ya usado → no cuenta" sin mirar el largo: el founder contestó con un
     texto corto que ya había mandado antes y el circulito no se fue;
   - "menos de 10 s → no cuenta" sin mirar el largo: contestó al instante y
     tampoco. En una charla en vivo eso es normal (88 respuestas reales en 30
     días).
9. **Simulá la regla contra los 30 días ANTES de escribir la migración**, con la
   tabla por grupo: automáticas y difusiones tienen que quedar en **0** que
   quitan el circulito; lo escrito a mano, la gran mayoría. Caso real, versión
   final: automáticas 0/30, difusiones 0/329, a mano ~70 % (el resto falla
   hacia el lado barato).
10. **Implementalo como trigger propio**, no dentro del trigger que ya
    desnormaliza la conversación:
    - `AFTER INSERT OR UPDATE OF sent_via ... WHEN (outbound AND sent_via =
      'coexistence')`: el eco a veces entra primero como otra cosa (el estado de
      YCloud llega antes) y después se **reclama** con un UPDATE. Un trigger
      solo de INSERT se lo pierde.
    - En el UPDATE, solo si `sent_via` realmente cambió.
    - Saltar la importación de historial (la misma bandera que usa el denorm).
    - Chequeos baratos primero (`unread_count > 0`, ventana de tiempo, largo) y
      el `exists` del texto repetido al final: es la única lectura con costo
      (68 ms en el peor caso medido) y solo llega ahí quien contestó un chat con
      circulito.
    - `SECURITY DEFINER` + `set search_path` + `revoke all ... from public,
      anon, authenticated`.
    - El inbox tiene que tomar `unread_count` de la fila de la conversación que
      llega por realtime; si no, el circulito se va recién con F5.

### Verificación

11. **Migración contra la base viva, bloque que siempre aborta** (ver
    `probar-migracion-contra-base-viva-con-rollback`), en un negocio de demo, sin
    insertar entrantes (disparan avisos): poné `unread_count` y
    `last_inbound_at` a mano e insertá ecos con `created_at` explícito (dentro de
    la transacción `now()` no avanza). Casos mínimos: **control con la función
    vigente** (el caso que se arregla falla), respuesta a mano, automática nueva
    larga y rápida, > 24 h, texto largo repetido, texto corto repetido, foto sin
    texto, eco reclamado por UPDATE, respuesta del bot, importación de historial.
    Al final: 0 filas de prueba y la función viva sin tocar.
12. **Probá el endpoint de "leído" con un mensaje que ya está leído** (no cambia
    nada visible) antes de depender de él: así se confirmó que YCloud acepta el
    `wamid` (200).
13. **Orden de producción:** primero el CRM (marca al atender), después el
    webhook (deja de marcar al entrar). Si el orden se invierte, un rato nadie
    marca; si se respeta, un rato marcan los dos. Ninguno de los dos rompe. Si el
    webhook es una Edge Function de Supabase sin entrada en `config.toml`:
    `--no-verify-jwt` o el BSP recibe 401.
14. **Prueba con un teléfono real (la que decide):** escribile al número del
    negocio desde otro teléfono y comprobá los casos: con el bot activo, el azul
    llega junto con la respuesta; con la conversación en manos de una persona,
    queda gris y con contador en el celular aunque se abra en el CRM, y se pone
    azul al contestar desde el CRM; contestando desde el celular, el circulito
    del CRM se va solo. Las dos versiones fallidas de la regla del eco y el
    "no leída" que no volvía aparecieron ACÁ, no en las pruebas.

## Notificaciones que no llegan (la pregunta que viene después)

Con esto aplicado, el sistema no manda nada que silencie el celular: el mensaje
llega a la app sin leer. Si igual no suena, es la app o el teléfono. Revisá, en
orden: WhatsApp Web/Desktop del negocio abierto en una compu (probalo cerrado),
chat silenciado o archivado, notificaciones de la app y del sistema, ahorro de
batería, y si la prueba se hizo desde el mismo teléfono o con la app abierta.
Antes del cambio sí había una causa propia: el "leído" instantáneo le decía al
celular que el mensaje ya se había visto.

## Output esperado

- El webhook sin `markAsRead` al entrar (versión nueva, con la nota de por qué).
- `leido-en-whatsapp.ts` (efecto) + `leido.ts` (puro: el pedido por proveedor)
  con pruebas.
- Llamadas en el turno del bot (en paralelo al envío), en la acción de envío de
  una persona (si la entrega salió) y en la de reaccionar. Ninguna al abrir.
- Migración con el trigger del eco + prueba contra la base viva + la simulación
  de 30 días en el PR.
- Fila en el backlog con los números y la prueba del teléfono real.

## Ejemplo

**Input:** *"La clienta probó desde su teléfono personal: vio los dos checks
azules al instante y nadie le contestó. En el celular del negocio el chat se abre
solo, no queda la burbujita de nuevos."*

**Output:**
1. Causa: el webhook marcaba como leído cada entrante (heredado de n8n). Con
   coexistencia ese "leído" llega a la app del negocio. No es una opción de
   WhatsApp.
2. Arreglo: el webhook deja de marcar; marca el CRM cuando alguien contesta (el
   bot, o una persona desde el CRM). El contador del CRM sigue igual.
3. Aparte, y avisado de entrada: abrir el chat en el celular no quita el
   circulito del CRM (WhatsApp no lo informa); contestar desde el celular sí,
   con la regla del paso 8.
4. Prueba del founder con su teléfono: ✅ queda sin leer en la app · ❌ respuesta
   corta repetida → corte de 40 · ❌ respuesta al instante → rápido Y largo ·
   ❌ "marcar no leída" en el CRM no volvía a no leído en el celular (no existe
   en la API) → leído al contestar, no al abrir · ✅.

Relacionadas: `webhook-contar-event-types-antes-de-arreglar`,
`clasificar-por-lista-no-por-fallback`, `probar-migracion-contra-base-viva-con-rollback`,
`config-que-deja-el-sistema-mudo` (fallar hacia el lado barato),
`whatsapp-proactivo-a-staff`, `verificar-funcionamiento-end-to-end`.
