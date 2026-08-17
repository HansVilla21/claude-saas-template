// Global search (⌘K) — palette + recents + sections

const { useState: useStateS, useEffect: useEffectS, useRef: useRefS, useMemo: useMemoS } = React;

const SearchPalette = ({ open, onClose, leads, properties, conversations, onOpenLead, onOpenProperty, onNav }) => {
  const [query, setQuery] = useStateS('');
  const [activeIdx, setActiveIdx] = useStateS(0);
  const inputRef = useRefS(null);

  useEffectS(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemoS(() => {
    if (!open) return { leads: [], props: [], conv: [], actions: [] };
    // Normalize for accent-insensitive search (Escazú → escazu, Méndez → mendez)
    const fold = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = fold(query.trim());
    if (!q) {
      return {
        recent: leads.slice(0, 3).map(l => ({ type: 'lead', item: l })),
        actions: [
          { type: 'action', id: 'new-lead', label: 'Crear nuevo lead', icon: 'plus', kbd: 'L', go: () => onNav('leads') },
          { type: 'action', id: 'new-prop', label: 'Agregar propiedad', icon: 'home', kbd: 'P', go: () => onNav('property-create') },
          { type: 'action', id: 'inbox', label: 'Ir al Inbox', icon: 'inbox', kbd: 'I', go: () => onNav('inbox') },
          { type: 'action', id: 'cal', label: 'Ir a Agenda', icon: 'calendar', kbd: 'A', go: () => onNav('calendar') },
          { type: 'action', id: 'reports', label: 'Generar reporte para propietario', icon: 'trend', go: () => onNav('reports') },
        ]
      };
    }

    const leadHits = leads.filter(l =>
      fold(l.name).includes(q) ||
      l.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
      fold(l.email).includes(q) ||
      fold(l.interest).includes(q)
    ).slice(0, 5).map(l => ({ type: 'lead', item: l }));

    const propHits = properties.filter(p =>
      fold(p.title).includes(q) ||
      fold(p.code).includes(q) ||
      fold(p.location).includes(q) ||
      fold(p.neighborhood).includes(q)
    ).slice(0, 5).map(p => ({ type: 'prop', item: p }));

    const convHits = conversations.filter(c => {
      const lead = leads.find(l => l.id === c.leadId);
      if (!lead) return false;
      return c.messages?.some(m => fold(m.text).includes(q));
    }).slice(0, 3).map(c => ({ type: 'conv', item: c, lead: leads.find(l => l.id === c.leadId) }));

    return { leadHits, propHits, convHits };
  }, [query, leads, properties, conversations, open, onNav]);

  // flat list for keyboard nav
  const flat = useMemoS(() => {
    if (!query.trim()) {
      return [...(results.recent || []), ...(results.actions || [])];
    }
    return [...(results.leadHits || []), ...(results.propHits || []), ...(results.convHits || [])];
  }, [results, query]);

  useEffectS(() => { setActiveIdx(0); }, [query]);

  const pick = (item) => {
    if (item.type === 'action') item.go();
    else if (item.type === 'lead') onOpenLead(item.item.id);
    else if (item.type === 'prop') onOpenProperty(item.item.id);
    else if (item.type === 'conv') { onNav('inbox'); }
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(Math.min(flat.length - 1, activeIdx + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(Math.max(0, activeIdx - 1)); }
    if (e.key === 'Enter') { e.preventDefault(); if (flat[activeIdx]) pick(flat[activeIdx]); }
  };

  if (!open) return null;

  const matchHighlight = (text, q) => {
    if (!q || !text) return text;
    const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const folded = fold(text);
    const foldedQ = fold(q);
    const idx = folded.indexOf(foldedQ);
    if (idx < 0) return text;
    // Use original text slicing — folded length equals original length since we only strip combining marks
    return <>{text.slice(0, idx)}<mark style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)', padding: '0 2px', borderRadius: 2 }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
  };

  let renderIdx = -1;
  const renderItem = (item, label) => {
    renderIdx++;
    const i = renderIdx;
    const active = i === activeIdx;
    const common = {
      onMouseEnter: () => setActiveIdx(i),
      onClick: () => pick(item),
      style: {
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', cursor: 'pointer',
        background: active ? 'var(--accent-soft)' : 'transparent',
        width: '100%', textAlign: 'left',
      }
    };

    if (item.type === 'lead') {
      const l = item.item;
      return (
        <button key={`l-${l.id}`} {...common}>
          <Avatar name={l.name} size={32}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{matchHighlight(l.name, query)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l.phone} · {l.interest}</div>
          </div>
          <StatusPill status={l.status} size="sm"/>
          {active && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>↵</span>}
        </button>
      );
    }
    if (item.type === 'prop') {
      const p = item.item;
      return (
        <button key={`p-${p.id}`} {...common}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 16, flexShrink: 0 }}>{p.images?.[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{matchHighlight(p.title, query)}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 6 }}>
              <span className="mono">{matchHighlight(p.code, query)}</span> · {p.location}
            </div>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-deep)' }}>${new Intl.NumberFormat('en-US').format(p.price)}</div>
          {active && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>↵</span>}
        </button>
      );
    }
    if (item.type === 'conv') {
      const c = item.item;
      const lead = item.lead;
      const matchMsg = c.messages.find(m => m.text?.toLowerCase().includes(query.toLowerCase()));
      return (
        <button key={`c-${c.leadId}`} {...common}>
          <Icons.whatsapp size={20} style={{ color: 'var(--whatsapp)', flexShrink: 0 }}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{lead.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              "{matchHighlight(matchMsg?.text || '', query)}"
            </div>
          </div>
          {active && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>↵</span>}
        </button>
      );
    }
    if (item.type === 'action') {
      const Icon = Icons[item.icon];
      return (
        <button key={`a-${item.id}`} {...common}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Icon size={15}/>
          </div>
          <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{item.label}</div>
          {item.kbd && <span className="kbd" style={{ fontSize: 10 }}>{item.kbd}</span>}
          {active && <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>↵</span>}
        </button>
      );
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(34, 28, 22, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '12vh'
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, maxWidth: 'calc(100vw - 32px)',
        background: 'var(--surface)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-3)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        maxHeight: '70vh'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <Icons.search size={18} style={{ color: 'var(--muted)' }}/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar leads, propiedades, mensajes, acciones..."
            style={{ flex: 1, background: 'transparent', border: 0, outline: 0, fontSize: 16 }}
          />
          <span className="kbd" style={{ fontSize: 10 }}>esc</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {!query.trim() && (
            <>
              {results.recent?.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 16px 4px' }}>Recientes</div>
                  {results.recent.map(r => renderItem(r))}
                </>
              )}
              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 16px 4px' }}>Acciones rápidas</div>
              {results.actions.map(a => renderItem(a))}
            </>
          )}
          {query.trim() && (
            <>
              {results.leadHits?.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 16px 4px' }}>Leads ({results.leadHits.length})</div>
                  {results.leadHits.map(r => renderItem(r))}
                </>
              )}
              {results.propHits?.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 16px 4px' }}>Propiedades ({results.propHits.length})</div>
                  {results.propHits.map(r => renderItem(r))}
                </>
              )}
              {results.convHits?.length > 0 && (
                <>
                  <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '10px 16px 4px' }}>Mensajes ({results.convHits.length})</div>
                  {results.convHits.map(r => renderItem(r))}
                </>
              )}
              {flat.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
                  <div style={{ fontSize: 13.5, fontWeight: 500 }}>Sin resultados para "{query}"</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Probá con nombre, teléfono, código de propiedad o ubicación.</div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '8px 14px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="kbd" style={{ fontSize: 10 }}>↑</span><span className="kbd" style={{ fontSize: 10 }}>↓</span> navegar
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="kbd" style={{ fontSize: 10 }}>↵</span> seleccionar
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className="kbd" style={{ fontSize: 10 }}>esc</span> cerrar
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icons.sparkle size={11} style={{ color: 'var(--accent)' }}/>
            Búsqueda en {leads.length + properties.length} registros
          </span>
        </div>
      </div>
    </div>
  );
};

window.SearchPalette = SearchPalette;
