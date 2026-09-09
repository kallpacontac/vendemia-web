# Prompt para la sesión del repo del bot (`vendemia-root/vendemia`)

> Cópialo entero en una sesión nueva abierta en `vendemia-root/vendemia`.
> Escrito el 2026-09-09 desde la sesión del panel, después de auditar cómo se
> mide el dinero en los tres modos de negocio.

---

Trabajas en `vendemia-root/vendemia`, el bot. El panel (`vendemia-root/vendemia-web`)
lee de Supabase, que es un **espejo de solo lectura** de la SQLite del bot: el panel
nunca escribe en las tablas de negocio, encola filas en `commands` y las aplica
`src/services/commands.service.ts`. Todo lo que sigue hay que hacerlo aquí, no allí.

Antes de tocar nada, lee `supabase/migrations/0019_revenue_counts_delivered.sql`
entero, incluida la cabecera. Explica qué se arregló, qué se dejó a medias y por qué
— si no cuadra con lo que dice este prompt, para y dilo antes de escribir código.

## Lo que ya está hecho — no lo rehagas

La migración 0019 unificó qué cuenta como ingreso:

- `estados_con_ingreso()` → `paid`, `delivered`, `completed` (tabla `orders`)
- `estados_cita_con_ingreso()` → `confirmed`, `completed` (tabla `appointments`)
- Vista nueva `v_revenue_by_day` que suma **las dos fuentes**; `v_daily_metrics.revenue`
  ya la usa; `analytics_products` usa las mismas funciones.
- El lado SQLite está duplicado a propósito en `db.service.ts:1822-1823`
  (`CON_INGRESO` / `CITA_CON_INGRESO`, dentro de `getDailyMetrics`). **Las dos
  parejas de listas se mueven juntas o el bot y el panel dan cifras distintas para
  el mismo día.**

Decisión ya tomada por el dueño y que no hay que reabrir: *«de momento completado
también es pagado para nosotros»*.

---

## Trabajo 1 · El modo recurrente no guarda precio (bug real, dinero que se pierde)

`BusinessMode = 'ecommerce' | 'appointment' | 'recurring_appointment'`.
Empresas reales: `piel-futbolera`, `unicos`, `default` → ecommerce ·
`barberia-01` → appointment · `kallpa` → recurring_appointment.

| modo | dónde vive el dinero | ¿lo ve el panel? |
|---|---|---|
| ecommerce | `orders.total` | sí |
| appointment | `appointment_services.price` | sí, desde la 0019 |
| **recurring_appointment** | **en ninguna parte** | **no — S/0 siempre** |

La causa exacta: `src/services/tools/schedule.tools.ts:242` crea la cita del grupo
recurrente con `createAppointment` y **nunca llama a `setAppointmentServices`** (cero
apariciones en ese fichero). `booking.tools.ts:413` sí lo hace para las citas
normales. Resultado: una reserva recurrente no guarda ningún precio aunque el ítem
del catálogo lo tenga.

Evidencia contra la base real: `kallpa` tiene catálogo a S/120–150 (Nivel
Básico/Pollito, Intermedio/Delfín, Avanzado/Tiburón, Pack Promo S/150) y su única
cita recurrente —`sched:kallpa-basico:tarde-lmv`, estado `pending_payment`— no tiene
ni una fila en `appointment_services`.

**Esto no se puede arreglar desde el panel.** El panel solo lee lo que el bot
escriba; si el precio no se congela en el momento de la reserva no hay consulta que
lo recupere después, porque el precio del catálogo puede haber cambiado y el
criterio de todo el sistema es que `name`/`price` van **congelados** desde la reserva
(ver el comentario de `appointment_services` en `0001_schema.sql`).

Qué hacer:

1. Que `schedule.tools.ts` llame a `setAppointmentServices` al crear la reserva
   recurrente, congelando nombre y precio igual que `booking.tools.ts`.
2. Confirmar que `pending_payment` pasa de verdad a `confirmed` al pagar. Hoy
   `pending_payment` no cuenta como ingreso, y eso está bien, pero si nadie lo
   promueve el dinero se queda invisible igual.
3. **Antes de escribir el punto 1, contesta esta pregunta con el dueño**, porque
   cambia el número: en un cobro recurrente, ¿el ingreso es **la cuota al
   inscribirse** o **cada sesión asistida**? No hay respuesta en ningún sitio del
   código. Si es la cuota, una fila de `appointment_services` al inscribirse basta.
   Si es por sesión, hace falta materializar las sesiones y el modelo de datos
   actual no lo soporta — dilo claramente en vez de improvisar.

---

## Trabajo 2 · Una forma estándar de dar la información

Este es el trabajo de fondo, y el que hace posibles los filtros del panel.

**El problema.** Hoy cada pantalla del panel reconstruye a mano la misma idea
—"esto es dinero", "esto es una venta cerrada"— a partir de tablas distintas:
`orders` en ecommerce, `appointments` + `appointment_services` en citas, nada en
recurrente. Ya ha costado tres fallos distintos: la tarjeta de ingresos en S/0, una
conversión del 2787 %, y dos pantallas del mismo panel dando cifras incompatibles
para el mismo día. Cada pantalla nueva vuelve a pagar el mismo peaje.

**Lo que hay que construir: una fila por movimiento, con la misma forma venga de
donde venga.** Una vista `v_movimientos` (nómbrala como prefieras, pero que el
nombre no mienta) con al menos:

```
company_id      text
movimiento_id   text        -- id del pedido o de la cita
fuente          text        -- 'order' | 'appointment'
modo            text        -- business_mode de la empresa
lead_id         text
employee_id     text        -- '' en pedidos; en citas sale de appointments.employee_id
catalog_item_id text        -- puede venir vacío: hoy hay atribución por nombre
concepto        text        -- el name CONGELADO, no el del catálogo actual
unidades        numeric
importe         numeric
estado          text        -- el estado original, sin traducir
cuenta_ingreso  boolean     -- estados_con_ingreso() / estados_cita_con_ingreso()
fecha_creacion  date        -- created_ts en America/Lima
fecha_servicio  date        -- ver el aviso de abajo
```

Reglas para que esto no se convierta en un cuarto sitio donde diverge la definición:

- `cuenta_ingreso` **se calcula con `estados_con_ingreso()` y
  `estados_cita_con_ingreso()`**, nunca con literales. Si alguien cambia el criterio,
  se cambia en esas funciones y todo lo demás se entera solo.
- Las vistas existentes (`v_revenue_by_day`, `v_daily_metrics`, `v_orders_by_day`) se
  **reescriben encima de esta**, no se dejan calculando lo suyo en paralelo. Si al
  final hay dos caminos para el mismo número, no hemos arreglado nada.
- `security_invoker = true` y `grant select ... to authenticated`, como las de la 0019.
- Los importes de pedido salen del JSON de `orders.items` vía `safe_json_array`,
  igual que hace `analytics_products` hoy. **Ojo:** `orders.total` y la suma de los
  ítems pueden no coincidir (descuentos, envío). Mira cuál usa cada vista hoy antes
  de elegir, y deja escrito en un comentario cuál es la fuente de verdad y por qué.

### ⚠️ El aviso que más importa de todo este documento

`v_revenue_by_day` agrupa las citas por **`appointments.created_ts`** — la fecha en
que se *reservó*, no en que se *atiende*. `analytics_products` hace lo mismo. Con
una ventana fija de 30 días casi no se nota. **En cuanto el panel deje elegir
semana o mes, sí:** "los ingresos de la semana pasada" significará "lo que se
reservó la semana pasada", que para una barbería no es lo que facturó.

`appointments.slot_start` **no es un timestamp**: es texto local `"2026-08-20 16:00"`
y en los recurrentes es `"sched:<id>"`. O sea que `fecha_servicio` hay que derivarla
con cuidado y en `America/Lima`, y en las recurrentes **no existe** — decide qué
poner ahí (probablemente `null`, y que quien consulte sepa que en modo recurrente
solo hay fecha de creación).

**No elijas tú entre fecha de reserva y fecha de servicio.** Expón las dos columnas,
y deja que la consulta diga cuál usa. Pero avisa de que hoy todo el panel está
usando la de reserva sin saberlo.

### La RPC que consume el panel

Encima de la vista, una RPC única para las series temporales:

```sql
analytics_serie(p_company text, p_from date, p_to date, p_grain text)
-- p_grain: 'day' | 'week' | 'month'
```

que devuelva, por cubo: `periodo` (fecha de inicio del cubo), `leads`, `cerrados`,
`ingresos`, `citas`, `pedidos`. Requisitos:

- **La semana empieza el lunes** (`date_trunc('week', ...)` de Postgres ya lo hace) y
  el mes es natural. Todo en `America/Lima`, no en UTC — es lo que ya hacen todas las
  vistas y separarse de eso sería el cuarto criterio distinto.
- **Devuelve los cubos vacíos también**, con ceros. Las vistas actuales solo traen los
  días que tuvieron algo, y hoy el panel rellena los huecos a mano en cada pantalla
  (`app/(panel)/panel/page.tsx`, el `useMemo` de `semana`). Generar la serie con
  `generate_series` en la RPC borra esa duplicación de golpe.
- Un cubo parcial (la semana en curso) tiene que venir marcado como tal, o al menos
  quedar claro por el rango, para que el panel no pinte una caída que es solo "aún
  no ha terminado la semana".
- Parametrizable por `p_from`/`p_to` de verdad: hoy **todas** las pantallas están
  clavadas a `hace(29)` y por eso no hay filtros.

Comprueba de paso si `analytics_products` puede pasar a apoyarse en la vista nueva
en vez de repetir los dos `where` de estado. Si sale más simple, hazlo; si sale
más enrevesado, déjala y dilo.

---

## Trabajo 3 · Trabajadores (`employees`) — falta menos de lo que parece

Ya existe casi todo, y conviene comprobarlo antes de proponer nada:

- Tablas `employees` y `employee_blocks` en `0001_schema.sql`, con RLS.
- Comandos `upsert_employee` (`{ employee: { id?, name, schedule?, is_active? } }`)
  y `delete_employee` (`{ id }`) ya implementados en `commands.service.ts:169` y `:176`.
- El panel ya sabe leerlos: `getTrabajadores()` y `getBloqueos()` en
  `lib/supabase/queries.ts`, usadas por la agenda y las métricas.

**El hueco real está en los bloqueos.** `db.service.ts` sabe crear y borrar filas de
`employee_blocks` (líneas 1215 y 1221), pero **no hay ningún comando** que lo exponga:
el panel puede *leer* los bloqueos de un trabajador y no puede crear ni quitar
ninguno. Es la mitad de un módulo de trabajadores — "Marco está de vacaciones la
semana que viene" no se puede registrar desde ninguna parte.

Qué hacer:

1. Añadir `upsert_employee_block` y `delete_employee_block` siguiendo exactamente el
   patrón de `upsert_employee`. **`end` es palabra reservada en Postgres**: va
   entrecomillada en cualquier SQL a mano (supabase-js la cita solo).
2. Verificar qué valida `upsert_employee` hoy: solo comprueba `payload.employee.name`.
   Decide si `schedule` debe validarse contra el mismo formato `Horario` que usa la
   empresa — un JSON mal formado ahí deja al trabajador sin disponibilidad y el
   síntoma aparece lejos, en el motor de reservas.
3. Confirmar que `ask_employee` sigue el camino que dice `docs/contrato-backend.md`
   (valida el nombre contra `employees` y recalcula disponibilidad con el horario de
   esa persona) y que **solo** aplica en modo `appointment`.
4. Actualizar la tabla de comandos de `docs/contrato-backend.md` con los dos nuevos.

Con la vista del Trabajo 2 (`employee_id` incluido), "ingresos por trabajador" sale
gratis. Menciónalo pero no lo construyas: es una pantalla del panel.

---

## Decisiones que NO puedes tomar solo

Pregúntalas antes de escribir el código que dependa de ellas:

1. **Ingreso recurrente**: ¿cuota al inscribirse o por sesión asistida? (Trabajo 1.3)
2. **Fecha de referencia**: ¿los ingresos de un periodo son los reservados o los
   atendidos en él? Hoy es "reservados", sin que nadie lo haya decidido.
3. **`confirmed` cuenta como ingreso** aunque la cita no haya ocurrido. Se mantuvo por
   coherencia con `analytics_products`, no porque se eligiera. Al meter filtros por
   periodo esto se vuelve más visible: conviene reconfirmarlo.

## Cómo verificar que funciona

No des nada por bueno contra datos sembrados. **Los S/9.205 de `barberia-01` son
casi todos falsos**: 446 de sus 447 citas las creó el script de siembra el mismo
2026-09-08, todas con la misma fecha de creación. Para probar la agrupación semanal
y mensual hacen falta datos repartidos en el tiempo, o el resultado será un único
cubo gigante que parece correcto.

Comprobaciones mínimas:

- `kallpa` (recurrente) deja de dar S/0 después del Trabajo 1.
- La suma de `analytics_serie(..., 'day')` sobre un mes = la de `'month'` para ese
  mes = lo que dice `v_revenue_by_day`. Si los tres no cuadran, hay dos definiciones
  vivas otra vez.
- Un negocio ecommerce (`piel-futbolera`) y uno de citas (`barberia-01`) dan cifras
  coherentes con la misma RPC, sin ramas por modo en el panel.
- El bot y el panel siguen diciendo lo mismo para hoy: compara `getDailyMetrics` de
  SQLite contra `v_daily_metrics` de Postgres.
