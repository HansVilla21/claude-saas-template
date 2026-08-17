# Snippet para el CLAUDE.md del proyecto destino

Pega el bloque de abajo dentro del `CLAUDE.md` del proyecto destino (idealmente cerca de las
reglas del proyecto). Esto cablea los skills con la metodologia: es lo que activa la calidad.

---

```markdown
## Generacion de Prompts y Agentes de Chatbot (Momentum AI)

Este proyecto usa la metodologia Momentum AI para crear prompts y entrenar los agentes de IA
que responden en los flujos de chatbot. La calidad depende de seguir estas reglas SIEMPRE.

### Antes de generar u optimizar CUALQUIER prompt (obligatorio)

1. Leer `memory/metodologia-core.md` — reglas no-negociables (fuente de verdad)
2. Leer `memory/feedback-prompting.md` — correcciones ganadas en produccion
3. Consultar los prompts reales en `knowledge/workflows-reference/` como ancla de calidad
   (no inventar patrones — seguir lo que ya funciona)

### Skills y agente disponibles

| Recurso | Cuando se usa |
|---|---|
| skill `momentum-architect` | decidir cuantos agentes, modelo LLM, estructura del flujo |
| skill `momentum-prompt-gen` | generar prompts (agente principal, router, especialistas, objeciones, formateador, etc.) |
| skill `momentum-prompt-optimizer` | mejorar un prompt existente con cambios quirurgicos |
| agente `prompt-reviewer` | validar un prompt contra el checklist pre-deploy |

El flujo de calidad completo es: **architect (estructura) -> prompt-gen (genera) ->
prompt-reviewer (valida) -> prompt-optimizer (arregla quirurgicamente lo que falle).**

### Reglas de prompting NO negociables (resumen — el detalle esta en metodologia-core.md)

- **Arquitectura modular** — 1-3 agentes especializados, nunca un mega-prompt
- **Limites de chars:** agente principal 3,000-5,000 · especializado 1,000-2,000 · classifier 1,500-3,000
- **Cambios quirurgicos** — si funciona al 70%, arreglar el 30%. NUNCA reescribir desde cero
- **No inventar** — "Deja verifico eso" en vez de inventar datos
- **Valor primero, datos despues** — nunca pedir email/tel antes de dar valor
- **Puntuacion humana** — sin punto final, sin dos puntos, sin ; sin ¿ sin em-dash (—). Default SIEMPRE
- **Variar mensajes repetidos** — nunca el mismo texto literal dos veces
- **No prometer lo que el bot no puede enviar** — solo links y texto
- **SIEMPRE reportar el conteo de caracteres** de cada prompt generado
- **Formateador:** copiar verbatim el canonico (`.claude/skills/momentum-prompt-gen/assets/template-formateador.md`), no improvisar

### Regla de oro

Si el mensaje del bot suena a articulo de periodico, es bot. Si suena a un mensaje de WhatsApp
a un amigo, es humano. Ese es el filtro de calidad final.
```

---

## Importante

Si tu CLAUDE.md de destino ya tiene una seccion de chatbots o de prompting, **fusiona** este
contenido en lugar de duplicarlo. No debe haber dos fuentes de verdad contradictorias: la unica
fuente de verdad de las reglas es `memory/metodologia-core.md`.
