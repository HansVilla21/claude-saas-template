// Calculadora de financiamiento — bancos de Costa Rica

const { useState: useStateMC, useMemo: useMemoMC } = React;

// Tasas referenciales (mayo 2026) — usadas para mock
const BANKS = [
  { id: 'bn',       name: 'Banco Nacional',     short: 'BN',       color: '#0066B3', rateUSD: 7.25, rateCRC: 9.80, plazoMax: 30, comisionPct: 1.0  },
  { id: 'bcr',      name: 'Banco de Costa Rica', short: 'BCR',      color: '#003D7A', rateUSD: 7.40, rateCRC: 9.95, plazoMax: 30, comisionPct: 1.0  },
  { id: 'popular',  name: 'Banco Popular',       short: 'Popular',  color: '#E1251B', rateUSD: 7.50, rateCRC: 10.20, plazoMax: 30, comisionPct: 1.25 },
  { id: 'promerica', name: 'Promerica',          short: 'Promerica', color: '#00A859', rateUSD: 7.85, rateCRC: 10.50, plazoMax: 25, comisionPct: 1.5  },
  { id: 'bac',      name: 'BAC Credomatic',     short: 'BAC',      color: '#E40521', rateUSD: 7.65, rateCRC: 10.30, plazoMax: 25, comisionPct: 1.5  },
  { id: 'davivienda', name: 'Davivienda',       short: 'Davi.',    color: '#ED1C24', rateUSD: 7.95, rateCRC: 10.65, plazoMax: 25, comisionPct: 1.5  },
];

const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n));

// Cuota mensual con tasa fija (PMT)
const monthlyPayment = (principal, annualRate, years) => {
  const r = (annualRate / 100) / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
};

const MortgageCalc = ({ property, onClose }) => {
  // Propiedad pre-cargada o monto manual
  const initialPrice = property?.price || 350000;
  const [price, setPrice] = useStateMC(initialPrice);
  const [downPct, setDownPct] = useStateMC(20);
  const [years, setYears] = useStateMC(25);
  const [currency, setCurrency] = useStateMC('USD');
  const [selectedBank, setSelectedBank] = useStateMC('bn');
  const [showCompare, setShowCompare] = useStateMC(false);

  const downAmount = price * (downPct / 100);
  const loanAmount = price - downAmount;

  const bank = BANKS.find(b => b.id === selectedBank);
  const rate = currency === 'USD' ? bank.rateUSD : bank.rateCRC;
  const monthly = monthlyPayment(loanAmount, rate, years);
  const totalPaid = monthly * years * 12;
  const totalInterest = totalPaid - loanAmount;

  // Costos de cierre estimados (Costa Rica)
  const closingCosts = {
    traspaso: price * 0.015,      // Impuesto de traspaso ~1.5%
    timbres: price * 0.005,       // Timbres + derechos registro ~0.5%
    honorarios: Math.min(2500, price * 0.0125), // Honorarios notario ~1.25% (capped)
    avaluo: 400,                  // Avalúo
    estudioRegistral: 80,         // Estudio registral
    comisionBanco: loanAmount * (bank.comisionPct / 100),
  };
  const totalClosing = Object.values(closingCosts).reduce((a, b) => a + b, 0);
  const cashNeeded = downAmount + totalClosing;

  const symbol = currency === 'USD' ? '$' : '₡';

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(34, 28, 22, 0.55)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 900, maxWidth: '100%', maxHeight: '90vh',
        background: 'var(--surface)', borderRadius: 16,
        boxShadow: 'var(--shadow-3)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '18px 26px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))' }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em' }}>
              Calculadora de financiamiento
            </h3>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {property ? `${property.code} · ${property.title}` : 'Tasas actualizadas al 17 de mayo 2026'}
            </div>
          </div>
          <button onClick={onClose} className="icon-btn"><Icons.close size={15}/></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 0, flex: 1, overflow: 'hidden' }}>
          {/* Left — controls */}
          <div style={{ padding: 26, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'block' }}>Precio de la propiedad</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ display: 'flex', background: 'var(--surface)', borderRadius: 9, padding: 2, border: '1px solid var(--border-strong)' }}>
                    {['USD', 'CRC'].map(c => (
                      <button key={c} onClick={() => setCurrency(c)} style={{
                        padding: '7px 12px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                        background: currency === c ? 'var(--ink)' : 'transparent',
                        color: currency === c ? 'white' : 'var(--muted)'
                      }}>{c}</button>
                    ))}
                  </div>
                  <input type="number" value={price} onChange={e => setPrice(+e.target.value || 0)} className="p-inp" style={{ flex: 1 }}/>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Prima (entrada)</label>
                  <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                    <strong>{symbol}{fmt(downAmount)}</strong>
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {downPct}%</span>
                  </span>
                </div>
                <input type="range" min="0" max="100" step="5" value={downPct} onChange={e => setDownPct(+e.target.value)}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}/>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted)' }}>
                  <span>0%</span><span>20% típico</span><span>50%</span><span>100%</span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Plazo</label>
                  <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}><strong>{years} años</strong></span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[10, 15, 20, 25, 30].map(y => (
                    <button key={y} onClick={() => setYears(y)} style={{
                      flex: 1, padding: '8px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                      background: years === y ? 'var(--accent-soft)' : 'var(--surface)',
                      color: years === y ? 'var(--accent-deep)' : 'var(--ink-2)',
                      border: '1px solid ' + (years === y ? 'var(--accent)' : 'var(--border)')
                    }}>{y}</button>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600 }}>Banco</label>
                  <button onClick={() => setShowCompare(!showCompare)} style={{ fontSize: 11.5, color: 'var(--accent-deep)', fontWeight: 600, background: 'transparent', cursor: 'pointer' }}>
                    {showCompare ? 'Vista única' : '⚖️ Comparar todos'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {BANKS.map(b => {
                    const r = currency === 'USD' ? b.rateUSD : b.rateCRC;
                    const isSelected = b.id === selectedBank;
                    return (
                      <button key={b.id} onClick={() => setSelectedBank(b.id)} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 7,
                        background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
                        border: '1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)'),
                        textAlign: 'left'
                      }}>
                        <div style={{ width: 24, height: 24, borderRadius: 4, background: b.color, color: 'white', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 700 }}>
                          {b.short.slice(0, 3).toUpperCase()}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{b.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: isSelected ? 'var(--accent-deep)' : 'var(--ink)' }}>{r}%</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Tasas referenciales mayo 2026. Sujeto a aprobación crediticia. Consulta con tu banco para tasas exactas.
                </div>
              </div>
            </div>
          </div>

          {/* Right — results */}
          <div style={{ padding: 26, overflowY: 'auto' }}>
            {showCompare ? (
              <div>
                <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Comparación de bancos · {years} años · prima {downPct}%</h3>
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        {['Banco', 'Tasa', 'Cuota mensual', 'Total a pagar', 'Total intereses'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...BANKS].sort((a, b) => (currency === 'USD' ? a.rateUSD - b.rateUSD : a.rateCRC - b.rateCRC)).map((b, i) => {
                        const r = currency === 'USD' ? b.rateUSD : b.rateCRC;
                        const m = monthlyPayment(loanAmount, r, years);
                        const tp = m * years * 12;
                        return (
                          <tr key={b.id} style={{ borderTop: '1px solid var(--border)', background: i === 0 ? '#DCFCE7' : 'transparent' }}>
                            <td style={{ padding: '11px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 22, height: 22, borderRadius: 4, background: b.color, color: 'white', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>{b.short.slice(0, 3).toUpperCase()}</div>
                                <span style={{ fontWeight: 600 }}>{b.name}</span>
                                {i === 0 && <span style={{ background: '#16A34A', color: 'white', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>MEJOR</span>}
                              </div>
                            </td>
                            <td style={{ padding: '11px 14px', fontWeight: 600 }}>{r}%</td>
                            <td style={{ padding: '11px 14px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--accent-deep)' }}>{symbol}{fmt(m)}</td>
                            <td style={{ padding: '11px 14px', fontVariantNumeric: 'tabular-nums' }}>{symbol}{fmt(tp)}</td>
                            <td style={{ padding: '11px 14px', fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{symbol}{fmt(tp - loanAmount)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                {/* Big cuota mensual */}
                <div style={{ padding: 22, background: 'linear-gradient(135deg, var(--accent-soft), var(--surface))', borderRadius: 12, marginBottom: 18, border: '1px solid var(--accent)' }}>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Cuota mensual con {bank.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 500, color: 'var(--accent-deep)', letterSpacing: '-0.02em', lineHeight: 1, marginTop: 8 }}>
                    {symbol}{fmt(monthly)}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 8 }}>
                    al {rate}% anual · {years * 12} cuotas · plazo {years} años
                  </div>
                </div>

                {/* Breakdown */}
                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>Resumen del préstamo</h4>
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
                  {[
                    { label: 'Precio de la propiedad', val: price, big: true },
                    { label: 'Prima (entrada)', val: -downAmount, sub: `${downPct}%` },
                    { label: 'Monto a financiar', val: loanAmount, divider: true, highlight: true },
                    { label: 'Total a pagar al banco', val: totalPaid },
                    { label: 'Intereses totales', val: totalInterest, danger: true },
                  ].map((r, i, arr) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      padding: '11px 16px',
                      borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)',
                      borderTop: r.divider ? '2px solid var(--accent)' : 'none',
                      background: r.highlight ? 'var(--accent-soft)' : 'transparent'
                    }}>
                      <span style={{ fontSize: 13, color: r.danger ? '#DC2626' : 'var(--ink-2)' }}>
                        {r.label} {r.sub && <span style={{ color: 'var(--muted)', fontSize: 11 }}>({r.sub})</span>}
                      </span>
                      <span style={{
                        fontSize: r.big || r.highlight ? 15 : 13.5,
                        fontWeight: r.big || r.highlight ? 700 : 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: r.danger ? '#DC2626' : r.highlight ? 'var(--accent-deep)' : 'var(--ink)'
                      }}>
                        {r.val < 0 ? '−' : ''}{symbol}{fmt(Math.abs(r.val))}
                      </span>
                    </div>
                  ))}
                </div>

                <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>
                  Costos de cierre estimados <span style={{ fontWeight: 400, color: 'var(--muted)', fontSize: 11.5 }}>(en Costa Rica)</span>
                </h4>
                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
                  {[
                    ['Impuesto de traspaso (1.5%)', closingCosts.traspaso],
                    ['Timbres y derechos del Registro', closingCosts.timbres],
                    ['Honorarios de notario', closingCosts.honorarios],
                    ['Avalúo', closingCosts.avaluo],
                    ['Estudio registral', closingCosts.estudioRegistral],
                    [`Comisión del banco (${bank.comisionPct}%)`, closingCosts.comisionBanco],
                  ].map(([l, v], i, arr) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border)', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--ink-2)' }}>{l}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>${fmt(v)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', background: 'var(--surface-2)', fontSize: 13, fontWeight: 700, borderTop: '2px solid var(--border-strong)' }}>
                    <span>Total costos de cierre</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>${fmt(totalClosing)}</span>
                  </div>
                </div>

                <div style={{ padding: 14, background: '#FEF9E7', border: '1px solid #FBE699', borderRadius: 10, fontSize: 12.5, color: '#723B0E', lineHeight: 1.55 }}>
                  💰 <strong>Total efectivo necesario al firmar:</strong> {symbol}{fmt(cashNeeded)} (prima + costos de cierre)
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <button className="btn ghost" style={{ flex: 1, justifyContent: 'center' }}><Icons.download size={13}/> Descargar PDF</button>
                  <button className="btn accent" style={{ flex: 1, justifyContent: 'center' }}><Icons.whatsapp size={13}/> Compartir por WhatsApp</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

window.MortgageCalc = MortgageCalc;
