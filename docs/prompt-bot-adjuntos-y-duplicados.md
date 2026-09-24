# Prompt para la sesión del bot: mensajes repetidos y adjuntos en el chat

Pégalo tal cual. Viene de lo que pidió el dueño el 24-sep-2026: *«valídame la duplicación de mensajes
al darle doble clic rápidamente, la visualización de imágenes/documentos del cliente, o que se mande
desde el panel»*.

**El panel ya está hecho y no hace falta tocarlo.** Lo que falta es del bot. Mientras no esté, el
panel se comporta así:
- lo del doble clic ya está arreglado en el panel; lo que queda abierto son los reenvíos de la cola
  (sección 1);
- el chat enseña fotos y documentos **en cuanto existan las columnas** (sección 2); hasta entonces
  solo sale el texto, como hoy;
- el clip de adjuntar sube el fichero y lo encola, pero si el bot no devuelve `media: true`, el
  panel avisa: *«El texto salió, pero el archivo no: el bot todavía no envía adjuntos»*.

> Revisado el 24-sep-2026 leyendo el repo `vendemia` (con los cambios de «el negocio escribe primero»
> ya puestos, sin commitear). Rutas del repo del bot.

---

## 1 · Que un mensaje del panel no salga dos veces

### Lo que ya resuelve el panel

Doble clic y Enter mantenido: la puerta se cierra con un ref antes del segundo evento. Eso no llega
nunca al bot.

### Lo que NO puede resolver el panel, y por qué

1. **El bot tarda más de 15 s.** `useComando` deja de esperar y enseña *«Guardado, se está
   aplicando»*. El texto se queda en la caja y lo natural es darle otra vez: eso encola **un segundo
   `send_message`**. Cuando el bot los drena, manda los dos.
2. **Reintento de la cola.** `send_message` hace `sendToPhone` y después `registrarSaliente`. Si el
   envío sale y lo de después falla (la base, por ejemplo), el comando queda en error y la cola lo
   reintenta hasta `MAX_ATTEMPTS`: **el cliente recibe el mismo mensaje hasta tres veces**. Lo mismo
   si `/v1/messages` se corta después de que WhatsApp ya lo aceptara.

### Lo que hace falta: `client_msg_id`

El panel manda ya en cada `send_message` un `client_msg_id` (un UUID). **Es el mismo mientras el
mensaje sea el mismo** (destino, texto y adjunto) y cambia cuando el envío se confirma o cuando se
edita algo. O sea: dos comandos con el mismo `client_msg_id` son **el mismo mensaje**.

- Columna nueva **`messages.client_msg_id`** (TEXT NOT NULL DEFAULT `''`), con un índice. Va en la
  fila que escribe `registrarSaliente`.
- Al principio de `send_message`: si ya hay una fila de ese lead con ese `client_msg_id`, **no se
  envía nada** y se devuelve `{ phone, lead_id, repetido: true }`. No es un error: el mensaje ya
  salió, y el panel lo trata como enviado.
- ⚠️ **Contra el reintento hace falta además apuntarlo ANTES de lo que pueda fallar.** Si la marca
  solo existe cuando `registrarSaliente` termina bien, un fallo justo ahí deja el mensaje enviado y
  sin marca, y el reintento lo manda otra vez. Opciones: guardar la fila justo después de que
  `sendToPhone` devuelva ok y antes de cualquier otra cosa, o una tabla pequeña de claves enviadas
  que se escribe en ese mismo punto. Elige y déjalo escrito.
- Sin `client_msg_id` (una cola escrita a mano, versiones viejas del panel): el comportamiento de hoy.

### Los mensajes caducan a los 30 minutos (decidido por el dueño, 24-sep-2026)

Con el portátil apagado, un `send_message` se queda en `pending` y hoy **sale cuando el bot
arranca**, aunque sea al día siguiente. Para un cambio de catálogo eso está bien; para un «hola,
¿sigues interesado?» escrito a las 21:00 que llega a las 8:00, no.

- Un `send_message` con **más de 30 minutos** entre `commands.created_at` y el momento de procesarlo
  **no se envía**. El comando se cierra en error, **sin reintentos**, con este texto, que el panel
  enseña tal cual: `no salió: el bot estaba apagado cuando lo escribiste. Vuelve a mandarlo si aún
  hace falta`.
- La edad se mide con `created_at`, que pone Postgres, y no con la hora del portátil: si el reloj
  local va mal, un mensaje de hace un minuto no puede darse por caducado.
- Solo `send_message`. El resto de comandos se siguen aplicando cuando el bot arranca, como hoy.
- Pon los 30 minutos en una constante con nombre, no sueltos en el código.

El panel no necesita cambios: el mensaje caducado no llega al chat, que es justo la regla de siempre
(«si no aparece, no salió»).

---

## 2 · Ver en el panel las fotos y documentos del cliente

### Lo que pasa hoy

- **Fotos** (`image.flow.ts`): se guardan en `assets/` **en el disco del portátil** (`provider.saveFile`)
  y al historial va solo el texto del veredicto (`[COMPROBANTE VÁLIDO: …]`). El panel no tiene URL que
  enseñar, y encima pinta esa instrucción al modelo como si la hubiera escrito el cliente.
- **Documentos (PDF, Word…): se pierden enteros.** No hay flujo para `EVENTS.DOCUMENT`. Comprobado en
  builderbot (`index.cjs`, rama `REGEX_EVENT_DOCUMENT`): si no hay flujo, no pasa nada. No se guarda
  ninguna fila, Mia no contesta y el panel no se entera de que el cliente mandó algo.
- **Vídeos**: builderbot los manda como `_event_media_`, el mismo evento que las fotos. Acaban en
  `imageFlow` y se analizan **como si fueran un comprobante de pago**. Lo más probable es que el
  cliente reciba *«No pude leer bien esa imagen 🙈»*. Merece la pena comprobarlo.
- **Notas de voz**: se transcriben y va el texto. El audio no se guarda en ningún sitio.

### El contrato con el panel

Tres columnas nuevas en **`messages`**:

| Columna | Tipo | Valores |
|---|---|---|
| `media_url` | TEXT NOT NULL DEFAULT `''` | URL **pública https** (Cloudinary). Nunca una ruta de disco |
| `media_type` | TEXT NOT NULL DEFAULT `''` | `image` · `video` · `audio` · `document` · `sticker` |
| `media_name` | TEXT NOT NULL DEFAULT `''` | nombre original del fichero; importa en documentos |

- `content` pasa a ser **el pie de foto** cuando hay adjunto, y puede ir vacío. El panel pinta el
  adjunto y, debajo, el texto.
- ⚠️ **Migración de Postgres ANTES de arrancar el bot con el código nuevo** (siguiente número libre).
  El espejo vuelca con `SELECT *`: una columna que existe en SQLite y no en Postgres rompe la
  replicación de `messages` entera, sin avisar. El panel ya pide `select('*')`, así que funciona antes
  y después de la migración.
- `cloudinary.service.ts` ya tiene `uploadToCloudinary`, pero solo con `image | video`. Los documentos
  tienen que ir como **`raw`**: Cloudinary acepta un PDF como `image`, pero por defecto **bloquea servir
  PDFs desde esa ruta** (la URL devuelve 401). El panel ya sube los suyos como `raw` por eso.
- Carpeta: `chat/<company_id>`, la misma que usa el panel para lo que manda.

### Qué guardar en cada caso

- **Foto**: subirla y ponerla en la fila del cliente. Hoy `handleTurn` → `persistTurn` solo sabe de
  texto; necesita un parámetro opcional con el adjunto para que la fila `user` lo lleve. La
  verificación del voucher se queda como está.
  - Sobre el texto del veredicto: lo ideal es que `content` lleve el pie de foto del cliente (o vacío)
    y que el veredicto le llegue al modelo por otro sitio. Si eso es mucho cambio, que siga yendo en
    `content`: el panel lo enseñará debajo de la foto. Decide tú.
- **Documento**: flujo nuevo para `EVENTS.DOCUMENT`. Guardar (subir como `raw` + fila con
  `media_type: 'document'` y `media_name`) y darle al modelo un hecho con el mismo patrón que las
  fotos: `[El cliente envió un documento: contrato.pdf. No puedes abrirlo…]`. Lo que no puede pasar
  es el silencio de hoy.
- **Vídeo**: separarlo de la foto antes de verificar. Guardarlo y darle al modelo un hecho, sin
  pasarlo por `verdictFor`.
- **Sticker**: hoy se ignora a propósito y está bien que Mia no conteste. Guardarlo en el historial
  es opcional.
- **Nota de voz**: opcional. Si se guarda, `media_type: 'audio'` y en `content` la transcripción.

---

## 3 · Mandar adjuntos desde el panel

El panel ya encola:

```ts
send_message {
  lead_id | phone,
  text,                 // puede venir VACÍO si hay adjunto
  client_msg_id,
  media_url,            // https de Cloudinary, carpeta chat/<company_id>
  media_type,           // 'image' | 'video' | 'audio' | 'document'
  media_name,           // nombre original, p. ej. "Horarios octubre.pdf"
}
```

Límites que ya aplica el panel antes de subir (los de WhatsApp): foto 5 MB, vídeo y audio 16 MB,
documento 10 MB.

### Lo que falta

- `send_message` ya no puede exigir `text` si viene `media_url`.
- Validar que `media_url` sea `https://res.cloudinary.com/...`: una URL cualquiera en la cola haría
  que el bot descargara lo que le pusieran.
- Enviar con el adjunto. `sendToPhone` y `/v1/messages` ya aceptan `urlMedia`
  (`bot.sendMessage(number, message, { media })`), pero ojo con lo que hace builderbot por debajo
  (`provider-baileys`, `sendMedia`):
  - **documentos**: `sendFile` usa como `fileName` el nombre del temporal descargado, no el real. El
    cliente vería un nombre aleatorio. Para documentos conviene llamar a
    `vendor.sendMessage(jid, { document: { url }, mimetype, fileName: media_name, caption: text })`
    directamente;
  - **audio**: `sendMedia` lo convierte a opus y **descarta el texto**. Si viene texto con un audio,
    mándalo en un mensaje aparte.
- Guardar la fila con `media_url`, `media_type`, `media_name` y `role: 'owner'` (`registrarSaliente`
  necesita el adjunto como parámetro opcional).
- **Devolver `media: true`** cuando el adjunto salió. Es lo que el panel mira para no decir «enviado»
  de un archivo que no salió.
- Para Mia: una fila `owner` con adjunto y `content` vacío llega al modelo como un turno vacío. Mejor
  un texto como `[El negocio envió una foto]` / `[… el documento «Horarios.pdf»]` solo en el historial
  que se le pasa al modelo, sin tocar `content`.

### Opcional: lo escrito a mano desde el móvil

`escrito-a-mano.service.ts` solo recoge texto. Si el dueño manda una foto desde el móvil, no queda
nada. Con lo de la sección 2 hecho, extenderlo es poco trabajo: el mensaje trae `imageMessage` /
`documentMessage` y Baileys lo descarga con `downloadMediaMessage`.

---

## Qué NO hacer

- No guardar rutas de disco en `media_url`. El panel está en internet y el disco está en un portátil.
- No reenviar un `client_msg_id` que ya salió, ni siquiera si el comando se reintenta por un error.
- No convertir un documento del cliente en un «comprobante» ni pasarlo por la verificación de pagos.

## Cómo comprobarlo

1. **Duplicados en la cola:** encola a mano dos `send_message` con el mismo `client_msg_id`. Sale un
   solo WhatsApp; el segundo devuelve `repetido: true`.
2. **Reintento:** fuerza un fallo después de `sendToPhone` (lanza una excepción justo ahí). En el
   reintento **no** sale un segundo WhatsApp.
3. **Bot lento:** para el bot, escribe desde el panel, espera al aviso «se está aplicando» y dale otra
   vez a Enviar. Arranca el bot: sale **uno**.
4. **Foto del cliente:** llega la fila `user` con `media_type='image'` y una `media_url` https que se
   abre desde otro ordenador. En el panel se ve la foto.
5. **PDF del cliente:** fila con `media_type='document'` y `media_name` real. Mia contesta algo (hoy
   no contesta nada). En el panel se ve «📄 nombre.pdf» y se abre.
6. **Vídeo del cliente:** no pasa por la verificación de pagos y no recibe «No pude leer bien esa
   imagen».
7. **Adjunto desde el panel:** foto con texto, foto sin texto y PDF. Al cliente le llegan con el
   nombre real; el comando devuelve `media: true`; en el panel salen como «👤 Tú» con la vista previa.
8. **URL que no es de Cloudinary** en la cola: se rechaza sin descargar nada.
9. **Caducidad:** encola un `send_message` con `created_at` de hace 31 minutos. No sale ningún
   WhatsApp, el comando acaba en error con el texto de arriba y no se reintenta. Con uno de hace 29
   minutos, sí sale.
