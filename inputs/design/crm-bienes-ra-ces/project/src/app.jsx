// Root app — routing and tweaks

const { useState: useStateA, useEffect: useEffectA } = React;

const ACCENT_OPTIONS = [
  ['#B85C38', '#F4E2D6', '#8A3F22'],  // terracotta
  ['#15803D', '#D4EBDA', '#0F5E2D'],  // jungle
  ['#0E7C92', '#CFE7EC', '#085362'],  // ocean
  ['#B47314', '#F2E1BE', '#7F500A'],  // gold
];

const App = () => {
  const [tweaks, setTweak] = useTweaks(window.TWEAK_DEFAULTS);

  // Login state
  const [loggedIn, setLoggedIn] = useStateA(() => {
    try { return localStorage.getItem('casacr-logged-in') === '1'; } catch { return false; }
  });
  const doLogin = () => {
    try { localStorage.setItem('casacr-logged-in', '1'); } catch {}
    setLoggedIn(true);
  };

  // Onboarding state — show once, then persist
  const [showOnboarding, setShowOnboarding] = useStateA(() => {
    try { return localStorage.getItem('casacr-onboarded') !== '1'; } catch { return true; }
  });
  const completeOnboarding = () => {
    try { localStorage.setItem('casacr-onboarded', '1'); } catch {}
    setShowOnboarding(false);
  };

  // Mortgage calc modal (global)
  const [calcOpen, setCalcOpen] = useStateA(null); // null or property
  const openCalc = (prop = null) => setCalcOpen(prop || {});

  // Public property preview
  const [publicProperty, setPublicProperty] = useStateA(null);

  // Notifications + search
  const [showNotifs, setShowNotifs] = useStateA(false);
  const [showSearch, setShowSearch] = useStateA(false);
  const notifCount = window.__notifUnread || 0;

  useEffectA(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffectA(() => {
    document.body.dataset.density = tweaks.density;
    document.body.dataset.font = tweaks.font;

    const palette = Array.isArray(tweaks.accent) ? tweaks.accent : ACCENT_OPTIONS[0];
    document.documentElement.style.setProperty('--accent', palette[0]);
    document.documentElement.style.setProperty('--accent-soft', palette[1]);
    document.documentElement.style.setProperty('--accent-deep', palette[2]);
  }, [tweaks]);

  // ——— Routing ———
  const [route, setRoute] = useStateA({ screen: 'dashboard' });

  const nav = (screen, params) => setRoute({ screen, ...params });
  const openLead = (id) => nav('lead-detail', { leadId: id });
  const openInbox = () => nav('inbox');
  const openProperty = (id) => nav('property-detail', { propertyId: id });
  const createProperty = () => nav('property-create');
  const goBack = () => {
    if (route.screen === 'lead-detail') nav('leads');
    else if (route.screen === 'property-detail') nav('properties');
    else if (route.screen === 'property-create') nav('properties');
    else nav('inbox');
  };

  const sidebarActive = ({
    'dashboard': 'dashboard',
    'inbox': 'inbox',
    'leads': 'leads',
    'lead-detail': 'leads',
    'tasks': 'tasks',
    'properties': 'properties',
    'property-detail': 'properties',
    'property-create': 'properties',
    'calendar': 'calendar',
    'reports': 'reports',
    'help': 'help',
    'profile': null,
    'settings': null,
    'billing': null,
  })[route.screen] || 'dashboard';

  const topbarConfig = {
    'dashboard': { title: 'Dashboard', sub: 'Resumen de tu cartera' },
    'inbox': { title: 'Inbox', sub: 'Conversaciones de WhatsApp Business' },
    'leads': { title: 'Leads', sub: 'Pipeline y seguimiento' },
    'lead-detail': { title: 'Lead' },
    'tasks': { title: 'Tareas', sub: 'Hoy, esta semana y atrasadas' },
    'properties': { title: 'Propiedades', sub: 'Catálogo y publicación' },
    'property-detail': { title: 'Propiedad' },
    'property-create': { title: 'Nueva propiedad' },
    'calendar': { title: 'Agenda', sub: 'Sincronizado con Google Calendar' },
    'reports': { title: 'Reportes', sub: 'Analytics y reportes para propietarios' },
    'help': { title: 'Ayuda', sub: 'Documentación, tutoriales y soporte' },
    'profile': { title: 'Mi perfil' },
    'settings': { title: 'Configuración' },
    'billing': { title: 'Plan y facturación' },
  }[route.screen];

  const renderScreen = () => {
    switch (route.screen) {
      case 'dashboard':
        return <Dashboard leads={MockData.LEADS} properties={MockData.PROPERTIES} tasks={MockData.TASKS}
          onOpenLead={openLead} onOpenProperty={openProperty} onNav={(s) => nav(s)}/>;
      case 'inbox':
        return <Inbox
          inboxLayout={tweaks.inboxLayout}
          showAI={tweaks.showAI}
          properties={MockData.PROPERTIES}
          leads={MockData.LEADS}
          conversations={MockData.CONVERSATIONS}
          onOpenLead={openLead}
        />;
      case 'leads':
        return <LeadsTable leads={MockData.LEADS}
          initialFilter={route.filter}
          onOpenLead={openLead}
          onOpenInbox={openInbox}/>;
      case 'lead-detail': {
        const lead = MockData.LEADS.find(l => l.id === route.leadId);
        if (!lead) return null;
        return <LeadDetail lead={lead} properties={MockData.PROPERTIES}
          onBack={goBack} onOpenInbox={openInbox}/>;
      }
      case 'properties':
        return <PropertiesGrid properties={MockData.PROPERTIES}
          onOpenProperty={openProperty} onCreate={createProperty}/>;
      case 'property-detail': {
        const property = MockData.PROPERTIES.find(p => p.id === route.propertyId);
        if (!property) return null;
        return <PropertyDetail property={property} leads={MockData.LEADS}
          onBack={goBack}
          onPreviewPublic={() => setPublicProperty(property)}
          onOpenCalc={() => openCalc(property)}/>;
      }
      case 'property-create':
        return <PropertyForm onCancel={goBack}/>;
      case 'calendar':
        return <Calendar leads={MockData.LEADS} properties={MockData.PROPERTIES} events={MockData.EVENTS}
          onOpenLead={openLead} onOpenProperty={openProperty}/>;
      case 'reports':
        return <Reports leads={MockData.LEADS} properties={MockData.PROPERTIES}/>;
      case 'tasks':
        return <Tasks tasks={MockData.TASKS} leads={MockData.LEADS} properties={MockData.PROPERTIES}
          onOpenLead={openLead} onOpenProperty={openProperty}/>;
      case 'profile':
        return <Profile initialTab="profile"/>;
      case 'settings':
        return <Profile initialTab="business"/>;
      case 'billing':
        return <Profile initialTab="billing"/>;
      case 'help':
        return <Help onNav={(s) => nav(s)}/>;
      default:
        return null;
    }
  };

  const isInbox = route.screen === 'inbox';
  const isCalendar = route.screen === 'calendar';

  if (!loggedIn) {
    return <Login onSubmit={doLogin}/>;
  }

  if (showOnboarding) {
    return <Onboarding onComplete={completeOnboarding}/>;
  }

  return (
    <div className="app">
      <Sidebar current={sidebarActive} onNav={(id, params) => nav(id, params)}/>
      <div className="main">
        <Topbar
          title={topbarConfig.title}
          sub={topbarConfig.sub}
          onSearchClick={() => setShowSearch(true)}
          onBellClick={() => setShowNotifs(!showNotifs)}
          notifCount={notifCount}
        />
        <div className="content" style={(isInbox || isCalendar) ? { display: 'flex', flexDirection: 'column', padding: 0 } : {}}>
          {renderScreen()}
        </div>
      </div>

      {showNotifs && (
        <NotificationsPanel
          onClose={() => setShowNotifs(false)}
          onOpenLead={openLead}
          onNav={(s) => nav(s)}
        />
      )}

      <SearchPalette
        open={showSearch}
        onClose={() => setShowSearch(false)}
        leads={MockData.LEADS}
        properties={MockData.PROPERTIES}
        conversations={MockData.CONVERSATIONS}
        onOpenLead={openLead}
        onOpenProperty={openProperty}
        onNav={(s) => nav(s)}
      />

      {calcOpen && <MortgageCalc property={calcOpen.id ? calcOpen : null} onClose={() => setCalcOpen(null)}/>}
      {publicProperty && <PropertyPublic property={publicProperty} onBack={() => setPublicProperty(null)} onOpenCalc={() => openCalc(publicProperty)}/>}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Apariencia">
          <TweakColor label="Color de acento"
            value={tweaks.accent}
            options={ACCENT_OPTIONS}
            onChange={(v) => setTweak('accent', v)}
          />
          <TweakRadio label="Densidad" value={tweaks.density}
            options={[
              { value: 'compact', label: 'Compacto' },
              { value: 'cozy', label: 'Cómodo' },
              { value: 'comfortable', label: 'Amplio' },
            ]}
            onChange={(v) => setTweak('density', v)}/>
          <TweakRadio label="Tipografía" value={tweaks.font}
            options={[
              { value: 'geist', label: 'Geist' },
              { value: 'manrope', label: 'Manrope' },
              { value: 'jakarta', label: 'Jakarta' },
            ]}
            onChange={(v) => setTweak('font', v)}/>
        </TweakSection>

        <TweakSection label="Inbox">
          <TweakSelect label="Layout del inbox" value={tweaks.inboxLayout}
            options={[
              { value: 'three-col', label: '3 columnas (clásico)' },
              { value: 'two-col', label: '2 col + drawer' },
              { value: 'focus', label: '3 col + barra IA' },
            ]}
            onChange={(v) => setTweak('inboxLayout', v)}/>
          <TweakToggle label="Resumen del bot (barra superior)"
            value={tweaks.showAI}
            onChange={(v) => setTweak('showAI', v)}/>
        </TweakSection>

        <TweakSection label="Onboarding">
          <TweakButton label="Volver a ver onboarding" onClick={() => {
            try { localStorage.removeItem('casacr-onboarded'); } catch {}
            setShowOnboarding(true);
          }}/>
          <TweakButton label="Cerrar sesión (ver login)" onClick={() => {
            try { localStorage.removeItem('casacr-logged-in'); } catch {}
            setLoggedIn(false);
          }}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
