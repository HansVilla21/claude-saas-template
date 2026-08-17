// Dashboard module — métricas, embudo, actividad, leaderboard

const { useState: useStateD, useMemo: useMemoD } = React;

// — Helpers
const fmtMoney = (n) => {
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'k';
  return '$' + n;
};
const fmtNum = (n) => new Intl.NumberFormat('es-CR').format(n);

// — KPI card
const KPI = ({ label, value, sub, delta, deltaLabel, sparkline, icon, accent }) => {
  const Icon = icon ? Icons[icon] : null;
  const positive = delta && !delta.startsWith('-') && delta !== '0';
  return (
    <div className="card" style={{ padding: 18, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        {Icon && (
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: accent || 'var(--accent-soft)',
            color: 'var(--accent-deep)',
            display: 'grid', placeItems: 'center'
          }}>
            <Icon size={15}/>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500 }}>{sub}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
        {delta && (
          <span style={{
            color: positive ? '#16A34A' : delta === '0' ? 'var(--muted)' : '#DC2626',
            fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 2
          }}>
            {delta !== '0' && (positive ? <Icons.arrowup size={11} stroke={2.4}/> : <Icons.arrowdown size={11} stroke={2.4}/>)}
            {delta}
          </span>
        )}
        {deltaLabel && <span style={{ color: 'var(--muted)' }}>{deltaLabel}</span>}
      </div>
      {sparkline && (
        <svg viewBox="0 0 200 40" style={{ position: 'absolute', bottom: 0, right: 0, width: 110, height: 38, opacity: 0.7 }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`grad-${label}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4"/>
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={`M 0,40 ${sparkline.map((v, i) => `L ${(i / (sparkline.length - 1)) * 200},${40 - v * 30}`).join(' ')} L 200,40 Z`} fill={`url(#grad-${label})`}/>
          <path d={`M 0,${40 - sparkline[0] * 30} ${sparkline.map((v, i) => `L ${(i / (sparkline.length - 1)) * 200},${40 - v * 30}`).join(' ')}`} fill="none" stroke="var(--accent)" strokeWidth="1.5"/>
        </svg>
      )}
    </div>
  );
};

// — Funnel chart (horizontal bars)
const PipelineFunnel = () => {
  const stages = [
    { label: 'Nuevo', count: 142, conv: 100, color: '#3B82F6' },
    { label: 'Contactado', count: 98, conv: 69, color: '#8B5CF6' },
    { label: 'Calificado', count: 47, conv: 33, color: '#F59E0B' },
    { label: 'Visita agendada', count: 24, conv: 17, color: '#0EA5E9' },
    { label: 'En negociación', count: 11, conv: 8, color: '#EA580C' },
    { label: 'Cerrado ganado', count: 5, conv: 3.5, color: '#16A34A' },
  ];
  const max = stages[0].count;

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Embudo de ventas</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Últimos 30 días</div>
        </div>
        <select style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}>
          <option>Todos los agentes</option>
          <option>María Vargas</option>
          <option>Andrés Solís</option>
          <option>Camila Rojas</option>
        </select>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {stages.map((s, i) => {
          const widthPct = (s.count / max) * 100;
          const dropFromPrev = i > 0 ? Math.round((1 - s.count / stages[i - 1].count) * 100) : 0;
          return (
            <div key={s.label} style={{ position: 'relative' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px',
                background: `linear-gradient(90deg, ${s.color}1A 0%, ${s.color}10 ${widthPct}%, transparent ${widthPct}%)`,
                borderRadius: 8,
                borderLeft: `3px solid ${s.color}`,
                position: 'relative'
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 50, background: s.color }}/>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 120, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{s.conv}%</span>
                  <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>{s.count}</span>
                </div>
              </div>
              {i > 0 && dropFromPrev > 0 && (
                <div style={{
                  position: 'absolute', right: -32, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 10, color: 'var(--muted)',
                  background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4
                }}>
                  -{dropFromPrev}%
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <div>
          <span style={{ color: 'var(--muted)' }}>Conversión total · </span>
          <strong>3.5%</strong>
        </div>
        <div>
          <span style={{ color: 'var(--muted)' }}>Tiempo promedio de ciclo · </span>
          <strong>24 días</strong>
        </div>
      </div>
    </div>
  );
};

// — Leads over time area chart
const LeadsChart = () => {
  const data = [3, 5, 4, 7, 6, 9, 8, 11, 7, 10, 14, 9, 12, 15, 11, 13, 16, 12, 18, 14, 17, 20, 16, 22, 19, 21, 18, 24];
  const labels = ['Abr 20', 'Abr 22', 'Abr 24', 'Abr 26', 'Abr 28', 'Abr 30', 'May 2', 'May 4', 'May 6', 'May 8', 'May 10', 'May 12', 'May 14', 'May 16'];
  const max = Math.max(...data);
  const w = 720, h = 200, pad = { l: 36, r: 16, t: 16, b: 28 };
  const ix = (i) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const iy = (v) => pad.t + (1 - v / max) * (h - pad.t - pad.b);
  const path = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${ix(i)},${iy(v)}`).join(' ');
  const fill = `M ${ix(0)},${h - pad.b} ${data.map((v, i) => `L ${ix(i)},${iy(v)}`).join(' ')} L ${ix(data.length - 1)},${h - pad.b} Z`;
  const [hover, setHover] = useStateD(null);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Nuevos leads</h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Últimos 28 días · diario</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' }}>{data.reduce((a, b) => a + b, 0)}</div>
            <div style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
              <Icons.arrowup size={11} stroke={2.4}/> +32%
              <span style={{ color: 'var(--muted)', fontWeight: 400, marginLeft: 4 }}>vs período anterior</span>
            </div>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={pad.t + (1 - t) * (h - pad.t - pad.b)} y2={pad.t + (1 - t) * (h - pad.t - pad.b)}
              stroke="var(--border)" strokeDasharray="3,4"/>
            <text x={pad.l - 8} y={pad.t + (1 - t) * (h - pad.t - pad.b) + 3}
              fontSize="9" fill="var(--muted)" textAnchor="end">{Math.round(max * t)}</text>
          </g>
        ))}
        <path d={fill} fill="url(#leadsGrad)"/>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round"/>
        {data.map((v, i) => (
          <g key={i}>
            <rect x={ix(i) - 12} y={pad.t} width="24" height={h - pad.t - pad.b}
              fill="transparent" onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}/>
            <circle cx={ix(i)} cy={iy(v)} r={hover === i ? 4 : 0}
              fill="var(--accent)" stroke="white" strokeWidth="2"/>
          </g>
        ))}
        {/* x labels: every 4th */}
        {data.map((_, i) => i % 4 === 0 && (
          <text key={i} x={ix(i)} y={h - 8} fontSize="9" fill="var(--muted)" textAnchor="middle">
            {labels[Math.floor(i / 2)] || ''}
          </text>
        ))}
        {hover != null && (
          <g>
            <line x1={ix(hover)} x2={ix(hover)} y1={pad.t} y2={h - pad.b} stroke="var(--accent)" strokeDasharray="3,3" opacity="0.5"/>
            <rect x={ix(hover) - 28} y={iy(data[hover]) - 32} width="56" height="22" rx="4" fill="var(--ink)"/>
            <text x={ix(hover)} y={iy(data[hover]) - 17} fontSize="11" fill="white" textAnchor="middle" fontWeight="600">{data[hover]} leads</text>
          </g>
        )}
      </svg>
    </div>
  );
};

// — Source donut (lead sources)
const SourceDonut = () => {
  const sources = [
    { label: 'WhatsApp', value: 48, color: '#25D366' },
    { label: 'Sitio web', value: 24, color: 'var(--accent)' },
    { label: 'Facebook Ads', value: 16, color: '#1877F2' },
    { label: 'Instagram', value: 8, color: '#E1306C' },
    { label: 'Referidos', value: 4, color: '#A78BFA' },
  ];
  const total = sources.reduce((a, b) => a + b.value, 0);
  let offset = 0;
  const r = 52, c = 2 * Math.PI * r;

  return (
    <div className="card" style={{ padding: 20 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>Fuentes de leads</h3>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>Este mes</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <svg viewBox="0 0 140 140" style={{ width: 130, height: 130, flexShrink: 0 }}>
          <g transform="translate(70, 70)">
            <circle r={r} fill="none" stroke="var(--surface-2)" strokeWidth="14"/>
            {sources.map((s, i) => {
              const len = (s.value / total) * c;
              const seg = (
                <circle key={i} r={r} fill="none" stroke={s.color} strokeWidth="14"
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90)"
                  strokeLinecap="butt"/>
              );
              offset += len;
              return seg;
            })}
            <text textAnchor="middle" y="0" fontSize="22" fontWeight="700" fill="var(--ink)">{total}</text>
            <text textAnchor="middle" y="16" fontSize="10" fill="var(--muted)">leads</text>
          </g>
        </svg>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sources.map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{ width: 9, height: 9, borderRadius: 50, background: s.color, flexShrink: 0 }}/>
              <span style={{ flex: 1 }}>{s.label}</span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11, minWidth: 32, textAlign: 'right' }}>{Math.round(s.value / total * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// — Bot performance card
const BotCard = () => (
  <div className="card" style={{ padding: 20, background: 'linear-gradient(135deg, #F3EBFF 0%, #FAF5FF 60%, var(--surface) 100%)', border: '1px solid #E0CCFF' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#7C3AED', color: 'white', display: 'grid', placeItems: 'center' }}>
        <Icons.bot size={18}/>
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Asistente IA</h3>
        <div style={{ fontSize: 11.5, color: '#7C3AED', fontWeight: 600 }}>● Activo · 24/7</div>
      </div>
      <span style={{ flex: 1 }}/>
      <button className="btn ghost sm">Configurar</button>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Atendidos hoy</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>47</div>
        <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>92% sin intervención</div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tiempo respuesta</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>3.2s</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>vs 14min humano</div>
      </div>
    </div>
    <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 8, padding: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, color: '#5B21B6', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icons.sparkle size={12}/> Acción sugerida
      </div>
      <div style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
        3 leads en estado <strong>"Calificado"</strong> llevan +48h sin seguimiento humano. ¿Quieres reasignarlos?
      </div>
    </div>
  </div>
);

// — Hot leads queue
const HotLeads = ({ leads, onOpenLead }) => {
  const hot = leads.filter(l => l.tags?.includes('Hot') || l.status === 'En negociación' || l.status === 'Calificado').slice(0, 5);
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>🔥</span> Leads que requieren atención
        </h3>
        <button className="btn ghost sm">Ver todos</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hot.map(l => (
          <div key={l.id} onClick={() => onOpenLead(l.id)} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 10, borderRadius: 8,
            background: 'var(--surface-2)', cursor: 'pointer',
            border: '1px solid transparent', transition: 'border-color 0.15s'
          }}>
            <Avatar name={l.name} size={36}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{l.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l.interest}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <StatusPill status={l.status} size="sm"/>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{l.budget}</div>
            </div>
            <button className="icon-btn" style={{ width: 28, height: 28 }}>
              <Icons.chevron size={14}/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// — Top properties
const TopProperties = ({ properties, onOpenProperty }) => {
  const sorted = [...properties].sort((a, b) => b.leads - a.leads).slice(0, 5);
  const maxLeads = sorted[0]?.leads || 1;
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Top propiedades</h3>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Por leads generados</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sorted.map((p, i) => (
          <div key={p.id} onClick={() => onOpenProperty(p.id)} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
          }} className="row-hover">
            <div style={{
              width: 22, color: 'var(--muted)', fontSize: 11, fontWeight: 700,
              fontFamily: 'var(--font-mono)', flexShrink: 0
            }}>#{i + 1}</div>
            <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0 }}>{p.images?.[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.code} · {fmtMoney(p.price)}</div>
            </div>
            <div style={{ width: 110, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.leads} leads</div>
              <div style={{ width: '100%', height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${(p.leads / maxLeads) * 100}%`, height: '100%', background: 'var(--accent)' }}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// — Agent leaderboard
const AgentLeaderboard = () => {
  const agents = [
    { id: 'a1', name: 'María Vargas', color: '#C2410C', closed: 4, pipeline: 1450000, leads: 28, conversion: 14 },
    { id: 'a2', name: 'Andrés Solís', color: '#15803D', closed: 3, pipeline: 890000, leads: 22, conversion: 13.6 },
    { id: 'a3', name: 'Camila Rojas', color: '#7C3AED', closed: 2, pipeline: 620000, leads: 18, conversion: 11.1 },
  ];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Agentes</h3>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Mayo 2026</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {agents.map((a, i) => (
          <div key={a.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, width: 18 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
              </div>
              <Avatar name={a.name} size={28} color={a.color}/>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.name}</div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-deep)' }}>{fmtMoney(a.pipeline)}</div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--muted)', paddingLeft: 56 }}>
              <span><strong style={{ color: 'var(--ink)' }}>{a.closed}</strong> cerrados</span>
              <span><strong style={{ color: 'var(--ink)' }}>{a.leads}</strong> leads</span>
              <span><strong style={{ color: 'var(--ink)' }}>{a.conversion}%</strong> conversión</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// — Activity feed
const ActivityFeed = () => {
  const events = [
    { time: 'hace 12 min', icon: 'whatsapp', color: '#16A34A', text: 'Daniela Mora confirmó visita para CR-2031', who: 'María Vargas' },
    { time: 'hace 38 min', icon: 'bot', color: '#7C3AED', text: 'Bot calificó a Roberto Quirós como lead Hot', who: 'Sistema' },
    { time: 'hace 1 h', icon: 'plus', color: 'var(--accent)', text: 'Nueva propiedad publicada: CR-2061 Penthouse Avenida Escazú', who: 'María Vargas' },
    { time: 'hace 2 h', icon: 'check', color: '#16A34A', text: 'Cierre de Fernanda Ulate — CR-2052 ($275k)', who: 'Andrés Solís' },
    { time: 'hace 3 h', icon: 'handoff', color: '#F59E0B', text: 'Conversación transferida del bot a Camila Rojas', who: 'Sistema' },
    { time: 'hace 4 h', icon: 'eye', color: '#0EA5E9', text: 'CR-2018 superó las 250 vistas esta semana', who: 'Sistema' },
    { time: 'hace 5 h', icon: 'calendar', color: '#0EA5E9', text: 'Visita agendada con Sofía Jiménez · Sábado 10am', who: 'Andrés Solís' },
  ];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Actividad reciente</h3>
        <button className="btn ghost sm">Ver historial</button>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: 8, bottom: 8, width: 1, background: 'var(--border)' }}/>
        {events.map((e, i) => {
          const Icon = Icons[e.icon];
          return (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: 14, position: 'relative' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'var(--surface)',
                border: '2px solid var(--border)',
                display: 'grid', placeItems: 'center',
                flexShrink: 0, zIndex: 1, color: e.color
              }}>
                <Icon size={13}/>
              </div>
              <div style={{ flex: 1, paddingTop: 2 }}>
                <div style={{ fontSize: 13, lineHeight: 1.4 }}>{e.text}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{e.time} · {e.who}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// — Tasks widget for dashboard
const TasksWidget = ({ tasks, leads, properties, onNav, onOpenLead }) => {
  const [tab, setTab] = useStateD('today');
  const NOW = new Date('2026-05-17T10:30:00');
  const START = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const todayStart = START(NOW);
  const todayEnd = new Date(todayStart); todayEnd.setHours(23,59,59);
  const weekEnd = new Date(todayEnd); weekEnd.setDate(weekEnd.getDate() + 7);

  const buckets = {
    today: tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= todayEnd),
    week: tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) > todayEnd && new Date(t.dueDate) <= weekEnd),
    overdue: tasks.filter(t => t.status !== 'done' && (t.status === 'overdue' || (t.dueDate && new Date(t.dueDate) < todayStart))),
    nodate: tasks.filter(t => t.status !== 'done' && !t.dueDate),
  };

  const visible = buckets[tab] || [];

  const fmt = (dd) => {
    if (!dd) return null;
    const d = new Date(dd);
    if (tab === 'today') return d.toTimeString().slice(0, 5);
    return d.toLocaleString('es-CR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '18px 20px 0' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.check size={15} style={{ color: 'var(--accent)' }}/> Tareas
          </h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {tasks.filter(t => t.status !== 'done').length} pendientes
            {buckets.overdue.length > 0 && <> · <span style={{ color: '#DC2626', fontWeight: 600 }}>{buckets.overdue.length} atrasadas</span></>}
          </div>
        </div>
        <button className="btn ghost sm" onClick={() => onNav('tasks')}>Ver todas →</button>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '14px 20px 0', borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'today', label: 'Hoy', count: buckets.today.length, color: 'var(--accent)' },
          { id: 'week', label: 'Semana', count: buckets.week.length, color: '#0EA5E9' },
          { id: 'overdue', label: 'Atrasadas', count: buckets.overdue.length, color: '#DC2626' },
          { id: 'nodate', label: 'Sin fecha', count: buckets.nodate.length, color: '#94A3B8' },
        ].map(f => (
          <button key={f.id} onClick={() => setTab(f.id)} style={{
            padding: '8px 12px', borderBottom: '2px solid ' + (tab === f.id ? f.color : 'transparent'),
            color: tab === f.id ? 'var(--ink)' : 'var(--muted)',
            fontSize: 12.5, fontWeight: tab === f.id ? 600 : 500,
            marginBottom: -1, display: 'flex', alignItems: 'center', gap: 6
          }}>
            {f.label}
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 999,
              background: tab === f.id ? f.color : 'var(--surface-2)',
              color: tab === f.id ? 'white' : 'var(--muted)',
              fontWeight: 700, fontVariantNumeric: 'tabular-nums'
            }}>{f.count}</span>
          </button>
        ))}
      </div>

      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {visible.length === 0 && (
          <div style={{ padding: 36, textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>{tab === 'today' || tab === 'overdue' ? '🎉' : '📭'}</div>
            <div style={{ fontSize: 12.5 }}>
              {tab === 'today' && '¡Día limpio! No hay tareas pendientes para hoy.'}
              {tab === 'overdue' && 'Estás al día. No hay tareas atrasadas.'}
              {tab === 'week' && 'No hay tareas esta semana.'}
              {tab === 'nodate' && 'No hay tareas sin fecha.'}
            </div>
          </div>
        )}
        {visible.slice(0, 6).map((t, i) => {
          const kindMeta = MockData.TASK_KINDS[t.kind];
          const Icon = Icons[kindMeta.icon];
          const isBot = t.type === 'auto';
          const lead = t.leadId ? leads.find(l => l.id === t.leadId) : null;
          const property = t.propertyId ? properties.find(p => p.id === t.propertyId) : null;
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '11px 20px',
              borderBottom: i < Math.min(visible.length, 6) - 1 ? '1px solid var(--border)' : 'none',
              background: isBot ? 'rgba(124,58,237,0.03)' : 'transparent',
              cursor: lead ? 'pointer' : 'default'
            }} onClick={() => lead && onOpenLead(lead.id)}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                border: '2px solid ' + (isBot ? '#C4B5FD' : 'var(--border-strong)'),
                flexShrink: 0, marginTop: 2
              }}/>
              <Icon size={13} style={{ color: kindMeta.color, flexShrink: 0, marginTop: 3 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--muted)', marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  {t.dueDate && <span style={{ color: tab === 'overdue' ? '#DC2626' : 'var(--muted)', fontWeight: tab === 'overdue' ? 600 : 400 }}>{fmt(t.dueDate)}</span>}
                  {lead && <span>· {lead.name.split(' ')[0]}</span>}
                  {property && <span>· {property.code}</span>}
                  {isBot && <span style={{ background: '#F3EBFF', color: '#7C3AED', padding: '0 5px', borderRadius: 3, fontSize: 9.5, fontWeight: 700 }}>🤖</span>}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length > 6 && (
          <button onClick={() => onNav('tasks')} style={{
            padding: '10px 20px', width: '100%', textAlign: 'center',
            fontSize: 12, color: 'var(--accent-deep)', fontWeight: 600,
            background: 'var(--surface-2)', border: 0, cursor: 'pointer'
          }}>+ {visible.length - 6} tareas más en {tab === 'today' ? 'hoy' : tab === 'week' ? 'esta semana' : tab === 'overdue' ? 'atrasadas' : 'sin fecha'}</button>
        )}
      </div>
    </div>
  );
};

// — Commissions projection
const CommissionsCard = ({ leads, properties }) => {
  // Per-stage probabilities
  const PROBS = { 'Nuevo': 0.05, 'Contactado': 0.1, 'Calificado': 0.25, 'Visita agendada': 0.45, 'En negociación': 0.7, 'Cerrado ganado': 1, 'Cerrado perdido': 0, 'Frío': 0.02 };
  const byStage = {};
  leads.forEach(l => {
    const prop = properties.find(p => l.interestedIn?.includes(p.id));
    if (!prop || prop.operation === 'Alquiler') return;
    const commission = prop.price * 0.05;
    const prob = PROBS[l.status] || 0.1;
    if (!byStage[l.status]) byStage[l.status] = { total: 0, weighted: 0, count: 0 };
    byStage[l.status].total += commission;
    byStage[l.status].weighted += commission * prob;
    byStage[l.status].count += 1;
  });
  const totalWeighted = Object.values(byStage).reduce((a, b) => a + b.weighted, 0);
  const totalRaw = Object.values(byStage).reduce((a, b) => a + b.total, 0);

  return (
    <div className="card" style={{ padding: 20, background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 70%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Comisiones proyectadas</h3>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Pipeline ponderado por probabilidad</div>
        </div>
        <span style={{ background: 'var(--surface)', color: 'var(--accent-deep)', padding: '3px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid var(--accent)' }}>
          5% sobre venta
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 42, fontWeight: 500, color: 'var(--accent-deep)',
        letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 4
      }}>
        ${fmtNum(Math.round(totalWeighted))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>
        de un máximo posible de <strong style={{ color: 'var(--ink)' }}>${fmtNum(Math.round(totalRaw))}</strong>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(byStage).filter(([s]) => PROBS[s] > 0.1).sort((a, b) => b[1].weighted - a[1].weighted).map(([stage, data]) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ flex: 1 }}>
              <StatusPill status={stage} size="sm"/>
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>{data.count} leads</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 70, textAlign: 'right' }}>
              ${fmtNum(Math.round(data.weighted))}
            </span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        💰 Para alcanzar tu meta mensual de <strong style={{ color: 'var(--ink)' }}>$25k</strong> necesitas cerrar ~2 propiedades más en negociación.
      </div>
    </div>
  );
};

// — Goals / progress
const GoalsCard = () => {  const goals = [
    { label: 'Cierres del mes', current: 5, target: 8, color: '#16A34A' },
    { label: 'Pipeline objetivo', current: 2.96, target: 4, suffix: 'M', prefix: '$', color: 'var(--accent)' },
    { label: 'Nuevos leads', current: 142, target: 150, color: '#0EA5E9' },
  ];
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Metas del mes</h3>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>17/31 días</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {goals.map(g => {
          const pct = Math.min(100, (g.current / g.target) * 100);
          return (
            <div key={g.label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{g.label}</span>
                <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{g.prefix || ''}{g.current}{g.suffix || ''}</strong>
                  <span style={{ color: 'var(--muted)' }}> / {g.prefix || ''}{g.target}{g.suffix || ''}</span>
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: g.color, borderRadius: 3, transition: 'width 0.4s' }}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ——————————————————————————————————————————
// Main Dashboard
// ——————————————————————————————————————————
const Dashboard = ({ leads, properties, tasks, onOpenLead, onOpenProperty, onNav }) => {
  const [range, setRange] = useStateD('30d');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Hola, María <span className="serif" style={{ fontStyle: 'italic', color: 'var(--muted)', fontWeight: 400 }}>· buenos días</span></h2>
          <div className="sub">Esto es lo que pasa con tu cartera hoy, domingo 17 de mayo</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {[
              { id: '7d', label: '7 días' },
              { id: '30d', label: '30 días' },
              { id: '90d', label: '90 días' },
              { id: 'ytd', label: 'Año' },
            ].map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} style={{
                padding: '5px 11px', borderRadius: 6,
                background: range === r.id ? 'var(--ink)' : 'transparent',
                color: range === r.id ? 'white' : 'var(--ink-2)',
                fontSize: 12, fontWeight: 500
              }}>{r.label}</button>
            ))}
          </div>
          <button className="btn ghost"><Icons.download size={13}/> Reporte</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 18 }}>
        <KPI label="Leads activos" value="142" delta="+18" deltaLabel="vs período anterior"
          icon="users"
          sparkline={[0.3, 0.4, 0.5, 0.4, 0.6, 0.7, 0.6, 0.8, 0.7, 0.9, 0.85, 1]}/>
        <KPI label="Pipeline valor" value="$2.96M" delta="+24%" deltaLabel="vs mes anterior"
          icon="trend"
          sparkline={[0.4, 0.45, 0.5, 0.55, 0.5, 0.6, 0.7, 0.65, 0.75, 0.8, 0.95, 1]}/>
        <KPI label="Conversión" value="3.5%" delta="+0.4%" deltaLabel="lead a cierre"
          icon="check"
          sparkline={[0.6, 0.7, 0.5, 0.8, 0.6, 0.9, 0.7, 0.85, 0.95, 0.8, 0.9, 1]}/>
        <KPI label="Tiempo respuesta" value="3.2" sub="min" delta="-32%" deltaLabel="más rápido"
          icon="whatsapp"
          sparkline={[1, 0.9, 0.8, 0.85, 0.7, 0.75, 0.6, 0.65, 0.5, 0.55, 0.4, 0.35]}/>
        <KPI label="Cerrados mes" value="5" sub="de 8" delta="+2" deltaLabel="vs abril"
          icon="home" accent="#DCFCE7"
          sparkline={[0, 0.2, 0.2, 0.4, 0.4, 0.6, 0.6, 0.8, 0.8, 0.8, 1, 1]}/>
      </div>

      {/* Row 2: leads chart (wide) + bot card */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 18 }}>
        <LeadsChart/>
        <BotCard/>
      </div>

      {/* Row 3: funnel + commissions + goals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
        <PipelineFunnel/>
        <CommissionsCard leads={leads} properties={properties}/>
        <GoalsCard/>
      </div>

      {/* Row 3.5: sources donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 18 }}>
        <SourceDonut/>
        <ActivityFeed/>
      </div>

      {/* Row 4: hot leads + tasks widget */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14, marginBottom: 18 }}>
        <HotLeads leads={leads} onOpenLead={onOpenLead}/>
        <TasksWidget tasks={tasks} leads={leads} properties={properties} onNav={onNav} onOpenLead={onOpenLead}/>
      </div>

      {/* Row 4.5: top properties */}
      <div style={{ marginBottom: 18 }}>
        <TopProperties properties={properties} onOpenProperty={onOpenProperty}/>
      </div>

      {/* Row 5: agents */}
      <div style={{ marginBottom: 18 }}>
        <AgentLeaderboard/>
      </div>
    </div>
  );
};

window.Dashboard = Dashboard;
