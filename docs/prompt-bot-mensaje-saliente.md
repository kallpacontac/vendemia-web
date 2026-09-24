# Prompt para la sesión del bot: el negocio escribe primero

Pégalo tal cual. Viene de lo que pidió el dueño el 23-sep-2026 para Kallpa: *«necesito poder
escribirle a un cliente nuevo; a veces no me escriben ellos, inicio yo la conversación. Que quede el
historial y que el bot la pueda retomar»*.

**El panel ya está hecho** (`/panel/mensajes` → botón «Nuevo»). Manda
`send_message` con `{ phone, text }`, **sin pausar a Mia**, y abre la conversación con el `lead_id`
que le devuelvas. Sin los cambios de abajo, el mensaje sale a WhatsApp pero todo lo demás falla sin
dar error.

> Revisado el 23-sep-2026 sobre `main` (6862a20). Las rutas de fichero son del repo `vendemia`.

---

## Lo que pasa hoy (tres fallos seguidos)

1. **`send_message` no guarda nada en el historial.** `commands.service.ts` → `send_message` llama a
   `sendToPhone` y devuelve `{ phone }`. No hay ningún `saveMessage`. Consecuencias:
   - el chat del panel **nunca** enseña lo que escribe el dueño, aunque el comentario de
     `mensajes/page.tsx` diga que llega por Realtime (tampoco en conversaciones que ya existen);
   - **Mia no lo ve**: cuando el cliente contesta «sí, me interesa», `runAgentTurn` lee
     `db.getHistory` y ahí no está lo que se le dijo.
2. **Con un `phone` nuevo no se crea el lead.** Cuando el cliente contesta, `agent.flow.ts →
   runOneTurn` crea un lead en ese momento, con `source` = `'organico'` e historial vacío. Mia lo
   saluda como a un desconocido.
3. **Lo que el dueño escribe A MANO desde el teléfono del negocio se pierde.** El provider está con
   `writeMyself: 'none'` y descarta todo lo `fromMe`. Esto es la mitad del caso de Kallpa: muchas
   veces el dueño no abre el panel, coge el móvil y escribe.

## Qué hace falta

### 1. Un solo sitio que registra lo que escribe el negocio

Algo como `registrarSaliente(companyId, phone, texto)` en un servicio nuevo, que usen el comando y
el oyente del punto 3:

- **Normaliza el teléfono igual que un mensaje entrante**: solo dígitos, sin sufijo de JID
  (`agent.flow` hace `from.replace(/@.+$/, '')`). Si se guarda `+51…` o con espacios, cuando el
  cliente conteste `getLeadByPhone` no lo encuentra y **la conversación se parte en dos leads**.
- **Busca el lead y, si no existe, lo crea** con `source: 'panel'`, la misma etiqueta que usa
  `crear_cita` para «lo trajo el dueño, no el bot». No pises el `source` de un lead que ya existía.
- **Guarda el mensaje con `role: 'owner'`** (ver el punto 4).
- Devuelve el lead.

### 2. `send_message`

- Después de `sendToPhone` con éxito → `registrarSaliente`. **Después** y no antes: lo que WhatsApp
  rechazó no se dijo y no debe quedar como dicho (el panel cuenta con eso: *si no aparece, no salió*).
- Valida el `phone` cuando viene: solo dígitos, entre 10 y 15 (el panel ya manda `51` + 9 dígitos,
  pero la cola la puede escribir cualquiera). Error legible: `teléfono inválido: va con prefijo de
  país, p. ej. 51987654321`.
- **Devuelve `{ phone, lead_id }`.** El panel abre la conversación con ese `lead_id`; si no llega,
  espera a que aparezca por el espejo un lead con ese teléfono (funciona, pero es más lento).
- Esto arregla también el envío desde el chat de un lead que ya existe (camino `lead_id`): hoy
  tampoco se guarda.
- **No toques `bot_active`.** En el caso nuevo la idea es justo que Mia siga activa y conteste cuando
  el cliente responda. En el chat de un lead existente el panel ya obliga a pausar antes de escribir.

### 3. Lo escrito a mano desde el teléfono

En `app.ts`, dentro del `on('ready')` donde ya se engancha `messages.update`, escuchar
`vendor.ev.on('messages.upsert', ...)`:

- **Solo `type === 'notify'` y `key.fromMe`.** Comprobado en Baileys: lo que envía el propio socket
  del bot se re-emite como `'append'` (`messages-send.js`, por `emitOwnEvents: true`) y lo tecleado en
  el teléfono llega como `'notify'` (`messages-recv.js`, `node.attrs.offline ? 'append' : 'notify'`).
  Ese es el separador entre persona y Mia; sin él se guardaría dos veces cada respuesta de Mia.
  Lo que cuesta: lo que se escriba con el bot apagado llega al reconectar como `'append'` y no se
  recoge. Déjalo escrito en el comentario.
- Texto: `message.conversation ?? message.extendedTextMessage.text`, desenvolviendo antes
  `ephemeralMessage.message` (chats con mensajes temporales). Sin texto → fuera (reacciones,
  ediciones, adjuntos).
- Destinatario: `remoteJid`, y si acaba en `@lid`, `remoteJidAlt` primero — el mismo criterio que usa
  el provider para los entrantes. Fuera grupos (`@g.us`), `status@broadcast` y canales.
- **No guardar**: el chat consigo mismo (el número propio está en `vendor.user.id`, antes del `:`),
  los admins (`isAdmin`: los mensajes al dueño son comandos, no clientes), los bloqueados
  (`isBlocked` — es la lista de «a este no lo trates como cliente», justo lo que hace falta si el
  dueño usa ese WhatsApp también para lo personal) y los que no pasan `isAllowed`.
- Deduplicar por `key.id` (un `Set` acotado): Baileys puede emitir el mismo upsert dos veces.
- ⚠️ La guarda `_ackHooked` hace que tras una reconexión que cree un socket nuevo los oyentes no se
  vuelvan a enganchar. Para el log de ACK daba igual; para esto **no**: después de la primera
  reconexión dejaría de recogerse lo escrito a mano sin avisar. Guarda qué `ev` ya está enganchado
  (un `WeakSet`) en vez de un booleano, o comprueba cómo reconecta builderbot.

### 4. El rol `owner` y el modelo

- `MessageRole` pasa a `'user' | 'assistant' | 'owner'`. En Supabase `messages.role` es `text` sin
  CHECK (0001_schema.sql), no hace falta migración. El panel **ya** pinta `owner` como «👤 Tú» y
  `assistant` como «🤖 Mia».
- `agent.service.ts` ya convierte todo lo que no es `user` en `assistant` al montar el historial, así
  que Mia lo lee como dicho por el negocio y lo continúa como propio. Es lo que queremos. Revisa que
  nada más filtre por `role = 'assistant'` pensando que es solo Mia (hoy no he encontrado nada: las
  métricas solo miran `role = 'user'`).
- **El historial ahora puede empezar con un mensaje del negocio**, y eso rompe con Gemini:
  `gemini.provider.ts` hace `while (history[0].role !== 'user') history.shift()` y **tiraría
  exactamente lo que se le dijo al cliente**. Con Anthropic, confírmalo. Lo más sencillo, en
  `agent.service.ts` al montar `messages`: si el primero es `assistant`, poner delante un `user`
  neutro (`'(inicio del historial)'`). Sirve también cuando es `HISTORY_WINDOW` la que corta y deja un
  `assistant` en cabeza.
- Varios mensajes seguidos del dueño = varios `assistant` seguidos. Anthropic junta los turnos
  seguidos del mismo rol; Gemini exige que se alternen. Si Gemini sigue siendo una salida posible,
  júntalos antes de mandarlos.

## Qué NO hacer

- **No pausar a Mia automáticamente** cuando el dueño escribe desde el teléfono. Puede tener sentido
  (el dueño se mete en una conversación y Mia sigue contestando por encima), pero es otra decisión y
  el dueño no la ha tomado. Si lo ves claro, propónlo aparte.
- No mandar nada al cliente aparte del texto del dueño. Nada de saludos ni avisos automáticos.

## Cómo comprobar que funciona

1. **Panel → número nuevo.** «Nuevo» con un número que no existe. Tiene que salir el WhatsApp, crearse
   el lead con `source = 'panel'`, verse el mensaje en el chat del panel como «👤 Tú», y el comando
   devolver `lead_id`.
2. **El cliente contesta** «sí, me interesa». Mia responde siguiendo lo que se le dijo, **no** con la
   bienvenida de un cliente nuevo. En el log `[PROMPT TURN]` el historial tiene que traer el mensaje
   del dueño.
3. **Número que ya es lead.** «Nuevo» con el teléfono de un lead existente: el mensaje se suma a su
   conversación, no se crea otro lead.
4. **A mano desde el teléfono** a un número nuevo: lead creado, mensaje en el historial como `owner`,
   una sola vez. Y una respuesta normal de Mia **no** debe aparecer dos veces.
5. **Teléfono con `+51 987 654 321`** en la cola: se guarda `51987654321` y encuentra el mismo lead que
   cuando el cliente escribe él.
6. Número bloqueado, grupo y chat consigo mismo desde el teléfono: no se guarda nada.
7. Con `LLM_PROVIDER=gemini`, el caso 2 sigue funcionando (si Gemini aún se usa).
