# Prompt para la sesión del bot · la agenda en la nube (etapa 4)

Pégalo en la sesión del bot (repo `vendemia`). Alvaro decidió el **19-oct-2026** pasar la agenda de
**todos** los negocios a la nube de golpe, aprovechando el feriado: **los bots están apagados** y no se
encienden hasta que esto esté hecho.

## Lo que ya está en la nube (lado web)

- `datos_v2_empresas`: `config_en_nube = true` **y** `agenda_en_nube = true` en barberia-01, default,
  kallpa, piel-futbolera y unicos.
- Configuración: como kallpa desde el 17-oct (tu bajada ya la aplica, `bajada.service.ts`).
- Agenda: `modules/datos/sql/0004_agenda_en_nube.sql` de la web. Las tablas `appointments`,
  `appointment_services`, `orders`, `pending_payments`, `gastos` (y `leads` de los clientes que
  crean la web y la página) las escribe Postgres:
  - el panel, con `agenda_crear_cita`, `agenda_modificar_cita`, `agenda_marcar_pagado`,
    `agenda_registrar_pago`, `agenda_marcar_cumplido`, `agenda_lead_actualizar`, `agenda_gasto_*`
    (copian las reglas de tus handlers de `commands.service.ts`);
  - Mi página (tienda/agenda públicas), con `agenda_srv_reservar` / `agenda_srv_pedir`: citas, inscripciones
    y pedidos de verdad, con `appointment_services`, periodo de la inscripción y stock descontado.
  - El hueco lo decide `v2_hueco` (tu `capAt` en SQL) con `pg_advisory_xact_lock(hashtext('tu_pagina:' || company_id))`.
- Las cinco tablas ya llevan `sync_version` y triggers desde la 0001 de la web, y los borrados van a
  `sync_borrados`, igual que la configuración.
- **La cita apartada** (tu cambio del 19-oct): `v2_hueco` ya cuenta una `pending_payment` puntual como
  ocupada solo 24 h desde `created_at` (`public.v2_ocupa_hora`, constante, sin columna; si cambias
  `PAGO_CADUCA_HORAS`, avísame). `agenda_marcar_pagado` sobre una puntual `pending_payment` revalida el
  hueco y falla con tu mismo texto (`no se puede confirmar: <motivo>. Muévela a otra hora y márcala
  pagada`). Mi página (`agenda_srv_reservar`) la crea `pending_payment` con el interruptor en 1 y precio
  > 0. Lo que **no** hace la nube: el voucher (asociar a la cita, sumar pagos, `pagado_por='voucher'` al
  cubrir, la escalación `paid_slot_full`) sigue siendo tuyo; al escribirlo en la nube, mismas reglas.

## Lo que necesito de ti, en este orden

1. **Bajar la agenda** como bajas la configuración: con `agenda_en_nube = true`, las tablas de agenda
   salen de `MIRROR_TABLES` para ese negocio (no se suben) y la bajada las aplica en SQLite. `leads` sigue
   siendo tuya, **pero** baja las filas que cree la nube (`source in ('panel', 'web')` creadas sin ti)
   para que Mia conozca a esos clientes: es la excepción que ya preveía la arquitectura (§3).
2. **Tus escrituras de agenda van a la nube.** `book_appointment`, `update_appointment`,
   `cancel_appointment`, `join_schedule_slot`, `save_customer_info` (beneficiario), `create_order` /
   `cancel_order`, el voucher (`image.flow` + `settlePendingEnrolment`), el cron de asistencia y
   `cerrarInscripcionesVencidas`. Lo más simple que sea seguro: escribir con tu clave de servicio en
   Postgres **dentro del mismo candado** (`select pg_advisory_xact_lock(hashtext('tu_pagina:' || company_id))`
   y comprobar el hueco con `public.v2_hueco(company, inicio, minutos, empleado, excepto)` antes de
   insertar), y aplicar en SQLite la fila devuelta sin esperar a la bajada. Si la nube no responde, Mia
   dice que no pudo confirmar; nunca inventa una cita que el panel no verá.
3. **Comandos de agenda en la cola**: con `agenda_en_nube = true` ya no llegan (el panel llama directo).
   Si llega uno viejo, recházalo con un mensaje claro, como haces con los de configuración.
4. **Los campos con dos dueños** (`calendar_event_id`, `reminder_sent_at`): a `citas_del_bot`, que subes
   tú (arquitectura §3). Mientras no exista, no escribas esos dos campos en filas de la nube.
5. **Primer arranque**: antes de aplicar nada, **compara** la agenda de SQLite con la de la nube por negocio
   y dime las diferencias. Lo que se haya escrito en la nube durante el apagado (citas del panel, reservas y
   pedidos de Mi página) no está en tu SQLite y tiene que bajar; lo que tengas en SQLite que la nube no tenga
   (filas que el espejo no llegó a subir antes del apagado) **no lo subas por tu cuenta**: dímelo y lo
   decidimos.
6. `npm run smoke:equipo` y una reserva de prueba por WhatsApp en kallpa que aparezca en el panel.

## Lo que NO haces

- No enciendas ningún bot con el espejo de agenda subiendo: pisaría lo escrito en la nube.
- Nada de roles: el corte sigue siendo el 21-oct (`0044` + `ROLES_MODO=corte`).

## Vuelta atrás

Por negocio, antes de encender su bot: `update datos_v2_empresas set agenda_en_nube = false where company_id = '…'`.
Lo escrito en la nube mientras tanto habría que traerlo a mano a SQLite.
