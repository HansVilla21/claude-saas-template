# Awesome Claude Code Subagents — Notas para Hookly

## Origen
- **Repo:** https://github.com/VoltAgent/awesome-claude-code-subagents
- **Clonado el:** 2026-04-26
- **Total agentes en repo:** 131+ en 10 categorías

## Qué aporta
Colección curada de subagentes especializados para Claude Code. Cada uno es un `.md` con frontmatter `name`/`description` + prompt completo.

## Agentes instalados (2 de 131+ — cherry-pick estricto)

| Agente | Para qué |
|---|---|
| `security-auditor` | Auditar código contra OWASP, secrets, vulnerabilidades comunes (input validation, auth, crypto). Complementa `code-reviewer` (genérico) con foco específico en seguridad. |
| `penetration-tester` | Probar el SaaS antes de lanzar — endpoints expuestos, lógica de negocio explotable, escalación de privilegios. |

## Por qué solo 2

Hookly ya tiene 9 agentes propios bien diseñados (orquestador, arquitecto, scraping-engineer, ia-engineer, frontend-builder, backend-builder, billing-engineer, code-reviewer, debugger). El resto del repo es redundante o no aplica:

| Agente del repo | Por qué NO se trajo |
|---|---|
| `code-reviewer` | Ya tenemos uno propio |
| `debugger` | Ya tenemos uno propio |
| `accessibility-tester` | Cubierto por `web-design-guidelines` skill |
| `prompt-engineer` | Cubierto por nuestro `ia-engineer` |
| `qa-expert`, `test-automator` | No aplica al MVP, evaluar en V1 |
| `chaos-engineer`, `error-detective` | Over-engineering para MVP |
| `compliance-auditor` | Útil para V3 cuando hagamos GDPR/CCPA. Por ahora no |
| `architect-reviewer` | Solapa con nuestro `arquitecto` |
| `performance-engineer` | Cubierto por `vercel-react-best-practices` y `gsap-performance` |
| `ui-ux-tester` | Cubierto por suite ui-ux-pro-max + emil-design-eng |
| `ad-security-reviewer` | Específico ads, no aplica |
| `ai-writing-auditor` | No aplica |
| `powershell-security-hardening` | Hookly no usa PowerShell core |

Los 100+ restantes (categorías 01-core-development, 02-language-specialists, 03-infrastructure, etc.) son redundantes con nuestros agentes propios o no aplican al MVP.

## Cómo se relaciona con lo que ya tenemos

Cuando se necesite auditoría de seguridad de Hookly, el orquestador delega a:
- `security-auditor` para revisar código en busca de vulnerabilidades genéricas
- `penetration-tester` para probar el SaaS funcionando contra ataques
- Junto con skills `owasp-security` (referencia) y suite `supabase-pentest` (específico Supabase)
