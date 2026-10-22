# Prompt para la sesión del bot: Mia Gerente, fase 1 (mensajes con aprobación y avisos de stock)

Pégalo tal cual en la sesión del bot (`vendemia`). El diseño completo está en tres documentos de
`vendemia-web/docs/`: `mia-gerente-consolidado.md` (el resumen), `prompt-bot-mia-gerente-contactar.md`
(partes 7 y 10) y `prompt-bot-mia-gerente-consejos.md` (partes 4, 7 y 8). Esto es el **contrato** de
la fase 1: lo que la web ya construyó y lo que el bot tiene que hacer para que funcione.

**Regla que manda sobre todo:** el modelo no calcula ni estima nada. Precios, rebajas, fechas y
cantidades salen de código; el modelo solo redacta con esos números ya hechos.

---

## 0 · Lo que ya está del lado de la web (21-oct-2026)

SQL en `vendemia-web/modules/` (orden de aplicación; sin aplicar al escribir esto):

1. `avisos/sql/0002_avisos_por_rol.sql` (si no estaba: corregido el 21-oct, `p_user::text`).
2. `datos/sql/0008_mia_gerente.sql` → tablas `borradores` y `avisos_stock` y sus RPC. Prueba:
   `datos/sql/tests/pruebas_0008.sql`.
3. `avisos/sql/0003_stock_y_por_aprobar.sql` → avisos push `stock` y `por_aprobar`. Prueba:
   `avisos/sql/pruebas_0003.sql`.

Panel:
- **Mensajes**: la tarjeta del borrador al final del chat del cliente (Aprobar y enviar · Corregir ·
  Descartar), la etiqueta «Por aprobar» y su filtro (`/panel/mensajes?filtro=por_aprobar`).
- **Mia Gerente**: si la respuesta trae `borrador`, pinta «Ver el chat de Carla». `?pregunta=…` deja
  la pregunta escrita en la caja (viene del aviso de stock).
- **Catálogo**: «Avísame al celular cuando queden N» en la ficha (RPC `aviso_stock_poner`).
- **Ajustes → Avisos**: dos interruptores nuevos, «Mensajes por aprobar» y «Stock que le pediste
  vigilar».

## 1 · El prompt (se puede hacer ya, no depende de nada)

En `src/services/owner/prompt.ts`, después de «CÓMO RESPONDES», el bloque **CÓMO ACONSEJAS** y
**CÓMO LO DICES** de `prompt-bot-mia-gerente-consejos.md`, parte 8. Las líneas de «COMPRAS Y AVISOS»
solo cuando exista el punto 4 de aquí; las de `que_comprar`, no todavía (fase 2).

Y en `negocio.ts → textoProductos`: quitar «markup» de la frase. Con «ganas S/ X por unidad (margen
Y %)» basta.

## 2 · Preparar un mensaje: `preparar_contacto` + `dejar_borrador`

Dos herramientas de Mia Gerente, para **dueño y administrador** (al administrador, sin costo ni
margen en nada de lo que devuelvan).

**`preparar_contacto({ cliente, objetivo, producto?, descuento_tope?, regalo?, enfoque?, vence? })`**,
con `objetivo` ∈ `ofrecer | recuperar | avisar | cobrar | coordinar_entrega`. Hace en código lo de
`prompt-bot-mia-gerente-contactar.md` §7.1 (pasos 1 a 8) y devuelve una frase con los hechos:
- quién es el cliente, y si no se le puede escribir (nunca escribió, pidió que no) → se para ahí;
- hasta 5 frases suyas, dentro de `<dato_de_cliente>`, con fecha;
- con producto: los hechos de su ficha; con `descuento_tope`: el **encargo calculado**
  (precio de lista, entrada = 40 % del tope redondeado a 5, escalón = 80 %, tope, vence; por defecto
  7 días) y, si hay costo cargado, que el tope no deje vender por debajo de él (al administrador se
  le dice «no se puede» sin decir por qué);
- 2 huecos libres reales si el objetivo es reservar;
- el adjunto sugerido (la foto o el vídeo de la ficha del producto/nivel, o el de saludo) con un id;
- un **`token`** que guarda en memoria del turno todo lo calculado (encargo, adjunto, lead).

**`dejar_borrador({ token, texto, con_adjunto, guion_audio? })`**: el modelo ya redactó. El código:
- comprueba que **cada importe «S/ N» del texto** es uno de los calculados (precio de lista o precio
  de entrada). Si el modelo inventó o restó un número, se rechaza y se le pide reescribir;
- deja `{firma}` donde va el nombre de quien envía (lo cambia la base al aprobar);
- llama a `borrador_srv_crear(p_company, p_lead, p_datos)` con
  `{ objetivo, texto, adjunto?, audio?: { guion, segundos }, encargo?, pedido_id?, creado_por }`.
  `creado_por` = `commands.created_by` de la pregunta. El encargo lleva **rebajas**, no precios:
  `{ producto, catalog_id, precio_lista, entrada, escalon, tope, regalo, vence }`;
- devuelve el id.

La respuesta de `preguntar_asistente` trae entonces **`borrador: { id, lead_id, nombre }`**, y el
texto dice algo como «Listo, te lo dejé en el chat de Carla para que lo revises». Mia **nunca** dice
«ya se lo mandé».

Reglas del texto (al prompt, con las herramientas): las de la parte 4 de *contactar* — 2 a 4
líneas, su nombre, una frase suya, un hecho del negocio que lo responde, una pregunta final fácil,
plazo solo si es real, sin «Estimado cliente». Para `coordinar_entrega`, la lista numerada de lo que
falta, sin enlace a la tienda y de tú (parte 9.1).

`borrador_srv_crear` valida en la base: lead del negocio, objetivo, texto de 1 a 1500, adjunto de
`https://res.cloudinary.com/` (image, video o document), audio con guion ≤ 400 y 1–30 s, y encargo
coherente (`0 ≤ entrada ≤ escalon ≤ tope < precio_lista`, con `vence`). Si ya había uno por aprobar
para ese cliente, lo reemplaza.

## 3 · Enviar lo aprobado: el comando `enviar_borrador`

Lo inserta **la base**, no el panel: `borrador_aprobar` (o el reloj de las 9 de la mañana, para lo
aprobado de noche) apunta en `commands`:

```
type = 'enviar_borrador', payload = { borrador_id }, created_by = quien lo aprobó
```

- **`juzgarComando`**: dueño y administrador sí, empleado no (la misma fila que `send_message` en la
  tabla de `run-tests-equipo.ts`).
- Lee la fila de `borradores` con la clave de servicio. Solo envía si `estado = 'aprobado'` y es del
  mismo negocio. Si no, no hace nada (otro intento ya la envió).
- Vuelve a comprobar que al cliente se le puede escribir. Si no: `borrador_srv_resultado(id, false,
  'Carla pidió que no le escribamos.')`.
- Envía **`texto_final`** (no `texto`): el adjunto con el texto de pie, luego el audio si trae `url`
  (como nota de voz, `ptt`, como `voice/send.ts`), igual que `send_message`, con su protección contra
  duplicados (`client_msg_id = borrador_id`).
- Lo anota en el historial como mensaje **de Mia** y **no toca `bot_active`**: si el cliente
  contesta, sigue ella.
- Al terminar: `borrador_srv_resultado(id, true)`, o `(id, false, motivo)` con un motivo para el
  dueño («WhatsApp rechazó el video»). El panel lo enseña tal cual.
- Si el bot estaba apagado y el comando tiene más de 30 min, no lo envía: la base ya lo habrá marcado
  «no salió» y el dueño lo vuelve a pedir.

## 4 · Avisos de stock por chat: `poner_aviso`, `quitar_aviso`, `mis_avisos`

Las tres para dueño y administrador, en nombre de quien pregunta (`commands.created_by`). Son la
**única excepción** a «no puedes cambiar nada», sin aprobación: no tocan clientes, precios, pedidos
ni dinero.

- `poner_aviso({ producto, opcion?, minimo })`: resuelve el producto (y la talla/color en
  `catalog_variantes`) **en código**, y llama a `aviso_stock_srv_poner(p_company, p_user, p_catalog,
  p_variante, p_minimo)`. Devuelve `{ producto, opcion, minimo, stock, ya_por_debajo }`. La frase:
  «Listo: te aviso al celular cuando queden 5 del producto Polo negro. Ahora tienes 12.» Si
  `ya_por_debajo`: «Ya tienes 3; te aviso la próxima vez que baje de 5, después de reponer.»
- `quitar_aviso({ producto, opcion? })` → `aviso_stock_srv_quitar`.
- `mis_avisos()` → `avisos_stock_srv_de(p_company, p_user)`.
- Sin número («avísame cuando se esté acabando»): Mia **pregunta** el mínimo. La cuenta automática
  es de la fase 2, con `que_comprar`.

El aviso al celular lo apunta un trigger de la base cuando el stock cruza el mínimo (por
`ajustar_stock`, por el panel o por el espejo): el bot no tiene que hacer nada más.

## 5 · Lo que NO es de esta fase

- Mia de ventas negociando con el encargo, y que el precio pactado llegue al cobro (*contactar* §7.3).
  Mientras tanto, si un cliente acepta una oferta con rebaja **de un servicio o un plan**, Mia de
  ventas no confirma ese precio: lo deriva al dueño para que lo cierre. En productos, el tope de
  `catalog.max_discount` sigue mandando.
- Que Mia proponga borradores sola cada mañana (el aviso `por_aprobar` ya está listo en la base para
  cuando lo haga: basta con `creado_por = null`).
- `que_comprar`, `entregas_por_coordinar`, `completar_entrega` y el flujo de ubicación.

## 6 · Criterios de aceptación

- [ ] «Escríbele a Carla, ofrécele el trimestral, hasta 25 soles menos» → en el chat de Carla del
      panel aparece la tarjeta con «S/ 270» (no 255) y la línea «empieza ofreciendo S/ 270 · como
      mínimo S/ 255»; Mia Gerente dice que lo dejó ahí; **no sale nada**.
- [ ] Un texto con un importe que no salió del código → `dejar_borrador` lo rechaza.
- [ ] Aprobar → sale adjunto + texto, en el chat como mensaje de Mia, y la tarjeta desaparece.
      Aprobar dos veces o reintentar el comando → una sola vez.
- [ ] Aprobar a las 22:00 → sale a las 9:00, firmado con el nombre de quien aprobó.
- [ ] Un empleado que encola `enviar_borrador` a mano → rechazado por `juzgarComando`.
- [ ] Como administrador: prepara y aprueba, sin ver costo ni margen.
- [ ] «Avísame cuando queden 5 del Polo negro» → confirma con el stock; al bajar a 5 llega la
      notificación solo a esa persona; no se repite hasta que reponen y vuelve a bajar.
- [ ] «¿Qué avisos tengo?» y «ya no me avises del Polo negro» funcionan.
