# Arquitectura de datos v2 · quién manda en cada tabla

Escrito el 15-oct-2026. Estado: **aprobada por Alvaro** («procede con la arquitectura, nada de
atajos»). Sin código todavía, salvo lo que diga cada etapa.

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

Falta la medida del lado del bot: **cuántas consultas hace cada turno**. Es la etapa 0.

**La conclusión ya es firme:** leer en remoto en cada turno sumaría segundos (10 consultas × 210 ms ≈
2 s). **El bot sigue leyendo todo en local.** Solo va a la nube al **escribir** una reserva, un cobro
o un cambio de catálogo, que pasa una vez por conversación y cuesta 0,2–0,4 s sobre un turno de
2–6 s.

El argumento de «SQLite funciona sin internet» no aplica: sin internet el bot tampoco tiene OpenAI
ni WhatsApp. Lo que de verdad compra SQLite es **velocidad de lectura**, y eso se conserva entero.

## 3 · El reparto

| Dominio | Tablas | Escritor | Cómo llega al otro lado |
|---|---|---|---|
| **Configuración** | `companies` (campos de ajustes), `catalog`, `catalog_media`, `employees`, `employee_blocks`, `form_templates` · nuevas: `catalog_opciones` | **Nube** | Bajada a SQLite (§4) |
| **Agenda y dinero** | `appointments`, `appointment_services`, `orders`, `pending_payments`, `gastos` | **Nube**, a través del servicio de reservas (§5) | Bajada a SQLite (§4) |
| **Tu página** | `tu_pagina`, `envios` | **Nube** (nacen ahí) | Bajada solo si el bot las usa algún día |
| **Conversación** | `leads`, `messages`, `conversation_events`, `escalations`, `retargeting`, `consumo_mensual`, `recargas`, `blocklist`, `seguimientos` | **Bot** (como hoy) | Espejo de subida, sin cambios |
| **Accesos** | `memberships` y lo de roles | Sin tocar hasta después del corte del 21-oct | — |

**`leads` en un negocio sin bot:** no hay conversación, así que los únicos clientes son los de Tu página.
Los crea la nube. Si ese negocio activa a Mia más tarde, el alta del bot **importa** sus leads una vez
y desde ahí el bot pasa a ser su dueño. Es la única tabla cuyo escritor depende del negocio, y por eso
el traspaso es un paso explícito, no algo que ocurra solo.

**`companies` tiene dos dueños por campo** (los ajustes los escribe la nube; el estado de la
instancia, el bot). Se resuelve partiendo la escritura: el bot deja de subir esa fila entera y
actualiza sus campos con una RPC que solo acepta los suyos.

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
- **El bot reserva llamándolo.** `book_appointment`, `update_appointment`, `cancel`, el cron de
  asistencia, el voucher y `settlePendingEnrolment` dejan de escribir en SQLite y llaman aquí. Si la
  nube no responde, Mia dice que no pudo confirmar y lo reintenta; no inventa una cita que el panel no
  verá.
- Los comandos de agenda del panel (`crear_cita`, `modificar_cita`, `marcar_pagado`,
  `registrar_pago`, `marcar_cumplido`) pasan a ser llamadas a este servicio.

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
Tu página.

**Por qué no copiar el motor:** sería la tercera copia de una regla con muchos casos (el de Leslie,
el de «cualquiera», el del bloqueo). El día que una copia se desincronice, la página ofrecerá huecos
que Mia rechaza. Ya hay copias (`saldo.ts` ↔ `saldo-venta.ts`); esta no se añade.

## 7 · Etapas

Cada etapa se puede desplegar y revertir sola. Las que tocan al bot van en un prompt para su sesión:
**desde aquí no se toca el repo del bot.**

| # | Etapa | Lado | Qué desbloquea | Reversible |
|---|---|---|---|---|
| **0** | **Medir**: consultas y tiempo de SQLite por turno, reservas por día, tamaño de la cola del espejo | Bot | Los números que faltan en §2 | — |
| **1** | **Cimientos en Postgres**: `sync_seq`, `sync_version` y triggers, `sync_borrados`; RPC de escritura de configuración con las MISMAS validaciones que los handlers de hoy (PATCH que conserva lo no enviado, comisión 0–100, horario válido, id de otra empresa rechazado); RLS de escritura por rol | Web (SQL en `modules/datos/sql/`) | Nada visible: prepara la etapa 2 | Sí: nadie lo usa todavía |
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
