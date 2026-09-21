# Prompt para la sesión del bot — comisiones, caja y la nota del salón

Pégalo entero en la sesión de `vendemia`. Escrito el 2026-09-18 contra el panel en `main`.

Sale de comparar Vendemia con **WeiBook** (weibook.co, el software de salones más extendido en
LatAm) para decidir qué le falta a un salón de belleza para poder trabajar solo con nosotros.
Salieron tres cosas, y **las tres necesitan algo del bot**: el panel solo lee.

El panel ya tiene hecha su parte de lectura: `lib/panel/dinero.ts` (los tres criterios de dinero) y
`getMovimientos()` sobre `v_movimientos`. Lo que sigue es lo que falta debajo.

---

## Contexto: por qué estas tres y no otras

Un salón paga software por **las comisiones**. El dueño las cuadra a mano en Excel cada quincena, y
es la primera pregunta que hace en una demo. Hoy en Vendemia **no existe nada**: cero coincidencias
de `comision|commission` en todo el repo.

Las otras dos —la ficha de la clienta y la caja del día— son las que hacen que no necesite además
un cuaderno.

Lo que **no** vamos a copiar de WeiBook, por si surge: multi-sede, facturación electrónica, wallet,
pagos divididos, inventario de insumos. Eso es ERP.

---

## 1 · Comisiones

### Lo que ya está y no hay que tocar

`v_movimientos` (0027) ya trae `employee_id`, `importe`, `estado` y `fecha_servicio`, y
`appointment_services` ya congela `price` por línea. **El dato caro existe.** Falta la tarifa.

### Tres columnas

| Columna | Tabla | Tipo | Quién la escribe |
|---|---|---|---|
| `comision_pct` | `employees` | REAL NOT NULL DEFAULT 0 | `upsert_employee` (ya existe, `commands.service.ts:212`) |
| `comision_pct` | `catalog` | REAL NULL | `upsert_catalog_item` (ya existe, `:128` — ya es un PATCH, así que añadir campos sale gratis) |
| `comision_monto` | `catalog` | REAL NULL | idem |

> **El porcentaje va de 0 a 100, no de 0 a 1.** Decídelo así y escríbelo en el comentario de la
> columna: es el error que se cuela solo, y no revienta — paga 45 céntimos donde tocaban 45 soles,
> o al revés. El panel divide entre 100 al calcular.

Hace falta migración en los dos lados: `ALTER TABLE` en `db.service.ts` (con el `try/catch` de
siempre) y una migración de Postgres con **el siguiente número libre** — la 0032 ya es
`appointments_beneficiario`, así que hoy sería la 0033.

> **⚠️ La de Postgres va ANTES de arrancar el bot con el código nuevo.** Lo dice tu propia cabecera
> de la 0032: el espejo vuelca con `SELECT *`, y una columna que existe en SQLite y no en Postgres
> **rompe la replicación de la tabla entera**, en silencio. Vale para las cinco tablas que toca
> este encargo (`employees`, `catalog`, `leads`, `appointments`, `companies`) — y `appointments` y
> `companies` son las que, rotas, dejan el panel sin agenda o sin configuración.

### La regla de cálculo — la calcula el PANEL, no el bot

Por cada línea de `appointment_services` de una cita `completed`:

1. ¿El servicio tiene `comision_monto`? → esa cantidad.
2. ¿Tiene `comision_pct`? → `price × pct / 100`.
3. Si no → `price × employees.comision_pct / 100`.
4. Sin tarifa → 0, y la pantalla lo dice.

**No hace falta ninguna vista ni RPC nueva**: el panel ya puede leer `appointment_services`
(espejada) y `appointments.employee_id`. Si prefieres servirlo desde una función de Postgres para
que bot y panel no puedan discrepar, adelante — pero entonces que sea la única, y avísanos para
consumirla en vez de calcular.

### ⚠️ La trampa, y el interruptor que la cierra: `asumir_asistencia`

La comisión se devenga cuando la cita se **completa** (decisión de Alvaro, 18-sep). Pero hoy
`completed` lo pone el cron: *pasada la hora, sin noticias, se asume que el cliente vino*.

O sea que **un plantón que nadie marca como `no_show` acaba pagando comisión**. No es un fallo del
cálculo, es la definición de `completed`: el cron está adivinando, y con comisiones de por medio
esa suposición se convierte en dinero que sale de la caja hacia alguien que no trabajó.

**Decisión de Alvaro (18-sep): que sea configurable, y que por defecto NO se asuma.**

| Columna | Tabla | Tipo |
|---|---|---|
| `asumir_asistencia` | `companies` | INTEGER NOT NULL DEFAULT **0** |

- `0` (por defecto) — **el cron no marca nada.** La cita pasada se queda en `confirmed` esperando a
  que alguien diga si vino o no.
- `1` — el comportamiento de hoy: pasada la hora y sin noticias, a `completed` con
  `cumplido_por='cron'`.

Hay que añadirla a **`EDITABLE_COMPANY_FIELDS`** (`db.service.ts:880`) o el panel no podrá
cambiarla: `update_company` filtra por esa lista y el campo volvería en `ignored` sin decir por qué.

#### El cron no toca lo que ya tocó una persona

Esto vale con el interruptor en 0 y en 1, y es lo que pidió Alvaro explícitamente: **la marca
automática solo puede actuar sobre lo que nadie ha marcado.** Si desde el panel se dijo «No vino»
(`no_show`) o se canceló (`cancelled`), el cron no lo revisa ni lo revierte nunca.

Probablemente ya se cumple por construcción —el cron busca `confirmed` con la hora pasada, y un
`no_show` o un `cancelled` ya no es `confirmed`—, pero **confírmalo y déjalo escrito como
condición, no como efecto secundario**. Un refactor que cambie el filtro a «citas pasadas» a secas
resucitaría plantones ya marcados, y eso sería dinero mal pagado sin que nadie lo vea.

Regla equivalente para el estado de cumplimiento: no pisar nunca una fila con `cumplido_por` ya
puesto.

#### Dos consecuencias que hay que asumir con los ojos abiertos

1. **Recién activado, un salón verá comisiones en cero** hasta que empiece a marcar asistencia. Es
   correcto —no se paga por lo que nadie confirmó— pero se lee como un fallo si la pantalla no lo
   dice. Del lado del panel lo resolvemos enseñando cuántas citas pasadas están sin marcar y lo que
   suman; no hace falta nada tuyo para eso.
2. **Los ingresos NO cambian.** `estados_cita_con_ingreso()` incluye `confirmed`, así que una cita
   que se queda en `confirmed` para siempre sigue contando en Métricas y en el dashboard igual que
   antes. Esto solo mueve las comisiones. Si al revisarlo ves que algo más depende de `completed`
   —retargeting, recordatorios, el conteo de `v_daily_metrics`— dilo, porque nosotros desde el
   panel no lo vemos.

> **¿Y los pedidos?** Alvaro pidió el mismo trato para «pedidos o citas». Si existe un cron que
> mueva pedidos a `delivered` por su cuenta, que respete el mismo interruptor y la misma regla de
> no tocar lo ya marcado. Si no existe —creemos que no, `marcar_cumplido` parece el único
> camino—, con confirmarlo basta.

**Trabajar así no deja al salón vendido:** la pantalla ya existe. La Agenda del panel tiene la
pestaña «Ya pasaron» con los botones Vino / No vino (`agenda/page.tsx`), que hasta ahora era un
cajón de repaso y pasa a ser la tarea de cada cierre de día.

### Dos límites que vamos a escribir en la pantalla

Que sepas que los damos por buenos, por si te chirría:

- **Una cita, un estilista.** `appointment_services` no tiene `employee_id`
  (`db.service.ts:301-309`), así que si Ana hace el tinte y Luis el peinado en la misma cita, todo
  se le apunta a quien figure en `appointments.employee_id`. Añadir ahí la columna es EL sitio si
  algún día hace falta, pero no lo pedimos hoy.
- **La venta de producto no genera comisión.** En `v_movimientos` la rama `order` trae
  `employee_id` literal `''`: no se sabe quién vendió. Lo decimos en pantalla en vez de dar un
  total que no cuadra.

---

## 2 · La nota del salón — `actualizar_lead`

Un salón vive de la fórmula del tinte («8.1 + oxidante 20 vol, 35 min»), las alergias y las manías
de cada clienta. Hoy eso no se puede guardar: **no existe ningún comando que toque un lead**.

- Columna nueva **`leads.notas_salon`** (TEXT NOT NULL DEFAULT `''`).
- Comando nuevo **`actualizar_lead`** con `{ lead_id, notas_salon }`.

> **Columna aparte, NO `customer_notes`.** Esa la acumula el bot conforme habla, y si el panel
> escribe encima de la misma columna se pisan: el resumen del bot borra lo que escribió el salón, o
> al revés, y nadie sabe por qué desapareció. Son dos voces distintas y necesitan dos campos.

Si quieres que el modelo también LEA `notas_salon` (para que Mia sepa que la clienta es alérgica,
que es la mitad de la gracia), hace falta meterla en el prompt. Nosotros no podemos: eso es tuyo.
Merece la pena.

---

## 3 · Caja del día

### El método de pago, que es lo que falta

`orders` tiene `payment_method`. **Las citas no guardan ninguno**, y un salón es casi todo citas —
así que hoy el desglose «cuánto entró en efectivo y cuánto por Yape» es imposible justo donde más
importa.

- Columna nueva **`appointments.metodo_pago`** (TEXT NOT NULL DEFAULT `''`), mismos valores que
  `payment_methods.type`: `yape` · `plin` · `bank_transfer` · `cash` · `cod`.
- **`marcar_pagado` acepta un `metodo_pago` opcional** y lo escribe. El comando ya existe
  (`commands.service.ts:324`) y ya pone `pagado_por='panel'`; es un campo más.
- **Y que lo escriba también el flujo del voucher.** Cuando el bot verifica una captura ya sabe de
  qué app es: si `image.flow.ts` no rellena `metodo_pago`, la caja enseñará «sin método» en todos
  los cobros que verificó Mia, que son la mayoría. Ahí se pierde la mitad del valor.

El botón «Cobrar» de la Agenda del panel pasará a preguntar con qué se pagó.

### La tabla `gastos`

Es lo único verdaderamente nuevo.

```sql
gastos (
  id          text primary key,
  company_id  text not null,
  fecha       text not null,   -- 'YYYY-MM-DD', día de Lima
  concepto    text not null,
  categoria   text not null default '',   -- texto libre; el panel sugiere
  importe     real not null,
  creado_por  text not null default '',   -- quién lo apuntó
  created_at  integer not null
)
```

Arrastra las cuatro cosas de siempre: `CREATE TABLE` en `db.service.ts`, migración
de Postgres (siguiente número libre) **con RLS `is_member(company_id)`**, alta en `MIRROR_TABLES`
(`mirror.service.ts:47-81`) y los comandos **`upsert_gasto`** y **`delete_gasto`**.

Un uso que conviene tener en la cabeza al diseñarlo: **el adelanto a una estilista se apunta como
gasto**. Es lo que nos permite no construir el libro de préstamos y multas que tiene WeiBook — la
misma necesidad, sin una tabla más. Si `categoria` acepta algo como `adelanto`, con eso basta.

> `creado_por`: `commands.created_by` lo rellena Postgres con `auth.uid()` y el panel no lo puede
> falsear. Si lo propagas al gasto, el salón sabe quién apuntó cada cosa — que en una caja es
> justo lo que se pregunta cuando no cuadra.

---

## Lo que NO hay que hacer

- **No toques `estados_con_ingreso()` ni `ESTADOS_CON_INGRESO`.** La comisión es más estricta que
  los ingresos a propósito (solo `completed`), y eso lo filtra el panel en `lib/panel/dinero.ts`.
  Cambiar la definición global de ingresos para que cuadre con las comisiones movería las cifras de
  Métricas y del dashboard de todos los clientes.
- **No añadas un segundo sitio donde se decida qué es dinero.** Si haces una vista o una RPC de
  comisiones, dilo y la usamos; lo que no puede haber es las dos cosas.
- **No mandes nada a WhatsApp** por ninguno de estos comandos. Ninguno de los tres habla con el
  cliente.

## Cómo probarlo

1. Pon `comision_pct = 45` a un empleado de `barberia-01` y `comision_pct = 30` a un servicio
   concreto. Una cita `completed` de ese empleado con ese servicio y otro más tiene que dar
   `precio_servicio × 0.30 + precio_otro × 0.45`.
2. **El negativo, que importa igual:** una cita `confirmed` del mismo empleado **no** debe sumar
   comisión, y sí debe seguir contando en los ingresos de Métricas. Las dos cifras no cuadran, y
   está bien que no cuadren.
3. **El interruptor, en sus dos posiciones.** Con `asumir_asistencia = 0` (el defecto), deja pasar
   la hora de una cita `confirmed` y comprueba que **sigue en `confirmed`** — el cron no la tocó.
   Ponlo a `1`, vuelve a pasar el cron, y ahora sí debe quedar `completed` con
   `cumplido_por='cron'`.
4. **Que el cron no resucite lo marcado:** coge una cita pasada, márcala «No vino» desde el panel
   (`no_show`), pon `asumir_asistencia = 1` y pasa el cron. Tiene que seguir en `no_show`. Lo mismo
   con una `cancelled`. Es la prueba que evita pagar comisión por un plantón ya reconocido.
5. Marca un cobro en efectivo desde la Agenda del panel y comprueba que la cita queda con
   `metodo_pago='cash'` y `pagado_por='panel'`.
6. Apunta un gasto, mira que llega a Supabase por el espejo, y bórralo.

---

## Lo que hará el panel cuando esto llegue

Para que no lo construyas tú por error:

- Un interruptor en Ajustes, **«Dar por atendida la cita si nadie dice lo contrario»**, apagado por
  defecto, que escribe `asumir_asistencia` por `update_company`. No lo añadimos hasta que la
  columna exista: hoy volvería en `ignored` y la pantalla lo denunciaría como un fallo.
- En comisiones, el aviso de **cuántas citas pasadas están sin marcar y cuánto suman**, que es lo
  que explica un total en cero sin que nadie tenga que preguntar.
- El «Cobrar» de la Agenda preguntando el método de pago.
- La pantalla de Caja y la nota del salón editable en la ficha del cliente.
