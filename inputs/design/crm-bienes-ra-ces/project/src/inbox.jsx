// Inbox / WhatsApp module

const { useState: useStateI, useEffect: useEffectI, useRef: useRefI, useMemo: useMemoI } = React;

// ——————————————————————————————————————————
// Conversation list item
// ——————————————————————————————————————————
const ConvItem = ({ conv, lead, active, onClick, compact }) => {
  return (
    <button onClick={onClick} className={'conv-item' + (active ? ' active' : '')} style={{
      display: 'flex', gap: 10, padding: compact ? '8px 12px' : '10px 14px',
      width: '100%', textAlign: 'left',
      borderRadius: 10,
      background: active ? 'var(--accent-soft)' : 'transparent',
      borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
      transition: 'background 0.12s',
      alignItems: 'flex-start',
      cursor: 'pointer',
      position: 'relative'
    }}>
      <Avatar name={lead.name} size={compact ? 36 : 40}
        status={conv.handler === 'bot' ? 'bot' : 'online'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: conv.unread ? 700 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {lead.name}
          </span>
          <span style={{ fontSize: 11, color: conv.unread ? 'var(--accent)' : 'var(--muted)', flexShrink: 0, fontWeight: conv.unread ? 600 : 400 }}>
            {conv.lastTime}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          {conv.handler === 'bot' && <Icons.bot size={12} stroke={2} style={{ color: '#7C3AED' }}/>}
          <span style={{
            fontSize: 12,
            color: conv.unread ? 'var(--ink-2)' : 'var(--muted)',
            fontWeight: conv.unread ? 500 : 400,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
          }}>{conv.lastMessage}</span>
          {conv.unread > 0 && (
            <span style={{
              background: 'var(--whatsapp)', color: 'white',
              minWidth: 18, height: 18, padding: '0 5px',
              borderRadius: 9, fontSize: 10.5, fontWeight: 700,
              display: 'grid', placeItems: 'center'
            }}>{conv.unread}</span>
          )}
        </div>
        {!compact && lead.tags?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {lead.tags.slice(0, 2).map(t => (
              <span key={t} style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                background: t === 'Hot' ? '#FEE2E2' : 'var(--surface-2)',
                color: t === 'Hot' ? '#B91C1C' : 'var(--muted)',
                fontWeight: 600
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
};

// ——————————————————————————————————————————
// Conversation list / left column
// ——————————————————————————————————————————
const ConvList = ({ conversations, leads, selectedLeadId, onSelect, compact }) => {
  const [filter, setFilter] = useStateI('all');
  const FILTERS = [
    { id: 'all', label: 'Todos', count: conversations.length },
    { id: 'unread', label: 'Sin leer', count: conversations.filter(c => c.unread > 0).length },
    { id: 'bot', label: 'Bot', count: conversations.filter(c => c.handler === 'bot').length },
    { id: 'mine', label: 'Míos', count: 4 },
  ];

  const filtered = conversations.filter(c => {
    if (filter === 'unread') return c.unread > 0;
    if (filter === 'bot') return c.handler === 'bot';
    if (filter === 'mine') return c.handler === 'human';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
      <div style={{ padding: '14px 16px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Conversaciones</h3>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
              {conversations.filter(c => c.unread > 0).length} sin leer · {conversations.filter(c => c.handler === 'bot').length} con bot
            </div>
          </div>
          <button className="icon-btn" title="Nuevo chat">
            <Icons.edit size={15}/>
          </button>
        </div>
        <div className="search" style={{ width: '100%', background: 'var(--surface-2)' }}>
          <Icons.search size={14}/>
          <input placeholder="Buscar conversación..."/>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {FILTERS.map(f => (
          <button key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: '4px 10px', borderRadius: 999,
              fontSize: 12, fontWeight: 500,
              background: filter === f.id ? 'var(--ink)' : 'var(--surface-2)',
              color: filter === f.id ? 'white' : 'var(--ink-2)',
              border: '1px solid ' + (filter === f.id ? 'var(--ink)' : 'var(--border)'),
              whiteSpace: 'nowrap'
            }}>
            {f.label} <span style={{ opacity: 0.6, fontSize: 11 }}>{f.count}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {filtered.map(c => {
          const lead = leads.find(l => l.id === c.leadId);
          if (!lead) return null;
          return (
            <ConvItem key={c.leadId} conv={c} lead={lead} compact={compact}
              active={selectedLeadId === c.leadId}
              onClick={() => onSelect(c.leadId)} />
          );
        })}
      </div>
    </div>
  );
};

// ——————————————————————————————————————————
// Message bubble
// ——————————————————————————————————————————
const MessageBubble = ({ msg, properties }) => {
  if (msg.from === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
        <div style={{
          fontSize: 11.5, color: 'var(--muted)',
          background: 'var(--surface-2)', padding: '6px 12px',
          borderRadius: 999, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--border)'
        }}>
          <Icons.handoff size={12}/> {msg.text}
        </div>
      </div>
    );
  }
  const isMe = msg.from === 'agent' || msg.from === 'bot';
  const property = msg.card ? properties.find(p => p.id === msg.card) : null;

  return (
    <div style={{
      display: 'flex',
      justifyContent: isMe ? 'flex-end' : 'flex-start',
      marginBottom: 6
    }}>
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
        {property ? (
          <PropertyCard property={property} variant="chat" />
        ) : msg.text ? (
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
            wordBreak: 'break-word'
          }}>{msg.text}</div>
        ) : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--muted)', marginTop: 3, padding: '0 6px' }}>
          {msg.from === 'bot' && <Icons.bot size={11} stroke={2}/>}
          {msg.time}
          {isMe && <Icons.checkdouble size={12} style={{ color: '#0EA5E9' }}/>}
        </div>
      </div>
    </div>
  );
};

// ——————————————————————————————————————————
// Chat (middle column)
// ——————————————————————————————————————————
const ChatPanel = ({ conv, lead, properties, onToggleHandler, onOpenLead, onShowProperty }) => {
  const [draft, setDraft] = useStateI('');
  const [showQuick, setShowQuick] = useStateI(false);
  const [showPropPicker, setShowPropPicker] = useStateI(false);
  const [localMsgs, setLocalMsgs] = useStateI(conv.messages);
  const scrollerRef = useRefI(null);

  useEffectI(() => {
    setLocalMsgs(conv.messages);
  }, [conv.leadId]);

  useEffectI(() => {
    if (scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [localMsgs]);

  const send = () => {
    if (!draft.trim()) return;
    const now = new Date();
    setLocalMsgs([...localMsgs, { from: 'agent', text: draft.trim(), time: 'Ahora' }]);
    setDraft('');
  };

  const sendProperty = (pid) => {
    setLocalMsgs([...localMsgs, { from: 'agent', text: '', time: 'Ahora', card: pid }]);
    setShowPropPicker(false);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, #F4EFE7 0%, #ECE5D7 100%)',
      position: 'relative'
    }}>
      {/* Chat header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 18px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0
      }}>
        <Avatar name={lead.name} size={40} status={conv.handler === 'bot' ? 'bot' : 'online'}/>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onOpenLead}>
          <div style={{ fontSize: 14.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {lead.name}
            <HandlerBadge handler={conv.handler} size="sm"/>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{lead.phone}</span>
            <span>·</span>
            <StatusPill status={lead.status} size="sm"/>
          </div>
        </div>
        <button className="btn ghost sm" onClick={onToggleHandler}>
          {conv.handler === 'bot' ? <><Icons.handoff size={13}/> Tomar conversación</> : <><Icons.bot size={13}/> Devolver al bot</>}
        </button>
        <button className="icon-btn" title="Llamar"><Icons.phone size={16}/></button>
        <button className="icon-btn" title="Más"><Icons.more size={16}/></button>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} style={{
        flex: 1, overflowY: 'auto',
        padding: '20px 22px',
        backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(184,92,56,0.05) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(21,128,61,0.04) 0%, transparent 50%)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <span style={{
            background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)',
            padding: '4px 12px', borderRadius: 999,
            fontSize: 11, color: 'var(--muted)', fontWeight: 500
          }}>
            Lunes 13 de mayo
          </span>
        </div>
        {localMsgs.map((m, i) => <MessageBubble key={i} msg={m} properties={properties}/>)}
      </div>

      {/* Templates panel — with merge fields */}
      {showQuick && (
        <div style={{
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '12px 14px',
          maxHeight: 320, overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Plantillas</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Los campos como <code style={{ background: 'var(--surface-2)', padding: '0 4px', borderRadius: 3, fontSize: 10.5 }}>{`{{nombre}}`}</code> se rellenan automáticamente</div>
            </div>
            <button className="icon-btn" onClick={() => setShowQuick(false)} style={{ width: 24, height: 24 }}><Icons.close size={13}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
            {(MockData.WA_TEMPLATES || MockData.QUICK_REPLIES).map(q => {
              const ctx = { lead, agent: { name: 'María Vargas' }, property: (lead?.interestedIn?.[0] && properties.find(p => p.id === lead.interestedIn[0])) || null };
              const resolved = MockData.resolveTemplate ? MockData.resolveTemplate(q.body || q.text, ctx) : (q.body || q.text);
              return (
                <button key={q.id} onClick={() => { setDraft(resolved); setShowQuick(false); }}
                  style={{
                    textAlign: 'left', padding: 10,
                    borderRadius: 8, fontSize: 12,
                    border: '1px solid var(--border)', background: 'var(--surface-2)'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{q.name || q.label}</span>
                    {q.category && <span style={{ fontSize: 9.5, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-soft)', color: 'var(--accent-deep)', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>{q.category}</span>}
                  </div>
                  <div style={{ color: 'var(--muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4, fontSize: 11.5 }}>{resolved}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Property picker */}
      {showPropPicker && (
        <div style={{
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          padding: '10px 14px',
          maxHeight: 240, overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>Enviar ficha de propiedad</div>
            <button className="icon-btn" onClick={() => setShowPropPicker(false)} style={{ width: 24, height: 24 }}><Icons.close size={13}/></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {properties.filter(p => p.status === 'Disponible').slice(0, 6).map(p => (
              <PropertyCard key={p.id} property={p} variant="compact" onClick={() => sendProperty(p.id)}/>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div style={{
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        padding: '10px 14px', flexShrink: 0
      }}>
        {conv.handler === 'bot' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'linear-gradient(135deg, #F3EBFF, #FAF5FF)',
            border: '1px solid #E0CCFF',
            padding: '8px 12px', borderRadius: 8, marginBottom: 10,
            fontSize: 12, color: '#5B21B6'
          }}>
            <Icons.bot size={14}/>
            <span><strong>Bot atendiendo automáticamente.</strong> Puedes intervenir si lo necesitas.</span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button className="icon-btn" onClick={() => { setShowQuick(!showQuick); setShowPropPicker(false); }} title="Respuestas rápidas">
            <Icons.sparkle size={17}/>
          </button>
          <button className="icon-btn" onClick={() => { setShowPropPicker(!showPropPicker); setShowQuick(false); }} title="Enviar propiedad">
            <Icons.home size={17}/>
          </button>
          <button className="icon-btn" title="Adjuntar"><Icons.paperclip size={17}/></button>
          <div style={{
            flex: 1, background: 'var(--surface-2)',
            borderRadius: 22, padding: '8px 14px',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }}}
              placeholder="Escribe un mensaje..."
              style={{ flex: 1, background: 'transparent', border: 0, outline: 0, fontSize: 13.5 }}
            />
            <button className="icon-btn" title="Emoji" style={{ width: 24, height: 24 }}>
              <Icons.smile size={16}/>
            </button>
          </div>
          {draft ? (
            <button onClick={send} style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'var(--whatsapp)', color: 'white',
              display: 'grid', placeItems: 'center'
            }}>
              <Icons.send size={16} stroke={2.2}/>
            </button>
          ) : (
            <button className="icon-btn"><Icons.mic size={18}/></button>
          )}
        </div>
      </div>
    </div>
  );
};

// ——————————————————————————————————————————
// Lead panel (right column)
// ——————————————————————————————————————————
const LeadPanel = ({ lead, properties, conv, onClose, compact }) => {
  if (!lead) return null;
  const [tab, setTab] = useStateI('info');
  const [notes, setNotes] = useStateI(lead.notes || '');
  const [status, setStatus] = useStateI(lead.status);

  const interested = (lead.interestedIn || []).map(id => properties.find(p => p.id === id)).filter(Boolean);

  return (
    <div style={{ background: 'var(--surface)', height: '100%', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>
          Información del lead
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} style={{ width: 26, height: 26 }}>
            <Icons.close size={14}/>
          </button>
        )}
      </div>

      <div style={{ padding: '18px 18px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <Avatar name={lead.name} size={60}/>
        <div style={{ marginTop: 10, fontSize: 16, fontWeight: 700 }}>{lead.name}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{lead.phone}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lead.email}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn ghost sm"><Icons.phone size={13}/> Llamar</button>
          <button className="btn ghost sm"><Icons.mail size={13}/> Email</button>
        </div>
      </div>

      {/* tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'info', label: 'Info' },
          { id: 'props', label: `Interés (${interested.length})` },
          { id: 'notes', label: 'Notas' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 8px',
              fontSize: 12.5, fontWeight: 500,
              color: tab === t.id ? 'var(--accent-deep)' : 'var(--muted)',
              borderBottom: '2px solid ' + (tab === t.id ? 'var(--accent)' : 'transparent'),
              marginBottom: -1
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        {tab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6, letterSpacing: '0.06em' }}>Estado</div>
              <select value={status} onChange={e => setStatus(e.target.value)} style={{
                width: '100%', padding: '7px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13
              }}>
                {Object.keys(MockData.STATUSES).map(s => <option key={s}>{s}</option>)}
              </select>
              <div style={{ marginTop: 8 }}>
                <StatusPill status={status}/>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: '0.06em' }}>Interés</div>
              <div style={{ fontSize: 13 }}>{lead.interest}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: '0.06em' }}>Presupuesto</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{lead.budget}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: '0.06em' }}>Operación</div>
              <div style={{ fontSize: 13 }}>{lead.operation}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4, letterSpacing: '0.06em' }}>Fuente</div>
              <div style={{ fontSize: 13 }}>{lead.source}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6, letterSpacing: '0.06em' }}>Etiquetas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {(lead.tags || []).map(t => (
                  <span key={t} className="tag" style={{
                    background: t === 'Hot' ? '#FEE2E2' : 'var(--surface-2)',
                    color: t === 'Hot' ? '#B91C1C' : 'var(--ink-2)'
                  }}>{t === 'Hot' && '🔥 '}{t}</span>
                ))}
                <button className="tag" style={{ background: 'transparent', border: '1px dashed var(--border-strong)', color: 'var(--muted)' }}>
                  <Icons.plus size={11}/> añadir
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === 'props' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
              Propiedades enviadas o vistas:
            </div>
            {interested.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: 20, textAlign: 'center' }}>
                Aún no se han enviado propiedades a este lead.
              </div>
            )}
            {interested.map(p => (
              <PropertyCard key={p.id} property={p} variant="compact"/>
            ))}
            <button className="btn ghost sm" style={{ justifyContent: 'center', marginTop: 8 }}>
              <Icons.plus size={13}/> Enviar propiedad
            </button>
          </div>
        )}

        {tab === 'notes' && (
          <div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Escribe notas internas sobre este lead..."
              style={{
                width: '100%', minHeight: 200,
                padding: 10, borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                fontSize: 13, lineHeight: 1.5, resize: 'vertical',
                fontFamily: 'inherit'
              }}/>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Solo visible para tu equipo.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ——————————————————————————————————————————
// Main Inbox – three layout variants
// ——————————————————————————————————————————
const Inbox = ({ inboxLayout, showAI, properties, leads, conversations, onOpenLead }) => {
  const [selectedLeadId, setSelectedLeadId] = useStateI('l1');
  const [convs, setConvs] = useStateI(conversations);
  const [showLeadPanel, setShowLeadPanel] = useStateI(true);

  const selectedConv = convs.find(c => c.leadId === selectedLeadId) || convs[0];
  const selectedLead = leads.find(l => l.id === selectedConv.leadId);

  const toggleHandler = () => {
    setConvs(convs.map(c => c.leadId === selectedLeadId
      ? { ...c, handler: c.handler === 'bot' ? 'human' : 'bot' }
      : c
    ));
  };

  const layout = inboxLayout || 'three-col';

  // — Variant 1: classic 3-column
  if (layout === 'three-col') {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: showLeadPanel ? '320px 1fr 320px' : '320px 1fr',
        height: '100%', overflow: 'hidden'
      }}>
        <ConvList conversations={convs} leads={leads}
          selectedLeadId={selectedLeadId} onSelect={setSelectedLeadId}/>
        <ChatPanel conv={selectedConv} lead={selectedLead} properties={properties}
          onToggleHandler={toggleHandler}
          onOpenLead={() => onOpenLead(selectedLead.id)}/>
        {showLeadPanel && (
          <LeadPanel lead={selectedLead} properties={properties} conv={selectedConv}
            onClose={() => setShowLeadPanel(false)}/>
        )}
        {!showLeadPanel && (
          <button onClick={() => setShowLeadPanel(true)}
            style={{
              position: 'absolute', right: 14, top: 78, zIndex: 5,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 600,
              boxShadow: 'var(--shadow-1)', color: 'var(--ink-2)',
              display: 'flex', alignItems: 'center', gap: 6
            }}>
            <Icons.user size={13}/> Ver lead
          </button>
        )}
      </div>
    );
  }

  // — Variant 2: 2-column (chat focus + collapsible lead drawer)
  if (layout === 'two-col') {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '340px 1fr',
        height: '100%', overflow: 'hidden',
        position: 'relative'
      }}>
        <ConvList conversations={convs} leads={leads}
          selectedLeadId={selectedLeadId} onSelect={setSelectedLeadId}/>
        <ChatPanel conv={selectedConv} lead={selectedLead} properties={properties}
          onToggleHandler={toggleHandler}
          onOpenLead={() => setShowLeadPanel(!showLeadPanel)}/>
        {showLeadPanel && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0,
            width: 340, zIndex: 4,
            boxShadow: '-12px 0 24px rgba(34,28,22,0.06)',
          }}>
            <LeadPanel lead={selectedLead} properties={properties} conv={selectedConv}
              onClose={() => setShowLeadPanel(false)}/>
          </div>
        )}
      </div>
    );
  }

  // — Variant 3: focus / split (large reading mode for the chat)
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '280px 1fr 280px',
      gridTemplateRows: 'auto 1fr',
      height: '100%', overflow: 'hidden',
      background: 'var(--bg)'
    }}>
      {/* Top: pinned/featured + bot intel */}
      <div style={{
        gridColumn: '1 / -1',
        background: 'linear-gradient(90deg, #FAF7F2 0%, #F4EFE7 100%)',
        borderBottom: '1px solid var(--border)',
        padding: '10px 18px',
        display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
          <Icons.sparkle size={14} style={{ color: '#7C3AED' }}/>
          <strong style={{ color: 'var(--ink)' }}>Resumen del bot:</strong>
        </div>
        <div style={{ color: 'var(--ink-2)' }}>
          Hoy 12 leads nuevos · 3 esperando agente · 2 listos para agendar
        </div>
        <div style={{ flex: 1 }}/>
        <button className="btn ghost sm"><Icons.trend size={12}/> Ver actividad</button>
      </div>

      <ConvList conversations={convs} leads={leads}
        selectedLeadId={selectedLeadId} onSelect={setSelectedLeadId} compact={true}/>
      <ChatPanel conv={selectedConv} lead={selectedLead} properties={properties}
        onToggleHandler={toggleHandler}
        onOpenLead={() => onOpenLead(selectedLead.id)}/>
      <LeadPanel lead={selectedLead} properties={properties} conv={selectedConv}/>
    </div>
  );
};

window.Inbox = Inbox;
