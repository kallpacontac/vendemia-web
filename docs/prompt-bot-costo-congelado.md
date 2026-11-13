# Para el bot · el margen con el costo del día de la venta

> 12-nov-2026, desde vendemia-web. Decisión de Alvaro: cambiar un costo o una comisión no puede
> recalcular el pasado.

## Qué cambió en la base

`modules/datos/sql/0011_venta_congelada.sql` (repo web) crea tres tablas que rellenan triggers de
Postgres; nadie más escribe en ellas:

| Tabla | Clave | Qué guarda | Cuándo |
|---|---|---|---|
| `comisiones_congeladas` | `linea_id` = `appointment_services.id` | `regla` (fija/servicio/profesional/sin), `valor`, `employee_id` | al pasar la cita a `completed` |
| `costos_congelados` | `linea_id` = `appointment_services.id` | `catalog_id`, `costo` | al pasar la cita a `completed` |
| `pedido_costos` | (`order_id`, `catalog_id`) | `costo` | al crearse el pedido o añadirse el producto |

Al aplicarla, todo lo ya completado y todos los pedidos se congelan con el costo y la tarifa de ese
día, así que no cambia ninguna cifra.

## Qué hay que cambiar en el bot

`src/services/owner/negocio.ts` (`productosEntre` y lo que calcule margen) multiplica las unidades
vendidas por el costo **de hoy** (`costosDe`, leído de `catalogo_costos`). Tiene que usar, por cada
venta, el costo congelado de `pedido_costos` (pedidos) y de `costos_congelados` (productos vendidos
dentro de una cita). Solo si una venta no tiene fila congelada, el costo de hoy.

La comisión el bot no la calcula (solo la calcula el panel, `lib/panel/comisiones.ts`), así que eso
ya está resuelto. Si algún día el asistente dice cuánto ganó un profesional, que lea
`comisiones_congeladas`.

## Cuidado

- Las tres tablas no se bajan al SQLite: no van en la bajada ni tienen `sync_version`.
- Leer con la clave de servicio. `costos_congelados` y `pedido_costos` solo los ve el dueño por
  RLS, igual que `catalogo_costos`.
