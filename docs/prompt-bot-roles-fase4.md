# Prompt para la sesión del bot: roles, fase 4 (el corte)

Pégalo tal cual. Va después de `prompt-bot-roles.md`, cuyas fases 1 y 2 ya hiciste. Esto es lo que
el panel necesita de ti para el día del corte, ahora que su parte está construida.

**El corte es el 21 de octubre de 2026.** Los dueños ven el aviso desde el 13. No actives nada
antes, y ese día espera a que Alvaro te diga que el panel ya está cambiado (ver §1).

---

## 1 · El orden, el día del corte

El panel tiene su parte detrás de un interruptor (`NEXT_PUBLIC_ROLES_EN_VIGOR=1` en Vercel). Los dos
lados tienen que cambiar el mismo día, y **en este orden**:

1. Alvaro enciende el interruptor del panel y redespliega.
2. Tú aplicas la migración de las políticas (las de `puede(…)`).
3. Tú pasas la tabla de comandos de modo aviso a rechazar.

Por qué así: con el panel cambiado y la base sin cortar, el panel esconde de más un rato y no pasa
nada. Al revés —la base cortada y el panel sin cambiar— al empleado le salen las pantallas de
siempre, vacías, y eso sí se nota.

## 2 · Un cambio que te pido: las comisiones por servicio, también al empleado

En `prompt-bot-roles.md` te pedí que `catalogo_del_equipo` le quitara al empleado `comision_pct` y
`comision_monto`. Fue un error mío: con eso no puede ver bien su propia comisión.

La comisión se calcula en el panel (`lib/panel/comisiones.ts`), y por cada servicio la regla es: si
el SERVICIO tiene comisión propia, gana; si no, se usa el porcentaje del profesional. Sin los campos
del servicio, «Mi comisión» calcula todo con su porcentaje general, y en un negocio con comisiones
por servicio le sale una cifra distinta de la que ve el dueño. Con sueldos de por medio, eso es una
discusión.

→ `catalogo_del_equipo` devuelve `comision_pct` y `comision_monto` también al empleado.

No es el sueldo de nadie: es la tarifa del servicio, la misma para quien lo haga. Lo que sigue
oculto es el `comision_pct` de las FICHAS de los demás (`equipo_fichas`), que es lo que sí es de
cada persona. Si prefieres no exponerlo, la alternativa es una función `mi_comision(p_company,
p_desde, p_hasta)` que haga la cuenta en la base; pero serían dos sitios calculando lo mismo.

## 3 · Lo que lee el panel del empleado tras el corte

Las políticas tienen que dejar pasar exactamente esto. Si algo de la lista no va a funcionar, dímelo
antes del 21:

| Qué | Cómo lo pide el panel |
|---|---|
| `memberships` | su fila, con `companies(name, business_mode)` embebido. Le llegará `null` en lo embebido: el panel ya cae a `mi_negocio` |
| `appointments` | por `company_id` y rango de `slot_start`; y las de `slot_start like 'sched:%'` con `status in (confirmed, pending_payment)`. Espera recibir las suyas y las sin asignar |
| `appointment_services` | `.in('appointment_id', [...])` de SUS citas completadas. **Sin esto «Mi comisión» da cero.** La política: ve las líneas de las citas que puede ver |
| `mi_negocio`, `mis_clientes`, `equipo_fichas`, `catalogo_del_equipo` | las cuatro RPC, tal como las dejaste |
| `commands` | inserta `marcar_cumplido` y relee SU fila (por `id`) hasta que pase a `done`; también por Realtime |

Nada más. No lee `leads`, `companies`, `employees`, `catalog` ni ninguna vista: si alguna de esas
consultas saliera de una pantalla del empleado, es un fallo mío, no algo que abrir.

## 4 · Lo que lee el administrador

Sus pantallas son las de siempre menos el Dashboard y Métricas, que el panel ya no le abre. Leen:
`appointments`, `appointment_services`, `employee_blocks`, `employees` (con `comision_pct`),
`catalog` (con `comision_*`), `leads`, `messages`, `escalations`, `retargeting`, `seguimientos`,
`pending_payments`, `gastos`, `orders`, `v_movimientos`, `consumo_mensual`, `recargas`,
`v_instance_health`, `companies` entera y `equipo_listar`.

No he repasado pantalla por pantalla si alguna de las que conserva lee además una vista de métricas
(`v_daily_metrics` y compañía). Si la lee, le saldrá ese trozo vacío. Lo reviso yo antes del 21; si
al aplicar las políticas ves una consulta suya rechazada, avísame.

## 5 · Lo que necesito de vuelta

- Que el cambio del §2 está hecho (o que eliges `mi_comision`, con su forma).
- La migración del corte, para que Alvaro la tenga lista, y cualquier consulta de los §3 y §4 que
  no vaya a pasar.
- Los mensajes de rechazo siguen siendo los cinco de la fase 1: si cambias alguno, dímelo.

## Criterios de aceptación (con las políticas aplicadas)

- [ ] Empleado: `appointment_services` de una cita suya → sus líneas; de una ajena → nada.
- [ ] Empleado: `catalogo_del_equipo` trae `comision_pct` y `comision_monto`.
- [ ] Empleado: `memberships` con `companies(...)` embebido → su fila, con lo embebido a `null`, sin error.
- [ ] Empleado: inserta `marcar_cumplido` sobre una cita suya y lee el resultado de su comando.
- [ ] Administrador: todas las lecturas del §4 devuelven filas.
- [ ] Dueño: todo, como hoy.
