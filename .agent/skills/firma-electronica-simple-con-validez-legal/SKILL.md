# Skill: Firma electrónica simple con validez legal (sin comprar DocuSign)

## Cuándo usar esta skill

- El cliente necesita que alguien **firme un documento** desde el sistema: contrato, consentimiento,
  autorización, acuerdo de servicio.
- Estás por integrar DocuSign / HelloSign y el volumen no lo justifica.
- Ya hay un flujo de "firma" que en realidad es **un checkbox** o un `<canvas>` para dibujar con el
  dedo — y nadie verificó si eso prueba algo.
- El documento tiene que quedar **firmado por las dos partes** y archivado.

**Costo de no usarla:** una "firma" sin rastro de identidad ni de integridad no prueba nada el día
que alguien la desconoce. Y un dibujo en un canvas es **menos** verificable que un código enviado
por correo, aunque parezca más una firma.

---

## Por qué existe esta skill

En muchos países la **firma electrónica simple** es válida para contratos privados: no hace falta
certificado digital ni un tercero de confianza. Lo que sí hace falta es poder demostrar dos cosas:

1. **Quién firmó** — identidad razonablemente verificada y un rastro que lo acredite.
2. **Qué firmó** — que el documento no cambió después de la firma.

La segunda es la que casi siempre falta. Un PDF firmado que se puede regenerar distinto no acredita
nada: hay que **congelar el documento y guardar su huella**.

> ⚖️ El marco legal es **local**. En Costa Rica es la **Ley 8454** (firma electrónica simple para
> actos privados). En tu país el nombre y los requisitos cambian. **Esto no es asesoría legal**: el
> patrón técnico es el mismo, pero quién puede firmar qué lo confirma el abogado del cliente. Dejá
> escrito en el proyecto bajo qué marco se construyó.

---

## Proceso

### 1. Tres pasos, en este orden

```
1. IDENTIDAD      la persona declara quién es (documento de identidad)
2. VERIFICACIÓN   código de un solo uso al canal que YA está en el contrato
3. CONFIRMACIÓN   ve el documento final y confirma explícitamente
```

El paso 2 es el que convierte "alguien tocó un botón" en "el titular de ese correo tocó el botón".
Y el código va **al correo que ya figura en el contrato**, no a uno que el firmante escriba en ese
momento — si no, se verifica a sí mismo.

Parámetros que funcionaron: **6 dígitos, vence en 10 minutos, máximo 3 intentos**. Después del
tercero se invalida y hay que pedir uno nuevo: sin eso, seis dígitos se adivinan por fuerza bruta.

### 2. El rastro de auditoría, en la fila de la firma

Al confirmar, se guarda junto al firmante:

```
nombre declarado · documento de identidad · IP · user agent · timestamp (con zona)
```

Y el **hash SHA-256 del PDF exacto que se le mostró**. Ese hash es la prueba de integridad: si
mañana alguien discute el contenido, se recalcula y se compara.

### 3. Congelar el documento, no regenerarlo

Esta es la parte que se hace mal. Si el PDF se **genera al vuelo** cada vez que alguien lo abre,
un cambio en la plantilla o en un dato cambia el documento firmado retroactivamente.

Al firmar: se genera el PDF **una vez**, se guarda el archivo, se calcula el hash, y a partir de
ahí **siempre se sirve ese archivo**. La plantilla puede evolucionar; los contratos ya firmados no.

### 4. La página de certificado

El PDF firmado = el contrato + **una página final de certificado** con:

- quién firmó, con qué documento, desde qué IP, cuándo (las dos partes)
- el hash del documento
- el marco legal bajo el que se firmó

Es lo que convierte el archivo en algo que se puede presentar. Y es lo que el cliente muestra
cuando alguien pregunta "¿esto tiene validez?".

### 5. Firma bilateral: dos firmas, un documento

Si firman las dos partes, el flujo se repite para cada una y **el certificado acumula ambas**. El
contrato no pasa a "firmado" hasta que están las dos. Estados explícitos:

```
borrador → enviado → firmado por A → firmado por ambas → archivado
```

Nunca un booleano `firmado`. Con dos partes, un booleano no puede representar la mitad.

### 6. El portal del firmante, sin cuenta

La contraparte **no debería tener que crearse un usuario** para firmar. Un enlace con token único
por firmante alcanza — y ese token **es** el control de acceso de esa ruta pública, así que:

- token largo y aleatorio, uno por firmante (no por contrato)
- que venza
- que la ruta esté en la allowlist pública **con su control propio**, nunca abierta

(Ver `service-role-con-cookies-fuga-de-pii`: una ruta pública sin control propio es una ruta
abierta.)

### 7. Probarlo entero, incluyendo lo que debe fallar

- código vencido → rechaza
- cuarto intento → invalida y obliga a pedir otro
- token de otro firmante → no da acceso
- documento alterado después de firmar → el hash **no** coincide
- descargar el PDF firmado meses después → **byte por byte igual**, con su certificado

---

## Output esperado

- Flujo de 3 pasos con código de un solo uso al canal ya registrado.
- Rastro de auditoría completo por firmante (identidad, IP, user agent, timestamp).
- PDF **congelado** + hash SHA-256 guardado.
- Página de certificado con ambas firmas y el marco legal citado.
- Estados explícitos, no un booleano.
- Enlace por token único, con vencimiento, y la ruta pública con su propio control.
- El marco legal aplicable escrito en la documentación del proyecto.

---

## Gotchas / antipatrones

- 🔴 **Regenerar el PDF en cada visita.** El documento firmado tiene que ser un archivo, no una
  función.
- 🔴 **Mandar el código a un correo que el firmante escribe en ese momento.** Se verifica solo.
- 🔴 **Un booleano `firmado` con dos partes.** No puede representar la mitad del estado.
- 🔴 **Canvas de dibujo como única prueba.** Parece más una firma y acredita menos.
- ⚠️ **Sin límite de intentos**, seis dígitos son adivinables.
- ⚠️ **Token por contrato en vez de por firmante.** Una parte puede firmar por la otra.
- ⚠️ **Timestamp sin zona.** Un rastro de auditoría con hora ambigua vale la mitad.
- ⚠️ **Presentarlo como asesoría legal.** El patrón es técnico; el encuadre lo confirma el abogado
  del cliente.

---

## Ejemplo concreto (Grandir CRM, contratos de inversión)

Fondo de inversión costarricense: los contratos los firman el inversionista y la administradora.

Flujo: **identidad (cédula) → código de 6 dígitos al correo del contrato (10 min, 3 intentos) →
confirmación**. Se guarda nombre, cédula, IP, user agent y timestamp en `contract_investors`, más
el **hash SHA-256** del documento. El PDF firmado es el contrato + una **página de certificado**
al final. Marco: **Ley 8454** de Costa Rica (firma electrónica simple). Después se sumó la **firma
bilateral** para que la administradora firme también (commit `6b306c2`).

El inversionista firma desde un **portal por token**, sin cuenta: el sistema no le pide crearse un
usuario para firmar su propio contrato.

---

## Skills relacionadas

- `service-role-con-cookies-fuga-de-pii` — el portal por token es una ruta pública: necesita su
  propio control.
- `borrar-entidad-con-fk-no-action` — ⚠️ la auditoría de firma **no** debería caer por CASCADE
  cuando se borra un contrato.
- `subir-archivos-grandes-sin-pasar-por-el-servidor` — para el PDF congelado y los adjuntos.
