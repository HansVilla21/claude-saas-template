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
> base que vino después mostró que no eran las únicas.

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

## Verificación

- Dentro del bloque que siempre aborta (skill
  `probar-migracion-contra-base-viva-con-rollback`): `has_function_privilege`
  **antes y después** para `anon`, `authenticated` y `service_role`, y
  `perform` de la función como `postgres` para probar que el cron la sigue
  pudiendo correr. Medido en el CRM: `label anon=t auth=t` →
  `label anon=f auth=f svc=t`.
- Aplicado: el mismo `curl` anónimo → **HTTP 401, `42501 permission denied`**.
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
  query de arriba sobre toda la base.
- **Publicar el resultado de la auditoría antes de cerrar.** Los nombres de las
  funciones abiertas, en un repo público o un canal compartido, son un mapa.
  El detalle va a un lugar privado hasta que estén cerradas.
- **Poner un chequeo de `auth.uid()` y dejar PUBLIC abierto** "porque ya
  chequea": un chequeo mal escrito o un `security definer` que olvida
  `search_path` vuelve a abrirla. Las dos capas.
