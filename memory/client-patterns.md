# Patrones de Clientes Reales

Extraido de 7 proyectos documentados en `knowledge/02_CASOS_CLIENTES_COMPLETOS.md`

---

## Tabla de Referencia Rapida

| Cliente | Tipo | Agentes | Router | Tools | Post-Processing | Canal |
|---------|------|---------|--------|-------|----------------|-------|
| Jaco Dream Rentals | Villas de lujo | 1 (Liliana) | LLM (spam/handoff + datos villa) | Supabase RAG | Filtro inicial | ManyChat |
| El Canal | Real estate | 3 (Eva + Inventario + Agendamiento) | LLM (BANT + 10 campos) | Google Sheets | Detector descalificacion + vendedores | ManyChat |
| Dr. Carlos | Clinica medica | 2 (Dr. Carlos + Objeciones LAARC) | LLM (scoring 0-8 + 3 niveles) | Ninguno | Deteccion Calendly/wa.me + Discord | ManyChat |
| SmartCheck | Inspecciones vehiculares | 1 + classifier | LLM | Ninguno | - | WhatsApp (Evolution) |
| Grandit | Microcreditos | 1 (sin router) | No tiene | Ninguno | - | WhatsApp |
| Level (LEO) | Asesoria inversiones | 2 modos (reactivo+proactivo) | LLM | Ninguno | - | WhatsApp (YCloud) |

**Modelo para todos los workflows reales analizados:** gpt-4.1-mini (temp 0.1 router, temp 0.4 agentes)
**Modelo formateador:** gpt-4o-mini (universal, no cambia)
| Level (LEO) | Asesoria inversiones | Bot reactivo + proactivo | GPT-4o | 2 modos | WhatsApp (YCloud) |
| 97 Display | Marketing gimnasios | Agente unico | GPT-4o | 1 | Chat |

## Patrones por Tipo de Negocio

### Servicios locales (clinicas, salones, inspecciones)
- Arquitectura simple: 1-2 agentes + classifier
- Agendamiento via Calendly link (hardcoded en prompt)
- Precios en moneda local
- GPT-4o-mini si prompt <3k chars
- Canal: WhatsApp o Instagram

### Real estate / alquileres
- Arquitectura: 2-3 agentes + classifier con extraccion de datos
- Google Sheets para inventario (live queries)
- Round-robin para asignacion de vendedores
- NUNCA confirmar disponibilidad/precios exactos
- GPT-4o siempre (tickets altos, conversaciones complejas)

### Microfinanzas / formularios
- Agente unico ultra-simple
- Enviar formulario INMEDIATAMENTE (no preguntar datos antes)
- GPT-4o-mini suficiente
- Flujo ultra-directo: saludo → link → FAQs

### Asesoria / consulting
- Bot con modo reactivo (inbound) + proactivo (outbound)
- YCloud para broadcasts proactivos
- Segmentacion: tibios (CTA directo) vs frios (valor primero)
- CRM: Notion
- GPT-4o

## Decisiones Que Funcionaron

1. **Eliminar agente de Derivacion** (El Canal) — redundante. El agente principal puede compartir WhatsApp del vendedor directamente.
2. **Enviar formulario inmediatamente** (Grandit) — elimino abandono masivo. No pedir datos que el formulario ya captura.
3. **Agente unico con RAG** (Jaco) — para negocios simples (mostrar propiedades, guiar a reserva), multi-agente es overkill.
4. **String detection para notificaciones** (Dr. Carlos) — detectar "wa.me/", "calendly.com" en la respuesta del agente. No requiere JSON estructurado.
5. **Descalificacion elegante** (El Canal) — "Los precios arrancan desde $117K. Puedo pasarte info para que lo consideres a futuro."
6. **Preguntar bebida antes de la cita** (El Canal) — humaniza la interaccion, oportunidad de engagement.
7. **Scoring 0-5 para calificacion** (Dr. Carlos) — Hot (4-5): Calendly inmediato. Warm (2-3): educar + Calendly. Cold (0-1): descalificar.

## Errores Reales y Como Se Resolvieron

1. **Eva preguntaba nombre dos veces** → classifier no extraia datos del historial. Fix: agregar extraccion de datos al classifier.
2. **Bot pedia aclaracion de moneda** (El Canal) → "millones" = colones automaticamente, "K" = dolares. No preguntar "colones o dolares?"
3. **Bot preguntaba dias/horas** (El Canal) → no tenia acceso a calendario. Fix: eliminar agente de agendamiento, compartir WhatsApp directo.
4. **Token limit del classifier muy bajo** → JSON vacio o cortado. Fix: subir a 500-1000 tokens.
5. **Redundancia masiva en anti-repeticion** (SmartCheck) → 30% del prompt era instrucciones repetidas. Fix: consolidar en 1 regla clara.
6. **Bot confundia "tenes" con "queres revisar"** (SmartCheck) → son compradores evaluando, no dueños del vehiculo. Framing importa.
7. **CTA de ManyChat tratado como nombre** (Dr. Carlos) → "SILENCIO" era el CTA de apertura. Fix: regla de ignore explicita.
8. **Prompt crecio +5.8%** (Jaco v14) → los prompts crecen con cada iteracion. Monitorear longitud activamente.
