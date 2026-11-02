---
name: orden-visual-que-decide-el-motor
description: Usar cuando un campo que el cliente puede cambiar como algo cosmético (arrastrar columnas, reordenar una lista) es leído por el motor como regla de negocio (el analista solo mueve a posiciones mayores, un estado reservado es barrera), y el resultado es un comportamiento que "no anda" sin ningún error. Trae cómo encontrarlo comparando la tasa contra otro negocio y llamando a la función real que calcula las opciones, la prueba en memoria antes de tocar, la corrección con re-análisis (ignorar el cursor, modo solo-estado) y la prevención. Se dispara con "el bot casi no mueve contactos", "todo se queda en Nuevo", "el modelo no entiende", "un cliente reordenó las columnas".
---

# Skill: El orden visual que decide el motor

## Cuándo usar esta skill

- Un negocio tiene una **tasa de acciones muy baja** (casi no se mueven estados, casi no se etiqueta) frente a otro negocio con la misma configuración base.
- El modelo contesta «sin cambio» o «no corresponde» y la tentación es culpar al prompt.
- Hay un campo de **orden** (`position`, `order`, `sort_index`) editable por el cliente arrastrando, y un motor que lo **lee**.
- Un campo se documenta como «solo orden» o «solo cosmético» y alguien lo usa de regla.
- Cross-project: cualquier producto donde el cliente configura listas, etapas, columnas o prioridades y un proceso automático las interpreta.

## Por qué existe esta skill

Capturada el 2026-11-02 en un CRM con un analista que mueve contactos entre estados leyendo la conversación.

En Configuración › Estados el cliente **ordena las columnas arrastrando**. El código decía que `position` «es solo orden». Pero el motor del analista:

- **solo mueve hacia posiciones mayores** (nunca retrocede un contacto);
- trata un **estado reservado al equipo como barrera** (no lo cruza).

Un cliente arrastró sus columnas. Desde «Nuevo», la única posición mayor alcanzable antes de la barrera era «Cliente». **Sin ningún error**, el analista no tenía opciones razonables y contestaba «sin cambio».

Medido:

| | Contactos en «Nuevo» | Análisis que movían un estado |
|---|---|---|
| Negocio con el orden arrastrado | 606 | **2 de 210** (1 %) |
| Negocio con el orden normal | — | **174 de 882** (20 %) |

> Idea central: **cuando dos cosas leen el mismo campo con significados distintos, el sistema se rompe en silencio.** La pantalla lo lee como cosmética; el motor, como regla.

## Proceso

### 1. Comparar la tasa contra otro negocio

Si un negocio rinde una fracción de otro con la misma lógica, la causa casi nunca es el modelo: es **lo que ese negocio tiene configurado distinto**. Tasa de acciones por análisis, por negocio, mismo período:

```sql
select agency_id,
       count(*)                                         as analisis,
       count(*) filter (where cambio_estado is not null) as movieron,
       round(100.0 * count(*) filter (where cambio_estado is not null) / count(*), 1) as pct
from analisis_mensajes
where created_at > now() - interval '30 days'
group by 1
order by pct;
```

Un 1 % contra un 20 % no es ruido: es una causa.

### 2. Matar el reflejo: «el modelo no entiende»

Primera pregunta: **¿qué opciones le ofrece el sistema al modelo?** El modelo no ve la base: ve lo que el código le arma. Si la lista de opciones está vacía o tiene una sola salida, «sin cambio» es la respuesta **correcta**.

### 3. Llamar a la función REAL que calcula las opciones

No reimaginar la regla: **ejecutar la misma función** que el motor usa para armar las opciones de cada negocio, con los datos reales de ese negocio, y mirar la salida.

```ts
// Script de diagnóstico: las opciones que ve el analista, por estado de partida.
for (const estado of estadosDelNegocio) {
  const opciones = opcionesDeMovimiento(estado, estadosDelNegocio); // la función del motor
  console.log(estado.nombre, '→', opciones.map(o => o.nombre));
}
```

Con el orden arrastrado, «Nuevo» salía con **una sola opción**. Con el orden normal, con varias. Ahí está el hallazgo, sin haber tocado un prompt.

### 4. Probar la corrección en memoria, antes de tocar la base

Con el **orden natural** (el que el cliente esperaba) y **conversaciones reales** del negocio, correr el analista en memoria, sin escribir nada:

- Resultado medido: **9 de 12** pasaban al estado correcto.

Sirve de piso: si la corrección no mueve nada en memoria, no es la causa. Si mueve, se sabe cuánto esperar.

### 5. Corregir: reordenar y volver a analizar

Dos pasos:

1. **Ordenar** los estados al orden natural (con OK del cliente: es su configuración).
2. **Volver a analizar** las conversaciones que se analizaron con las opciones rotas.

Aquí aparece el segundo problema: el **cursor** del analista dice «ya analizado hasta el mensaje N», así que el re-análisis **omitía todas** las conversaciones. Hicieron falta:

- `ignorarCursor`: un parámetro explícito para forzar el análisis aunque el cursor diga que ya se hizo.
- `--solo-estado`: un modo que **solo escribe el estado**. Lo demás (etiquetas, datos, notas) ya estaba escrito, y volver a escribirlo **duplicaría una nota**.

Resultado medido: **405 analizados, 0 fallados, US$1,72.** «Nuevo» bajó de **606 a 410**.

Antes de correrlo, aplicar lo de `dependencia-secundaria-que-cae-en-silencio` paso 5: listar qué dispara mover un estado y revisar los contactos tocados por personas.

### 6. Prevención: el contrato escondido

Un campo que el cliente cambia como **cosmético** y un motor que lo lee como **regla** son un **contrato escondido**. Hay dos salidas, y una de las dos es obligatoria:

- **Avisar en la pantalla, en vivo**, con una función que **reutilice la misma regla del motor** («con este orden, desde “Nuevo” solo se puede llegar a “Cliente”»). Si la advertencia usa una regla copiada, tarde o temprano diverge.
- **O que el motor deje de depender de eso:** una columna aparte para el orden de proceso (`flujo_orden`) y que `position` sea de verdad solo visual.

## Output esperado

- La comparación de tasas entre negocios y la salida de la función real de opciones.
- La prueba en memoria con conversaciones reales (aciertos sobre total).
- El script de re-análisis con `ignorarCursor` y `--solo-estado`, con costo medido.
- La prevención elegida (aviso en pantalla con la regla del motor, o desacoplar el campo).

## Errores que ya cometimos

1. **Documentar `position` como «solo orden»** mientras el motor lo leía como regla.
2. **Sospechar del prompt** antes de mirar qué opciones recibía el modelo.
3. **Re-analizar sin tocar el cursor:** se omitían todas las conversaciones sin dar error.
4. **Re-analizar escribiendo todo:** una nota se habría duplicado; el modo `--solo-estado` existe por eso.

## Ejemplo

**Input:** «Un negocio casi no tiene contactos que avancen; 606 se quedan en “Nuevo”.»

**Output:**
- Tasa de movimiento: 2 de 210 contra 174 de 882 en otro negocio.
- La función real de opciones: desde «Nuevo», una sola salida («Cliente») por el orden arrastrado.
- Prueba en memoria con el orden natural: 9 de 12 correctos.
- Se reordena, se re-analiza con `ignorarCursor` y `--solo-estado`: 405 analizados, 0 fallados, US$1,72; «Nuevo» de 606 a 410.
- Se agrega el aviso en Configuración › Estados con la regla del motor.

## Relacionado

- `dependencia-secundaria-que-cae-en-silencio`: el otro motivo por el que «el analista no hace su trabajo», y la recuperación de lo no procesado.
- `opciones-del-modelo-con-significado`: lo que el modelo recibe como opciones es parte de la interfaz.
- `config-que-deja-el-sistema-mudo`: una configuración guardable que vuelve imposible el caso feliz.
- `config-por-tenant-no-literal-en-el-flujo`: lo que parece configuración y no lo es.
