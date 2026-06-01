# Skill: N8N Merge node — trampa de `combineAll` (cross-product)

## Cuándo usar esta skill

- Estás juntando dos branches de un Switch o IF con un Merge node.
- Diseñás una cascada `Switch → [HTTP|skip] → Merge` donde solo una rama emite por turno.
- Síntoma: el flow se corta silenciosamente después del Merge — los nodos downstream no corren, sin error visible.

**No usar** cuando: estás genuinamente haciendo un producto cartesiano (lookup vs many rows) — ahí `combineAll` SÍ es lo correcto.

## Por qué existe esta skill

El nodo `Merge` typeVersion 3+ tiene 6 modos. El default visual puede ser engañoso: **`combineAll`** suena a "junta todo" pero hace **producto cartesiano** (N items × M items = N*M items).

**El trap:** cuando uno de los inputs queda con **0 items** (común tras un Switch con `allMatchingOutputs:true` o un IF que emitió por solo una rama), `combineAll` produce **0 items** (porque N*0=0). El flow muere silenciosamente: el siguiente nodo simplemente no corre, sin tirar error.

**Síntoma típico:**

```
Switch (3 ramas exclusivas) → solo emite por rama 1 (items=[A], ramas 2-3 vacías)
   ↓                                ↓                    ↓
   [HTTP A]                         (nada)               (nada)
   ↓                                ↓                    ↓
            Merge1 (combineAll, 3 inputs) → 1 × 0 × 0 = 0 items ❌
                                                              ↓
                                                       (flow muere silencioso)
```

## Modos del Merge node — cuándo usar cada uno

| Modo | Comportamiento | Cuándo usar |
|---|---|---|
| **`append`** | Concatena items de todos los inputs en orden. Output = input1 + input2 + ... | **Default sano** para juntar branches de Switch/IF. Si solo 1 input tiene items, output tiene esos items. |
| `combineAll` | Cross-product. Output = todos los pares (item_a, item_b) | Solo cuando QUERÉS lookup-style join (1 row × N options). Riesgoso. |
| `combineByMatchingFields` | Inner join por field match | Cuando los 2 inputs tienen un campo común para joinear. |
| `combineByPosition` | Empareja por índice (item[0] con item[0], etc.) | Cuando los 2 inputs vienen ordenados sincronizados. |
| `chooseBranch` | Output del primer input no vacío | Útil pero requiere config extra (`chooseBranchMode`, `output`). |
| `combineByMatchingAll` | Inner join estricto por todas las keys | Casos raros. |

**Regla práctica:** **default a `append`** salvo que tengas razón concreta para otro modo.

## Patterns bugged + sus fixes

### Bug típico

```javascript
// JSON del workflow
{
  name: 'Merge1',
  type: 'n8n-nodes-base.merge',
  typeVersion: 3,
  parameters: { mode: 'combineAll', options: {} }  // ❌ TRAMPA
}
```

Switch1 con `allMatchingOutputs:false` (modo exclusivo) emite por UNA salida. Las otras salidas que van al mismo Merge tienen 0 items.

Cross-product: `1 × 0 = 0` items. Merge devuelve array vacío.

Los nodos siguientes (Switch2, Cerrar Trace, etc.) reciben input vacío y NO CORREN. No hay error en logs.

### Fix

```javascript
// JSON corregido
{
  name: 'Merge1',
  type: 'n8n-nodes-base.merge',
  typeVersion: 3,
  parameters: { mode: 'append', options: {} }  // ✅ Concatena, propaga
}
```

Ahora si Switch1 emite por rama 1 (items=[A]) y rama 2 emite vacío, Merge concatena: output = [A]. Los nodos downstream reciben el item y corren normal.

## Detección preventiva

Antes de deploy, validar todos los Merge nodes:

```javascript
const merges = workflow.nodes.filter(n => n.type === 'n8n-nodes-base.merge');
for (const m of merges) {
  const mode = m.parameters?.mode;
  if (mode === 'combineAll') {
    console.warn(`Merge node "${m.name}" usa combineAll — riesgo de flow death silencioso.`);
  }
}
```

Si aparecen warnings, validar si el `combineAll` es intencional o si fue un default heredado del template/copy-paste.

## Pista de diagnóstico en producción

Si el flow se corta sin error después de un Merge:

1. Ver execution log de N8N. Buscar el último nodo que aparece con `executionStatus: 'success'`. Si es un Merge, suspecho.
2. Inspeccionar `runData[mergeName][0].data.main[0].length` — si es 0, el Merge emitió vacío.
3. Verificar los inputs de ese Merge: cuáles tenían items, cuáles no.
4. Si el problema es "una rama vacía", cambiar a `append`.

## Anti-patterns (NO hacer)

- ❌ **Asumir que `combineAll` "junta items"**. Hace producto cartesiano, NO concatena.
- ❌ **Dejar `combineAll` como default sin razón explícita**. Es un footgun.
- ❌ **Diagnosticar "el flow se corta" sin mirar el modo del Merge primero**. Es el sospechoso #1.
- ❌ **Tratar de fixear agregando `Set node` que emite item dummy**. Solución barata pero confusa; mejor cambiar el modo.

## Cómo se invoca en sesión

El founder NO escribe `/n8n-merge-combineall-trap`. Detectar proactivamente cuando:

- Estás reviewing un workflow N8N con cascadas Switch → HTTP → Merge.
- El founder reporta "el flow se corta después del Merge sin error".
- Estás diseñando un workflow nuevo y vas a poner un Merge — recomendar `append` por default.

Aplicar el fix automáticamente si encontrás `combineAll` sin justificación clara.

## Caso real: bot-c-v1 (2026-06-01)

**Síntoma:** Sofia C respondía al lead (rama A funcionaba), pero la rama B (extractor → switches → audit) se cortaba después de `Merge1`. `Cerrar Trace de Turno` nunca corría. `bot_turns.status` quedaba en `'running'` para siempre, sin errores en logs.

**Diagnóstico:** execution log mostró `Merge1 — Wait Extractor Write` con `executionStatus: 'success'` pero **outputs=0 items**. El input[0] (HTTP extractor.write) tenía 1 item. El input[1] (Switch1 output=false, skip) tenía 0 items. `combineAll` → 1×0 = 0.

**Fix:** los 3 Merge nodes (`Merge1`, `Merge2`, `Merge3`) cambiados de `combineAll` a `append`. El flow ahora completa hasta `Cerrar Trace`.

**Lección operativa:** **siempre default `append`**. El `combineAll` es trampa heredada de specs que no entendían el comportamiento del nodo.

[[n8n-workflow-build-script]] — patrón para automatizar la verificación del modo Merge en builds.
[[n8n-workflow-audit]] — checklist de revisión que debería incluir "verificar modo de cada Merge node".
