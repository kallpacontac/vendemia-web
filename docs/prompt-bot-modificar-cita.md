# Prompt para la sesión del bot — que `modificar_cita` acepte duración y servicios

Pégalo tal cual. Sale de una petición del dueño del 12-sep-2026: *«necesito que se puedan modificar
las reservas: horario, duración, servicios, employee, y cancelar»*.

**Tres de las cinco ya funcionan** y el panel las usa desde hoy (`/panel/agenda` → pestaña
«Próximas»): mover de hora, reasignar profesional y cancelar. Hora y profesional se mandan **en la
misma orden** cuando cambian los dos, que es lo que ya permite el handler.

**Faltan dos, y las dos necesitan tocar el bot:**

| Falta | Por qué hoy no se puede |
|---|---|
| **Duración** | `modificar_cita` conserva la de la cita: `const span = appt.slot_minutes \|\| grid`. No hay forma de cambiarla. |
| **Servicios** | Ningún comando toca `appointments.service` ni `appointment_services`. `setAppointmentServices` existe en `db.service.ts` pero no está expuesto. |

⚠️ **El panel NO ha añadido campos para esas dos.** Un payload con claves que el handler ignora se
aplicaría «bien» y no cambiaría nada: el dueño creería que corrigió el servicio y la cita seguiría
con el precio viejo. Mientras el bot no lo acepte, la ficha dice en letra pequeña que la duración y
el servicio no se editan desde el panel. En cuanto esto exista, se quita esa línea y se añaden los
campos.

---

## Por qué importa más de lo que parece

No es comodidad: **el servicio de la cita ES el precio**. `v_movimientos.importe` sale de
`appointment_services` (migración 0026), y de ahí salen `v_revenue_by_day`, `analytics_serie` y todo
lo que el panel enseña como ingresos.

Hoy, si el cliente pidió *Corte + Barba* y Mia anotó *Corte*, no hay forma de corregirlo desde
ningún sitio: la cita se queda con el precio equivocado **para siempre**, y esa diferencia entra
directa en las métricas. Lo mismo con la duración: una cita de 30 min que en realidad son 90 deja
libres dos huecos que no existen, y Mia los vende.

## Lo que hace falta

```ts
// Duración
{ id, accion: 'mover', slot_start: '2026-09-18 16:00', slot_minutes: 90 }

// Servicios (y con ellos, el precio)
{ id, accion: 'editar', servicios: [
    { catalog_item_id: 'corte', name: 'Corte', price: 35, duration_minutes: 30 },
    { catalog_item_id: 'barba', name: 'Barba', price: 20, duration_minutes: 15 },
] }
```

- **`slot_minutes`** como campo opcional de `mover`/`reasignar`: si viene, sustituye a
  `appt.slot_minutes` **antes** de `validarHueco`, no después. Si no cabe, el rechazo de siempre.
- **`accion: 'editar'`** para cuando NO cambia ni la hora ni el profesional. Sin ella, cambiar solo
  el servicio obligaría a mandar un `mover` a la misma hora, que es una orden que miente.
- **`servicios`** se valida contra el catálogo de ESA empresa (`catalog_item_id`), igual que
  `upsert_employee_block` valida el trabajador. Un id ajeno, error.
- El precio, ¿del payload o del catálogo? **Decídelo tú y escríbelo**: si se toma del catálogo, una
  cita vieja se re-tarifica al precio de hoy; si se toma del payload, el panel puede mandar
  cualquier número. Yo tomaría el del catálogo y dejaría `price` solo para un ajuste explícito.
- Escribir las dos cosas: `appointments.service` (la etiqueta congelada, «Corte + Barba») y las
  líneas de `appointment_services`, con `setAppointmentServices`, que ya hace las dos.

## Dos avisos que el `result` debería traer

1. **Si la cita ya estaba cobrada y el importe cambia.** Subir el precio de una cita pagada no
   cobra nada: alguien tiene que pedirle la diferencia al cliente. Que el `result` lo diga
   (`{ cobrado: true, antes_importe, ahora_importe }`) y el panel lo pinta como lo que es: dinero
   pendiente, no un cambio hecho.
2. **`antes`/`ahora` con los campos nuevos.** Hoy son `{ slot_start, employee_id }`; añadir
   `slot_minutes` y `service` para poder decir qué cambió exactamente.

Y el `mensaje` + `wa_link` de siempre: el panel ya los enseña editables y **el bot no le escribe al
cliente** (`components/panel/AvisarCliente.tsx`).

## Lo que NO hay que hacer

- **Que el panel calcule si cabe.** No tiene el horario del trabajador, ni sus bloqueos, ni el
  aforo. Ofrece, intenta, y enseña el motivo que devuelve el bot.
- **Cambiar el servicio sin tocar `appointment_services`.** La etiqueta sola deja el importe viejo y
  las métricas dirían una cosa y la ficha otra.
- **Inventar un estado nuevo.** Una cita editada sigue siendo `confirmed`; lo que cambia es su
  contenido.
