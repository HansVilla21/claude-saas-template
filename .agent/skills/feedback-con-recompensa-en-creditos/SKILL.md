# Skill: Feedback de Usuarios con Recompensa en Créditos

## Cuándo usar esta skill

- Cuando un SaaS con **moneda interna (créditos)** quiere un loop de **sugerencias/reporte de
  bugs** y usar la moneda como **incentivo** ("si implementamos tu idea o el bug es real, te
  regalamos créditos").
- Convierte a los usuarios en el roadmap + QA, a un costo bajísimo (los créditos cuestan centavos).

## Proceso

1. **DB:** tabla `feedback` (`user_id`, `type` suggestion/bug, `message`, `page_url`,
   `status` nueva/revisando/implementada/rechazada, `reward_credits`, `created_at`,
   `reviewed_at`). RLS: el usuario lee lo suyo; escrituras por service_role. Nuevo motivo de
   ledger `feedback_reward`.
2. **Server action `submitFeedback`:** auth + validación (largo mín/máx) + **anti-spam** (tope de
   envíos por usuario/día). Inserta con service_role.
3. **UI `/sugerencias`:** formulario (toggle Sugerencia/Bug + textarea) + lista **"Tus envíos"**
   con badge de estado y `🎁 +N créditos` cuando se recompensa. Link en el sidebar. Ruta protegida.
   Incentivo **visible** en el formulario.
4. **Otorgamiento MANUAL del founder** (control de costo + evita gaming): script CLI
   `list / review / grant <id> <créditos> / reject`. El `grant` marca `implementada` **e** inserta
   el `+créditos` en el ledger **en una transacción** → el usuario lo ve reflejado al instante.

## Gotchas / decisiones

- **El otorgar es manual**, no automático — así el founder decide qué realmente aportó y controla
  el costo. La UI promete la recompensa; el humano la concede.
- **Que los números den:** recompensa modesta (p. ej. idea +10 · bug +5 a ~$0.06/img ≈ $0.60/$0.30).
- El estado visible ("implementada +N") es lo que hace fuerte el incentivo — no dar la recompensa
  en silencio.

## Output esperado

Feature `/sugerencias` (envío + estado) + tabla `feedback` + motivo `feedback_reward` + script de
administración para revisar y otorgar.

## Ejemplo

**Input:** "Pongamos en el sidebar un botón para sugerencias/bugs, y si sirve les regalamos créditos."

**Output:** migración `feedback` + `feedback_reward`; server action con anti-spam; página
`/sugerencias` con formulario y "Tus envíos" con estado; link en sidebar; `scripts/feedback-admin.mjs`
(`list`/`grant`/`reject`). Loop probado: usuario envía → founder `grant <id> 10` → usuario ve
"Implementada 🎁 +10 créditos" y su saldo sube.
