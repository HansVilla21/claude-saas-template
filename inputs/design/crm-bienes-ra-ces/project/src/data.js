// Mock data for the Costa Rica real estate CRM

const AGENTS = [
  { id: 'a1', name: 'María Vargas', initials: 'MV', color: '#C2410C' },
  { id: 'a2', name: 'Andrés Solís', initials: 'AS', color: '#15803D' },
  { id: 'a3', name: 'Camila Rojas', initials: 'CR', color: '#7C3AED' },
];

const PROPERTIES = [
  {
    id: 'p1',
    code: 'CR-2031',
    title: 'Casa moderna en Escazú',
    type: 'Casa',
    operation: 'Venta',
    price: 485000,
    currency: 'USD',
    bedrooms: 3,
    bathrooms: 3.5,
    area: 320,
    lot: 480,
    parking: 2,
    location: 'Escazú, San José',
    neighborhood: 'Trejos Montealegre',
    status: 'Disponible',
    featured: true,
    description: 'Casa moderna de dos plantas en zona residencial exclusiva. Acabados de lujo, cocina integrada con isla, jardín privado y terraza techada con vista a las montañas. Comunidad cerrada con seguridad 24/7.',
    features: ['Piscina', 'Jardín', 'Seguridad 24/7', 'Terraza', 'Cuarto de servicio', 'Aire acondicionado'],
    images: ['🏡', '🛋️', '🍳', '🛏️'],
    agent: 'a1',
    createdAt: '2026-04-12',
    views: 142,
    leads: 8,
  },
  {
    id: 'p2',
    code: 'CR-2042',
    title: 'Apartamento Sabana Norte',
    type: 'Apartamento',
    operation: 'Venta',
    price: 215000,
    currency: 'USD',
    bedrooms: 2,
    bathrooms: 2,
    area: 110,
    parking: 1,
    location: 'Sabana, San José',
    neighborhood: 'Sabana Norte',
    status: 'Disponible',
    description: 'Apartamento en torre nueva, piso 9, con vista despejada al Parque La Sabana. Cocina con electrodomésticos incluidos. Edificio con gimnasio, piscina y lounge.',
    features: ['Gimnasio', 'Piscina común', 'Vista al parque', 'Amenidades', 'Bodega'],
    images: ['🏢', '🛋️', '🌆'],
    agent: 'a2',
    createdAt: '2026-04-28',
    views: 89,
    leads: 5,
  },
  {
    id: 'p3',
    code: 'CR-2018',
    title: 'Villa frente al mar, Tamarindo',
    type: 'Villa',
    operation: 'Venta',
    price: 1250000,
    currency: 'USD',
    bedrooms: 4,
    bathrooms: 4.5,
    area: 520,
    lot: 1100,
    parking: 3,
    location: 'Tamarindo, Guanacaste',
    neighborhood: 'Playa Langosta',
    status: 'Disponible',
    featured: true,
    description: 'Villa de lujo a pie de playa con acceso privado. Diseño tropical contemporáneo, piscina infinita, palapa, y vista directa al Pacífico. Ideal para renta vacacional o residencia.',
    features: ['Frente al mar', 'Piscina infinita', 'Palapa', 'Acceso a playa', 'Smart home', 'Solar panels'],
    images: ['🏖️', '🌊', '🌴', '🛏️'],
    agent: 'a1',
    createdAt: '2026-03-05',
    views: 287,
    leads: 14,
  },
  {
    id: 'p4',
    code: 'CR-2055',
    title: 'Lote residencial Santa Ana',
    type: 'Lote',
    operation: 'Venta',
    price: 195000,
    currency: 'USD',
    area: 850,
    location: 'Santa Ana, San José',
    neighborhood: 'Pozos',
    status: 'Disponible',
    description: 'Lote plano en condominio cerrado con calle pavimentada, agua, electricidad y fibra óptica. Listo para construir.',
    features: ['Plano', 'Servicios incluidos', 'Condominio', 'Permisos al día'],
    images: ['🌳', '📐'],
    agent: 'a3',
    createdAt: '2026-05-02',
    views: 41,
    leads: 2,
  },
  {
    id: 'p5',
    code: 'CR-2047',
    title: 'Apartamento Rohrmoser',
    type: 'Apartamento',
    operation: 'Alquiler',
    price: 1450,
    currency: 'USD',
    bedrooms: 2,
    bathrooms: 2,
    area: 95,
    parking: 1,
    location: 'Rohrmoser, San José',
    neighborhood: 'Rohrmoser',
    status: 'Disponible',
    description: 'Apartamento amueblado en torre con amenidades completas. Incluye agua, internet y servicio de mantenimiento.',
    features: ['Amueblado', 'Internet incluido', 'Pet friendly', 'Gimnasio', 'Piscina'],
    images: ['🏙️', '🛋️'],
    agent: 'a2',
    createdAt: '2026-05-08',
    views: 67,
    leads: 4,
  },
  {
    id: 'p6',
    code: 'CR-2009',
    title: 'Casa colonial en Heredia',
    type: 'Casa',
    operation: 'Venta',
    price: 320000,
    currency: 'USD',
    bedrooms: 4,
    bathrooms: 3,
    area: 240,
    lot: 350,
    parking: 2,
    location: 'Heredia centro',
    neighborhood: 'San Joaquín de Flores',
    status: 'Reservada',
    description: 'Casa colonial restaurada con detalles originales. Patio interno con jardín tropical. A 10 minutos del centro de Heredia.',
    features: ['Restaurada', 'Patio interno', 'Detalles originales', 'Estudio'],
    images: ['🏛️', '🌿'],
    agent: 'a3',
    createdAt: '2026-02-20',
    views: 156,
    leads: 11,
  },
  {
    id: 'p7',
    code: 'CR-2061',
    title: 'Penthouse Avenida Escazú',
    type: 'Apartamento',
    operation: 'Venta',
    price: 695000,
    currency: 'USD',
    bedrooms: 3,
    bathrooms: 3.5,
    area: 230,
    parking: 2,
    location: 'Escazú, San José',
    neighborhood: 'Avenida Escazú',
    status: 'Disponible',
    featured: true,
    description: 'Penthouse de dos niveles con terraza privada de 80m². Vista 360° al Valle Central. Edificio con concierge, spa y restaurante.',
    features: ['Terraza privada', 'Vista 360°', 'Concierge', 'Spa', '2 niveles', 'Walk-in closet'],
    images: ['🏙️', '🌇', '🛋️', '🛁'],
    agent: 'a1',
    createdAt: '2026-04-20',
    views: 198,
    leads: 9,
  },
  {
    id: 'p8',
    code: 'CR-2052',
    title: 'Casa en condominio Curridabat',
    type: 'Casa',
    operation: 'Venta',
    price: 275000,
    currency: 'USD',
    bedrooms: 3,
    bathrooms: 2.5,
    area: 180,
    lot: 220,
    parking: 2,
    location: 'Curridabat, San José',
    neighborhood: 'Granadilla',
    status: 'Disponible',
    description: 'Casa familiar en condominio con áreas verdes y juegos infantiles. Excelente ubicación cerca de colegios y centros comerciales.',
    features: ['Condominio familiar', 'Áreas verdes', 'Juegos infantiles', 'Seguridad'],
    images: ['🏘️', '🌳'],
    agent: 'a2',
    createdAt: '2026-04-30',
    views: 73,
    leads: 6,
  },
];

const LEADS = [
  {
    id: 'l1',
    name: 'Daniela Mora',
    phone: '+506 8412 9988',
    email: 'daniela.mora@gmail.com',
    avatar: 'DM',
    status: 'Calificado',
    source: 'WhatsApp',
    interest: 'Casa en Escazú o Santa Ana',
    budget: '450k – 550k USD',
    operation: 'Compra',
    assignedTo: 'a1',
    bot: false,
    interestedIn: ['p1', 'p7'],
    createdAt: '2026-05-10',
    lastContact: '2026-05-17 10:42',
    tags: ['Hot', 'Familia', 'Crédito pre-aprobado'],
    notes: 'Pareja joven, busca primer hogar. Crédito pre-aprobado por Banco Nacional hasta $520k. Quiere agendar visita esta semana.',
  },
  {
    id: 'l2',
    name: 'Roberto Quirós',
    phone: '+506 7099 4421',
    email: 'rquiros@outlook.com',
    avatar: 'RQ',
    status: 'Nuevo',
    source: 'Facebook Ads',
    interest: 'Inversión vacacional Guanacaste',
    budget: '1M+ USD',
    operation: 'Compra',
    assignedTo: null,
    bot: true,
    interestedIn: ['p3'],
    createdAt: '2026-05-17',
    lastContact: '2026-05-17 11:18',
    tags: ['Inversión', 'Guanacaste'],
    notes: '',
  },
  {
    id: 'l3',
    name: 'Sofía Jiménez',
    phone: '+506 6234 5577',
    email: 'sofia.j@empresa.cr',
    avatar: 'SJ',
    status: 'Visita agendada',
    source: 'Sitio web',
    interest: 'Apartamento Sabana o Rohrmoser',
    budget: '200k – 250k USD',
    operation: 'Compra',
    assignedTo: 'a2',
    bot: false,
    interestedIn: ['p2', 'p5'],
    createdAt: '2026-05-08',
    lastContact: '2026-05-16 16:30',
    tags: ['Hot', 'Profesional'],
    notes: 'Visita agendada para sábado 18/05 a las 10:00 a.m. en CR-2042.',
  },
  {
    id: 'l4',
    name: 'Carlos Méndez',
    phone: '+506 8856 1144',
    email: 'cmendez@gmail.com',
    avatar: 'CM',
    status: 'En negociación',
    source: 'Referido',
    interest: 'Casa Heredia',
    budget: '300k – 350k USD',
    operation: 'Compra',
    assignedTo: 'a3',
    bot: false,
    interestedIn: ['p6'],
    createdAt: '2026-04-22',
    lastContact: '2026-05-15 09:15',
    tags: ['Oferta enviada', 'Familia'],
    notes: 'Ofertó $310k por CR-2009. Esperando respuesta del vendedor.',
  },
  {
    id: 'l5',
    name: 'Lucía Brenes',
    phone: '+506 7711 2233',
    email: 'lucia.brenes@gmail.com',
    avatar: 'LB',
    status: 'Nuevo',
    source: 'Instagram',
    interest: 'Alquiler Rohrmoser',
    budget: '1.5k USD/mes',
    operation: 'Alquiler',
    assignedTo: null,
    bot: true,
    interestedIn: ['p5'],
    createdAt: '2026-05-17',
    lastContact: '2026-05-17 09:55',
    tags: ['Alquiler'],
    notes: '',
  },
  {
    id: 'l6',
    name: 'Diego Salas',
    phone: '+506 8123 4499',
    email: 'diego.salas@hotmail.com',
    avatar: 'DS',
    status: 'Contactado',
    source: 'WhatsApp',
    interest: 'Lote Santa Ana',
    budget: '180k – 220k USD',
    operation: 'Compra',
    assignedTo: 'a3',
    bot: false,
    interestedIn: ['p4'],
    createdAt: '2026-05-14',
    lastContact: '2026-05-16 14:22',
    tags: ['Inversor', 'Familia'],
    notes: 'Busca lote para construir su casa. Pregunta por uso de suelo y permisos.',
  },
  {
    id: 'l7',
    name: 'Fernanda Ulate',
    phone: '+506 6789 0012',
    email: 'fulate@gmail.com',
    avatar: 'FU',
    status: 'Cerrado ganado',
    source: 'WhatsApp',
    interest: 'Apartamento Curridabat',
    budget: '270k USD',
    operation: 'Compra',
    assignedTo: 'a2',
    bot: false,
    interestedIn: ['p8'],
    createdAt: '2026-03-15',
    lastContact: '2026-05-12 11:00',
    tags: ['Cerrado', '✓'],
    notes: 'Compra cerrada. Comisión: $8,250. Pendiente firma de escritura el 22/05.',
  },
  {
    id: 'l8',
    name: 'Javier Alpízar',
    phone: '+506 8967 5544',
    email: 'jalpizar@gmail.com',
    avatar: 'JA',
    status: 'Frío',
    source: 'Sitio web',
    interest: 'Casa Escazú',
    budget: 'No definido',
    operation: 'Compra',
    assignedTo: 'a1',
    bot: false,
    interestedIn: [],
    createdAt: '2026-04-02',
    lastContact: '2026-04-28 10:00',
    tags: ['Sin respuesta', 'Familia'],
    notes: 'No responde mensajes desde hace 3 semanas.',
  },
];

const CONVERSATIONS = [
  {
    leadId: 'l1',
    unread: 0,
    pinned: true,
    handler: 'human',
    lastMessage: 'Perfecto, nos vemos el sábado a las 10 a.m. 🙌',
    lastTime: '10:42',
    messages: [
      { from: 'lead', text: 'Hola! Vi la casa en Trejos Montealegre en su sitio. ¿Sigue disponible?', time: 'Lun 9:14' },
      { from: 'bot', text: '¡Hola Daniela! 👋 Sí, la propiedad CR-2031 está disponible. Te comparto la ficha:', time: 'Lun 9:14' },
      { from: 'bot', text: '', time: 'Lun 9:14', card: 'p1' },
      { from: 'lead', text: 'Me encanta. ¿Aceptan crédito bancario? Tengo pre-aprobación con BN.', time: 'Lun 9:18' },
      { from: 'bot', text: 'Sí, la propiedad acepta financiamiento bancario. ¿Quieres que un agente te contacte para coordinar una visita?', time: 'Lun 9:18' },
      { from: 'lead', text: 'Sí por favor!', time: 'Lun 9:19' },
      { from: 'system', text: '🤝 Conversación transferida a María Vargas', time: 'Lun 9:20' },
      { from: 'agent', text: '¡Hola Daniela! Soy María, mucho gusto. Vi que tienes pre-aprobación, eso facilita mucho las cosas. ¿Qué día te queda bien para visitar?', time: 'Lun 9:32' },
      { from: 'lead', text: 'Hola María! Podría el sábado en la mañana?', time: 'Lun 10:05' },
      { from: 'agent', text: '¡Claro! Te propongo el sábado 18 a las 10:00 a.m. ¿Confirmamos?', time: 'Hoy 10:38' },
      { from: 'lead', text: 'Perfecto, nos vemos el sábado a las 10 a.m. 🙌', time: 'Hoy 10:42' },
    ],
  },
  {
    leadId: 'l2',
    unread: 2,
    pinned: false,
    handler: 'bot',
    lastMessage: 'Te puedo enviar más opciones similares?',
    lastTime: '11:18',
    messages: [
      { from: 'lead', text: 'Buenos días, vi un anuncio de propiedades en Tamarindo', time: '11:05' },
      { from: 'bot', text: '¡Hola! 🌊 Bienvenido a Inmobiliaria CR. Tenemos varias propiedades en Guanacaste. ¿Buscas para inversión o uso personal?', time: '11:05' },
      { from: 'lead', text: 'Inversión, busco frente al mar', time: '11:10' },
      { from: 'bot', text: 'Perfecto. Esta es nuestra propiedad estrella en la zona:', time: '11:10' },
      { from: 'bot', text: '', time: '11:10', card: 'p3' },
      { from: 'lead', text: 'Wow se ve increíble. Cuál es el ROI estimado?', time: '11:17' },
      { from: 'bot', text: 'Para esa propiedad calculamos un ROI de 7-9% anual en renta vacacional. ¿Te gustaría hablar con un agente especializado en inversión?', time: '11:18' },
      { from: 'bot', text: 'Te puedo enviar más opciones similares?', time: '11:18' },
    ],
  },
  {
    leadId: 'l3',
    unread: 0,
    pinned: false,
    handler: 'human',
    lastMessage: 'Listo, agendada la visita para el sábado',
    lastTime: 'Ayer',
    messages: [
      { from: 'lead', text: 'Hola, vi el apartamento en Sabana Norte', time: 'Jue 14:22' },
      { from: 'agent', text: '¡Hola Sofía! Soy Andrés. ¿Te gustaría agendar una visita?', time: 'Jue 14:30' },
      { from: 'lead', text: 'Sí, qué día tienes disponible?', time: 'Vie 9:10' },
      { from: 'agent', text: 'Tengo sábado 18 a las 10 a.m. ¿Te funciona?', time: 'Vie 16:25' },
      { from: 'lead', text: 'Listo, agendada la visita para el sábado', time: 'Vie 16:30' },
    ],
  },
  {
    leadId: 'l5',
    unread: 1,
    pinned: false,
    handler: 'bot',
    lastMessage: 'Te paso la ficha completa 👇',
    lastTime: '9:55',
    messages: [
      { from: 'lead', text: 'Hola! Vi en Instagram un apa en Rohrmoser para alquilar', time: '9:48' },
      { from: 'bot', text: '¡Hola Lucía! 🏙️ ¿Lo buscas amueblado o sin amueblar? ¿Cuántas personas vivirían?', time: '9:48' },
      { from: 'lead', text: 'Amueblado, somos 2 personas', time: '9:52' },
      { from: 'bot', text: 'Tengo el apartamento perfecto para ustedes:', time: '9:55' },
      { from: 'bot', text: 'Te paso la ficha completa 👇', time: '9:55' },
      { from: 'bot', text: '', time: '9:55', card: 'p5' },
    ],
  },
  {
    leadId: 'l6',
    unread: 0,
    pinned: false,
    handler: 'human',
    lastMessage: 'Mañana te paso la documentación del uso de suelo',
    lastTime: 'Ayer',
    messages: [
      { from: 'lead', text: 'Hola, me interesa el lote en Santa Ana', time: 'Mié 11:00' },
      { from: 'bot', text: 'Hola Diego! Te transfiero con un agente especializado en lotes 🏞️', time: 'Mié 11:00' },
      { from: 'agent', text: 'Hola Diego! Soy Camila. ¿Es para construir vivienda?', time: 'Mié 13:45' },
      { from: 'lead', text: 'Sí, mi casa familiar. Tienen el plano y permisos al día?', time: 'Mié 14:10' },
      { from: 'agent', text: 'Sí, todo en regla. ¿Quieres que te envíe la documentación?', time: 'Jue 9:30' },
      { from: 'agent', text: 'Mañana te paso la documentación del uso de suelo', time: 'Vie 14:22' },
    ],
  },
  {
    leadId: 'l4',
    unread: 0,
    pinned: false,
    handler: 'human',
    lastMessage: 'Esperamos respuesta del vendedor entonces',
    lastTime: 'Vie',
    messages: [
      { from: 'lead', text: 'Camila, qué pasó con la oferta?', time: 'Jue 8:00' },
      { from: 'agent', text: 'La presenté ayer, el vendedor dijo que la analizaría con su esposa este fin de semana', time: 'Jue 9:15' },
      { from: 'lead', text: 'Bueno, esperamos entonces', time: 'Vie 8:30' },
      { from: 'agent', text: 'Esperamos respuesta del vendedor entonces', time: 'Vie 9:15' },
    ],
  },
];

const QUICK_REPLIES = [
  { id: 'q1', label: 'Saludo inicial', text: '¡Hola! Gracias por contactarnos. ¿En qué te puedo ayudar hoy?' },
  { id: 'q2', label: 'Agendar visita', text: '¿Qué día te queda mejor para hacer una visita a la propiedad? Tengo disponibilidad esta semana.' },
  { id: 'q3', label: 'Financiamiento', text: 'La propiedad acepta financiamiento bancario. ¿Ya cuentas con pre-aprobación o te ayudo a gestionarla?' },
  { id: 'q4', label: 'Información extra', text: '¿Hay algún detalle específico que quieras saber sobre la propiedad? Con gusto te amplío la información.' },
  { id: 'q5', label: 'Seguimiento', text: 'Quería darle seguimiento a nuestra conversación. ¿Pudiste revisar la información que te envié?' },
];

const STATUSES = {
  'Nuevo': { color: '#3B82F6', bg: '#DBEAFE' },
  'Contactado': { color: '#8B5CF6', bg: '#EDE9FE' },
  'Calificado': { color: '#F59E0B', bg: '#FEF3C7' },
  'Visita agendada': { color: '#0EA5E9', bg: '#E0F2FE' },
  'En negociación': { color: '#EA580C', bg: '#FED7AA' },
  'Cerrado ganado': { color: '#16A34A', bg: '#DCFCE7' },
  'Cerrado perdido': { color: '#6B7280', bg: '#F3F4F6' },
  'Frío': { color: '#94A3B8', bg: '#F1F5F9' },
};

window.MockData = { AGENTS, PROPERTIES, LEADS, CONVERSATIONS, QUICK_REPLIES, STATUSES };

// ——————————————————————————————————————————————————————————————
// Tasks — algunas automatizadas por el bot, otras manuales del agente
// ——————————————————————————————————————————————————————————————
const TASKS = [
  // System / bot-generated automated follow-ups
  { id: 't1', leadId: 'l1', type: 'auto', kind: 'reminder', title: 'Recordar visita 24h antes', dueDate: '2026-05-17 18:00', status: 'pending', source: 'bot', notes: 'Sistema enviará recordatorio por WhatsApp 24h antes de la visita.' },
  { id: 't2', leadId: 'l2', type: 'auto', kind: 'followup', title: 'Seguimiento si no responde en 24h', dueDate: '2026-05-18 11:18', status: 'pending', source: 'bot' },
  { id: 't3', leadId: 'l5', type: 'auto', kind: 'followup', title: 'Seguimiento automático: enviar disponibilidad', dueDate: '2026-05-18 10:00', status: 'pending', source: 'bot' },
  { id: 't4', leadId: 'l8', type: 'auto', kind: 'reactivate', title: 'Mensaje de reactivación (lead frío)', dueDate: '2026-05-20 09:00', status: 'pending', source: 'bot' },

  // Manual / agent tasks tied to leads
  { id: 't5', leadId: 'l1', type: 'manual', kind: 'visit', title: 'Visita propiedad CR-2031', dueDate: '2026-05-18 10:00', status: 'pending', source: 'a1', notes: 'Llevar contrato de exclusiva por si avanza.', priority: 'high' },
  { id: 't6', leadId: 'l1', type: 'manual', kind: 'doc', title: 'Solicitar carta de pre-aprobación BN', dueDate: '2026-05-19 12:00', status: 'pending', source: 'a1' },
  { id: 't7', leadId: 'l3', type: 'manual', kind: 'visit', title: 'Visita CR-2042 y CR-2047', dueDate: '2026-05-18 09:30', status: 'pending', source: 'a2' },
  { id: 't8', leadId: 'l4', type: 'manual', kind: 'call', title: 'Llamar para conocer respuesta del vendedor', dueDate: '2026-05-18 11:00', status: 'pending', source: 'a3', notes: 'Esposa del vendedor regresa de viaje domingo.', priority: 'high' },
  { id: 't9', leadId: 'l4', type: 'manual', kind: 'doc', title: 'Enviar borrador de promesa de compraventa', dueDate: '2026-05-20 17:00', status: 'pending', source: 'a3' },
  { id: 't10', leadId: 'l6', type: 'manual', kind: 'doc', title: 'Enviar uso de suelo y permisos del lote', dueDate: '2026-05-16 16:00', status: 'overdue', source: 'a3', priority: 'high' },
  { id: 't11', leadId: 'l7', type: 'manual', kind: 'meeting', title: 'Firma de escritura', dueDate: '2026-05-22 14:00', status: 'pending', source: 'a2', notes: 'Notaría Lic. Mora, Barrio Escalante.' },
  { id: 't12', leadId: 'l1', type: 'manual', kind: 'call', title: 'Llamada de seguimiento post-visita', dueDate: '2026-05-19 16:00', status: 'pending', source: 'a1' },
  { id: 't13', leadId: 'l3', type: 'manual', kind: 'followup', title: 'Enviar comparativo de las dos propiedades', dueDate: '2026-05-19 10:00', status: 'pending', source: 'a2' },

  // Property-linked tasks
  { id: 't17', propertyId: 'p3', type: 'manual', kind: 'doc', title: 'Renovar fotos profesionales Villa Tamarindo', dueDate: '2026-05-25 17:00', status: 'pending', source: 'a1' },
  { id: 't18', propertyId: 'p1', type: 'manual', kind: 'meeting', title: 'Reunión con propietario CR-2031', dueDate: '2026-05-20 15:00', status: 'pending', source: 'a1', notes: 'Café Mundo. Hablar de ajuste de precio.' },
  { id: 't19', propertyId: 'p7', type: 'manual', kind: 'doc', title: 'Actualizar descripción Penthouse', dueDate: null, status: 'pending', source: 'a1' },

  // Standalone tasks (no lead, no property)
  { id: 't20', type: 'manual', kind: 'meeting', title: 'Asistir a evento de CCBR — networking inmobiliario', dueDate: '2026-05-21 18:00', status: 'pending', source: 'a1', location: 'Hotel Real Intercontinental' },
  { id: 't21', type: 'manual', kind: 'doc', title: 'Renovar inscripción CCCBR (Cámara de Corredores)', dueDate: '2026-05-30 23:59', status: 'pending', source: 'a1', priority: 'high' },
  { id: 't22', type: 'manual', kind: 'followup', title: 'Revisar precios de mercado en Escazú', dueDate: null, status: 'pending', source: 'a1' },
  { id: 't23', type: 'manual', kind: 'doc', title: 'Actualizar mi tarjeta de presentación', dueDate: null, status: 'pending', source: 'a1' },
  { id: 't24', type: 'manual', kind: 'call', title: 'Llamar a contadora — declaración trimestral', dueDate: '2026-05-19 10:00', status: 'pending', source: 'a1' },
  { id: 't25', type: 'manual', kind: 'meeting', title: 'Llevar carro a servicio', dueDate: '2026-05-15 09:00', status: 'overdue', source: 'a1' },

  // Completed
  { id: 't14', leadId: 'l1', type: 'auto', kind: 'message', title: 'Saludo de bienvenida enviado', dueDate: '2026-05-13 09:14', status: 'done', source: 'bot' },
  { id: 't15', leadId: 'l1', type: 'auto', kind: 'message', title: 'Ficha de propiedad CR-2031 enviada', dueDate: '2026-05-13 09:14', status: 'done', source: 'bot' },
  { id: 't16', leadId: 'l1', type: 'manual', kind: 'call', title: 'Primera llamada de calificación', dueDate: '2026-05-13 11:00', status: 'done', source: 'a1' },
  { id: 't26', type: 'manual', kind: 'doc', title: 'Pagar membresía mensual del CRM', dueDate: '2026-05-10', status: 'done', source: 'a1' },
];

// ——————————————————————————————————————————————————————————————
// Documents — por lead
// ——————————————————————————————————————————————————————————————
const DOCUMENTS = [
  { id: 'd1', leadId: 'l1', name: 'Cédula Daniela Mora.pdf', type: 'pdf', size: '1.2 MB', uploadedAt: '2026-05-13', uploadedBy: 'a1', category: 'Identificación' },
  { id: 'd2', leadId: 'l1', name: 'Carta pre-aprobación BN $520k.pdf', type: 'pdf', size: '845 KB', uploadedAt: '2026-05-14', uploadedBy: 'a1', category: 'Financiero' },
  { id: 'd3', leadId: 'l1', name: 'Constancia salarial.pdf', type: 'pdf', size: '320 KB', uploadedAt: '2026-05-14', uploadedBy: 'lead', category: 'Financiero' },
  { id: 'd4', leadId: 'l4', name: 'Promesa compraventa CR-2009.pdf', type: 'pdf', size: '2.1 MB', uploadedAt: '2026-05-13', uploadedBy: 'a3', category: 'Contrato' },
  { id: 'd5', leadId: 'l4', name: 'Cédula Carlos Méndez.jpg', type: 'image', size: '680 KB', uploadedAt: '2026-04-28', uploadedBy: 'lead', category: 'Identificación' },
  { id: 'd6', leadId: 'l4', name: 'Estudio registral CR-2009.pdf', type: 'pdf', size: '1.8 MB', uploadedAt: '2026-05-10', uploadedBy: 'a3', category: 'Propiedad' },
  { id: 'd7', leadId: 'l7', name: 'Contrato compraventa firmado.pdf', type: 'pdf', size: '3.2 MB', uploadedAt: '2026-05-08', uploadedBy: 'a2', category: 'Contrato' },
  { id: 'd8', leadId: 'l7', name: 'Avalúo CR-2052.pdf', type: 'pdf', size: '4.1 MB', uploadedAt: '2026-04-22', uploadedBy: 'a2', category: 'Propiedad' },
  { id: 'd9', leadId: 'l6', name: 'Plano catastrado CR-2055.pdf', type: 'pdf', size: '1.5 MB', uploadedAt: '2026-05-14', uploadedBy: 'a3', category: 'Propiedad' },
];

// ——————————————————————————————————————————————————————————————
// Calendar events — visitas, llamadas, reuniones, vinculados a leads
// ——————————————————————————————————————————————————————————————
const EVENTS = [
  { id: 'e1', title: 'Visita CR-2031 con Daniela Mora', kind: 'visit', leadId: 'l1', propertyId: 'p1', start: '2026-05-18T10:00', end: '2026-05-18T11:30', location: 'Trejos Montealegre, Escazú', agent: 'a1', source: 'crm', synced: true, notes: 'Pareja joven, primer hogar. Llevar plantilla de oferta.' },
  { id: 'e2', title: 'Visita CR-2042 con Sofía Jiménez', kind: 'visit', leadId: 'l3', propertyId: 'p2', start: '2026-05-18T09:30', end: '2026-05-18T10:30', location: 'Sabana Norte, San José', agent: 'a2', source: 'crm', synced: true },
  { id: 'e3', title: 'Llamada — respuesta vendedor CR-2009', kind: 'call', leadId: 'l4', start: '2026-05-18T11:00', end: '2026-05-18T11:30', agent: 'a3', source: 'crm', synced: true },
  { id: 'e4', title: 'Visita CR-2047 con Sofía Jiménez', kind: 'visit', leadId: 'l3', propertyId: 'p5', start: '2026-05-18T11:00', end: '2026-05-18T12:00', location: 'Rohrmoser, San José', agent: 'a2', source: 'crm', synced: true },
  { id: 'e5', title: 'Almuerzo con cliente', kind: 'personal', start: '2026-05-18T13:00', end: '2026-05-18T14:30', location: 'Avenida Escazú', agent: 'a1', source: 'gcal', synced: true },
  { id: 'e6', title: 'Open house CR-2061 Penthouse', kind: 'openhouse', propertyId: 'p7', start: '2026-05-18T15:00', end: '2026-05-18T18:00', location: 'Avenida Escazú', agent: 'a1', source: 'crm', synced: true },
  { id: 'e7', title: 'Firma de escritura — Fernanda Ulate', kind: 'meeting', leadId: 'l7', start: '2026-05-22T14:00', end: '2026-05-22T16:00', location: 'Notaría Lic. Mora, Barrio Escalante', agent: 'a2', source: 'crm', synced: true },
  { id: 'e8', title: 'Visita lote CR-2055', kind: 'visit', leadId: 'l6', propertyId: 'p4', start: '2026-05-19T15:00', end: '2026-05-19T16:30', location: 'Pozos, Santa Ana', agent: 'a3', source: 'crm', synced: false },
  { id: 'e9', title: 'Llamada de seguimiento Daniela', kind: 'call', leadId: 'l1', start: '2026-05-19T16:00', end: '2026-05-19T16:30', agent: 'a1', source: 'crm', synced: true },
  { id: 'e10', title: 'Reunión semanal de equipo', kind: 'personal', start: '2026-05-20T09:00', end: '2026-05-20T10:00', agent: 'a1', source: 'gcal', synced: true },
  { id: 'e11', title: 'Visita CR-2018 Tamarindo', kind: 'visit', leadId: 'l2', propertyId: 'p3', start: '2026-05-21T11:00', end: '2026-05-21T13:00', location: 'Playa Langosta, Tamarindo', agent: 'a1', source: 'crm', synced: false, notes: 'Viaje desde San José. Salir 7am.' },
  { id: 'e12', title: 'Café con propietario CR-2031', kind: 'meeting', start: '2026-05-20T15:00', end: '2026-05-20T16:00', location: 'Café Mundo', agent: 'a1', source: 'gcal', synced: true },
];

window.MockData.TASKS = TASKS;
window.MockData.DOCUMENTS = DOCUMENTS;
window.MockData.EVENTS = EVENTS;

// Comisiones — porcentajes estándar Costa Rica
window.MockData.COMMISSION_RATES = {
  Venta: 0.05,        // 5%
  Alquiler: 1,        // 1 mes de alquiler
};

// Type/kind metadata for tasks & events
window.MockData.TASK_KINDS = {
  call:       { icon: 'phone',     label: 'Llamada',      color: '#0EA5E9' },
  visit:      { icon: 'home',      label: 'Visita',       color: '#16A34A' },
  meeting:    { icon: 'users',     label: 'Reunión',      color: '#7C3AED' },
  followup:   { icon: 'sparkle',   label: 'Seguimiento',  color: '#F59E0B' },
  doc:        { icon: 'paperclip', label: 'Documento',    color: '#EA580C' },
  message:    { icon: 'whatsapp',  label: 'Mensaje',      color: '#25D366' },
  reminder:   { icon: 'bell',      label: 'Recordatorio', color: '#94A3B8' },
  reactivate: { icon: 'sparkle',   label: 'Reactivación', color: '#A78BFA' },
};

window.MockData.EVENT_KINDS = {
  visit:     { icon: 'home',     label: 'Visita',     color: '#0EA5E9', bg: '#DBEAFE' },
  call:      { icon: 'phone',    label: 'Llamada',    color: '#16A34A', bg: '#DCFCE7' },
  meeting:   { icon: 'users',    label: 'Reunión',    color: '#7C3AED', bg: '#EDE9FE' },
  openhouse: { icon: 'home',     label: 'Open house', color: '#EA580C', bg: '#FED7AA' },
  personal:  { icon: 'calendar', label: 'Personal',   color: '#94A3B8', bg: '#F1F5F9' },
};

// — Lead scoring helper — calcula un score 0-100 basado en señales
window.MockData.calcLeadScore = function(lead) {
  if (!lead) return { score: 0, temp: 'frío', factors: [] };
  let score = 30;
  const factors = [];

  const statusScore = {
    'Cerrado ganado': 100, 'En negociación': 85, 'Visita agendada': 70,
    'Calificado': 55, 'Contactado': 40, 'Nuevo': 30, 'Frío': 15, 'Cerrado perdido': 0
  };
  const sScore = statusScore[lead.status] ?? 30;
  factors.push({ label: `Estado: ${lead.status}`, points: sScore - 30, weight: 'alto' });
  score = sScore;

  if (lead.tags?.includes('Hot')) { score += 15; factors.push({ label: 'Marcado como Hot', points: 15, weight: 'alto' }); }
  if (lead.tags?.includes('Crédito pre-aprobado')) { score += 12; factors.push({ label: 'Tiene pre-aprobación bancaria', points: 12, weight: 'alto' }); }
  if (lead.tags?.includes('Oferta enviada')) { score += 8; factors.push({ label: 'Ya hizo oferta', points: 8, weight: 'medio' }); }
  if (lead.tags?.includes('Sin respuesta')) { score -= 20; factors.push({ label: 'No responde mensajes', points: -20, weight: 'alto' }); }

  if (lead.budget && !/no definido/i.test(lead.budget)) {
    score += 5;
    factors.push({ label: 'Presupuesto definido', points: 5, weight: 'medio' });
  } else {
    factors.push({ label: 'Sin presupuesto definido', points: 0, weight: 'bajo' });
  }

  if (lead.interestedIn?.length > 0) {
    const p = Math.min(8, lead.interestedIn.length * 4);
    score += p;
    factors.push({ label: `${lead.interestedIn.length} propiedad${lead.interestedIn.length > 1 ? 'es' : ''} de interés`, points: p, weight: 'medio' });
  }

  if (lead.lastContact) {
    const last = new Date(lead.lastContact);
    const daysSince = (new Date('2026-05-17') - last) / (1000 * 60 * 60 * 24);
    if (daysSince < 2) { score += 8; factors.push({ label: 'Conversación activa (< 2 días)', points: 8, weight: 'alto' }); }
    else if (daysSince > 14) { score -= 15; factors.push({ label: `Sin contacto hace ${Math.round(daysSince)} días`, points: -15, weight: 'alto' }); }
    else if (daysSince > 7) { score -= 5; factors.push({ label: `Sin contacto hace ${Math.round(daysSince)} días`, points: -5, weight: 'medio' }); }
  }

  if (lead.assignedTo) score += 3;

  score = Math.max(0, Math.min(100, score));
  const temp = score >= 75 ? 'hot' : score >= 50 ? 'tibio' : score >= 25 ? 'medio' : 'frío';
  return { score: Math.round(score), temp, factors };
};

// — WhatsApp templates with merge fields
window.MockData.WA_TEMPLATES = [
  { id: 'wt1', name: 'Saludo inicial', category: 'Saludo', body: '¡Hola {{nombre}}! 👋 Gracias por escribirnos. Soy {{agente}}. ¿En qué te puedo ayudar?' },
  { id: 'wt2', name: 'Agendar visita', category: 'Agenda', body: '{{nombre}}, ¿qué día te queda mejor para visitar {{propiedad}}? Tengo disponibilidad esta semana y la próxima.' },
  { id: 'wt3', name: 'Enviar ficha', category: 'Propiedad', body: 'Te paso la ficha de {{propiedad}} en {{ubicacion}} por {{precio}}. Cualquier consulta me decís.' },
  { id: 'wt4', name: 'Financiamiento', category: 'Información', body: '{{nombre}}, esta propiedad acepta financiamiento bancario. ¿Ya tenés pre-aprobación o te ayudo a gestionarla con alguno de los bancos? La cuota mensual estimada estaría alrededor de {{cuota}}.' },
  { id: 'wt5', name: 'Seguimiento 24h', category: 'Seguimiento', body: '¡Hola {{nombre}}! Quería darle seguimiento a nuestra conversación. ¿Pudiste revisar la información que te envié?' },
  { id: 'wt6', name: 'Confirmar visita', category: 'Agenda', body: '{{nombre}}, te confirmo nuestra visita a {{propiedad}} el {{fecha}} a las {{hora}}. La dirección es {{ubicacion}}. ¿Te queda bien o ajustamos?' },
  { id: 'wt7', name: 'Post-visita', category: 'Seguimiento', body: '¡Hola {{nombre}}! Gracias por venir hoy a ver {{propiedad}}. ¿Qué te pareció? Si tenés dudas o querés ver otras opciones, decime.' },
  { id: 'wt8', name: 'Reactivar lead frío', category: 'Reactivación', body: '¡Hola {{nombre}}! ¿Cómo estás? Me acordé de vos porque tengo una propiedad nueva que podría interesarte. ¿Seguís buscando en {{zona}}?' },
];

window.MockData.WA_MERGE_FIELDS = [
  { key: 'nombre', desc: 'Nombre del lead' },
  { key: 'agente', desc: 'Tu nombre (agente)' },
  { key: 'propiedad', desc: 'Título de la propiedad' },
  { key: 'codigo', desc: 'Código de la propiedad' },
  { key: 'precio', desc: 'Precio formateado' },
  { key: 'ubicacion', desc: 'Ubicación de la propiedad' },
  { key: 'zona', desc: 'Zona/barrio del lead' },
  { key: 'fecha', desc: 'Fecha del evento más próximo' },
  { key: 'hora', desc: 'Hora del evento más próximo' },
  { key: 'cuota', desc: 'Cuota mensual estimada' },
];

// Resolve merge fields against a context (lead, property, agent)
window.MockData.resolveTemplate = function(body, ctx) {
  const fmt = (n) => '$' + new Intl.NumberFormat('en-US').format(n);
  const map = {
    nombre: ctx.lead?.name?.split(' ')[0] || 'cliente',
    agente: ctx.agent?.name?.split(' ')[0] || 'tu agente',
    propiedad: ctx.property?.title || 'la propiedad',
    codigo: ctx.property?.code || '',
    precio: ctx.property?.price ? fmt(ctx.property.price) + (ctx.property.operation === 'Alquiler' ? '/mes' : '') : '',
    ubicacion: ctx.property?.location || '',
    zona: ctx.lead?.interest?.split(' ').slice(-2).join(' ') || 'esa zona',
    fecha: ctx.event?.date || 'el día acordado',
    hora: ctx.event?.time || 'la hora acordada',
    cuota: ctx.cuota || '$2,500 USD/mes',
  };
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] !== undefined ? map[k] : `{{${k}}}`);
};

// Propiedades pueden tener URL externa (encuentra24, properstar, sitio propio)
// Demo: mark a couple of properties as having external URL
const _props = window.MockData.PROPERTIES;
if (_props) {
  _props[0].externalUrl = 'https://encuentra24.com/cr/casa-escazu-CR-2031';
  _props[2].externalUrl = 'https://properstar.cr/villa-tamarindo-CR-2018';
}
