# Skill: La API key de IA se pega en Configuración, no en el .env

## Cuándo usar esta skill

- Una feature de IA está **bloqueada esperando la cuenta del cliente** (OpenAI,
  Anthropic, el que sea).
- El producto va a ser **multi-negocio** y cada negocio paga su propio consumo.
- Vas a poner **cualquier API key de un tercero** en un `.env`.
- Vas a construir una tarjeta de "análisis con IA" sobre datos de un cliente.

> Capturada el 2026-07-16 del CRM de Josué R. Miranda. **La idea es del founder**
> y destrabó en un día algo que llevaba semanas esperando una cuenta ajena:
> *"en configuración, podemos dejar un campo donde se pone la API key de OpenAI.
> Con cada nuevo usuario, nada más habría que cambiar esa API key"*.

## Proceso

### 1. Entender por qué el `.env` es el lugar equivocado

Una API key en el `.env` es **por deploy**. Eso te obliga a: esperar la cuenta del
cliente antes de construir, hacer un deploy para cambiarla, y —el día que haya dos
clientes— tener dos deploys. **La key es un dato del negocio, no de la
infraestructura.** Va en la base.

El pago inmediato: el módulo de IA **no lee ni una variable de entorno**, así que
cuando deployás **no hay nada que cargar en el hosting** — la base ya la tiene.

### 2. Contar el material ANTES de construir el análisis

**Esta es la parte que más veces salva y más veces se saltea.** Una tarjeta de IA
sobre datos que no existen no nace vacía: **nace alucinando**. Un modelo con
"Juan Pérez, Gerente" no dice "no sé" — dice algo que suena bien y es inventado.

Contar, y contar bien:
- ¿Cuántos registros tienen **texto de verdad**? (no ids, no etiquetas)
- ¿Ese texto es **del sujeto** o **tuyo**? (ver Gotcha 1)
- ¿El denominador está limpio? (ver Gotcha 2)

Si el material no alcanza → **no lo construyas**, o construí solo el mecanismo de
la key y dejá el análisis para cuando haya con qué.

### 3. Verificar que el título no prometa lo que no hay

Si la tarjeta dice "análisis de la **conversación**" y no hay conversaciones,
cambiá el título — no construyas la mentira. Analizá lo que **sí** existe.

### 4. Guardar la key con el patrón de secretos que ya exista

Columna **fuera del alcance del cliente** (GRANT por columna, no solo RLS) y
**cifrada de verdad** (AES-256-GCM). Lo NO secreto (el modelo, los últimos 4 chars)
va aparte, en un jsonb legible: los últimos 4 son lo que muestra la propia UI del
proveedor para reconocer la key.

**La key NUNCA vuelve al cliente.** Ni para un admin. Para cambiarla se pega una
nueva; no existe un "ver la key".

### 5. Verificar la key CONTRA EL PROVEEDOR antes de guardarla

```
GET /v1/models   (con la key)
```
Sirve para dos cosas a la vez:
- **Probar que funciona.** Una key rota guardada es un tilde verde y una pantalla
  que revienta después, lejos, en la cara del usuario.
- **Elegir el modelo.** Los model IDs **varían por cuenta** y el proveedor los
  retira. La doc de OpenAI lo dice: *"los model IDs válidos se encuentran en la
  respuesta de /v1/models"*. **Hardcodear un modelo es un 404 esperando.**

Lista de preferidos en código → se elige el primero que la cuenta **tenga de
verdad** → si no hay ninguno, se falla AL GUARDAR mostrando qué sí hay.

### 6. Poner la puerta contra el humo

```ts
if (!tieneSustancia(material)) return { estado: "sin_material" };
```
**Antes de llamar** (y antes de pagar). Con nombre y cargo solos, no se llama.

### 7. No generar al pintar la pantalla

Cada análisis **cuesta plata**. Si se genera al abrir la ficha, recorrer 57
registros son 57 llamadas pagas para texto que nadie lee. **Va por clic**, y se
cachea por **hash del material** → se rehace solo si llegó info nueva, no si
alguien recargó. Hashear el **texto final** que ve el modelo, no los campos
sueltos: así, si cambia cómo se arma el prompt, el hash cambia solo.

### 8. Mostrar QUÉ leyó

Un análisis del que no se sabe la entrada es un **oráculo**, y a un oráculo hay que
creerle. "Leyó: titular de LinkedIn · bio (907 caracteres) · 2 respuestas".

## Output esperado

- Tabla de caché: `<entidad>_ai_analysis` con `texto`, `modelo`, **`input_hash`**,
  PK sobre la entidad (uno vigente, no historial).
- `lib/ai/`: `openai.ts` (key + verificación + llamada), `material.ts` (**de dónde
  sale lo que lee**, separado del prompt), `<entidad>-analysis.ts` (prompt + caché).
- Tarjeta en Configuración: pegar la key, ver `sk-…1234` + el modelo, quitarla.
- La feature con **cuatro estados honestos**: `listo` · `sin_generar` ·
  `sin_material` (≠ apagado) · `sin_configurar`.
- Prompt que **prohíbe inventar** y exige marcar lo inferido ("parece", "sugiere").
  `temperature` baja: adornar acá es inventar.

## Gotchas (los que cuestan caro)

**1. ⚠️ El texto más largo puede ser TUYO, no del sujeto.** En Josué, los textos de
254 chars —idénticos en 4 leads— eran **el template de outbound del propio
cliente**. Un "análisis del lead" habría analizado el copy de marketing de quien
lo lee. **Mirá el contenido, no el `count()`.**

**2. ⚠️ El denominador sucio hunde los porcentajes.** "Solo el 22% tiene perfil"
era falso: estaba diluido por 641 registros que **ya no eran leads** desde una
migración anterior, pero cuyos eventos seguían en la tabla. Sobre los que existen:
**98%**. **Contá sobre los registros VIVOS.**

**3. ⚠️ Sospechá de tu propia query antes que de los datos.** "Los prospectos solo
responden `Re:👍`" salió de un `left(body, 60)` **mío**. Las respuestas reales
tenían 193 chars con sustancia. **Casi mato la feature por un truncado propio.**

**4. Los modelos no cuentan palabras.** Un prompt que dice "máximo 90 palabras"
devuelve 98. Una regla que se rompe de rutina le enseña al modelo que las reglas
son negociables — y después se rompen **las que sí importan** (las de no inventar).
Decí "apuntá a 90"; el límite real es `max_tokens`.

**5. Limpiá el ruido del proveedor antes del prompt.** Los webhooks mandan
`"A lead has replied\n Re:<texto>"`. Ese prefijo es de la notificación, no lo
escribió nadie: es ruido y son tokens pagos.

**6. Service role se salta la RLS.** Si el módulo de IA lee con service role, el
filtro de la papelera **hay que ponerlo a mano**. Si no, se paga por analizar
registros borrados.

**7. Quién puede qué.** Configurar la key = **admin** (es plata). Generar análisis
= cualquiera del equipo (necesitan saber con quién hablan). Son permisos distintos.

## Ejemplo

**Input:**
"La tarjeta de análisis IA de la ficha lleva semanas en placeholder esperando que
el cliente abra su cuenta de OpenAI."

**Output (CRM de Josué, 2026-07-16 — construido y en vivo en una sesión):**

- Contado primero. **Casi no se construye**: los únicos textos largos eran el
  template del propio cliente. Pero el conteo estaba mal mirado dos veces (mi
  `left(60)` y el denominador sucio). Sobre los 57 leads vivos: **56 con material**.
- El título decía "análisis de la **conversación**" → **conversación era lo único
  que no había** (5 respuestas en todo el sistema). Pasó a "quién es y por dónde
  entrarle" y analiza el **perfil**.
- Key pegada en Configuración → verificada contra `/v1/models` → modelo elegido de
  los que la cuenta **tenía**: `gpt-4.1-mini`.
- Probado con una key inventada → **401 → no se guardó nada**.
- Con material (bio de 2.599 chars):
  > *"Su rol en una firma de inversión de impacto y en iniciativas DeFi sugiere un
  > perfil con tolerancia al riesgo media-alta y horizonte largo… Probablemente no
  > le interesen productos tradicionales sin impacto o innovación tecnológica."*

  Le está diciendo al asesor **que no le ofrezca su producto de renta fija**.
- Sin material → `sin_material` y **ni se llamó al proveedor**: la IA no tuvo
  oportunidad de inventar, y no se pagó por no hacerlo.
- Caché: **4.748 ms** la primera vez → **454 ms** la segunda.
- **El deploy no necesitó ni una variable nueva.** Ese es el pago de la idea.
