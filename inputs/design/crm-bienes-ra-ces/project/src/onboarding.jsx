// Onboarding wizard — primera experiencia

const { useState: useStateO, useEffect: useEffectO } = React;

const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useStateO(0);
  const [data, setData] = useStateO({
    name: '', phone: '', business: '', operationFocus: 'venta', zones: [],
    whatsappConnected: false, gcalConnected: false, propertiesImported: false,
  });
  const update = (k, v) => setData({ ...data, [k]: v });

  const STEPS = [
    { id: 'welcome', label: 'Bienvenida' },
    { id: 'profile', label: 'Tu perfil' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'gcal', label: 'Google Calendar' },
    { id: 'properties', label: 'Tus propiedades' },
    { id: 'bot', label: 'Tu bot' },
    { id: 'done', label: '¡Listo!' },
  ];

  const next = () => setStep(Math.min(step + 1, STEPS.length - 1));
  const back = () => setStep(Math.max(step - 1, 0));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'linear-gradient(135deg, #FAF7F2 0%, #F4E8DA 100%)',
      display: 'flex', flexDirection: 'column'
    }}>
      {/* Top bar with logo + progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '20px 32px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--accent)', color: 'white',
          display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)',
          fontStyle: 'italic', fontSize: 22, fontWeight: 600
        }}>C</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Casa<span className="serif" style={{ fontStyle: 'italic' }}>cr</span></div>
        <div style={{ flex: 1, display: 'flex', gap: 4, padding: '0 40px', maxWidth: 600, margin: '0 auto' }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? 'var(--accent)' : 'rgba(0,0,0,0.08)',
              transition: 'background 0.3s'
            }}/>
          ))}
        </div>
        <button onClick={() => onComplete(data)} style={{
          fontSize: 12.5, color: 'var(--muted)',
          background: 'transparent', border: 0, cursor: 'pointer',
          padding: '6px 10px', borderRadius: 6
        }}>Saltar configuración →</button>
      </div>

      {/* Step content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ maxWidth: 640, width: '100%' }}>
          {step === 0 && <Welcome onNext={next}/>}
          {step === 1 && <ProfileStep data={data} update={update}/>}
          {step === 2 && <Whatsapp data={data} update={update}/>}
          {step === 3 && <Gcal data={data} update={update}/>}
          {step === 4 && <Properties data={data} update={update}/>}
          {step === 5 && <BotPreview data={data}/>}
          {step === 6 && <Done data={data} onFinish={() => onComplete(data)}/>}
        </div>
      </div>

      {/* Footer nav */}
      {step > 0 && step < STEPS.length - 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderTop: '1px solid rgba(0,0,0,0.04)', background: 'rgba(255,255,255,0.4)' }}>
          <button onClick={back} className="btn ghost">
            <Icons.arrowleft size={13}/> Atrás
          </button>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Paso {step + 1} de {STEPS.length}
          </div>
          <button onClick={next} className="btn accent">
            Continuar <Icons.arrowright size={13}/>
          </button>
        </div>
      )}
    </div>
  );
};

const Welcome = ({ onNext }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: 60, marginBottom: 18 }}>👋</div>
    <h1 style={{
      fontFamily: 'var(--font-display)',
      fontSize: 56, fontWeight: 500, letterSpacing: '-0.02em',
      margin: '0 0 16px', lineHeight: 1.05
    }}>Hola, bienvenido a <span style={{ color: 'var(--accent-deep)', fontStyle: 'italic' }}>Casacr</span></h1>
    <p style={{ fontSize: 17, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 520, margin: '0 auto 32px', textWrap: 'pretty' }}>
      Vamos a configurar tu CRM en menos de 5 minutos. Te ayudaré a conectar WhatsApp, importar tus propiedades y poner tu bot a trabajar.
    </p>
    <button onClick={onNext} className="btn accent" style={{ padding: '12px 28px', fontSize: 15 }}>
      Empecemos <Icons.arrowright size={14}/>
    </button>
    <div style={{ marginTop: 28, fontSize: 12.5, color: 'var(--muted)' }}>
      ✓ Sin tarjeta · ✓ 14 días gratis · ✓ Configuración asistida
    </div>
  </div>
);

const ProfileStep = ({ data, update }) => (
  <div>
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Cuéntame de ti</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Esto personaliza tu experiencia y entrena al bot con tu información.</p>
    </div>
    <div className="card" style={{ padding: 28, background: 'var(--surface)' }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <OnbField label="Nombre completo" required>
          <input value={data.name} onChange={e => update('name', e.target.value)} className="onb-inp" placeholder="Ej. María Vargas Solano"/>
        </OnbField>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <OnbField label="Teléfono / WhatsApp" required>
            <input value={data.phone} onChange={e => update('phone', e.target.value)} className="onb-inp" placeholder="+506 8XXX XXXX"/>
          </OnbField>
          <OnbField label="Nombre de tu negocio">
            <input value={data.business} onChange={e => update('business', e.target.value)} className="onb-inp" placeholder="Ej. María Vargas Bienes Raíces"/>
          </OnbField>
        </div>
        <OnbField label="¿En qué te especializas?">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'venta', label: 'Venta', emoji: '🏡' },
              { id: 'alquiler', label: 'Alquiler', emoji: '🔑' },
              { id: 'ambas', label: 'Ambas', emoji: '⚖️' },
              { id: 'comercial', label: 'Comercial', emoji: '🏢' },
            ].map(op => (
              <button key={op.id} onClick={() => update('operationFocus', op.id)}
                style={{
                  flex: 1, padding: '12px 8px',
                  borderRadius: 10, fontSize: 13,
                  fontWeight: data.operationFocus === op.id ? 600 : 500,
                  background: data.operationFocus === op.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                  color: data.operationFocus === op.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                  border: '1px solid ' + (data.operationFocus === op.id ? 'var(--accent)' : 'var(--border)'),
                }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{op.emoji}</div>
                {op.label}
              </button>
            ))}
          </div>
        </OnbField>
        <OnbField label="Zonas donde trabajas" hint="Selecciona las que apliquen — el bot priorizará propiedades en estas zonas">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['Escazú', 'Santa Ana', 'Sabana', 'Rohrmoser', 'Heredia', 'Curridabat', 'San Pedro', 'Cariari', 'Atenas', 'Guanacaste', 'Pacífico Central', 'Limón'].map(z => {
              const active = data.zones.includes(z);
              return (
                <button key={z} onClick={() => update('zones', active ? data.zones.filter(x => x !== z) : [...data.zones, z])}
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 500,
                    background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
                    color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)')
                  }}>
                  {active ? '✓ ' : '+ '}{z}
                </button>
              );
            })}
          </div>
        </OnbField>
      </div>
    </div>
  </div>
);

const Whatsapp = ({ data, update }) => {
  const connect = () => {
    update('whatsappConnected', true);
  };
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Conecta tu WhatsApp</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>Lo más importante del CRM: todos tus chats en un solo lugar.</p>
      </div>
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        {!data.whatsappConnected ? (
          <>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#DCFCE7', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
              <Icons.whatsapp size={42} style={{ color: 'var(--whatsapp-deep)' }}/>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Conectar WhatsApp Business</h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 24px' }}>
              Usamos la API oficial de WhatsApp Business. Tus clientes seguirán hablándote al mismo número, pero tú los atenderás desde Casacr — con el bot ayudando 24/7.
            </p>
            <button onClick={connect} className="btn accent" style={{ padding: '11px 24px', background: '#25D366', color: 'white', fontSize: 14 }}>
              <Icons.whatsapp size={15}/> Conectar mi número
            </button>
            <div style={{ marginTop: 18, fontSize: 11.5, color: 'var(--muted)' }}>
              También puedes saltarlo y conectar más tarde desde Configuración.
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#DCFCE7', display: 'grid', placeItems: 'center', margin: '0 auto 18px', position: 'relative' }}>
              <Icons.whatsapp size={42} style={{ color: 'var(--whatsapp-deep)' }}/>
              <span style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: '#16A34A', color: 'white', display: 'grid', placeItems: 'center', border: '3px solid white' }}>
                <Icons.check size={14} stroke={3}/>
              </span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#15803D' }}>¡WhatsApp conectado!</h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 420, margin: '0 auto 16px' }}>
              Número {data.phone || '+506 ••••'} listo. Ya puedes recibir mensajes.
            </p>
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, padding: 14, background: 'var(--surface-2)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'left' }}>
              <div>✅ Bot activado con saludo predeterminado</div>
              <div>✅ Etiquetado automático de leads habilitado</div>
              <div>✅ Sincronización en tiempo real</div>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 18 }}>
        {[
          { icon: '🔒', label: 'Mensajes cifrados end-to-end' },
          { icon: '⚡', label: 'Respuesta del bot en <3s' },
          { icon: '🇨🇷', label: 'Soporte en Costa Rica' },
        ].map((f, i) => (
          <div key={i} style={{ padding: 12, background: 'rgba(255,255,255,0.5)', borderRadius: 8, fontSize: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{f.icon}</div>
            <div style={{ color: 'var(--muted)' }}>{f.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Gcal = ({ data, update }) => {
  const connect = () => update('gcalConnected', true);
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Conecta Google Calendar</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, textWrap: 'pretty' }}>Sincroniza tu agenda en ambos sentidos: visitas creadas en Casacr aparecen en Google, y eventos personales se respetan.</p>
      </div>
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        {!data.gcalConnected ? (
          <>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#E8F0FE', display: 'grid', placeItems: 'center', margin: '0 auto 18px' }}>
              <svg width="48" height="48" viewBox="0 0 24 24"><path fill="#4285F4" d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10zm-10-7c-1.5 0-2.5 1-2.5 2.5S10.5 10 12 10s2.5-1 2.5-2.5S13.5 5 12 5zm0 6c-2 0-4 1.5-4 4v2h8v-2c0-2.5-2-4-4-4z"/></svg>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Vincular Google Calendar</h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 24px' }}>
              Al conectar, Casacr puede leer tu disponibilidad y crear visitas como eventos en tu calendario personal. <strong>El bot no agendará automáticamente</strong>; siempre tendrás control.
            </p>
            <button onClick={connect} className="btn ghost" style={{ padding: '10px 22px', background: 'white', border: '1px solid var(--border)', fontSize: 14 }}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9c-.3 1.4-1 2.6-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.7 3.2-8.2z"/><path fill="#34A853" d="M12 23c2.9 0 5.3-1 7.1-2.6L15.5 18c-1 .7-2.2 1.1-3.5 1.1-2.7 0-5-1.8-5.8-4.3H2.5v2.8C4.3 21 7.9 23 12 23z"/><path fill="#FBBC04" d="M6.2 14.8c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V7.8H2.5C1.7 9.4 1.3 11.2 1.3 12.7s.4 3.3 1.2 4.9l3.7-2.8z"/><path fill="#EA4335" d="M12 5.5c1.5 0 2.9.5 4 1.5l3-3C17.3 2.4 14.9 1.5 12 1.5c-4.1 0-7.7 2-9.5 5l3.7 2.8C7 7.3 9.3 5.5 12 5.5z"/></svg>
              Conectar con Google
            </button>
            <div style={{ marginTop: 18, fontSize: 11.5, color: 'var(--muted)' }}>
              Casacr solo accede a tu calendario para crear y leer eventos. Nunca a tus correos.
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#E8F0FE', display: 'grid', placeItems: 'center', margin: '0 auto 18px', position: 'relative' }}>
              <svg width="48" height="48" viewBox="0 0 24 24"><path fill="#4285F4" d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10zm-10-7c-1.5 0-2.5 1-2.5 2.5S10.5 10 12 10s2.5-1 2.5-2.5S13.5 5 12 5zm0 6c-2 0-4 1.5-4 4v2h8v-2c0-2.5-2-4-4-4z"/></svg>
              <span style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: '#16A34A', color: 'white', display: 'grid', placeItems: 'center', border: '3px solid white' }}>
                <Icons.check size={14} stroke={3}/>
              </span>
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#1A56DB' }}>¡Google Calendar conectado!</h3>
            <p style={{ fontSize: 13.5, color: 'var(--muted)', maxWidth: 420, margin: '0 auto' }}>
              Sincronización activa. Encontramos <strong>142 eventos</strong> en tu calendario que respetaremos al agendar visitas.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const Properties = ({ data, update }) => {
  const [option, setOption] = useStateO(null);
  const importIt = (opt) => {
    setOption(opt);
    update('propertiesImported', true);
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Tus propiedades</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0 }}>¿Cómo te gustaría empezar tu catálogo?</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { id: 'manual', icon: 'plus', title: 'Agregar manualmente', desc: 'Subo cada propiedad una por una desde el catálogo.', highlight: false },
          { id: 'csv', icon: 'download', title: 'Importar desde Excel', desc: 'Subo mi catálogo actual en CSV o XLSX. Lo procesamos automáticamente.', highlight: true },
          { id: 'sync', icon: 'sparkle', title: 'Sincronizar desde portal', desc: 'Conecto encuentra24, Properstar u otro portal donde ya publico.', highlight: false },
        ].map(opt => {
          const Icon = Icons[opt.icon];
          const selected = option === opt.id;
          return (
            <button key={opt.id} onClick={() => importIt(opt.id)} className="card" style={{
              padding: 22, textAlign: 'left',
              border: '1px solid ' + (selected ? 'var(--accent)' : 'var(--border)'),
              background: selected ? 'var(--accent-soft)' : 'var(--surface)',
              position: 'relative', cursor: 'pointer'
            }}>
              {opt.highlight && !selected && (
                <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 700, background: 'var(--accent)', color: 'white', padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recomendado</span>
              )}
              <div style={{ width: 40, height: 40, borderRadius: 10, background: selected ? 'var(--accent)' : 'var(--surface-2)', color: selected ? 'white' : 'var(--accent-deep)', display: 'grid', placeItems: 'center', marginBottom: 14 }}>
                <Icon size={18}/>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{opt.title}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{opt.desc}</div>
              {selected && (
                <div style={{ marginTop: 12, padding: 8, background: 'rgba(255,255,255,0.6)', borderRadius: 6, fontSize: 12, color: 'var(--accent-deep)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icons.check size={13} stroke={2.5}/> Seleccionado
                </div>
              )}
            </button>
          );
        })}
      </div>

      {option === 'csv' && (
        <div className="card" style={{ marginTop: 18, padding: 22, border: '2px dashed var(--accent)', background: 'var(--accent-soft)' }}>
          <div style={{ textAlign: 'center' }}>
            <Icons.image size={28} style={{ color: 'var(--accent-deep)', marginBottom: 8 }}/>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-deep)' }}>Arrastra tu archivo aquí</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>O <button style={{ color: 'var(--accent-deep)', fontWeight: 600, textDecoration: 'underline', background: 'transparent', border: 0, cursor: 'pointer' }}>selecciona desde tu computadora</button></div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>Formatos: .xlsx · .csv · hasta 10MB</div>
            <a style={{ display: 'inline-block', marginTop: 14, fontSize: 12, color: 'var(--accent-deep)' }}>📥 Descarga plantilla de ejemplo</a>
          </div>
        </div>
      )}
    </div>
  );
};

const BotPreview = ({ data }) => (
  <div>
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, margin: '0 0 8px', letterSpacing: '-0.01em' }}>Conoce a tu asistente</h2>
      <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, textWrap: 'pretty' }}>
        Configuramos tu bot con valores predeterminados optimizados. Podrás personalizarlo cuando estés listo.
      </p>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
      {/* Bot info card */}
      <div className="card" style={{ padding: 22, background: 'linear-gradient(135deg, #F3EBFF, #FAF5FF)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#7C3AED', display: 'grid', placeItems: 'center', color: 'white' }}>
            <Icons.bot size={22}/>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Casa, tu asistente</div>
            <div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600 }}>● Activado</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Lo que hace</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Saluda y califica leads que llegan por WhatsApp</li>
              <li>Envía fichas de propiedades relevantes</li>
              <li>Recolecta presupuesto, preferencias, zona</li>
              <li>Identifica cuándo necesitas intervenir</li>
            </ul>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Cuándo te transfiere</div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Lead listo para agendar visita</li>
              <li>Preguntas sobre financiamiento o legal</li>
              <li>Negociación de precio</li>
              <li>El cliente lo pide explícitamente</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Chat preview */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'linear-gradient(180deg, #F4EFE7 0%, #ECE5D7 100%)' }}>
        <div style={{ padding: 12, background: 'white', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#7C3AED', color: 'white', display: 'grid', placeItems: 'center' }}>
            <Icons.bot size={15}/>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Vista previa</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Así verán tus clientes al bot</div>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { from: 'lead', text: 'Hola, vi un anuncio de propiedades en Escazú' },
            { from: 'bot', text: `¡Hola! 👋 Bienvenido a ${data.business || 'nuestra inmobiliaria'}. Soy Casa, te ayudo a encontrar tu próximo hogar.` },
            { from: 'bot', text: '¿Buscas para comprar, alquilar, o ambas opciones?' },
            { from: 'lead', text: 'Comprar' },
            { from: 'bot', text: 'Perfecto. ¿Cuál es tu presupuesto aproximado en USD?' },
          ].map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.from === 'lead' ? 'flex-start' : 'flex-end' }}>
              <div style={{
                maxWidth: '80%',
                background: m.from === 'lead' ? 'white' : '#F3EBFF',
                border: m.from === 'bot' ? '1px solid #E0CCFF' : 'none',
                padding: '6px 10px',
                borderRadius: 12,
                fontSize: 11.5,
                lineHeight: 1.4
              }}>{m.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div style={{ marginTop: 18, padding: 14, background: 'rgba(255,255,255,0.6)', borderRadius: 10, fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'center', lineHeight: 1.6 }}>
      💡 Más adelante podrás personalizar saludos, reglas de handoff y prioridad de propiedades desde <strong>Configuración del bot</strong>.
    </div>
  </div>
);

const Done = ({ data, onFinish }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
      <div style={{ fontSize: 80 }}>🎉</div>
    </div>
    <h1 style={{
      fontFamily: 'var(--font-display)',
      fontSize: 48, fontWeight: 500, letterSpacing: '-0.02em',
      margin: '0 0 12px', lineHeight: 1.1
    }}>¡Todo listo, {data.name?.split(' ')[0] || 'agente'}!</h1>
    <p style={{ fontSize: 16, color: 'var(--ink-2)', maxWidth: 480, margin: '0 auto 28px', lineHeight: 1.6, textWrap: 'pretty' }}>
      Tu CRM está configurado y el bot ya está atendiendo. Aquí está tu resumen.
    </p>
    <div className="card" style={{ padding: 22, maxWidth: 480, margin: '0 auto 28px', textAlign: 'left' }}>
      {[
        { icon: 'user', label: 'Perfil completado', sub: data.name || 'Tu información lista', ok: !!data.name },
        { icon: 'whatsapp', label: 'WhatsApp', sub: data.whatsappConnected ? 'Conectado y recibiendo mensajes' : 'Pendiente — configura más tarde', ok: data.whatsappConnected },
        { icon: 'calendar', label: 'Google Calendar', sub: data.gcalConnected ? 'Sincronizado' : 'Pendiente — configura más tarde', ok: data.gcalConnected },
        { icon: 'home', label: 'Propiedades', sub: data.propertiesImported ? 'Listas para mostrar al bot' : 'Pendiente — agrega más tarde', ok: data.propertiesImported },
        { icon: 'bot', label: 'Bot Casa', sub: 'Activado con configuración predeterminada', ok: true },
      ].map((item, i) => {
        const Icon = Icons[item.icon];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: item.ok ? '#DCFCE7' : 'var(--surface-2)', color: item.ok ? '#15803D' : 'var(--muted)', display: 'grid', placeItems: 'center' }}>
              {item.ok ? <Icons.check size={15} stroke={2.6}/> : <Icon size={14}/>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{item.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
    <button onClick={onFinish} className="btn accent" style={{ padding: '12px 28px', fontSize: 15 }}>
      Entrar a Casacr <Icons.arrowright size={14}/>
    </button>
    <div style={{ marginTop: 18, fontSize: 12, color: 'var(--muted)' }}>
      ¿Necesitas ayuda? Escríbenos al WhatsApp +506 4001 5555
    </div>
  </div>
);

const OnbField = ({ label, required, hint, children }) => (
  <div>
    <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>
        {label}{required && <span style={{ color: 'var(--accent)', marginLeft: 3 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span>}
    </label>
    {children}
  </div>
);

window.Onboarding = Onboarding;
