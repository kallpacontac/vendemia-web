<!-- ─────────────────────────────────────────────────────────────────────────
     COPIA. El original vive en  vendemia/docs/integracion-panel.md
     Sincronizada: 2026-08-19

     No edites este archivo: se sobrescribe al volver a copiar. Si algo aquí
     no cuadra con lo que hace el bot, gana el original — y probablemente esta
     copia se quedó vieja.
     ───────────────────────────────────────────────────────────────────────── -->

# Integración del panel con Supabase

Este documento es el **contrato que implementa el front**. Se puede copiar tal cual al repo
del panel: no da por sabido nada de este repo.

Para el *por qué* de la arquitectura (triggers, outbox, escritor único) ver
[sincronizacion-supabase.md](./sincronizacion-supabase.md). Aquí solo está el *cómo se usa*.

> **No hace falta leer nada más para integrar el panel.** Si además quieres entender cómo
> razona el bot por dentro —anatomía del prompt, una conversación real paso a paso con el
> JSON de cada llamada, tools en paralelo, recolección de datos— está en
> <https://claude.ai/code/artifact/801d08a4-4417-4092-8dd3-6a02d1a234bd>.

---

## La regla, en una frase

> **El panel LEE tablas y vistas. Para CAMBIAR algo, inserta una fila en `commands`.**

No hay `UPDATE` ni `INSERT` del panel sobre ninguna otra tabla. No es una convención de
estilo: los `GRANT` de Postgres solo permiten `select`, más `insert` en `commands`. Un
`update` desde el navegador falla siempre, aunque alguien escriba una política permisiva
por error.

El motivo es que la fuente de la verdad es el SQLite del bot, y Supabase es su réplica. Si
el panel escribiera en Postgres, el siguiente barrido del espejo reescribiría esa fila con
lo que hay en local y el cambio desaparecería sin error ni aviso — el *lost update* clásico.

---

## Con qué habla el front

**Solo con Supabase.** Nunca con el bot: vive en una máquina doméstica detrás de un router,
sin IP fija ni puertos abiertos. No es alcanzable desde internet, y no tiene que serlo.

```
  Panel (Vercel)                Supabase                 Bot (local)
  ─────────────                 ────────                 ───────────
   lee tablas    ──────────────▶  réplica  ◀───────────── espejo (push cada 3s)
   inserta       ──────────────▶ commands  ──────────────▶ websocket saliente
                                                          aplica en SQLite
   ve el cambio  ◀──────────────  réplica  ◀───────────── vuelve por el espejo
```

Un cambio guardado en el panel se ve reflejado en **1-2 segundos**, cuando vuelve por el
espejo. Ese retraso es deliberado: lo que el panel muestra es lo que el bot tiene de verdad,
no un optimismo que puede revertirse.

---

## Claves y cliente

```bash
# .env del panel (Vercel)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

```ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)
```

| Clave | Quién | Dónde |
|---|---|---|
| `sb_publishable_` (anon) | el panel | navegador. Respeta RLS |
| `sb_secret_` (service_role) | **solo el bot** | nunca en el navegador, ni en Vercel, ni en el repo |

`sb_secret_` **se salta el RLS entero**. Con esa clave en el bundle, cualquiera lee y escribe
todas las compañías. Si aparece en el front, el aislamiento entre clientes deja de existir.

Sin sesión (`anon`) no se lee **nada** de negocio: el `revoke all ... from anon` está puesto.

---

## Autenticación

Supabase Auth por email + contraseña. Tres caminos de entrada:

```ts
// 1. Alta propia desde la landing
await supabase.auth.signUp({ email, password })
// Crea el usuario, pero SIN membresía: todavía no ve ninguna compañía.
// Alvaro le crea la compañía con `npm run onboard` y le queda el acceso listo.

// 2. Login normal
await supabase.auth.signInWithPassword({ email, password })

// 3. Alta que hace el dueño para su recepcionista → comando `add_member` (más abajo).
//    Entra con la contraseña temporal que el panel muestra en pantalla.
```

### Elegir compañía

Un usuario puede pertenecer a varias. La lista sale de `memberships`, que por RLS solo
devuelve las suyas:

```ts
const { data: mias } = await supabase
    .from('memberships')
    .select('company_id, role, companies(name)')
```

`role` es `owner` o `member`. **El front debe ocultar la gestión de usuarios a quien no sea
`owner`** — no por seguridad (el bot lo rechaza igual), sino para no ofrecer un botón que va
a fallar.

Todo lo demás se consulta con `company_id = <la elegida>`. El RLS ya filtra por membresía,
así que un `company_id` ajeno no devuelve filas: la consulta sale vacía, no da error.

---

## El backend manda

El modelo redacta; **no decide qué es verdad**. Cada dato que el bot afirma —un hueco libre, un
precio, una cita hecha— sale de una consulta a la base, y cada cambio pasa por una función que lo
revalida antes de escribir. Lo que el modelo produce es prosa, y la prosa no crea filas.

```
Cliente   «¿tienen mañana a las 4?»
Modelo    no lo sabe y no lo supone: llama a check_availability
Tool  ◀── AQUÍ ESTÁ LA VERDAD. Lee horario, citas y bloqueos en SQLite.
          Devuelve huecos reales o un error
Modelo    escribe la respuesta CON lo que devolvió la tool
Tool  ◀── book_appointment REVALIDA el cupo otra vez, y recién entonces escribe la fila
SQLite    el trigger marca la fila en la outbox
Espejo    el worker la sube a Supabase
Panel     la ve. Es la primera vez que existe fuera del bot
```

Las dos filas marcadas son las puertas. Si la segunda rechaza —el turno se ocupó mientras se
hablaba— **no hay fila**, y el panel no enseña una cita que no existe. Que el modelo haya escrito
«listo, te espero mañana» no la crea: el bot tiene instrucción de no confirmar hasta que la tool
responda OK, pero aunque se saltara esa instrucción, la reserva seguiría sin existir.

### Lo que significa para el panel

- **Lo que el panel muestra ya ocurrió.** Nunca es una intención del modelo: son las filas que las
  tools escribieron y el espejo subió.
- **La configuración es datos, no texto.** El horario vive en `schedule`, los precios en `catalog`,
  los pagos en `payment_methods`. Ahí es donde el motor los lee.
- **Nunca repitas esos datos en un campo de texto libre.** Un `custom_rules` que diga «abrimos
  domingos» contra un `schedule` con domingo cerrado hace que el bot ofrezca una hora que el motor
  luego rechaza, delante del cliente. Lo que no se duplica no se puede contradecir.

Las reglas de negocio (`custom_rules`) son para *cómo comportarse* — «confirma el servicio y la hora
antes de cerrar», «si no sabes algo, dilo». Si el panel deja escribir horarios en la caja de reglas,
está creando la contradicción por diseño.

---

## Cómo decide el bot: tool calling

Un mensaje entrante es **un turno**. No hay árbol de intenciones ni plantillas de respuesta: el
modelo lee, llama a las tools que necesite y redacta.

```
mensaje del cliente
  ↓
system prompt        // congelado por empresa, cacheado
+ historial          // últimos 12 mensajes
+ bloque de estado   // fecha, cita activa, borrador en curso
+ tools              // según business_mode
  ↓
el modelo llama tools → cada una consulta o escribe en SQLite → devuelve texto
  ↓                                        (hasta 8 vueltas)
prosa final → WhatsApp
```

Modelo: **Claude Haiku 4.5**, cambiable por variable de entorno — nada fuera de la capa de proveedor
(`src/services/llm/`) sabe qué LLM hay debajo.

### Qué tools ve el modelo

Dependen del `business_mode`. Un negocio de citas no ve `create_order`, y uno recurrente no ve
`book_appointment`: su esquema solo sabe expresar una fecha puntual, que para un grupo semanal
siempre es la respuesta equivocada.

| `business_mode` | Tools | Escriben |
|---|---|---|
| `appointment` | `get_services`, `check_availability`, `save_customer_info`, `book_appointment`, `update_appointment`, `cancel_appointment` | las cuatro últimas |
| `recurring` | `get_services`, `check_schedule_slots`, `save_customer_info`, `join_schedule_slot`, `cancel_appointment` | las tres últimas |
| `ecommerce` | `get_services`, `save_customer_info`, `create_order`, `cancel_order` | las tres últimas |

### Un error de la tool es una instrucción, no una excepción

Las tools devuelven texto, también cuando rechazan. El modelo lo lee y corrige en la misma vuelta,
sin que el cliente vea nada raro:

```
ERROR: "Corte Premium" no existe en el catálogo. Llama a get_services y usa nombres reales.
NO se reservó: todavía no tienes el nombre del cliente. Pregúntaselo, guárdalo con
save_customer_info y recién entonces reserva. NUNCA inventes un nombre.
```

Por eso una alucinación no llega a la base: la tool la rechaza y le explica al modelo qué hacer.

### Qué pasa cuando el panel guarda

| Si el panel cambia… | El bot lo nota… |
|---|---|
| `catalog`, `employees`, `schedule` | en la siguiente llamada a una tool — consultan SQLite cada vez, no hay copia en memoria que caducar |
| `bot_tone`, `custom_rules`, `return_policy`, `welcome_note`… | en el siguiente mensaje del cliente: cambia la huella del prompt congelado y se reconstruye solo |

En ninguno de los dos casos hay que reiniciar el bot ni invalidar nada a mano.

---

## Lectura

Todas las tablas espejadas se leen con PostgREST normal. Las que sostienen el panel:

| Tabla | Pantalla |
|---|---|
| `companies` | configuración del bot |
| `leads` | lista de clientes / conversaciones |
| `messages` | el chat (`lead_id`, `role` = `user` \| `assistant`, `content`) |
| `catalog` | productos y servicios |
| `employees`, `employee_blocks` | agenda por trabajador |
| `appointments`, `appointment_services` | citas |
| `orders`, `pending_payments` | pedidos y comprobantes |
| `escalations` | lo que el bot no supo resolver |
| `blocklist` | números bloqueados |
| `memberships` | usuarios con acceso |
| `conversation_events` | traza de la conversación |

### Mapa de campos

Solo se listan las columnas que el panel usa; cada tabla tiene además `id`, `company_id`,
`created_at`/`created_ts` y `mirrored_at`.

Tres convenciones que valen para todo:

- **Los booleanos son `integer`**, no `boolean`: `1` sí, `0` no. Vienen de SQLite, que no tiene
  tipo booleano. Aplica a `is_active`, `bot_active`, `request_location`, `ask_employee`,
  `require_payment_to_confirm`, `verified`.
- **Toda fecha viene dos veces**: `x_at` (epoch) y `x_ts` (`timestamptz`). Usa `x_ts`.
- **Los campos marcados JSON son `text`**, no `jsonb`. Hay que `JSON.parse()`.

#### `companies` — la configuración

| Campo | Tipo | Valores / forma |
|---|---|---|
| `name`, `bot_name` | text | nombre del negocio y del asistente |
| `bot_tone` | text | texto libre — «cercano y directo» |
| `business_mode` | text | `ecommerce` · `appointment` · `recurring_appointment` |
| `schedule` | JSON | objeto por día — ver abajo |
| `payment_methods` | JSON | array — ver abajo |
| `custom_rules`, `return_policy` | text | comportamiento, **nunca horarios ni precios** |
| `delivery_type` | text | `delivery` · `pickup` · `both` |
| `slot_minutes` | integer | duración por defecto de un turno |
| `require_payment_to_confirm` | 0/1 | 1 = la cita queda `pending_payment` hasta el voucher |
| `owner_phone`, `admin_phone`, `whatsapp_phone` | text | formato `51987654321`, sin `+` |
| `qualifying_questions` | JSON | preguntas obligatorias — ver abajo |
| `ask_employee` | 0/1 | solo en `appointment`: preguntar por el profesional antes de cerrar |
| `is_active` | 0/1 | empresa activa |

```jsonc
// schedule
{
  "monday":   { "open": "09:00", "close": "19:00", "slot_minutes": 30, "capacity": 1 },
  "saturday": { "open": "09:00", "close": "14:00", "slot_minutes": 30, "capacity": 1 },
  "sunday":   { "closed": true }
}
// Claves: monday…sunday. Un día ausente = cerrado. capacity = citas simultáneas.
```

```jsonc
// payment_methods
[
  { "type": "yape", "number": "987654321", "name": "Lucas Pérez" },
  { "type": "cash" }
]
// type: yape | plin | bank_transfer | cash | cod. Opcionales: number, name, qr_url.
// OJO: yape/plin SIN number se imprimen vacíos en el prompt ("• Yape:  a nombre de").
// Si el panel deja elegir Yape, el número tiene que ser obligatorio en el formulario.
```

##### `qualifying_questions` — las preguntas obligatorias

Un array, **guardado como `text`**: hay que `JSON.parse()` al leer y `JSON.stringify()` al
escribir. El bot las hace **siempre y en orden** antes de cerrar.

```ts
{
  question:       string          // lo que el bot pregunta
  reject_if:      string | null   // regla en lenguaje natural que descalifica al cliente
  reject_message: string | null   // qué le dice si lo descalifica
  is_terminal:    boolean         // true = rechazo duro; false = aviso, el cliente puede insistir
  field_key?:     string          // si está, la respuesta se guarda en lead.custom_data[field_key]
  required?:      boolean         // con field_key: el bot NO cierra la venta sin este dato
}
```

```jsonc
// Ejemplo real, de una academia de natación
[
  {
    "question": "¿Desde qué distrito nos escribes?",
    "reject_if": "El distrito NO está en: Jesús María, Lince, San Isidro, Magdalena",
    "reject_message": "Nuestra sede está en Jesús María. Desde tu distrito el viaje puede ser largo 📍",
    "is_terminal": false
  },
  {
    "question": "¿Para qué edad son las clases?",
    "reject_if": "La edad mencionada es menor a 3 años",
    "reject_message": "Para menores de 3 añitos aún no tenemos clases 🏊",
    "is_terminal": true,
    "field_key": "age",
    "required": true
  }
]
```

`reject_if` se escribe en lenguaje normal: lo interpreta el modelo, no es una expresión.
`required: true` es lo más fuerte de aquí — el bot **literalmente no cierra** la reserva sin
ese dato, así que uno de más es la forma más rápida de que deje de vender.

##### `ask_employee` — quién atiende

`0`/`1`, y **solo aplica en modo `appointment`**. Con `1` el bot pregunta siempre por el
profesional antes de cerrar la cita, valida el nombre contra `employees` y ajusta la
disponibilidad al horario de ESA persona.

**No lo dupliques como `qualifying_question`.** Van por caminos distintos: la respuesta de
`ask_employee` entra en el motor de horarios; la de una pregunta obligatoria acaba en
`custom_data`, que el motor de reservas no lee. Se preguntaría dos veces y la segunda no
serviría de nada.

#### `leads` — el cliente

| Campo | Tipo | Valores / forma |
|---|---|---|
| `phone` | text | `51987654321` |
| `name`, `customer_email`, `customer_address` | text | `''` si no se sabe |
| `status` | text | `new` · `contacted` · `paid` · `closed` |
| `intent` | text | `purchase_ready` · `quote` · `inquiry` · `support` · `other` |
| `bot_active` | 0/1 | 0 = en manos de una persona. Lo mueven `toggle_bot` y `handoff` |
| `handoff_at` | epoch | cuándo se pausó. El bot se reactiva solo a las 12 h |
| `custom_data` | JSON | `{clave: valor}` — respuestas a los campos propios del negocio |
| `customer_notes` | text | resumen que el bot fue acumulando |

#### `catalog` — productos y servicios

| Campo | Tipo | Valores / forma |
|---|---|---|
| `name`, `description` | text | **`name` es la clave real**: el modelo pide servicios por nombre exacto |
| `price` | numeric | `currency` por defecto `PEN` |
| `duration_minutes` | integer | citas: cuánto ocupa. `0` usa el `slot_minutes` de la empresa |
| `is_active` | 0/1 | oculto del catálogo si es 0 |
| `sort_order` | integer | orden de presentación |
| `stock` | integer | `null` = sin control de stock |
| `capacity` | integer | plazas simultáneas |
| `package_services` | JSON | array de nombres — convierte el ítem en un pack |
| `schedule_slots` | JSON | solo `recurring` — ver abajo |
| `image_url` | text | una sola. Varias van en `catalog_media` |

```jsonc
// schedule_slots — un grupo semanal de un negocio recurrente
[{ "id": "manana", "label": "Mañanas L-M-V (6–7am)",
   "days": [1,3,5], "time": "06:00", "capacity": 12 }]
// days: 0=domingo … 6=sábado. capacity -1 = sin límite.
```

#### `appointments` — las citas

| Campo | Tipo | Valores / forma |
|---|---|---|
| `slot_start`, `slot_end` | text | **no son timestamps**: texto local `"2026-08-20 16:00"`. En recurrentes `slot_start` es `"sched:manana"` y `slot_end` va vacío |
| `status` | text | `pending_payment` · `confirmed` · `cancelled` · `completed` · `no_show` |
| `slot_minutes` | integer | duración total reservada |
| `employee_id` | text | `''` = sin asignar |
| `service` | text | resumen. El detalle está en `appointment_services` |

`completed` lo pone el cron: pasada la hora, sin noticias, se asume que el cliente vino.
`no_show` es la corrección manual del negocio, y saca esa cita de la facturación.

`appointment_services` lleva una fila por servicio con `name`, `price` y `duration_minutes`
**congelados al reservar**. No es un join a `catalog` a propósito: si mañana sube el precio, la
cita de ayer sigue valiendo lo que valía.

#### `orders` — los pedidos

| Campo | Tipo | Valores / forma |
|---|---|---|
| `status` | text | `pending` · `paid` · `cancelled` · `delivered` |
| `items` | JSON | `[{ name, price, quantity, catalog_item_id }]` — congelado igual que arriba |
| `total`, `discount` | numeric | `total` ya lleva el descuento aplicado |
| `payment_method` | text | el `type` elegido |
| `voucher_url` | text | comprobante subido por el cliente |
| `delivery_address`, `delivery_option`, `delivery_time` | text | entrega |

Las métricas de ingresos solo cuentan `paid`. Un pedido `delivered` que nunca pasó por `paid` no
aparece en `revenue`.

#### Las demás

| Tabla | Campos que importan |
|---|---|
| `employees` | `name`, `is_active` (0/1), `schedule` — mismo JSON que la empresa; vacío = hereda el suyo |
| `employee_blocks` | `employee_id`, `start`, `end`, `reason`. **`end` es palabra reservada en Postgres** — hay que entrecomillarla en SQL a mano (supabase-js lo hace solo) |
| `escalations` | `status`: `pending` o `resolved`, se cierran con `resolve_escalation`. `kind` es texto abierto (hoy `paid_removal`, `paid_reschedule`): trátalo como etiqueta, no como enum cerrado. `detail` es JSON |
| `pending_payments` | `amount`, `voucher_path`, `operation_id`, `verified` (0/1), `order_id` / `appointment_id` — uno de los dos |
| `memberships` | `auth_user_id` (= `auth.users.id`), `role`: `owner` o `member` |
| `catalog_media` | `product_name` (por nombre, no por id), `url`, `media_type`, `sort_order` |
| `blocklist` | clave compuesta `(company_id, phone)` — no tiene `id` |

### El chat de un cliente

```ts
const { data } = await supabase
    .from('messages')
    .select('id, role, content, created_ts')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true })
```

`messages` no tiene `company_id`: su política resuelve el permiso a través de `leads`. Se lee
igual, pero **no se puede filtrar por compañía directamente** — hay que ir por el lead.

### En vivo

```ts
supabase.channel(`chat-${leadId}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${leadId}` },
        ({ new: msg }) => añadirAlChat(msg))
    .subscribe()
```

### Métricas

Vistas ya calculadas — el front no agrega nada a mano:

| Vista / función | Devuelve |
|---|---|
| `v_daily_metrics` | `leads, paid_orders, revenue, appointments, escalations_pending` por día |
| `v_leads_by_day` | `date, count` |
| `v_orders_by_day` | `date, count, revenue` (solo pagadas) |
| `v_intent_by_day` | `date, intent, count` |
| `analytics_products(company, desde, hasta)` | ingresos por producto — es RPC, no vista |

```ts
const { data } = await supabase
    .from('v_daily_metrics')
    .select('*')
    .eq('company_id', companyId)
    .gte('date', '2026-08-01')
    .order('date')

const { data: productos } = await supabase.rpc('analytics_products', {
    p_company: companyId, p_from: '2026-08-01', p_to: '2026-08-31',
})
```

**Se agrupan en hora de Lima**, no UTC. Es deliberado: una venta de las 19:00 caía en el día
siguiente. Las cifras del panel no cuadran al dedillo con las del bot en la franja
19:00–23:59.

---

## Escritura: la cola de comandos

```ts
const { data: cmd } = await supabase
    .from('commands')
    .insert({ company_id: companyId, type: 'update_company', payload: { patch: { bot_tone: 'cercano' } } })
    .select('id')
    .single()
```

No se mandan `status`, `attempts` ni `created_by`:

- `status` y `attempts` los fuerza la política a `'pending'` / `0`. Mandar otra cosa hace
  fallar el insert.
- **`created_by` lo rellena Postgres con `auth.uid()`.** El panel no puede falsearlo, y es lo
  que permite comprobar permisos en el bot.

### Esperar el resultado

El bot mueve la fila `pending → processing → done | error`. Se sigue por Realtime:

```ts
export const encolar = (companyId: string, type: string, payload: object, timeoutMs = 15000) =>
    new Promise<any>(async (resolve, reject) => {
        const { data: cmd, error } = await supabase
            .from('commands')
            .insert({ company_id: companyId, type, payload })
            .select('id')
            .single()
        if (error) return reject(error)

        const canal = supabase.channel(`cmd-${cmd.id}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'commands', filter: `id=eq.${cmd.id}` },
                ({ new: fila }: any) => {
                    if (fila.status === 'done')  { supabase.removeChannel(canal); resolve(fila.result) }
                    if (fila.status === 'error') { supabase.removeChannel(canal); reject(new Error(fila.error)) }
                })
            .subscribe()

        // El bot puede estar apagado. El comando NO se pierde —se ejecuta al arrancar—
        // pero la UI no puede quedarse colgada esperando.
        setTimeout(() => {
            supabase.removeChannel(canal)
            reject(new Error('El bot no respondió. El cambio se aplicará cuando vuelva a estar en línea.'))
        }, timeoutMs)
    })
```

Ese mensaje de timeout importa: **el comando no se perdió.** Queda en `pending` y se drena en
cuanto el bot arranca. Decirle al usuario "no se guardó" sería mentira, y volvería a darle a
guardar.

### Catálogo de comandos

| `type` | `payload` | `result` | Quién |
|---|---|---|---|
| `update_company` | `{ patch: { bot_tone, custom_rules, schedule, ... } }` | `{ updated: [], ignored: [] }` | miembro |
| `upsert_catalog_item` | `{ item: { id?, name, price, ... } }` | `{ id }` | miembro |
| `delete_catalog_item` | `{ id }` | `{ id }` | miembro |
| `upsert_employee` | `{ employee: { id?, name, schedule?, is_active? } }` | `{ id }` | miembro |
| `delete_employee` | `{ id }` | `{ id }` | miembro |
| `send_message` | `{ text, phone }` o `{ text, lead_id }` | `{ phone }` | miembro |
| `toggle_bot` | `{ lead_id, active: boolean }` | `{ lead_id, bot_active }` | miembro |
| `handoff` | `{ lead_id }` | `{ lead_id }` | miembro |
| `resolve_escalation` | `{ escalation_id }` | `{ escalation_id }` | miembro |
| `add_member` | `{ email, role? }` | `{ email, user_id, ya_existia, password_temporal }` | **solo `owner`** |

Un `type` desconocido queda en `error` con `tipo desconocido: X`. Un comando que falla se
reintenta hasta 3 veces antes de quedarse en `error`.

### Cómo leer la respuesta del comando `update_company`

El bot devuelve `{ updated: string[], ignored: string[] }`.

**`ignored` NO significa «rechazado». Significa «esto no cambió».** Se calcula comparando el
valor antes y después, así que un campo mandado con el mismo valor que ya tenía aparece ahí
igualmente. Si el dueño abre la pantalla, no toca nada y pulsa Guardar, vuelve **todo** en
`ignored` — y un panel que enseñe *«no se pudo guardar: …»* con esa lista estaría acusando al
backend de fallar cuando no ha fallado nada.

Regla: solo trátalo como error si mandaste ese campo con un valor **distinto** del que ya
tenías en el formulario. Y eso lo sabe el panel, que tiene el estado previo.

Lo más limpio es **mandar únicamente los campos que el usuario modificó** — así `ignored`
vacío es el caso normal y la ambigüedad desaparece sola:

```ts
const completo = construirPatch(form)                       // todo, como si todo cambiara
const patch = Object.fromEntries(
  Object.entries(completo).filter(([k, v]) => v !== original[k]),
)
if (!Object.keys(patch).length) return avisar('No hay nada que guardar')

const r = await encolar(companyId, 'update_company', { patch })
if (r.ignored.length) avisar(`El bot no aceptó: ${r.ignored.join(', ')}`, 'error')
```

**Los campos JSON viajan como texto.** Si reserializas `schedule`, `payment_methods` o
`qualifying_questions` con las claves en otro orden, el campo saldrá en `updated` aunque el
contenido sea equivalente. Es inofensivo, pero explica algún «guardado» que parece de más: la
forma de evitarlo es que la foto inicial y el patch salgan del **mismo** serializador.

Campos editables: `name`,
`bot_name`, `bot_tone`, `hook_question`, `custom_rules`, `return_policy`, `schedule`,
`payment_methods`, `business_mode`, `delivery_type`, `whatsapp_phone`, `owner_phone`,
`admin_phone`, `location`, `slot_minutes`, `require_payment_to_confirm`, `welcome_note`,
`closing_note`, `reminder_config`, `business_description`, `qualifying_questions`,
`ask_employee`… (lista completa:
`EDITABLE_COMPANY_FIELDS` en `src/services/db.service.ts`).

Cuando el cambio entra, el prompt del bot se reconstruye solo en el siguiente mensaje del
cliente. No hay que reiniciar nada.

### `add_member` — dar acceso a otra persona

```ts
const r = await encolar(companyId, 'add_member', { email: 'recepcion@correo.com', role: 'member' })

if (r.password_temporal) mostrarEnPantalla(r.password_temporal)  // usuario nuevo
else                     toast.ok('Ya tenía cuenta; ahora tiene acceso a esta empresa')
```

Tres cosas que el front debe respetar:

1. **Solo un `owner` puede.** Un `member` recibe `error: "solo el dueño puede dar de alta a
   otros usuarios"`. Oculta el botón, pero cuenta con que el error puede llegar igual.
2. **La contraseña se enseña en pantalla, no se manda por correo.** El SMTP por defecto de
   Supabase va limitadísimo y cae en spam; un alta que depende de un email falla justo cuando
   hay alguien delante esperando. El dueño la lee y se la dicta.
3. **`password_temporal` viene a `null` si la persona ya tenía cuenta** (`ya_existia: true`).
   Su contraseña no se toca. El panel no debe enseñar un hueco vacío.

---

## Estado de la instancia

`v_instance_health` responde "¿está funcionando el bot de este cliente?" con el diagnóstico
ya masticado:

```ts
const { data } = await supabase
    .from('v_instance_health')
    .select('*')
    .eq('company_id', companyId)
    .single()
```

| Campo | |
|---|---|
| `status` | `pending_approval` · `approved` · `starting` · `running` · `needs_qr` · `stopped` · `error` |
| `vivo` | booleano: hubo latido en los últimos 90s |
| `wa_connected` | WhatsApp vinculado. **Distinto de `vivo`** — el proceso puede estar perfectamente vivo con la sesión caída |
| `diagnostico` | texto listo para enseñar: *"Hay que ir a re-emparejar el WhatsApp"* |
| `reconnects`, `last_disconnect_reason` | por qué se cayó la última vez |

**No hay QR en Supabase, y no lo va a haber.** Un QR de WhatsApp es una sesión completa: quien
lo escanea antes que el dueño se queda con el número del negocio. El emparejamiento se hace en
persona, con el portátil delante. Si `status = 'needs_qr'`, la única acción del panel es
avisar — no hay botón que lo arregle.

---

## Detalles que muerden

**Las fechas vienen dos veces.** `created_at` es epoch en segundos (`bigint`, como en SQLite) y
`created_ts` es el mismo valor como `timestamptz`, generado por Postgres. **Usa siempre
`*_ts`** para mostrar y comparar; `created_at` solo para ordenar.

**Varios campos JSON son texto, no `jsonb`.** `schedule`, `payment_methods`, `custom_data`,
`qualifying_questions`, `items` de `orders`… se espejan tal cual salen de SQLite, que no tiene tipo
JSON. Hay que `JSON.parse()` al leer y `JSON.stringify()` al mandar en un `patch`.

**El bot puede estar apagado.** Es normal: es un portátil. Las lecturas siguen funcionando (la
réplica está ahí), los comandos esperan. `sync_state.last_mirror_at` dice cuándo se espejó por
última vez — si está viejo, el panel debería avisar de que los datos no están al día en vez de
enseñar cifras de ayer como si fueran de ahora.

---

## Lo que el front NO debe hacer

- ❌ Llevar la `service_role` al navegador o a Vercel.
- ❌ `update` / `insert` / `delete` sobre tablas espejadas. Falla, y si un día no fallara el
  cambio se perdería igual al siguiente barrido del espejo.
- ❌ Mandar `status`, `attempts` o `created_by` al insertar un comando.
- ❌ Mandar el formulario entero en un `update_company`: manda solo lo que cambió, o `ignored`
  vuelve lleno de campos que nadie tocó y el panel denuncia un fallo que no existe.
- ❌ Confiar solo en ocultar botones para los permisos. El bot revalida; el front oculta por
  comodidad, no por seguridad.
- ❌ Enseñar un QR o prometer re-emparejar desde el panel.

---

## Lo que este contrato todavía no cubre

Dos cosas que el panel puede querer hacer y para las que **hoy no hay camino por Supabase**:

| Qué | Situación |
|---|---|
| **Subir imágenes** de catálogo | `upsert_catalog_item` acepta `image_url` pero **no sube el archivo**. La subida a Cloudinary solo existe en el `/api` del bot, que no es alcanzable desde internet. Mientras tanto: el panel aloja la imagen por su cuenta y manda la URL. Si hace falta subir desde el panel, hay que añadir un comando o un endpoint aparte |
| **Reservas públicas** (widget para el cliente final) | Existen —`GET /public/:companyId/availability`, `POST /public/:companyId/book`— pero viven en el bot local, no en Supabase. Son otro contrato: sin sesión, sin RLS, contra la máquina del bot |

Todo lo demás que el panel necesita —leer, configurar, gestionar conversaciones, dar de alta
usuarios, ver el estado del bot— está en este documento.
