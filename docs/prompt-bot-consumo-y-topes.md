# Prompt para la sesión del bot: contar conversaciones, hacer cumplir el tope y las recargas

Pégalo tal cual. Viene de rehacer los planes de la web (29-sep-2026, commit `ef0ee69` de
`vendemia-web`) y de la fase 0: **que lo que dice la tarjeta de precios sea verdad**.

**El panel ya está hecho y espera estas tablas.** La tarjeta «Conversaciones del mes» del dashboard
lee `consumo_mensual`, `recargas` y `companies.plan`. Mientras no existan, se esconde sola (no rompe
nada). El cálculo de lo que se enseña vive en `lib/panel/consumo.ts`; los números, en
`lib/planes.ts`.

---

## Qué prometen los planes (y por tanto qué hay que cumplir)

| Plan | Precio | Tope/mes |
|---|---|---|
| `starter` | S/89 | 300 |
| `seller` | S/149 | 700 |
| `best_seller` | S/189 | 1.000 |

- **Gracia:** 10 % del tope, sin cobro (30 · 70 · 100).
- **Avisos al dueño:** al 80 % y al 100 % del tope, una vez cada uno por mes.
- **Recargas:** +100 S/19 · +300 S/49 · +1.000 S/129. Caducan a los 90 días de pagarlas.
- **Orden en que se gasta:** plan → recargas (la que vence antes, primero) → gracia → derivar.
- **La web dice «Mia nunca corta una venta a medias».** Eso es literal: ver §3.

⚠️ **Estos números están duplicados** en `vendemia-web/lib/planes.ts`. Ponlos en UN fichero del bot
(p. ej. `src/config/planes.ts`) con un comentario que apunte al otro. Si cambian en un lado y no en el
otro, el panel dice «te quedan 40» mientras Mia ya está derivando.

¿De dónde salen? `usage_log` de septiembre: una conversación cuesta ~$0,014 de media y $0,029 en el
p90 (≈ S/0,05 y S/0,10). Con el caso malo, el tope entero se come como mucho la mitad del precio.

---

## 1 · Qué es UNA conversación

**Un lead, un día en hora de Lima.** Es la misma unidad que la ventana de 24 h de Meta, así que
cuando migremos a la Cloud API el número que cobramos y el que nos cobran se podrán comparar.

Se cuenta en el **primer mensaje entrante del lead en ese día**. Tres casos que NO cuentan:

1. El dueño o el admin (`owner_phone`, `admin_phone`) escribiéndole al bot.
2. Los teléfonos de prueba (`5190000*`, la misma regla que `reminders.job.ts`).
3. Los mensajes que manda el negocio desde el panel (`send_message`, role `owner`): la conversación
   la abre el negocio, no un cliente. Si el cliente contesta ese día, **eso sí cuenta**.

**Idempotencia.** Un reinicio del bot, dos mensajes en ráfaga o un reintento no pueden contar dos
veces. Usa una tabla SOLO LOCAL (no se espeja) con clave primaria:

```sql
-- SQLite
CREATE TABLE IF NOT EXISTS consumo_conversaciones (
    company_id TEXT NOT NULL,
    lead_id    TEXT NOT NULL,
    dia        TEXT NOT NULL,          -- 'YYYY-MM-DD' Lima
    via        TEXT NOT NULL,          -- 'plan' | 'recarga' | 'gracia' | 'derivada'
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (company_id, lead_id, dia)
);
```

`INSERT OR IGNORE`. Si no insertó nada, la conversación ya estaba contada: sigue normal y no toques
`consumo_mensual`. El `via` de la fila decide cómo sigue ese lead el resto del día (§3).

---

## 2 · Migración 0036 (Postgres) + lo mismo en SQLite

**Aplicar ANTES de arrancar el bot con el código nuevo.** Ya sabes por qué: una columna que exista
en SQLite y no aquí tumba la replicación de la tabla entera, y `companies` es de las que no se pueden
perder.

```sql
-- 0036_consumo_y_recargas.sql

-- ── 1 · El plan de cada negocio ──────────────────────────────────────────────
-- Los TOPES no van aquí: viven en código (bot y web). Aquí solo qué plan tiene.
alter table public.companies add column if not exists plan text not null default 'starter';
comment on column public.companies.plan is
    'starter · seller · best_seller. Los topes están en código (src/config/planes.ts y lib/planes.ts de la web).';

-- ── 2 · Consumo por mes ──────────────────────────────────────────────────────
-- Una fila por negocio y mes. La escribe el bot en cada conversación nueva. Pequeña a propósito:
-- es el agregado que decidimos espejar en vez de usage_log (12-sep).
create table if not exists public.consumo_mensual (
    company_id     text not null references public.companies(id) on delete cascade,
    mes            text not null,                 -- 'YYYY-MM' en hora de Lima
    conversaciones integer not null default 0,    -- TODAS: plan + recarga + gracia (no las derivadas)
    de_recarga     integer not null default 0,
    de_gracia      integer not null default 0,
    derivadas      integer not null default 0,    -- nuevas que Mia pasó al dueño por estar todo agotado
    avisado_80     integer not null default 0,    -- 0/1: ya se mandó el aviso del 80 %
    avisado_100    integer not null default 0,
    updated_at     timestamptz not null default now(),
    primary key (company_id, mes)
);

grant select on public.consumo_mensual to authenticated;
alter table public.consumo_mensual enable row level security;
drop policy if exists p_consumo_read on public.consumo_mensual;
create policy p_consumo_read on public.consumo_mensual
    for select to authenticated
    using (public.is_member(company_id) or public.es_admin_plataforma());

-- ── 3 · Recargas ─────────────────────────────────────────────────────────────
create table if not exists public.recargas (
    id             text primary key,
    company_id     text not null references public.companies(id) on delete cascade,
    conversaciones integer not null,
    usadas         integer not null default 0,
    precio         real not null,                 -- soles cobrados, para cuadrar con lo que entró
    pagada_at      timestamptz not null default now(),
    vence_at       timestamptz not null,          -- pagada_at + 90 días
    nota           text not null default ''       -- p. ej. «Yape 29-sep, op. 123456»
);

grant select on public.recargas to authenticated;
alter table public.recargas enable row level security;
drop policy if exists p_recargas_read on public.recargas;
create policy p_recargas_read on public.recargas
    for select to authenticated
    using (public.is_member(company_id) or public.es_admin_plataforma());
```

Las dos tablas nuevas entran en el espejo (triggers de `mirror.service.ts`). Pasa
`npm run schema:diff` antes de darlo por bueno.

---

## 3 · En cada conversación nueva: a qué bolsa va

Cuando el `INSERT OR IGNORE` de §1 sí inserta, decide el `via` **en este orden**:

1. **`plan`** si lo del plan este mes (`conversaciones - de_recarga - de_gracia`) < tope.
2. **`recarga`** si hay una recarga vigente con `usadas < conversaciones`. La que vence antes,
   primero. `usadas += 1` en ella y `de_recarga += 1`.
3. **`gracia`** si `de_gracia < round(tope × 0,10)`. `de_gracia += 1`.
4. **`derivada`** en otro caso. `derivadas += 1` y **no** sumes a `conversaciones`.

En 1–3, `conversaciones += 1`. Todo en una transacción: dos leads que llegan a la vez con una sola
conversación de gracia libre no pueden llevarse la misma.

### Lo que hace Mia con una conversación `derivada`

**No se corta nada que ya estaba en marcha.** Un lead cuya fila de hoy es `plan`, `recarga` o
`gracia` sigue atendido todo el día, aunque entretanto se agote todo. Eso es «nunca corta una venta a
medias».

Solo cuando la conversación NUEVA sale `derivada`:

- Mia responde **una vez**, corto y sin mentir: «¡Hola! Gracias por escribir 🙌 En un momento te
  atiende una persona del equipo.» Nada de «estamos saturados» ni de hablar de planes: el cliente
  final no tiene que enterarse de nuestra facturación.
- Pausa a Mia para ese lead (el mismo mecanismo que `handoff`) **solo hasta el final del día**. Mañana
  es otra conversación y se vuelve a decidir.
- Avisa al dueño por `notify.service` (y al admin si lo hay) con el nombre y el enlace al chat.
- **No llames al modelo** para esa respuesta: es texto fijo. Que el mensaje derivado no gaste IA es
  parte del punto.

---

## 4 · Avisos al dueño (80 % y 100 %)

Después de sumar una conversación `plan`, mira si `conversaciones - de_recarga - de_gracia` cruzó el
80 % o el 100 % del tope y el `avisado_*` correspondiente está a 0. Si sí, ponlo a 1 **en la misma
transacción** y manda el aviso por `notify.service`. Así un reinicio no lo repite.

Textos propuestos (tuteo, como el resto):

- **80 %:** «Mia ya atendió {n} de tus {tope} conversaciones de {mes}. Te quedan {quedan}. Si vas a
  necesitar más, puedes recargar desde tu panel: vendemias.com/panel»
- **100 %:** «Mia usó las {tope} conversaciones de tu plan de {mes}. Sigue atendiendo {gracia} más sin
  costo, y después te pasará las nuevas a ti. Recarga desde tu panel y no se detiene:
  vendemias.com/panel»

Si hay saldo de recargas, el de 100 % dice «ahora usa tu recarga ({saldo} disponibles)» en vez de lo
de la gracia.

Estos avisos van al **dueño** (`owner_phone` / `admin_phone`), no a clientes: no es el envío en frío
que nos preocupa por el bloqueo.

---

## 5 · Cambiar el plan y registrar una recarga: SOLO por script local

**No por la cola de comandos.** La cola la puede escribir cualquier miembro del negocio, así que un
comando `registrar_recarga` sería un botón para regalarse conversaciones. Como el bot corre en la
máquina de Alvaro, lo más simple y lo más seguro es un script:

```
npm run plan -- <company_id> <starter|seller|best_seller>
npm run recarga -- <company_id> <100|300|1000> [nota]
```

- `plan` valida el valor contra `src/config/planes.ts` y actualiza `companies.plan`.
- `recarga` solo acepta los tres paquetes de `RECARGAS` (el precio sale de ahí, no del argumento),
  crea la fila con `vence_at = ahora + 90 días` y la nota libre para cuadrar con el Yape.
- Los dos escriben en SQLite, y el espejo sube el cambio. Nunca a mano en Supabase: se pierde en el
  siguiente espejo.

Si una recarga llega con la conversación ya `derivada`, no hace falta nada más: el lead derivado
sigue pausado hasta fin del día (lo atiende la persona), y la próxima conversación nueva ya entra en
la recarga.

---

## 6 · Tests (misma notación de siempre, aciertos/intentos)

1. Dos mensajes del mismo lead el mismo día → una conversación. El mismo lead al día siguiente → dos.
2. Cambio de día en hora de Lima, no UTC: un mensaje a las 20:00 y otro a las 23:30 del mismo día
   son UNA conversación.
3. Dueño, admin y `5190000*` no cuentan. Un `send_message` del panel no cuenta; si el cliente
   contesta, sí.
4. Orden de las bolsas: con tope 300, la 301 va a recarga si hay una vigente; si no, a gracia; la 331
   (Starter) sale derivada.
5. Recarga caducada no se usa. Con dos vigentes, se gasta primero la que vence antes.
6. Un lead que empezó en `plan` sigue atendido aunque, a mitad de su conversación, otra se lleve la
   última de gracia.
7. Una conversación derivada: una respuesta fija, cero llamadas al modelo, un aviso al dueño y Mia
   pausada solo hasta el final del día.
8. Avisos: el de 80 % sale una vez, y un reinicio entre medias no lo repite.
9. Cambio de mes: fila nueva, `avisado_*` a 0; las recargas no usadas siguen valiendo hasta su
   `vence_at`.
10. `npm run recarga` con un paquete que no existe (p. ej. 250) → error, no inserta.

---

## 7 · Lo que NO cambia

- **`usage_log` sigue sin espejarse** (decisión del 12-sep). `consumo_mensual` es justo el agregado
  pequeño que se dejó para «cuando haya pantalla que lo pida». Ya la hay.
- **Los mensajes que inicia el negocio** (recordatorios, campañas futuras) no se cuentan aquí. Cuando
  migremos a la Cloud API los cobra Meta por mensaje, y van a un saldo aparte, en soles, al precio de
  Meta más un margen. Eso es otro prompt.
