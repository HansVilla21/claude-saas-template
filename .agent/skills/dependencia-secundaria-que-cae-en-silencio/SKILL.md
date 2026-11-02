---
name: dependencia-secundaria-que-cae-en-silencio
description: Usar cuando un sistema tiene un camino principal sano y procesos secundarios que dependen de OTRO proveedor (analista de mensajes, transcripción de audios, lectura de fotos o PDF, respaldo del modelo), y uno de esos proveedores se cae sin que ninguna alerta salte porque el vigilante miraba el camino principal. Trae el inventario por proveedor, la primera consulta de diagnóstico, el diseño de la alerta por proceso (ventana, umbral, "sin datos" que no cambia el estado, motivo guardado) y la recuperación de lo que quedó sin procesar. Se dispara con "el bot no pone etiquetas ni estados", "los clientes avisaron antes que nosotros", "se acabó el crédito de X", "429 insufficient_quota", "falla un proceso pero el bot contesta".
---

# Skill: La dependencia secundaria que cae en silencio

## Cuándo usar esta skill

- El producto principal anda (el bot contesta), pero **algo que corre al lado dejó de hacer su trabajo**: no mueve estados, no etiqueta, no transcribe, no lee la foto.
- El que se dio cuenta fue **el cliente**, no el sistema.
- Ese proceso secundario usa **otro proveedor** (otra cuenta, otro saldo, otra cuota) que el camino principal.
- Ya existe un vigilante con alertas, pero **mira los turnos / las respuestas del camino principal**.
- Se acaba de arreglar una caída y falta recuperar lo que quedó sin procesar.
- Cross-project: cualquier sistema con un modelo principal y procesos auxiliares de IA, OCR, correo, pagos o mapas.

## Por qué existe esta skill

Capturada el 2026-11-02 en un CRM con bot de WhatsApp. El bot conversa con un proveedor (Claude). Pero cuelgan de **otro** proveedor (OpenAI):

| Qué cuelga | Para qué |
|---|---|
| El analista de cada mensaje | Mueve estados, pone etiquetas, escribe datos del contacto |
| La transcripción de audios | El bot "oye" las notas de voz |
| La lectura de fotos | Descripción de lo que manda el cliente |
| La lectura de PDF | Resumen de estudios, comprobantes |
| El respaldo del bot | Contesta si el proveedor principal falla |

Se acabó el crédito de OpenAI (`429 insufficient_quota`, código `credit_balance_exhausted`). Medido:

- **4 días** con **848 de 848** análisis fallados, en **288 conversaciones** de **4 negocios**.
- Lo avisaron los clientes: «el bot no pone etiquetas ni estados».
- El bot **siguió contestando** todo ese tiempo.

### Por qué nadie lo vio

1. **El vigilante miraba lo que no se cayó.** Había alertas, pero sobre los turnos del bot. Con el principal sano, ningún turno aparecía como fallado.
2. **El respaldo daba una falsa sensación de redundancia.** Vivía en la **misma cuenta** que lo caído: estaba muerto sin que hiciera falta usarlo. El sistema parecía tener dos caminos y tenía uno, más un adorno.
3. **El registro del fallo no decía por qué.** Guardaba solo `modelo_http`; el motivo real (la cuota) estaba únicamente en los logs de la plataforma, que nadie abre salvo que ya sospeche.

> Idea central: **un sistema no está sano porque su camino principal lo esté.** Cada proceso secundario tiene su proveedor, su saldo y su modo de caer, y necesita su propia señal.

## Proceso

### 1. Inventariar qué cuelga de cada proveedor

Una tabla, antes de tocar nada. Una fila por proveedor, una columna por proceso:

| Proveedor | Procesos que dependen | ¿Tiene señal propia? | ¿Respaldo en otra cuenta? |
|---|---|---|---|
| (principal) | conversación | sí | ? |
| (secundario) | analista, audios, fotos, PDF, respaldo | **no** | **no, misma cuenta** |

Dos preguntas que destapan lo escondido:

- **¿Qué deja de funcionar si este proveedor se cae por completo?** Se enumera por proceso, no por «el bot».
- **¿El respaldo comparte cuenta, saldo o llave con lo que respalda?** Si sí, no es redundancia.

### 2. Primera consulta de diagnóstico: antes de tocar prompts

Cuando un cliente dice «no hace X», **no se abre el prompt**. Se mira la tabla del proceso, agrupada por día:

```sql
select date_trunc('day', created_at) as dia,
       estado,
       error,
       count(*)
from analisis_mensajes   -- la tabla del proceso que "no hace X"
where created_at > now() - interval '7 days'
group by 1, 2, 3
order by 1 desc, 4 desc;
```

Lectura: si hasta un día había `ok` y desde ahí **solo** `fallado` con el mismo `error`, no es un problema de calidad del modelo ni del prompt: es una dependencia. Si el campo `error` no dice el motivo, ese es el primer arreglo (paso 3).

### 3. Guardar el motivo real en el registro

El registro del fallo tiene que traer la **causa**, no solo el síntoma:

- Guardar el código y el mensaje del proveedor (`insufficient_quota`, `credit_balance_exhausted`), no solo el estado HTTP.
- Si el error es conocido, **mapearlo a palabras** para la persona que lee la alerta: «OpenAI sin crédito», no `429`.

Si el motivo vive solo en los logs de la plataforma, el diagnóstico depende de que alguien los abra a tiempo. Un motivo en la tabla se puede agrupar, contar y alertar.

### 4. Alerta por proceso, no por camino principal

Una alerta para **cada proceso secundario**, calculada sobre el resultado de ese proceso:

- **Ventana de una hora.** Hay poco tráfico; una ventana de 5 minutos casi nunca tiene muestra.
- **Umbral:** avisar con **3 o más fallados que superen a los buenos** en la ventana. Un fallo suelto no es una caída.
- **«Sin datos» no cambia el estado.** Si en la ventana no hubo ningún intento, el resultado es `null` («no sé»), **no** «ya volvió». De madrugada casi no hay tráfico, y si «cero fallados» se leyera como «sano» saldría un «ya volvió» falso. **Solo un resultado bueno puede decir que volvió.**
- **Guardar el motivo** en el registro de la alerta y **traducirlo** (ver paso 3).
- **Un aviso por caída y uno por vuelta.** Misma disciplina que `vigilar-proveedor-que-no-avisa`.

```ts
// Estado de un proceso en la ventana. null = no sé, no cambia nada.
function estadoProceso(buenos: number, fallados: number): 'caido' | 'sano' | null {
  if (buenos + fallados === 0) return null;      // sin datos: no avisar ni "volvió"
  if (fallados >= 3 && fallados > buenos) return 'caido';
  if (buenos > 0 && fallados === 0) return 'sano'; // solo un resultado bueno lo dice
  return null;
}
```

### 5. Recuperar lo que quedó sin procesar

Antes de escribir el script hay que entender **cómo se pierde** el trabajo:

- El proceso tiene un **cursor** («analizado hasta el mensaje N»). Si el análisis falla, **el cursor no avanza**.
- Consecuencia: las conversaciones que **reciben otro mensaje** se ponen al día solas (el próximo análisis cubre el hueco). Las demás quedan **viejas para siempre**. Hace falta un script.

Orden de la recuperación:

1. **Listar qué dispara mover un estado** antes de correr nada: eventos a Meta, envío a otro CRM, mensajes al cliente, avisos al equipo. Una puesta al día mueve contactos «de golpe» y todo eso se dispara con cada movimiento.
2. **Plan sin aplicar** (modo de ensayo): qué conversaciones, qué cambiaría.
3. **5 de prueba**, aplicadas y **revisadas una por una contra el historial** de la conversación.
4. **El resto, con tope de gasto** y **corte tras 3 fallos seguidos** (si el proveedor sigue caído, el script se frena solo en vez de gastar o fallar 288 veces).

Resultado medido: **279 bien, 0 fallados, US$1,38.**

### 6. Gotcha de la recuperación: revisar lo que tocó una persona

Se corrió la puesta al día **antes** de corregir otro problema de configuración. El analista movió mal un contacto que **el equipo había marcado a mano**: se devolvió a mano.

Regla: **antes de correr una puesta al día masiva, arreglá lo demás, y después revisá los contactos cuyo estado o etiqueta puso una persona.** Un proceso automático que se ejecuta con retraso decide sobre una foto vieja y puede pisar una decisión humana más nueva.

## Output esperado

- La tabla de inventario proveedor × proceso, guardada en el repo del proyecto.
- Una alerta por proceso secundario, con ventana, umbral, `null` para «sin datos» y el motivo traducido.
- El motivo real guardado en el registro del fallo.
- El script de recuperación con ensayo, 5 de prueba y tope de gasto.
- Un reporte corto: cuánto duró, cuántos afectados, cuántos recuperados y cuánto costó.

## Errores que ya cometimos

1. **Vigilar solo el camino principal.** Ningún turno falló, así que ninguna alerta saltó, durante 4 días.
2. **Creer que el respaldo era redundancia.** Compartía cuenta con lo caído.
3. **Guardar solo `modelo_http`.** El motivo real quedó en logs que nadie abrió.
4. **Sospechar del prompt primero.** El reflejo «el modelo no entiende» hace perder horas; la primera consulta es la agrupación por día y error.
5. **Correr la puesta al día con otro problema abierto.** Movió mal un contacto marcado por el equipo.

## Ejemplo

**Input:** «El bot no pone etiquetas ni estados desde hace unos días, pero contesta bien.»

**Output:**
- `group by dia, estado, error` sobre la tabla del analista: desde un día exacto, solo `fallado`, todos con la misma cuota agotada del segundo proveedor.
- Inventario: ese proveedor también sostiene audios, fotos, PDF y el respaldo.
- Se repone el crédito, se agrega la alerta por proceso, se guarda el motivo y se corre la puesta al día: 279 bien, US$1,38.

## Relacionado

- `vigilancia-cruzada-dos-testigos`: vigila lo que se cae **entero**. Esta skill cubre lo que se cae **por partes**, con el camino principal sano.
- `vigilar-proveedor-que-no-avisa`: la máquina de estados (dos fallas seguidas, un aviso por caída y por vuelta) que se reusa acá por proceso.
- `distinguir-detenido-a-proposito-de-roto`: para no contar como caída lo que se detuvo a propósito.
- `orden-visual-que-decide-el-motor`: el otro caso de «el analista no hace su trabajo», con causa de configuración.
