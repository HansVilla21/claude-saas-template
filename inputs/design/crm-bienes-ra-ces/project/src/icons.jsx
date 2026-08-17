// Inline SVG icon components – stroke-based, 1.6 stroke

const Ico = ({ children, size = 18, stroke = 1.7, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

const Icons = {
  inbox: (p) => <Ico {...p}><path d="M3 13l3-7h12l3 7"/><path d="M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/><path d="M3 13h5l1 2h6l1-2h5"/></Ico>,
  users: (p) => <Ico {...p}><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 11a3 3 0 1 0 0-6"/><path d="M21 20a5 5 0 0 0-4-4.9"/></Ico>,
  home: (p) => <Ico {...p}><path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"/></Ico>,
  dash: (p) => <Ico {...p}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></Ico>,
  calendar: (p) => <Ico {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Ico>,
  settings: (p) => <Ico {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></Ico>,
  search: (p) => <Ico {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Ico>,
  plus: (p) => <Ico {...p}><path d="M12 5v14M5 12h14"/></Ico>,
  bell: (p) => <Ico {...p}><path d="M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3z"/><path d="M10 19a2 2 0 0 0 4 0"/></Ico>,
  whatsapp: (p) => <Ico {...p}><path d="M3 21l1.7-5A8.5 8.5 0 1 1 8 19.4z"/><path d="M9 10.5c.5 1.5 1.5 2.5 3 3l1.5-1c1 .3 2 .7 3 1l-.5 2c-3.5 0-7-3.5-7-7l2-.5c.3 1 .7 2 1 3z"/></Ico>,
  bot: (p) => <Ico {...p}><rect x="4" y="7" width="16" height="12" rx="2"/><circle cx="9" cy="13" r="1.2" fill="currentColor"/><circle cx="15" cy="13" r="1.2" fill="currentColor"/><path d="M12 3v4M9 19l-1 2M15 19l1 2"/></Ico>,
  user: (p) => <Ico {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></Ico>,
  phone: (p) => <Ico {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></Ico>,
  mail: (p) => <Ico {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></Ico>,
  send: (p) => <Ico {...p}><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></Ico>,
  paperclip: (p) => <Ico {...p}><path d="M21 12.5L13 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5L11 19a2 2 0 0 1-3-3l8-8"/></Ico>,
  smile: (p) => <Ico {...p}><circle cx="12" cy="12" r="9"/><path d="M9 14a3.5 3.5 0 0 0 6 0"/><circle cx="9" cy="10" r="0.5" fill="currentColor"/><circle cx="15" cy="10" r="0.5" fill="currentColor"/></Ico>,
  mic: (p) => <Ico {...p}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></Ico>,
  more: (p) => <Ico {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></Ico>,
  filter: (p) => <Ico {...p}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></Ico>,
  sort: (p) => <Ico {...p}><path d="M3 6h13M3 12h9M3 18h5"/><path d="M17 8l3-3 3 3M20 5v14"/></Ico>,
  star: (p) => <Ico {...p}><path d="M12 3l2.7 6 6.3.7-4.7 4.3 1.4 6.4L12 17l-5.7 3.4L7.7 14 3 9.7 9.3 9z"/></Ico>,
  bed: (p) => <Ico {...p}><path d="M3 18V6M3 18h18M3 12h18v6"/><path d="M6 12V9a2 2 0 0 1 2-2h4v5"/></Ico>,
  bath: (p) => <Ico {...p}><path d="M4 12V6a2 2 0 0 1 4 0M3 12h18v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M5 19l-1 2M19 19l1 2"/></Ico>,
  ruler: (p) => <Ico {...p}><path d="M3 16l13-13 5 5L8 21z"/><path d="M7 16l1-1M10 13l1-1M13 10l1-1M16 7l1-1"/></Ico>,
  car: (p) => <Ico {...p}><path d="M5 13l2-5a2 2 0 0 1 2-1.4h6a2 2 0 0 1 2 1.4l2 5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/></Ico>,
  pin: (p) => <Ico {...p}><path d="M12 22V12"/><path d="M8 4h8l-1 6 3 2H6l3-2z"/></Ico>,
  check: (p) => <Ico {...p}><path d="M5 13l4 4L19 7"/></Ico>,
  checkdouble: (p) => <Ico {...p}><path d="M2 13l3 3 7-7M9 13l3 3L22 6"/></Ico>,
  edit: (p) => <Ico {...p}><path d="M12 20h9"/><path d="M16.5 3.5l4 4L7 21l-4 1 1-4z"/></Ico>,
  trash: (p) => <Ico {...p}><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></Ico>,
  chevron: (p) => <Ico {...p}><path d="M9 6l6 6-6 6"/></Ico>,
  arrowleft: (p) => <Ico {...p}><path d="M19 12H5M12 19l-7-7 7-7"/></Ico>,
  arrowright: (p) => <Ico {...p}><path d="M5 12h14M12 5l7 7-7 7"/></Ico>,
  arrowup: (p) => <Ico {...p}><path d="M5 12l7-7 7 7M12 19V5"/></Ico>,
  arrowdown: (p) => <Ico {...p}><path d="M19 12l-7 7-7-7M12 5v14"/></Ico>,
  grid: (p) => <Ico {...p}><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></Ico>,
  list: (p) => <Ico {...p}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1" fill="currentColor"/><circle cx="3.5" cy="12" r="1" fill="currentColor"/><circle cx="3.5" cy="18" r="1" fill="currentColor"/></Ico>,
  map: (p) => <Ico {...p}><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v16M15 6v16"/></Ico>,
  location: (p) => <Ico {...p}><path d="M12 22s-7-7-7-13a7 7 0 0 1 14 0c0 6-7 13-7 13z"/><circle cx="12" cy="9" r="2.5"/></Ico>,
  tag: (p) => <Ico {...p}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></Ico>,
  building: (p) => <Ico {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"/><path d="M10 21v-3h4v3"/></Ico>,
  trend: (p) => <Ico {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></Ico>,
  image: (p) => <Ico {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M3 17l5-5 4 4 3-3 6 6"/></Ico>,
  eye: (p) => <Ico {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Ico>,
  flame: (p) => <Ico {...p}><path d="M12 22a7 7 0 0 0 7-7c0-3-2-5-3-7-1 2-2 3-4 3 0-3-1-6-4-9-1 4-4 6-4 11a8 8 0 0 0 8 9z"/></Ico>,
  handoff: (p) => <Ico {...p}><circle cx="7" cy="8" r="3"/><circle cx="17" cy="8" r="3"/><path d="M7 14a4 4 0 0 0-4 4M17 14a4 4 0 0 1 4 4"/><path d="M10 18l2-2 2 2"/></Ico>,
  close: (p) => <Ico {...p}><path d="M6 6l12 12M18 6l-12 12"/></Ico>,
  download: (p) => <Ico {...p}><path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/></Ico>,
  sparkle: (p) => <Ico {...p}><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5z"/></Ico>,
};

window.Icons = Icons;
