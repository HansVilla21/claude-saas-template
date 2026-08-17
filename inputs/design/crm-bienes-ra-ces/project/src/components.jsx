// Shared components: avatars, pills, property cards, badges

const { useState, useEffect, useRef, useMemo } = React;

// — Avatar
const Avatar = ({ name, size = 32, color, src, status }) => {
  const initials = name
    ? name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
    : '?';
  const hash = name ? [...name].reduce((a, c) => a + c.charCodeAt(0), 0) : 0;
  const palette = ['#C2410C', '#15803D', '#7C3AED', '#0EA5E9', '#DB2777', '#CA8A04', '#0F766E'];
  const bg = color || palette[hash % palette.length];
  return (
    <div className="avatar" style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      display: 'grid', placeItems: 'center',
      fontSize: size * 0.38, fontWeight: 600,
      flexShrink: 0, position: 'relative',
      letterSpacing: '-0.02em'
    }}>
      {initials}
      {status && <span style={{
        position: 'absolute', bottom: -1, right: -1,
        width: size * 0.32, height: size * 0.32, borderRadius: '50%',
        background: status === 'online' ? '#16A34A' : status === 'bot' ? '#7C3AED' : '#94A3B8',
        border: '2px solid white'
      }} />}
    </div>
  );
};

// — Status pill (lead status)
const StatusPill = ({ status, size = 'md' }) => {
  const s = MockData.STATUSES[status] || { color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span className="pill" style={{
      color: s.color, background: s.bg,
      padding: size === 'sm' ? '2px 7px' : '3px 9px',
      fontSize: size === 'sm' ? '10.5px' : '11.5px'
    }}>
      <span className="dot" />
      {status}
    </span>
  );
};

// — Handler badge (Bot vs Human)
const HandlerBadge = ({ handler, size = 'md' }) => {
  const isBot = handler === 'bot';
  const Icon = isBot ? Icons.bot : Icons.user;
  return (
    <span className="pill" style={{
      color: isBot ? '#7C3AED' : '#16A34A',
      background: isBot ? '#F3EBFF' : '#DCFCE7',
      padding: size === 'sm' ? '2px 6px' : '3px 8px',
      fontSize: size === 'sm' ? '10.5px' : '11.5px',
      gap: 4
    }}>
      <Icon size={size === 'sm' ? 11 : 12} stroke={2} />
      {isBot ? 'Bot' : 'Agente'}
    </span>
  );
};

// — Property card (used in chat, property grid)
const PropertyCard = ({ property, variant = 'default', onClick, selected }) => {
  if (!property) return null;
  const p = property;
  const formatPrice = (price, currency, operation) => {
    const formatted = new Intl.NumberFormat('en-US').format(price);
    return `$${formatted}${operation === 'Alquiler' ? '/mes' : ''}`;
  };

  if (variant === 'chat') {
    return (
      <div style={{
        background: 'white', borderRadius: 10,
        border: '1px solid var(--border)',
        maxWidth: 280, overflow: 'hidden',
        boxShadow: 'var(--shadow-1)'
      }}>
        <div style={{
          height: 140, background: 'var(--surface-3)',
          display: 'grid', placeItems: 'center', fontSize: 50,
          position: 'relative'
        }}>
          {p.images?.[0] || '🏡'}
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(34,28,22,0.85)', color: 'white',
            padding: '3px 8px', borderRadius: 6,
            fontSize: 10.5, fontWeight: 600,
            fontFamily: 'var(--font-mono)'
          }}>{p.code}</span>
        </div>
        <div style={{ padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{p.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
            📍 {p.location}
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--ink-2)', marginBottom: 8 }}>
            {p.bedrooms && <span>🛏 {p.bedrooms}</span>}
            {p.bathrooms && <span>🛁 {p.bathrooms}</span>}
            {p.area && <span>📐 {p.area}m²</span>}
          </div>
          <div style={{
            fontWeight: 700, fontSize: 15,
            color: 'var(--accent-deep)'
          }}>{formatPrice(p.price, p.currency, p.operation)}</div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div onClick={onClick} style={{
        display: 'flex', gap: 10, alignItems: 'center',
        padding: 10, borderRadius: 8,
        cursor: 'pointer',
        background: selected ? 'var(--accent-soft)' : 'transparent',
        border: '1px solid ' + (selected ? 'var(--accent)' : 'transparent'),
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8,
          background: 'var(--surface-3)',
          display: 'grid', placeItems: 'center', fontSize: 22, flexShrink: 0
        }}>{p.images?.[0]}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.code} · {formatPrice(p.price, p.currency, p.operation)}</div>
        </div>
      </div>
    );
  }

  // default = grid card
  return (
    <div onClick={onClick} className="prop-card" style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'transform 0.18s ease, box-shadow 0.18s ease',
    }}>
      <div style={{
        aspectRatio: '4 / 3',
        background: `linear-gradient(135deg, ${p.featured ? '#F4E2D6' : 'var(--surface-3)'}, var(--surface-2))`,
        display: 'grid', placeItems: 'center',
        fontSize: 64,
        position: 'relative',
        overflow: 'hidden'
      }}>
        <span style={{ filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.10))' }}>{p.images?.[0]}</span>
        {p.featured && (
          <span style={{
            position: 'absolute', top: 10, left: 10,
            background: 'var(--accent)', color: 'white',
            padding: '4px 9px', borderRadius: 999,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.03em',
            textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 4
          }}><Icons.star size={11} stroke={2.5}/> Destacada</span>
        )}
        <span style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)',
          color: 'var(--ink)', padding: '4px 8px', borderRadius: 6,
          fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 600
        }}>{p.code}</span>
        <span style={{
          position: 'absolute', bottom: 10, left: 10,
          background: p.operation === 'Venta' ? 'var(--accent-deep)' : '#15803D',
          color: 'white',
          padding: '3px 8px', borderRadius: 6,
          fontSize: 10.5, fontWeight: 600
        }}>{p.operation}</span>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{p.title}</h3>
          <span className="pill" style={{
            background: p.status === 'Disponible' ? '#DCFCE7' : '#FEF3C7',
            color: p.status === 'Disponible' ? '#15803D' : '#92400E',
            fontSize: 10
          }}><span className="dot"/>{p.status}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icons.location size={12}/>{p.location}
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink-2)', marginBottom: 12 }}>
          {p.bedrooms !== undefined && <span style={{ display:'flex', alignItems: 'center', gap: 4 }}><Icons.bed size={13}/>{p.bedrooms}</span>}
          {p.bathrooms !== undefined && <span style={{ display:'flex', alignItems: 'center', gap: 4 }}><Icons.bath size={13}/>{p.bathrooms}</span>}
          {p.area && <span style={{ display:'flex', alignItems: 'center', gap: 4 }}><Icons.ruler size={13}/>{p.area}m²</span>}
          {p.parking !== undefined && <span style={{ display:'flex', alignItems: 'center', gap: 4 }}><Icons.car size={13}/>{p.parking}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22, fontWeight: 500,
            color: 'var(--accent-deep)',
            letterSpacing: '-0.01em'
          }}>{formatPrice(p.price, p.currency, p.operation)}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icons.eye size={11}/>{p.views}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Icons.users size={11}/>{p.leads}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// — Section divider with label
const Section = ({ title, action, children, padding = true }) => (
  <div style={{ marginBottom: 24 }}>
    {title && (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 600 }}>{title}</h3>
        {action}
      </div>
    )}
    {children}
  </div>
);

// — Topbar
const Topbar = ({ title, sub, actions, breadcrumb, onSearchClick, onBellClick, notifCount }) => (
  <div className="topbar">
    <div className="topbar-title">
      {breadcrumb && (
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>
          {breadcrumb} <span style={{ margin: '0 6px' }}>/</span>
        </span>
      )}
      <h1>{title}</h1>
      {sub && <span className="sub">{sub}</span>}
    </div>
    <div className="topbar-spacer" />
    <button className="search" onClick={onSearchClick} style={{ cursor: 'pointer', textAlign: 'left' }}>
      <Icons.search size={14}/>
      <span style={{ flex: 1, color: 'var(--muted)' }}>Buscar leads, propiedades, mensajes...</span>
      <span className="kbd">⌘K</span>
    </button>
    <button className="icon-btn" onClick={onBellClick} title="Notificaciones" style={{ position: 'relative' }}>
      <Icons.bell size={17}/>
      {notifCount > 0 && (
        <span style={{
          position: 'absolute', top: 3, right: 3,
          minWidth: 14, height: 14, borderRadius: 7,
          background: 'var(--accent)', color: 'white',
          fontSize: 9, fontWeight: 700,
          display: 'grid', placeItems: 'center',
          border: '2px solid var(--surface)',
          padding: '0 3px'
        }}>{notifCount}</span>
      )}
    </button>
    {actions}
  </div>
);

Object.assign(window, {
  Avatar, StatusPill, HandlerBadge, PropertyCard, Section, Topbar
});
