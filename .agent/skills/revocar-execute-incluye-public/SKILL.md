# Skill: Revocar EXECUTE a anon no alcanza — el permiso viene de PUBLIC

> Nació el 2026-09-12 en el CRM de Momentum, arreglando algo que no tenía nada
> que ver con seguridad: una función SQL ponía "Lead sin nombre" en las
> notificaciones. Al reemplazarla se miró quién podía ejecutarla y apareció que
> **cualquiera**: `notif_lead_label(uuid)` es SECURITY DEFINER y devolvía el
> nombre o el teléfono de cualquier contacto de cualquier cliente a quien
> conociera su id, sin sesión. Al lado, `tasks_scan_generadores()` tenía en su
> migración un `revoke execute … from anon, authenticated` escrito a conciencia,
> y **no había quitado nada**. Las dos se cerraron en la misma migración, con un
> `curl` anónimo que pasó de devolver datos a **401**. Y la auditoría de toda la
> base que vino después mostró que no eran las únicas: 18 más sin ningún chequeo
> de quién llama, una de las cuales devolvía todas las cuentas de clientes. Se
> cerraron ese mismo día sin romper nada: las funciones SECURITY DEFINER
> ejecutables por `anon` pasaron de **33 a 15**, y las que quedan son de trigger
> o helpers de RLS.

## Cuándo usar esta skill

- Escribís una función `security definer` en Postgres/Supabase (triggers,
  scans de cron, helpers de RLS, reportes).
- Ves `revoke execute on function … from anon, authenticated` en una migración.
- Una skill, un advisor o un checklist dice "revocá EXECUTE a anon".
- Auditás un proyecto Supabase antes de meter clientes, o después de encontrar
  UNA función expuesta (casi nunca es una sola).

## El error de fondo

En Postgres, **toda función nueva nace con EXECUTE para `PUBLIC`**, el
pseudo-rol del que heredan todos los roles. Supabase además da EXECUTE
explícito a `anon` y `authenticated` por default privileges. Entonces:

```sql
revoke execute on function public.f() from anon, authenticated;
```

quita los grants **explícitos**, pero `anon` sigue pudiendo porque hereda de
`PUBLIC`. No hay error y no hay aviso: la migración corre, se lee prolija, y la
función sigue abierta.

Con **tablas** es distinto: `PUBLIC` no tiene privilegios de tabla por default,
así que `revoke all on table t from anon, authenticated` sí cierra. Por eso el
mismo reflejo funciona en tablas y falla en funciones.

Y `security definer` es lo que lo vuelve grave: la función corre con los
permisos de su dueño (`postgres`), **saltándose la RLS**. PostgREST expone por
`/rest/v1/rpc/<nombre>` toda función de `public` que el rol pueda ejecutar.

`create or replace function` **conserva** el ACL: reemplazar la función no la
abre ni la cierra.

## Cómo detectarlo (2 minutos)

**1. Quién puede, de verdad** — `has_function_privilege` resuelve la herencia de
PUBLIC; leer los `grant` de las migraciones no:

```sql
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid)            as devuelve,
       has_function_privilege('anon', p.oid, 'execute')          as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       array_to_string(p.proacl, ' ')                            as acl,  -- '=X/postgres' = PUBLIC
       p.prosrc ~* 'auth\.uid\(\)|auth\.role\(\)|is_master|is_member' as chequea_adentro
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute')
  and pg_get_function_result(p.oid) <> 'trigger'   -- las de trigger no se llaman por /rpc
order by chequea_adentro, p.proname;
```

`acl` con `=X/postgres` (sin nombre antes del `=`) es PUBLIC. `acl` vacío es el
default, que también incluye PUBLIC.

**2. Confirmarlo desde afuera, sin efectos** — elegí una que solo LEA y contá
filas, sin imprimir contenido:

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/<funcion_de_solo_lectura>" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
# 200 con filas = expuesta · 401 {"code":"42501"} = cerrada
```

⚠️ **No llames así a las que escriben o disparan** (seguimientos, locks,
notificaciones, scans): la prueba ES el daño.

## Cómo cerrarlo sin romper nada

Por cada función, **antes** de revocar, buscá quién la llama y con qué rol:

| Llamador | Rol con el que corre | ¿Le afecta el revoke? |
|---|---|---|
| Trigger (la función del trigger es SECURITY DEFINER de `postgres`) | `postgres` | No |
| `pg_cron` | el de `cron.job.username` (normalmente `postgres`) | No |
| Edge Function / n8n con service role | `service_role` | Solo si no le das `grant` |
| La app con sesión de usuario (`supabase.rpc(...)`) | `authenticated` | **Sí — rompe** |
| Otra función SECURITY INVOKER llamada por un usuario | el usuario | **Sí — rompe** |

```sql
-- funciones internas (triggers, cron, service role)
revoke execute on function public.f(uuid) from public, anon, authenticated;
grant  execute on function public.f(uuid) to service_role;   -- si una Edge Function la usa

-- funciones que la app llama con sesión: authenticated SÍ, pero con chequeo ADENTRO
revoke execute on function public.g() from public, anon;
-- y en el cuerpo: if not public.is_master() then raise exception 'forbidden'; end if;
```

Búsquedas para encontrar llamadores:

```bash
grep -rn "rpc('f'\|rpc(\"f\"\|\.rpc(.f" src supabase/functions n8n
```
```sql
select proname, prosecdef from pg_proc where prosrc ilike '%public.f(%';
select jobname, username from cron.job where command ilike '%f(%';
```

### ⭐ La fuente que no miente: `pg_stat_statements` por rol

El grep encuentra el código que **existe**, pero no dice con qué rol corre, y no
ve lo que vive fuera del repo (n8n, scripts, un panel). La base anota **quién la
llamó de verdad**:

```sql
select r.rolname, sum(s.calls) as llamadas
from extensions.pg_stat_statements s join pg_roles r on r.oid = s.userid
where s.query ~ '\mmi_funcion\M'
  and s.query not ilike 'create %' and s.query not ilike '%pg_stat_statements%'
group by 1 order by 2 desc;

-- ¿desde cuándo mide? Si dealloc > 0 se perdieron consultas raras.
select stats_reset, dealloc from extensions.pg_stat_statements_info;
```

En el CRM: 3,5 meses de medición sin pérdidas. Separó las 18 funciones en tres
grupos sin discusión: **postgres** (triggers y cron), **service_role** (Edge
Functions y el cron de la app) y **authenticated** (solo el panel master). Y
mostró una llamada de `anon`: la prueba con `curl`.

### Si la app las llama con sesión: dos caminos

- **Pasar la llamada al cliente de servicio DESPUÉS del gate de la app**
  (`requireMaster()` y después `admin.rpc(...)`) y revocar también a
  `authenticated`. No toca el cuerpo de la función. Elegido en el CRM para las 4
  del panel master.
- **Dejar `authenticated` y meter el chequeo adentro** (`is_master()`,
  `is_member_of(p_agency)`). Sirve cuando la llaman usuarios de varios roles.

⚠️ **Orden de deploy con el primer camino: primero la app, después la
migración.** Si revocás antes, el panel queda roto mientras Vercel despliega.
Se espera el deploy de producción en `success`, se aplica la migración y se
prueba con `curl`.

## Verificación

- Dentro del bloque que siempre aborta (skill
  `probar-migracion-contra-base-viva-con-rollback`): `has_function_privilege`
  **antes y después** para `anon`, `authenticated` y `service_role`, y
  `perform` de la función como `postgres` para probar que el cron la sigue
  pudiendo correr. Medido en el CRM: `label anon=t auth=t` →
  `label anon=f auth=f svc=t`.
- En el mismo bloque, **como `service_role`**, llamá a las de lectura que usa
  la app, y dispará un camino de trigger con un `update` que no cambia nada
  (`set bot_enabled = bot_enabled` activa un `AFTER UPDATE OF bot_enabled`).
  Así probás que las funciones anidadas se chequean contra el dueño y no contra
  quien escribe.
- Aplicado: el mismo `curl` anónimo → **HTTP 401, `42501 permission denied`**.
- Después, en los logs de Postgres: los únicos `permission denied` tienen que ser
  los de tu `curl`. Y `cron.job_run_details` tiene que mostrar corridas
  `succeeded` posteriores al cambio.
- Si la app la llama con sesión, entrar como un usuario de cada rol y usar la
  pantalla.

## Anti-patrones

- **`revoke … from anon, authenticated` sin `public`** en una función. Es el bug.
- **Confiar en la migración** para saber quién puede: el ACL vivo manda
  (`has_function_privilege`), y otra migración pudo haberlo cambiado.
- **Probar la exposición llamando a una función que escribe.**
- **Revocar a `authenticated` sin buscar `rpc(` en la app**: el panel deja de
  cargar y parece otro bug.
- **Arreglar solo la que encontraste.** Casi nunca es una sola: si una función
  tenía el revoke incompleto, el reflejo que lo escribió está en todas. Corré la
  query de arriba sobre toda la base. En el CRM, las 2 primeras destaparon 18 más.
- **Cerrar también los helpers de RLS** (`is_master()`, `is_member_of()`, …):
  `anon` y `authenticated` los NECESITAN para evaluar las policies, y como solo
  hablan de quién llama no exponen nada. Si les sacás el permiso, las pantallas
  fallan con un 42501 en vez de devolver vacío.
- **Publicar el resultado de la auditoría antes de cerrar.** Los nombres de las
  funciones abiertas, en un repo público o un canal compartido, son un mapa.
  El detalle va a un lugar privado hasta que estén cerradas.
- **Poner un chequeo de `auth.uid()` y dejar PUBLIC abierto** "porque ya
  chequea": un chequeo mal escrito o un `security definer` que olvida
  `search_path` vuelve a abrirla. Las dos capas.
