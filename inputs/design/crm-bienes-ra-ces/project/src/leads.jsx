// Leads list/table + detail

const { useState: useStateL, useMemo: useMemoL } = React;

const formatRelDate = (s) => {
  if (!s) return '';
  return s.replace(/^2026-/, '').replace(/T/, ' ');
};

const LeadsTable = ({ leads, onOpenLead, onOpenInbox, initialFilter }) => {
  const [filter, setFilter] = useStateL(initialFilter || 'all');
  const [sortBy, setSortBy] = useStateL('recent');
  const [view, setView] = useStateL('table'); // 'table' | 'pipeline'

  React.useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
  }, [initialFilter]);

  const filtered = leads.filter(l => {
    if (filter === 'all') return true;
    if (filter === 'hot') return l.tags?.includes('Hot');
    if (filter === 'unassigned') return !l.assignedTo;
    if (filter === 'mine') return l.assignedTo === 'a1';
    if (filter === 'bot') return l.bot;
    if (filter === 'investor') return l.tags?.includes('Inversión') || l.tags?.includes('Inversor');
    if (filter === 'family') return l.tags?.includes('Familia');
    if (filter === 'rental') return l.operation === 'Alquiler' || l.tags?.includes('Alquiler');
    return true;
  });

  const PIPELINE_STAGES = [
    { id: 'Nuevo', label: 'Nuevo', color: '#3B82F6' },
    { id: 'Contactado', label: 'Contactado', color: '#8B5CF6' },
    { id: 'Calificado', label: 'Calificado', color: '#F59E0B' },
    { id: 'Visita agendada', label: 'Visita', color: '#0EA5E9' },
    { id: 'En negociación', label: 'Negociación', color: '#EA580C' },
    { id: 'Cerrado ganado', label: 'Ganado', color: '#16A34A' },
  ];

  return (
    <div className="page" style={{ padding: 0 }}>
      <div style={{ padding: 'var(--pad-5)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <h2>Leads</h2>
            <div className="sub">{leads.length} leads totales · {leads.filter(l => l.tags?.includes('Hot')).length} marcados como hot · {leads.filter(l => !l.assignedTo).length} sin asignar</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost"><Icons.download size={14}/> Exportar</button>
            <button className="btn accent"><Icons.plus size={14} stroke={2.4}/> Nuevo lead</button>
          </div>
        </div>

        {/* Metric strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12,
        }}>
          {[
            { label: 'Nuevos hoy', value: '4', delta: '+2', color: '#3B82F6' },
            { label: 'Conversaciones activas', value: '12', delta: '+5', color: '#0EA5E9' },
            { label: 'Calificados', value: '8', delta: '+1', color: '#F59E0B' },
            { label: 'Visitas esta semana', value: '6', delta: '+3', color: '#0EA5E9' },
            { label: 'En negociación', value: '3', delta: '0', color: '#EA580C' },
            { label: 'Cerrados (mes)', value: '5', delta: '+2', color: '#16A34A' },
          ].map(m => (
            <div key={m.label} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>{m.value}</span>
                <span style={{ fontSize: 11, color: m.color, fontWeight: 600 }}>{m.delta}</span>
              </div>
            </div>
          ))}
        </div>

        {/* View toggle + filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', background: 'var(--surface-2)',
            border: '1px solid var(--border)', borderRadius: 8, padding: 2
          }}>
            {[{ id: 'table', icon: 'list', label: 'Tabla' }, { id: 'pipeline', icon: 'grid', label: 'Pipeline' }].map(v => {
              const Icon = Icons[v.icon];
              return (
                <button key={v.id} onClick={() => setView(v.id)} style={{
                  padding: '5px 12px', borderRadius: 6,
                  background: view === v.id ? 'var(--surface)' : 'transparent',
                  color: view === v.id ? 'var(--ink)' : 'var(--muted)',
                  fontSize: 12.5, fontWeight: 500,
                  boxShadow: view === v.id ? 'var(--shadow-1)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 5
                }}>
                  <Icon size={13}/> {v.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'hot', label: '🔥 Hot' },
              { id: 'mine', label: 'Asignados a mí' },
              { id: 'unassigned', label: 'Sin asignar' },
              { id: 'bot', label: 'Con bot' },
              { id: 'investor', label: '💼 Inversores' },
              { id: 'family', label: '👨‍👩‍👧 Familias' },
              { id: 'rental', label: '🔑 Alquileres' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{
                  padding: '5px 11px', borderRadius: 999,
                  fontSize: 12.5, fontWeight: 500,
                  background: filter === f.id ? 'var(--ink)' : 'var(--surface)',
                  color: filter === f.id ? 'white' : 'var(--ink-2)',
                  border: '1px solid ' + (filter === f.id ? 'var(--ink)' : 'var(--border)'),
                }}>
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }}/>

          <button className="btn ghost sm"><Icons.filter size={13}/> Más filtros</button>
          <button className="btn ghost sm"><Icons.sort size={13}/> Ordenar</button>
        </div>
      </div>

      {/* Body */}
      {view === 'table' && (
        <div style={{ padding: '0 var(--pad-5) var(--pad-5)' }}>
          {filtered.length === 0 ? (
            <div className="card" style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>👥</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
                {leads.length === 0 ? 'Aún no tenés leads' : 'Sin resultados con este filtro'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16, maxWidth: 360, margin: '0 auto 16px' }}>
                {leads.length === 0
                  ? 'Cuando alguien escriba al WhatsApp o llene tu formulario web, aparecerá aquí automáticamente.'
                  : 'Probá con otro filtro o quita los filtros activos.'}
              </div>
              {leads.length === 0 ? (
                <button className="btn accent"><Icons.plus size={13}/> Agregar lead manual</button>
              ) : (
                <button className="btn ghost" onClick={() => setFilter('all')}>Ver todos los leads</button>
              )}
            </div>
          ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                  {['Lead', 'Estado', 'Interés', 'Presupuesto', 'Fuente', 'Asignado', 'Último contacto', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const agent = MockData.AGENTS.find(a => a.id === l.assignedTo);
                  return (
                    <tr key={l.id} onClick={() => onOpenLead(l.id)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      className="lead-row">
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar name={l.name} size={32}/>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{l.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l.phone}</div>
                          </div>
                          {l.tags?.includes('Hot') && <span title="Hot lead">🔥</span>}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px' }}><StatusPill status={l.status}/></td>
                      <td style={{ padding: '11px 14px', color: 'var(--ink-2)', fontSize: 13 }}>{l.interest}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--ink-2)', fontSize: 13, fontWeight: 500 }}>{l.budget}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span className="tag">{l.source}</span>
                      </td>
                      <td style={{ padding: '11px 14px' }}>
                        {agent ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Avatar name={agent.name} size={22} color={agent.color}/>
                            <span style={{ fontSize: 12.5 }}>{agent.name}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icons.bot size={13}/> Bot
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{l.lastContact?.replace('2026-05-', '')}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onOpenInbox(l.id); }} title="Abrir chat" style={{ width: 28, height: 28 }}>
                          <Icons.whatsapp size={15} style={{ color: 'var(--whatsapp-deep)' }}/>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {view === 'pipeline' && (
        <div style={{ padding: '0 var(--pad-5) var(--pad-5)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(220px, 1fr))', gap: 12, overflowX: 'auto' }}>
            {PIPELINE_STAGES.map(stage => {
              const stageLeads = filtered.filter(l => l.status === stage.id);
              return (
                <div key={stage.id} style={{
                  background: 'var(--surface-2)',
                  borderRadius: 12,
                  padding: 10,
                  border: '1px solid var(--border)',
                  minHeight: 300
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 50, background: stage.color }}/>
                      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{stage.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', padding: '1px 6px', borderRadius: 999, border: '1px solid var(--border)' }}>{stageLeads.length}</span>
                    </div>
                    <button className="icon-btn" style={{ width: 22, height: 22 }}><Icons.plus size={12}/></button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stageLeads.map(l => (
                      <div key={l.id} onClick={() => onOpenLead(l.id)}
                        className="card"
                        style={{ padding: 12, cursor: 'pointer', boxShadow: 'var(--shadow-1)' }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <Avatar name={l.name} size={28}/>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{l.source}</div>
                          </div>
                          {l.tags?.includes('Hot') && <span>🔥</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginBottom: 6, lineHeight: 1.4 }}>{l.interest}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                          <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{l.budget}</span>
                          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onOpenInbox(l.id); }} style={{ width: 22, height: 22 }}>
                            <Icons.whatsapp size={13} style={{ color: 'var(--whatsapp-deep)' }}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// — Lead detail
const LeadDetail = ({ lead, properties, onBack, onOpenInbox }) => {
  const [tab, setTab] = useStateL('overview');
  const interested = (lead.interestedIn || []).map(id => properties.find(p => p.id === id)).filter(Boolean);
  const agent = MockData.AGENTS.find(a => a.id === lead.assignedTo);

  // Tasks, documents, visits for this lead
  const tasks = (MockData.TASKS || []).filter(t => t.leadId === lead.id);
  const docs = (MockData.DOCUMENTS || []).filter(d => d.leadId === lead.id);
  const events = (MockData.EVENTS || []).filter(e => e.leadId === lead.id);

  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'overdue');
  const upcomingEvents = events.filter(e => new Date(e.start) >= new Date('2026-05-17'));

  // Commission calc
  const primaryProperty = interested[0];
  const commissionRate = primaryProperty?.operation === 'Alquiler' ? 1 : 0.05;
  const projectedCommission = primaryProperty
    ? primaryProperty.operation === 'Alquiler'
      ? primaryProperty.price
      : Math.round(primaryProperty.price * commissionRate)
    : 0;

  // Lead scoring
  const scoring = MockData.calcLeadScore(lead);
  const tempColor = scoring.temp === 'hot' ? '#DC2626' : scoring.temp === 'tibio' ? '#EA580C' : scoring.temp === 'medio' ? '#F59E0B' : '#94A3B8';
  const tempBg = scoring.temp === 'hot' ? '#FEE2E2' : scoring.temp === 'tibio' ? '#FED7AA' : scoring.temp === 'medio' ? '#FEF3C7' : '#F1F5F9';
  const tempLabel = scoring.temp === 'hot' ? 'Hot 🔥' : scoring.temp === 'tibio' ? 'Tibio' : scoring.temp === 'medio' ? 'Medio' : 'Frío';
  const [scoreOpen, setScoreOpen] = useStateL(false);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13 }}>
        <button onClick={onBack} className="icon-btn"><Icons.arrowleft size={16}/></button>
        <span style={{ color: 'var(--muted)' }}>Leads</span>
        <Icons.chevron size={12} style={{ color: 'var(--muted)' }}/>
        <span>{lead.name}</span>
      </div>

      {/* Hero */}
      <div className="card" style={{ padding: 24, marginBottom: 18, display: 'flex', gap: 22, alignItems: 'flex-start' }}>
        <Avatar name={lead.name} size={72}/>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>{lead.name}</h2>
            <StatusPill status={lead.status}/>
            {lead.tags?.includes('Hot') && <span className="tag" style={{ background: '#FEE2E2', color: '#B91C1C', fontSize: 11.5, fontWeight: 600 }}>🔥 Hot lead</span>}
          </div>
          <div style={{ display: 'flex', gap: 18, fontSize: 13, color: 'var(--ink-2)', marginBottom: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icons.phone size={14}/> {lead.phone}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icons.mail size={14}/> {lead.email}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Icons.tag size={14}/> {lead.source}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn accent" onClick={() => onOpenInbox(lead.id)}>
              <Icons.whatsapp size={14}/> Abrir chat
            </button>
            <button className="btn ghost"><Icons.phone size={14}/> Llamar</button>
            <button className="btn ghost"><Icons.calendar size={14}/> Agendar visita</button>
            <button className="btn ghost"><Icons.more size={14}/></button>
          </div>
        </div>
        <div style={{ textAlign: 'right', position: 'relative' }}>
          <button onClick={() => setScoreOpen(!scoreOpen)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 10,
            background: tempBg, border: '1px solid ' + tempColor + '40',
            cursor: 'pointer'
          }} title="Ver detalle del scoring">
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>
              Lead score
              <div style={{ fontSize: 13, color: tempColor, marginTop: 1 }}>{tempLabel}</div>
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500,
              color: tempColor, letterSpacing: '-0.02em', lineHeight: 1
            }}>{scoring.score}<span style={{ fontSize: 14, color: tempColor, opacity: 0.6 }}>/100</span></div>
          </button>
          {scoreOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 8px)',
              width: 320, background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 16, boxShadow: 'var(--shadow-3)', zIndex: 30, textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <strong style={{ fontSize: 13.5 }}>Factores del score</strong>
                <button onClick={() => setScoreOpen(false)} className="icon-btn" style={{ width: 24, height: 24 }}><Icons.close size={12}/></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {scoring.factors.map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 6 }}>
                    <span style={{ flex: 1, color: 'var(--ink-2)' }}>{f.label}</span>
                    <span style={{
                      fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                      color: f.points > 0 ? '#16A34A' : f.points < 0 ? '#DC2626' : 'var(--muted)'
                    }}>
                      {f.points > 0 ? '+' : ''}{f.points}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, padding: 10, background: 'var(--surface-2)', borderRadius: 6, fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                Score recalculado automáticamente cada vez que hay actividad nueva en el lead.
              </div>
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginTop: 14 }}>Asignado a</div>
          {agent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, justifyContent: 'flex-end' }}>
              <Avatar name={agent.name} size={26} color={agent.color}/>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{agent.name}</span>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: '#7C3AED', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <Icons.bot size={14}/> Bot atendiendo
            </span>
          )}
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12 }}>Lead desde</div>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>{lead.createdAt}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
        {[
          { id: 'overview', label: 'Resumen' },
          { id: 'tasks', label: `Tareas${pendingTasks.length ? ` (${pendingTasks.length})` : ''}` },
          { id: 'visits', label: `Agenda (${upcomingEvents.length})` },
          { id: 'props', label: `Propiedades (${interested.length})` },
          { id: 'docs', label: `Documentos (${docs.length})` },
          { id: 'timeline', label: 'Actividad' },
          { id: 'notes', label: 'Notas' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '10px 14px', fontSize: 13,
              color: tab === t.id ? 'var(--accent-deep)' : 'var(--muted)',
              borderBottom: '2px solid ' + (tab === t.id ? 'var(--accent)' : 'transparent'),
              marginBottom: -1, fontWeight: tab === t.id ? 600 : 500
            }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Detalles</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, fontSize: 13 }}>
                {[
                  ['Interés', lead.interest],
                  ['Operación', lead.operation],
                  ['Presupuesto', lead.budget],
                  ['Fuente', lead.source],
                  ['Estado', lead.status],
                  ['Último contacto', lead.lastContact],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 3, letterSpacing: '0.05em' }}>{k}</div>
                    <div style={{ fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
              <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '18px 0' }}/>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Notas internas</h3>
              <div style={{
                padding: 14, borderRadius: 8, background: '#FEF9E7',
                border: '1px solid #FBE699', fontSize: 13.5, lineHeight: 1.6,
                color: '#723B0E'
              }}>
                {lead.notes || 'Sin notas todavía.'}
              </div>
            </div>

            {/* Próximas tareas + eventos */}
            {(pendingTasks.length > 0 || upcomingEvents.length > 0) && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Próximos pasos</h3>
                  <button className="btn ghost sm" onClick={() => setTab('tasks')}>Ver todos</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {upcomingEvents.slice(0, 2).map(e => {
                    const meta = MockData.EVENT_KINDS[e.kind];
                    const Icon = Icons[meta.icon];
                    const start = new Date(e.start);
                    return (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: 'var(--surface-2)', borderLeft: `3px solid ${meta.color}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: meta.bg, display: 'grid', placeItems: 'center', color: meta.color }}>
                          <Icon size={16}/>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{e.title}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                            {start.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })} · {start.toTimeString().slice(0, 5)}
                            {e.location && <> · 📍 {e.location}</>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {pendingTasks.slice(0, 3).map(t => {
                    const kindMeta = MockData.TASK_KINDS[t.kind];
                    const Icon = Icons[kindMeta.icon];
                    const isBot = t.type === 'auto';
                    const isOverdue = t.status === 'overdue';
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: 'var(--surface-2)', borderLeft: `3px solid ${isOverdue ? '#DC2626' : kindMeta.color}` }}>
                        <input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}/>
                        <Icon size={14} style={{ color: kindMeta.color, flexShrink: 0 }}/>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{t.title}</div>
                          <div style={{ fontSize: 11.5, color: isOverdue ? '#DC2626' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {isOverdue && '⚠️ Atrasada · '}
                            {new Date(t.dueDate).toLocaleString('es-CR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            {isBot && <span style={{ background: '#F3EBFF', color: '#7C3AED', padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>🤖 Bot</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Comisión proyectada */}
            {primaryProperty && (
              <div className="card" style={{ padding: 20, background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 80%)', border: '1px solid var(--accent)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Comisión proyectada</div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 38, fontWeight: 500, color: 'var(--accent-deep)',
                  letterSpacing: '-0.02em', lineHeight: 1, marginTop: 6
                }}>
                  ${new Intl.NumberFormat('en-US').format(projectedCommission)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 6 }}>
                  {primaryProperty.operation === 'Alquiler'
                    ? `1 mes de alquiler · ${primaryProperty.title}`
                    : `${(commissionRate * 100).toFixed(0)}% sobre $${new Intl.NumberFormat('en-US').format(primaryProperty.price)} · ${primaryProperty.title}`}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 11.5, color: 'var(--muted)' }}>
                  <Icons.trend size={12}/>
                  Probabilidad de cierre: <strong style={{ color: 'var(--ink)' }}>{lead.status === 'En negociación' ? '70%' : lead.status === 'Visita agendada' ? '45%' : lead.status === 'Calificado' ? '25%' : '10%'}</strong>
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ marginTop: 0, fontSize: 14 }}>Etiquetas</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(lead.tags || []).map(t => (
                  <span key={t} className="tag" style={{
                    background: t === 'Hot' ? '#FEE2E2' : 'var(--surface-2)',
                    color: t === 'Hot' ? '#B91C1C' : 'var(--ink-2)',
                    fontSize: 12
                  }}>{t === 'Hot' && '🔥 '}{t}</span>
                ))}
                <button className="tag" style={{ background: 'transparent', border: '1px dashed var(--border-strong)', color: 'var(--muted)' }}>
                  <Icons.plus size={11}/> añadir
                </button>
              </div>
            </div>

            {docs.length > 0 && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 14 }}>Documentos</h3>
                  <button className="btn ghost sm" onClick={() => setTab('docs')}>Ver todos</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {docs.slice(0, 3).map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 6, background: 'var(--surface-2)' }}>
                      <div style={{ width: 28, height: 32, background: '#FEE2E2', color: '#DC2626', borderRadius: 4, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>PDF</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{d.category} · {d.size}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Tareas pendientes</h3>
              <button className="btn accent sm"><Icons.plus size={12}/> Nueva tarea</button>
            </div>

            {/* Quick add */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
              <input placeholder="Agregar tarea... (ej. Llamar para confirmar visita)" style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13, outline: 0 }}/>
              <select style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}>
                <option>Llamada</option>
                <option>Visita</option>
                <option>Reunión</option>
                <option>Documento</option>
                <option>Seguimiento</option>
              </select>
              <input type="date" defaultValue="2026-05-18" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', fontSize: 13 }}/>
              <button className="btn ghost sm">Agregar</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingTasks.map(t => {
                const kindMeta = MockData.TASK_KINDS[t.kind];
                const Icon = Icons[kindMeta.icon];
                const isBot = t.type === 'auto';
                const isOverdue = t.status === 'overdue';
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: 12, borderRadius: 8,
                    background: isBot ? '#FAF5FF' : 'var(--surface-2)',
                    border: '1px solid ' + (isBot ? '#E0CCFF' : 'transparent'),
                    borderLeft: `3px solid ${isOverdue ? '#DC2626' : kindMeta.color}`
                  }}>
                    <input type="checkbox" disabled={isBot} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--accent)' }}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Icon size={14} style={{ color: kindMeta.color, flexShrink: 0 }}/>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</span>
                        {isBot && <span style={{ background: '#F3EBFF', color: '#7C3AED', padding: '1px 7px', borderRadius: 4, fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>🤖 Automático</span>}
                        {isOverdue && <span style={{ background: '#FEE2E2', color: '#B91C1C', padding: '1px 7px', borderRadius: 4, fontSize: 10.5, fontWeight: 700 }}>⚠️ Atrasada</span>}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        Vence: {new Date(t.dueDate).toLocaleString('es-CR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{isBot ? 'Configurado por el bot' : 'Asignada por agente'}
                      </div>
                      {t.notes && (
                        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 6, padding: 8, background: 'var(--surface)', borderRadius: 6, lineHeight: 1.5 }}>
                          {t.notes}
                        </div>
                      )}
                    </div>
                    {!isBot && <button className="icon-btn" style={{ width: 28, height: 28 }}><Icons.more size={14}/></button>}
                  </div>
                );
              })}
              {pendingTasks.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                  No hay tareas pendientes para este lead.
                </div>
              )}
            </div>

            {tasks.filter(t => t.status === 'done').length > 0 && (
              <>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '20px 0 10px' }}>
                  Completadas
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {tasks.filter(t => t.status === 'done').map(t => {
                    const kindMeta = MockData.TASK_KINDS[t.kind];
                    const Icon = Icons[kindMeta.icon];
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', opacity: 0.65 }}>
                        <Icons.check size={14} style={{ color: '#16A34A' }}/>
                        <Icon size={13} style={{ color: 'var(--muted)' }}/>
                        <span style={{ fontSize: 12.5, textDecoration: 'line-through', color: 'var(--muted)' }}>{t.title}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{new Date(t.dueDate).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Sidebar with bot automation info */}
          <div className="card" style={{ padding: 20, height: 'fit-content', background: 'linear-gradient(135deg, #F3EBFF 0%, #FAF5FF 60%, var(--surface) 100%)', border: '1px solid #E0CCFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#7C3AED', color: 'white', display: 'grid', placeItems: 'center' }}>
                <Icons.bot size={16}/>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 14 }}>Automatización activa</h3>
                <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>{tasks.filter(t => t.type === 'auto').length} tareas automáticas</div>
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5, margin: '0 0 12px' }}>
              El bot ejecuta tareas automáticas para este lead — recordatorios, seguimientos, reactivaciones. <strong>Tú puedes agregar tareas manuales</strong> cuando tomes la conversación.
            </p>
            <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 6, padding: 10, fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              <strong style={{ color: '#5B21B6' }}>Próxima automatización:</strong><br/>
              Si {lead.name.split(' ')[0]} no responde antes del 19/05, el bot enviará un mensaje de reactivación.
            </div>
          </div>
        </div>
      )}

      {tab === 'visits' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Visitas y citas con {lead.name.split(' ')[0]}</h3>
            <button className="btn accent sm"><Icons.plus size={12}/> Agendar visita</button>
          </div>
          {events.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No hay eventos agendados con este lead.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(e => {
              const meta = MockData.EVENT_KINDS[e.kind];
              const Icon = Icons[meta.icon];
              const start = new Date(e.start);
              const end = new Date(e.end);
              const isPast = end < new Date('2026-05-17T10:30');
              return (
                <div key={e.id} style={{
                  display: 'flex', gap: 14, padding: 14, borderRadius: 10,
                  background: 'var(--surface-2)',
                  borderLeft: `3px solid ${meta.color}`,
                  opacity: isPast ? 0.6 : 1
                }}>
                  <div style={{ width: 60, textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      {start.toLocaleDateString('es-CR', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, color: meta.color }}>{start.getDate()}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{start.toLocaleDateString('es-CR', { weekday: 'short' })}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="pill" style={{ background: meta.bg, color: meta.color, fontSize: 10.5, gap: 4 }}>
                        <Icon size={11} stroke={2.2}/>{meta.label}
                      </span>
                      {e.synced && <span style={{ fontSize: 10, background: 'var(--surface)', color: 'var(--muted)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>✓ Google Cal</span>}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{e.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>🕐 {start.toTimeString().slice(0, 5)} – {end.toTimeString().slice(0, 5)}</span>
                      {e.location && <span>📍 {e.location}</span>}
                    </div>
                    {e.notes && (
                      <div style={{ fontSize: 12, color: '#723B0E', marginTop: 8, padding: 8, background: '#FEF9E7', borderRadius: 6, border: '1px solid #FBE699' }}>
                        📝 {e.notes}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'props' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {interested.map(p => <PropertyCard key={p.id} property={p}/>)}
          {interested.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
              Aún no hay propiedades asociadas a este lead.
            </div>
          )}
        </div>
      )}

      {tab === 'docs' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Documentos del expediente</h3>
            <button className="btn accent sm"><Icons.plus size={12}/> Subir documento</button>
          </div>

          {/* drop zone */}
          <div style={{
            border: '2px dashed var(--border-strong)', borderRadius: 10,
            padding: 24, textAlign: 'center', color: 'var(--muted)',
            background: 'var(--surface-2)', marginBottom: 18, fontSize: 13
          }}>
            <Icons.paperclip size={24} style={{ opacity: 0.4, marginBottom: 6 }}/>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500 }}>Arrastra archivos aquí</div>
            <div style={{ fontSize: 11.5 }}>PDF, JPG, PNG · hasta 10 MB cada uno</div>
          </div>

          {/* by category */}
          {['Identificación', 'Financiero', 'Propiedad', 'Contrato'].map(cat => {
            const catDocs = docs.filter(d => d.category === cat);
            if (catDocs.length === 0) return null;
            return (
              <div key={cat} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {catDocs.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 8, background: 'var(--surface-2)', cursor: 'pointer' }}>
                      <div style={{
                        width: 36, height: 44,
                        background: d.type === 'pdf' ? '#FEE2E2' : '#DBEAFE',
                        color: d.type === 'pdf' ? '#DC2626' : '#1E40AF',
                        borderRadius: 4, display: 'grid', placeItems: 'center',
                        fontSize: 10, fontWeight: 700
                      }}>{d.type.toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{d.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                          {d.size} · Subido {d.uploadedAt} por {d.uploadedBy === 'lead' ? 'el cliente' : 'agente'}
                        </div>
                      </div>
                      <button className="icon-btn"><Icons.download size={14}/></button>
                      <button className="icon-btn"><Icons.more size={14}/></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {docs.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Aún no hay documentos para este lead.
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="card" style={{ padding: 24 }}>
          {[
            { time: 'Hoy 10:42', icon: 'whatsapp', text: 'Lead confirmó visita para el sábado 18/05', who: 'María Vargas' },
            { time: 'Lun 9:32', icon: 'handoff', text: 'Conversación transferida del bot a María Vargas', who: 'Sistema' },
            { time: 'Lun 9:18', icon: 'home', text: 'Bot envió ficha de propiedad CR-2031', who: 'Bot' },
            { time: 'Lun 9:14', icon: 'whatsapp', text: 'Primer contacto vía WhatsApp', who: 'Bot' },
            { time: 'Vie 16:00', icon: 'plus', text: 'Lead creado desde formulario web', who: 'Sistema' },
          ].map((e, i) => {
            const Icon = Icons[e.icon];
            return (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'var(--surface-2)',
                  display: 'grid', placeItems: 'center',
                  flexShrink: 0
                }}>
                  <Icon size={15} style={{ color: 'var(--accent)' }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5 }}>{e.text}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{e.time} · {e.who}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'notes' && (
        <div className="card" style={{ padding: 20 }}>
          <textarea
            defaultValue={lead.notes}
            placeholder="Escribe notas internas sobre este lead..."
            style={{ width: '100%', minHeight: 220, padding: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', fontFamily: 'inherit', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical' }}/>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn ghost">Cancelar</button>
            <button className="btn accent">Guardar nota</button>
          </div>
        </div>
      )}
    </div>
  );
};

window.LeadsTable = LeadsTable;
window.LeadDetail = LeadDetail;
