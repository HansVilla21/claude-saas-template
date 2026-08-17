// Public property page — lo que el cliente ve al recibir el link

const { useState: useStatePub } = React;

const PropertyPublic = ({ property, onBack, onOpenCalc }) => {
  const [imageIdx, setImageIdx] = useStatePub(0);
  const [contactName, setContactName] = useStatePub('');
  const [contactPhone, setContactPhone] = useStatePub('');
  const [contactMsg, setContactMsg] = useStatePub(`Hola, me interesa la propiedad ${property.code}. ¿Podemos coordinar una visita?`);
  const [sent, setSent] = useStatePub(false);
  const [copiedLink, setCopiedLink] = useStatePub(false);

  const formatPrice = (n, op) => {
    const f = new Intl.NumberFormat('en-US').format(n);
    return op === 'Alquiler' ? `$${f} USD/mes` : `$${f} USD`;
  };

  const agent = MockData.AGENTS.find(a => a.id === property.agent);
  const shareUrl = `casacr.app/p/${property.code.toLowerCase()}`;

  const copyLink = () => {
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1500);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'var(--bg)',
      overflow: 'auto',
      display: 'flex', flexDirection: 'column'
    }}>
      {/* Top bar (agent-facing — preview mode) */}
      <div style={{
        background: 'var(--ink)', color: 'white',
        padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 14, fontSize: 12.5, flexShrink: 0
      }}>
        <button onClick={onBack} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          color: 'white', fontSize: 12, fontWeight: 500,
        }}>
          <Icons.arrowleft size={14}/> Volver al CRM
        </button>
        <span style={{ flex: 1, opacity: 0.7 }}>Vista previa de la página pública — así la verán tus clientes</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <code style={{ background: 'rgba(255,255,255,0.15)', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
            {shareUrl}
          </code>
          <button onClick={copyLink} style={{
            background: copiedLink ? '#16A34A' : 'rgba(255,255,255,0.15)', color: 'white',
            padding: '4px 10px', borderRadius: 4, fontSize: 11.5, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 5
          }}>
            {copiedLink ? <><Icons.check size={11} stroke={2.5}/> Copiado</> : <>📋 Copiar link</>}
          </button>
          <button style={{
            background: '#25D366', color: 'white',
            padding: '4px 10px', borderRadius: 4, fontSize: 11.5, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 5
          }}>
            <Icons.whatsapp size={11}/> Compartir
          </button>
        </div>
      </div>

      {/* Public site nav */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '14px 32px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={agent?.name} size={32} color={agent?.color}/>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{agent?.name || 'Agente'}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Vargas Bienes Raíces · CCCBR #4521</div>
          </div>
        </div>
        <span style={{ flex: 1 }}/>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>📞 +506 8412 9988</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>✉️ maria@vargasbienes.cr</span>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px', flex: 1, width: '100%', boxSizing: 'border-box' }}>
        {/* Hero — gallery + summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 18, marginBottom: 24 }}>
          <div>
            <div style={{
              aspectRatio: '4/3', borderRadius: 14, overflow: 'hidden',
              background: `linear-gradient(135deg, var(--accent-soft), #F4E2D6 60%, #E5D4BD)`,
              display: 'grid', placeItems: 'center', fontSize: 140,
              position: 'relative'
            }}>
              <span style={{ filter: 'drop-shadow(0 12px 20px rgba(0,0,0,0.15))' }}>{property.images?.[imageIdx]}</span>
              {property.featured && (
                <span style={{ position: 'absolute', top: 14, left: 14, background: 'var(--accent)', color: 'white', padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  ⭐ Destacada
                </span>
              )}
              <button style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Guardar">
                <Icons.star size={16} style={{ color: 'var(--accent)' }}/>
              </button>
              <button style={{ position: 'absolute', top: 60, right: 14, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)', display: 'grid', placeItems: 'center', cursor: 'pointer' }} title="Compartir">
                <Icons.send size={15}/>
              </button>
              <div style={{ position: 'absolute', bottom: 14, right: 14, background: 'rgba(34,28,22,0.85)', color: 'white', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
                {imageIdx + 1} / {property.images?.length || 1}
              </div>
            </div>
            {property.images?.length > 1 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {property.images.map((img, i) => (
                  <button key={i} onClick={() => setImageIdx(i)} style={{
                    flex: 1, aspectRatio: '4/3', borderRadius: 8,
                    background: 'var(--surface-2)',
                    border: '2px solid ' + (i === imageIdx ? 'var(--accent)' : 'transparent'),
                    display: 'grid', placeItems: 'center', fontSize: 28,
                    opacity: i === imageIdx ? 1 : 0.55
                  }}>{img}</button>
                ))}
              </div>
            )}
          </div>

          {/* Summary panel */}
          <div className="card" style={{ padding: 24, height: 'fit-content', position: 'sticky', top: 20 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: property.operation === 'Venta' ? 'var(--accent-soft)' : '#DCFCE7', color: property.operation === 'Venta' ? 'var(--accent-deep)' : '#15803D', borderRadius: 999, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
              {property.operation}
            </span>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-0.01em', margin: '10px 0 4px', lineHeight: 1.1 }}>{property.title}</h1>
            <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14 }}>
              <Icons.location size={13}/>{property.location}
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 500,
              color: 'var(--accent-deep)', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 18
            }}>
              {formatPrice(property.price, property.operation)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              {property.bedrooms !== undefined && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icons.bed size={15} style={{ color: 'var(--muted)' }}/> <strong>{property.bedrooms}</strong> hab.</div>}
              {property.bathrooms !== undefined && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icons.bath size={15} style={{ color: 'var(--muted)' }}/> <strong>{property.bathrooms}</strong> baños</div>}
              {property.area && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icons.ruler size={15} style={{ color: 'var(--muted)' }}/> <strong>{property.area}</strong> m²</div>}
              {property.parking !== undefined && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Icons.car size={15} style={{ color: 'var(--muted)' }}/> <strong>{property.parking}</strong> parqueos</div>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <button className="btn accent" style={{ justifyContent: 'center', padding: '10px' }}>
                <Icons.whatsapp size={14}/> Solicitar visita por WhatsApp
              </button>
              <button onClick={onOpenCalc} className="btn ghost" style={{ justifyContent: 'center', padding: '9px' }}>
                💰 Calcular financiamiento
              </button>
              <button className="btn ghost" style={{ justifyContent: 'center', padding: '9px' }}>
                📞 Llamar al agente
              </button>
            </div>
          </div>
        </div>

        {/* Description + features */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 18, marginBottom: 24 }}>
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 17 }}>Sobre esta propiedad</h3>
            <p style={{ margin: 0, color: 'var(--ink-2)', fontSize: 14, lineHeight: 1.7, textWrap: 'pretty' }}>{property.description}</p>

            <h3 style={{ margin: '24px 0 12px', fontSize: 17 }}>Características</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {(property.features || []).map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13 }}>
                  <span style={{ color: '#16A34A', fontWeight: 700 }}>✓</span> {f}
                </div>
              ))}
            </div>

            <h3 style={{ margin: '24px 0 12px', fontSize: 17 }}>Ubicación</h3>
            <div style={{
              aspectRatio: '16/8', borderRadius: 10,
              background: 'linear-gradient(135deg, #E8F0E5, #D4E2D0)',
              display: 'grid', placeItems: 'center', position: 'relative', overflow: 'hidden',
              border: '1px solid var(--border)'
            }}>
              <svg viewBox="0 0 400 200" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.45 }}>
                <path d="M0,80 Q100,60 200,90 T400,80" stroke="#15803D" strokeWidth="1.5" fill="none"/>
                <path d="M40,140 L120,110 L220,130 L320,100 L380,140" stroke="#92400E" strokeWidth="1" fill="none"/>
              </svg>
              <div style={{ background: 'var(--accent)', color: 'white', padding: '8px 12px', borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', boxShadow: 'var(--shadow-2)' }}>
                <Icons.location size={18} stroke={2.4} style={{ transform: 'rotate(45deg)' }}/>
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-2)' }}>
              {property.neighborhood && <><strong>Barrio:</strong> {property.neighborhood}<br/></>}
              <strong>Cantón:</strong> {property.location}
            </div>
          </div>

          {/* Contact form */}
          <div className="card" style={{ padding: 22, height: 'fit-content', position: 'sticky', top: 20 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>¿Te interesa?</h3>
            {sent ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>📩</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#15803D', marginBottom: 4 }}>¡Mensaje enviado!</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{agent?.name?.split(' ')[0] || 'El agente'} te contactará en breve por WhatsApp.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Tu nombre" className="p-inp"/>
                <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Tu WhatsApp" className="p-inp"/>
                <textarea value={contactMsg} onChange={e => setContactMsg(e.target.value)} rows={4} className="p-inp" style={{ resize: 'vertical', fontFamily: 'inherit' }}/>
                <button onClick={() => setSent(true)} className="btn accent" style={{ justifyContent: 'center', padding: '10px' }}>
                  Enviar mensaje
                </button>
                <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>
                  Tu información solo se comparte con {agent?.name?.split(' ')[0]}.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 0', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
          <div>
            Anuncio #{property.code} · Publicado {property.createdAt} · Vista {property.views} veces
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Powered by <strong style={{ color: 'var(--accent-deep)', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>Casacr</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

window.PropertyPublic = PropertyPublic;
