# Skill: Definir Avatar

## Cuándo usar

- Cuando ya elegimos un ICP primario (vía `evaluar-icp`) y necesitamos aterrizarlo en una persona específica
- Para producir un avatar que copywriters, designers y product designers usen como referencia constante
- Antes de escribir landing copy, ads, o decidir features que requieren empatía profunda

**Diferencia clave con ICP:**
- ICP = el segmento ("coaches hispanos de productividad")
- Avatar = la persona ("Andrea, 34, CDMX, vende programa de 8 semanas a $497, factura $8K/mes...")

Hormozi: "Si no podés decirle a tu mamá quién es exactamente tu cliente, todavía no tenés avatar."

## Proceso

### Paso 1: Recoger todo el material previo
Antes de empezar, leer:
- `docs/positioning/icp-evaluation-[icp].md` — el evaluation que validó este ICP
- `docs/positioning/pains-discovered.md` — los pains documentados
- Quotes literales de fuentes — buscar las 5-10 más representativas de este ICP

### Paso 2: Construir el avatar en 7 capas

Cada capa se llena con evidencia. **Si una capa no se puede sostener con evidencia o lógica clara, marcarla como hipótesis a validar.**

```markdown
# Avatar: [Nombre realista]

## Capa 1: Identidad básica
- **Nombre:** [Andrea, Carlos, Mariana — usar nombre real, no "el cliente"]
- **Edad:** [rango específico, ej 32-38]
- **Ubicación:** [ciudad o región — CDMX, Bogotá, San José, Madrid]
- **Estado civil + hijos:** [relevante si afecta decisiones]
- **Educación:** [nivel + área]

## Capa 2: Negocio / rol
- **Qué hace exactamente:** [no "coach" — "coach de productividad para mujeres profesionales 28-45"]
- **Modelo de negocio:** [cursos digitales, 1:1, membership, agencia, B2B]
- **Tickets que cobra:** [rango: $200/sesión, $497/programa, $2K/mastermind]
- **Facturación mensual:** [rango realista basado en su modelo]
- **Tamaño de equipo:** [solo, +VA, equipo de 3-5, etc.]
- **Años en el negocio:** [novato 0-2, intermedio 2-5, establecido 5+]

## Capa 3: Día típico
[Narrativa de un día normal — qué hace en la mañana, cuándo crea contenido, cuándo trabaja con clientes, cuándo publica]

## Capa 4: Stack tech actual
- **Plataformas:** [IG, TikTok, YouTube, LinkedIn, etc.]
- **Tools que usa:** [Notion, Canva, ChatGPT, edición, scheduling tool, CRM, plataforma de cursos]
- **Tools que paga:** [específicas con precio aproximado]
- **Cuánto gasta/mes en software:** [presupuesto realista]

## Capa 5: Pains primarios (con quote)
> Quote literal del pain principal (de pains-discovered.md)

- **Pain #1:** [Descripción + por qué duele]
- **Pain #2:** [...]
- **Pain #3:** [...]

## Capa 6: Aspiraciones y status
- **Resultado del sueño:** [Qué quiere lograr — Hormozi style: tangible, específico]
- **Cómo mide éxito:** [métricas que le importan: seguidores, ventas, libertad, autoridad]
- **Status que persigue:** [percepción ante quién — pares, audiencia, familia]
- **Objeciones probables:** [qué le hace dudar de comprar herramientas como Hookly]

## Capa 7: Awareness y comportamiento de compra
- **Awareness level:** [Problem-aware / Solution-aware / Product-aware]
- **Cómo descubre tools:** [recommendations de pares, content marketing, ads, podcasts]
- **Tiempo de evaluación:** [compulsivo, 1-3 días, semanas]
- **Trigger de compra:** [qué momento o emoción dispara la decisión]
- **Quien aprueba:** [solo, pareja, partner del negocio, gerente]
```

### Paso 3: La frase de ascensor (elevator pitch del avatar)
Comprimir todo en una frase de 2-3 líneas que cualquier miembro del equipo pueda recordar:

> "Andrea, 34, coach de productividad para mujeres profesionales latinoamericanas en CDMX. Vende un programa de 8 semanas a $497 USD. Factura $8-15K/mes. Su mayor pesadilla es el lunes en la mañana cuando se sienta a planear contenido y se queda 2h paralizada sintiendo que ya no tiene nada nuevo que decir."

Si no podés comprimirlo en 3 líneas, el avatar no está claro.

### Paso 4: Test de tracción
Cinco preguntas que el avatar debe pasar para considerarse útil:

1. **Test del nombre:** ¿podés ponerle nombre propio? ☐
2. **Test de la cara:** ¿podés imaginar su cara con detalle? ☐
3. **Test del feed:** ¿sabés qué postea típicamente en IG? ☐
4. **Test del miércoles:** ¿sabés qué está haciendo este miércoles a las 3pm? ☐
5. **Test de la objeción:** ¿podés anticipar 3 objeciones específicas que tendría a Hookly? ☐

Si fallás en cualquiera, volvé al Paso 2 y profundizá esa capa.

### Paso 5: Implicaciones de producto/copy
Cerrar con una sección que conecta el avatar con decisiones concretas:

```markdown
## Implicaciones para Hookly

### Copy
- **Lenguaje:** [tono que resuena — directo, cálido, profesional, irreverente]
- **Hook que funcionaría:** [ejemplo concreto basado en pain primario + awareness level]
- **Palabras a evitar:** [tecnicismos que la alienan, términos que ya están saturados]

### Features que prioriza
- [Top 3 features que más le importarían, justificadas por sus pains]

### Features que NO le importan (descartar de roadmap si solo son para ella)
- [Lista]

### Pricing tentativo
- [Rango que pagaría sin friction, basado en willingness-to-pay del ICP]

### Canales para alcanzarla
- [Específicos: qué podcasts escucha, qué grupos FB, qué hashtags sigue]
```

## Output esperado

Markdown completo guardado en `docs/positioning/avatar-[nombre].md`. Si hay 3 avatares (1 primario + 2 adyacentes), 3 archivos separados + un `avatar-comparison.md` con resumen.

Después de crear el avatar, **actualizar `memory/posicionamiento.md`** con la frase de ascensor y los pains primarios — esto se vuelve referencia para todos los agentes.

## Reglas

- **Nombre real, no genérico** — "Andrea" no "el cliente ideal"
- **Ubicación específica** — "CDMX" no "LATAM"
- **Tickets numéricos** — "$497" no "vende cursos"
- **Pains con quote** — citas literales de research, no inventadas
- **Awareness explícito** — sin esto, el copy va a fallar
- **Implicaciones concretas** — el avatar no sirve si no llega a decisiones de producto

## Ejemplo de avatar bien hecho

> **Andrea, 34, CDMX. Coach de productividad para mujeres profesionales 28-45. Programa de 8 semanas a $497 USD. Factura $8-15K/mes. 18K seguidores en IG, 4 años creando contenido. Tiene una VA y un editor part-time. Su pesadilla es el lunes a las 9am cuando se sienta a planear y se queda paralizada 2h sintiendo que se está repitiendo. Postea reels martes y jueves con esfuerzo brutal. Pagaría $79/mes por una tool si le ahorra 6h semanales sin sonar genérica."

## Anti-ejemplo (qué NO hacer)

> **"Coach hispano que crea contenido y quiere mejorar su productividad."**

Esto es ICP, no avatar. No tiene nombre, edad, ubicación, ticket, equipo, día típico, ni quote. Inútil para tomar decisiones de copy.
