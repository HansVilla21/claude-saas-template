// Reports module — analytics + owner-shareable property reports

const { useState: useStateR, useMemo: useMemoR } = React;

const fmtR = (n) => new Intl.NumberFormat('es-CR').format(n);
const fmtM = (n) => n >= 1000000 ? '$' + (n / 1000000).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'k';

// — Pre-built report templates list
const REPORT_TEMPLATES = [
  { id: 'owner', icon: 'home', title: 'Reporte para propietario', desc: 'Vistas, leads, visitas y feedback de su propiedad. Diseñado para compartir en PDF.', color: '#0EA5E9', recommended: true },
  { id: 'top-asked', icon: 'flame', title: 'Propiedades más consultadas', desc: 'Qué propiedades reciben más interés en chats y consultas. Útil para priorizar atención.', color: '#EA580C' },
  { id: 'sources', icon: 'trend', title: 'Rendimiento por fuente', desc: 'WhatsApp vs sitio web vs Ads: qué canal te trae los mejores leads.', color: '#16A34A' },
  { id: 'cycle', icon: 'calendar', title: 'Tiempo de ciclo de venta', desc: 'Cuánto tardan tus leads en cada etapa del embudo. Identifica cuellos de botella.', color: '#7C3AED' },
  { id: 'commission', icon: 'trend', title: 'Proyección de comisiones', desc: 'Ingresos esperados basados en tu pipeline actual y probabilidades de cierre.', color: '#15803D' },
  { id: 'bot', icon: 'bot', title: 'Desempeño del bot', desc: 'Cuántas conversaciones resolvió el bot, cuándo hizo handoff, qué tan bien calificó leads.', color: '#7C3AED' },
];

const Reports = ({ properties, leads, onOpenReport }) => {
  const [tab, setTab] = useStateR('overview');

  // Calculations
  const sortedByLeads = [...properties].sort((a, b) => b.leads - a.leads);
  const sortedByViews = [...properties].sort((a, b) => b.views - a.views);
  const totalPipelineValue = leads.reduce((sum, l) => {
    const probs = { 'Nuevo': 0.05, 'Contactado': 0.1, 'Calificado': 0.25, 'Visita agendada': 0.45, 'En negociación': 0.7, 'Cerrado ganado': 1, 'Cerrado perdido': 0, 'Frío': 0.02 };
    const prob = probs[l.status] || 0.1;
    const prop = properties.find(p => l.interestedIn?.includes(p.id));
    if (!prop) return sum;
    const commission = prop.operation === 'Alquiler' ? prop.price : prop.price * 0.05;
    return sum + commission * prob;
  }, 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Reportes</h2>
          <div className="sub">Análisis de tu cartera y reportes compartibles con propietarios</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost"><Icons.plus size={13}/> Reporte personalizado</button>
          <button className="btn accent"><Icons.download size={13}/> Exportar todo</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { id: 'overview', label: 'Resumen' },
          { id: 'properties', label: 'Por propiedad' },
          { id: 'leads', label: 'Por lead' },
          { id: 'templates', label: 'Plantillas' },
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Templates strip */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Reportes listos para generar</h3>
              <button className="btn ghost sm" onClick={() => setTab('templates')}>Ver todos</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {REPORT_TEMPLATES.slice(0, 3).map(r => {
                const Icon = Icons[r.icon];
                return (
                  <div key={r.id} className="card prop-card" style={{ padding: 18, cursor: 'pointer', position: 'relative', transition: 'transform 0.15s' }}>
                    {r.recommended && (
                      <span style={{ position: 'absolute', top: 12, right: 12, background: 'var(--accent)', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Recomendado</span>
                    )}
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: r.color + '20', color: r.color, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                      <Icon size={18}/>
                    </div>
                    <h4 style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>{r.title}</h4>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{r.desc}</p>
                    <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                      <button className="btn accent sm" style={{ flex: 1, justifyContent: 'center' }}>Generar</button>
                      <button className="btn ghost sm">Vista previa</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top asked properties */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icons.flame size={16} style={{ color: '#EA580C' }}/> Propiedades más consultadas
                </h3>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Por número de leads + chats en los últimos 30 días</div>
              </div>
              <select style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
                <option>Últimos 30 días</option>
                <option>Últimos 7 días</option>
                <option>Este mes</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['#', 'Propiedad', 'Vistas', 'Chats', 'Visitas', 'Conv.'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByLeads.slice(0, 6).map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 6px', color: 'var(--muted)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 11 }}>#{i + 1}</td>
                        <td style={{ padding: '10px 6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 5, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 14 }}>{p.images?.[0]}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.title}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{p.code}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 6px', fontWeight: 600 }}>{p.views}</td>
                        <td style={{ padding: '10px 6px', fontWeight: 600 }}>{p.leads}</td>
                        <td style={{ padding: '10px 6px', fontWeight: 600 }}>{Math.floor(p.leads * 0.35)}</td>
                        <td style={{ padding: '10px 6px' }}>
                          <span style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 600 }}>
                            {((p.leads / p.views) * 100).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Bar chart of top 6 by leads */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12, fontWeight: 500 }}>Distribución de interés</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sortedByLeads.slice(0, 6).map((p) => {
                    const max = sortedByLeads[0].leads;
                    const pct = (p.leads / max) * 100;
                    return (
                      <div key={p.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 3 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.title}</span>
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.leads}</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, var(--accent), var(--accent-deep))`, borderRadius: 2 }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Commission projection */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Proyección de comisiones</h3>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Basado en pipeline actual ponderado por probabilidad de cierre</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 24 }}>
              <div style={{ padding: 16, background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))', borderRadius: 12, border: '1px solid var(--accent)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline ponderado</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: 'var(--accent-deep)', letterSpacing: '-0.02em', lineHeight: 1, marginTop: 6 }}>
                  ${fmtR(Math.round(totalPipelineValue))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Esperado próximos 90 días</div>
              </div>
              <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comisiones cerradas</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: '#16A34A', letterSpacing: '-0.02em', lineHeight: 1, marginTop: 6 }}>
                  $48,750
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Año a la fecha · 5 cierres</div>
              </div>
              <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mejor mes</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1, marginTop: 6 }}>
                  $24,500
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>Marzo 2026 · récord</div>
              </div>
            </div>

            {/* Stage breakdown */}
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distribución por etapa</div>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 38 }}>
              {[
                { label: 'Cerrado ganado', value: 1, color: '#16A34A', amount: 16250 },
                { label: 'En negociación', value: 0.7, color: '#EA580C', amount: 21750 },
                { label: 'Visita agendada', value: 0.45, color: '#0EA5E9', amount: 14400 },
                { label: 'Calificado', value: 0.25, color: '#F59E0B', amount: 9100 },
                { label: 'Resto', value: 0.05, color: '#94A3B8', amount: 4250 },
              ].map((s, i) => {
                const total = 65750;
                const pct = (s.amount / total) * 100;
                return (
                  <div key={i} style={{
                    width: `${pct}%`, background: s.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'white', fontSize: 11, fontWeight: 600
                  }} title={`${s.label}: $${fmtR(s.amount)}`}>
                    {pct > 12 ? `$${(s.amount / 1000).toFixed(0)}k` : ''}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Ganado (100%)', color: '#16A34A' },
                { label: 'Negociación (70%)', color: '#EA580C' },
                { label: 'Visita (45%)', color: '#0EA5E9' },
                { label: 'Calificado (25%)', color: '#F59E0B' },
                { label: 'Resto (<10%)', color: '#94A3B8' },
              ].map(l => (
                <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color }}/>{l.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'properties' && (
        <PropertyReports properties={properties} onGenerate={(p) => onOpenReport && onOpenReport(p)}/>
      )}

      {tab === 'leads' && (
        <LeadReports leads={leads} properties={properties}/>
      )}

      {tab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {REPORT_TEMPLATES.map(r => {
            const Icon = Icons[r.icon];
            return (
              <div key={r.id} className="card" style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: r.color + '20', color: r.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon size={20}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{r.title}</h4>
                      {r.recommended && <span style={{ background: 'var(--accent)', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Recomendado</span>}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{r.desc}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn accent sm" style={{ flex: 1, justifyContent: 'center' }}><Icons.download size={12}/> Generar PDF</button>
                  <button className="btn ghost sm">Configurar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// — Per-property analytics + owner reports
const PropertyReports = ({ properties, onGenerate }) => {
  const [selected, setSelected] = useStateR(null);

  if (selected) {
    const p = selected;
    // Generate week-by-week views
    const weeks = [
      { label: 'Sem 1', views: 18, leads: 1, msgs: 4 },
      { label: 'Sem 2', views: 32, leads: 3, msgs: 12 },
      { label: 'Sem 3', views: 41, leads: 2, msgs: 8 },
      { label: 'Sem 4', views: 51, leads: 2, msgs: 11 },
    ];
    const maxW = Math.max(...weeks.map(w => w.views));

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13 }}>
          <button onClick={() => setSelected(null)} className="icon-btn"><Icons.arrowleft size={16}/></button>
          <span style={{ color: 'var(--muted)' }}>Reportes / Por propiedad</span>
          <Icons.chevron size={12} style={{ color: 'var(--muted)' }}/>
          <span className="mono" style={{ fontSize: 12 }}>{p.code}</span>
        </div>

        {/* Hero — owner report preview */}
        <div className="card" style={{ overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: 26, background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 70%)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>
                  Reporte mensual para propietario
                </div>
                <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em' }}>{p.title}</h2>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icons.location size={13}/> {p.location} · <span className="mono">{p.code}</span>
                </div>
                <div style={{ marginTop: 16, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 600 }}>
                  Hola, este es el reporte de actividad del mes para su propiedad. A continuación encontrará el resumen de visitas al anuncio, leads interesados y visitas agendadas.
                </div>
              </div>
              <div style={{ width: 140, height: 140, borderRadius: 14, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 64, flexShrink: 0 }}>
                {p.images?.[0]}
              </div>
            </div>
          </div>

          <div style={{ padding: 26 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 26 }}>
              {[
                { label: 'Vistas del anuncio', value: p.views, delta: '+23%', icon: 'eye' },
                { label: 'Leads interesados', value: p.leads, delta: '+18%', icon: 'users' },
                { label: 'Visitas agendadas', value: Math.floor(p.leads * 0.35), delta: '+2', icon: 'calendar' },
                { label: 'Días en el mercado', value: 36, delta: 'avg 42', icon: 'trend' },
              ].map(m => {
                const Icon = Icons[m.icon];
                return (
                  <div key={m.label} style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Icon size={15} style={{ color: 'var(--accent)' }}/>
                      <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>{m.delta}</span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1 }}>{m.value}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>{m.label}</div>
                  </div>
                );
              })}
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Actividad semanal</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 160, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
              {weeks.map((w, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 110, width: '100%', justifyContent: 'center' }}>
                    <div style={{ width: 18, height: `${(w.views / maxW) * 100}%`, background: 'var(--accent)', borderRadius: '3px 3px 0 0', position: 'relative' }} title={`${w.views} vistas`}>
                      <span style={{ position: 'absolute', top: -18, left: 0, right: 0, textAlign: 'center', fontSize: 10, fontWeight: 700 }}>{w.views}</span>
                    </div>
                    <div style={{ width: 14, height: `${(w.msgs / maxW) * 100}%`, background: '#25D366', borderRadius: '3px 3px 0 0' }} title={`${w.msgs} chats`}/>
                    <div style={{ width: 10, height: `${(w.leads * 4 / maxW) * 100}%`, background: '#EA580C', borderRadius: '3px 3px 0 0' }} title={`${w.leads} leads`}/>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{w.label}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 2 }}/> Vistas del anuncio</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: '#25D366', borderRadius: 2 }}/> Mensajes recibidos</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, background: '#EA580C', borderRadius: 2 }}/> Leads calificados</span>
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 26, marginBottom: 12 }}>Comparación con propiedades similares</h3>
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, lineHeight: 1.7, color: 'var(--ink-2)' }}>
              Su propiedad <strong>recibe 18% más visitas</strong> que el promedio de propiedades similares en {p.location}. Sin embargo, la <strong>tasa de conversión a visita está 5% por debajo</strong> — recomendamos revisar las fotos del segundo dormitorio y considerar un ajuste de precio de ~3%.
            </div>

            <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 26, marginBottom: 12 }}>Visitas realizadas este mes</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Fecha', 'Cliente', 'Estado', 'Feedback'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { date: '15 mayo', client: 'D. Mora', status: 'Considerando oferta', feedback: 'Le encantó el jardín y la cocina' },
                  { date: '8 mayo', client: 'A. Pérez', status: 'Descartó', feedback: 'Busca propiedad más cerca de colegios' },
                  { date: '2 mayo', client: 'J. Salazar', status: 'En negociación', feedback: 'Ofertó pero por debajo del precio' },
                ].map((v, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 6px', fontWeight: 500 }}>{v.date}</td>
                    <td style={{ padding: '10px 6px' }}>{v.client}</td>
                    <td style={{ padding: '10px 6px' }}><span className="tag" style={{ fontSize: 11 }}>{v.status}</span></td>
                    <td style={{ padding: '10px 6px', color: 'var(--muted)' }}>{v.feedback}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: 18, background: 'var(--surface-2)', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>
              Este reporte se actualiza automáticamente. Próximo envío al propietario: <strong>1 de junio</strong>.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn ghost"><Icons.send size={13}/> Enviar al propietario</button>
              <button className="btn accent"><Icons.download size={13}/> Descargar PDF</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 10, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icons.sparkle size={16} style={{ color: 'var(--accent)' }}/>
        <div style={{ fontSize: 13, flex: 1 }}>
          <strong>Tip:</strong> Los propietarios que reciben reportes mensuales renuevan exclusiva un 3x más. Configura envío automático al inicio de cada mes.
        </div>
        <button className="btn ghost sm">Configurar envíos</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
        {properties.map(p => (
          <div key={p.id} className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 30, flexShrink: 0 }}>
                {p.images?.[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{p.code} · {p.location}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 12 }}>
                  <span><Icons.eye size={12} style={{ verticalAlign: 'text-bottom' }}/> <strong>{p.views}</strong></span>
                  <span><Icons.users size={12} style={{ verticalAlign: 'text-bottom' }}/> <strong>{p.leads}</strong></span>
                  <span>· {((p.leads / p.views) * 100).toFixed(1)}% conv.</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn accent sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setSelected(p)}>Ver reporte</button>
              <button className="btn ghost sm"><Icons.send size={12}/></button>
              <button className="btn ghost sm"><Icons.download size={12}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// — Lead-source analytics
const LeadReports = ({ leads, properties }) => {
  const bySource = useMemoR(() => {
    const out = {};
    leads.forEach(l => {
      out[l.source] = (out[l.source] || 0) + 1;
    });
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const byStatus = useMemoR(() => {
    const out = {};
    leads.forEach(l => {
      out[l.status] = (out[l.status] || 0) + 1;
    });
    return out;
  }, [leads]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Por fuente</h3>
        {bySource.map(([source, count]) => {
          const max = bySource[0][1];
          const pct = (count / max) * 100;
          return (
            <div key={source} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5 }}>
                <span style={{ fontWeight: 500 }}>{source}</span>
                <span style={{ fontWeight: 700 }}>{count} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {Math.round(count / leads.length * 100)}%</span></span>
              </div>
              <div style={{ height: 10, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 3 }}/>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Por estado</h3>
        {Object.entries(byStatus).map(([status, count]) => (
          <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <StatusPill status={status}/>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{count}</span>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 22, gridColumn: 'span 2' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>Tiempo de respuesta promedio</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { source: 'WhatsApp (bot)', time: '3.2 seg', color: '#25D366' },
            { source: 'WhatsApp (manual)', time: '14 min', color: '#16A34A' },
            { source: 'Email', time: '2.4 h', color: '#0EA5E9' },
            { source: 'Sitio web', time: '8 min', color: '#7C3AED' },
          ].map(s => (
            <div key={s.source} style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, marginBottom: 6 }}>{s.source}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, color: s.color, letterSpacing: '-0.01em' }}>{s.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

window.Reports = Reports;
