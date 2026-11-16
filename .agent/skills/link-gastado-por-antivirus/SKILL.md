---
name: link-gastado-por-antivirus
description: Usar cuando un link de un solo uso mandado por correo (invitación, cambio de contraseña, link mágico, confirmación) llega vencido la PRIMERA vez que la persona lo abre, sobre todo con correos corporativos. Un antivirus lo abre antes y gasta el token. Trae el diagnóstico en 2 minutos, el patrón del GET que no canjea y el botón que hace el POST, la señal correcta de quién puede entrar (la cuenta queda confirmada y con último acceso sin que nadie haya entrado), qué correo reenviarle a cada uno y cómo probarlo imitando al antivirus. Se dispara con "el enlace venció", "otp_expired", "Token has expired or is invalid", "le llegó la invitación y dice vencido", "correo de Microsoft 365", "Safe Links", "dice último acceso y nunca entró", "no le aparece reenviar invitación".
---

# Skill: El link de correo que gasta el antivirus

## Cuándo usar esta skill

- Una persona abre por primera vez un link de invitación o de contraseña y ve «El enlace venció».
- Pedir otro link no lo arregla: vence cada vez.
- Su correo es corporativo (Microsoft 365, Mimecast, Proofpoint) y a otros clientes les anda bien.
- La pantalla dice que la persona ya confirmó o que tiene «último acceso», y ella jura que nunca pudo entrar.
- Vas a armar por primera vez la ruta que recibe los links de correo de un SaaS. **Aplicalo desde el principio:** el error no aparece hasta el primer cliente con correo corporativo.

## Por qué existe

Un antivirus de correo abre los links de cada mensaje para revisarlos. Si tu GET canjea el token, el antivirus lo canjea y la persona llega a un token ya usado. Medido en un cliente con Microsoft 365, en los logs de auth:

| Hora (UTC) | Quién | Qué pasó |
|---|---|---|
| 00:35:01 | El sistema | Sale la invitación |
| 00:35:54 | El antivirus | Abre el link: `/verify` responde 200 y el token queda gastado |
| 00:35:58 | La persona | Abre el link: `otp_expired`, «El enlace venció» |

Probó tres veces más, siempre vencido. No hay nada en rojo: el sistema contestó bien cada vez.

**Lo que engaña es que `token_hash` + `verifyOtp` parece la cura.** Esa combinación arregla otra falla: que el link dependa del navegador que lo pidió (PKCE). No frena al antivirus, porque un GET que canjea se gasta igual, sea con el `code` o con el `token_hash`. La skill `setup-correo-auth-saas` lo presentó como solución a los scanners hasta el 2026-11-02, y este caso salió de seguirla.

**Y el daño no termina en el link.** Son tres fallas encadenadas:

1. El antivirus gasta el token.
2. La cuenta queda con `email_confirmed_at` y `last_sign_in_at` llenos, y sin contraseña. Cualquier regla que deduzca «ya entró» de esas columnas miente, y el botón de reenviar desaparece.
3. Aunque lo intentes, Supabase rechaza una invitación nueva: con el correo confirmado, la cuenta «ya existe».

Por eso esta skill arregla las tres. Arreglar solo el link deja trabado a quien ya cayó.

## Proceso

### 1. Confirmar que es esto (2 minutos)

Antes de tocar plantillas o variables de entorno:

```sql
select email, invited_at, email_confirmed_at, last_sign_in_at,
       coalesce(encrypted_password, '') = '' as sin_contrasena
from auth.users
where email = 'persona@empresa.com';
```

Es esto si se cumplen las tres:

- `email_confirmed_at` o `last_sign_in_at` caen **segundos o pocos minutos** después de `invited_at`.
- `sin_contrasena` es `true`.
- En los logs de auth hay un `/verify` 200 y, después, `otp_expired` para el mismo usuario.

Un indicio más, que no alcanza solo: `nslookup -type=MX empresa.com` responde `*.mail.protection.outlook.com` (Microsoft 365).

### 2. El GET no canjea; el POST del botón sí

Los correos **no cambian**: siguen apuntando a `/auth/confirm?token_hash=…`. Así los links ya enviados siguen sirviendo y no hay que tocar las plantillas.

```ts
// lib/auth/enlace-correo.ts: lógica pura, con pruebas
export function destinoDelGet(params: URLSearchParams): string {
  const tokenHash = params.get('token_hash');
  const tipo = tipoDeEnlace(params.get('type'));   // lista cerrada de EmailOtpType
  if (!tokenHash || !tipo) return urlDeError();
  const q = new URLSearchParams({
    token_hash: tokenHash,
    type: tipo,
    next: destinoSeguro(params.get('next')),       // empieza con '/' y no con '//'
  });
  return `/auth/continuar?${q.toString()}`;
}
```

```ts
// app/auth/confirm/route.ts
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}${destinoDelGet(searchParams)}`);
}

export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const form = await request.formData();
  const tokenHash = form.get('token_hash');
  const tipo = tipoDeEnlace(form.get('type')?.toString());
  const next = destinoSeguro(form.get('next')?.toString());

  if (typeof tokenHash === 'string' && tokenHash && tipo) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    // 303: el navegador sigue con un GET al destino y no repite el POST.
    if (!error) return NextResponse.redirect(`${origin}${next}`, 303);
  }
  return NextResponse.redirect(`${origin}${urlDeError()}`, 303);
}
```

```tsx
// app/auth/continuar/formulario-continuar.tsx
'use client';
export function FormularioContinuar({ tokenHash, tipo, destino, boton }: Props) {
  const [enviando, setEnviando] = useState(false);
  return (
    <form method="post" action="/auth/confirm" onSubmit={() => setEnviando(true)}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={tipo} />
      <input type="hidden" name="next" value={destino} />
      <button type="submit" disabled={enviando}>{enviando ? 'Un momento…' : boton}</button>
    </form>
  );
}
```

La pantalla `/auth/continuar` muestra título, bajada y botón según el tipo («Aceptar invitación», «Continuar», «Confirmar correo»). Una línea abajo le explica a la persona por qué hay un paso más: «Este paso hace que el enlace funcione aunque tu correo lo revise antes un antivirus».

### 3. La señal de quién puede entrar es la contraseña, no el acceso

`email_confirmed_at` y `last_sign_in_at` los llena quien canjea el token, sea quien sea. La pregunta correcta es si tiene con qué volver a entrar: contraseña u otro proveedor.

```sql
create or replace function public.usuarios_sin_contrasena(p_ids uuid[])
returns table (user_id uuid)
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
  where u.id = any(p_ids)
    and coalesce(u.encrypted_password, '') = ''
    and not exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider <> 'email'
    );
$$;
-- Cerrada también a PUBLIC: ver revocar-execute-incluye-public.
revoke all on function public.usuarios_sin_contrasena(uuid[]) from public, anon, authenticated;
grant execute on function public.usuarios_sin_contrasena(uuid[]) to service_role;
```

- **Sin el chequeo de proveedores,** marca como pendiente a quien entra con Google. El control negativo lo mostró.
- **Si la lectura falla,** volvé a la regla vieja (`!emailConfirmado && !yaEntro`). Acierta en el caso común y la pantalla sigue andando.
- **En un producto solo con link mágico** esta señal no sirve, porque nadie tiene contraseña. Ahí hace falta una marca propia de «completó el alta».

### 4. Reenviar el correo que le sirve a cada uno

| Estado de la persona | Qué se le manda | Por qué |
|---|---|---|
| Nunca confirmó el correo | `inviteUserByEmail` | La invitación de siempre |
| Confirmó, sin contraseña | `resetPasswordForEmail` | La invitación la rechaza Supabase: la cuenta «ya existe» |
| Tiene contraseña u otro proveedor | Nada, y sin botón | Ya puede entrar |

La decisión va en una función pura con pruebas, y el servidor la vuelve a evaluar: un POST directo no pasa por la pantalla. Avisá en pantalla cuál salió: «Le mandamos a X un enlace para crear su contraseña».

### 5. Rescatar a quien ya quedó trabado

Pasá todos los miembros activos por la función del paso 3. Los que devuelve no pueden entrar, aunque la pantalla diga lo contrario. Se les reenvía desde la pantalla de equipo: no hace falta tocar nada en la base ni poner contraseñas a mano.

### 6. Verificar imitando al antivirus

**Con un token inventado, sin gastar nada y en producción:**

```bash
curl -s -o /dev/null -D - "https://app.com/auth/confirm?token_hash=inventado&type=invite&next=/auth/reset" | grep -iE "^HTTP|^location"
```

Resultado esperado: `307` a `/auth/continuar?...`. Si responde error de token, el GET sigue canjeando. Hacelo también con `next=//evil.com` (tiene que salir `next=%2F`) y con un POST: `303` a `/login?error=…`.

**Con un token real, en un correo tuyo:** copiá el link y abrilo con `curl`, como haría el antivirus. Después abrilo en el navegador y tocá el botón: tiene que entrar. Con el código viejo, ese segundo paso da «vencido»: ese es el control negativo.

## Output esperado

1. `/auth/confirm` con un GET que solo redirige y un POST que canjea.
2. `/auth/continuar` con su botón por tipo de link.
3. Lógica pura con pruebas: el GET nunca canjea, destino interno, lista cerrada de tipos.
4. Función `usuarios_sin_contrasena`, cerrada a todos menos `service_role`.
5. Reenvío que elige entre invitación y enlace de contraseña.
6. Quienes ya estaban trabados, identificados y con su correo reenviado.

## Ejemplo

**Input:** «Le mandé la invitación a un cliente, dice que el enlace venció y ya le reenvié tres. En Equipo figura con último acceso y no me deja reenviarle».

**Output:**
- La consulta del paso 1 da confirmado a los 53 s de la invitación, sin contraseña, y el MX es de Microsoft 365. Es esto.
- El GET pasa a la pantalla del botón y el POST canjea.
- La persona aparece como pendiente, con «Reenviar invitación», y le llega el enlace para crear su contraseña.

## Gotchas

- **No lo soluciona cambiar `{{ .ConfirmationURL }}` por `token_hash`.** Eso arregla los links entre dispositivos. Si el GET sigue canjeando, el antivirus gana igual.
- **No hagas auto-submit en la pantalla intermedia.** Hay scanners que ejecutan JavaScript, y un `form.submit()` al cargar devuelve el problema. Hace falta el toque de una persona.
- **El botón se apaga al primer toque.** Con un doble toque el segundo POST vuelve «vencido», y el navegador se queda con esa respuesta aunque el primero haya funcionado.
- **Usá 303, no 307, en el POST.** Con 307 el navegador repite el POST en el destino.
- **No guardes el token en una cookie ni en el servidor entre los dos pasos.** Viaja en la URL y en el campo oculto, y es de un solo uso.
- **Probar en local no demuestra nada,** salvo que imites al antivirus con `curl`: tu Gmail personal no tiene Safe Links, así que el flujo roto también te funciona a vos.
- **«Último acceso» no siempre es de una persona.** Antes de decirle a un cliente «pero si ya entraste», mirá si tiene contraseña.
- **Mirá la pantalla como la ve el dueño y como la ves vos.** En el caso de origen, la regla «sos el único del equipo» miraba si había un solo miembro y no quién miraba: como administrador de la plataforma, la lista entera se escondía, con el botón adentro.
- **Si el proveedor de correo tiene seguimiento de clics, apagalo para estos correos.** Reescribe los links, y Supabase lo avisa en su documentación.
- **Si algún día aparece un antivirus que aprieta botones,** la alternativa es un código de 6 dígitos (`{{ .Token }}`) que la persona escribe en una pantalla. Es más fricción, por eso no es el primer camino. Es la opción 1 de Supabase; la del botón es la opción 2 («Email prefetching», en la guía de plantillas de correo).

## Qué quedó medido y qué no

- **Medido:** la línea de tiempo del caso; la función con el bloque que siempre aborta sobre la base viva, con 2 controles negativos; las pruebas puras; y en producción, con token inventado, el GET a la pantalla del botón, el destino externo descartado, el tipo inventado y el POST.
- **No medido:** la secuencia real con un token de verdad y el antivirus de un correo corporativo. El founder dio el arreglo por bueno sin esa prueba. Si la hacés, anotá el resultado acá.

## Skills relacionadas

- `setup-correo-auth-saas`: el armado completo de correo y acceso; su paso 4 remite acá.
- `revocar-execute-incluye-public`: por qué el `revoke` de la función incluye a PUBLIC.
- `probar-migracion-contra-base-viva-con-rollback`: cómo se probó la función sin dejar rastro.
- `verificar-funcionamiento-end-to-end`: por qué «me anduvo con mi correo» no alcanza.
