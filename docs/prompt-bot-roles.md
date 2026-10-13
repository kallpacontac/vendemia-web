# Prompt para la sesión del bot: roles de verdad (dueño, administrador, empleado)

Pégalo tal cual. Retomado el 13-oct-2026: Alvaro contestó todas las decisiones y están aquí dentro.
El plan entero, con lo que toca el panel, es `vendemia-web/docs/PLAN-ROLES.md`.

**Va por fases y cada una se despliega sola.** Haz la 1 y la 2, que no le cambian nada a nadie, y
para. **La fase 4 (el corte) va una semana después de que el panel enseñe el aviso a los dueños**
(decisión de Alvaro): es el día en que gente que hoy lo ve todo deja de verlo. No la despliegues
hasta que él te confirme que esa semana ha pasado.

---

## 1 · Qué pasa hoy

Un negocio tiene dueño, administrador y empleados (barbero, estilista, profesor), y el panel los
trata casi igual a los tres:

- **RLS:** las tablas con política de lectura usan `is_member(company_id)`. Ninguna mira el rol.
- **Comandos:** el rol solo se mira en `preguntar_asistente` y en los tres del equipo. Un empleado
  puede hoy cambiar precios, apuntar gastos, cancelar citas o cambiar los métodos de pago.
- **Empleado ↔ usuario:** no hay enlace. `employees` no sabe qué usuario es cada barbero, así que
  no existe «mis citas» ni «mi comisión».

## 2 · Los roles

| Rol | `memberships.role` |
|---|---|
| `dueno` | `owner` — uno por negocio (0040) |
| `admin` | `admin` |
| `empleado` | `member`, `agent`, y cualquier valor que no se conozca |

Superadmin no es un rol de negocio: sale de `platform_admins` y no cambia.

El mapeo va a vivir en TRES sitios que tienen que decir lo mismo: una función SQL (`rol_en`), la
tuya (`rolEnElAsistente` ya lo hace para el asistente: generalízala) y
`vendemia-web/lib/panel/roles.ts`. Cada una con un comentario que apunte a las otras dos.

## 3 · Lo decidido (Alvaro, 13-oct-2026)

**El administrador**
- Lleva la **caja**: apunta ingresos y gastos.
- Ve las **comisiones en solo lectura**: las de todos, sin poder cambiar el porcentaje de nadie.
- **No ve** métricas de ingresos ni ganancia.
- Da de alta y de baja **solo a empleados**. Nombrar o quitar administradores, solo el dueño.
- **No cambia** métodos de pago ni teléfonos del negocio.

**El empleado**
- Ve **sus citas y las «Sin asignar»**. Una cita o una clase sin empleado asignado la ven TODOS
  los empleados hasta que se asigne. En una academia hoy son todas: los grupos no tienen profesor.
- De los clientes de las citas que ve: nombre, notas del salón, notas de Mia y los campos propios
  del negocio (edad, etc.). **Nada de contacto**: ni teléfono, ni WhatsApp, ni correo, ni dirección.
- **No entra al chat.**
- **No cobra.** Marca «vino / no vino»; el cobro lo apunta la caja.
- Nunca ve importes de citas ajenas, ni mensualidades, ni deudas.

**Valores por defecto míos (Alvaro no los ha discutido; si los cambia, te lo digo):**
- El empleado ve su propia comisión, y solo la suya.
- Marca «vino / no vino» en las suyas y en las «Sin asignar». No se las puede asignar a sí mismo.
- Ve el catálogo con precios, sin el coste ni la comisión de cada servicio.
- El administrador edita catálogo, precios, los ajustes de Mia y el horario del negocio.

## 4 · Lo que hay que construir

### 4a · El enlace empleado ↔ usuario

`memberships.employee_id text null`: la ficha de `employees` de esa persona, o null.

- En SQLite, en la migración de Postgres y en el espejo. Solo significa algo si es empleado.
- La ficha tiene que ser de la MISMA compañía que la membresía: valídalo al escribir.
- `delete_employee` deja la membresía con `employee_id` a null; no la borra.
- `add_member` y `cambiar_rol_miembro` aceptan `employee_id` (opcional), y hace falta un comando
  para ponerlo o quitarlo después (`enlazar_ficha`, o como lo llames): lo usan el dueño y el
  administrador sobre un empleado.
- `equipo_listar` devuelve también `employee_id`.
- Un empleado sin ficha ve solo las citas «Sin asignar».

### 4b · La base: preguntar «¿puede?», no «¿es miembro?»

Mismo patrón que Fideliza (`loyalty_role_can`, en
`vendemia-web/modules/fideliza/sql/0002_permisos_rls.sql`): la matriz en UNA función.

```sql
public.rol_en(p_company text) returns text        -- 'dueno' | 'admin' | 'empleado' | null
public.mi_empleado(p_company text) returns text   -- su ficha, o null
public.rol_puede(p_rol text, p_permiso text) returns boolean   -- la matriz. Si cambia, cambia aquí
public.puede(p_company text, p_permiso text) returns boolean
```

`stable`, `security definer`, `search_path` fijo. En las políticas, `(select public.puede(…))`:
sin el `select`, Postgres las evalúa fila a fila.

| Permiso | Empleado | Admin | Dueño | Tablas y vistas |
|---|---|---|---|---|
| `agenda.todo` | — | ✓ | ✓ | `appointments`, `appointment_services`, `employee_blocks` |
| `agenda.mia` | ✓ | — | — | las mismas, solo filas con `employee_id = mi_empleado()` **o sin asignar** |
| `equipo.ver` | su ficha ¹ | ✓ | ✓ | `employees` |
| `clientes.ver` | — ² | ✓ | ✓ | `leads`, `messages`, `conversation_events`, `escalations`, `retargeting`, `seguimientos`, `blocklist` |
| `caja.ver` | — | ✓ | ✓ | `pending_payments`, `gastos`, `orders`, `v_movimientos` |
| `comisiones.ver` | la suya | ✓ | ✓ | ver 4d |
| `metricas.ver` | — | — | ✓ | `v_daily_metrics`, `v_revenue_by_day`, `v_orders_by_day`, `v_leads_by_day`, `v_intent_by_day`, y las RPC `analytics_*`, `metricas_conversion`, `conversion_global` |
| `catalogo.ver` | ✓ ³ | ✓ | ✓ | `catalog`, `catalog_media`, `form_templates` |
| `plan.ver` | — | ✓ | ✓ | `consumo_mensual`, `recargas` |
| `bot.ver` | — | ✓ | ✓ | `instances`, `v_instance_health` |

¹ De `employees`, el empleado necesita el nombre de todos (para leer la agenda) pero no el
`comision_pct` de los demás. Ver 4d.
² El empleado no lee `leads`. Tiene su propia vista: 4c.
³ Sin `comision_pct`, `comision_monto` ni el coste.

«Sin asignar» es `employee_id` vacío o null, y en una academia toda fila cuyo `slot_start` empieza
por `sched:` mientras los grupos no tengan profesor. Que sea UNA función (`es_sin_asignar`) y no la
comparación repetida en cada política.

Cuidado con cuatro cosas:

- **Las vistas.** Comprueba una por una que llevan `security_invoker`: una vista sin él se salta las
  políticas de sus tablas y enseñaría los ingresos a quien no toca.
- **Las RPC.** Si es `security definer`, se salta las políticas y tiene que llamar a `puede(…)`
  dentro; si es `security invoker`, las hereda. No lo he comprobado función por función.
- **`companies`** la tiene que poder leer todo el mundo (nombre, `business_mode`), pero lleva
  `payment_methods`, `owner_phone`, `admin_phone` y `plan`. El RLS es por filas, no por columnas:
  una vista recortada para el empleado, o permisos de columna. No lo dejes como está.
- **`commands`:** el empleado lee solo los suyos (`created_by = auth.uid()`).

### 4c · Los clientes del empleado, sin contacto

El RLS filtra filas, no columnas: quien lee una fila de `leads` se lleva el teléfono. Así que el
empleado **no lee `leads`**. Lee una vista o una función propia:

```sql
public.mis_clientes(p_company text) returns jsonb
-- [{ lead_id, name, notas_salon, customer_notes, custom_data }]
```

- Solo los clientes con una cita que ese empleado puede ver (suya o «Sin asignar»).
- **Fuera:** `phone`, `customer_email`, `customer_address`, y cualquier enlace a WhatsApp.
- `messages`: nada. El empleado no tiene chat.

⚠️ `custom_data` es lo que cada negocio decidió guardar. Si uno guarda ahí «correo» o «teléfono de
emergencia», se le cuela al empleado. Dos salidas, elige y dímelo: (a) filtrar las claves cuyo
valor parezca un teléfono o un correo; (b) que cada campo propio lleve una marca «visible para el
empleado» en `qualifying_questions`, apagada por defecto. La (b) es la buena; la (a) vale para
salir.

### 4d · Las comisiones

Se calculan en el panel con `appointments`, `employees.comision_pct` y `catalog.comision_*`.

- **Empleado:** solo la suya. Con `agenda.mia` ya solo tiene sus citas; le falta su propio
  `comision_pct` y no ver el de los demás. Como `employees` la lee entera para pintar la agenda,
  hay que sacar el porcentaje de ahí para él (vista recortada o permisos de columna).
- **Administrador:** las de todos, solo lectura. En el bot: `upsert_employee` de un administrador
  no puede tocar `comision_pct`, ni `upsert_catalog_item` los `comision_*`. Devuélvelos en un campo
  aparte (`sin_permiso: [...]`), no en silencio.
- **Dueño:** todo.

### 4e · El bot: cada comando, quién lo puede encolar

Una tabla en un solo fichero, lista BLANCA: un comando que no esté en ella solo lo ejecuta el
dueño. Se comprueba en `ejecutar`, antes del handler, con `SinReintento` y un mensaje escrito para
una persona.

| Comando | Empleado | Admin | Dueño |
|---|---|---|---|
| `marcar_cumplido` | en citas suyas y «Sin asignar» | ✓ | ✓ |
| `crear_cita`, `modificar_cita` | — | ✓ | ✓ |
| `marcar_pagado`, `registrar_pago`, `upsert_gasto`, `delete_gasto` | — | ✓ | ✓ |
| `send_message`, `toggle_bot`, `handoff`, `resolve_escalation`, `actualizar_lead`, `marcar_seguimiento` | — | ✓ | ✓ |
| `upsert_catalog_*`, `delete_catalog_*`, `set_primary_media` | — | ✓ sin `comision_*` | ✓ |
| `upsert_employee`, `delete_employee`, `upsert_employee_block`, `delete_employee_block` | — | ✓ sin `comision_pct` | ✓ |
| `update_company` | — | ✓ sin los campos de cobro | ✓ |
| `add_member` | — | solo `role: 'member'` | `member` o `admin` |
| `quitar_miembro` | — | solo sobre un empleado | cualquiera menos el dueño |
| `cambiar_rol_miembro` | — | — | ✓ |
| `enlazar_ficha` (4a) | — | sobre un empleado | ✓ |
| `preguntar_asistente` | — | ✓ sin importes | ✓ |

- **Campos de cobro:** `payment_methods`, `owner_phone`, `admin_phone` y `whatsapp_phone`. En un
  `update_company` de un administrador no se aplican y vuelven en `sin_permiso`. ⚠️ No los metas
  en `ignored`: el panel lee `ignored` como «no cambió».
- **«Citas suyas»:** `appointments.employee_id` = `memberships.employee_id` de quien encola.
- `equipo_listar` pasa a devolverle la lista también al administrador. El panel le pinta botones
  solo en los empleados; tú rechazas lo demás.
- `marcar_seguimiento` del superadmin sigue como está (0023).

## 5 · Las fases

1. **Cimientos.** `employee_id`, las funciones SQL, `mis_clientes`, y la tabla de comandos en modo
   AVISO: apunta en el log lo que rechazaría, no rechaza. Las políticas, sin tocar. Nadie nota nada.
2. **El administrador gana lo suyo.** `add_member`, `quitar_miembro` y `enlazar_ficha` para el
   administrador sobre empleados; `equipo_listar` también para él. Solo añade.
3. **El dueño clasifica.** Es del panel: un aviso en «Acceso del equipo». Tú no haces nada.
4. **El corte.** Las políticas pasan a `puede(…)` y la tabla de comandos empieza a rechazar.
   **Una semana después del aviso de la fase 3, y con el visto bueno de Alvaro.** Antes, dile
   cuánta gente hay de cada rol:
   `select role, count(*) from memberships group by role;`

Cada paso, su migración. El SQL lo aplica Alvaro a mano.

## 6 · Cómo comprobarlo

Amplía `src/dev/run-tests-rls.ts` con cuatro usuarios del mismo negocio: dueño, administrador,
empleado con ficha y empleado sin ficha. Y una cita de cada: de ese empleado, de otro, y sin asignar.

- [ ] Empleado con ficha: en `appointments` ve la suya y la sin asignar; la del otro, no.
- [ ] Empleado sin ficha: solo la sin asignar.
- [ ] En cuanto la sin asignar se le asigna a otro, deja de verla.
- [ ] Empleado: `select` en `leads`, `messages`, `gastos`, `pending_payments`, `orders`, las vistas
      de ingresos y las RPC de métricas → cero filas o error.
- [ ] `mis_clientes` del empleado: los de sus citas y los de las sin asignar; en ninguna fila hay
      teléfono, correo ni dirección.
- [ ] Empleado: no ve el `comision_pct` de otro empleado; sí el suyo.
- [ ] Empleado: lee `companies` sin `payment_methods` ni teléfonos.
- [ ] Administrador: caja y agenda completas; las vistas de ingresos, vacías.
- [ ] Administrador: `update_company` con `payment_methods` → no cambia y vuelve en `sin_permiso`.
- [ ] Administrador: `upsert_employee` con `comision_pct` → el resto se guarda, el % no.
- [ ] Administrador: `add_member` con `role: 'admin'` → rechazado; con `'member'` → entra.
- [ ] Administrador: `quitar_miembro` sobre otro administrador → rechazado; sobre un empleado → sí.
- [ ] Por cada fila de la tabla de 4e, un comando encolado por quien no puede → `error` con el
      mensaje, y el handler no se ejecutó.
- [ ] Empleado: `marcar_cumplido` en una cita de otro → rechazado; en la suya y en una sin
      asignar → sí.
- [ ] El dueño: todo, como hoy. Los casos que ya había siguen pasando.

## 7 · Lo que necesito de vuelta

Un prompt para el panel al terminar la fase 1 y otro al terminar la 2, con:

- El nombre exacto de `memberships.employee_id`, de `mis_clientes`, de `enlazar_ficha` y de sus
  resultados.
- Los mensajes de rechazo, para enseñarlos tal cual.
- `sin_permiso` en los resultados de `update_company`, `upsert_employee` y `upsert_catalog_item`.
- Cómo resolviste `custom_data` (4c) y el `comision_pct` del empleado (4d).
- Qué tablas y vistas devolverán cero filas a cada rol tras el corte, para que el panel pinte «no
  es para ti» en vez de una pantalla vacía.
