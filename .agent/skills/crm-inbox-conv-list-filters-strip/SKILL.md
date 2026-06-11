# Skill: Filters Strip horizontal con scroll + fade gradients

## Cuándo usar esta skill

- Tenés un componente de lista (conversaciones, leads, tasks) con varios filtros tipo tabs/pills horizontales.
- El espacio horizontal es limitado (sidebar de 280-340px o mobile width).
- Los filtros se cortan visualmente en el borde y el usuario no se da cuenta de que hay más.
- Querés que el usuario sepa por affordance visual que la lista de filtros tiene scroll horizontal.

## Por qué existe esta skill

En el inbox de Casa CRM el sidebar tiene los filtros "Todos / Sin leer / Bot / Mios / Handoff" — 5+ filtros que no entran en el ancho del sidebar mobile. Sin tratamiento, los últimos quedan cortados sin indicación visual.

Solución estándar: **scroll horizontal + fade gradients en los bordes** que indican "hay más allá". Bonus: wheel-to-horizontal para que el scroll con rueda del mouse funcione naturalmente.

## Proceso

### 1. Estructura básica del componente

```tsx
function FiltersStrip({ filters, active, onSelect }: {
  filters: { id: string; label: string; count?: number }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Wheel-to-horizontal: convertir scroll vertical en horizontal
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // Auto-scroll al filtro activo cuando cambia
  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-filter-id="${active}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Fade left */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 24,
        background: 'linear-gradient(to right, var(--bg) 0%, transparent 100%)',
        pointerEvents: 'none', zIndex: 2,
      }} />

      {/* Scroll container */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: '8px 16px',
          scrollbarWidth: 'none',          // Firefox
          msOverflowStyle: 'none',         // IE/Edge legacy
        }}
        className="hide-scrollbar"          // ver CSS abajo
      >
        {filters.map(f => (
          <button
            key={f.id}
            data-filter-id={f.id}
            onClick={() => onSelect(f.id)}
            style={{
              flexShrink: 0,
              padding: '6px 12px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: active === f.id ? 'transparent' : 'var(--border)',
              background: active === f.id ? 'var(--ink)' : 'var(--surface)',
              color: active === f.id ? 'white' : 'var(--ink)',
              fontSize: 13,
              fontWeight: active === f.id ? 600 : 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {f.label}
            {typeof f.count === 'number' && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Fade right */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 24,
        background: 'linear-gradient(to left, var(--bg) 0%, transparent 100%)',
        pointerEvents: 'none', zIndex: 2,
      }} />
    </div>
  );
}
```

### 2. CSS para ocultar la scrollbar en WebKit

```css
/* En tu globals.css o tailwind plugin */
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
```

Esto cubre Chrome, Safari, Edge moderno. Firefox y legacy ya están cubiertos por `scrollbarWidth: 'none'` y `msOverflowStyle: 'none'` inline.

### 3. (Opcional) Detectar si el scroll está en el borde para esconder el gradient

Si querés que el fade gradient solo aparezca cuando HAY contenido escondido (no cuando estás en el extremo):

```tsx
const [showLeftFade, setShowLeftFade] = useState(false);
const [showRightFade, setShowRightFade] = useState(true);

const handleScroll = useCallback(() => {
  const el = scrollRef.current;
  if (!el) return;
  setShowLeftFade(el.scrollLeft > 4);
  setShowRightFade(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
}, []);

useEffect(() => {
  const el = scrollRef.current;
  if (!el) return;
  handleScroll(); // initial
  el.addEventListener('scroll', handleScroll, { passive: true });
  return () => el.removeEventListener('scroll', handleScroll);
}, [handleScroll, filters]);

// Y en el render:
{showLeftFade && <div style={{ /* fade left */ }} />}
{showRightFade && <div style={{ /* fade right */ }} />}
```

Trade-off: más código por algo cosmético. Si tu lista de filtros nunca cabe en el ancho típico, mantener los gradients siempre visibles (versión 1) es más simple.

### 4. Accessibility

- `<button>` (no `<div onClick>`) para que sea focusable con Tab
- `aria-pressed={active === f.id}` opcional pero correcto
- Si los filtros tienen iconos, `aria-label` o texto visible

```tsx
<button
  data-filter-id={f.id}
  onClick={() => onSelect(f.id)}
  aria-pressed={active === f.id}
  aria-label={`Filtrar por ${f.label}`}
  // ...
>
```

### 5. Integración con el componente parent

```tsx
// conv-list.tsx
const FILTERS = [
  { id: 'all',     label: 'Todos' },
  { id: 'unread',  label: 'Sin leer',  count: unreadCount },
  { id: 'bot',     label: 'Bot',       count: botCount },
  { id: 'mine',    label: 'Míos',      count: mineCount },
  { id: 'handoff', label: 'Handoff',   count: handoffCount },
];

const [activeFilter, setActiveFilter] = useState('all');

return (
  <div>
    <FiltersStrip
      filters={FILTERS}
      active={activeFilter}
      onSelect={setActiveFilter}
    />
    <ConvList items={filteredItems(conversations, activeFilter)} />
  </div>
);
```

## Output esperado

1. Componente reusable `FiltersStrip` con scroll horizontal, fade gradients, wheel-to-horizontal, auto-scrollIntoView al filtro activo
2. CSS para ocultar scrollbar cross-browser
3. Integración limpia con el componente parent (FILTERS array, active state, onSelect callback)
4. Test visual: en mobile (~375px) los filtros NO se cortan sin warning; el fade muestra que hay más; click en uno fuera del viewport lo scrollea center

## Ejemplo concreto (Casa CRM, sesión 2026-05-19/20)

- Componente: [crm/src/components/inbox/conv-list.tsx](crm/src/components/inbox/conv-list.tsx) — sección `FiltersStrip`
- 5 filtros: Todos / Sin leer / Bot / Míos / Handoff (este último con badge naranja cuando handoff_status=pending)
- Wheel-to-horizontal funcionando en desktop con mousewheel
- Auto-scrollIntoView al cambiar filtro activo (mantiene el chip visible)
- Fade gradients 24px en ambos lados

## Gotchas / antipattern

- **NO** usar `overflow: scroll` que muestra scrollbar siempre. Usar `overflow-x: auto` + ocultar scrollbar con CSS.
- **NO** olvidar `flex-shrink: 0` en los chips. Sin eso, flexbox los achica para que entren todos = ilegibles.
- **NO** olvidar `white-space: nowrap` en los chips con textos largos. "Sin leer 23" puede romperse en 2 líneas.
- **NO** poner `pointer-events: auto` en los fade gradients. Bloquean clicks. Siempre `pointer-events: none`.
- **NO** usar `scrollIntoView({ inline: 'start' })` — el chip queda pegado al borde izquierdo (debajo del fade). Usar `'center'` o `'nearest'`.
- **NO** olvidar `passive: true` en el `addEventListener('scroll', ...)`. Mejor performance.
- **NO** usar este pattern para listas largas (50+ items). Para eso usar dropdown o command palette.

## Skills relacionadas

- `inbox-message-bubble-render` — el otro componente principal del inbox
- `ui-styling` (.claude/skills/) — patterns de Tailwind/inline-styles para CRM
