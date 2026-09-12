# Prompt para la sesión del bot — falta `crear_cita`

Pégalo tal cual. Sale de lo que pidió el dueño el 12-sep-2026: *«crear, asignar barbero, reasignar,
modificar horas y eliminar»*, sobre la agenda del panel.

**Cuatro de las cinco ya funcionan** con `modificar_cita`, y el panel las usa desde hoy
(`/panel/agenda` → pestaña «Próximas»): asignar profesional, reasignar, mover de hora y cancelar.
Hora y profesional viajan **en la misma orden** cuando cambian los dos.

**Falta una: crear.** Y no es un olvido del panel — es que no existe el comando.

> Comprobado el 12-sep-2026 sobre los 19 handlers de `commands.service.ts`: ninguno crea una cita.
> Las reservas nacen por `book_appointment` (tool del modelo) o por `POST /public/:companyId/book`,
> y ese endpoint **no es alcanzable desde internet**: el bot vive en un portátil.

**Duración y servicios quedan FUERA a propósito** (decisión del dueño, mismo día). No los pidas aquí.

---

## Qué hace falta: `crear_cita`

```ts
await encolar('crear_cita', {
  // A quién. Una de las dos:
  lead_id: 'lead-123',                    // cliente que ya escribió al bot
  // ó
  telefono: '51987654321', nombre: 'Rosa Díaz',   // cliente que llamó o vino al local

  slot_start: '2026-09-18 16:00',
  catalog_item_id: 'corte-barba',         // ⚠️ ver abajo: esto es el precio
  employee_id: 'emp-1',                   // opcional
})
```

### Tres decisiones que hay que tomar ahí, no en el panel

1. **El cliente que todavía no existe.** Casi todas las citas del mostrador son de gente que llamó
   por teléfono y nunca escribió al WhatsApp del negocio. O el comando crea el lead cuando el
   teléfono no está (con `source` propio, para poder distinguirlo después), o el panel no puede
   agendar a nadie que no le haya escrito antes a Mia — que es la mitad de la clientela de una
   barbería.

2. **⚠️ SIN SERVICIO, LA CITA VALE S/ 0.** `v_movimientos.importe` sale de `appointment_services`
   (migración 0026). Una cita creada sin líneas de servicio entra en los ingresos como cero y
   descuadra todas las métricas del panel — es exactamente lo que pasaba con las inscripciones
   recurrentes hasta el 10-sep. Así que `catalog_item_id` debería ser **obligatorio**, y el handler
   escribir `appointments.service` y las líneas con `setAppointmentServices`, como hace el bot al
   vender. El precio, del catálogo.

3. **Qué estado.** Una cita agendada por el dueño en el mostrador normalmente ya está cerrada
   (`confirmed`). Si se respeta `require_payment_to_confirm` nacería en `pending_payment` y **no
   ocuparía plaza**, con lo que Mia podría vender ese mismo hueco por WhatsApp. Decídelo y escríbelo;
   yo la crearía `confirmed` y que el cobro se resuelva con `marcar_pagado`, que ya existe.

### Lo que sí o sí tiene que hacer

- **Validar el hueco con `validarHueco`**, igual que `modificar_cita`: mismo horario, mismos
  bloqueos, mismo aforo. El panel no calcula disponibilidad y no debe empezar a hacerlo.
- **Rechazar con el motivo escrito para el dueño** (`Marco ya tiene una cita a esa hora`). El panel
  lo enseña tal cual.
- **Devolver `mensaje` + `wa_link`**, como `modificar_cita`. Una cita creada desde el panel **no pasa
  por Mia**, así que el cliente no recibe ninguna confirmación: si el comando no devuelve el mensaje,
  nadie le avisa de que tiene hora. El panel ya sabe enseñarlo
  (`components/panel/AvisarCliente.tsx`) y **no lo envía solo**: lo manda una persona.

## Lo que el panel ya hace con lo que hay

- **Aforo real**: cuántas caben a la vez es lo menor entre las sillas (`schedule[dia].capacity`) y
  los trabajadores activos no bloqueados a esa hora.
- **Un bloqueo es de una persona, no del local**: una ausencia solo cierra la franja si no queda
  nadie. Antes, las vacaciones de uno pintaban «Bloqueado» toda la semana.
- **Filtro por profesional**: con uno elegido, la rejilla es SU agenda —una cita a la vez, y sus
  ausencias sí cierran la franja—.
