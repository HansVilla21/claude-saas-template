// Calendar / Agenda module
// Week view (main) + month + day, Google Calendar integration UI

const { useState: useStateC, useMemo: useMemoC, useEffect: useEffectC } = React;

// — Date helpers
const dayMs = 86400000;
const NOW = new Date('2026-05-17T10:30:00');
const startOfWeek = (d) => {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  // Monday-start week
  const diff = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
};
const addDays = (d, n) => { const out = new Date(d); out.setDate(out.getDate() + n); return out; };
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const fmtDay = (d) => ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][(d.getDay() + 6) % 7];
const fmtMonth = (d) => ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][d.getMonth()];
const fmtTime = (d) => d.toTimeString().slice(0, 5);
const parseDate = (s) => new Date(s);

// — Travel time heuristic (very rough — used to warn about back-to-back visits in different areas)
const ZONE_OF = (loc) => {
  if (!loc) return null;
  if (/Escaz|Santa Ana|Pozos/i.test(loc)) return 'oeste';
  if (/Sabana|Rohrmoser|Pavas/i.test(loc)) return 'centro-oeste';
  if (/Heredia|San Joaqu/i.test(loc)) return 'norte';
  if (/Curridabat|San Pedro|Sabanilla/i.test(loc)) return 'este';
  if (/Tamarindo|Guanacaste|Playa/i.test(loc)) return 'guanacaste';
  return 'centro';
};
const TRAVEL_MIN = {
  // very approximate travel in minutes between zones in GAM
  'oeste-centro-oeste': 15, 'centro-oeste-oeste': 15,
  'oeste-norte': 35, 'norte-oeste': 35,
  'oeste-este': 45, 'este-oeste': 45,
  'centro-oeste-norte': 25,
  'oeste-guanacaste': 240, 'guanacaste-oeste': 240,
  'centro-oeste-guanacaste': 240,
};

// — Mini month picker
const MiniMonth = ({ value, onPick, events }) => {
  const start = new Date(value.getFullYear(), value.getMonth(), 1);
  const firstDow = (start.getDay() + 6) % 7;
  const daysInMonth = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);

  const eventDays = useMemoC(() => {
    const s = new Set();
    events.forEach(e => {
      const d = parseDate(e.start);
      if (d.getFullYear() === value.getFullYear() && d.getMonth() === value.getMonth()) s.add(d.getDate());
    });
    return s;
  }, [events, value.getMonth(), value.getFullYear()]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'capitalize' }}>
          {fmtMonth(value)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{value.getFullYear()}</span>
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => onPick(new Date(value.getFullYear(), value.getMonth() - 1, 1))}>
            <Icons.chevron size={13} style={{ transform: 'rotate(180deg)' }}/>
          </button>
          <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => onPick(new Date(value.getFullYear(), value.getMonth() + 1, 1))}>
            <Icons.chevron size={13}/>
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 11 }}>
        {['L','M','M','J','V','S','D'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 600, padding: '4px 0' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i}/>;
          const dateObj = new Date(value.getFullYear(), value.getMonth(), d);
          const isToday = sameDay(dateObj, NOW);
          const isSelected = sameDay(dateObj, value);
          const hasEvents = eventDays.has(d);
          return (
            <button key={i} onClick={() => onPick(dateObj)} style={{
              padding: '6px 0', borderRadius: 6, position: 'relative',
              fontSize: 11.5, fontWeight: isSelected ? 700 : 500,
              background: isSelected ? 'var(--accent)' : isToday ? 'var(--accent-soft)' : 'transparent',
              color: isSelected ? 'white' : isToday ? 'var(--accent-deep)' : 'var(--ink-2)',
            }}>
              {d}
              {hasEvents && !isSelected && (
                <span style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: 50, background: 'var(--accent)' }}/>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// — Single event block (in week view)
const WeekEvent = ({ event, leads, onClick, dayHeight, startHour }) => {
  const start = parseDate(event.start);
  const end = parseDate(event.end);
  const startH = start.getHours() + start.getMinutes() / 60;
  const endH = end.getHours() + end.getMinutes() / 60;
  const top = (startH - startHour) * dayHeight;
  const height = Math.max(28, (endH - startH) * dayHeight - 2);
  const meta = MockData.EVENT_KINDS[event.kind] || MockData.EVENT_KINDS.meeting;
  const lead = event.leadId ? leads.find(l => l.id === event.leadId) : null;
  const Icon = Icons[meta.icon];

  return (
    <button onClick={onClick} style={{
      position: 'absolute', top, left: 4, right: 4, height,
      background: meta.bg,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 6,
      padding: '5px 8px',
      fontSize: 11.5,
      textAlign: 'left',
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'transform 0.1s, box-shadow 0.1s',
    }} className="evt">
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, color: meta.color, marginBottom: 1 }}>
        <Icon size={11} stroke={2.2}/>
        <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>
          {fmtTime(start)}–{fmtTime(end)}
        </span>
        {event.source === 'gcal' && (
          <span title="Sincronizado de Google Calendar" style={{ marginLeft: 'auto', fontSize: 9, background: 'rgba(0,0,0,0.08)', padding: '0 4px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.04em' }}>G</span>
        )}
      </div>
      <div style={{
        fontSize: 11.5, fontWeight: 600, color: 'var(--ink)',
        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
        WebkitLineClamp: height > 50 ? 2 : 1, WebkitBoxOrient: 'vertical',
        lineHeight: 1.25
      }}>{event.title}</div>
      {lead && height > 56 && (
        <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>
          👤 {lead.name}
        </div>
      )}
      {event.location && height > 70 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          📍 {event.location}
        </div>
      )}
    </button>
  );
};

// — Event detail flyout
const EventDetail = ({ event, lead, property, onClose, onOpenLead, onOpenProperty }) => {
  if (!event) return null;
  const start = parseDate(event.start);
  const end = parseDate(event.end);
  const meta = MockData.EVENT_KINDS[event.kind];
  const Icon = Icons[meta.icon];

  return (
    <div style={{
      position: 'absolute', right: 18, top: 78, width: 340,
      background: 'var(--surface)', borderRadius: 14,
      border: '1px solid var(--border)', boxShadow: 'var(--shadow-3)',
      padding: 18, zIndex: 30
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <span className="pill" style={{ background: meta.bg, color: meta.color, fontSize: 11, gap: 5 }}>
          <Icon size={12} stroke={2.2}/> {meta.label}
        </span>
        <button onClick={onClose} className="icon-btn" style={{ width: 26, height: 26 }}>
          <Icons.close size={13}/>
        </button>
      </div>
      <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{event.title}</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icons.calendar size={14} style={{ color: 'var(--muted)' }}/>
          <span>{start.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 14, color: 'var(--muted)', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>⏱</span>
          <span>{fmtTime(start)} — {fmtTime(end)} <span style={{ color: 'var(--muted)' }}>({Math.round((end - start) / 60000)} min)</span></span>
        </div>
        {event.location && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Icons.location size={14} style={{ color: 'var(--muted)', marginTop: 2 }}/>
            <span style={{ flex: 1 }}>{event.location}</span>
          </div>
        )}
        {lead && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--surface-2)', borderRadius: 8, cursor: 'pointer' }} onClick={() => onOpenLead(lead.id)}>
            <Avatar name={lead.name} size={28}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{lead.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{lead.phone}</div>
            </div>
            <Icons.chevron size={13} style={{ color: 'var(--muted)' }}/>
          </div>
        )}
        {property && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--surface-2)', borderRadius: 8, cursor: 'pointer' }} onClick={() => onOpenProperty(property.id)}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 16 }}>{property.images?.[0]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{property.title}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{property.code}</div>
            </div>
            <Icons.chevron size={13} style={{ color: 'var(--muted)' }}/>
          </div>
        )}
        {event.notes && (
          <div style={{ marginTop: 4, padding: 10, background: '#FEF9E7', border: '1px solid #FBE699', borderRadius: 8, fontSize: 12.5, color: '#723B0E', lineHeight: 1.5 }}>
            📝 {event.notes}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
          {event.synced ? (
            <><span style={{ color: '#16A34A' }}>●</span> Sincronizado con Google Calendar</>
          ) : (
            <><span style={{ color: '#F59E0B' }}>●</span> Pendiente de sincronizar</>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <button className="btn ghost sm" style={{ flex: 1, justifyContent: 'center' }}><Icons.edit size={12}/> Editar</button>
        {lead && <button className="btn accent sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onOpenLead(lead.id)}><Icons.whatsapp size={12}/> Abrir chat</button>}
      </div>
    </div>
  );
};

// — Week view
const WeekView = ({ weekStart, events, leads, onPickEvent }) => {
  const startHour = 7;
  const endHour = 20;
  const dayHeight = 56; // px per hour
  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // travel-time conflict detection
  const conflicts = useMemoC(() => {
    const out = [];
    const sorted = [...events].sort((a, b) => parseDate(a.start) - parseDate(b.start));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (prev.kind !== 'visit' && cur.kind !== 'visit') continue;
      const prevEnd = parseDate(prev.end);
      const curStart = parseDate(cur.start);
      if (!sameDay(prevEnd, curStart)) continue;
      const gap = (curStart - prevEnd) / 60000;
      const z1 = ZONE_OF(prev.location), z2 = ZONE_OF(cur.location);
      const travel = z1 && z2 && z1 !== z2 ? (TRAVEL_MIN[`${z1}-${z2}`] || 30) : 0;
      if (travel > gap) {
        out.push({ from: prev, to: cur, needed: travel, have: Math.max(0, gap) });
      }
    }
    return out;
  }, [events]);

  return (
    <div style={{ flex: 1, overflow: 'auto', background: 'var(--surface)' }}>
      {/* Day headers (sticky) */}
      <div style={{
        display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)',
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)'
      }}>
        <div/>
        {days.map(d => {
          const isToday = sameDay(d, NOW);
          return (
            <div key={d.toISOString()} style={{
              padding: '12px 8px', textAlign: 'center',
              borderLeft: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {fmtDay(d)}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: isToday ? 'var(--accent)' : 'var(--ink)' }}>
                {d.getDate()}
                {isToday && <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 50, background: 'var(--accent)', verticalAlign: 'super', marginLeft: 4 }}/>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Conflicts banner */}
      {conflicts.length > 0 && (
        <div style={{
          padding: '8px 14px', background: '#FEF3C7', borderBottom: '1px solid #FBE699',
          fontSize: 12, color: '#854D0E', display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span>⚠️</span>
          <strong>{conflicts.length} conflicto{conflicts.length > 1 ? 's' : ''} de tiempo:</strong>
          {conflicts.map((c, i) => (
            <span key={i}>"{c.from.title.split('—')[0]}" → "{c.to.title.split('—')[0]}" requiere ~{c.needed} min, hay {c.have} min</span>
          ))}
        </div>
      )}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', position: 'relative' }}>
        {/* Hour column */}
        <div>
          {hours.map(h => (
            <div key={h} style={{
              height: dayHeight, paddingRight: 8, paddingTop: 0,
              fontSize: 10.5, color: 'var(--muted)', textAlign: 'right',
              fontVariantNumeric: 'tabular-nums',
              borderTop: '1px solid var(--border)'
            }}>
              {h === startHour ? '' : `${h}:00`}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((d, di) => {
          const dayEvents = events.filter(e => sameDay(parseDate(e.start), d));
          const isToday = sameDay(d, NOW);
          return (
            <div key={di} style={{
              position: 'relative',
              borderLeft: '1px solid var(--border)',
              background: isToday ? 'rgba(212, 165, 90, 0.04)' : 'transparent',
            }}>
              {hours.map(h => (
                <div key={h} style={{
                  height: dayHeight,
                  borderTop: '1px solid var(--border)',
                }}/>
              ))}
              {/* Now line */}
              {isToday && (() => {
                const t = NOW.getHours() + NOW.getMinutes() / 60;
                if (t < startHour || t > endHour) return null;
                return (
                  <div style={{
                    position: 'absolute', left: -3, right: 0,
                    top: (t - startHour) * dayHeight,
                    height: 2, background: '#DC2626', zIndex: 5,
                  }}>
                    <span style={{ position: 'absolute', left: -7, top: -4, width: 10, height: 10, borderRadius: '50%', background: '#DC2626' }}/>
                  </div>
                );
              })()}
              {dayEvents.map(e => (
                <WeekEvent key={e.id} event={e} leads={leads} dayHeight={dayHeight} startHour={startHour}
                  onClick={() => onPickEvent(e)}/>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// — Day view (single column, more detail)
const DayView = ({ day, events, leads, onPickEvent }) => {
  const dayEvents = events.filter(e => sameDay(parseDate(e.start), day)).sort((a, b) => parseDate(a.start) - parseDate(b.start));
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 22 }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {fmtDay(day)}
      </div>
      <h2 style={{ margin: '0 0 18px', fontSize: 32, letterSpacing: '-0.02em', fontWeight: 700 }}>
        {day.getDate()} de {fmtMonth(day)}
      </h2>
      {dayEvents.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          📭 No tienes eventos este día.
        </div>
      )}
      <div style={{ position: 'relative', paddingLeft: 80 }}>
        <div style={{ position: 'absolute', left: 70, top: 0, bottom: 0, width: 1, background: 'var(--border)' }}/>
        {dayEvents.map(e => {
          const start = parseDate(e.start);
          const end = parseDate(e.end);
          const meta = MockData.EVENT_KINDS[e.kind];
          const Icon = Icons[meta.icon];
          const lead = e.leadId ? leads.find(l => l.id === e.leadId) : null;
          return (
            <div key={e.id} style={{ position: 'relative', marginBottom: 14, paddingLeft: 14 }}>
              <div style={{
                position: 'absolute', left: -78, top: 0, width: 60, textAlign: 'right',
                fontSize: 12, fontWeight: 600, color: 'var(--ink)'
              }}>{fmtTime(start)}</div>
              <div style={{ position: 'absolute', left: -78, top: 18, width: 60, textAlign: 'right', fontSize: 11, color: 'var(--muted)' }}>
                {fmtTime(end)}
              </div>
              <div style={{
                position: 'absolute', left: -10, top: 4,
                width: 14, height: 14, borderRadius: '50%',
                background: meta.color, border: '3px solid var(--surface)'
              }}/>
              <button onClick={() => onPickEvent(e)} className="card" style={{
                padding: 14, width: '100%', textAlign: 'left',
                borderLeft: `3px solid ${meta.color}`, cursor: 'pointer', display: 'block'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className="pill" style={{ background: meta.bg, color: meta.color, fontSize: 10.5, gap: 4 }}>
                    <Icon size={11} stroke={2.2}/> {meta.label}
                  </span>
                  {e.source === 'gcal' && <span style={{ fontSize: 10, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4, fontWeight: 600 }}>Google</span>}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{Math.round((end - start) / 60000)} min</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{e.title}</div>
                {lead && <div style={{ fontSize: 12, color: 'var(--muted)' }}>👤 {lead.name} · {lead.phone}</div>}
                {e.location && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>📍 {e.location}</div>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// — Month view (compact agenda)
const MonthView = ({ month, events, onPickDay }) => {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const firstDow = (start.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) {
    cells.push({ date: addDays(start, -firstDow + i), other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(month.getFullYear(), month.getMonth(), d), other: false });
  }
  while (cells.length % 7) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: addDays(last, 1), other: true });
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
        {['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'].map(d => (
          <div key={d} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderLeft: '1px solid var(--border)' }}>{d}</div>
        ))}
      </div>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr' }}>
        {cells.map((c, i) => {
          const isToday = sameDay(c.date, NOW);
          const dayEvents = events.filter(e => sameDay(parseDate(e.start), c.date));
          return (
            <button key={i} onClick={() => onPickDay(c.date)} style={{
              position: 'relative',
              padding: 6, minHeight: 100, textAlign: 'left',
              borderLeft: '1px solid var(--border)',
              borderTop: '1px solid var(--border)',
              background: isToday ? 'rgba(212, 165, 90, 0.06)' : c.other ? 'var(--surface-2)' : 'transparent',
              opacity: c.other ? 0.4 : 1,
              cursor: 'pointer',
            }}>
              <div style={{
                fontSize: 12, fontWeight: 600, marginBottom: 4,
                display: 'inline-block', padding: '2px 6px', borderRadius: 4,
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? 'white' : 'var(--ink-2)'
              }}>{c.date.getDate()}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dayEvents.slice(0, 3).map(e => {
                  const meta = MockData.EVENT_KINDS[e.kind];
                  return (
                    <div key={e.id} style={{
                      fontSize: 10.5, padding: '2px 5px', borderRadius: 3,
                      background: meta.bg, color: meta.color,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 600, lineHeight: 1.3
                    }}>{fmtTime(parseDate(e.start))} {e.title}</div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 5 }}>+{dayEvents.length - 3} más</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// — Main calendar
const Calendar = ({ leads, properties, events: initialEvents, onOpenLead, onOpenProperty }) => {
  const [view, setView] = useStateC('week');
  const [cursor, setCursor] = useStateC(new Date(NOW));
  const [selected, setSelected] = useStateC(null);
  const [showSidebar, setShowSidebar] = useStateC(true);

  const events = initialEvents;
  const weekStart = startOfWeek(cursor);

  const goPrev = () => {
    if (view === 'week') setCursor(addDays(cursor, -7));
    else if (view === 'day') setCursor(addDays(cursor, -1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  };
  const goNext = () => {
    if (view === 'week') setCursor(addDays(cursor, 7));
    else if (view === 'day') setCursor(addDays(cursor, 1));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  };
  const goToday = () => setCursor(new Date(NOW));

  const rangeLabel = () => {
    if (view === 'week') {
      const end = addDays(weekStart, 6);
      if (weekStart.getMonth() === end.getMonth()) {
        return `${weekStart.getDate()}–${end.getDate()} de ${fmtMonth(weekStart)} ${weekStart.getFullYear()}`;
      }
      return `${weekStart.getDate()} ${fmtMonth(weekStart)} – ${end.getDate()} ${fmtMonth(end)} ${end.getFullYear()}`;
    }
    if (view === 'day') {
      return cursor.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
    return `${fmtMonth(cursor)} ${cursor.getFullYear()}`;
  };

  const selectedLead = selected?.leadId ? leads.find(l => l.id === selected.leadId) : null;
  const selectedProperty = selected?.propertyId ? properties.find(p => p.id === selected.propertyId) : null;

  const todayEvents = events.filter(e => sameDay(parseDate(e.start), NOW)).sort((a, b) => parseDate(a.start) - parseDate(b.start));
  const tomorrowEvents = events.filter(e => sameDay(parseDate(e.start), addDays(NOW, 1))).sort((a, b) => parseDate(a.start) - parseDate(b.start));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: showSidebar ? '260px 1fr' : '1fr', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      {showSidebar && (
        <div style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: 16 }}>
            <button className="btn accent" style={{ width: '100%', justifyContent: 'center', padding: '9px 14px', marginBottom: 16 }}>
              <Icons.plus size={14} stroke={2.4}/> Nuevo evento
            </button>
            <MiniMonth value={cursor} onPick={setCursor} events={events}/>
          </div>

          <div style={{ padding: '8px 16px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Calendarios</div>
            {[
              { id: 'crm', label: 'Visitas y citas (CRM)', color: 'var(--accent)', count: events.filter(e => e.source === 'crm').length },
              { id: 'gcal', label: 'Google Calendar personal', color: '#4285F4', count: events.filter(e => e.source === 'gcal').length },
              { id: 'team', label: 'Equipo (compartido)', color: '#16A34A', count: 0 },
            ].map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked style={{ accentColor: c.color }}/>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }}/>
                <span style={{ flex: 1, color: 'var(--ink-2)' }}>{c.label}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.count}</span>
              </label>
            ))}
          </div>

          <div style={{ padding: '8px 16px 16px', borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hoy</div>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{todayEvents.length} eventos</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayEvents.map(e => {
                const meta = MockData.EVENT_KINDS[e.kind];
                return (
                  <button key={e.id} onClick={() => setSelected(e)} style={{
                    textAlign: 'left', padding: 8, borderRadius: 6,
                    background: 'var(--surface-2)', borderLeft: `2px solid ${meta.color}`,
                    cursor: 'pointer'
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{fmtTime(parseDate(e.start))}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ padding: '8px 16px 20px', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Mañana</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tomorrowEvents.map(e => {
                const meta = MockData.EVENT_KINDS[e.kind];
                return (
                  <button key={e.id} onClick={() => setSelected(e)} style={{
                    textAlign: 'left', padding: 8, borderRadius: 6,
                    background: 'var(--surface-2)', borderLeft: `2px solid ${meta.color}`,
                    cursor: 'pointer'
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{fmtTime(parseDate(e.start))}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ flex: 1 }}/>

          <div style={{ padding: 14, margin: 14, background: 'linear-gradient(135deg, #E8F0FE, #F0F7FF)', border: '1px solid #C7DEFF', borderRadius: 10, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#1A56DB', marginBottom: 4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-13h2v6h-2zm0 7h2v2h-2z"/></svg>
              Google Calendar sincronizado
            </div>
            <div style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Última sync: hace 2 min · 142 eventos
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <button className="icon-btn" onClick={() => setShowSidebar(!showSidebar)} title="Toggle sidebar">
            <Icons.list size={16}/>
          </button>
          <button className="btn ghost sm" onClick={goToday}>Hoy</button>
          <div style={{ display: 'flex', gap: 0 }}>
            <button className="icon-btn" onClick={goPrev}><Icons.chevron size={15} style={{ transform: 'rotate(180deg)' }}/></button>
            <button className="icon-btn" onClick={goNext}><Icons.chevron size={15}/></button>
          </div>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 600, textTransform: 'capitalize', letterSpacing: '-0.01em' }}>{rangeLabel()}</h2>
          <span style={{ flex: 1 }}/>
          <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
            {[
              { id: 'day', label: 'Día' },
              { id: 'week', label: 'Semana' },
              { id: 'month', label: 'Mes' },
            ].map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 500,
                background: view === v.id ? 'var(--surface)' : 'transparent',
                color: view === v.id ? 'var(--ink)' : 'var(--muted)',
                boxShadow: view === v.id ? 'var(--shadow-1)' : 'none'
              }}>{v.label}</button>
            ))}
          </div>
        </div>

        {view === 'week' && <WeekView weekStart={weekStart} events={events} leads={leads} onPickEvent={setSelected}/>}
        {view === 'day' && <DayView day={cursor} events={events} leads={leads} onPickEvent={setSelected}/>}
        {view === 'month' && <MonthView month={cursor} events={events} onPickDay={(d) => { setCursor(d); setView('day'); }}/>}

        {selected && (
          <EventDetail event={selected} lead={selectedLead} property={selectedProperty}
            onClose={() => setSelected(null)}
            onOpenLead={onOpenLead}
            onOpenProperty={onOpenProperty}/>
        )}
      </div>

      <style>{`
        .evt:hover { box-shadow: 0 4px 12px rgba(34,28,22,0.10); transform: translateY(-1px); }
      `}</style>
    </div>
  );
};

window.Calendar = Calendar;
