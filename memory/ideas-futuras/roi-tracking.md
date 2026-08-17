# Idea: ROI tracking del bot/CRM por cliente

**Estado:** 💭 idea capturada — NO trabajar todavía
**Origen:** sesión 2026-06-05 (founder, mañana, mientras arrancaba BOT-CTX-2)
**Decisión actual:** guardar bien estructurada, retomar cuando se cumpla el trigger (§5).

---

## 1. Qué es la idea

Cuantificar concretamente el impacto monetario y temporal que el sistema (bot + CRM) genera para cada cliente. Hoy el sistema cuenta "leads ganados" pero no asocia **valor en plata** ni **tiempo ahorrado**.

**Métricas que el founder quiere medir:**
- **$ generados:** valor total de leads cerrados atribuibles al sistema
- **Tiempo ahorrado:** horas-hombre que el cliente NO tuvo que invertir porque el bot atendió, calificó, agendó, etc.
- **Efficiency ratios:** $ por lead, $ por hora del bot, ratio de calificación
- Otras métricas operativas que ya existen (cuántos leads, cuántos calificados, etc.) — esas quedan, se complementan con las anteriores

**Por qué importa:**
- **Casos de éxito comerciales:** *"Mueblería Pérez Luna ganó ₡8M en 90 días usando Momentum"* es 10x más vendible que *"el bot atendió 200 leads"*
- **Justificación del fee de mantenimiento:** si Pérez Luna paga $200/mes y el bot le generó $4000 ese mes, el ROI está demostrado en el panel
- **Comparación inter-cliente:** ver qué configuración de bot (prompt, módulos, vertical) genera mejor ROI para iterar la oferta
- **Negociación de upsell:** *"vos pagás $200 y te genera $5000 — si subimos a $400 con módulo X, te puede generar $10K"*

## 2. Diseño técnico esbozado (cuando se haga)

### 2.1 Capturar el valor del lead cerrado

- Agregar campo `closed_deal_value_usd` (numeric) y `closed_at` (timestamp) a tabla `leads`
- Cuando un lead pasa a estado `ganado`, el agente humano completa el campo (modal pidiéndole el monto)
- Opcional: `deal_currency` por agencia (algunos cobran en CRC, otros USD)

### 2.2 Atribución al bot vs humano

Cada lead tiene un "share" de atribución para cuantificar cuánto del cierre fue bot vs humano. Heurísticas posibles:
- **% mensajes bot sobre total** en la conversación
- **¿El bot calificó al lead antes del handoff?** boolean
- **¿El bot agendó la reunión donde se cerró?** boolean
- Fórmula simple V1: si el bot calificó → 50% atribución bot. Si no → 25%. Configurable post-MVP

### 2.3 Cuantificar tiempo ahorrado

NO se puede medir directamente — hay que estimar. Una heurística:
- Cada mensaje del bot a un lead = X minutos que un humano habría tardado en responder
- X configurable por agency (default 3 min — promedio razonable para texto + cambio de contexto)
- `tiempo_ahorrado_h = (total_mensajes_bot_mes * 3) / 60`

V2 más sofisticado:
- Distinguir por tipo de mensaje (saludo simple vs respuesta calificadora compleja)
- Comparar contra benchmark del propio cliente (su tiempo de respuesta humano histórico)

### 2.4 Dashboard de ROI por cliente

Nueva pestaña en `/master/clientes/[slug]` (panel master) y en `/a/[slug]/dashboard` (panel del cliente):

- **Hero metric:** $ generados últimos 30 días (con delta vs mes anterior)
- **ROI ratio:** ($ generados) / (fee mensual + costo OpenAI/YCloud estimado) = "X veces"
- **Tiempo ahorrado:** horas estimadas + equivalente en salario (configurable rate/h)
- **Funnel:** total leads → calificados → handoffs → cerrados con $ por etapa
- **Gráfico temporal:** $ acumulado mensual

### 2.5 Caso de éxito generador

Endpoint o pantalla que genera automáticamente un PDF tipo *"Caso de éxito Mueblería Pérez Luna"* con:
- Métricas clave (ROI, tiempo ahorrado, leads procesados)
- Testimonio del cliente (texto libre + foto opcional)
- Comparativa antes/después si hay data previa
- Logo del cliente + diseño consistente Momentum

Esto es para usar comercialmente — landing, propuestas, redes.

## 3. Estado actual (qué ya existe vs qué falta)

**Ya existe:**
- Tabla `leads` con estado `ganado` y timestamps
- Mensaje counter por conversación
- `bot_turns` con observabilidad por turn

**Falta:**
- Campo `closed_deal_value` en `leads`
- UI para que el agente humano lo complete al ganar
- Lógica de atribución bot/humano
- Configuración de "minutos por mensaje bot" por agency
- Dashboard de ROI
- Generador de caso de éxito

## 4. Esbozo de fases (cuando se construya)

- **Fase 1 (~1 sesión):** capturar valor del lead cerrado + métrica simple "ingresos totales últimos 30 días"
- **Fase 2 (~2 sesiones):** dashboard de ROI con funnel + ratio + tiempo ahorrado
- **Fase 3 (~2 sesiones):** generador de caso de éxito (PDF/imagen) + atribución más sofisticada
- **Total realista:** 5 sesiones / 1-2 semanas

## 5. Trigger para retomar

Cualquiera de estas señales:

1. **Pérez Luna lleva 60+ días activo** y vos querés mostrarle resultados o renegociar fee → ahí justifica meter Fase 1
2. **Cerrás 2do cliente pagado** y querés comparar performance entre clientes → ahí justifica dashboard
3. **Un cliente prospecto te pide demostración de ROI esperado** como condición de cierre → ahí justifica generador de caso de éxito
4. **Estás escribiendo landing o propuesta nueva** y necesitás números reales para mostrar → ahí justifica capturar el valor cerrado mínimo

## 6. Riesgos a considerar antes

- **Datos faltantes para casos no cerrados en chat:** algunos cierres pasan offline (cliente llamó por teléfono, fue en persona). El campo `closed_deal_value` requiere que el agente humano sea disciplinado para completarlo. Si no, la métrica está sesgada hacia cierres-en-chat
- **Atribución compleja:** un lead que charló con el bot, después con humano, después volvió 3 meses después y cerró — ¿cuánto fue del bot? Es problema clásico de attribution sin solución perfecta
- **Sesgo de selección:** el bot atiende todos los leads, el humano solo los importantes. Comparar "tasa de cierre bot" vs "tasa de cierre humano" sin normalizar = manzanas con peras
- **Costo del bot debe entrar al ROI:** $ del fee de Momentum + $ OpenAI consumido + $ YCloud + $ Supabase del cliente. Sin esos costos en el cálculo, el ROI está inflado

## 7. Referencias

- `clientes/muebleria-perez-luna/00-perfil.md` — tiene valor del deal ($2,000 setup + $200/mes mantenimiento) que puede ser primer punto de datos
- Tabla `bot_turns` ya tiene la observabilidad por turn que necesitamos para "cuántos mensajes procesó el bot"
- Tabla `messages` con `sender_kind` ya distingue bot vs human (post-BOT-CTX-2)
