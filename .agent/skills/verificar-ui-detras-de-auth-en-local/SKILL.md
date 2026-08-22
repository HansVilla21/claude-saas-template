# Skill: Verificar una UI que está detrás de auth (cuando el agente no puede loguearse)

## Cuándo usar esta skill

- Cambiaste una pantalla que vive **detrás del login** y querés verificarla vos mismo, sin pedirle al founder que la abra.
- El login del proyecto es **Google nativo (GIS)** u otro proveedor que un agente no puede completar.
- El preview de Vercel está protegido por Vercel Auth, o el proveedor de identidad **solo autoriza `localhost` y el dominio de producción**.

**Regla previa:** "compila" y "`tsc` verde" no son verificación. Ver [[verificar-funcionamiento-end-to-end]].

## Por qué existe esta skill

FreshAdFlow, julio 2026. `/crear` está detrás de auth y el login es **Google Identity Services nativo** — que además de no ser automatizable por un agente, **solo corre en orígenes autorizados**: `localhost:3000` y `freshadflow.com`. En una URL de preview suelta de Vercel **no funciona**, así que el clásico "probalo en el preview" no era una opción.

Sin una salida, la verificación de cada cambio de UI dependía de que el founder lo abriera — y eso convierte un ciclo de 2 minutos en uno de 2 horas.

## Proceso

### Opción A — Destapar la ruta temporalmente en local (la que se usó)

```ts
// src/lib/supabase/middleware.ts
const PROTECTED_PREFIXES = ["/crear", "/galeria", "/cuenta"];
//                          ^ quitar SOLO la que vas a verificar, SOLO en local
```

1. Quitar el prefijo de la lista.
2. Levantar `localhost:3000`, abrir la ruta, verificar lo que cambiaste.
3. **Revertir con `git checkout -- src/lib/supabase/middleware.ts`.**

**El paso 3 es el que se olvida.** Poné el revert en la misma lista de tareas que el cambio, no al final. Un middleware desprotegido que llega a un PR es una vulnerabilidad, no un descuido de estilo.

Salvaguardas que hacen esto seguro:
- **Nunca commitear el cambio**, ni siquiera "temporalmente" en la rama.
- Verificá con `git diff` **antes** de commitear que el middleware no está tocado.
- Si la pantalla necesita datos del usuario, la ruta destapada va a fallar distinto — ver Opción B.

### Opción B — Sesión sembrada en local

Si la pantalla depende de datos reales del usuario (créditos, packs), destapar la ruta no alcanza. Sembrá una sesión con un usuario de prueba: login por **email/clave** (que sí es automatizable) contra el proyecto de desarrollo, o inyectando las cookies de sesión del cliente SSR.

Es más trabajo, pero es la única que verifica la pantalla **con datos**.

### Opción C — Verificar la capa de abajo y ser explícito

Si ninguna de las dos aplica, verificá lo que **sí** podés (el server action, la query, el prompt generado) y **decilo tal cual**: *"verifiqué la lógica y los tipos; la pantalla logueada la tenés que abrir vos"*. Lo que no vale es declarar "funciona" sobre algo que no se abrió.

## Gotchas

- **El preview de Vercel no sirve para probar login social:** doble bloqueo (Vercel Auth + orígenes no autorizados en el proveedor). Probá en `localhost` o en producción.
- **Google GIS exige orígenes autorizados exactos**: `localhost:3000`, el apex y el `www`. Una URL de preview aleatoria nunca va a estar en esa lista.
- **Revertir es parte del cambio.** Si tu rama toca el middleware, el PR está mal aunque la feature esté bien.
- **`npm run build` local puede fallar por red** (por ejemplo bajando fuentes de Google) sin que haya nada roto: en el CI compila. No persigas ese error. Y no borres `.next` justo antes de un build local sin red — perdés el cache de fuentes.
- **Si la ruta que destapaste hace un redirect por sesión ausente**, vas a ver el redirect, no la pantalla: puede que necesites destapar también la lógica de redirect del layout, y ahí ya conviene la Opción B.

## Ejemplo (input -> output)

- **Input:** "cambié el selector de `/crear`, que está detrás de login con Google".
- **Output:** prefijo quitado del middleware en local -> verificado E2E (las tarjetas renderizan, no hay preselección, bloquea sin elegir, al elegir cambian los textos) -> **`git checkout` del middleware** -> `git diff` limpio -> PR con un solo archivo tocado.

## Relacionadas

[[verificar-funcionamiento-end-to-end]] · [[selector-que-obliga-eleccion-consciente]] · [[auth-supabase-google-nativo]] · [[supabase-google-login-movil-vs-desktop]] · [[deploy-seguro-vercel-preview-prod]]
