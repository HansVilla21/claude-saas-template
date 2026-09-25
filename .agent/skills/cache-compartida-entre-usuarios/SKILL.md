# Skill: Caché de prompts compartida entre usuarios

Un producto con IA manda en cada llamada el mismo prompt largo (las instrucciones
del negocio) más algo de cada usuario (su nombre, su etapa, su estado). La caché
de prompts del proveedor debería cobrar ese prompt largo casi gratis a partir de
la segunda llamada, pero **solo acierta si el texto es idéntico desde el principio
hasta la marca de caché**. Si el dato del usuario va adentro, en el medio o antes
de la marca, cada usuario tiene su propia caché y entre usuarios distintos la caché
es **0 %**. No hay error ni aviso: solo un costo por llamada muy por encima de lo
que dio la prueba.

Caso real (2026-09-25, un bot de WhatsApp de un cliente con Claude Sonnet 5): la
prueba simulada daba un costo parecido al de gpt-4.1. En tráfico real salió **2,6×
más caro** (US$0,0324 contra 0,0124 por respuesta, con 30 % de caché). El reflejo
fue "la caché de 5 minutos se vence, subila a 1 hora". Medido, la causa era otra:

| Turno anterior | Caché |
|---|---|
| mismo usuario, a menos de 5 min | 69 % |
| mismo usuario, entre 5 y 60 min | 0 % |
| **otro usuario, a menos de 5 min** | **0 %** |
| otro usuario, entre 5 y 60 min | 0 % |

Un usuario distinto a menos de 5 minutos tenía 0 %. La duración de la caché no
tenía nada que ver: el prompt viajaba como UN bloque marcado al final, y adentro
iba el bloque de decisiones con el nombre y la etapa del usuario. Con la caché de
1 hora sola casi no habría ganado nada.

Después del arreglo, dos usuarios distintos seguidos: el segundo leyó **13.639 de
16.592 tokens de la caché (82 %)** y costó **US$0,0126 contra 0,0645** del primero.
En producción, lo mismo: 82 %, US$0,0124.

## Cuándo usar esta skill

- El costo por llamada de un LLM en producción es bastante mayor que el de la
  prueba, o el porcentaje de caché es bajo (menos de ~60 % con un prompt de
  sistema largo).
- Vas a pasar un producto a un modelo con caché **explícita** (Claude: se marca a
  mano con `cache_control`) o vas a elegir la duración de la caché.
- El prompt de sistema mezcla instrucciones fijas con datos de cada usuario o de
  cada llamada (nombre, estado, etapa, fecha, hora, país).
- Alguien propone "subir la caché a 1 hora" como arreglo de costo, y todavía nadie
  midió si la caché se comparte entre usuarios.

## Regla madre

**Lo que es igual para todos va primero y se marca. Lo de cada usuario va después
y no se marca.** Y el arreglo NO cambia el texto que lee el modelo: solo cambia
dónde va la marca. Reordenar el prompt para cachear más cambia el comportamiento y
se prueba aparte, como cualquier cambio de prompt.

## Proceso

### 1. Medir si la caché se comparte entre usuarios (antes de tocar nada)

Por cada llamada real, mirá la anterior (de cualquier usuario) y agrupá por **mismo
usuario / otro usuario** × **a cuánto tiempo**. Con una tabla de llamadas que guarde
tokens de entrada y leídos de caché:

```sql
with t as (
  select created_at, user_id, tokens_in, tokens_cached,
         lag(created_at) over (order by created_at) as prev_at,
         lag(user_id)    over (order by created_at) as prev_user
  from llm_calls
  where tenant_id = $1 and model = $2 and created_at >= $3   -- desde el cambio, en UTC
)
select case when prev_user = user_id then 'mismo usuario' else 'otro usuario' end as quien,
       case when created_at - prev_at < interval '5 min'  then '< 5 min'
            when created_at - prev_at < interval '60 min' then '5-60 min'
            else '> 60 min' end as hace,
       count(*) as n,
       round(100.0 * sum(tokens_cached) / nullif(sum(tokens_in), 0)) as cache_pct
from t where prev_at is not null
group by 1, 2 order by 1, 2;
```

Cómo leerla:

- **"Otro usuario, < 5 min" en 0 %**: la caché no se comparte. Es esta skill. Seguí al paso 2.
- **"Otro usuario, < 5 min" alto y "5-60 min" en 0 %**: la caché sí se comparte y el
  problema es la duración. Andá directo al paso 4.
- **Todo en 0 %**: puede que el prompt cambie en CADA llamada (una hora al minuto,
  un id) o que esté por debajo del mínimo cacheable (ver Gotchas).

⚠️ El "desde" tiene que ser la hora real del cambio, en UTC. En el caso real el
cambio de modelo quedó anotado 3 horas antes de lo que fue (una conversión de zona
mal hecha), y la primera medición mezcló turnos del modelo anterior.

### 2. Encontrar qué parte del prompt varía por usuario

Recorré cómo se arma el prompt de sistema, bloque por bloque, y marcá cuál depende
del usuario o de la llamada:

- **Datos del usuario:** nombre, etapa, estado, "ya se le pasó a una persona",
  avisos que solo aplican a él.
- **Placeholders resueltos adentro de texto fijo:** país y trato según el
  teléfono, saludo según la hora, fecha, hora. Cada valor distinto es otra entrada
  de caché. País: pocas variantes y está bien. Hora al minuto: rompe la caché cada
  minuto, así que hay que mover el placeholder al final.
- **Cosas que parecen fijas y no lo son:** listas que se leen de la base en cada
  llamada y cambian de orden, herramientas que se declaran distinto según el turno.

El resultado es un número: **hasta qué carácter el prompt es igual para todos**. En
el caso real era todo lo anterior al bloque de decisiones, el ~82 % del sistema.

### 3. Partir sin cambiar el texto

Que el armador del prompt devuelva, además del texto, el largo de la parte fija. El
cliente del modelo parte ahí:

```ts
// El armador: todo lo anterior al primer bloque que varía por usuario.
const largoFijo = partes.join('\n\n').length; // justo antes de agregar lo del usuario
return { texto: partes.join('\n\n'), largoFijo };

// El cliente de Claude.
function sistemaEnBloques(system: string, cacheHasta?: number | null): Anthropic.TextBlockParam[] {
  const h = typeof cacheHasta === 'number' && Number.isInteger(cacheHasta) ? cacheHasta : 0;
  const fijo = system.slice(0, h);
  const resto = system.slice(h);
  if (h > 0 && fijo.trim() && resto.trim()) {
    return [
      { type: 'text', text: fijo, cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: resto }, // lo del usuario, sin marca
    ];
  }
  // Sin corte: como antes, un bloque con la caché de 5 min.
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

// En el pedido: con el sistema partido, además la caché automática (5 min) sobre lo
// último, que cubre lo del usuario y el historial si el mismo usuario vuelve enseguida.
const sistema = sistemaEnBloques(system, cacheHasta);
const pedido = {
  system: sistema,
  ...(sistema.length > 1 ? { cache_control: { type: 'ephemeral' } } : {}),
  // ...
};
```

Decisiones que importan:

- **El corte viaja con el mensaje de sistema** (un campo `cacheHasta`), no se
  adivina en el cliente. El cliente de OpenAI tiene que sacar ese campo antes de
  mandar: OpenAI rechaza campos que no conoce.
- **Sin corte, todo queda como antes.** Otros usos del mismo cliente (un
  seguimiento, un resumen) no tienen quién relea la caché: pagarían la escritura
  de 1 hora (2×) por nada.
- **La caché automática va después de la de 1 hora.** La API exige que las de más
  duración vayan primero.

### 4. Elegir la duración con la distribución real

Precios de Claude (página oficial, 2026-09-25): escribir en la caché de 5 min cuesta
**1,25×** la entrada; en la de 1 hora, **2×**; leer, **0,1×** (0,05× en Opus 5.5). Cada
lectura renueva la caché sin costo. La de 1 hora se paga sola a partir de la segunda
lectura.

Con el paso 1, contá cuántas llamadas llegan a menos de 5 min y a menos de 60 min de
la anterior, de CUALQUIER usuario, ahora que la caché se comparte. En el caso real
eran 15 de 33 dentro de los 5 min y 28 de 33 dentro de la hora. Con 1 hora quedaban
~5 escrituras frías (US$0,065) y 28 lecturas (~US$0,013), o sea **~US$0,020 por
respuesta (−37 %)**. Con 5 min, 18 frías y 15 lecturas daban ~US$0,030.

Decilo con el número completo: la primera llamada después de una hora sin tráfico
cuesta MÁS que antes (2× en vez de 1,25×). Lo que baja es el promedio.

### 5. Cobrar bien la escritura de 1 hora

La respuesta de Claude trae `usage.cache_creation_input_tokens` (todo lo escrito) y
`usage.cache_creation.ephemeral_1h_input_tokens` (la parte de 1 hora). Guardá los dos
y cobrá cada uno a su precio. Si tu cálculo de costo cobra toda la escritura a 1,25×,
el costo por llamada sale **subcontado** justo después de este cambio, y la medición
del paso 6 te miente a favor.

### 6. Verificar con dos usuarios distintos, contra la API real

1. **Pruebas sin red:**
   - dos usuarios del mismo negocio tienen la MISMA parte fija;
   - control: el prompt completo SÍ es distinto (si no, la prueba no discrimina);
   - la unión de los bloques es exactamente el texto original;
   - sin corte, un bloque como antes.
2. **Control de mutación:** mové el corte a después del bloque del usuario y
   confirmá que la prueba de "misma parte fija" falla.
3. **Contra la API, por el camino real** (el motor completo, no una llamada
   suelta): usuario A y enseguida usuario B, con distinto nombre. B tiene que leer
   de la caché aproximadamente el tamaño de la parte fija. Antes del cambio, el
   mismo experimento da 0 %.
4. **En producción, después del deploy:** una llamada de prueba tiene que leer la
   entrada que escribió el paso 3. Ojo con el gotcha del número de prueba (abajo).
5. **Con tráfico real, 2-3 días:** repetí la tabla del paso 1. "Otro usuario" tiene
   que dejar de estar en 0 %.

## Output esperado

- La tabla del paso 1 antes y después, con la hora real del cambio.
- El armador devuelve `largoFijo`; el cliente parte el sistema y el texto que lee el
  modelo no cambia (prueba de que la unión es el original).
- El costo cobra la escritura de 1 hora a su precio.
- Los números de la verificación: tokens leídos de caché por el segundo usuario y el
  costo de la primera llamada fría contra una caliente.

## Ejemplo

**Input:**
"Pasamos el bot a Claude, la prueba daba lo mismo que antes y en producción cuesta
2,6 veces más, con 30 % de caché. Subamos la caché a 1 hora."

**Output:**
1. Tabla del paso 1: otro usuario a menos de 5 min, 0 %. Conclusión: no es la
   duración, es que la caché no se comparte.
2. El bloque de decisiones trae nombre y etapa del usuario y va antes de la marca.
   Parte fija: todo lo anterior a él (~13,6 mil de 16,6 mil tokens).
3. `largoFijo` en el armador y `sistemaEnBloques` en el cliente: 1 hora en lo fijo,
   nada en lo del usuario, caché automática de 5 min para el historial.
4. Verificación: el segundo usuario lee 82 % (US$0,0126 contra 0,0645). En
   producción, 82 % y US$0,0124.
5. Con la distribución real, 1 hora conviene (28 de 33 llamadas dentro de la
   hora): ~US$0,020 esperado. Queda medir 2-3 días.

## Gotchas

1. **La simulación miente a favor.** Un simulador manda las llamadas de un mismo
   usuario una detrás de otra, así que la caché del usuario siempre está caliente
   (en el caso real, ~92 % en la prueba contra 30 % en producción). En producción
   los mensajes llegan espaciados y de usuarios distintos. Antes de confiar en un
   costo simulado, mirá el paso 1 con tráfico real.
2. **No reordenes el prompt para cachear más** sin volver a probar el
   comportamiento. En el caso real, las reglas finales del negocio van últimas a
   propósito (lo que se lee al final gana), y un aviso que se movió lejos de donde
   se decide se ignoraba 1 de cada 5 veces. El arreglo de esta skill deja el texto
   byte a byte igual. Una prueba lo garantiza: la unión de los bloques es el original.
3. **El número de prueba sin país.** La verificación en producción dio 0 % la
   primera vez: el número de prueba no tenía prefijo, el placeholder de país valía
   "sin dato" y eso es otra entrada de caché. Parecía que el arreglo no funcionaba.
   Con un número de Costa Rica leyó el 82 %.
4. **Mínimo cacheable.** Por debajo de un largo mínimo, la API NO cachea y no avisa
   (doc de Claude al 2026-09-25: Sonnet 1.024 tokens, Haiku 4.5 4.096, Opus 512). Una
   parte fija chica se procesa entera en cada llamada.
5. **Límites de las marcas:** hasta 4 por pedido, las de 1 hora antes que las de 5
   min, y la búsqueda hacia atrás mira 20 bloques. Cambiar el razonamiento o el
   esfuerzo del modelo invalida la caché: no los cambies por llamada.
6. **OpenAI también cachea por prefijo**, solo que en automático. El principio es el
   mismo: lo fijo primero. Si el costo con OpenAI también parece alto, la tabla del
   paso 1 sirve igual (sus llamadas guardan tokens cacheados). No se midió en el
   caso real.
7. **El dato de 1 hora en el costo** (paso 5). Sin separarlo, el costo de las
   llamadas frías sale bajo y la comparación antes/después queda sesgada.

## Relacionadas

- `verificar-funcionamiento-end-to-end`: "la API aceptó el pedido" no es "la caché
  se comparte". Se verifica con dos usuarios y el número de tokens leídos.
- `probar-motor-ia-fuera-de-la-app`: el experimento de dos usuarios corre el motor
  real desde un script, sin la app.
