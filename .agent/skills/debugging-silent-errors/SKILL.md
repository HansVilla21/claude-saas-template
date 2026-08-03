# Skill: Debugging de Errores Silenciosos

## Cuándo usar esta skill

- Cuando la UI muestra "Error desconocido" o un mensaje genérico sin detalles
- Cuando los logs de Vercel están vacíos para un error que debería aparecer
- Cuando un catch block existe pero nadie lo instrumentó con logging
- Cuando un bug aparece en producción y no podés reproducirlo localmente

## El problema raíz

```typescript
// Patrón roto — silencia el error REAL
try {
  await doSomething();
} catch (err) {
  return { error: "Error desconocido" }; // ← el err se pierde, nunca lo ves
}
```

Vercel Functions no imprimen nada de los catch blocks a menos que hagas `console.error` explícito. El error viaja hasta la UI sin dejar rastro.

## Proceso

### Paso 1: Agregar logging estructurado en TODOS los catch críticos

```typescript
// Patrón correcto
try {
  await doSomething();
} catch (err) {
  console.error("[miFunction] operación fallida:", {
    errName:    (err as { constructor?: { name?: string } })?.constructor?.name,
    errMsg:     err instanceof Error ? err.message : null,
    errCode:    (err as { code?: string })?.code ?? null,
    errDetails: (err as { details?: string })?.details ?? null,
    errHint:    (err as { hint?: string })?.hint ?? null,
    errString:  String(err),
  });
  return { error: "Error desconocido" };
}
```

El shape estructurado (objeto JSON) permite filtrar en Vercel Logs por campo específico.

### Paso 2: ANTES de agregar logging, intentar reproducir directamente

Antes de instrumentar, preguntarse: **¿puedo reproducir el error con exactamente los mismos inputs?**

Si es sí:
1. Correr el caso de prueba exacto (mismo handle de usuario, mismo shortcode, etc.)
2. Agregar `console.log` temporales en la ruta de ejecución sospechosa
3. Si el error es de DB, ejecutar el upsert en Supabase Dashboard → SQL Editor con los datos exactos

Si es no (solo pasa con ciertos datos en producción):
1. ENTONCES sí agregar logging estructurado, deployar, y esperar que se repita
2. Revisar Vercel Logs → Functions → filtrar por el nombre de tu función

### Paso 3: Identificar el tipo de error por el shape

| Campo | Qué buscar | Qué significa |
|---|---|---|
| `errCode: "23514"` | Postgres constraint violation | Un valor viola un CHECK (ej: `likes_count >= 0`) |
| `errCode: "23505"` | Unique violation | Duplicate key en insert |
| `errCode: "42501"` | RLS violation | La query viola Row Level Security |
| `errCode: "PGRST116"` | Supabase `.single()` sin resultado | La query devolvió 0 rows, no 1 |
| `errName: "ScraperError"` | Error tipado del provider | Ver `errCode` interno (RATE_LIMIT, PROFILE_PRIVATE, etc.) |
| `errMsg` con "fetch failed" | Error de red | El servidor no puede llegar al endpoint externo |
| `errString: "AbortError"` | Timeout | La llamada excedió el timeout configurado |

### Paso 4: Para errores de DB — probar la query directa

Cuando sospechas un error de Supabase/Postgres:

```sql
-- Probar el INSERT exacto en SQL Editor de Supabase Dashboard
INSERT INTO ig_videos (external_id, likes_count, ...) 
VALUES ('ABC123', -1, ...)
-- Si retorna "new row violates check constraint", encontraste el problema
```

### Paso 5: Para errores de providers externos — reproducir la llamada

```typescript
// script de repro — correr en Node directamente (no en Vercel)
// Colocar en src/ (donde están node_modules), no en scripts/
const res = await fetch("https://api.apify.com/v2/acts/...", {
  method: "POST",
  headers: { "Authorization": `Bearer ${process.env.APIFY_API_TOKEN}` },
  body: JSON.stringify({ /* input exacto */ })
});
const data = await res.json();
console.log(JSON.stringify(data, null, 2)); // ver qué devuelve exactamente
```

**Nota:** Correr el script desde `src/` para que encuentre `node_modules`. Desde la raíz del proyecto falla si las deps están en `src/`.

### Paso 6: Limpiar después

1. Eliminar scripts de repro (pueden contener tokens/keys en el contexto)
2. Mantener el `console.error` estructurado — es útil para debugging futuro
3. Documentar el root cause en `memory/learnings.md` o en este archivo si es un patrón nuevo

## Output esperado

- Root cause identificado (no "se rompe algo en el scraping")
- Fix específico aplicado
- Logging estructurado que queda para el futuro

## Ejemplo real (bug de likes ocultos en Hookly)

**Síntoma:** "Error desconocido" al analizar `@meliserranocr`

**Proceso:**
1. ¿Se puede reproducir? Sí — mismo handle.
2. Correr Apify directamente con ese handle → `likesCount: -1` en 12 de 30 reels.
3. Correr INSERT de esos rows en SQL Editor → error `23514: new row violates check constraint "ig_videos_likes_non_negative"`.
4. Root cause: constraint `CHECK (likes_count >= 0)` en DB; Apify retorna `-1` para likes ocultos; el normalizer usaba `r.likesCount ?? 0` que no clampea valores negativos.
5. Fix: `Math.max(0, rawLikes)` + columna `likes_hidden boolean` + indicador en UI.

**Tiempo total:** ~30 min desde síntoma hasta fix deployado.

## Anti-patrones a evitar

- Agregar logging ANTES de intentar reproducir directamente — el logging cuesta un deploy
- Hacer `JSON.stringify(err)` — los objetos `Error` se serializan como `{}` en JSON; usar el shape estructurado de arriba
- Dejar scripts de repro en el repo — contienen contexto de credenciales
- Asumir que el problema es el código cuando puede ser un valor inesperado del provider
