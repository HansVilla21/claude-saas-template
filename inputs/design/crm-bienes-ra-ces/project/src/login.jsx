// Login screen — primera pantalla de la app

const { useState: useStateLog } = React;

const Login = ({ onSubmit }) => {
  const [email, setEmail] = useStateLog('');
  const [password, setPassword] = useStateLog('');
  const [remember, setRemember] = useStateLog(true);
  const [loading, setLoading] = useStateLog(false);

  const submit = (e) => {
    e?.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); onSubmit(); }, 800);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      background: 'var(--bg)',
    }}>
      {/* Left: form */}
      <div style={{ display: 'flex', flexDirection: 'column', padding: '40px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 60 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'var(--accent)', color: 'white',
            display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)',
            fontStyle: 'italic', fontSize: 22, fontWeight: 600
          }}>C</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Casa<span className="serif" style={{ fontStyle: 'italic' }}>cr</span></div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 360, alignSelf: 'center', width: '100%' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500,
            letterSpacing: '-0.02em', margin: '0 0 8px', lineHeight: 1.05
          }}>Bienvenido de vuelta</h1>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 32px', lineHeight: 1.55 }}>
            Inicia sesión para continuar atendiendo tus leads.
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block' }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="maria@vargasbienes.cr" className="p-inp"/>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Contraseña</label>
                <a style={{ fontSize: 11.5, color: 'var(--accent-deep)', textDecoration: 'none', cursor: 'pointer' }}>¿Olvidaste tu contraseña?</a>
              </div>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className="p-inp"/>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}/>
              Mantener sesión activa
            </label>
            <button type="submit" className="btn accent" disabled={loading} style={{ padding: '12px 14px', fontSize: 14, justifyContent: 'center', marginTop: 8 }}>
              {loading ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.6s linear infinite' }}/>
                  Iniciando sesión...
                </span>
              ) : 'Iniciar sesión'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 8px', fontSize: 11, color: 'var(--muted)' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
              o continúa con
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }}/>
            </div>

            <button type="button" className="btn ghost" style={{ padding: '10px', justifyContent: 'center', fontSize: 13 }}>
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9c-.3 1.4-1 2.6-2.2 3.4v2.8h3.6c2.1-1.9 3.2-4.7 3.2-8.2z"/><path fill="#34A853" d="M12 23c2.9 0 5.3-1 7.1-2.6L15.5 18c-1 .7-2.2 1.1-3.5 1.1-2.7 0-5-1.8-5.8-4.3H2.5v2.8C4.3 21 7.9 23 12 23z"/><path fill="#FBBC04" d="M6.2 14.8c-.2-.7-.3-1.4-.3-2.1s.1-1.4.3-2.1V7.8H2.5C1.7 9.4 1.3 11.2 1.3 12.7s.4 3.3 1.2 4.9l3.7-2.8z"/><path fill="#EA4335" d="M12 5.5c1.5 0 2.9.5 4 1.5l3-3C17.3 2.4 14.9 1.5 12 1.5c-4.1 0-7.7 2-9.5 5l3.7 2.8C7 7.3 9.3 5.5 12 5.5z"/></svg>
              Continuar con Google
            </button>
          </form>

          <div style={{ marginTop: 32, fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
            ¿No tienes cuenta? <a style={{ color: 'var(--accent-deep)', fontWeight: 600, cursor: 'pointer' }}>Solicita una demo</a>
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 16 }}>
          <a style={{ color: 'inherit', textDecoration: 'none' }}>Términos</a>
          <a style={{ color: 'inherit', textDecoration: 'none' }}>Privacidad</a>
          <a style={{ color: 'inherit', textDecoration: 'none' }}>Ayuda</a>
          <span style={{ marginLeft: 'auto' }}>© 2026 Casacr · Hecho en 🇨🇷</span>
        </div>
      </div>

      {/* Right: brand panel */}
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-soft) 0%, #E5D4BD 60%, var(--accent) 130%)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: 48
      }}>
        {/* Decorative blobs */}
        <svg style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, opacity: 0.25 }} viewBox="0 0 200 200">
          <path fill="var(--accent)" d="M44.5,-66.8C56.2,-58.2,63.3,-43.2,68.4,-28.3C73.5,-13.5,76.6,1.3,72.6,14.1C68.6,26.9,57.4,37.7,45.1,46.3C32.8,55,19.4,61.4,4.7,64.5C-10,67.6,-26,67.3,-39.5,60.8C-53,54.4,-64,41.7,-67.9,27.3C-71.8,12.9,-68.5,-3.2,-62.5,-17.4C-56.4,-31.6,-47.6,-43.8,-36.1,-52.7C-24.5,-61.6,-12.3,-67.1,2.4,-70.6C17,-74.2,34.1,-75.6,44.5,-66.8Z" transform="translate(100 100)" />
        </svg>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 12, color: 'var(--accent-deep)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Casacr para agentes
          </div>
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 46, fontStyle: 'italic',
            color: 'var(--accent-deep)', letterSpacing: '-0.02em', lineHeight: 1.1,
            marginBottom: 24, maxWidth: 460
          }}>
            "Cerré 3 propiedades en mi primer mes con Casacr. El bot me liberó horas de trabajo."
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'var(--accent-deep)', color: 'white',
              display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700
            }}>LR</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Laura Ramírez</div>
              <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Agente independiente · Heredia</div>
            </div>
          </div>
        </div>

        {/* Stats badges */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', gap: 16 }}>
          {[
            { val: '2.4k+', label: 'Agentes activos' },
            { val: '47s', label: 'Tiempo de respuesta' },
            { val: '92%', label: 'Bot resuelve solo' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(8px)', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.6)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--accent-deep)', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink-2)', marginTop: 3, fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

window.Login = Login;
