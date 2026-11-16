# Skill: El botón "Llamar" que abre la app equivocada (softphone vs teléfono)

## Cuándo usar esta skill

- Vas a poner un botón **"Llamar"** en un CRM, un panel de ventas, una ficha de contacto.
- El cliente dice *"toco llamar y me abre FaceTime / Skype"*, o *"no me sirve, yo llamo por otro
  lado"*.
- El equipo usa un **softphone** (Zoiper, MicroSIP, Bria, 3CX, un cliente SIP) porque tienen
  una central VoIP y no marcan desde el celular.

**Costo de no usarla:** el botón existe, se toca, abre la app equivocada, y el vendedor deja de
usarlo. Una feature muerta que en el tablero figura como entregada.

---

## Por qué existe esta skill

`tel:` es el esquema obvio y en escritorio hace lo contrario de lo que querés.

- **En un celular**, `tel:` abre el marcador nativo. Perfecto.
- **En una Mac**, `tel:` **se lo queda FaceTime** — está registrado de fábrica y gana. El usuario
  ve una llamada de FaceTime a un número que no tiene FaceTime.
- **En Windows**, `tel:` suele caer en Skype si está instalado, o en nada.

El esquema que registran los softphones al instalarse es **`callto:`**. Es viejo (nació con
NetMeeting/Skype) y por eso mismo funciona: Zoiper lo toma, y FaceTime **no** lo toca. Resultado:
el clic cae directo en el softphone, **sin que el cliente configure nada**.

La segunda mitad: **la decisión depende del dispositivo**, y eso choca con el renderizado en
servidor. Decidir el `href` durante el render produce desajuste de hidratación — el servidor no
sabe desde qué aparato se abrió la página.

---

## Proceso

### 1. Elegir el esquema por dispositivo, después de montar

```tsx
const [esEscritorio, setEsEscritorio] = useState(false)

useEffect(() => {
  // se decide en el cliente, ya montado: sin desajuste de hidratación
  setEsEscritorio(!/Android|iPhone|iPad|iPod/i.test(navigator.userAgent))
}, [])

const esquema = esEscritorio ? "callto:" : "tel:"
<a href={`${esquema}${soloDigitos(telefono)}`}>Llamar</a>
```

- **Escritorio → `callto:`** (softphone).
- **Mobile → `tel:`** (marcador nativo). No lo cambies: en el celular `tel:` es correcto.
- Rendé `tel:` como valor inicial y ajustá en el efecto — así el enlace nunca queda muerto si el
  JS tarda.

### 2. Normalizar el número

Quitá espacios, guiones y paréntesis. Dejá el `+` si hay código de país. Un `+506 8888-8888`
crudo en el `href` no marca en varios clientes SIP.

### 3. Preguntar qué softphone usa, y probarlo

**`callto:` no es exclusivo de Zoiper.** Skype también lo registra. Si el cliente tiene los dos,
gana el que Windows/macOS tenga asociado, y puede no ser el que quiere.

- Si abre la app equivocada → probar **`sip:`** (más específico de VoIP, no lo toma Skype).
- Es un cambio de una línea. **Anotá esta alternativa en el traspaso**, para que no haya que
  redescubrirla.

### 4. Decir dónde termina el botón

Un enlace **abre el marcador**. No registra la llamada, no muestra la ficha al contestar
(*screen-pop*), no graba, no mide. Eso es **integración telefónica de verdad** (API del proveedor
VoIP o webhooks de la central) y es un desarrollo aparte. Decilo cuando entregás el botón, no
cuando el cliente lo pida como si estuviera incluido.

---

## Output esperado

- Botón "Llamar" que cae en el softphone en escritorio y en el marcador en el celular.
- Sin configuración por parte del cliente.
- Sin desajuste de hidratación.
- La alternativa `sip:` anotada, y el alcance ("abre el marcador, no registra la llamada") dicho.

---

## Gotchas / antipatrones

- 🔴 **`tel:` en escritorio.** Es el default y es el bug.
- 🔴 **Decidir el `href` durante el render en servidor.** Desajuste de hidratación.
- ⚠️ **Suponer que `callto:` siempre cae en el softphone.** Skype pelea por el mismo esquema.
- ⚠️ **Vender el botón como "integración telefónica".** Es un enlace. La integración se cotiza.
- ⚠️ **Cerrarlo sin que el cliente lo pruebe.** Depende de qué tenga instalado; es la única
  verificación que no podés hacer vos.

---

## Ejemplo concreto (CRM Josué R. Miranda, #8, 2026-08-17)

Josué usa **Zoiper** en su Mac. El botón "Llamar" usaba `tel:` y **FaceTime se lo robaba**.
Cambiado a `callto:` en escritorio (`tel:` en mobile, decidido por user agent tras montar) en
`LeadActions.tsx` → cae directo en Zoiper sin configurar nada. Commit `53ced38`, EN VIVO.

Anotado en el traspaso: si aparece Skype, pasar a `sip:`. Y que la integración de verdad
(registrar la llamada en el CRM, screen-pop, analítica) es desarrollo a cotizar.

---

## Segundo caso: elegir el canal (Zoiper, WhatsApp o Zoom) — CRM de Josué, 2026-10-25

El cliente pidió que «Llamar» deje elegir desde dónde, «para ir llamando uno tras otro sin
salirme». Lo que enseñó:

- **Revisá en la grabación quién pidió cada canal.** El ticket decía «WhatsApp, Zoiper o Zoom»,
  pero Zoom lo había dicho el consultor: el cliente pidió WhatsApp y Zoiper. Casi se le pregunta
  si tenía Zoom Phone por un canal que nunca pidió.
- **WhatsApp no tiene enlace para EMPEZAR una llamada a una persona.** Los enlaces de llamada son
  solo para números de empresa y no andan en la computadora. `wa.me/<número>` abre el chat y la
  llamada se toca ahí: el botón dice «Abrir chat», no «Llamar».
- **`wa.me` necesita el número con código de país.** `wa.me/88887777` (8 dígitos de Costa Rica,
  sin el 506) y WhatsApp dice que el número no es válido. Le pasaba al 60 % de la base y nadie lo
  había notado, porque el botón «abría algo». Regla:
  - 8 dígitos → anteponer el país del negocio;
  - con `+` o `00` → ya trae el país;
  - 11 o más dígitos → se toma como que lo trae;
  - **7, 9 y 10 no se adivinan.** Un 10 sin `+` es un número de EE. UU. sin el 1, y
    `wa.me/3055551234` cae en Grecia. Mejor no ofrecer el botón que llamar al país equivocado.
- **Zoom marca solo con Zoom Phone:** `zoomphonecall://+<E.164>`, documentado por Zoom junto a
  `callto:` y `tel:`. Con Zoom Meetings no llama a teléfonos.
- **Casillas viejas con varios números** («2222-3333 / 8888-7777», cientos de contactos importados
  antes de separar teléfonos): partilas con el mismo normalizador del importador ANTES de armar el
  `href`, o se marca un número de 16 dígitos que no existe. El regex de extensión tiene que
  aceptar paréntesis: «(EXT 101)» se pegaba al número.
- **El canal elegido se recuerda en esa computadora**, en `localStorage`, leído con
  `useSyncExternalStore` y con el canal por defecto en el servidor: sin desajuste de hidratación.
  Los números de la ficha marcan directo por ese canal, que es lo que permite llamar uno tras
  otro. En modo privado `localStorage` tira: guardalo también en memoria de la pestaña.
- **El iPad se presenta como «Macintosh».** Para decidir entre `tel:` y `callto:`, sumá
  `navigator.maxTouchPoints > 1`.
- **La computadora del cliente era Windows, no Mac** (llamada del 18/08, después del ejemplo de
  arriba). Ahí `callto:` no tenía dueño y Windows ofrecía buscar una app en la Microsoft Store.
  Zoiper tiene que quedar elegido para el protocolo CALLTO: en Windows, Configuración →
  Aplicaciones → Aplicaciones predeterminadas → por protocolo; o en Zoiper, Settings → Advanced.
  Es configuración del cliente: pedila explícita, y el ticket no se cierra hasta que «Llamar»
  abra el softphone en SU máquina.

---

## Skills relacionadas

- `reporte-de-traspaso-del-proyecto` — dónde se anotan la alternativa y el alcance.
- `verificar-funcionamiento-end-to-end` — lo que solo el cliente puede probar, se pide explícito.
