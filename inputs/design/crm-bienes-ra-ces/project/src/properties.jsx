// Properties module: grid catalog + detail + create/edit form

const { useState: useStateP, useMemo: useMemoP } = React;

const PropertiesGrid = ({ properties, onOpenProperty, onCreate }) => {
  const [filter, setFilter] = useStateP('all');
  const [opType, setOpType] = useStateP('all');
  const [view, setView] = useStateP('grid');
  const [sort, setSort] = useStateP('recent');

  const filtered = properties.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'featured') return p.featured;
    if (filter === 'available') return p.status === 'Disponible';
    if (filter === 'reserved') return p.status === 'Reservada';
    return p.type === filter;
  }).filter(p => opType === 'all' || p.operation === opType);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Propiedades</h2>
          <div className="sub">{properties.length} propiedades en cartera · {properties.filter(p => p.status === 'Disponible').length} disponibles · {properties.filter(p => p.featured).length} destacadas</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost"><Icons.download size={14}/> Exportar catálogo</button>
          <button className="btn accent" onClick={onCreate}><Icons.plus size={14} stroke={2.4}/> Agregar propiedad</button>
        </div>
      </div>

      {/* Filters bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'all', label: 'Todas' },
            { id: 'featured', label: '★ Destacadas' },
            { id: 'available', label: 'Disponibles' },
            { id: 'Casa', label: 'Casas' },
            { id: 'Apartamento', label: 'Apartamentos' },
            { id: 'Villa', label: 'Villas' },
            { id: 'Lote', label: 'Lotes' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 500,
              background: filter === f.id ? 'var(--ink)' : 'var(--surface)',
              color: filter === f.id ? 'white' : 'var(--ink-2)',
              border: '1px solid ' + (filter === f.id ? 'var(--ink)' : 'var(--border)'),
            }}>{f.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
          {['all', 'Venta', 'Alquiler'].map(op => (
            <button key={op} onClick={() => setOpType(op)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: opType === op ? 'var(--surface)' : 'transparent',
              color: opType === op ? 'var(--ink)' : 'var(--muted)',
              boxShadow: opType === op ? 'var(--shadow-1)' : 'none',
            }}>{op === 'all' ? 'Todas' : op}</button>
          ))}
        </div>

        <div style={{ flex: 1 }}/>

        <select value={sort} onChange={e => setSort(e.target.value)} style={{
          padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)',
          background: 'var(--surface)', fontSize: 12.5
        }}>
          <option value="recent">Recientes primero</option>
          <option value="price-asc">Precio ↑</option>
          <option value="price-desc">Precio ↓</option>
          <option value="leads">Más leads</option>
        </select>

        <div style={{ display: 'flex', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2 }}>
          {[{ id: 'grid', icon: 'grid' }, { id: 'list', icon: 'list' }, { id: 'map', icon: 'map' }].map(v => {
            const Icon = Icons[v.icon];
            return (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                width: 30, height: 26, borderRadius: 6,
                display: 'grid', placeItems: 'center',
                background: view === v.id ? 'var(--surface)' : 'transparent',
                color: view === v.id ? 'var(--ink)' : 'var(--muted)',
                boxShadow: view === v.id ? 'var(--shadow-1)' : 'none',
              }}>
                <Icon size={14}/>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏡</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {properties.length === 0 ? 'Aún no tienes propiedades' : 'Sin resultados con estos filtros'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 18, maxWidth: 360, margin: '0 auto 18px' }}>
            {properties.length === 0
              ? 'Empezá tu catálogo: agregá tu primera propiedad manualmente o importá desde Excel.'
              : 'Probá ajustar los filtros o búsqueda para ver más resultados.'}
          </div>
          {properties.length === 0 ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn accent" onClick={onCreate}><Icons.plus size={13}/> Agregar propiedad</button>
              <button className="btn ghost"><Icons.download size={13}/> Importar desde Excel</button>
            </div>
          ) : (
            <button className="btn ghost" onClick={() => { setFilter('all'); setOpType('all'); }}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {view === 'grid' && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(p => <PropertyCard key={p.id} property={p} onClick={() => onOpenProperty(p.id)}/>)}
        </div>
      )}

      {view === 'list' && filtered.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                {['Propiedad', 'Tipo', 'Ubicación', 'Precio', 'Estado', 'Leads', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '11px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => onOpenProperty(p.id)}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{p.images?.[0]}</div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.title}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>{p.code}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}><span className="tag">{p.type}</span> <span className="tag" style={{ background: p.operation === 'Venta' ? 'var(--accent-soft)' : '#DCFCE7', color: p.operation === 'Venta' ? 'var(--accent-deep)' : '#15803D' }}>{p.operation}</span></td>
                  <td style={{ padding: '10px 14px', fontSize: 13 }}>{p.location}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--accent-deep)' }}>
                    ${new Intl.NumberFormat('en-US').format(p.price)}{p.operation === 'Alquiler' && '/mes'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span className="pill" style={{ background: p.status === 'Disponible' ? '#DCFCE7' : '#FEF3C7', color: p.status === 'Disponible' ? '#15803D' : '#92400E' }}><span className="dot"/>{p.status}</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5 }}>
                      <Icons.users size={13} style={{ color: 'var(--muted)' }}/> {p.leads}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <button className="icon-btn" style={{ width: 28, height: 28 }}><Icons.edit size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'map' && filtered.length > 0 && (
        <div className="card" style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #E8F0E5, #D4E2D0)', color: 'var(--muted)', position: 'relative', overflow: 'hidden' }}>
          {/* placeholder map */}
          <svg viewBox="0 0 800 400" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.4 }}>
            <path d="M0,180 Q200,140 400,200 T800,180" stroke="#15803D" strokeWidth="2" fill="none"/>
            <path d="M100,300 L250,250 L450,280 L650,240 L750,290" stroke="#92400E" strokeWidth="1.5" fill="none"/>
            <circle cx="200" cy="180" r="80" fill="#15803D" opacity="0.1"/>
            <circle cx="500" cy="220" r="100" fill="#15803D" opacity="0.08"/>
          </svg>
          {filtered.map((p, i) => (
            <div key={p.id} style={{
              position: 'absolute',
              left: 80 + (i * 95) % 600 + 'px',
              top: 90 + ((i * 137) % 220) + 'px',
              background: 'var(--accent)', color: 'white',
              padding: '6px 10px', borderRadius: 18,
              fontSize: 12, fontWeight: 700,
              boxShadow: 'var(--shadow-2)',
              cursor: 'pointer'
            }} onClick={() => onOpenProperty(p.id)}>
              ${(p.price / 1000).toFixed(0)}k
            </div>
          ))}
          <div style={{ position: 'absolute', bottom: 14, left: 14, background: 'rgba(255,255,255,0.9)', padding: '8px 12px', borderRadius: 8, fontSize: 12, color: 'var(--ink-2)' }}>
            🗺️ Vista de mapa · GAM y Guanacaste
          </div>
        </div>
      )}
    </div>
  );
};

const PropertyDetail = ({ property, leads, onBack, onEdit, onPreviewPublic, onOpenCalc }) => {
  const [imageIdx, setImageIdx] = useStateP(0);
  const relatedLeads = leads.filter(l => l.interestedIn?.includes(property.id));
  const agent = MockData.AGENTS.find(a => a.id === property.agent);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13 }}>
        <button onClick={onBack} className="icon-btn"><Icons.arrowleft size={16}/></button>
        <span style={{ color: 'var(--muted)' }}>Propiedades</span>
        <Icons.chevron size={12} style={{ color: 'var(--muted)' }}/>
        <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{property.code}</span>
        <Icons.chevron size={12} style={{ color: 'var(--muted)' }}/>
        <span>{property.title}</span>
        <span style={{ flex: 1 }}/>
        <button className="btn ghost"><Icons.edit size={13}/> Editar</button>
        {property.externalUrl ? (
          <button className="btn ghost" title={property.externalUrl}>
            🔗 Ver en portal externo
          </button>
        ) : null}
        <button className="btn ghost" onClick={onPreviewPublic}>
          <Icons.eye size={13}/> Vista pública
        </button>
        <button className="btn accent"><Icons.send size={13}/> Compartir</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* Image gallery */}
        <div>
          <div style={{
            aspectRatio: '4/3',
            borderRadius: 14,
            background: 'linear-gradient(135deg, var(--accent-soft), #F4E2D6 60%, #E5D4BD)',
            display: 'grid', placeItems: 'center',
            fontSize: 120,
            position: 'relative',
            overflow: 'hidden'
          }}>
            <span style={{ filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.15))' }}>{property.images?.[imageIdx]}</span>
            {property.featured && (
              <span style={{ position: 'absolute', top: 16, left: 16, background: 'var(--accent)', color: 'white', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icons.star size={12} stroke={2.5}/> Destacada
              </span>
            )}
            <span style={{ position: 'absolute', top: 16, right: 16, background: property.operation === 'Venta' ? 'var(--accent-deep)' : '#15803D', color: 'white', padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600 }}>
              En {property.operation}
            </span>
          </div>
          {property.images?.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {property.images.map((img, i) => (
                <button key={i} onClick={() => setImageIdx(i)} style={{
                  flex: 1, aspectRatio: '4/3',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                  border: '2px solid ' + (i === imageIdx ? 'var(--accent)' : 'transparent'),
                  display: 'grid', placeItems: 'center', fontSize: 28,
                  opacity: i === imageIdx ? 1 : 0.65
                }}>{img}</button>
              ))}
            </div>
          )}
        </div>

        {/* Summary card */}
        <div className="card" style={{ padding: 24 }}>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 6 }}>{property.code}</div>
          <h2 style={{ margin: '0 0 4px', fontSize: 24, letterSpacing: '-0.01em', fontWeight: 700 }}>{property.title}</h2>
          <div style={{ color: 'var(--muted)', fontSize: 13.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icons.location size={14}/>{property.location} — {property.neighborhood}
          </div>

          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44, fontWeight: 500, lineHeight: 1,
            color: 'var(--accent-deep)',
            letterSpacing: '-0.02em',
            marginBottom: 18
          }}>
            ${new Intl.NumberFormat('en-US').format(property.price)}
            <span style={{ fontSize: 16, color: 'var(--muted)', marginLeft: 8 }}>
              {property.operation === 'Alquiler' ? 'USD/mes' : 'USD'}
            </span>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12,
            padding: '14px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
            fontSize: 13
          }}>
            {property.bedrooms !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icons.bed size={16} style={{ color: 'var(--muted)' }}/>
                <span><strong>{property.bedrooms}</strong> habitaciones</span>
              </div>
            )}
            {property.bathrooms !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icons.bath size={16} style={{ color: 'var(--muted)' }}/>
                <span><strong>{property.bathrooms}</strong> baños</span>
              </div>
            )}
            {property.area && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icons.ruler size={16} style={{ color: 'var(--muted)' }}/>
                <span><strong>{property.area}</strong> m² constr.</span>
              </div>
            )}
            {property.lot && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icons.ruler size={16} style={{ color: 'var(--muted)' }}/>
                <span><strong>{property.lot}</strong> m² lote</span>
              </div>
            )}
            {property.parking !== undefined && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icons.car size={16} style={{ color: 'var(--muted)' }}/>
                <span><strong>{property.parking}</strong> parqueos</span>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Agente</div>
              {agent && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <Avatar name={agent.name} size={26} color={agent.color}/>
                  <span style={{ fontSize: 13.5, fontWeight: 500 }}>{agent.name}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Estado</div>
              <span className="pill" style={{ background: property.status === 'Disponible' ? '#DCFCE7' : '#FEF3C7', color: property.status === 'Disponible' ? '#15803D' : '#92400E', marginTop: 4 }}>
                <span className="dot"/>{property.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        {/* Description + features */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 16 }}>Descripción</h3>
          <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 13.5, lineHeight: 1.65, textWrap: 'pretty' }}>{property.description}</p>

          <h3 style={{ margin: '24px 0 12px', fontSize: 16 }}>Características</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(property.features || []).map(f => (
              <span key={f} style={{
                padding: '6px 12px', borderRadius: 999,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 500
              }}>✓ {f}</span>
            ))}
          </div>

          <h3 style={{ margin: '24px 0 12px', fontSize: 16 }}>Ubicación</h3>
          <div style={{
            aspectRatio: '16/7', borderRadius: 10,
            background: 'linear-gradient(135deg, #E8F0E5, #D4E2D0)',
            display: 'grid', placeItems: 'center',
            color: 'var(--muted)', fontSize: 13,
            border: '1px solid var(--border)',
            position: 'relative', overflow: 'hidden'
          }}>
            <svg viewBox="0 0 400 200" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45 }}>
              <path d="M0,80 Q100,60 200,90 T400,80" stroke="#15803D" strokeWidth="1.5" fill="none"/>
              <path d="M40,140 L120,110 L220,130 L320,100 L380,140" stroke="#92400E" strokeWidth="1" fill="none"/>
            </svg>
            <div style={{ background: 'var(--accent)', color: 'white', padding: '8px 12px', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', boxShadow: 'var(--shadow-2)' }}>
              <Icons.location size={16} stroke={2.4} style={{ transform: 'rotate(45deg)' }}/>
            </div>
          </div>
        </div>

        {/* Right sidebar: metrics, leads */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Rendimiento</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Vistas</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{property.views}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Leads</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{property.leads}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Tasa conversión</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{(property.leads / property.views * 100).toFixed(1)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600 }}>Publicada</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{property.createdAt}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>Leads interesados ({relatedLeads.length})</h3>
              <button className="btn ghost sm"><Icons.plus size={12}/> Asociar</button>
            </div>
            {relatedLeads.length === 0 && (
              <div style={{ fontSize: 12.5, color: 'var(--muted)', padding: '14px 0' }}>
                Aún no hay leads interesados en esta propiedad.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {relatedLeads.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 8, background: 'var(--surface-2)' }}>
                  <Avatar name={l.name} size={30}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{l.name}</div>
                    <StatusPill status={l.status} size="sm"/>
                  </div>
                  <button className="icon-btn" style={{ width: 26, height: 26 }}>
                    <Icons.whatsapp size={13} style={{ color: 'var(--whatsapp-deep)' }}/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// — Create / Edit form
const PropertyForm = ({ property, onCancel, onSave }) => {
  const [form, setForm] = useStateP(property || {
    title: '', code: '', type: 'Casa', operation: 'Venta',
    price: '', currency: 'USD',
    bedrooms: '', bathrooms: '', area: '', lot: '', parking: '',
    location: '', neighborhood: '', status: 'Disponible',
    description: '', features: [], featured: false
  });
  const [step, setStep] = useStateP(1);
  const isNew = !property;

  const update = (k, v) => setForm({ ...form, [k]: v });

  const STEPS = [
    { id: 1, label: 'Básico' },
    { id: 2, label: 'Detalles' },
    { id: 3, label: 'Fotos y descripción' },
    { id: 4, label: 'Publicación' },
  ];

  return (
    <div className="page" style={{ maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13 }}>
        <button onClick={onCancel} className="icon-btn"><Icons.arrowleft size={16}/></button>
        <span style={{ color: 'var(--muted)' }}>Propiedades</span>
        <Icons.chevron size={12} style={{ color: 'var(--muted)' }}/>
        <span>{isNew ? 'Nueva propiedad' : `Editar ${property.code}`}</span>
      </div>

      <div className="page-header" style={{ marginBottom: 24 }}>
        <div>
          <h2>{isNew ? 'Agregar propiedad' : 'Editar propiedad'}</h2>
          <div className="sub">{isNew ? 'Completa la información para publicar la propiedad' : 'Modifica los detalles y guarda los cambios'}</div>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.id}>
            <button onClick={() => setStep(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 999,
              background: step === s.id ? 'var(--accent)' : step > s.id ? 'var(--accent-soft)' : 'var(--surface)',
              color: step === s.id ? 'white' : step > s.id ? 'var(--accent-deep)' : 'var(--muted)',
              border: '1px solid ' + (step >= s.id ? 'transparent' : 'var(--border)'),
              fontSize: 12.5, fontWeight: 600
            }}>
              <span style={{
                width: 20, height: 20, borderRadius: '50%',
                background: step === s.id ? 'rgba(255,255,255,0.2)' : step > s.id ? 'var(--accent)' : 'var(--surface-2)',
                color: step === s.id ? 'white' : step > s.id ? 'white' : 'var(--muted)',
                display: 'grid', placeItems: 'center',
                fontSize: 10, fontWeight: 700
              }}>{step > s.id ? '✓' : s.id}</span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <span style={{ flex: '0 0 24px', height: 1, background: 'var(--border)' }}/>}
          </React.Fragment>
        ))}
      </div>

      <div className="card" style={{ padding: 28 }}>
        {step === 1 && (
          <div style={{ display: 'grid', gap: 18 }}>
            <Field label="Título" required>
              <input value={form.title} onChange={e => update('title', e.target.value)}
                placeholder="Ej. Casa moderna en Escazú" className="inp"/>
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Código interno" hint="Se autogenera si lo dejas vacío">
                <input value={form.code} onChange={e => update('code', e.target.value)}
                  placeholder="CR-XXXX" className="inp mono"/>
              </Field>
              <Field label="Tipo" required>
                <select value={form.type} onChange={e => update('type', e.target.value)} className="inp">
                  {['Casa', 'Apartamento', 'Villa', 'Lote', 'Local comercial', 'Oficina'].map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Operación" required>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['Venta', 'Alquiler'].map(o => (
                    <button key={o} onClick={() => update('operation', o)}
                      style={{
                        flex: 1, padding: '9px 12px',
                        borderRadius: 8, fontWeight: 600, fontSize: 13,
                        background: form.operation === o ? 'var(--accent-soft)' : 'var(--surface-2)',
                        color: form.operation === o ? 'var(--accent-deep)' : 'var(--ink-2)',
                        border: '1px solid ' + (form.operation === o ? 'var(--accent)' : 'var(--border)')
                      }}>{o}</button>
                  ))}
                </div>
              </Field>
              <Field label="Estado">
                <select value={form.status} onChange={e => update('status', e.target.value)} className="inp">
                  {['Disponible', 'Reservada', 'Vendida', 'Pausa'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
              <Field label="Precio" required>
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, paddingLeft: 12 }}>
                  <span style={{ color: 'var(--muted)', fontWeight: 600 }}>$</span>
                  <input type="number" value={form.price} onChange={e => update('price', e.target.value)}
                    placeholder="485000" className="inp" style={{ background: 'transparent', border: 0 }}/>
                  <span style={{ padding: '0 12px', color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                    {form.operation === 'Alquiler' ? 'USD/mes' : 'USD'}
                  </span>
                </div>
              </Field>
              <Field label="Moneda">
                <select value={form.currency} onChange={e => update('currency', e.target.value)} className="inp">
                  <option value="USD">USD</option>
                  <option value="CRC">CRC</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Provincia / Cantón">
                <select value={form.location} onChange={e => update('location', e.target.value)} className="inp">
                  <option value="">Seleccionar...</option>
                  <option>San José</option>
                  <option>Heredia</option>
                  <option>Alajuela</option>
                  <option>Cartago</option>
                  <option>Guanacaste</option>
                  <option>Puntarenas</option>
                  <option>Limón</option>
                </select>
              </Field>
              <Field label="Barrio / Zona específica">
                <input value={form.neighborhood} onChange={e => update('neighborhood', e.target.value)}
                  placeholder="Ej. Trejos Montealegre" className="inp"/>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              <Field label="Habitaciones">
                <input type="number" value={form.bedrooms} onChange={e => update('bedrooms', e.target.value)} className="inp"/>
              </Field>
              <Field label="Baños">
                <input type="number" step="0.5" value={form.bathrooms} onChange={e => update('bathrooms', e.target.value)} className="inp"/>
              </Field>
              <Field label="Parqueos">
                <input type="number" value={form.parking} onChange={e => update('parking', e.target.value)} className="inp"/>
              </Field>
              <Field label="">
                <div style={{ height: 0 }}/>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Área construcción (m²)">
                <input type="number" value={form.area} onChange={e => update('area', e.target.value)} className="inp"/>
              </Field>
              <Field label="Área de lote (m²)">
                <input type="number" value={form.lot} onChange={e => update('lot', e.target.value)} className="inp"/>
              </Field>
            </div>
            <Field label="Características" hint="Selecciona todas las que apliquen">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Piscina', 'Jardín', 'Terraza', 'Seguridad 24/7', 'Gimnasio', 'Cuarto de servicio', 'Aire acondicionado', 'Smart home', 'Frente al mar', 'Pet friendly', 'Amueblado', 'Vista al parque', 'Walk-in closet', 'Bodega'].map(f => {
                  const active = form.features?.includes(f);
                  return (
                    <button key={f} onClick={() => update('features', active ? form.features.filter(x => x !== f) : [...(form.features || []), f])}
                      style={{
                        padding: '5px 11px', borderRadius: 999, fontSize: 12.5, fontWeight: 500,
                        background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
                        color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
                        border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)')
                      }}>{active ? '✓ ' : '+ '}{f}</button>
                  );
                })}
              </div>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gap: 18 }}>
            <Field label="Fotos" hint="Arrastra fotos aquí o haz clic para subir. Mínimo 4 fotos.">
              <div style={{
                border: '2px dashed var(--border-strong)',
                borderRadius: 10, padding: 36,
                textAlign: 'center', color: 'var(--muted)',
                background: 'var(--surface-2)',
                cursor: 'pointer'
              }}>
                <Icons.image size={32} style={{ marginBottom: 8, opacity: 0.5 }}/>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)' }}>Arrastra tus fotos aquí</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>o haz clic para seleccionar archivos · JPG, PNG hasta 10MB</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
                {['🏡', '🛋️', '🍳', '🛏️'].map((emoji, i) => (
                  <div key={i} style={{
                    aspectRatio: '1', borderRadius: 8,
                    background: 'var(--surface-3)',
                    display: 'grid', placeItems: 'center', fontSize: 32,
                    position: 'relative'
                  }}>{emoji}
                    {i === 0 && <span style={{ position: 'absolute', top: 5, left: 5, fontSize: 9, fontWeight: 700, background: 'var(--accent)', color: 'white', padding: '1px 6px', borderRadius: 4 }}>PRINCIPAL</span>}
                  </div>
                ))}
              </div>
            </Field>
            <Field label="Descripción" required>
              <textarea value={form.description} onChange={e => update('description', e.target.value)}
                placeholder="Describe la propiedad: estilo, acabados, comunidad, lo que la hace especial..."
                rows={6} className="inp" style={{ resize: 'vertical', lineHeight: 1.5 }}/>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'grid', gap: 18 }}>
            <Field label="Asignar agente">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {MockData.AGENTS.map(a => (
                  <button key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 999,
                    background: 'var(--surface-2)', border: '1px solid var(--border)',
                    fontSize: 13, fontWeight: 500
                  }}>
                    <Avatar name={a.name} size={22} color={a.color}/>
                    {a.name}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Visibilidad">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)', cursor: 'pointer' }}>
                  <input type="radio" name="vis" defaultChecked style={{ accentColor: 'var(--accent)' }}/>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Pública en catálogo</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Visible en sitio web y compartible vía WhatsApp. El bot la incluirá en respuestas relevantes.</div>
                  </div>
                </label>
                <label style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }}>
                  <input type="radio" name="vis"/>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Solo equipo interno</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Visible para agentes pero no aparece en catálogo público.</div>
                  </div>
                </label>
              </div>
            </Field>
            <Field label="">
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
                <input type="checkbox" checked={form.featured} onChange={e => update('featured', e.target.checked)} style={{ accentColor: 'var(--accent)' }}/>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><Icons.star size={13} style={{ color: 'var(--accent)' }}/> Marcar como destacada</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Aparece primero en el catálogo y el bot la prioriza.</div>
                </div>
              </label>
            </Field>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
          <button className="btn ghost" onClick={onCancel}>Cancelar</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 1 && <button className="btn ghost" onClick={() => setStep(step - 1)}><Icons.arrowleft size={13}/> Anterior</button>}
            {step < 4 && <button className="btn accent" onClick={() => setStep(step + 1)}>Siguiente <Icons.arrowright size={13}/></button>}
            {step === 4 && <button className="btn accent">{isNew ? 'Publicar propiedad' : 'Guardar cambios'}</button>}
          </div>
        </div>
      </div>
    </div>
  );
};

const Field = ({ label, hint, required, children }) => (
  <div>
    {label && (
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          {label}{required && <span style={{ color: 'var(--accent)', marginLeft: 3 }}>*</span>}
        </span>
        {hint && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span>}
      </label>
    )}
    {children}
  </div>
);

window.PropertiesGrid = PropertiesGrid;
window.PropertyDetail = PropertyDetail;
window.PropertyForm = PropertyForm;
