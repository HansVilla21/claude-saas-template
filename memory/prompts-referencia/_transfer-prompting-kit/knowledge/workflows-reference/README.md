# Workflows de Referencia

Templates y workflows reales de chatbots en produccion que sirven como referencia para entrenar el sistema y como ejemplo para futuros clientes.

---

## Estructura

### `template-base/` — Template original (Jaco Dream Rentals)
El workflow base que Hans duplica por cada cliente nuevo. Todos los clientes salen de este template.

- `workflow.json` — JSON del workflow completo (~65 nodos)
- `analysis.md` — Analisis detallado de la estructura y patrones
- `prompts/` — Los 4 prompts originales:
  - `agente-principal-liliana.md` — Agente principal (villas de lujo)
  - `information-extractor-router.md` — Router/clasificador
  - `information-extractor-filtro-inicial.md` — Filtro de conversaciones viejas
  - `formateador-mensajes.md` — Formateador universal (reutilizable sin modificar)

**Caso de uso:** Villas de lujo, 1 agente unico, RAG con Supabase.

### `dr-carlos/` — Ejemplo: Clinica medica (2 agentes + objeciones)
Adaptacion para servicios profesionales con objeciones frecuentes.

- `workflow.json` — JSON completo
- `analysis.md` — Analisis
- `prompts/` — Router + Principal + Objeciones LAARC

**Caso de uso:** Consulta medica, scoring de leads (0-8 pts), framework LAARC para objeciones, handoff via Discord.

### `el-canal/` — Ejemplo: Real estate (3 agentes)
Adaptacion para negocios con inventario dinamico y asignacion de vendedores.

- `workflow.json` — JSON completo
- `analysis.md` — Analisis
- `prompts/` — Router + Principal + Inventario + Agendamiento

**Caso de uso:** Real estate con inventario en Google Sheets, round-robin de vendedores, detector de descalificacion post-agente.

---

## Como Usar estos Workflows

### Si estas creando un cliente nuevo
1. Identifica cual de los 3 patrones aplica mejor:
   - **Producto/catalogo simple** (1 agente) → `template-base`
   - **Servicio profesional con objeciones** (2 agentes) → `dr-carlos`
   - **Inventario + derivacion** (3 agentes) → `el-canal`
2. Duplica ese JSON como punto de partida
3. Aplica los cambios segun tu discovery (prompts, credenciales, tablas)

### Si estas entrenando el sistema
- Los prompts de `prompts/` muestran como son los prompts REALES de produccion
- Los analisis en `*.md` documentan que funciono y que cambio
- Los JSONs completos sirven para comparar estructura entre tipos de negocio

---

## Nota sobre Credenciales

Los `credentials.id` en los JSONs son referencias INTERNAS de n8n (no tokens). Al importar en tu instancia de n8n:
1. Los IDs no sirven (son de otra instancia)
2. n8n te pedira conectar tus propias credenciales
3. El proceso de reconexion es manual por cada nodo que usa credenciales
