// Sidebar navigation

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dash', badge: null, group: 'main' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: 3, group: 'main' },
  { id: 'leads', label: 'Leads', icon: 'users', badge: null, group: 'main' },
  { id: 'tasks', label: 'Tareas', icon: 'check', badge: 'overdue', group: 'main' },
  { id: 'properties', label: 'Propiedades', icon: 'home', badge: null, group: 'main' },
  { id: 'calendar', label: 'Agenda', icon: 'calendar', badge: 5, group: 'main' },
  { id: 'reports', label: 'Reportes', icon: 'trend', badge: null, group: 'main' },
  { id: 'help', label: 'Ayuda', icon: 'sparkle', badge: null, group: 'main' },
];

const Sidebar = ({ current, onNav }) => {
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const overdueTasks = (window.MockData?.TASKS || []).filter(t => t.status === 'overdue').length;
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!userMenuOpen) return;
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [userMenuOpen]);

  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-logo">C</div>
        <div className="sb-brand-text">
          <div className="sb-brand-name">Casa<span className="serif" style={{ fontStyle: 'italic' }}>cr</span></div>
          <div className="sb-brand-sub">CRM Inmobiliario</div>
        </div>
      </div>

      <button className="btn accent" style={{ margin: '4px 4px 18px', justifyContent: 'center', padding: '9px 14px' }}>
        <Icons.plus size={15} stroke={2.4}/> Nuevo lead
      </button>

      <div className="sb-section">
        <div className="sb-section-title">Trabajo</div>
        {NAV.filter(n => n.group === 'main').map(n => {
          const Icon = Icons[n.icon];
          const active = current === n.id;
          // Resolve badge value
          let badgeVal = n.badge;
          let badgeColor = null;
          if (n.badge === 'overdue' && overdueTasks > 0) {
            badgeVal = overdueTasks;
            badgeColor = '#DC2626';
          } else if (n.badge === 'overdue') {
            badgeVal = null;
          }
          return (
            <button key={n.id}
              className={'sb-item ' + (active ? 'active' : '')}
              onClick={() => !n.disabled && onNav(n.id)}
              style={n.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null}
            >
              <span className="ico"><Icon size={17}/></span>
              {n.label}
              {badgeVal && <span className="sb-badge" style={badgeColor ? { background: badgeColor } : {}}>{badgeVal}</span>}
            </button>
          );
        })}
      </div>

      <div className="sb-section">
        <div className="sb-section-title">Etiquetas</div>
        {(() => {
          const leads = window.MockData?.LEADS || [];
          const TAGS = [
            { id: 'hot', label: 'Hot leads', dot: '#DC2626', test: l => l.tags?.includes('Hot') },
            { id: 'investor', label: 'Inversores', dot: '#F59E0B', test: l => l.tags?.includes('Inversión') || l.tags?.includes('Inversor') },
            { id: 'family', label: 'Familias', dot: '#0EA5E9', test: l => l.tags?.includes('Familia') },
            { id: 'rental', label: 'Alquileres', dot: '#15803D', test: l => l.operation === 'Alquiler' || l.tags?.includes('Alquiler') },
          ];
          return TAGS.map(t => {
            const count = leads.filter(t.test).length;
            const active = current === 'leads:' + t.id;
            return (
              <button key={t.id}
                onClick={() => onNav('leads', { filter: t.id })}
                className={'sb-item ' + (active ? 'active' : '')}
                style={{ padding: '6px 12px' }}
              >
                <span className="ico" style={{ width: 18 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, display: 'block' }} />
                </span>
                <span style={{ fontSize: 12.5 }}>{t.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{count}</span>
              </button>
            );
          });
        })()}
      </div>

      <div className="sb-spacer" />

      <div style={{ padding: '10px 8px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--muted)' }}>
        <span style={{ display: 'inline-flex', width: 8, height: 8, borderRadius: '50%', background: '#16A34A' }}></span>
        WhatsApp conectado
      </div>

      <div ref={menuRef} className="sb-user" style={{ position: 'relative' }}>
        <button onClick={() => setUserMenuOpen(!userMenuOpen)} style={{
          display: 'flex', alignItems: 'center', gap: 10, flex: 1,
          background: userMenuOpen ? 'var(--surface-2)' : 'transparent',
          padding: '6px 8px', margin: '-6px -8px', borderRadius: 8,
          cursor: 'pointer', width: 'calc(100% + 16px)', textAlign: 'left'
        }}>
          <div className="sb-user-av">MV</div>
          <div className="sb-user-info">
            <div className="sb-user-name">María Vargas</div>
            <div className="sb-user-role">Agente Senior</div>
          </div>
          <Icons.chevron size={12} style={{ color: 'var(--muted)', transform: userMenuOpen ? 'rotate(-90deg)' : 'rotate(90deg)', transition: 'transform 0.15s' }}/>
        </button>

        {userMenuOpen && (
          <div style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-2)',
            padding: 4,
            zIndex: 50,
          }}>
            <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>María Vargas Solano</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>maria@vargasbienes.cr</div>
            </div>
            {[
              { id: 'profile', label: 'Mi perfil', icon: 'user' },
              { id: 'settings', label: 'Configuración', icon: 'settings' },
              { id: 'billing', label: 'Plan y facturación', icon: 'trend' },
            ].map(m => {
              const Icon = Icons[m.icon];
              return (
                <button key={m.id} onClick={() => { onNav(m.id); setUserMenuOpen(false); }} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 6,
                  width: '100%', textAlign: 'left',
                  fontSize: 12.5, color: 'var(--ink-2)'
                }} className="sb-item">
                  <Icon size={14} style={{ color: 'var(--muted)' }}/>
                  {m.label}
                </button>
              );
            })}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
              <button style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 10px', borderRadius: 6,
                width: '100%', textAlign: 'left',
                fontSize: 12.5, color: '#DC2626'
              }} className="sb-item">
                <Icons.arrowleft size={14}/>
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
