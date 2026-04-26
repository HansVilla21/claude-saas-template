# Claude Code Security Hooks — Notas para Hookly

## Origen
- **Repo:** https://github.com/slavaspitsyn/claude-code-security-hooks
- **Clonado el:** 2026-04-26

## Qué aporta
**7 capas de defensa contra prompt injection.** Hooks shell que se ejecutan ANTES de cada tool call de Claude para bloquear acciones peligrosas (lectura de credenciales, exfiltración de claves, encoding sospechoso de secretos).

## ⚠️ Instalación GLOBAL por diseño
Estos hooks SON del sistema del usuario, no del proyecto. Protegen contra prompt injection en TODOS los proyectos donde corras Claude Code. Es excepción justificada a la regla "no instalar global sin permiso".

## Lo que se instaló (en `~/.claude/`, NO en el proyecto)

| Archivo | Ubicación | Qué hace |
|---|---|---|
| `security-guard.sh` | `~/.claude/hooks/` | Capa 1: bloquea credencial+network combo (curl --post-file de ~/.ssh/) |
| `read-guard.sh` | `~/.claude/hooks/` | Capa 2: bloquea lectura de ~/.ssh/, ~/.aws/, ~/.kube/, ~/.config/gcloud/ |
| `bash-read-guard.sh` | `~/.claude/hooks/` | Capa 3: bloquea cat/head/cp targeting credential files |
| Inline Edit guard | `~/.claude/settings.json` | Capa 4: bloquea modificación de ~/.claude/settings o ~/.claude/hooks vía Edit tool |
| Canary files | `~/.ssh/`, `~/.aws/`, etc. | Archivos trampa "DANGER ZONE" en directorios sensibles |

## Las 7 capas conceptuales (lectura del README)
1. Credential Exfiltration Guard (combinación credencial+network)
2. Read Guard (bloquea Read tool a directorios sensibles)
3. Bash Read Guard (bloquea cat/head a credentials)
4. Hook Self-Protection (no auto-modificación)
5. POST Whitelist (bloquea POST a dominios no-whitelist) — **opcional**, no instalado por default
6. Encoding Detection (base64/xxd de credenciales) — incluida en security-guard.sh
7. Canary Files (trampa de prompt injection)

## Auditoría de tus permisos al instalar
- ✅ "No dangerous broad permissions found" — tu `~/.claude/settings.json` no tiene `Bash(curl *)` ni similares abiertos. Buen estado.

## Configuración applicable (merged en settings.json)
```json
"hooks": {
  "PreToolUse": [
    { "matcher": "Bash", "hooks": [{ "command": "$HOME/.claude/hooks/security-guard.sh" }] },
    { "matcher": "Read", "hooks": [{ "command": "$HOME/.claude/hooks/read-guard.sh" }] },
    { "matcher": "Bash", "hooks": [{ "command": "$HOME/.claude/hooks/bash-read-guard.sh" }] },
    { "matcher": "Edit", "hooks": [{ "command": "INPUT=$(cat -); ... bloquea .claude/settings y .claude/hooks" }] }
  ]
}
```

## Cosa importante a saber
- A partir de ahora, intentar editar `~/.claude/settings.json` o `~/.claude/hooks/*` con la herramienta Edit DEBE estar bloqueado. Solo se puede modificar conscientemente desde otra herramienta (ej. terminal manual).
- Esto incluye al MIO Claude — si me pides cambiar configs de seguridad globales, voy a tener que hacerlo de forma manual con tu OK explícito.
