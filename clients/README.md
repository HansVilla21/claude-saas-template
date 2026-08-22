# 📇 Registro de clientes

> ⚠️ **Las carpetas de clientes reales NO se versionan.** Este repo es **público**.
> Solo viven acá el `README.md` (la convención) y `_plantilla/`. Todo lo demás — fichas,
> llamadas, contratos, prompts, assets — existe **solo en tu disco** y está en `.gitignore`.
> Ver "Por qué esto no se versiona" abajo.

Registro y análisis de los clientes que usan (o usarán) el sistema (chatbot + CRM + sitios web).

**UN cliente = UNA carpeta**, con lo comercial y lo técnico juntos. Un cliente puede tener solo una de las dos partes (un lead sin construir aún, o un bot armado sin ficha comercial) — no todas las subcarpetas son obligatorias.

```
clients/
├── README.md                    ← este archivo (versionado)
├── _plantilla/                  ← template para arrancar un cliente nuevo (versionado)
│   └── 00-perfil.md
└── <slug-del-cliente>/          ← ⚠️ LOCAL, nunca se commitea
    │  ── comercial ──
    ├── 00-perfil.md             ← ficha: negocio, gente, dolores, deal, estado
    ├── llamadas/                ← transcripciones con resumen + insights al inicio
    ├── propuesta-y-contrato/    ← propuesta, contrato, cuentas
    ├── planning/                ← plan de trabajo, hitos, roadmap interno
    ├── onboarding/              ← checklist de accesos/inputs que necesito del cliente
    ├── entregables/             ← URLs sitio/chatbot/CRM, accesos, repos
    ├── marca-y-assets/          ← catálogos, logos, IG/FB, paleta
    │  ── técnico ──
    ├── architecture.md          ← arquitectura del bot (cuántos agentes, modelo, flujo)
    ├── prompts/                 ← los prompts que corren, + `_compiled/` listos para pegar
    └── test-prompts/            ← iteraciones versionadas (v1, v2, … ) para comparar
```

El **proceso de onboarding genérico** (el que se le manda a cualquier cliente) NO va acá: vive en `templates/onboarding/` — es reusable, no de un cliente.

## Cómo agregar un cliente nuevo

1. Copiar `_plantilla/` a `clients/<slug-del-cliente>/`.
2. Llenar `00-perfil.md`.
3. Tirar las transcripciones de llamadas en `llamadas/` y agregarles resumen + insights arriba.
4. Agregar la fila a tu registro **local** (ver abajo).

## El registro maestro

La tabla con los clientes reales (sector, servicios, estado, valor, mantenimiento, fecha de cierre)
**no vive en el repo**. Mantenela en tu copia local de este archivo, o en tu vault privado —
donde no se publique.

Columnas de la tabla, para que todos los clientes se registren igual:

| Cliente | Sector | Servicios | Estado | Valor | Mant./mes | Cerrado | Ficha |
|---|---|---|---|---|---|---|---|

## Leyenda de estados

`lead` → `propuesta` → `cerrado` → `onboarding` → `en desarrollo` → `producción` → `mantenimiento` → `pausado` / `cerrado-baja`

---

## Por qué esto no se versiona

Este repo es **público**. Las carpetas de clientes contenían perfiles de negocio, transcripciones
de llamadas, prompts de producción, assets de marca y contratos firmados con nombres reales —
datos de terceros que nunca debieron publicarse.

Se destrackearon el **2026-08-22** (`git rm --cached`, sin borrar del disco) y `clients/*` entró
al `.gitignore`.

### Si hacés `pull` y tu `clients/` desaparece

Es esperable: git borra localmente lo que se eliminó upstream. **Respaldá antes de pulsar pull.**
Existe una copia íntegra en el vault privado (`projects/_clientes-privado/`, 98 archivos) —
copiala de vuelta a `clients/` y el `.gitignore` ya evita que se vuelva a subir.

### Lo que este cambio NO hace

**El historial de git sigue teniendo todo.** Destrackear evita publicar de acá en adelante, pero
los commits viejos son públicos y accesibles. Limpiar el historial exige reescribirlo
(`git filter-repo` + force-push), lo que rompe todos los clones y los PRs abiertos — se hace
como operación coordinada, cuando no haya nadie más trabajando.

### Referencias sueltas

Varios archivos de `memory/` citan rutas como `clients/<cliente>/prompts/…`. Siguen resolviendo
en tu disco; para alguien que clone el repo de cero, apuntan a carpetas que no existen. Es
intencional. Las skills que usan `clients/{cliente}/` como placeholder no se ven afectadas.
