// Profile + Settings — tabbed page accesible desde el avatar

const { useState: useStateP2, useEffect: useEffectP2 } = React;

const Profile = ({ initialTab = 'profile' }) => {
  const [tab, setTab] = useStateP2(initialTab);

  const TABS = [
    { id: 'profile', label: 'Mi perfil', icon: 'user' },
    { id: 'business', label: 'Negocio', icon: 'building' },
    { id: 'integrations', label: 'Integraciones', icon: 'sparkle' },
    { id: 'bot', label: 'Asistente IA', icon: 'bot' },
    { id: 'notifs', label: 'Notificaciones', icon: 'bell' },
    { id: 'billing', label: 'Plan y facturación', icon: 'trend' },
    { id: 'security', label: 'Seguridad', icon: 'settings' },
  ];

  return (
    <div className="page" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h2>{tab === 'profile' ? 'Mi perfil' : 'Configuración'}</h2>
          <div className="sub">Administra tu cuenta, integraciones y preferencias</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 22, alignItems: 'flex-start' }}>
        {/* Left rail */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 16 }}>
          {TABS.map(t => {
            const Icon = Icons[t.icon];
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 8,
                background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                color: tab === t.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                fontSize: 13, fontWeight: tab === t.id ? 600 : 500,
                width: '100%', textAlign: 'left',
                borderLeft: '3px solid ' + (tab === t.id ? 'var(--accent)' : 'transparent'),
                paddingLeft: 9
              }}>
                <Icon size={15}/>
                {t.label}
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 14 }}>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8,
              color: '#DC2626', fontSize: 13, fontWeight: 500,
              width: '100%', textAlign: 'left'
            }}>
              <Icons.arrowleft size={14}/>
              Cerrar sesión
            </button>
          </div>
        </nav>

        {/* Right content */}
        <div>
          {tab === 'profile' && <ProfileTab/>}
          {tab === 'business' && <BusinessTab/>}
          {tab === 'integrations' && <IntegrationsTab/>}
          {tab === 'bot' && <BotTab/>}
          {tab === 'notifs' && <NotifsTab/>}
          {tab === 'billing' && <BillingTab/>}
          {tab === 'security' && <SecurityTab/>}
        </div>
      </div>
    </div>
  );
};

// — Tab content components

// — Zones picker — provincias + zonas estratégicas + custom
const PROVINCES = ['San José', 'Alajuela', 'Cartago', 'Heredia', 'Guanacaste', 'Puntarenas', 'Limón'];
const POPULAR_ZONES = [
  // San José
  'Escazú', 'Santa Ana', 'Sabana', 'Rohrmoser', 'Curridabat', 'San Pedro', 'Pavas',
  'Tibás', 'Moravia', 'Desamparados',
  // Heredia
  'San Joaquín de Flores', 'San Rafael', 'Barva', 'Cariari',
  // Alajuela
  'Atenas', 'Grecia', 'San Ramón', 'La Garita',
  // Guanacaste
  'Tamarindo', 'Playa Hermosa', 'Nosara', 'Coco', 'Sámara',
  // Puntarenas
  'Jacó', 'Manuel Antonio', 'Quepos', 'Dominical',
  // Cartago
  'Tres Ríos', 'Paraíso',
];

const ZonesPicker = ({ zones, onChange }) => {
  const [customInput, setCustomInput] = useStateP2('');
  const [showAll, setShowAll] = useStateP2(false);
  const popularVisible = showAll ? POPULAR_ZONES : POPULAR_ZONES.slice(0, 14);

  const toggle = (z) => {
    onChange(zones.includes(z) ? zones.filter(x => x !== z) : [...zones, z]);
  };

  const addCustom = () => {
    const z = customInput.trim();
    if (z && !zones.includes(z)) onChange([...zones, z]);
    setCustomInput('');
  };

  // Custom zones = selected but not in any of the known lists
  const knownAll = new Set([...PROVINCES, ...POPULAR_ZONES]);
  const customZones = zones.filter(z => !knownAll.has(z));

  const Chip = ({ z, group }) => {
    const active = zones.includes(z);
    return (
      <button key={z} onClick={() => toggle(z)}
        style={{
          padding: group === 'province' ? '6px 13px' : '5px 11px',
          borderRadius: 999,
          fontSize: group === 'province' ? 13 : 12,
          fontWeight: group === 'province' ? 600 : 500,
          background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
          color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
          border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)')
        }}>
        {active ? '✓ ' : '+ '}{z}
      </button>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Provincias */}
      <div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
          Provincias completas
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PROVINCES.map(p => <Chip key={p} z={p} group="province"/>)}
        </div>
      </div>

      {/* Zonas estratégicas */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Zonas estratégicas
          </div>
          {!showAll && POPULAR_ZONES.length > 14 && (
            <button onClick={() => setShowAll(true)} style={{ fontSize: 11, color: 'var(--accent-deep)', fontWeight: 600, background: 'transparent', border: 0, cursor: 'pointer' }}>
              Ver todas ({POPULAR_ZONES.length}) →
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {popularVisible.map(z => <Chip key={z} z={z}/>)}
        </div>
      </div>

      {/* Custom zones — show if any */}
      {customZones.length > 0 && (
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
            Otras zonas que agregaste
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {customZones.map(z => (
              <span key={z} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 6px 5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 500,
                background: 'var(--accent-soft)', color: 'var(--accent-deep)',
                border: '1px solid var(--accent)'
              }}>
                ✓ {z}
                <button onClick={() => toggle(z)} style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.06)', color: 'var(--ink)',
                  display: 'grid', placeItems: 'center', cursor: 'pointer'
                }} title="Quitar">
                  <Icons.close size={10} stroke={2.5}/>
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add custom */}
      <div>
        <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
          Agregar otra zona
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
            placeholder="Ej. Ciudad Colón, Belén, Naranjo..."
            className="p-inp"
            style={{ flex: 1 }}
          />
          <button className="btn ghost" onClick={addCustom} disabled={!customInput.trim()} style={{ opacity: customInput.trim() ? 1 : 0.5 }}>
            <Icons.plus size={13}/> Agregar
          </button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          💡 Tip: agregá zonas específicas donde trabajás aunque sean pequeñas. El bot las priorizará cuando reciba clientes interesados en esa zona.
        </div>
      </div>
    </div>
  );
};

const ProfileTab = () => {
  const [form, setForm] = useStateP2({
    name: 'María Vargas Solano', phone: '+506 8412 9988', email: 'maria@vargasbienes.cr',
    title: 'Agente Senior', bio: 'Especialista en propiedades residenciales en Escazú y Santa Ana. 8 años en el mercado costarricense. CCCBR #4521.',
    avatar: 'MV', language: 'es', timezone: 'America/Costa_Rica',
  });
  const update = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Tu foto y nombre</h3>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 18 }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={form.name} size={84}/>
            <button style={{
              position: 'absolute', bottom: -4, right: -4,
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--ink)', color: 'white',
              border: '3px solid var(--surface)',
              display: 'grid', placeItems: 'center'
            }} title="Cambiar foto">
              <Icons.image size={13}/>
            </button>
          </div>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
            Tu foto aparece en mensajes a clientes, reportes y en tu perfil público.
            <br/>Usa una foto profesional, de frente, con buena iluminación.
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button className="btn ghost sm">Subir foto</button>
              <button className="btn ghost sm" style={{ color: '#DC2626' }}>Eliminar</button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Información personal</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          <PField label="Nombre completo" required>
            <input value={form.name} onChange={e => update('name', e.target.value)} className="p-inp"/>
          </PField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <PField label="Email" required>
              <input value={form.email} onChange={e => update('email', e.target.value)} className="p-inp"/>
            </PField>
            <PField label="Teléfono / WhatsApp">
              <input value={form.phone} onChange={e => update('phone', e.target.value)} className="p-inp"/>
            </PField>
          </div>
          <PField label="Título profesional" hint="Aparece en tu firma de email y reportes">
            <input value={form.title} onChange={e => update('title', e.target.value)} className="p-inp"/>
          </PField>
          <PField label="Sobre ti" hint="Una breve presentación. Aparece en tu firma y en reportes para propietarios.">
            <textarea value={form.bio} onChange={e => update('bio', e.target.value)} className="p-inp" rows={4} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}/>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textAlign: 'right' }}>{form.bio.length}/240</div>
          </PField>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Preferencias</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <PField label="Idioma">
              <select value={form.language} onChange={e => update('language', e.target.value)} className="p-inp">
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </PField>
            <PField label="Zona horaria">
              <select value={form.timezone} onChange={e => update('timezone', e.target.value)} className="p-inp">
                <option value="America/Costa_Rica">San José (GMT-6)</option>
                <option value="America/Panama">Ciudad de Panamá (GMT-5)</option>
                <option value="America/Mexico_City">Ciudad de México (GMT-6)</option>
              </select>
            </PField>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost">Descartar cambios</button>
        <button className="btn accent">Guardar cambios</button>
      </div>
    </div>
  );
};

const BusinessTab = () => {
  const [form, setForm] = useStateP2({
    business: 'Vargas Bienes Raíces',
    legalId: '3-101-789456',
    website: 'vargasbienes.cr',
    address: 'Plaza Itskatzú, Local 12, Escazú',
    focus: 'venta',
    zones: ['Escazú', 'Santa Ana', 'Sabana'],
    commissionRate: 5,
    rentCommission: 1,
  });
  const update = (k, v) => setForm({ ...form, [k]: v });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Tu negocio</h3>
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <PField label="Nombre comercial">
              <input value={form.business} onChange={e => update('business', e.target.value)} className="p-inp"/>
            </PField>
            <PField label="Cédula jurídica">
              <input value={form.legalId} onChange={e => update('legalId', e.target.value)} className="p-inp mono"/>
            </PField>
          </div>
          <PField label="Sitio web" hint="Opcional — aparece en tu firma">
            <input value={form.website} onChange={e => update('website', e.target.value)} className="p-inp"/>
          </PField>
          <PField label="Dirección física">
            <input value={form.address} onChange={e => update('address', e.target.value)} className="p-inp"/>
          </PField>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Operación</h3>
        <PField label="Te especializas en">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'venta', label: 'Venta', emoji: '🏡' },
              { id: 'alquiler', label: 'Alquiler', emoji: '🔑' },
              { id: 'ambas', label: 'Ambas', emoji: '⚖️' },
              { id: 'comercial', label: 'Comercial', emoji: '🏢' },
            ].map(op => (
              <button key={op.id} onClick={() => update('focus', op.id)} style={{
                flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 13,
                fontWeight: form.focus === op.id ? 600 : 500,
                background: form.focus === op.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: form.focus === op.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                border: '1px solid ' + (form.focus === op.id ? 'var(--accent)' : 'var(--border)')
              }}>
                <span style={{ marginRight: 6 }}>{op.emoji}</span>{op.label}
              </button>
            ))}
          </div>
        </PField>
        <div style={{ marginTop: 14 }}>
          <PField label="Zonas donde trabajas" hint="Provincias completas y zonas populares; agrega las tuyas si no están">
            <ZonesPicker zones={form.zones} onChange={(z) => update('zones', z)}/>
          </PField>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 15 }}>Comisiones predeterminadas</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--muted)' }}>Se usan para calcular proyecciones en el dashboard. Puedes ajustarlas por propiedad después.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <PField label="Venta" hint="% sobre el precio">
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7 }}>
              <input type="number" value={form.commissionRate} onChange={e => update('commissionRate', e.target.value)} style={{ flex: 1, padding: '9px 12px', background: 'transparent', border: 0, outline: 0, fontSize: 13.5 }}/>
              <span style={{ padding: '0 12px', color: 'var(--muted)', fontWeight: 600 }}>%</span>
            </div>
          </PField>
          <PField label="Alquiler" hint="# de meses">
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7 }}>
              <input type="number" step="0.5" value={form.rentCommission} onChange={e => update('rentCommission', e.target.value)} style={{ flex: 1, padding: '9px 12px', background: 'transparent', border: 0, outline: 0, fontSize: 13.5 }}/>
              <span style={{ padding: '0 12px', color: 'var(--muted)', fontWeight: 600 }}>meses</span>
            </div>
          </PField>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn accent">Guardar cambios</button>
      </div>
    </div>
  );
};

const IntegrationsTab = () => {
  const items = [
    { id: 'wa', name: 'WhatsApp Business', desc: 'API oficial para recibir y enviar mensajes', connected: true, sub: '+506 8412 9988 · 47 chats hoy', icon: 'wa' },
    { id: 'gcal', name: 'Google Calendar', desc: 'Sincronización bidireccional de eventos', connected: true, sub: '142 eventos · Última sync hace 2 min', icon: 'gcal' },
    { id: 'gmail', name: 'Gmail', desc: 'Enviar reportes y plantillas por email', connected: false, sub: 'No conectado', icon: 'gmail' },
    { id: 'stripe', name: 'Stripe / Tilopay', desc: 'Cobros de comisiones y reservas', connected: false, sub: 'No conectado', icon: 'stripe' },
    { id: 'gdrive', name: 'Google Drive', desc: 'Sincronizar contratos y documentos', connected: false, sub: 'No conectado', icon: 'gdrive' },
    { id: 'zapier', name: 'Zapier', desc: 'Automatizaciones con 5000+ apps', connected: false, sub: 'No conectado', icon: 'zapier' },
  ];

  const portalsComingSoon = [
    { id: 'encuentra24', name: 'Encuentra24', desc: 'Sincronizá tu cartera y publicá en un click', eta: 'Q3 2026' },
    { id: 'properstar', name: 'Properstar Costa Rica', desc: 'Publicación automática de propiedades destacadas', eta: 'Q3 2026' },
    { id: 'remax', name: 'RE/MAX MLS', desc: 'Catálogo compartido con la red Re/Max', eta: 'Q4 2026' },
    { id: 'tucasa', name: 'TuCasa.cr', desc: 'Listings + integración con CRM', eta: 'Q4 2026' },
  ];

  const renderIcon = (id) => {
    if (id === 'wa') return <Icons.whatsapp size={22} style={{ color: '#25D366' }}/>;
    if (id === 'gcal') return <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10z"/><path fill="white" d="M12 7l-1 3h2l-1-3zm0 10c-1.5 0-3-1-3-3h2c0 .5.5 1 1 1s1-.5 1-1H9c0 1.5 1 3 3 3z"/></svg>;
    if (id === 'wc') return <div style={{ width: 22, height: 22, borderRadius: 6, background: '#7C3AED', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11 }}>WC</div>;
    if (id === 'gmail') return <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#EA4335" d="M22 6l-10 7L2 6v12c0 1 1 2 2 2h16c1 0 2-1 2-2V6z"/><path fill="#FBBC04" d="M22 6V4c0-1-1-2-2-2H4C3 2 2 3 2 4v2l10 7 10-7z"/></svg>;
    if (id === 'stripe') return <div style={{ width: 22, height: 22, borderRadius: 6, background: '#635BFF', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>S</div>;
    if (id === 'gdrive') return <svg width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M12 22l4-7H8z"/><path fill="#34A853" d="M12 2L8 9h8z"/><path fill="#FBBC04" d="M2 15l5-8 4 7H6z"/></svg>;
    if (id === 'zapier') return <div style={{ width: 22, height: 22, borderRadius: 6, background: '#FF4F00', color: 'white', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11 }}>Z</div>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 22, borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Integraciones</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Conecta Casacr con las herramientas que ya usas.</p>
        </div>
        {items.map((item, i) => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 22px',
            borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border)'
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {renderIcon(item.id)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.desc}</div>
            </div>
            <div style={{ fontSize: 11.5, color: item.connected ? '#16A34A' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, marginRight: 14 }}>
              {item.connected && <span style={{ width: 6, height: 6, borderRadius: 50, background: '#16A34A' }}/>}
              {item.sub}
            </div>
            <button className={item.connected ? 'btn ghost sm' : 'btn accent sm'}>
              {item.connected ? 'Configurar' : 'Conectar'}
            </button>
          </div>
        ))}
      </div>

      {/* Portales coming soon */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: 22, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              Portales inmobiliarios
              <span style={{ background: 'var(--accent-soft)', color: 'var(--accent-deep)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Próximamente</span>
            </h3>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Publicá tu cartera automáticamente en los portales más populares.</p>
          </div>
        </div>
        {portalsComingSoon.map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '14px 22px',
            borderBottom: i === portalsComingSoon.length - 1 ? 'none' : '1px solid var(--border)',
            opacity: 0.85
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 18, color: 'var(--muted)' }}>
              🏠
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.desc}</div>
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, marginRight: 14 }}>
              <span style={{ width: 6, height: 6, borderRadius: 50, background: '#F59E0B' }}/>
              Disponible {p.eta}
            </span>
            <button className="btn ghost sm" disabled style={{ opacity: 0.6, cursor: 'not-allowed' }}>
              🔔 Avisarme
            </button>
          </div>
        ))}
        <div style={{ padding: '14px 22px', background: 'var(--surface-2)', fontSize: 12, color: 'var(--ink-2)', borderTop: '1px solid var(--border)' }}>
          💡 Mientras tanto, podés enlazar la URL externa de cada propiedad (Encuentra24, Properstar) directamente en su ficha — así compartís el link del portal donde ya tenés más visibilidad.
        </div>
      </div>
    </div>
  );
};

const BotTab = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="card" style={{ padding: 22, background: 'linear-gradient(135deg, #F3EBFF, #FAF5FF 70%, var(--surface) 100%)', border: '1px solid #E0CCFF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#7C3AED', display: 'grid', placeItems: 'center', color: 'white' }}>
            <Icons.bot size={26}/>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Casa, tu asistente</h3>
            <div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600, marginTop: 2 }}>● Activado · Atendiendo 24/7</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" defaultChecked style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}/>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Activo</span>
          </label>
        </div>
        <div style={{ padding: 12, background: 'rgba(255,255,255,0.6)', borderRadius: 8, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>
          En esta versión la <strong>configuración del bot está gestionada por nuestro equipo</strong>. Si quieres ajustar saludos, reglas o flujos, escríbenos al WhatsApp <strong>+506 4001 5555</strong> y lo configuramos en menos de 24h.
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Reglas de handoff (cuándo te transfiere)</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'Lead listo para agendar visita', on: true },
            { label: 'Preguntas sobre financiamiento o legal', on: true },
            { label: 'Negociación de precio o oferta', on: true },
            { label: 'El cliente lo pide explícitamente', on: true },
            { label: 'Cliente lleva más de 5 mensajes sin avanzar', on: false },
            { label: 'Lead identificado como "Hot" (alta intención)', on: true },
          ].map((r, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 8, cursor: 'pointer' }}>
              <span style={{ fontSize: 13 }}>{r.label}</span>
              <input type="checkbox" defaultChecked={r.on} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}/>
            </label>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Saludo del bot</h3>
        <PField label="Mensaje de bienvenida" hint="Lo primero que ven los clientes nuevos">
          <textarea defaultValue="¡Hola! 👋 Bienvenido a Vargas Bienes Raíces. Soy Casa, te ayudo a encontrar tu próximo hogar en Costa Rica. ¿Buscas para comprar, alquilar, o ambas opciones?"
            className="p-inp" rows={4} style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}/>
        </PField>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn accent">Guardar cambios</button>
      </div>
    </div>
  );
};

const NotifsTab = () => {
  const PREFS = [
    { group: 'WhatsApp', items: [
      { label: 'Mensaje nuevo de un lead', push: true, email: false, wa: true },
      { label: 'Handoff: el bot necesita ayuda', push: true, email: false, wa: true },
      { label: 'Lead identificado como Hot', push: true, email: true, wa: true },
    ]},
    { group: 'Agenda', items: [
      { label: 'Recordatorio 24h antes de visita', push: true, email: false, wa: true },
      { label: 'Recordatorio 1h antes de visita', push: true, email: false, wa: false },
      { label: 'Conflicto detectado entre eventos', push: true, email: false, wa: false },
    ]},
    { group: 'Tareas', items: [
      { label: 'Tarea atrasada', push: true, email: true, wa: false },
      { label: 'Resumen diario de pendientes (8am)', push: false, email: true, wa: true },
    ]},
    { group: 'Hitos y reportes', items: [
      { label: 'Cierre confirmado', push: true, email: true, wa: true },
      { label: 'Reporte mensual al propietario listo', push: false, email: true, wa: false },
      { label: 'Resumen semanal del bot', push: false, email: true, wa: false },
    ]},
  ];

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: 22, borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Preferencias de notificación</h3>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Decide cómo quieres recibir cada tipo de aviso.</p>
      </div>
      <div style={{ padding: '12px 22px', display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', gap: 12, fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>
        <div/>
        <div style={{ textAlign: 'center' }}>App</div>
        <div style={{ textAlign: 'center' }}>Email</div>
        <div style={{ textAlign: 'center' }}>WhatsApp</div>
      </div>
      {PREFS.map(group => (
        <div key={group.group}>
          <div style={{ padding: '12px 22px 4px', fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.group}</div>
          {group.items.map((item, i) => (
            <div key={i} style={{ padding: '10px 22px', display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13 }}>{item.label}</div>
              <div style={{ textAlign: 'center' }}><input type="checkbox" defaultChecked={item.push} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}/></div>
              <div style={{ textAlign: 'center' }}><input type="checkbox" defaultChecked={item.email} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}/></div>
              <div style={{ textAlign: 'center' }}><input type="checkbox" defaultChecked={item.wa} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}/></div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ padding: '16px 22px', background: 'var(--surface-2)', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn accent">Guardar preferencias</button>
      </div>
    </div>
  );
};

const BillingTab = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 26, background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tu plan actual</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, color: 'var(--accent-deep)', letterSpacing: '-0.01em', marginTop: 6 }}>
              Plan Profesional
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 4 }}>
              <strong>$49/mes</strong> · Renovación: <strong>1 de junio 2026</strong>
            </div>
          </div>
          <button className="btn accent">Actualizar plan</button>
        </div>
      </div>
      <div style={{ padding: 22, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        {[
          { label: 'Leads activos', used: 142, max: '∞' },
          { label: 'Propiedades', used: 8, max: 50 },
          { label: 'Mensajes WhatsApp / mes', used: 1247, max: 5000 },
          { label: 'Reportes generados', used: 12, max: '∞' },
        ].map(m => (
          <div key={m.label} style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase' }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{m.used} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>/ {m.max}</span></div>
            {m.max !== '∞' && (
              <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, m.used / m.max * 100)}%`, height: '100%', background: 'var(--accent)' }}/>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>

    <div className="card" style={{ padding: 22 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Método de pago</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, background: 'var(--surface-2)', borderRadius: 8 }}>
        <div style={{ width: 44, height: 30, background: 'linear-gradient(135deg, #1A1F71, #2A2F8B)', color: 'white', borderRadius: 4, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>VISA</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Visa terminada en 4242</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Vence 12/2027 · María Vargas Solano</div>
        </div>
        <button className="btn ghost sm">Cambiar</button>
      </div>
    </div>

    <div className="card" style={{ padding: 22 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Historial de facturación</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Fecha', 'Descripción', 'Monto', 'Estado', ''].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { date: '1 mayo 2026', desc: 'Plan Profesional · Mayo', amount: '$49.00', status: 'Pagado' },
            { date: '1 abril 2026', desc: 'Plan Profesional · Abril', amount: '$49.00', status: 'Pagado' },
            { date: '1 marzo 2026', desc: 'Plan Profesional · Marzo', amount: '$49.00', status: 'Pagado' },
          ].map((i, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '10px 6px' }}>{i.date}</td>
              <td style={{ padding: '10px 6px' }}>{i.desc}</td>
              <td style={{ padding: '10px 6px', fontWeight: 600 }}>{i.amount}</td>
              <td style={{ padding: '10px 6px' }}><span className="pill" style={{ background: '#DCFCE7', color: '#15803D', fontSize: 11 }}><span className="dot"/>{i.status}</span></td>
              <td style={{ padding: '10px 6px', textAlign: 'right' }}><button className="btn ghost sm"><Icons.download size={12}/></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SecurityTab = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
    <div className="card" style={{ padding: 22 }}>
      <h3 style={{ margin: '0 0 16px', fontSize: 15 }}>Contraseña</h3>
      <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <PField label="Contraseña actual"><input type="password" className="p-inp" placeholder="••••••••"/></PField>
        <PField label="Nueva contraseña"><input type="password" className="p-inp"/></PField>
        <PField label="Confirmar contraseña"><input type="password" className="p-inp"/></PField>
        <button className="btn accent" style={{ marginTop: 8, alignSelf: 'flex-start' }}>Cambiar contraseña</button>
      </div>
    </div>

    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>Autenticación en dos pasos</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)' }}>Añade una capa extra de seguridad a tu cuenta.</p>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}/>
          <span style={{ fontSize: 13 }}>Activar</span>
        </label>
      </div>
    </div>

    <div className="card" style={{ padding: 22 }}>
      <h3 style={{ margin: '0 0 14px', fontSize: 15 }}>Sesiones activas</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { device: 'MacBook Pro · Chrome', loc: 'San José, Costa Rica', last: 'Ahora', current: true },
          { device: 'iPhone 15 · App Casacr', loc: 'San José, Costa Rica', last: 'hace 2 horas' },
          { device: 'Windows · Firefox', loc: 'Heredia, Costa Rica', last: 'hace 3 días' },
        ].map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, background: 'var(--surface-2)', borderRadius: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--surface)', display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>
              <Icons.settings size={16}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.device}
                {s.current && <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Actual</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{s.loc} · {s.last}</div>
            </div>
            {!s.current && <button className="btn ghost sm" style={{ color: '#DC2626' }}>Cerrar</button>}
          </div>
        ))}
      </div>
    </div>

    <div className="card" style={{ padding: 22, border: '1px solid #FEE2E2', background: '#FEF2F2' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#B91C1C' }}>Zona peligrosa</h3>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#7F1D1D' }}>Acciones irreversibles. Procede con cuidado.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn ghost" style={{ border: '1px solid #FCA5A5', color: '#B91C1C' }}>Exportar todos mis datos</button>
        <button className="btn ghost" style={{ border: '1px solid #FCA5A5', color: '#B91C1C' }}>Eliminar mi cuenta</button>
      </div>
    </div>
  </div>
);

const PField = ({ label, hint, required, children }) => (
  <div>
    {label && (
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{label}{required && <span style={{ color: 'var(--accent)', marginLeft: 3 }}>*</span>}</span>
        {hint && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span>}
      </label>
    )}
    {children}
  </div>
);

window.Profile = Profile;
