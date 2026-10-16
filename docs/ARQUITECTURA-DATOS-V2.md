# Arquitectura de datos v2 · quién manda en cada tabla

Escrito el 15-oct-2026. Estado: **aprobada por Alvaro** («procede con la arquitectura, nada de
atajos»). **16-oct:** etapa 0 hecha (medidas del bot en `vendemia/docs/medidas-arquitectura-v2.md`,
resumidas en §2) y etapa 1 aplicada en Supabase (`modules/datos/sql/0001`). La 0002 recoge lo que la
medida corrigió.

Sustituye la regla «SQLite manda en todo» de `docs/sincronizacion-supabase.md` (repo del bot). La
regla que **no** cambia: **cada tabla tiene un solo escritor.** Lo que cambia es quién es ese
escritor.

---

## 1 · Por qué

Hoy el bot (en local, con SQLite) es el único que escribe. El panel inserta un comando y espera a que
el bot lo ejecute. Eso funcionó mientras todo negocio tenía bot. Ya no es así:

- Los negocios de **Fideliza** nacen solo en Supabase (`loyalty_business_create`), sin bot.
- **Tu página** (`tienda.*`/`agenda.*`; `docs/PLAN-TU-PAGINA.md`) tiene que funcionar con un negocio que solo tiene un número de
  WhatsApp.
- Sin bot, **un negocio no puede ni guardar su catálogo**: `upsert_catalog_item` espera a un bot que
  no existe.

## 2 · Lo que se mide (15-oct-2026, desde la máquina del bot)

| Medida | Valor |
|---|---|
| Consulta a Supabase con conexión abierta | **~210 ms** |
| Consulta a Supabase abriendo conexión | 420–770 ms |
| Consulta a SQLite local | microsegundos |
| Un turno de Mia (modelo incluido) | 2–6 s |

**Medido por el bot (etapa 0, 16-oct)**, 170 turnos del eval completo sobre una copia de la base:

| Por turno | p50 | p95 | máx |
|---|---|---|---|
| Consultas a SQLite | 16 | 37 | 50 |
| Tiempo en SQLite | 1,5 ms | 19,7 ms | 36,6 ms |
| Turno entero (modelo incluido) | 2.556 ms | 4.912 ms | 7.624 ms |
| Escrituras en tablas de la nube | 0 | 3–4 | 5 (turnos que reservan) |
| Lectura a Supabase (PostgREST, 20 seguidas) | 258 ms | 430 ms | 725 ms |

Volumen real de escrituras de agenda y configuración: **menos de una por negocio y día**.

**La conclusión ya es firme:** leer en remoto en cada turno lo triplicaría (16 × ~250 ms ≈ +4 s
sobre ~2,5 s). Leer en local no es una optimización, es la condición. **El bot sigue leyendo todo en local.** Solo va a la nube al **escribir** una reserva, un cobro
o un cambio de catálogo, que pasa una vez por conversación y cuesta 0,2–0,4 s sobre un turno de
2–6 s.

El argumento de «SQLite funciona sin internet» no aplica: sin internet el bot tampoco tiene OpenAI
ni WhatsApp. Lo que de verdad compra SQLite es **velocidad de lectura**, y eso se conserva entero.

## 3 · El reparto

| Dominio | Tablas | Escritor | Cómo llega al otro lado |
|---|---|---|---|
| **Configuración** | `companies` (entera), `catalog`, `catalog_variantes`, `catalog_media`, `employees`, `employee_blocks`, `form_templates` | **Nube** | Bajada a SQLite (§4) |
| **Agenda y dinero** | `appointments`, `appointment_services`, `orders`, `pending_payments`, `gastos` | **Nube**, a través del servicio de reservas (§5) | Bajada a SQLite (§4) |
| **Anotaciones del bot sobre citas** | `citas_del_bot` (nueva: `appointment_id`, `calendar_event_id`, `reminder_sent_at`) | **Bot** | Espejo de subida |
| **Tu página** | `tu_pagina`, `envios` | **Nube** (nacen ahí) | Bajada solo si el bot las usa algún día |
| **Conversación** | `leads`, `messages`, `conversation_events`, `escalations`, `retargeting`, `consumo_mensual`, `recargas`, `blocklist`, `seguimientos` | **Bot** (como hoy) | Espejo de subida, sin cambios |
| **Accesos** | `memberships` y lo de roles | Sin tocar hasta después del corte del 21-oct | — |

**`leads` en un negocio sin bot:** no hay conversación, así que los únicos clientes son los de Tu página.
Los crea la nube. Si ese negocio activa a Mia más tarde, el alta del bot **importa** sus leads una vez
y desde ahí el bot pasa a ser su dueño. Es la única tabla cuyo escritor depende del negocio, y por eso
el traspaso es un paso explícito, no algo que ocurra solo.

**`companies` pasa entera a la nube** (corregido por la etapa 0). El estado de la instancia no vive
ahí: el bot lo publica en `instances`, directo a Supabase. Todo lo que el bot escribe en `companies`
en ejecución es configuración que llega del panel o de la API.

**Los campos con dos dueños están en `appointments`:** `calendar_event_id` (Mia lo escribe segundos
después de reservar, cuando contesta Google) y `reminder_sent_at` (cron cada 15 min). Con la agenda en
la nube serían escrituras del bot sobre filas que ya no son suyas. Se sacan a una tabla del bot,
`citas_del_bot`, que sube por el espejo: un escritor por tabla, sin excepciones.

**Las escrituras de arranque del bot** (`initSchema` en `companies`, `catalog_media` y `appointments`;
`completarClavesCalificacion`) rellenan datos en cada boot. Tras el corte serían escrituras locales que
la bajada pisa: se apagan para las tablas de la nube y su trabajo lo hace la nube (la 0002 ya pone
las claves de las preguntas obligatorias, como `conClaves`).

**Un negocio nacido en la web que luego monta un bot** (`onboard`) tiene el mismo problema que los
leads: su espejo empezaría a subir `companies`, `catalog`… sobre filas cuya dueña es la nube. El alta
del bot **comprueba `datos_v2_empresas`** y, si el negocio es de la nube, arranca bajando en vez de
subiendo.

## 4 · La bajada: nube → SQLite

El mismo principio que el espejo de hoy, al revés: **se avisa de que algo cambió y se relee el estado
actual.** El aviso nunca es la fuente.

```
Postgres  ─ trigger en cada tabla de la nube → sync_version = nextval('sync_seq')
          ─ borrado = fila en sync_borrados(tabla, pk, sync_version)
Bot       ─ cursor por tabla (máximo sync_version aplicado), guardado en SQLite
          ─ al arrancar:        SELECT … WHERE company_id = ANY(mías) AND sync_version > cursor
                                ORDER BY sync_version LIMIT 1000   (en bucle hasta vaciar)
          ─ en vivo:            realtime (el websocket que YA abre para commands) como timbre
                                → misma consulta de recuperación
          ─ de respaldo:        cada 30 s, como el sondeo de commands
          ─ aplica en una transacción de SQLite, avanza el cursor, invalida cachés
            (catalog.service → invalidate; la huella del prompt cambia sola)
```

- **Un evento de realtime perdido no pierde datos:** el siguiente timbre o el sondeo se lo traen,
  porque se lee por cursor y no por evento.
- **Sin eco:** las tablas de la nube **salen de `MIRROR_TABLES`**. Sus triggers de subida se borran,
  así que aplicar una bajada no la vuelve a subir.
- **Leer lo que uno acaba de escribir:** cuando el bot escribe en la nube (§5), aplica en SQLite la
  fila que le devuelve la respuesta, sin esperar a la bajada. El turno siguiente ya la ve.
- **Coste en el bot:** una consulta pequeña por cambio, fuera del camino de cada mensaje. Además, el
  espejo de subida adelgaza: configuración y agenda dejan de subir.

## 5 · El servicio de reservas (agenda en la nube)

Una reserva tiene que comprobar el cupo y escribir **sin que otro se cuele en medio**. Hoy lo garantiza
SQLite, porque hay un solo proceso por negocio. En la nube escriben tres actores (Mia, la página y el
panel), así que hace falta un punto único:

```
POST /api/agenda/reservar | mover | cancelar | cobrar | asistencia
  1. autentica: clave del bot · sesión del panel (con su rol) · página pública (límite por IP y teléfono)
  2. BEGIN; SELECT pg_advisory_xact_lock(hashtext(company_id))
  3. lee horario, equipo, bloqueos y citas que se cruzan
  4. decide con el MOTOR COMPARTIDO (§6): encaja, cupo por celda, profesional pedido o libre
  5. inserta cita + appointment_services; COMMIT
  6. devuelve la fila (el bot la aplica en SQLite al momento)
```

- Vive en Vercel (`app/api/agenda/*`), con conexión directa a Postgres por el pooler de Supabase
  (modo transacción). Necesita `DATABASE_URL` en Vercel, que **hoy no existe**: la pone Alvaro.
- El bloqueo es **por negocio**: dos negocios nunca se esperan entre sí.
- **El bot reserva llamándolo.** Inventario completo de la etapa 0: `book_appointment`,
  `update_appointment`, `cancel_appointment`, **`join_schedule_slot`** (otra reserva, con su propio cupo,
  que además cancela la anterior al cambiar de grupo), **`save_customer_info`** (beneficiario de la
  inscripción), **`create_order` / `cancel_order`** (pedido y stock, con `ajustar_stock_variante`), el
  voucher, `settlePendingEnrolment`, el cron de asistencia y **`cerrarInscripcionesVencidas`**. Todos dejan
  de escribir en SQLite y llaman aquí. Si la
  nube no responde, Mia dice que no pudo confirmar y lo reintenta; no inventa una cita que el panel no
  verá.
- Los comandos de agenda del panel (`crear_cita`, `modificar_cita` —también cuando cancela—,
  `marcar_pagado`, `registrar_pago`, `marcar_cumplido`, `upsert_gasto`, `delete_gasto`) pasan a ser
  llamadas a este servicio.
- **Se retira `POST /public/:companyId/book`** del bot (y `availability`/`calendar` públicos). Hoy es
  inalcanzable, pero es un escritor más: la reserva pública es la de Tu página.
- **El caso real que lo justifica** (etapa 0): 9 comandos de barberia-01 esperando desde el 11-sep
  (`marcar_pagado` ×4, `upsert_gasto` ×2…). Su bot no corre. Sin bot, el panel no puede ni cobrar.

## 6 · El motor compartido

La regla de disponibilidad (horario, celdas, duración, barberos de turno, bloqueos, cupo por celda,
periodos de los grupos) vive hoy en el bot: `utils/datetime.ts`, `services/tools/staff.ts`,
`utils/availability.ts`, `utils/periodo.ts`, `utils/horario.ts`. **Ya es código puro**, que solo
depende de tipos.

Se saca a un paquete, **`@vendemia/motor`**, en su propio repo, publicado en GitHub Packages y fijado
por versión en el bot y en la web. Se añade una función que hoy está mezclada dentro de
`booking.tools.ts` (líneas ~160–265):

```ts
decidirReserva(datos: { horario, slotMinutes, equipo, bloqueos, citasQueSeCruzan },
               pedido: { slotStart, servicios, profesional?, leadId })
  → { ok: true, slotEnd, span, employeeId } | { ok: false, motivo, alternativas? }
```

y `calendario(datos, dias)`: la parte de `availability.calendar.ts` sin `db`, que es lo que pinta
Tu página. Tiene que recibir los intervalos **de una sola consulta**: hoy hace N+1
(`getAppointmentsBySlot` por grupo, `getAppointmentsByDate` por día), que en SQLite no se nota y en
Postgres sería ~250 ms por día del calendario.

Lo que la etapa 0 encontró al revisarlo: ninguno de los cinco ficheros importa `db`, red ni ficheros.
Lo único con estado es **el reloj** (`limaToday`, `limaNowSlot` en `datetime.ts`): `ahora` pasa a ser
un parámetro de `isPastSlot`, `hasEnded`, `buildPunctualAvailability` y `formatDayLabel`.

**Por qué no copiar el motor:** sería la tercera copia de una regla con muchos casos (el de Leslie,
el de «cualquiera», el del bloqueo). El día que una copia se desincronice, la página ofrecerá huecos
que Mia rechaza. Ya hay copias (`saldo.ts` ↔ `saldo-venta.ts`); esta no se añade.

## 7 · Etapas

Cada etapa se puede desplegar y revertir sola. Las que tocan al bot van en un prompt para su sesión:
**desde aquí no se toca el repo del bot.**

| # | Etapa | Lado | Qué desbloquea | Reversible |
|---|---|---|---|---|
| **0** ✓ | **Medir** (hecho 16-oct): §2. Queda midiendo en producción con `MEDIR_V2=1` | Bot | Los números de §2 | — |
| **1** ✓ | **Cimientos en Postgres** (0001 aplicada 16-oct; 0002 con variantes, claves de preguntas y limpieza): `sync_seq`, `sync_version` y triggers, `sync_borrados`; RPC de escritura de configuración con las MISMAS validaciones que los handlers de hoy (PATCH que conserva lo no enviado, comisión 0–100, horario válido, id de otra empresa rechazado); RLS de escritura por rol | Web (SQL en `modules/datos/sql/`) | Nada visible: prepara la etapa 2 | Sí: nadie lo usa todavía |
| **2** | **Configuración a la nube**: el bot baja configuración en **modo sombra** (compara, no aplica) unos días → corte: deja de subirla, aplica la bajada, sus propias escrituras de catálogo y stock van por RPC. El panel escribe directo | Bot + web | **Catálogo sin bot.** Panel instantáneo. Tu página con catálogo para todos | Sí: volver a encender la subida (SQLite tiene todo) |
| **3** | **Motor compartido**: `@vendemia/motor` con las pruebas del bot como prueba dorada; el bot pasa a importarlo **sin cambiar ninguna decisión** | Bot + paquete | La etapa 4 | Sí |
| **4** | **Agenda a la nube**: servicio de reservas. Primero **en sombra**: el bot reserva como hoy y además pide al servicio una decisión de prueba; se comparan durante una semana. Corte cuando no haya diferencias | Bot + web | **Reservas desde Tu página, con o sin bot.** Una sola agenda | Sí, mientras dure la sombra |
| **5** | Quitar los comandos que ya no tienen sentido (9 de configuración, los de agenda) | Las dos | Limpieza | — |

**Fechas que mandan:** la etapa 2 va **después del corte de roles del 21-oct**, porque las RLS de
escritura dependen de los roles en vigor. Las etapas 0 y 1 pueden ir ya.

**Tu página no espera a que acabe todo:** el catálogo se puede leer hoy mismo (todo está en Supabase) y
los envíos nacen en la nube. Ver el orden en `docs/PLAN-TU-PAGINA.md`.

## 8 · Lo que garantiza «sin afectar al bot»

- **Por mensaje:** cero lecturas remotas, igual que hoy.
- **Al escribir agenda o configuración:** +0,2–0,4 s, solo en ese turno.
- **Proceso nuevo:** la bajada, por un websocket que ya existe. Las consultas solo traen lo que
  cambió.
- **Espejo de subida:** menos tablas y menos filas que hoy.
- **Cada corte tiene antes una sombra:** se comparan las decisiones antes de que nada dependa del
  camino nuevo.

## 9 · Riesgos con nombre

**Riesgo 2 sin medir** (etapa 0): el espejo no guarda historia, así que no se sabe cuántas veces cayó
Postgres el último mes. Desde el 16-oct, con `MEDIR_V2=1`, el bot apunta la cola cada 30 s; con unas
semanas de bot encendido sale el número. Lo que sí se sabe: con menos de una escritura de agenda por
negocio y día, una caída de minutos afectaría a muy pocas reservas.


1. **El mismo cliente creado a la vez en los dos lados** (reserva en Tu página mientras le escribe a Mia).
   El servicio busca el lead por `(company_id, teléfono)` y, si no existe, deja la cita con el teléfono
   y sin `lead_id`. El bot, al bajarla, la enlaza con su lead (o lo crea) y avisa al servicio. Nunca se
   crean dos.
2. **Postgres caído:** hoy una reserva entraría en SQLite y el panel no la vería. Con v2, Mia dice que
   no pudo confirmar. Es más honesto, pero hay que medir cuántas veces pasa (etapa 0: errores del
   espejo en el último mes).
3. **Stock:** hoy el bot resta en SQLite. Pasa a una RPC atómica (`ajustar_stock(id, delta)`) que
   devuelve el stock nuevo.
4. **`DATABASE_URL`:** el servicio de reservas no arranca sin ella. Credencial a cargo de Alvaro.
