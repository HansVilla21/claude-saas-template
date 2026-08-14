---
cliente: Givi
slug: givi
estado: produccion   # ya usan el CRM a diario; el chatbot es lo que falta
servicios: [crm, chatbot]
valor_contrato_usd: 0        # ⚠️ pendiente confirmar con Hans
mantenimiento_mensual_usd: 0 # ⚠️ pendiente confirmar con Hans
fecha_cierre:
onboarding:
pais: Costa Rica (leads también de Panamá)
sector: SaaS / app de fidelización y lealtad para comercios
ultima_actualizacion: 2026-08-13
---

# Ficha de cliente — Givi

> App de fidelización (sellos / lealtad digital) para comercios. Ya usan el CRM en producción
> con su equipo; hoy todo el WhatsApp lo contestan humanos y el chatbot está en construcción.

**Todo lo técnico de esta ficha está verificado contra la base viva el 2026-08-13** — no hay dato
supuesto. Lo que falta está marcado con ⚠️.

> **Nota:** este repo es **público**. Los datos de contacto del equipo de Givi y sus métricas de
> embudo (volumen de leads, tasas de conversión, tiempos de respuesta) **no van acá** — se
> consultan directo en el CRM. En esta ficha va solo lo técnico y lo de proceso.

## 1. Personas / stakeholders

| Persona | Rol | Notas |
|---|---|---|
| Pietro | owner del tenant | también admin de Momentum (socio de Hans) |
| Tayshaun | admin | **es quien toma las demos** ("te va a atender Tayshan") |
| Cristel ("Cris") | admin | **la setter** que atiende el WhatsApp en horario de oficina |
| Tania | admin | |
| Kevin | admin | |
| Alejandro | (sin usuario en el CRM) | aparece como segundo demo-taker en los mensajes |
| Hans | admin (soporte) | |

## 2. El negocio

- **Qué venden:** Givi, sistema de fidelización digital para comercios (bares/restaurantes,
  retail, servicios). Reemplaza la tarjeta de sellos de papel: el cliente acumula en Apple Wallet
  o Google Pay, sin instalar app.
- **Cómo venden hoy:** **Meta Ads → click-to-WhatsApp**. Casi todos los leads entran con uno de
  4 mensajes prearmados del anuncio, del tipo *"Hola! Me gustaría saber cómo funciona Givi para
  fidelizar a mis clientes"*. Eso significa que el primer turno del bot es predecible.
- **Herramientas actuales:** el CRM (`/a/givi`), WhatsApp vía YCloud (`+50672058046`),
  Google Meet para las demos, Fillout para que el lead agende.
- **Horario declarado:** L-V 08:00–18:00, `America/Costa_Rica`. Plan `trial`.

### El proceso comercial que corre hoy (reconstruido de conversaciones reales)

1. Entra el lead del anuncio con el mensaje prearmado.
2. Saludo + **"qué tipo de negocio tenés?"**
3. **"cuántos clientes tenés en promedio al mes?"**
4. **"han usado sistemas de lealtad antes? sellos, cupones, algo así?"**
5. Corte a la demo — el pitch es casi verbatim en todas las conversaciones: que lo vea
   funcionando con datos de negocios reales, reunión corta por Google Meet, sin compromiso,
   la atiende Tayshan.
6. Propone día/hora → pide **correo** → manda la invitación → confirma que llegó.

**Por qué importa:** el guion humano es muy consistente, así que el prompt del bot **clona una
voz que ya existe** en vez de inventarla. Las 3 preguntas de calificación ya están
estandarizadas.

## 3. Qué resuelve el chatbot

El dolor es de **tiempo de primera respuesta**: los leads entran de los anuncios a toda hora,
incluidas noches y fines de semana, y el equipo los atiende en horario de oficina. Lo que se
pierde por esperar está medido en el CRM (no se copia acá, ver nota de arriba).

Por eso la especificación del cliente define el bot como **la setter fuera de horario**, no
como un reemplazo de Cris.

## 4. Estado técnico verificado (2026-08-13)

| Pieza | Estado |
|---|---|
| Tenant `givi` | ✅ activo, plan `trial`, TZ `America/Costa_Rica` |
| Equipo | ✅ 5 usuarios de Givi + Hans (soporte) |
| Funnel | ✅ 10 etapas, orientado a **agendar llamada** |
| Canal WhatsApp | ✅ `agency_channels`: `+50672058046`, provider `ycloud`, activo |
| Módulo | ✅ `catalog-servicios` habilitado — pero **catálogo vacío (0 items)** |
| Prompts | ✅ `bot_config.agent_prompts.{principal,objeciones}` cargados (2026-08-13) |
| Bot de producción | ❌ `settings.bot_enabled = false` — **a propósito**, todavía no se activa |

**Etapas del funnel:** Nuevo → En conversación → Llamada agendada → Llamada tomada →
No show sin respuesta → No show en conversación → Llamada reagendada → Lead no responde →
Cliente (`is_won`) → Descartado (`is_lost`).

### Dos gotchas encontrados acá

⚠️ **`bot_enabled` estaba acoplado al playground.** El gate `Config Usable?` del workflow
`bot-test-playground` exigía `bot_enabled = true`, que es la MISMA bandera que lee el gate
"Chatbot Activado?" del bot de producción. Como Givi ya tiene número vivo y las conversaciones
nuevas nacen con `handler='bot'`, probar el bot obligaba a armar producción. **Arreglado el
2026-08-13** (`crm-v2/scripts/build-playground-gate-desacoplar-bot-enabled.js`): la condición
pasó a `bot_enabled = true` **OR** `agent_prompts.principal` no vacío. Aditivo, sin regresión.
Quedó invisible hasta Givi porque Roberto y El Canal no tienen número conectado.

⚠️ **El `phone_number` de Givi está guardado con `+`** (`+50672058046`) mientras que Jacó y
Momentum están sin `+`. La resolución de tenant normaliza a dígitos, pero hay que verificarlo
end-to-end antes de dar por conectado el bot de producción.

## 5. Alcance

- ✅ Prompts del bot (principal + objeciones) — ver `prompts/`
- ✅ Cargados a `bot_config` y probados en `/a/givi/probar-bot`
- ⏳ Ventanas de horario del bot (§2 de la spec del cliente) — **no implementado**
- ⏳ Mapeo de campos de captura al CRM (§9 de la spec) — **no implementado**
- ⏳ Activación en producción — **no hacer sin decisión explícita**

## 6. Comercial / deal

⚠️ Sin datos en el repo. Falta: total, pago, mantenimiento, correos de facturación.

## 7. Próximos pasos

- [ ] Confirmar los pendientes de la §14 de la spec del cliente: precio exacto a comunicar
      (el adelanto autorizado es "menos de $9/mes"; falta confirmar el plan Essential) y el
      link del video demo (hoy **no existe**, por eso el prompt no lo promete)
- [ ] Definir cómo se resuelve la ventana de horario (por ruteo en el workflow)
- [ ] Confirmar los datos comerciales (§6)
- [ ] Confirmar si el catálogo de `catalog-servicios` se va a usar o se apaga

## 8. Notas estratégicas

- El cierre NO es handoff a un humano como en Mateo: el lead **agenda solo** en el link de
  Fillout. Eso cambia la etapa final del flujo respecto al patrón de Momentum.
- El humano pide **correo** para mandar la invitación. Con Fillout ese dato lo captura el
  formulario, así que el bot no necesita pedirlo.
- La spec pide que el bot **nunca descarte** a un negocio chico o que está empezando: la
  calificación adapta el mensaje, no filtra leads.
- Aparecen leads de Panamá — confirmar si es mercado objetivo.

## 9. Enlaces internos

- Arquitectura de referencia más cercana: [momentum-ai-crm/architecture.md](../momentum-ai-crm/architecture.md)
- Proceso de alta de bot: `.agent/skills/onboarding-cliente-crm/SKILL.md`
- Script de provisión original: `crm-v2/scripts/provision-givi.js`
- Carga de prompts: `crm-v2/scripts/load-givi-prompts.js`
