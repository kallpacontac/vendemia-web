# Prompt para la sesión del bot · canchas con adelanto: Mia valida el Yape y confirma

Pégalo tal cual en la sesión del repo `vendemia`. Viene de la web, 5-nov-2026. Revisado leyendo el código
del bot en `cde9f64`, sin ejecutar nada. **Hay una demo con cliente:** lo marcado «para la demo» va primero.

## Lo que se le prometió al cliente

1. El cliente reserva en la página. Elige cancha y hora, y la cancha queda **apartada** (`pending_payment`).
2. Toca **Confirmar mi reserva por WhatsApp**, que manda el detalle con su código (`R-XXXX`).
3. **Mia le pide S/ 40 de adelanto por Yape o Plin y la captura.**
4. **Mia valida el comprobante y confirma la reserva.**
5. Nadie puede quedarse con una cancha ya reservada (sin overbooking).
6. Recordatorio por WhatsApp antes del partido.

## Lo que ya está en la web

- **Empresa de ejemplo `zona-gol`** (`scripts/zona-gol-demo.sql`): `require_payment_to_confirm = 1`,
  `verify_vouchers = 1`, Yape y Plin en `payment_methods`, agenda y configuración en la nube, `capacity` del
  horario = 5 (el número de canchas). `reminder_config` = 1 a 3 horas antes.
- **Canchas:** cada cancha es un ítem de `catalog`; se ocupan por separado. `secciones.canchas` de
  `tu_pagina` trae `activo`, `plazo` (minutos, aquí 30) y `adelanto` (soles, aquí 40).
- **Reserva:** `agenda_srv_reservar`, tipo `cancha`. Con el candado del negocio, comprueba **esa** cancha con
  `v2_cancha_motivo(company, item, inicio, minutos, excepto)` y crea la cita `pending_payment`.
- **Apartada vencida:** si otro reserva encima, `v2_cancha_soltar_vencidas` cancela la vencida.
- **El código:** `pagina_idem (company_id, idem, codigo, ref_id)`; `ref_id` es el `appointments.id`.
- **Mensaje del cliente:** empieza por `Hola, quiero confirmar mi reserva.` y trae `Código: R-XXXX`,
  cancha, día, hora, total, adelanto y resto. Termina con `¿Me indicas cómo pagar el adelanto?`.

- **Comprobante subido en la página:** con `secciones.canchas.comprobante` = `pagina` o `ambos` el cliente también
  puede subir la captura en la web (`comprobante_srv_registrar`, tu-pagina 0017). Escribe en `pending_payments`,
  con `operation_id` e `image_hash`, y confirma la cita: te llega por la bajada. Si después manda la misma captura
  por WhatsApp, tu dedupe debe rechazarla. **Comprueba que `isImageHashUsed` e `isOperationIdUsed` miran también
  las filas bajadas de la nube.**

## Lo que ya funciona en el bot, sin tocarlo

`image.flow.ts`: la visión valida el comprobante, el destinatario y que no esté repetido;
`getCitaPuntualPorCobrar` encuentra la cita del lead; `confirmarCitaPagada` la confirma y Mia le dice al
cliente lo que falta. `bajada.service.ts` baja la agenda y los leads creados por la web.
`reminders.job.ts` recuerda las `confirmed`. Mira primero que esto siga siendo cierto.

---

## Para la demo

### 1 · Levantar `zona-gol`

⚠️ **Hoy NO se levanta.** Alvaro no tiene un número propio para este negocio, y 51907863118 ya es de `kallpa`: dos sesiones
vinculadas a un número reciben los mismos mensajes y las dos contestarían. Mientras tanto, `zona-gol` valida en la página
(`secciones.canchas.comprobante = 'pagina'`). Lo de abajo aplica cuando haya número. El resto de los puntos se puede
preparar y probar sin conectar nada.

Ya existe en la nube; **no uses `npm run onboard`**, igual que con `vendemia` el 4-nov. Provisiónala en SQLite
con su membresía y su fila en `instances`, enlaza el QR y levántala con `npm run bot -- up zona-gol`.
Para los recordatorios, `REMINDERS_ENABLED=true` **solo en esa consola**. Dime qué número quedó vinculado.

⚠️ Sus clientes inventados tienen teléfonos `5190000…`. `reminders.job.ts` los salta con `isTestPhone`.
**Comprueba que retargeting, seguimientos y demás jobs proactivos tampoco les escriban.** Si no los saltan,
apágalos para esta empresa.

### 2 · ⚠️ Que el mensaje encuentre la reserva, aunque el cliente sea nuevo

Es lo que más me preocupa de la demo. La reserva crea el lead en la nube y la bajada lo trae en segundos
(realtime, o el sondeo de 10 s). Si un cliente **nuevo** toca el botón antes de que baje:

1. `agent.flow.ts:97`: `getLeadByPhone` no lo encuentra y `createLead` crea otro, con otro id.
2. `leadsQueFaltan` trae después el de la web, con el mismo teléfono: quedan **dos leads** para ese número,
   porque `idx_leads_phone` no es único e `insertarLead` solo mira el id.
3. `getLeadByPhone` hace `LIMIT 1` sin orden y puede devolver el que no tiene la reserva.
4. Mia no ve la cita; la captura se registra como pago suelto y **la reserva sigue sin confirmar**.

Arréglalo como veas mejor. Lo que debe cumplirse:

- Si llega un `Código: R-XXXX` o el lead es nuevo, antes de crearlo fuerza una pasada de bajada.
- Si hay dos leads con el mismo teléfono en la empresa, vale el que tiene la reserva viva; lo mejor es fusionarlos.

### 3 · Lo que Mia lee sobre la reserva apartada

`agent.prompt.ts:1764` le dice que «el cupo NO está reservado» y que «otro cliente se lo puede llevar», y que
recuerde «el monto». Es texto de academia. En una cancha es falso, y el monto que tiene a mano es el **total**, así
que pediría S/ 180 en vez de S/ 40. Hoy lo cubre `custom_rules` de `zona-gol`, que el modelo podría saltarse.

Con `secciones.canchas.activo`: la cancha **sí está guardada** durante `plazo` minutos, el monto a pedir es
`min(adelanto, total)`, y al mensaje `quiero confirmar mi reserva` responde con el monto, el número y la petición de
captura. Sin ofrecer horarios ni volver a saludar con el catálogo.

### 4 · El adelanto mínimo (hoy, cualquier monto confirma)

En `image.flow.ts`, `confirmarCitaPagada` se llama con cualquier pago. Un Yape de S/ 1 confirmaría la cancha.

- Lee `secciones->'canchas'->>'adelanto'` de `tu_pagina`, de la nube o de lo que ya bajes.
- Si lo pagado en esa cita es **menor** que `min(adelanto, total)`: registra el pago, la cita **sigue
  `pending_payment`** y Mia dice cuánto falta para confirmar.
- Sin adelanto configurado, todo como hoy. Otros negocios no deben notar nada.

### 5 · El texto del recordatorio

`clientMessage` en `reminders.job.ts` dice «tu cita». En un negocio con `secciones.canchas.activo` debe decir
«tu reserva» y mencionar la cancha. La regla de nomenclatura de la web es esa: cita / reserva según negocio.

---

## Necesario, y mejor si llega a la demo

### 6 · ⚠️ Overbooking por chat: Mia no debe reservar canchas con `book_appointment`

Es el único camino de overbooking real que encontré. `book_appointment` valida con `validarHueco`, y
`agenda_bot_escribir` con `v2_hueco`: los dos cuentan el **aforo general**. Con 5 canchas y `capacity = 5`, Mia
puede dar la Cancha Principal a las 19:00 aunque esté ocupada, si queda aforo en otras.

Ahora mismo solo lo frena una regla escrita en `custom_rules` de `zona-gol`, que el modelo puede saltarse.

- Bloqueo en la tool: con `secciones.canchas.activo`, `book_appointment` y `get_available_slots` no agendan;
  devuelven al modelo «estas reservas se hacen en el enlace», con el enlace.
- O bien, si prefieres que Mia sí reserve: que compruebe con `v2_cancha_motivo` dentro de
  `agenda_bot_escribir`, y que sepa qué cancha pide el cliente. Es más largo. **Yo iría con el bloqueo.**

### 7 · Confirmar comprobando la cancha, no el aforo

`confirmarCitaPagada` usa `validarHueco`, con el aforo general:

- **Falso rechazo:** si el `capacity` del horario es menor que el número de canchas, un pago bueno sale como
  `paid_slot_full`, con el texto «el equipo está completo». Por eso `zona-gol` lleva `capacity = 5`.
- **Carrera:** una apartada vencida se puede confirmar en SQLite justo cuando otro la está reservando en la
  nube, antes de que baje la cancelación.

Con `secciones.canchas.activo`, comprueba con `v2_cancha_motivo(company, catalog_item_id, slot_start, slot_minutes,
appointment.id)` **dentro del candado** `pg_advisory_xact_lock(hashtext('tu_pagina:' || company_id))`. Si no cabe,
el camino `paid_slot_full` de siempre, con «esa cancha ya no está libre» en vez de «el equipo está completo».

### 8 · Usar el código `R-XXXX`

Hoy el comprobante se engancha por el teléfono. Si reserva Juan con su número y paga su amigo desde otro, el
pago no encuentra la cita; y con dos reservas abiertas, `cobrarCuenta` reparte por antigüedad.

- Si el mensaje trae `R-XXXX`, búscalo en `pagina_idem` y recuerda esa cita para el comprobante que llegue.
- Código de otro negocio o inexistente: Mia lo dice y no confirma nada.
- Si la cita ya no está viva (cancelada por vencida): Mia lo dice y pasa a una persona. **No vuelvas a apartarla.**

### 9 · Pruebas

Añade a `run-tests-cita-apartada` estos casos con un negocio de canchas:

- cliente nuevo que escribe antes de que baje la reserva → la encuentra y un solo lead vivo;
- adelanto menor que el mínimo → sigue apartada;
- adelanto exacto → confirmada, con saldo;
- pago completo → confirmada y `pagado_por = 'voucher'`;
- apartada vencida y reservada por otro → no se confirma, escala;
- `book_appointment` en un negocio de canchas → rechazado.

---

## Cómo comprobarlo, cuando esté

1. Reserva en `agenda.vendemias.com/zona-gol` con **tu** celular. La cita nace `pending_payment`.
2. Toca **Confirmar mi reserva por WhatsApp** de inmediato y envía. Mia pide la captura de S/ 40, no el total.
3. Yapea S/ 1 y manda la captura. Sigue apartada y Mia dice cuánto falta.
4. Yapea el resto hasta S/ 40. Mia confirma; en el panel sale «Por cobrar · S/ 40 de S/ X» y en la Caja «A cuenta».
5. Reenvía la misma captura. Rechazada.
6. Pídele a Mia por chat una cancha ocupada. No debe reservarla.
7. Reserva dentro de las próximas 3 horas y paga. Llega el recordatorio.

Cuando acabes, dime qué quedó hecho de cada punto y qué número vinculaste.
