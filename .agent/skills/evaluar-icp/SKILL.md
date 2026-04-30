# Skill: Evaluar ICP

## Cuándo usar

- Cuando hay un ICP **candidato** (ej: "coaches hispanos de productividad") y queremos saber si es viable
- Antes de comprometerse con un ICP primario
- Para comparar varios ICPs y elegir
- Cuando alguien dice "le serviría a X" y queremos pasarlo por un filtro disciplinado

Esta skill aplica los frameworks de Hormozi (Starving Crowd test) + métricas SaaS (de `saas-strategist`) para producir un score objetivo.

**No usar para**: definir el avatar específico (eso lo hace `definir-avatar`) ni para construir oferta (eso lo hace `construir-oferta`).

## Proceso

### Paso 1: Recibir input estructurado
El input mínimo:
```
{
  "icp_candidato": "Coaches hispanos de productividad/coaching ejecutivo",
  "evidencia_disponible": "[Referencias a docs/positioning/pains-discovered.md u otros]",
  "contexto": "[Qué se sabe de este grupo]"
}
```

### Paso 2: Test de Starving Crowd (Hormozi)
Calificar 1-5 cada uno (1=malo, 3=normal, 5=excelente). **Cualquier 1 mata el ICP.**

| Indicador | Pregunta | Score 1-5 | Evidencia |
|---|---|---|---|
| **Dolor masivo** | ¿Es necesidad o nice-to-have? | | Quotes de `pains-discovered.md` |
| **Poder adquisitivo** | ¿Pueden y están dispuestos a pagar $30-150/mes? | | LTV estimado, casos similares |
| **Fácil de orientar** | ¿Hay canal claro para alcanzarlos? (grupos, hashtags, podcasts) | | Lista de canales identificados |
| **Crecimiento** | ¿El segmento crece o se contrae? | | Datos de mercado |

### Paso 3: Test de monetización SaaS
| Métrica | Pregunta | Estimación | Score salud |
|---|---|---|---|
| **Willingness to pay** | ¿Cuánto pagaría/mes max? | $X/mes | <$30 problemático, $30-100 viable, $100+ excelente |
| **LTV potencial** | ¿Cuánto tiempo se quedaría? | X meses | <6 problemático, 6-18 viable, 18+ excelente |
| **CAC estimado** | ¿Cuánto costaría adquirirlo? | $Y | <33% del LTV |
| **Activación probable** | ¿Llega al aha moment fácil? | % | >40% en 7 días ideal |
| **Expansión potencial** | ¿Crece el ticket con el tiempo? | Sí/No | Multi-perfil, equipos, etc. |

### Paso 4: Test de fit con Hookly específicamente
| Pregunta | Sí/No |
|---|---|
| ¿Crea contenido en Instagram (MVP) o TikTok (V1)? | |
| ¿Tiene un nicho identificable? (para análisis viral relativo) | |
| ¿La adaptación de guión a su voz es valiosa? (no es genérico) | |
| ¿Estaría dispuesto a aceptar una herramienta IA para esto? | |
| ¿Es **prosumer** (paga sin aprobaciones corporativas)? | |

### Paso 5: Awareness level del segmento
¿En qué nivel de awareness están la mayoría?
- ☐ Completely Unaware: no saben que tienen el problema
- ☐ Problem-Aware: saben el problema, no la solución (← donde la mayoría está hoy)
- ☐ Solution-Aware: conocen soluciones, no han elegido cuál
- ☐ Product-Aware: conocen productos como Hookly
- ☐ Most Aware: nos conocen específicamente

Esto define el **estilo de mensaje** que tendría que usar la landing/copy.

### Paso 6: Síntesis y veredicto

```markdown
## Veredicto: [ICP candidato]

**Score Starving Crowd:** X/20 (de 4 indicadores × 5 max)
**Score SaaS viability:** X/25 (de 5 indicadores × 5 max)
**Fit con Hookly:** [Alto/Medio/Bajo] (de los 5 sí/no)
**Awareness predominante:** [nivel]

### Fortalezas
- [Lista de 2-3 puntos donde el ICP brilla]

### Riesgos
- [Lista de 2-3 puntos donde el ICP falla o tiene incertidumbre]

### Recomendación
[Una de estas tres opciones, justificada en 2-3 frases:]
- ✅ **CANDIDATO PRIMARIO** — pasa todos los filtros con score alto
- ⚠️ **CANDIDATO SECUNDARIO/ADYACENTE** — viable pero no #1
- ❌ **DESCARTAR** — falla en Hormozi, en métricas o en fit

### Si avanzamos, los next steps
- [Concreto: qué falta validar, qué research adicional]
```

## Output esperado

Markdown listo para guardar en `docs/positioning/icp-evaluation-[nombre].md`. Si se evalúan varios candidatos a la vez, el output combinado va a `docs/positioning/icp-comparison.md` con tabla resumen.

## Ejemplo (sintético)

**Input:**
```
ICP: "Coaches hispanos de productividad"
Evidencia: 8 quotes en pains-discovered.md sobre "pánico al lunes"
```

**Output (resumen):**
```
## Veredicto: Coaches hispanos de productividad

Score Starving Crowd: 17/20 (Dolor 5, Pago 4, Target 4, Crecimiento 4)
Score SaaS viability: 19/25 (WTP $80/mo, LTV 14mo, CAC ~$30, Activación 50%, Expansion sí)
Fit con Hookly: Alto (5/5)
Awareness: Problem-Aware

✅ CANDIDATO PRIMARIO

Fortalezas:
- Dolor "pánico al lunes" muy documentado y consistente
- LTV alto por bajo churn (su negocio depende de contenido)
- Canales claros: podcasts hispanos de coaching, grupos FB, IG

Riesgos:
- Mercado fragmentado por país (CR/MX/CO/AR/ES requieren copy diferente)
- Awareness bajo — la educación pre-venta consume CAC

Next steps:
- Pain-discovery profundo en este segmento específico
- Validar willingness-to-pay con 5-10 entrevistas en CR
```

## Reglas

- No saltarse pasos. Cada uno aporta señal distinta.
- Si no hay evidencia para un punto, marcarlo como "❓ requiere validación" — no asumir.
- Si el score total es <60% (combinado), descartar sin lástima — no romanticés.
- Cualquier "1" en Starving Crowd es kill switch automático.
