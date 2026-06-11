# Skill: Inbox Message Bubble Render (multi-tipo)

## Cuándo usar esta skill

- Estás construyendo un inbox tipo WhatsApp/Intercom en React (Next.js + Tailwind).
- Tu tabla `messages` tiene varios `kind` (text, image, audio, document, location, system, property card, etc.) y querés renderizar cada uno correctamente.
- Una iteración anterior solo renderizaba texto y te diste cuenta que las imágenes / cards no aparecen.
- Necesitás soportar burbujas del lado del "lead" (izquierda, blanco) y del "agente/bot" (derecha, verde/morado).

## Por qué existe esta skill

El default cuando armás un inbox es renderizar `message.body` como string en una `<div>`. Funciona para texto, falla para todo lo demás. Cuando llegan imágenes, audios, property cards — se ven como texto plano de la metadata, no como medio interactivo.

En Casa CRM (sesión 2026-05-21) tuvimos exactamente este bug: la imagen llegaba al inbox CRM (DB tenía `kind='image'` + `media_url`) pero la UI solo mostraba el caption como texto. Falta de rama image en el componente `MessageBubble`.

## Proceso

### 1. Definir el tipo en el ViewModel

El componente NO consume la row de DB directamente — consume un ViewModel `InboxMessage` que ya transformó los campos relevantes.

```typescript
// crm/src/lib/types.ts
export type InboxMessage = {
  id: string;
  from: 'lead' | 'bot' | 'agent' | 'system';
  text: string;                  // body o caption
  time: string;                  // HH:mm formateado
  rawCreatedAt: string;
  card?: string;                 // property id si es card
  status?: MessageStatus;
  kind?: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'template' | 'interactive' | 'sticker' | 'system';
  mediaUrl?: string;
  mediaMime?: string;
};

export function toInboxMessage(row: MsgRow): InboxMessage {
  return {
    id: row.id,
    from: row.sender_kind,
    text: row.body || '',
    time: formatRelativeTime(row.created_at),
    rawCreatedAt: row.created_at,
    card: row.property_card_id || undefined,
    status: row.status,
    kind: row.kind,
    mediaUrl: row.media_url || undefined,
    mediaMime: row.media_mime || undefined,
  };
}
```

### 2. Estructura del MessageBubble (ramas por tipo)

Orden importa — la primera condición que matchea gana. Recomendado:

1. **System** (handoff, errores, etc.) → pill centrada gris
2. **Property card** (`msg.card` definido) → componente PropertyCard
3. **Image** (`kind === 'image' && mediaUrl`) → `<img>` clickeable + caption opcional
4. **Audio** (`kind === 'audio' && mediaUrl`) → `<audio controls>` + transcripción opcional
5. **Document** → link con icono + nombre + tamaño
6. **Location** → mini-mapa estático o `<a href="https://maps.google.com/?q=lat,lng">`
7. **Text default** → burbuja de texto con `linkifyText`

```tsx
function MessageBubble({ msg, properties, isCompact }: Props) {
  // 1. System
  if (msg.from === 'system') {
    return <SystemPill text={msg.text} />;
  }

  const isMe = msg.from === 'agent' || msg.from === 'bot';
  const property = msg.card ? properties.find(p => p.id === msg.card) : null;

  return (
    <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: isCompact ? '82%' : '72%' }}>
        {property ? (
          <PropertyCard property={property} variant="chat" />
        ) : msg.kind === 'image' && msg.mediaUrl ? (
          <ImageBubble msg={msg} isMe={isMe} />
        ) : msg.kind === 'audio' && msg.mediaUrl ? (
          <AudioBubble msg={msg} isMe={isMe} />
        ) : msg.text ? (
          <TextBubble msg={msg} isMe={isMe} />
        ) : null}
        <BubbleFooter msg={msg} isMe={isMe} />
      </div>
    </div>
  );
}
```

### 3. ImageBubble

```tsx
function ImageBubble({ msg, isMe }: { msg: InboxMessage; isMe: boolean }) {
  return (
    <div style={{
      background: isMe
        ? (msg.from === 'bot' ? 'linear-gradient(135deg, #F3EBFF, #E9DEFF)' : '#DCFCE7')
        : 'white',
      borderRadius: 14,
      borderTopRightRadius: isMe ? 4 : 14,
      borderTopLeftRadius: isMe ? 14 : 4,
      boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
      border: msg.from === 'bot' ? '1px solid #E0CCFF' : 'none',
      overflow: 'hidden',
      padding: 4,
      maxWidth: 320,
    }}>
      <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer">
        <img src={msg.mediaUrl} alt={msg.text || 'Imagen'}
             style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 10 }}
             loading="lazy" />
      </a>
      {msg.text ? (
        <div style={{
          fontSize: 13, lineHeight: 1.4, color: 'var(--ink)',
          padding: '6px 8px 4px', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
        }}>{linkifyText(msg.text)}</div>
      ) : null}
    </div>
  );
}
```

Reglas:
- **`<a target="_blank">`** alrededor del `<img>` permite que el agente abra la foto en tab nueva (zoom natural del browser).
- **`loading="lazy"`** evita bajar todas las imágenes al renderizar timeline largo.
- **`objectFit: 'cover' + maxHeight`** consistente para que el timeline no salte de tamaño.
- **Caption opcional** debajo de la imagen — si `msg.text` viene con el texto del marker / caption.

### 4. Burbuja de texto (con linkify + newlines)

```tsx
function TextBubble({ msg, isMe }) {
  return (
    <div style={{
      background: isMe
        ? (msg.from === 'bot' ? 'linear-gradient(135deg, #F3EBFF, #E9DEFF)' : '#DCFCE7')
        : 'white',
      color: 'var(--ink)',
      padding: '8px 12px',
      borderRadius: 14,
      borderTopRightRadius: isMe ? 4 : 14,
      borderTopLeftRadius: isMe ? 14 : 4,
      fontSize: 13.5,
      lineHeight: 1.45,
      boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
      border: msg.from === 'bot' ? '1px solid #E0CCFF' : 'none',
      wordBreak: 'break-word',
      whiteSpace: 'pre-wrap',  // CRITICAL: preserva \n del bot
    }}>{linkifyText(msg.text)}</div>
  );
}
```

**Crítico:** `whiteSpace: 'pre-wrap'` — sin esto, los newlines del bot/lead colapsan en una sola línea y los mensajes formateados parecen un wall of text.

### 5. linkifyText helper

```tsx
function linkifyText(text: string): React.ReactNode[] {
  const urlRe = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRe);
  return parts.map((p, i) => {
    if (urlRe.test(p)) {
      urlRe.lastIndex = 0; // reset stateful regex
      return <a key={i} href={p} target="_blank" rel="noopener noreferrer"
                style={{ color: '#0EA5E9', textDecoration: 'underline' }}>{p}</a>;
    }
    return p;
  });
}
```

### 6. Styling: identificar bot vs agente vs lead

Convención del proyecto Casa CRM:
- **Lead** (izquierda) → fondo blanco
- **Bot** (derecha) → gradiente morado claro + border morado (distinguible del agente)
- **Agent** (derecha) → fondo verde WhatsApp (#DCFCE7)
- **System** (centro) → pill gris con icono (handoff, errores)

Esto evita la confusión "el agente cree que el lead ve los mensajes del bot como del agente humano".

### 7. Timeline + day separators

```tsx
const renderedTimeline = useMemo(() => {
  const out = [];
  let lastDay = null;
  for (const m of conv.messages) {
    const day = startOfDay(m.rawCreatedAt, tz);
    if (day !== lastDay) {
      out.push({ key: `sep-${day}`, node: <DateSeparator label={formatDay(day)} /> });
      lastDay = day;
    }
    out.push({ key: `m-${m.id}`, node: <MessageBubble msg={m} properties={properties} /> });
  }
  return out;
}, [conv.messages, properties, tz]);
```

Calendario-day en TZ de la agencia (no UTC), para que un mensaje de las 11 PM no se vea separado de un mensaje de las 11:30 PM del mismo día.

## Output esperado

1. ViewModel `InboxMessage` con `kind`, `mediaUrl`, `mediaMime`
2. `toInboxMessage()` que pobla los campos desde la row de DB
3. `MessageBubble` con ramas por tipo (mínimo: system, property, image, text)
4. Ramas image/audio/document según necesidad del producto
5. Burbujas con styling consistente lead/bot/agent/system
6. Day separators + linkifyText + whitespace pre-wrap

## Ejemplo concreto (Casa CRM, sesión 2026-05-21)

- ViewModel: [crm/src/lib/types.ts](crm/src/lib/types.ts) — `InboxMessage` con kind/mediaUrl/mediaMime
- Bubble: [crm/src/components/inbox/chat-panel.tsx](crm/src/components/inbox/chat-panel.tsx#L125) — `MessageBubble` con 3 ramas (property card / image / text)
- Resultado: CR-2031 ahora se renderiza con la imagen real + caption debajo, en lugar de solo el caption como texto plano.

## Gotchas / antipattern

- **NO** asumir que solo hay text. Aunque tu MVP solo manda text, el día que aparezca un image vas a tener bug visible.
- **NO** olvidar `whiteSpace: 'pre-wrap'`. Los newlines del bot son intencionales (formato de listas, párrafos).
- **NO** olvidar `loading="lazy"` en `<img>`. Inbox con 100 imágenes en timeline = lag.
- **NO** poner `<img>` sin contenedor con `maxHeight`. Una foto vertical 2000px arruina el flow del timeline.
- **NO** usar mismo color para bot y agente. El agente NO quiere confundir "lo que yo dije" con "lo que dijo el bot".
- **NO** dejar el caption suelto del lado opuesto a la imagen. Pertenecen juntos visualmente (mismo bubble).

## Skills relacionadas

- `whatsapp-image-delivery-ycloud` — el origen de los messages con `kind='image'`
- `ycloud-webhook-to-supabase` — el persistidor que llena `kind` y `media_url` en DB
- `supabase-realtime-broadcast-pattern` — lo que hace que los messages aparezcan instantáneo en el inbox
