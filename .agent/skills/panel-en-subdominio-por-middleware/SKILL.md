# Skill: El panel del cliente en su propio subdominio (una sola app, un middleware)

`admin.cliente.com` sirve el gestor en la raíz, `cliente.com` no lo puede
alcanzar, y sigue siendo **una sola app Next.js y un solo deploy**. Todo con un
middleware de ~40 líneas.

## Cuándo usar esta skill

- El cliente pidió que su panel esté "bien dividido, aparte" del sitio público.
- Tenés sitio público + panel admin en el mismo repo y no querés dos deploys, dos
  builds ni duplicar los tipos y las queries.
- Estás por poner el panel en `/panel` y dejarlo linkeado desde el footer.
- Un widget o script del sitio público se está colando dentro del panel.

## Por qué existe esta skill

Sitio público y panel comparten **el mismo modelo de datos y los mismos tipos
TypeScript**. Separarlos en dos proyectos duplica ese trabajo y convierte la
revalidación en un problema. Pero al cliente, `sitio.com/panel` le parece parte
de su sitio — y funcionalmente lo es: cualquiera puede llegar ahí.

El middleware resuelve las dos cosas a la vez: una sola base de código, dos
superficies que se sienten (y se comportan) como productos distintos.

## El middleware

```ts
const ADMIN_HOST = process.env.NEXT_PUBLIC_ADMIN_HOST ?? "admin.cliente.com";

function esHostAdmin(host: string): boolean {
  return (
    host === ADMIN_HOST ||
    host.startsWith("admin.") ||   // admin.localhost:3000 en dev
    host.startsWith("admin-")      // admin-xxx.vercel.app mientras no hay dominio
  );
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const enAdmin = esHostAdmin(host);

  // 1) Subdominio admin: todo vive bajo /panel, sin mostrar el prefijo.
  if (enAdmin && !pathname.startsWith("/panel")) {
    const url = request.nextUrl.clone();
    url.pathname = `/panel${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);      // rewrite: la URL del navegador no cambia
  }

  // 2) Dominio principal: el panel no es alcanzable desde acá.
  if (!enAdmin && pathname.startsWith("/panel")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);     // redirect: sí queremos que se note
  }

  // 3) A esta altura siempre estamos en /panel/... → refrescar la sesión.
  //    (código de createServerClient + getUser abajo)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets/).*)"],
};
```

**`rewrite` en un caso y `redirect` en el otro, y eso importa:** el rewrite deja
la URL limpia (`admin.cliente.com/productos`, sin `/panel` a la vista); el
redirect sí cambia la barra, porque cuando alguien busca el panel en el dominio
público querés que quede claro que ahí no está.

## Proceso

1. **Dejá las rutas del panel donde están, bajo `/panel`.** El middleware las
   mapea; no hace falta reorganizar el árbol de `app/`.
2. **`esHostAdmin` con tres formas, no una.** El dominio real, el `admin.` de
   desarrollo (`admin.localhost:3000` funciona sin tocar `hosts` en Chrome), y el
   `admin-*.vercel.app` que vas a usar durante meses antes de que el cliente
   compre el dominio.
3. **El host de admin, en variable de entorno.** El mismo código sirve para todos
   tus clientes.
4. **El middleware refresca la sesión, NO hace de portero.** Escribe las cookies
   actualizadas de Supabase y ya. El gate real es el layout protegido con su
   `requireAdmin()`, del lado del servidor.
5. **Excluí estáticos del matcher.** `_next/static`, `_next/image`, `favicon.ico`
   y tu carpeta de assets. Si no, cada imagen paga el costo del middleware.
6. **Repasá qué monta el sitio público en el layout raíz.** Es el paso que se
   olvida — mirá el gotcha.

## Gotchas

- **Chequear `pathname` NO alcanza para ocultar cosas en el admin.** Es el bug
  que aparece sí o sí: en el host de admin **todo se reescribe a `/panel/*`**, y
  un componente que decide con `usePathname()` funciona… pero solo después del
  rewrite. Cualquier cosa montada en el layout raíz para el sitio público
  (widget de chat, banner de cookies, píxel de analytics) hay que apagarla
  mirando **el host**, no solo la ruta:

  ```tsx
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => setHost(window.location.host), []);
  if (host === null) return null;                    // no decidas antes de saber
  if (esHostAdmin(host) || pathname?.startsWith("/panel")) return null;
  ```
  Pasó de verdad: el dueño veía el chatbot de atención al cliente flotando dentro
  de su propio gestor de inventario.
- **Con `rewrite`, `pathname` en el servidor ya trae `/panel`.** Los links
  internos del panel se escriben sin el prefijo y el middleware los resuelve; si
  hardcodeás `/panel/...` en un `<Link>` dentro del admin, terminás con
  `/panel/panel/...`.
- **El `host` header incluye el puerto en desarrollo** (`admin.localhost:3000`).
  Por eso `startsWith("admin.")` y no una igualdad con el dominio.
- **En Vercel, los subdominios se agregan como dominios del proyecto.** Un
  `CNAME` no alcanza: si `admin.cliente.com` no está dado de alta en el proyecto,
  el request nunca llega a tu middleware.
- **El middleware corre en el edge runtime.** Nada de `fs`, ni de librerías
  pesadas de Node. Solo `@supabase/ssr` y el manejo de cookies.
- **Cookies: el patrón `getAll`/`setAll` de `@supabase/ssr` hay que copiarlo
  tal cual.** Recrear la respuesta después de setear cookies es lo que hace que
  la sesión sobreviva; una versión "simplificada" desloguea al cliente cada rato
  y parece un bug de Supabase.

## Output esperado

- `middleware.ts` con rewrite de host admin → `/panel`, redirect inverso,
  refresco de sesión y matcher que excluye estáticos.
- `NEXT_PUBLIC_ADMIN_HOST` en el env (y el subdominio dado de alta en Vercel).
- Gate real en el layout protegido, no en el middleware.
- Componentes del sitio público que chequean **host** además de ruta.
- Verificado: `cliente.com/panel` redirige, `admin.cliente.com` abre el gestor en
  la raíz, la sesión sobrevive a la navegación, y no se cuela nada del sitio
  público en el admin.

## Ejemplo

**Input:**
"El cliente quiere que su gestor esté aparte del sitio, pero no quiero mantener
dos proyectos que comparten la misma base de datos."

**Output:**
Un `middleware.ts`: `admin.cliente.com/productos` sirve `/panel/productos` sin
mostrar el prefijo, `cliente.com/panel` redirige a la home, y la sesión de
Supabase se refresca en el mismo paso. Un repo, un deploy, tipos compartidos.
El único ajuste extra fue el `ChatWidget`, que había que apagar por **host** y no
por ruta.

## Skills relacionadas

`crm-admin-panel-master-gated` (el gate de rol que va en el layout) ·
`auth-supabase-google-nativo` · `deploy-seguro-vercel-preview-prod` ·
`chatbot-web-tools-sobre-datos-vivos` (el widget que se colaba en el admin) ·
`onboarding-estado-server-side`.
