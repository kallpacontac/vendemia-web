# Prompt para la sesión del bot: que lo que verifica Mia llegue a la caja

Pégalo tal cual. Viene de montar la Caja del día en el panel (26-sep-2026, `/panel/caja`).

**El panel ya está hecho.** La caja cuenta como «cobrado» lo que tiene `pagado_por`, y lo desglosa
por método con `appointments.metodo_pago` y `orders.payment_method`. Lo que Mia verifica por voucher
es la mayor parte de lo que entra, y hoy llega a la caja a medias.

> Revisado el 26-sep-2026 leyendo `src/flows/image.flow.ts` en `feat/media-productos` (después de
> `d237e3c`). La fecha de `upsert_gasto` ya está arreglada en `1970445`, gracias.

---

## Lo que ya funciona

La inscripción a un grupo (`sched:…` en `pending_payment`) pagada por voucher guarda el método
(`marcarMetodoPagoCita(pendingAppt.id, v.metodoPago)`, línea ~138) y queda con
`pagado_por='voucher'` al liquidarse. Bien.

## 1 · Pedido pagado por voucher: el método no se guarda

Cuando el voucher cubre un pedido (`open`), se marca `paid` y `pagado_por='voucher'`, pero
`orders.payment_method` se queda con lo que hubiera al crearlo, que puede ser `''` o un método distinto
del que se usó de verdad.

- Si `v.metodoPago` no está vacío, escríbelo en `orders.payment_method` del pedido que se liquida.
- Si el pedido ya tenía uno y es distinto (dijo Plin y pagó con Yape), manda **lo que dice el
  comprobante**: es la evidencia. Déjalo en el log (`[PAGO] método declarado X, comprobante Y`).
- En pago PARCIAL también: el método es el del dinero que ya entró.

## 2 · Cita puntual pagada por voucher: el pago no se asocia a la cita

`pendingAppt` solo mira citas `pending_payment` con `slot_start` que empieza por `sched:`. Una
barbería no tiene esas: sus citas nacen `confirmed`. Si un cliente manda el Yape de su corte:

- `verdictFor` lo verifica y crea un `pending_payments` con `order_id=''` y `appointment_id=''`,
- responde «pago verificado y registrado»,
- y **ninguna cita queda con `pagado_por`**. En el panel esa cita sale en «Sin cobro apuntado» aunque
  Mia ya vio el comprobante, y la persona del mostrador la cobraría otra vez o la apuntaría a mano
  como efectivo.

Lo que hace falta: cuando no hay pedido abierto ni inscripción pendiente, buscar **la cita puntual del
lead a la que corresponde el pago**:

- la próxima `confirmed` (o la de hoy aunque ya haya pasado la hora), sin `pagado_por`;
- si hay más de una candidata, la más cercana en el tiempo;
- que el importe cubra el total de sus líneas (`appointment_services`). Si no lo cubre, no la marques:
  dile al modelo que es un pago parcial, como ya se hace con los pedidos.

Y entonces: `pagado_por='voucher'`, `metodo_pago=v.metodoPago`, y `pending_payments.appointment_id`
con su id. **No cambies su estado**: ya es `confirmed`, y cobrarla no es avanzarla (lo mismo que hace
`marcar_pagado`).

Si no hay ninguna cita candidata, lo de hoy está bien: se registra el pago y se dice al cliente que el
equipo lo confirma.

## 3 · Una decisión: «Requerir pago para confirmar» en citas puntuales

Ajustes enseña ese interruptor a las barberías («La cita queda en "esperando pago" hasta que llegue el
comprobante»), pero `require_payment_to_confirm` solo actúa en pedidos (stock) y en inscripciones
(`join_schedule_slot`). `book_appointment` lo ignora: una cita puntual nace `confirmed` siempre.

O se implementa (la cita nace `pending_payment`, no ocupa el hueco hasta que llegue el voucher, y el
punto 2 la liquida pasándola a `confirmed`), o se dice que no aplica y el panel deja de ofrecerlo a los
negocios de citas puntuales. **Dime cuál** y lo ajusto en el panel. Yo lo implementaría: un salón que
pide adelanto para el tinte es un caso real, y hoy el interruptor miente.

---

## Cómo comprobarlo

1. Pedido de 50 con `payment_method='plin'`, voucher de Yape por 50: el pedido queda `paid`,
   `pagado_por='voucher'`, `payment_method='yape'`. En la caja del panel sale en «Yape».
2. Barbería: cita `confirmed` de un corte de 40 para mañana. El cliente manda un Yape de 40: la cita
   queda `confirmed`, `pagado_por='voucher'`, `metodo_pago='yape'`, y `pending_payments.appointment_id`
   apunta a ella. En la caja ya no sale en «Sin cobro apuntado».
3. Lo mismo con un Yape de 20: la cita NO se marca y Mia le dice que falta el resto.
4. Dos citas del mismo cliente (mañana y la semana que viene) y un Yape que cubre una: se marca la de
   mañana.
5. Voucher sin ninguna cita ni pedido: como hoy, pago registrado y sin marcar nada.
