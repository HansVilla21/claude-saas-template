// Notifications panel — dropdown desde la campanita

const { useState: useStateN, useEffect: useEffectN, useRef: useRefN } = React;

const NOTIFICATIONS = [
  {
    id: 'n1', kind: 'handoff', read: false, time: 'hace 3 min',
    icon: 'handoff', color: '#F59E0B',
    title: 'Roberto Quirós necesita un agente',
    body: 'El bot detectó intención de inversión. Listo para handoff.',
    leadId: 'l2', actionLabel: 'Tomar chat'
  },
  {
    id: 'n2', kind: 'hot', read: false, time: 'hace 12 min',
    icon: 'flame', color: '#DC2626',
    title: 'Daniela Mora respondió',
    body: 'Confirmó visita para el sábado 18/05 a las 10:00 a.m.',
    leadId: 'l1', actionLabel: 'Ver chat'
  },
  {
    id: 'n3', kind: 'task', read: false, time: 'hace 38 min',
    icon: 'bell', color: '#0EA5E9',
    title: 'Tarea atrasada',
    body: 'Enviar uso de suelo y permisos del lote a Diego Salas (vencía ayer 4:00 p.m.).',
    leadId: 'l6', actionLabel: 'Ver tarea'
  },
  {
    id: 'n4', kind: 'visit', read: true, time: 'hace 1 h',
    icon: 'calendar', color: '#16A34A',
    title: 'Visita mañana 10:00 a.m.',
    body: 'Visita CR-2031 con Daniela Mora · Trejos Montealegre, Escazú',
    leadId: 'l1', actionLabel: 'Ver agenda'
  },
  {
    id: 'n5', kind: 'milestone', read: true, time: 'hace 2 h',
    icon: 'trend', color: 'var(--accent)',
    title: 'Hito: 100 leads en mayo',
    body: '¡Alcanzaste 100 leads este mes! Es 32% más que abril.',
    actionLabel: 'Ver dashboard'
  },
  {
    id: 'n6', kind: 'bot', read: true, time: 'hace 3 h',
    icon: 'bot', color: '#7C3AED',
    title: 'Resumen del bot · Hoy',
    body: 'El bot resolvió 47 conversaciones sin intervención humana (92% del total).',
    actionLabel: 'Ver reporte'
  },
  {
    id: 'n7', kind: 'doc', read: true, time: 'ayer',
    icon: 'paperclip', color: '#EA580C',
    title: 'Documento recibido',
    body: 'Daniela Mora subió su constancia salarial al expediente.',
    leadId: 'l1', actionLabel: 'Ver documento'
  },
  {
    id: 'n8', kind: 'close', read: true, time: 'ayer',
    icon: 'check', color: '#16A34A',
    title: '🎉 Cierre confirmado',
    body: 'Fernanda Ulate firmó la promesa de compraventa de CR-2052. Comisión: $13,750.',
    leadId: 'l7', actionLabel: 'Ver lead'
  },
];

const NotificationsPanel = ({ onClose, onOpenLead, onNav }) => {
  const [filter, setFilter] = useStateN('all');
  const [notifs, setNotifs] = useStateN(NOTIFICATIONS);
  const ref = useRefN(null);

  useEffectN(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  const filtered = notifs.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'all') return true;
    return n.kind === filter;
  });
  const unreadCount = notifs.filter(n => !n.read).length;

  const markAllRead = () => setNotifs(notifs.map(n => ({ ...n, read: true })));

  const handleClick = (n) => {
    setNotifs(notifs.map(x => x.id === n.id ? { ...x, read: true } : x));
    if (n.leadId) {
      onOpenLead(n.leadId);
      onClose();
    } else if (n.kind === 'milestone' || n.kind === 'bot') {
      onNav('dashboard');
      onClose();
    } else if (n.kind === 'visit') {
      onNav('calendar');
      onClose();
    }
  };

  return (
    <div ref={ref} style={{
      position: 'absolute',
      top: 56, right: 18,
      width: 400, maxHeight: 'calc(100vh - 80px)',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-3)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Notificaciones</h3>
          {unreadCount > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{unreadCount} sin leer</div>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="btn ghost sm" style={{ fontSize: 11.5 }}>
              Marcar todo leído
            </button>
          )}
          <button className="icon-btn" style={{ width: 28, height: 28 }} title="Configuración">
            <Icons.settings size={14}/>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
        {[
          { id: 'all', label: 'Todas' },
          { id: 'unread', label: `Sin leer (${unreadCount})` },
          { id: 'handoff', label: 'Handoffs' },
          { id: 'task', label: 'Tareas' },
          { id: 'visit', label: 'Agenda' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: '4px 10px', borderRadius: 999,
            fontSize: 11.5, fontWeight: 500,
            background: filter === f.id ? 'var(--ink)' : 'transparent',
            color: filter === f.id ? 'white' : 'var(--ink-2)',
            border: '1px solid ' + (filter === f.id ? 'var(--ink)' : 'var(--border)'),
            whiteSpace: 'nowrap'
          }}>{f.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
            No hay notificaciones por aquí.
          </div>
        )}
        {filtered.map(n => {
          const Icon = Icons[n.icon];
          return (
            <button key={n.id} onClick={() => handleClick(n)} style={{
              display: 'flex', gap: 12,
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              background: n.read ? 'transparent' : 'rgba(212, 165, 90, 0.04)',
              width: '100%', textAlign: 'left',
              transition: 'background 0.12s'
            }} className="notif-item">
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: n.color + '20', color: n.color,
                display: 'grid', placeItems: 'center', flexShrink: 0,
                position: 'relative'
              }}>
                <Icon size={15}/>
                {!n.read && (
                  <span style={{ position: 'absolute', top: -2, right: -2, width: 9, height: 9, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface)' }}/>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.read ? 500 : 600, marginBottom: 2 }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45, marginBottom: 6 }}>{n.body}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{n.time}</span>
                  {n.actionLabel && (
                    <span style={{ fontSize: 11.5, color: 'var(--accent-deep)', fontWeight: 600 }}>
                      → {n.actionLabel}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ padding: '10px 16px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--muted)', textAlign: 'center' }}>
        Las notificaciones se envían también por <strong>WhatsApp</strong> a tu número personal
      </div>

      <style>{`.notif-item:hover{ background: var(--surface-2) !important; }`}</style>
    </div>
  );
};

window.NotificationsPanel = NotificationsPanel;
window.__notifUnread = NOTIFICATIONS.filter(n => !n.read).length;
