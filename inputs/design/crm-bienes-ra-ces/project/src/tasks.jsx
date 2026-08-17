// Tasks module — vista global con filtros + creación

const { useState: useStateT, useMemo: useMemoT } = React;

const NOW_T = new Date('2026-05-17T10:30:00');
const START_OF_DAY = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const END_OF_DAY = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

const Tasks = ({ tasks: initialTasks, leads, properties, onOpenLead, onOpenProperty }) => {
  const [tasks, setTasks] = useStateT(initialTasks);
  const [filter, setFilter] = useStateT('today');
  const [showCompleted, setShowCompleted] = useStateT(false);
  const [showNewModal, setShowNewModal] = useStateT(false);
  const [search, setSearch] = useStateT('');

  // Compute buckets
  const buckets = useMemoT(() => {
    const today = [], thisWeek = [], later = [], overdue = [], noDate = [], done = [];
    const todayStart = START_OF_DAY(NOW_T);
    const todayEnd = END_OF_DAY(NOW_T);
    const weekEnd = new Date(todayEnd);
    weekEnd.setDate(weekEnd.getDate() + 7);

    tasks.forEach(t => {
      if (search) {
        const q = search.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.notes || '').toLowerCase().includes(q)) return;
      }
      if (t.status === 'done') { done.push(t); return; }
      if (!t.dueDate) { noDate.push(t); return; }
      const d = new Date(t.dueDate);
      if (d < todayStart || t.status === 'overdue') { overdue.push(t); return; }
      if (d >= todayStart && d <= todayEnd) { today.push(t); return; }
      if (d > todayEnd && d <= weekEnd) { thisWeek.push(t); return; }
      later.push(t);
    });

    // Sort each bucket by date
    [today, thisWeek, later, overdue].forEach(b => b.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)));
    return { today, thisWeek, later, overdue, noDate, done };
  }, [tasks, search]);

  const FILTERS = [
    { id: 'all', label: 'Todas', count: tasks.filter(t => t.status !== 'done').length, color: 'var(--ink-2)' },
    { id: 'today', label: 'Hoy', count: buckets.today.length, color: 'var(--accent)' },
    { id: 'week', label: 'Esta semana', count: buckets.thisWeek.length, color: '#0EA5E9' },
    { id: 'overdue', label: 'Atrasadas', count: buckets.overdue.length, color: '#DC2626' },
    { id: 'nodate', label: 'Sin fecha', count: buckets.noDate.length, color: '#94A3B8' },
    { id: 'later', label: 'Más adelante', count: buckets.later.length, color: 'var(--muted)' },
  ];

  const toggleDone = (id) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t));
  };

  const visibleTasks = useMemoT(() => {
    if (filter === 'all') {
      // Group everything
      return [
        { label: 'Atrasadas', tasks: buckets.overdue, color: '#DC2626' },
        { label: 'Hoy', tasks: buckets.today, color: 'var(--accent)' },
        { label: 'Esta semana', tasks: buckets.thisWeek, color: '#0EA5E9' },
        { label: 'Más adelante', tasks: buckets.later, color: 'var(--muted)' },
        { label: 'Sin fecha', tasks: buckets.noDate, color: '#94A3B8' },
      ].filter(g => g.tasks.length > 0);
    }
    if (filter === 'today') return [{ label: 'Hoy', tasks: buckets.today, color: 'var(--accent)' }];
    if (filter === 'week') return [{ label: 'Esta semana', tasks: buckets.thisWeek, color: '#0EA5E9' }];
    if (filter === 'overdue') return [{ label: 'Atrasadas', tasks: buckets.overdue, color: '#DC2626' }];
    if (filter === 'nodate') return [{ label: 'Sin fecha', tasks: buckets.noDate, color: '#94A3B8' }];
    if (filter === 'later') return [{ label: 'Más adelante', tasks: buckets.later, color: 'var(--muted)' }];
    return [];
  }, [filter, buckets]);

  // Stats for the header
  const completedToday = tasks.filter(t => t.status === 'done' && t.dueDate && new Date(t.dueDate).toDateString() === NOW_T.toDateString()).length;
  const totalPending = tasks.filter(t => t.status !== 'done').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Tareas</h2>
          <div className="sub">
            {totalPending} pendientes · {buckets.overdue.length > 0 && <span style={{ color: '#DC2626', fontWeight: 600 }}>{buckets.overdue.length} atrasadas · </span>}
            {completedToday} completadas hoy
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Icons.search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar tarea..."
              style={{ padding: '7px 10px 7px 30px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, width: 220, outline: 0 }}
            />
          </div>
          <button className="btn accent" onClick={() => setShowNewModal(true)}><Icons.plus size={14} stroke={2.4}/> Nueva tarea</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 18 }}>
        {/* Left rail with filters */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 18 }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', borderRadius: 8,
                background: filter === f.id ? 'var(--accent-soft)' : 'transparent',
                color: filter === f.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                fontSize: 13, fontWeight: filter === f.id ? 600 : 500,
                width: '100%', textAlign: 'left',
                borderLeft: '3px solid ' + (filter === f.id ? 'var(--accent)' : 'transparent'),
                paddingLeft: 9
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: f.color }}/>
                  {f.label}
                </span>
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 999,
                  background: filter === f.id ? 'var(--accent)' : 'var(--surface-2)',
                  color: filter === f.id ? 'white' : 'var(--muted)',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums'
                }}>{f.count}</span>
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingLeft: 12 }}>
            Por tipo
          </div>
          {Object.entries(MockData.TASK_KINDS).filter(([k]) => !['reminder', 'message', 'reactivate'].includes(k)).map(([k, meta]) => {
            const Icon = Icons[meta.icon];
            const count = tasks.filter(t => t.kind === k && t.status !== 'done').length;
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', fontSize: 12.5, color: 'var(--ink-2)' }}>
                <Icon size={13} style={{ color: meta.color }}/>
                <span style={{ flex: 1 }}>{meta.label}</span>
                <span style={{ color: 'var(--muted)' }}>{count}</span>
              </div>
            );
          })}

          <div style={{ marginTop: 18, padding: 14, background: 'linear-gradient(135deg, #F3EBFF, #FAF5FF)', border: '1px solid #E0CCFF', borderRadius: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#5B21B6', marginBottom: 4 }}>
              <Icons.bot size={13}/> Automatización
            </div>
            <div style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {tasks.filter(t => t.type === 'auto' && t.status !== 'done').length} tareas automáticas activas en este momento.
            </div>
          </div>
        </div>

        {/* Right side — task list */}
        <div>
          {/* Quick add */}
          <div className="card" style={{ padding: 12, marginBottom: 14, display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNewModal(true)} style={{
              flex: 1, padding: '8px 14px', textAlign: 'left',
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer'
            }}>
              <Icons.plus size={14}/>
              Agregar tarea rápida...
            </button>
          </div>

          {visibleTasks.length === 0 && (
            <div className="card" style={{ padding: 60, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{filter === 'today' ? '🎉' : '📭'}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                {filter === 'today' ? '¡Día limpio!' : filter === 'overdue' ? 'No hay tareas atrasadas' : 'Nada por aquí'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {filter === 'today' ? 'No tienes tareas pendientes para hoy.' : filter === 'overdue' ? 'Estás al día con todo. 👏' : 'No hay tareas en esta vista.'}
              </div>
            </div>
          )}

          {visibleTasks.map(group => (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: group.color }}/>
                <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--muted)' }}>{group.label}</h3>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', background: 'var(--surface-2)', padding: '1px 7px', borderRadius: 999 }}>{group.tasks.length}</span>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {group.tasks.map((t, i) => (
                  <TaskRow key={t.id} task={t} leads={leads} properties={properties}
                    onToggle={() => toggleDone(t.id)}
                    onOpenLead={onOpenLead} onOpenProperty={onOpenProperty}
                    isLast={i === group.tasks.length - 1}/>
                ))}
              </div>
            </div>
          ))}

          {/* Completed section */}
          <div style={{ marginTop: 28, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            <button onClick={() => setShowCompleted(!showCompleted)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12.5, fontWeight: 600, color: 'var(--muted)',
              padding: '4px 8px', borderRadius: 6
            }}>
              <Icons.chevron size={12} style={{ transform: showCompleted ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}/>
              Completadas ({buckets.done.length})
            </button>
            {showCompleted && (
              <div className="card" style={{ marginTop: 10, padding: 0, overflow: 'hidden' }}>
                {buckets.done.map((t, i) => (
                  <TaskRow key={t.id} task={t} leads={leads} properties={properties}
                    onToggle={() => toggleDone(t.id)}
                    onOpenLead={onOpenLead} onOpenProperty={onOpenProperty}
                    isLast={i === buckets.done.length - 1} completed/>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showNewModal && <NewTaskModal onClose={() => setShowNewModal(false)} leads={leads} properties={properties} onCreate={(t) => { setTasks([...tasks, { ...t, id: `t${tasks.length + 100}`, status: 'pending', type: 'manual', source: 'a1' }]); setShowNewModal(false); }}/>}
    </div>
  );
};

// — Task row component
const TaskRow = ({ task: t, leads, properties, onToggle, onOpenLead, onOpenProperty, isLast, completed }) => {
  const kindMeta = MockData.TASK_KINDS[t.kind];
  const Icon = Icons[kindMeta.icon];
  const isBot = t.type === 'auto';
  const isOverdue = t.status === 'overdue';
  const lead = t.leadId ? leads.find(l => l.id === t.leadId) : null;
  const property = t.propertyId ? properties.find(p => p.id === t.propertyId) : null;

  const formatDate = (dd) => {
    if (!dd) return null;
    const d = new Date(dd);
    const today = new Date(NOW_T);
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const dayStart = new Date(d); dayStart.setHours(0,0,0,0);
    if (dayStart.getTime() === today.getTime()) return `Hoy ${d.toTimeString().slice(0, 5)}`;
    if (dayStart.getTime() === tomorrow.getTime()) return `Mañana ${d.toTimeString().slice(0, 5)}`;
    if (dayStart.getTime() === yesterday.getTime()) return `Ayer ${d.toTimeString().slice(0, 5)}`;
    return d.toLocaleString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      background: isBot && !completed ? 'rgba(124, 58, 237, 0.04)' : 'transparent',
      opacity: completed ? 0.55 : 1,
      borderLeft: '3px solid ' + (isOverdue ? '#DC2626' : t.priority === 'high' ? 'var(--accent)' : 'transparent'),
      paddingLeft: 13
    }}>
      <button onClick={onToggle} disabled={isBot && !completed} style={{
        width: 20, height: 20, borderRadius: '50%',
        border: '2px solid ' + (completed ? '#16A34A' : isBot ? '#C4B5FD' : 'var(--border-strong)'),
        background: completed ? '#16A34A' : 'transparent',
        flexShrink: 0, marginTop: 2,
        display: 'grid', placeItems: 'center',
        cursor: isBot && !completed ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s'
      }} title={isBot ? 'Gestionada por el bot' : 'Marcar como hecha'}>
        {completed && <Icons.check size={11} stroke={3} style={{ color: 'white' }}/>}
      </button>

      <Icon size={15} style={{ color: kindMeta.color, flexShrink: 0, marginTop: 3 }}/>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 13.5, fontWeight: 600,
            textDecoration: completed ? 'line-through' : 'none',
            color: completed ? 'var(--muted)' : 'var(--ink)'
          }}>{t.title}</span>
          {isBot && !completed && (
            <span style={{ background: '#F3EBFF', color: '#7C3AED', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Icons.bot size={10} stroke={2.4}/> Bot
            </span>
          )}
          {isOverdue && <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>⚠️ Atrasada</span>}
          {t.priority === 'high' && !isOverdue && <span style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)', padding: '1px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>🔥 Alta</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5, color: 'var(--muted)', marginTop: 4, flexWrap: 'wrap' }}>
          {t.dueDate ? (
            <span style={{ color: isOverdue ? '#DC2626' : 'var(--muted)', fontWeight: isOverdue ? 600 : 400 }}>
              📅 {formatDate(t.dueDate)}
            </span>
          ) : (
            <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>Sin fecha</span>
          )}
          {lead && (
            <button onClick={() => onOpenLead(lead.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-deep)', fontWeight: 500, cursor: 'pointer', background: 'transparent', border: 0 }}>
              <Avatar name={lead.name} size={14}/>
              {lead.name}
            </button>
          )}
          {property && (
            <button onClick={() => onOpenProperty(property.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-deep)', fontWeight: 500, cursor: 'pointer', background: 'transparent', border: 0 }}>
              <Icons.home size={11}/>
              {property.code} {property.title}
            </button>
          )}
          {t.location && <span>📍 {t.location}</span>}
          <span style={{ color: 'var(--muted)' }}>· <span className="tag" style={{ fontSize: 10, padding: '1px 5px' }}>{kindMeta.label}</span></span>
        </div>
        {t.notes && !completed && (
          <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 6, padding: 7, background: 'var(--surface-2)', borderRadius: 5, lineHeight: 1.45 }}>
            {t.notes}
          </div>
        )}
      </div>

      {!isBot && !completed && (
        <button className="icon-btn" style={{ width: 26, height: 26 }} title="Más opciones">
          <Icons.more size={13}/>
        </button>
      )}
    </div>
  );
};

// — New task modal
const NewTaskModal = ({ onClose, onCreate, leads, properties }) => {
  const [form, setForm] = useStateT({
    title: '', kind: 'call', dueDate: '', priority: 'normal',
    leadId: '', propertyId: '', notes: '',
  });
  const update = (k, v) => setForm({ ...form, [k]: v });

  const submit = () => {
    if (!form.title.trim()) return;
    const task = {
      title: form.title,
      kind: form.kind,
      dueDate: form.dueDate || null,
      priority: form.priority,
      notes: form.notes || undefined,
    };
    if (form.leadId) task.leadId = form.leadId;
    if (form.propertyId) task.propertyId = form.propertyId;
    onCreate(task);
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(34, 28, 22, 0.45)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, maxWidth: '100%',
        background: 'var(--surface)', borderRadius: 14,
        boxShadow: 'var(--shadow-3)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Nueva tarea</h3>
          <button onClick={onClose} className="icon-btn"><Icons.close size={14}/></button>
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 14 }}>
          <input
            value={form.title}
            onChange={e => update('title', e.target.value)}
            placeholder="¿Qué necesitas hacer?"
            autoFocus
            style={{ padding: '12px 14px', fontSize: 16, fontWeight: 500, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, outline: 0, fontFamily: 'inherit' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <ModField label="Tipo">
              <select value={form.kind} onChange={e => update('kind', e.target.value)} className="m-inp">
                <option value="call">📞 Llamada</option>
                <option value="visit">🏡 Visita</option>
                <option value="meeting">👥 Reunión</option>
                <option value="doc">📄 Documento</option>
                <option value="followup">⚡ Seguimiento</option>
              </select>
            </ModField>
            <ModField label="Fecha límite">
              <input type="datetime-local" value={form.dueDate} onChange={e => update('dueDate', e.target.value)} className="m-inp"/>
            </ModField>
            <ModField label="Prioridad">
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { id: 'normal', label: 'Normal' },
                  { id: 'high', label: '🔥 Alta' },
                ].map(p => (
                  <button key={p.id} onClick={() => update('priority', p.id)} style={{
                    flex: 1, padding: '6px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    background: form.priority === p.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: form.priority === p.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                    border: '1px solid ' + (form.priority === p.id ? 'var(--accent)' : 'var(--border)'),
                  }}>{p.label}</button>
                ))}
              </div>
            </ModField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ModField label="Vincular a lead">
              <select value={form.leadId} onChange={e => update('leadId', e.target.value)} className="m-inp">
                <option value="">Ninguno (tarea propia)</option>
                {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </ModField>
            <ModField label="Vincular a propiedad">
              <select value={form.propertyId} onChange={e => update('propertyId', e.target.value)} className="m-inp">
                <option value="">Ninguna</option>
                {properties.map(p => <option key={p.id} value={p.id}>{p.code} — {p.title}</option>)}
              </select>
            </ModField>
          </div>

          <ModField label="Notas (opcional)">
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
              placeholder="Detalles, ubicación, recordatorios..."
              rows={3}
              className="m-inp"
              style={{ resize: 'vertical', fontFamily: 'inherit' }}/>
          </ModField>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            💡 Tip: Tareas vinculadas a leads aparecen también en su perfil.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={onClose}>Cancelar</button>
            <button className="btn accent" onClick={submit} disabled={!form.title.trim()}>Crear tarea</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModField = ({ label, children }) => (
  <div>
    <label style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5, display: 'block' }}>{label}</label>
    {children}
  </div>
);

window.Tasks = Tasks;
