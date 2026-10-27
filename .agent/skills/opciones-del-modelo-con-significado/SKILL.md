# Skill: La opción que el modelo elige por el nombre (listas cerradas con significado)

## Cuándo usar esta skill

- Un modelo devuelve una opción de una **lista cerrada** —motivo de un pase a una persona, categoría, intención, etapa— con salida estructurada (`enum` en el esquema), y **una persona lee esa opción**.
- La etiqueta que ve el equipo **no cuadra con lo que pasó**: el bot aplicó una regla del negocio y el inbox dice *"El bot se atascó"*.
- Vas a sumar un comportamiento nuevo al bot y **no hay opción** que lo describa.
- Revisás los prompts o reglas que cada cliente cargó y **nombran valores de la lista**.
- Un texto que genera el sistema muestra el **valor crudo** (`Motivo: scheduling`).

## Por qué existe esta skill

Capturada el 2026-09-22 en un CRM multi-tenant con bot de WhatsApp. El bot pasaba bien las conversaciones a una persona, pero con el motivo equivocado, y el equipo decide a quién atender primero leyendo ese motivo. Medido en 30 días de pruebas:

| Lo que pasó | Lo que leía el equipo |
|---|---|
| Un paciente manda un estudio médico, y la regla del negocio es que los revisa el profesional | "El bot se atascó" (17 veces) |
| Una alarma médica | "Lead calificado" |
| Un "caso VIP" por monto, sin que nadie pidiera hablar con alguien | "Lo pidió el cliente" |
| 8 pases en que el modelo no eligió motivo | "El bot se atascó" (el valor por defecto) |

Y la campanita del equipo decía **"Motivo: scheduling"**, el enum crudo en inglés, en 258 avisos.

No era una causa, eran **tres apiladas**, y arreglar una sola no alcanzaba:

1. **No había opción** para "una regla del negocio manda este caso a una persona". El modelo elegía la más parecida.
2. **Nunca se le explicó qué significa cada opción.** Elegía por el nombre: un estudio que no sabe interpretar *suena* a `no_se_como_seguir`.
3. **Los clientes habían cementado el parche en su propia config.** Como no había opción mejor, dos negocios tenían escrito en su prompt *"estudio o foto → no_se_como_seguir"*. El modelo obedece la instrucción explícita del prompt por encima de cualquier explicación genérica.

Arreglando solo el código (opción nueva + explicaciones): **9 de 15**. Sumando la config de los clientes: **18 de 18**.

> La idea central: **una lista cerrada que lee una persona es parte de la interfaz, no un detalle del esquema.** Cada opción necesita un significado escrito para el modelo, una etiqueta para la persona, y tiene que haber una opción para cada razón real, o el modelo va a mentir con la más parecida.

## Proceso

### 1. Medir qué eligió el modelo contra lo que pasó

Antes de tocar nada, cruzá la opción elegida con el texto libre que la acompaña (el resumen, la lectura del turno). Es el único lugar donde se ve la razón real:

```sql
select negocio, motivo_elegido, count(*), left(max(resumen), 140) ejemplo
from decisiones_del_bot
where paso_a_una_persona and fecha > now() - interval '30 days'
group by 1, 2 order by 1, 3 desc;
```

Buscá **opciones que se usan para cosas que no son**, y **decisiones sin opción** (el modelo decidió actuar pero la opción dice "ninguno"): esas te dicen qué opción falta.

### 2. Buscar el parche cementado en la config de cada cliente

```sql
select slug,
  (length(config::text) - length(replace(config::text, 'no_se_como_seguir', ''))) / 17 menciones
from agencias where config::text ~ '(no_se_como_seguir|pidio_una_persona|listo_para_agendar)';
```

Si un cliente nombra un valor en su prompt, **el modelo lo va a obedecer** aunque el código explique otra cosa. Leé cada línea: cambiá las que son el caso nuevo y **dejá las que de verdad son ese valor** (de 4 líneas de un cliente, 3 eran reglas del negocio y 1 era genuinamente "no se le entiende").

### 3. Una opción para cada razón real

En multi-tenant, la opción que casi siempre falta es la genérica **"lo manda una regla del negocio"** (`regla_del_negocio`). Lo específico —qué regla, qué caso— va en el texto libre, que ya existe. No inventes una opción por cliente.

### 4. Explicar cada opción, en el prompt y en el esquema

```ts
export const SIGNIFICADO_DEL_MOTIVO = {
  listo_para_agendar: 'si quiere agendar, comprar o reservar y ese paso lo cierra una persona',
  pidio_una_persona: 'si el lead PIDIÓ hablar con una persona (solo si lo pidió él)',
  regla_del_negocio: 'si pasás porque una regla del negocio dice que ESE caso lo atiende una persona',
  no_se_como_seguir: 'si pasás por algo que no entra en ninguno de los motivos anteriores (casi nunca)',
};
```

El texto explica **cuál etiqueta**, no **cuándo actuar**. La decisión de actuar vive en otro lado (las reglas). Si la explicación de una opción suena a un disparador, el modelo empieza a actuar de más: ver Gotchas.

### 5. La decisión sin opción no es un error

Si el modelo decide actuar y no elige opción, mapealo a lo que **medido** suele ser (acá, 8 de 8 eran reglas del negocio), no al valor de "falla". Y nunca lo dejes sin valor si el que lo recibe rechaza lo desconocido.

### 6. Cada consumidor de la lista, en orden

Una lista cerrada vive en más lugares que el esquema del modelo. En este caso fueron cinco:

| Dónde | Qué pasa si falta el valor nuevo |
|---|---|
| El `enum` de la base | el `update` falla |
| **El validador de otro servicio** (una función con su propio `Set` de valores) | **rechaza el pase y el lead queda sin nadie**, sin error visible |
| Las etiquetas de la UI | muestra el valor crudo |
| El texto que arma un trigger (avisos) | "Motivo: business_rule" |
| El esquema del modelo | el modelo no puede elegirlo |

**Orden de despliegue:** base → validador → código que produce el valor → config de los clientes. Al revés, el productor manda un valor que el validador rechaza.

### 7. Ningún texto para personas con el valor crudo

Si un trigger arma texto (un aviso, un correo), dale una función de etiquetas en la base espejo de la de la UI, con una nota cruzada en las dos. Y corregí lo ya generado: el enum crudo en avisos viejos se reemplaza por la misma etiqueta, no se inventa nada.

### 8. Verificar con el modelo real, antes y después

Un script con casos por cliente, 3 corridas cada uno (el modelo no es determinista), que diga qué opción eligió:

- **Casos que tienen que cambiar** (el estudio, el VIP).
- **Controles que NO tienen que cambiar** (el que pidió una persona sigue en `pidio_una_persona`; la consulta común no pasa).
- Primero con la config propuesta **en memoria** (el turno de prueba acepta la config entera), recién después se guarda, y se vuelve a correr leyendo la base.

## Gotchas

- **El arreglo de código se ve terminado y no lo está.** Con la opción nueva y las explicaciones, el caso VIP ya salía bien y el del estudio no: el prompt del cliente seguía pidiendo el valor viejo. Sin el script por caso, "el código está" parecía "está arreglado".
- **La explicación puede cambiar el comportamiento, no solo la etiqueta.** Describir la última opción como *"si no sabés cómo seguir"* reintroducía una frase que ya se había sacado a propósito, porque hacía que el bot pasara la conversación en el segundo mensaje. La prueba vieja lo atrapó.
- **La prueba que copia la lista a mano no avisa.** Había un test con los valores válidos escritos a mano: una copia no se entera cuando el original cambia. Leé la lista del código del validador y hacé el control negativo (sacá el valor, confirmá que falla).
- **Leé las reglas actuales del cliente antes de fijar lo que "debería" pasar.** El caso de la alarma médica esperaba un pase, y la regla vigente del cliente (cambiada ese mismo día por otra sesión) decía lo contrario. No era una regresión: era la expectativa mal.
- **El bot imita la ortografía de su prompt.** La lista de significados se escribió sin dos puntos, porque el bot de este proyecto no debe usarlos al hablar.
- **`ALTER TYPE ... ADD VALUE`**: el valor nuevo no se puede usar como literal en la misma transacción. La función de etiquetas recibe texto.
- **Cambiar la config de un cliente con sesiones en paralelo:** respaldo antes, `update` condicionado al texto exacto que se reemplaza, y la huella (`md5`) del resto de la config antes y después, para demostrar que solo cambió eso.

## Verificación

- [ ] La distribución de opciones elegidas, medida antes y después.
- [ ] Cero menciones del valor viejo donde era un parche (y las legítimas, conservadas a propósito).
- [ ] Cada consumidor de la lista tiene el valor nuevo; la prueba lee el validador de su código, con control negativo.
- [ ] Desplegado en orden: base, validador, código, config.
- [ ] El script con el modelo real: casos que cambian + controles que no, 3 corridas, con la config guardada.
- [ ] Ningún texto para personas muestra el valor crudo.

## Lo que esta skill NO cubre

- **Cuándo** el bot tiene que actuar (pasar, escalar, etiquetar): eso son las reglas de cada negocio. Esta skill es sobre **con qué etiqueta** lo reporta.
- Listas abiertas (texto libre): ahí el problema es otro, normalizar.

## Ejemplo

**Input:** "El bot le pasa al profesional los estudios médicos, pero en el inbox dice 'El bot se atascó'."

**Output:**

| | Antes | Después |
|---|---|---|
| Estudio médico | `bot_stuck` ("El bot se atascó") 3/3 | `business_rule` ("Regla del negocio") 3/3 |
| Caso VIP | `user_requested` 3/3 | `business_rule` 3/3 |
| Cliente actual con problema de clave | `bot_stuck` | `business_rule` 3/3 |
| Pidió hablar con una persona (control) | `user_requested` | `user_requested` 3/3 |
| Consulta común (control) | no pasa | no pasa 3/3 |
| Aviso del equipo | "Motivo: scheduling" | "Motivo: Quiere agendar" (258 viejos corregidos) |

Opción nueva en la base, el validador y la UI; significado de cada opción en el prompt; tres líneas de config de clientes corregidas y una conservada; 18 de 18 con el modelo real.

## Skills relacionadas

`config-por-tenant-no-literal-en-el-flujo` (lo de un cliente cableado en el flujo de todos; acá es al revés, un límite del sistema cableado en la config del cliente) · `probar-camino-produccion-sin-efectos-externos` (el turno sintético con la config propuesta en memoria) · `probar-migracion-contra-base-viva-con-rollback` (el bloque que siempre aborta para la función de avisos) · `clasificar-por-lista-no-por-fallback` (la otra cara: la rama "todo lo demás" que le habla a alguien).
