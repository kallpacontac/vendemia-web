# Prompt para la sesión del bot · Arquitectura v2, etapa 2: configuración a la nube

Pégalo tal cual. Escrito el 16-oct-2026 desde la sesión de la web, después de tu informe de la
etapa 0 (`docs/medidas-arquitectura-v2.md`), que confirmó la arquitectura sin contradicciones.

**Antes de empezar**, confirma con Alvaro que la `0002` está aplicada en Supabase
(`vendemia-web/modules/datos/sql/0002_variantes_y_ajustes.sql`). La 0001 ya lo está desde el 16-oct.

**El corte va DESPUÉS del corte de roles del 21-oct.** Los pasos A y B pueden ir antes: no cambian
quién escribe.

---

## Lo que ya cambió en la web por tu informe

- **`catalog_variantes` existe en Postgres** (0002), con el mismo esquema que SQLite más
  `mirrored_at timestamptz` y `sync_version`. Hay `ajustar_stock_variante(company, variante_id, delta)`,
  atómico, que deja `catalog.stock` = suma. `ajustar_stock` rechaza un producto con variantes.
- **`cfg_empresa_actualizar` pone `field_key`** a las preguntas sin clave, con tu misma regla
  (`v2_con_claves`, copia de `conClaves` y `claveDePregunta`).
- **Las `cfg_*` aceptan la clave de servicio como dueño.** Tú compruebas el rol de quien lo pide
  (utils/roles.ts) antes de llamar; Postgres solo exige que el negocio tenga `config_en_nube`.
- `companies` pasa entera a la nube (tu §3.3.2). `calendar_event_id` y `reminder_sent_at` se quedan
  para la etapa 4 (tabla `citas_del_bot`).
- `image_url` sigue fuera de `cfg_producto_guardar` a propósito: es un campo muerto y el PATCH conserva
  lo que haya.

---

## A · Ya, sin corte: subir `catalog_variantes`

Regístrala en `MIRROR_TABLES` (después de `catalog`), con sus triggers. Hasta el corte el dueño sigue
siendo el bot y así el panel ya ve el stock por talla. Comprueba con `npm run schema:diff` y con una
subida real de piel-futbolera (33 variantes).

## B · Ya, sin corte: la bajada en MODO SOMBRA

Un worker nuevo que **no aplica nada**: baja y compara.

- Tablas: `companies`, `catalog`, `catalog_variantes`, `catalog_media`, `employees`, `employee_blocks`,
  `form_templates`, y `sync_borrados` para los borrados.
- Cursor por tabla en SQLite (máximo `sync_version` visto). Al arrancar: `select * … where company_id
  = <el mío> and sync_version > cursor order by sync_version limit 1000`, en bucle hasta vaciar.
  `companies` filtra por `id`.
- En vivo: realtime sobre esas tablas, filtrado por tu `company_id`, **solo como timbre**, que dispara la
  misma consulta. Respaldo cada 30 s, como el sondeo de `commands`.
- Por cada fila bajada, compárala con la de SQLite **columna a columna**, solo en las columnas que
  existen en los dos lados. Apunta cada diferencia (`tabla, id, columna, local, nube`) en
  `data/medir-v2/sombra.jsonl`.
- Diferencias esperables, que tienen que salir **cero** tras unos días: las de filas que el espejo
  todavía no subió. Cualquier otra es un fallo del espejo o de una `cfg_*`, y para el corte.

## C · El corte, negocio a negocio (después del 21-oct)

Quién manda lo dice `datos_v2_empresas.config_en_nube` del negocio. Lo cambia Alvaro con
`datos_v2_marcar(id, true, false)`. Al verlo a `true`:

1. **Deja de subir** esas siete tablas **para ese negocio**: el filtro va en el vaciado de la outbox,
   no en los triggers (los triggers son por tabla y otros negocios del mismo fichero siguen siendo tuyos).
2. **Aplica la bajada**: misma consulta que la sombra, pero escribe en SQLite dentro de una
   transacción, avanza el cursor e invalida cachés (`catalog.service → invalidate`; la huella del
   prompt cambia sola). Un borrado de `sync_borrados` borra la fila local. Un `employees` que baja con
   `is_active = 0` suelta su ficha en tu `memberships` local, como hace hoy `deleteEmployee`.
3. **Tus propias escrituras de configuración van a la nube**, y aplicas en SQLite la fila que devuelve
   la respuesta, sin esperar a la bajada:
   - `upsert_catalog_item` y compañía (los 9 comandos de configuración): si llegan para un negocio
     cortado, **no los ejecutes**: el panel ya escribe directo. Respóndelos con error claro
     («este negocio ya guarda su configuración en la nube»).
   - Stock al vender, devolver o reservar por voucher: `ajustar_stock` o `ajustar_stock_variante`
     (eliges la variante en local con `emparejar` y mandas su id).
   - El asistente del dueño y `scripts/asistente.ts`: las `cfg_*` con la clave de servicio.
   - La API (`/api/companies/:id/catalog…`, `form-templates`, `schedule`…): igual, o se retira.
4. **Apaga las escrituras de arranque** en esas tablas para ese negocio (`initSchema` :837/:822,
   `completarClavesCalificacion` :1023): la bajada las pisaría, y la nube ya hace su trabajo.
5. **`onboard` y un negocio nacido en la web:** si `datos_v2_empresas` dice que es de la nube, el alta
   arranca bajando (cursor a 0) en vez de subir.

**Vuelta atrás:** `datos_v2_marcar(id, false, false)` → vuelves a subir. SQLite tiene todo, porque la
bajada lo fue escribiendo.

## Lo que devuelves

- A: la tabla subiendo, con `schema:diff` limpio.
- B: unos días de `sombra.jsonl` y un resumen: diferencias por tabla y su causa.
- C, cuando toque: qué negocio se cortó, la prueba de un cambio de catálogo desde el panel llegando a
  Mia, y una venta de una talla que deja el stock bien en los dos lados.

## Lo que NO haces

- Nada de agenda (citas, pedidos, pagos, gastos): es la etapa 4.
- Nada de `memberships` ni de roles, salvo el desenlace local de un trabajador borrado.
- No toques el repo de la web.
