# Aprendizajes Acumulados

Lecciones aprendidas de proyectos reales. Se agrega aqui cada vez que se descubre algo nuevo.

---

## De Proyectos Reales (18+)

- En n8n, cada agente responde directamente al usuario — NO hay chaining de agentes en un solo turno
- "Te voy a pasar el contacto" + esperar = UX ROTO. Dar el contacto EN EL MISMO mensaje
- Classifier con demasiadas rutas = confusion. Maximo 2-3 destinos
- Token limit del classifier demasiado bajo = JSON vacio/cortado (minimo 500 tokens)
- Keywords de emergencia deben ser exhaustivos (se paso un caso en testing)
- Contenido educativo solo para awareness bajo (1-2), no para todos
- Closing pitch ANTES del link — no solo tirar el link
- Follow-up automations van en workflow SEPARADO, no en el bot principal
- Si el usuario pausa para consultar/coordinar → cerrar cordialmente, NO continuar el flujo
- A veces la optimizacion mas poderosa es QUITAR pasos, no agregar
- URLs con variables no resueltas en produccion = error fatal
- Inconsistencia entre "mision" y "flujo" del prompt = bot confundido
- Links de propiedades = experiencia positiva si se presentan bien
- El bot debe EDUCAR el proceso (usuarios no saben como funciona el sitio web)

## Debugging del Switch tras Information Extractor — Abril 2026

**Regla critica:** Cuando el Switch no rutea correctamente despues de un Information Extractor, NUNCA asumir el nombre del campo segun el schema que definiste. El LLM no siempre respeta los nombres de campos del schema — los puede acortar o ajustar segun el contexto del prompt.

**Como diagnosticar:**
1. Correr el Switch en modo step-by-step y mirar el INPUT real que recibe
2. Expandir el JSON del Information Extractor y ver exactamente como se llaman los campos generados
3. Ajustar el Switch Y el schema para que usen el mismo nombre que el LLM realmente genera

**Ejemplo real (Level):**
- Schema definido: `"agente_destino": "LEO_PRINCIPAL"`
- LLM genero: `"agente": "LEO_PRINCIPAL"` (acorto el nombre)
- Switch buscaba `$json.output.agente_destino` → nunca matcheaba
- Fix: renombrar schema a `"agente"` y Switch a `$json.output.agente`

**Patron preventivo:** usar nombres de campos CORTOS y naturales en el schema (como los workflows reales de Dr. Carlos y El Canal usan `destino`). Los LLM tienden a preferir nombres simples.

## Del Template Base (chatbot-manychat.json) — Abril 2026

- **Message batching con Redis** — Push al llegar, wait 1 min, get all, verificar si es ultimo. Resuelve el problema de usuarios que envian una idea en 3 mensajes separados.
- **Doble Information Extractor** — El primero filtra conversaciones viejas (no interferir con chats pre-existentes del cliente). El segundo es el router/classifier real. Dos capas de filtrado.
- **Handoff = apagar chatbot por lead** — En vez de solo dejar de responder, se actualiza Airtable con "Chatbot Activado = Apagado" para ese lead especifico. Asi el bot no responde nunca mas a ese lead hasta que se re-encienda.
- **Backup route en el Switch** — Si el Information Extractor retorna output vacio/null, va al agente principal como fallback. Previene que el workflow se rompa.
- **Formateador como LLM (no Code Node)** — Divide la respuesta en bloques de max 3 lineas, separa bullets pegados (• item1 • item2 → cada uno en su linea). Es un prompt reutilizable para cualquier chatbot.
- **Patron ManyChat API** — Enviar mensajes requiere 2 HTTP requests: setCustomField (asigna texto a variable) + sendFlow (activa el flujo que envia). Se itera con Loop + Wait entre cada bloque de mensaje.
- **Modelo gpt-4.1-mini** — Version mas reciente que gpt-4o-mini para extractors y agente principal. Temperature 0.1 para classifiers, 0.4 para agente conversacional.
- **El Code Node para formatear historial** — Limpia el output de Postgres: quita headers de markdown, prefija con "Usuario:" / "Bot:", corta en "# Datos recopilados hasta el momento".
- **El template se duplica y modifica** — Hans trabaja con un template base que duplica por cliente. Lo que cambia: prompts del Information Extractor (router), prompts del agente(s), schema del Information Extractor, tools del agente, y cantidad de agentes en el Switch.
- **El prompt del agente principal de Jaco tiene ~6,500 chars** — Excede el limite recomendado de 5,000 pero funciona porque usa gpt-4.1-mini (modelo mas capaz que gpt-4o-mini).

## De Casos Legales (Advertencias)

- **Air Canada:** Bot prometio descuento por duelo que no existia → lawsuit. LECCION: el bot NUNCA hace compromisos vinculantes.
- **Chevy Dealership:** Bot confirmo compra de Tahoe por $1 sin guardrails de precio. LECCION: SIEMPRE validar rangos de precio.
