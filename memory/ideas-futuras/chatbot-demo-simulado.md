# Idea futura — Chatbot demo simulado dentro del CRM

**Capturada:** 2026-06-06 (sesión deploy del Agente Principal)
**Quién:** Founder (Hans) durante revisión del bot deployado.
**Trigger:** founder vio una imagen de interfaz de chatbot demo estilo conversación visual y comentó *"está interesante, me gusta. Incluso dentro de nuestra plataforma podamos tener una versión demo."*

---

## Qué es

Una **simulación visual de chatbot** embebida en el CRM Momentum. Interfaz tipo WhatsApp / web chat, sin canal real conectado (sin número de teléfono, sin Telegram, sin YCloud). El usuario que interactúa NO es un lead real — es un prospecto que está probando el bot vivo, sin tener que cargar el contacto.

**Por detrás** corre un agente IA (mismo motor que el bot real, mismo prompt) que responde dentro de la conversación simulada.

## Para qué sirve (valor de negocio)

**Asset comercial para cierre.** Hoy cuando Hans/Pietro le quieren mostrar a un prospecto cómo funciona el bot, tienen que:
- O bien cargarle al prospecto su número de WhatsApp como contacto del demo
- O bien describirle de palabra qué hace
- O bien grabar un video

Con la demo simulada → **comparten un link**, el prospecto interactúa con el bot en vivo desde el browser, **ve la magia con sus propios ojos**, y eso baja la fricción al cierre.

**Frase ancla aplicada:** *"Te entrevistamos, te construimos un chatbot que habla como vos, le ponemos todas las reglas que quieras..."* — la demo permite **mostrar** ese chatbot funcionando, no solo prometerlo.

## Versiones posibles

### V1 (mínima) — demo del bot Momentum
- Una interfaz de chat dentro del CRM (`/demo` o página pública `/demo/<slug>`)
- Backend: llama al mismo agente conversacional, mismo `bot_config` de Momentum
- Sin handoff real, sin Postgres histórico — la conversación vive en localStorage o memoria efímera
- Botón "reiniciar conversación"
- Mensaje inicial preguntando al prospecto qué quiere ver
- CTA al final: "¿Te gustaría una llamada con Hans para que te lo arme?"

### V2 (per-cliente) — demo del bot DE CADA CLIENTE
- Cada agency tiene su propio link de demo (`/demo/<agency-slug>`)
- Permite a cualquier cliente Momentum compartir SU demo a sus prospectos
- Sus prospectos prueban el bot configurado para ese negocio puntual
- Útil también para que el cliente Momentum apruebe el tono del bot antes de ir live a WhatsApp

### V3 (white-label) — demo del bot integrable en webs externas
- Widget JavaScript embebible (`<script src="https://momentum.ai/widget/<agency>" />`)
- El bot del cliente vive como widget de chat en el sitio web del cliente
- Captura leads desde la web del cliente Momentum sin pasar por WhatsApp todavía
- Posible monetización extra (módulo "Web Widget")

## Consideraciones técnicas

- **Cero costo de WhatsApp/YCloud** (no usa el canal de pago).
- **Sí costo OpenAI** por cada turno → poner rate limit por IP / per session para evitar abuso si la demo es pública.
- **Anti-prompt-injection:** la demo puede ser blanco de troleos. Reglas duras anti-fuga del bot config (no revelar instrucciones, no salir del rol).
- **Tracking:** sessions de demo deberían medirse (cuántas conversaciones, cuántas llegan al CTA de agendar) → es un funnel de conversión nuevo.
- **Diferenciación del flujo real:** la demo NO debe disparar handoff silencioso ni meter al prospecto a la cola de leads reales del cliente. Es sandbox.

## Por qué importa

> *"Si funciona como una conversación, se puede interactuar con la gente y todo, pero como para hacerlo demo, está interesante. Creo que ayuda mucho a poder mostrar lo que nosotros hacemos. Creo que es una muy buena idea."* — Hans, 2026-06-06

Esto sale del patrón **mostrar > contar**. Una demo interactiva vale más que 10 brochures. Y como Momentum es servicio (no software), la demo es la única forma de que un prospecto "toque" el producto sin pagar setup primero.

## Cuándo hacerla (no ahora)

**NO es para el MVP ni para post-Meta-Ads inmediato.** Es post-validación del bot real con tráfico de ads. Después de:
1. Bot real funcionando con leads reales (Meta Ads ~2026-06-11)
2. Pérez Luna implementado
3. 2-3 clientes más cerrados con el flujo manual de demo

Cuando ya tengamos data de qué funciona del bot en vivo, la demo replica eso con confianza. Hacerla antes = construir sobre arena.

## Pendiente

- [ ] Mockear la UI (mismo estilo que el inbox del CRM para coherencia visual)
- [ ] Decidir si la demo vive en una página pública `/demo` o dentro del panel cliente (cada cliente tiene su demo accesible solo por él)
- [ ] Decidir si la conversación tiene memoria entre sesiones (cookie) o se reinicia cada vez
- [ ] Definir el CTA final (Calendly? handoff manual a Hans? formulario simple?)
- [ ] Validar con 2-3 prospectos si la demo simulada baja o no la fricción de cierre

---

**Status:** idea capturada, sin compromiso de ejecutar. Revisar después de Meta Ads + 2-3 clientes cerrados.
