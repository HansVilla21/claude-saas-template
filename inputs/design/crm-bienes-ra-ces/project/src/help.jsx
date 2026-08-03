// Help center — categorías, búsqueda, artículos y soporte

const { useState: useStateH, useMemo: useMemoH } = React;

const HELP_CATEGORIES = [
  { id: 'getting-started', icon: 'sparkle', color: '#7C3AED', title: 'Primeros pasos', desc: 'Configura tu cuenta y comienza a usar Casacr' },
  { id: 'whatsapp', icon: 'whatsapp', color: '#25D366', title: 'WhatsApp y bot', desc: 'Conexión, plantillas, handoff y configuración del bot' },
  { id: 'leads', icon: 'users', color: '#0EA5E9', title: 'Manejo de leads', desc: 'Pipeline, etiquetas, tareas y seguimientos' },
  { id: 'properties', icon: 'home', color: '#EA580C', title: 'Propiedades', desc: 'Crear, editar, importar desde portales' },
  { id: 'calendar', icon: 'calendar', color: '#16A34A', title: 'Agenda', desc: 'Google Calendar, visitas y conflictos' },
  { id: 'reports', icon: 'trend', color: 'var(--accent)', title: 'Reportes y comisiones', desc: 'Reportes para propietarios, métricas' },
  { id: 'billing', icon: 'trend', color: '#94A3B8', title: 'Plan y facturación', desc: 'Cambiar plan, métodos de pago, facturas' },
  { id: 'troubleshooting', icon: 'settings', color: '#DC2626', title: 'Solución de problemas', desc: 'Errores comunes y cómo resolverlos' },
];

const HELP_ARTICLES = [
  // getting-started
  { id: 'a1', cat: 'getting-started', title: '¿Cómo conecto mi número de WhatsApp Business?', read: '4 min', popular: true, snippet: 'WhatsApp Business API requiere verificación. Te guiamos paso a paso por la activación...' },
  { id: 'a2', cat: 'getting-started', title: 'Configura tu perfil profesional', read: '2 min', snippet: 'Tu foto, biografía y zonas de trabajo entrenan al bot para que responda como vos.' },
  { id: 'a3', cat: 'getting-started', title: 'Importa tus primeras propiedades', read: '5 min', popular: true, snippet: 'Descarga la plantilla de Excel, completa los campos y sube tu catálogo en menos de 10 minutos.' },
  // whatsapp
  { id: 'a4', cat: 'whatsapp', title: '¿Cuándo el bot me transfiere una conversación?', read: '3 min', popular: true, snippet: 'El bot está configurado para hacer handoff cuando detecta intención de agendar visita...' },
  { id: 'a5', cat: 'whatsapp', title: 'Crea plantillas de respuestas rápidas con merge fields', read: '4 min', snippet: 'Usa {{nombre}}, {{propiedad}}, {{precio}} para personalizar mensajes automáticamente.' },
  { id: 'a6', cat: 'whatsapp', title: 'Tomar control manualmente de un chat del bot', read: '2 min', snippet: 'En cualquier conversación con el bot, haz click en "Tomar conversación" para intervenir.' },
  // leads
  { id: 'a7', cat: 'leads', title: 'Etapas del pipeline: cuándo mover un lead', read: '6 min', popular: true, snippet: 'Cada etapa tiene criterios claros. Te explicamos cuándo mover un lead a Calificado, Visita, Negociación...' },
  { id: 'a8', cat: 'leads', title: 'Lead scoring: cómo se calcula y para qué sirve', read: '4 min', snippet: 'El score combina engagement, presupuesto, tiempo de respuesta y otros factores.' },
  { id: 'a9', cat: 'leads', title: 'Tareas automáticas vs manuales', read: '3 min', snippet: 'El bot crea tareas automáticas; vos podés agregar las tuyas en cualquier momento.' },
  // properties
  { id: 'a10', cat: 'properties', title: 'Página pública de cada propiedad', read: '5 min', snippet: 'Cada propiedad tiene un link compartible con galería, calculadora y formulario de contacto.' },
  { id: 'a11', cat: 'properties', title: 'Usar URL externa (Encuentra24 / Properstar)', read: '3 min', snippet: 'Si ya publicás en otros portales, podés enlazar a la URL externa en lugar de la nuestra.' },
  // calendar
  { id: 'a12', cat: 'calendar', title: 'Sincronización con Google Calendar', read: '4 min', popular: true, snippet: 'Sincronización bidireccional. Las visitas que creas aquí aparecen en tu calendario personal.' },
  { id: 'a13', cat: 'calendar', title: 'Detección de conflictos por zona', read: '3 min', snippet: 'Casacr te avisa si agendaste visitas en zonas lejanas con poco tiempo entre ellas.' },
  // reports
  { id: 'a14', cat: 'reports', title: 'Cómo enviar reportes mensuales al propietario', read: '5 min', popular: true, snippet: 'Configura envío automático el día 1 de cada mes con métricas, visitas y feedback.' },
  { id: 'a15', cat: 'reports', title: 'Cálculo de comisiones', read: '3 min', snippet: 'Por defecto usamos 5% sobre venta y 1 mes en alquileres. Editable en Configuración → Negocio.' },
  // troubleshooting
  { id: 'a16', cat: 'troubleshooting', title: 'No recibo notificaciones de mensajes', read: '4 min', snippet: 'Revisa que tu WhatsApp esté conectado y los permisos de notificación del navegador.' },
  { id: 'a17', cat: 'troubleshooting', title: 'El bot no responde a un cliente', read: '3 min', snippet: 'Causas comunes: cliente fuera de horario configurado, mensaje en formato no soportado, etc.' },
];

const Help = ({ onNav }) => {
  const [query, setQuery] = useStateH('');
  const [selectedCat, setSelectedCat] = useStateH(null);
  const [openArticle, setOpenArticle] = useStateH(null);

  const fold = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const filteredArticles = useMemoH(() => {
    let arr = HELP_ARTICLES;
    if (selectedCat) arr = arr.filter(a => a.cat === selectedCat);
    if (query.trim()) {
      const q = fold(query);
      arr = arr.filter(a => fold(a.title).includes(q) || fold(a.snippet).includes(q));
    }
    return arr;
  }, [query, selectedCat]);

  const popularArticles = HELP_ARTICLES.filter(a => a.popular);

  if (openArticle) {
    const cat = HELP_CATEGORIES.find(c => c.id === openArticle.cat);
    return (
      <div className="page" style={{ maxWidth: 780, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, fontSize: 13 }}>
          <button onClick={() => setOpenArticle(null)} className="icon-btn"><Icons.arrowleft size={16}/></button>
          <span style={{ color: 'var(--muted)' }}>Ayuda</span>
          <Icons.chevron size={12} style={{ color: 'var(--muted)' }}/>
          <span style={{ color: 'var(--muted)' }}>{cat?.title}</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 12px', lineHeight: 1.15 }}>
          {openArticle.title}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)', marginBottom: 28 }}>
          <span>📖 {openArticle.read} de lectura</span>
          <span>·</span>
          <span>Actualizado el 12 mayo 2026</span>
        </div>
        <div className="card" style={{ padding: 28, fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-2)' }}>
          <p style={{ marginTop: 0 }}>{openArticle.snippet}</p>
          <p>
            Esta guía cubre todo lo que necesitas saber sobre <strong>{openArticle.title.toLowerCase()}</strong>.
            Si después de leerla aún tienes dudas, escríbenos al WhatsApp de soporte.
          </p>
          <h3 style={{ fontSize: 17, marginTop: 28 }}>Paso 1: Lo básico</h3>
          <p>Empieza por revisar la configuración actual de tu cuenta. Casacr trae valores predeterminados optimizados pero podés ajustarlos a tu flujo de trabajo.</p>
          <h3 style={{ fontSize: 17, marginTop: 24 }}>Paso 2: Configuración avanzada</h3>
          <p>Una vez que dominás lo básico, podés personalizar reglas más específicas. Por ejemplo, definir horarios donde el bot no responde, o etiquetas automáticas según el barrio que mencionen.</p>
          <h3 style={{ fontSize: 17, marginTop: 24 }}>Tips de la comunidad</h3>
          <ul style={{ paddingLeft: 20 }}>
            <li>Empezá con plantillas predeterminadas antes de personalizar todo</li>
            <li>Revisa el dashboard cada mañana para ver leads que requieren atención</li>
            <li>Usá las etiquetas para segmentar y enviar campañas dirigidas</li>
          </ul>
          <div style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 10, marginTop: 24, fontSize: 13.5 }}>
            <strong>💡 Sabías que:</strong> Los agentes que configuran correctamente las reglas de handoff cierran un 23% más leads en su primer trimestre.
          </div>
        </div>

        <div className="card" style={{ padding: 22, marginTop: 18, display: 'flex', alignItems: 'center', gap: 16, background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>¿Te fue útil este artículo?</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tu feedback nos ayuda a mejorar la documentación.</div>
          </div>
          <button className="btn ghost"><Icons.check size={13}/> Sí</button>
          <button className="btn ghost"><Icons.close size={13}/> No</button>
        </div>

        <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Artículos relacionados
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {HELP_ARTICLES.filter(a => a.cat === openArticle.cat && a.id !== openArticle.id).slice(0, 3).map(a => (
              <button key={a.id} onClick={() => setOpenArticle(a)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, fontSize: 13, textAlign: 'left' }}>
                <span style={{ fontWeight: 500 }}>{a.title}</span>
                <Icons.arrowright size={13} style={{ color: 'var(--muted)' }}/>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1080, margin: '0 auto' }}>
      {/* Hero */}
      <div style={{
        padding: '36px 40px', borderRadius: 18,
        background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--surface) 60%, var(--surface-2) 100%)',
        marginBottom: 28, textAlign: 'center',
        border: '1px solid var(--border)'
      }}>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Centro de ayuda
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 42, fontWeight: 500,
          letterSpacing: '-0.02em', margin: '0 0 8px', lineHeight: 1.1
        }}>¿En qué te ayudamos hoy?</h1>
        <p style={{ fontSize: 14.5, color: 'var(--muted)', margin: '0 0 24px' }}>
          Encuentra respuestas, mira tutoriales o contactá a soporte directo.
        </p>
        <div style={{ maxWidth: 480, margin: '0 auto', position: 'relative' }}>
          <Icons.search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}/>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar en la documentación..."
            className="p-inp"
            style={{ padding: '12px 14px 12px 40px', fontSize: 14 }}
          />
        </div>
      </div>

      {/* Quick contact cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        <div className="card" style={{ padding: 20, cursor: 'pointer' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#DCFCE7', display: 'grid', placeItems: 'center', marginBottom: 12, color: 'var(--whatsapp-deep)' }}>
            <Icons.whatsapp size={18}/>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Chat con soporte</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Respuesta en menos de 5 min · Lun-Vie 7am-7pm</div>
          <button className="btn accent sm" style={{ background: 'var(--whatsapp)' }}>
            <Icons.whatsapp size={12}/> Escribir al +506 4001 5555
          </button>
        </div>
        <div className="card" style={{ padding: 20, cursor: 'pointer' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#DBEAFE', display: 'grid', placeItems: 'center', marginBottom: 12, color: '#1E40AF' }}>
            🎥
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Tutoriales en video</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>24 videos cortos, de 2 a 6 minutos cada uno.</div>
          <button className="btn ghost sm">Ver biblioteca →</button>
        </div>
        <div className="card" style={{ padding: 20, cursor: 'pointer' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3EBFF', display: 'grid', placeItems: 'center', marginBottom: 12, color: '#7C3AED' }}>
            <Icons.users size={18}/>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Comunidad Casacr</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Únete al grupo de WhatsApp con +2,400 agentes de Costa Rica.</div>
          <button className="btn ghost sm">Solicitar acceso →</button>
        </div>
      </div>

      {/* Categories */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>Explora por categoría</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {HELP_CATEGORIES.map(c => {
            const Icon = Icons[c.icon];
            const count = HELP_ARTICLES.filter(a => a.cat === c.id).length;
            const active = selectedCat === c.id;
            return (
              <button key={c.id} onClick={() => setSelectedCat(active ? null : c.id)} className="card" style={{
                padding: 18, textAlign: 'left',
                border: '1px solid ' + (active ? c.color : 'var(--border)'),
                background: active ? c.color + '0F' : 'var(--surface)',
                cursor: 'pointer', transition: 'border-color 0.15s, transform 0.1s',
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: c.color + '20', color: c.color, display: 'grid', placeItems: 'center', marginBottom: 12 }}>
                  <Icon size={17}/>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>{c.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>{c.desc}</div>
                <div style={{ fontSize: 11, color: c.color, fontWeight: 600, marginTop: 10 }}>{count} artículos</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Article list */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {selectedCat ? HELP_CATEGORIES.find(c => c.id === selectedCat)?.title : query ? `Resultados (${filteredArticles.length})` : 'Más leídos'}
          </h3>
          {(selectedCat || query) && (
            <button onClick={() => { setSelectedCat(null); setQuery(''); }} className="btn ghost sm">
              Ver todos
            </button>
          )}
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {(query || selectedCat ? filteredArticles : popularArticles).map((a, i, arr) => {
            const cat = HELP_CATEGORIES.find(c => c.id === a.cat);
            return (
              <button key={a.id} onClick={() => setOpenArticle(a)} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)',
                width: '100%', textAlign: 'left', cursor: 'pointer'
              }} className="notif-item">
                <div style={{ width: 32, height: 32, borderRadius: 8, background: cat.color + '20', color: cat.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  {React.createElement(Icons[cat.icon], { size: 14 })}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                    <span>{cat.title}</span>
                    <span>·</span>
                    <span>📖 {a.read}</span>
                    {a.popular && (
                      <>
                        <span>·</span>
                        <span style={{ color: '#EA580C', fontWeight: 600 }}>🔥 Popular</span>
                      </>
                    )}
                  </div>
                </div>
                <Icons.arrowright size={14} style={{ color: 'var(--muted)' }}/>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer help */}
      <div style={{ marginTop: 28, padding: 20, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: 24 }}>🙋‍♀️</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>¿No encontraste lo que buscabas?</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Escribinos directo. Nuestro equipo te ayuda en menos de 5 minutos en horario laboral.
          </div>
        </div>
        <button className="btn accent"><Icons.whatsapp size={13}/> Contactar soporte</button>
      </div>
    </div>
  );
};

window.Help = Help;
