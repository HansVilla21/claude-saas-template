# Rituales Operativos del Founder

Acciones recurrentes que el founder pidió que Claude le recuerde activamente — en vez de depender de calendar / agendas externas, Claude verifica fecha y disparalas.

**Cargar este archivo al inicio de cada sesión nueva** junto con `session-handoff-*.md`.

---

## 🔒 Backup semanal Momentum AI CRM

**Status:** activo desde 2026-06-04

**Frecuencia:** semanal (~7 días). Founder prefiere domingo de noche pero es flexible.

**Comando:** `node crm-v2/scripts/backup-db.mjs`

**Después de correr:** mover el `.dump` generado (en `crm-v2/backups/YYYY-MM-DD_HHMM_momentum-full.dump`) a **Google Drive / Dropbox / disco externo**. Mantener últimos 4 backups.

**Razón:** Supabase está en plan free → NO hay backup automático nativo. Sin este ritual, un drop catastrófico de la DB = data perdida permanente.

**Patrón Claude:**

1. Al **inicio de cada sesión nueva**, leer este archivo + revisar `### Historial` abajo.
2. Calcular días desde el último backup (`now() - última fecha de historial`).
3. **Si > 7 días:** recordar al founder con frase tipo:
   > *"Pasaron N días desde el último backup. ¿Te recuerdo correr `node crm-v2/scripts/backup-db.mjs`?"*
4. **Si > 14 días (escalación):**
   > *"Llevamos N días sin backup — riesgoso. ¿Lo corremos ya?"*
5. Si el founder lo corre durante la sesión, **agregar entrada nueva** al historial con la fecha + tamaño + path del `.dump`.
6. Si el founder dice "ya lo moví al Drive", marcar en el historial.

**Cuando deja de aplicar:** cuando el founder upgradee a Supabase Pro (backup automático nativo) → deprecar este ritual + actualizar este archivo.

### Historial de backups

| Fecha | Tamaño | Path local | ¿Movido al Drive? |
|---|---|---|---|
| 2026-06-04 22:51 CR | 0.49 MB | `crm-v2/backups/2026-06-05_04-51_momentum-full.dump` | ❌ pendiente founder |

---

## 📊 Verificar `/master/salud` durante ads

**Status:** disparar cuando arranquen Meta Ads (~2026-06-11)

**Frecuencia:** 2-3 veces al día durante la primera semana de tráfico pagado.

**Acción founder:** abrir `https://momentum-ai-crm.vercel.app/master/salud` desde el celular y revisar los 5 bloques en verde.

**Patrón Claude:** cuando founder mencione en chat que arrancaron las ads, agregar a esta sección con fecha → en sesiones siguientes recordar "¿revisaste hoy el dashboard de salud?" si no se mencionó.

### Historial

- Aún no iniciado (espera Meta Ads ~2026-06-11)

---

## 📝 Convenciones del archivo

- Cada ritual nuevo se agrega como sección H2 con: status, frecuencia, comando/acción, razón, patrón Claude, historial.
- Cuando un ritual se vuelve innecesario (founder upgrade plan, etc.), **NO borrar** — mover a sección "## Rituales deprecados" al fondo con fecha + razón.
- El historial es append-only — nunca borrar entradas.
