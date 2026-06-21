# Skill: Estado de onboarding desde señales reales, no localStorage por dispositivo

## Cuándo usar esta skill

- Tenés una tarjeta/flujo de **onboarding o activación** que se debe ocultar "cuando ya está hecho".
- Usás `localStorage` (o un flag por-dispositivo) para recordar "ya lo completó / dismiss".
- El usuario entra desde **otro dispositivo** (cel nuevo, otra compu, incógnito) y le **reaparece** el onboarding como si fuera cuenta nueva.

## Por qué existe

`localStorage` es **por navegador/dispositivo**, no por cuenta. Si guardás ahí el "ya terminó el onboarding", en cualquier dispositivo nuevo el flag está vacío → reaparece el onboarding. El usuario que ya tiene su cuenta andando piensa "¿me crearon una cuenta nueva?" y pierde confianza.

La solución: **derivar el estado de una señal REAL que viva en la cuenta** (en la base / en los datos), no de un flag local. Si ya hay evidencia de que el paso está hecho, ocultalo en todos lados.

## Proceso

### 1. Identificar la señal REAL de "ya está hecho"

No preguntes "¿marcó listo?" — preguntá "¿hay evidencia de que funciona?". Ejemplos:
- Onboarding de "conectá tu banco/correo" → ¿ya entraron **movimientos importados**? (`TX.some(t => t.auto || t.src === "BAC")`)
- "Completá tu perfil" → ¿el campo ya tiene valor en la DB?
- "Creá tu primer X" → ¿existe al menos un X en la cuenta?
- "Verificá tu email" → el flag de verificado del propio Auth.

### 2. Ocultar según esa señal (no según localStorage)

```tsx
const yaConectado = TX.some((t) => t.auto || t.src === "BAC"); // señal real, vive en la cuenta
if (!addr || yaConectado) return null;  // no mostrar el onboarding en NINGÚN dispositivo
```

### 3. (Opcional) dejar el localStorage SOLO como atajo, nunca como verdad

Está bien un "Listo" manual que oculte la tarjeta **en este dispositivo** para el caso intermedio (el usuario hizo los pasos pero aún no llega data). Pero la **verdad** es la señal real: en cuanto haya datos, ocultá en todos lados aunque el localStorage de ese dispositivo esté vacío.

```tsx
const done = localStorage.getItem(key) === "1"; // atajo local, opcional
if (!addr || done || yaConectado) return null;  // yaConectado manda sobre el dispositivo
```

## Output esperado

- Un usuario con la cuenta ya activa **no** ve onboarding en ningún dispositivo nuevo.
- Un usuario realmente nuevo (sin la señal) **sí** lo ve.
- El "ya está" no depende de en qué navegador estés.

## Gotchas / antipattern

- **NO** usar solo `localStorage`/cookies para estado que conceptualmente es **de la cuenta**. Es por-dispositivo.
- **NO** confiar en un flag manual ("marqué listo") como única fuente: si cambian de teléfono, reaparece.
- **SÍ** preferir señales derivadas de datos reales (existe X, llegó Y) — son auto-correctivas y cross-device.
- Cuidado con el timing: si la data carga async (hydrate), asegurate de que el componente re-renderice cuando llega (evento/`tx-updated`/bump) para recomputar la señal.

## Ejemplo concreto (Mi Menudo, 2026-06-20)

- Bug: al entrar desde el cel, reaparecía la tarjeta "Conectá tu BAC" (su "Listo" vivía en `localStorage` → vacío en el dispositivo nuevo) y parecía cuenta nueva. La cuenta estaba intacta (12 movimientos).
- Fix: [src/components/vera/ConnectBac.tsx](src/components/vera/ConnectBac.tsx) — `hasBacData = TX.some(t => t.auto || t.src === "BAC")` → si ya hay movimientos del BAC, no se muestra el onboarding en ningún lado.

## Skills relacionadas

- `supabase-google-login-movil-vs-desktop` — el login multi-dispositivo que destapó este bug.
