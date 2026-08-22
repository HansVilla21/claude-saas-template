# Skill: Valor derivado sin inventar — estado "pendiente de configurar"

## Cuándo usar esta skill

- Un valor (comisión, precio, descuento, impuesto) se **calcula desde una tabla de configuración** que el cliente edita self-service.
- A veces **el hecho llega antes que la config**: se registra una venta de un producto cuya tabla de comisión todavía no existe.
- Estás por poner un **fallback** ("si no hay config, usá el valor viejo/global"). Pará y leé esto.

**Costo de no usarla:** un fallback silencioso calcula una comisión con un número que nadie eligió, y el cliente paga mal sin enterarse. En el CRM de Josué (JRM-52), la decisión fue explícita: **sin fallback**.

---

## La regla: NO inventes el número. Registrá el hecho, marcá el valor pendiente, avisá.

## Proceso

1. **La tasa/valor vive en (config × dimensión)**, no en la persona. Ej: la comisión vive en `(producto × rol)`, no en `profiles.rate`. El mismo closer cobra distinto según qué colocó.
2. **El hecho se registra igual.** La venta entra. Lo que queda pendiente es el valor derivado, no el hecho.
3. **Estado `pendiente_config`** en la fila del valor (comisión): `status='pendiente_config'`, monto en NULL. Las columnas del número pasan a **nullable** (una pendiente no tiene números) + backfill de las existentes a `'ok'`.
4. **Alerta visible** al admin, agrupada por lo que falta configurar, con **link directo** a donde se configura ("Renta Fija: 2 comisiones sin configurar → Configurar").
5. **Resolver al configurar:** cuando el admin carga/edita la tabla, un `resolver<Valor>Pendientes(configId)` toma las `pendiente_config` de ese config, las calcula y **recién ahí las congela**. Es el ÚNICO momento en que guardar la config toca los valores — y solo las que nunca se congelaron.
6. **Congelamiento (snapshot):** al momento del hecho se copian `rate` + `amount` + `commission_type`. Editar la config **NO** toca lo ya congelado. Recalcular por corrección del monto base toca **solo los `percent`** (un monto fijo no depende del monto de la venta).

## Gotchas

| Gotcha | Fix |
|---|---|
| Reflejo de poner un fallback | No. Fallback = número que nadie eligió. Va `pendiente_config` + alerta. |
| Las columnas del número son NOT NULL | Pasan a nullable (la pendiente no tiene número). Backfill de las viejas a `commission_type='percent'`, `status='ok'`. |
| "Editar la tabla recalcula todo" | No: el resolver solo toca `pendiente_config`. Lo `ok` queda congelado (criterio de aceptación). |
| Recalcular por cambio de monto pisa el fijo | Solo recalcular `percent`; el `fixed` no depende del monto. |
| Sumar `pendiente_config` en los totales | Da NaN (monto null). Filtralas de los totales por persona/producto. |

## Output esperado

- Tabla de config (`<entidad>_commission_rules` o equivalente) con `commission_type` (percent|fixed) + `value`, editable self-service (admin).
- Tabla de valores congelados con `status` + columnas nullable.
- `generar<Valor>` usa la config; si falta → `pendiente_config`. `resolver<Valor>Pendientes` al guardar la config.
- Panel con alerta de pendientes + link a configurar.
- Test end-to-end (con cleanup): calcula desde config, monto fijo, pendiente→resolver, congelamiento, cascade.

## Ejemplo

**Input:** "cada producto que tenga su tabla de comisiones; que yo la inscriba, no vos."

**Output:** `product_commission_rules(product_id, role, commission_type, value)`, tarjeta editable en el producto, `generarComisiones` que congela desde la tabla o deja `pendiente_config` + alerta, `resolverComisionesPendientes` al guardar. `test:comisiones` 13/13 (incluye "editar la tabla NO cambia lo congelado").

## Relacionado

- [[datos-reales-vs-seed-demo]] — misma filosofía: derivar de la fuente, no inventar/sembrar.
- [[demo-con-datos-falsos]] — nunca un número que finge ser real.
