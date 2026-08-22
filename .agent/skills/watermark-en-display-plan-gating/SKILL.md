# Skill: Watermark en display / plan-gating de assets

## Cuándo usar esta skill

- Cuando un SaaS free→pago entrega **assets visuales** (imágenes, PDFs, videos) y el modelo de negocio depende de que el free NO pueda usar el asset limpio.
- Cuando ya tenés watermark **en la descarga** pero la galería/preview muestra el **master limpio** (signed URL o `<img src>` directo) — el free abre devtools/pestaña nueva y baja la imagen limpia → **saltea el paywall**.
- Regla madre: **el master limpio nunca se sirve a un free, ni en descarga ni en display.**

## El error que ataca

Mostrar el master limpio con un overlay CSS ("MUESTRA" con `position:absolute`) encima. El overlay es solo pintura del navegador: la URL de abajo apunta al archivo limpio. Cualquiera con devtools copia el `src` y tiene el asset sin marca. **Un overlay CSS no es seguridad, es decoración.**

## Proceso

### Paso 1: Endpoint que hornea la marca server-side y stremea inline

```typescript
// app/api/creatives/[id]/view/route.ts
import { createClient } from "@/lib/supabase/server";
import { viewCreative } from "@/server/delivery";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthenticated", { status: 401 });

  const img = await viewCreative(user.id, id); // valida ownership + hornea si free
  if (!img) return new Response("not_found", { status: 404 });

  return new Response(new Uint8Array(img.buffer), {
    headers: {
      "Content-Type": img.contentType,
      // URL estable por asset ⇒ cacheable en el navegador. Como el free NUNCA
      // recibe el master limpio, cachear el derivado watermarkeado es seguro.
      "Cache-Control": "private, max-age=600",
    },
  });
}
```

### Paso 2: La lógica de entrega valida ownership y hornea según plan

```typescript
// server/delivery.ts  (service_role: lee bucket privado)
export async function viewCreative(userId: string, creativeId: string) {
  const admin = createAdminClient();
  const { data: c } = await admin.from("creatives")
    .select("user_id, storage_path, status").eq("id", creativeId).single();
  if (!c || c.user_id !== userId || c.status !== "done" || !c.storage_path) return null;

  const { data: file } = await admin.storage.from("creatives").download(c.storage_path);
  if (!file) return null;
  let buffer = Buffer.from(await file.arrayBuffer());

  const plan = await getEffectivePlan(userId);
  if (!isPaidPlan(plan)) buffer = await watermark(buffer); // sharp: marca horneada
  return { buffer, contentType: "image/png" };
}
```

### Paso 3: UNA función decide la URL de display según plan (centralizar)

```typescript
// server/delivery.ts — usada por TODAS las rutas de lectura que devuelven imágenes
export async function displayUrlFor(opts: {
  paid: boolean; creativeId: string; storagePath: string; admin: AdminClient;
}): Promise<string | null> {
  if (!opts.paid) return `/api/creatives/${opts.creativeId}/view`;  // free → endpoint horneado
  const { data } = await opts.admin.storage
    .from("creatives").createSignedUrl(opts.storagePath, 600);      // pago → master directo (rápido)
  return data?.signedUrl ?? null;
}
```

### Paso 4: Aplicarlo a TODAS las rutas de display (no olvidar ninguna)

Auditá cada endpoint que devuelva una URL de imagen y reemplazá el `createSignedUrl` inline por `displayUrlFor`. En un CRM de packs suelen ser varias: galería, detalle de pack, favoritos y **la portada del listado** (esa se olvida siempre). Calculá `paid` una vez por request:

```typescript
const paid = isPaidPlan(await getEffectivePlan(user.id));
// ...por cada creative:
const url = await displayUrlFor({ paid, creativeId: c.id, storagePath: c.storage_path, admin });
```

### Paso 5: Limpiar el overlay CSS y dejar solo un chip informativo

La marca ya viene horneada ⇒ el overlay grande sobra (se vería doble). Dejá un chip pequeño ("Muestra · con marca de agua") que **explica** la marca, no la simula.

## Output esperado

- Free: `<img src="/api/creatives/{id}/view">` → imagen con marca horneada. Devtools/pestaña nueva → sigue watermarkeada. Imposible obtener el limpio.
- Pago: signed URL directa al master limpio (sirve desde el CDN privado, sin costo de CPU).
- 401 sin sesión, 404 si el asset no es del usuario.

## Ejemplo

**Input:** free abre "Mis packs" con 9 anuncios generados.
**Output:** las 9 portadas + el detalle + el lightbox cargan desde `/view` (horneadas). Al bajar una, también horneada. Cuando el usuario pasa a Pro, las mismas rutas devuelven signed URLs limpias sin tocar código.

## Trade-offs y límites

- **CPU on-the-fly:** watermarkear por request cuesta CPU (sharp). Mitigado con `Cache-Control` (URL estable por asset). Si el volumen crece: **pre-generar** el derivado watermarkeado en Storage al crear el asset (worker) y firmar ese path para free — cero CPU en runtime a cambio de doble storage.
- **Transición de plan:** al pagar, el free-derivado deja de usarse solo (la rama `paid` sirve el master). No hay que migrar nada.
- **Nunca** exponer el master a un free "por rendimiento". La regla de negocio manda sobre la latencia.
- Relacionada: [[embudo-activacion-saas]] (dónde encaja el paywall), [[async-job-pattern]] (cómo se generan los assets).
