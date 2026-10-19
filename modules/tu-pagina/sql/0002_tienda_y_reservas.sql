-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0002: la tienda y las reservas desde la página
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- El cliente pide o separa su cupo EN LA PÁGINA (queda guardado y el cupo tomado) y
-- después avisa por WhatsApp con un botón. Ver docs/PLAN-TU-PAGINA.md.
--
--   pedidos_web    el carrito confirmado: líneas con precio del catálogo (no del
--                  navegador), entrega o recojo. Separa stock mientras está vivo.
--   reservas_web   una cita (día y hora) o un cupo en un grupo. Ocupa sitio
--                  mientras está «apartada» o «confirmada».
--
-- ⚠️ LO QUE ESTO NO ES TODAVÍA (decidido el 19-oct-2026 para las demos):
--   · No es la agenda única de la etapa 4 (docs/ARQUITECTURA-DATOS-V2.md §5). La
--     página cuenta las citas del bot (`appointments`) y las suyas, pero el bot NO
--     ve `reservas_web`: en un negocio CON Mia, ella podría vender ese mismo hueco.
--     En un negocio sin bot no hay nadie más escribiendo y el cupo es real.
--   · El stock no se descuenta del catálogo: se aparta mientras el pedido está
--     «nuevo» o «confirmado». Entregado o cancelado deja de apartar.
--   · En la etapa 4 estas filas pasan a ser `appointments` / `orders` de verdad.
--
-- La regla del cupo la decide el servidor de la web con la misma función que pinta
-- la página (modules/tu-pagina/dominio/agenda.ts) y la pasa como `capacidad`; aquí,
-- con un candado por negocio, se cuenta lo que ya hay y se inserta. Dos clientes a
-- la vez en el último hueco: entra uno y el otro recibe «lleno».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── Pedidos ───────────────────────────────────────────────────────────────────

create table if not exists public.pedidos_web (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null references public.companies(id) on delete cascade,
    codigo      text not null,
    nombre      text not null check (char_length(nombre) between 2 and 80),
    telefono    text not null check (telefono ~ '^\d{8,15}$'),
    -- [{catalog_id, variante_id, nombre, opcion, precio, cantidad}] — congelado al pedir.
    lineas      jsonb not null check (jsonb_typeof(lineas) = 'array'),
    total       numeric(10,2) not null check (total >= 0),
    entrega     text not null check (entrega in ('recojo', 'delivery')),
    direccion   text not null default '' check (char_length(direccion) <= 200),
    referencia  text not null default '' check (char_length(referencia) <= 200),
    nota        text not null default '' check (char_length(nota) <= 300),
    estado      text not null default 'nuevo' check (estado in ('nuevo', 'confirmado', 'entregado', 'cancelado')),
    idem        text not null check (char_length(idem) between 8 and 64),
    creado_at   timestamptz not null default now(),
    cambiado_at timestamptz not null default now(),
    unique (company_id, codigo),
    unique (company_id, idem)
);
create index if not exists idx_pedidos_web_lista on public.pedidos_web(company_id, estado, creado_at desc);

-- ── Reservas ──────────────────────────────────────────────────────────────────

create table if not exists public.reservas_web (
    id           uuid primary key default gen_random_uuid(),
    company_id   text not null references public.companies(id) on delete cascade,
    codigo       text not null,
    tipo         text not null check (tipo in ('cita', 'grupo')),
    catalog_id   text not null,
    servicio     text not null check (char_length(servicio) between 1 and 120),
    precio       numeric(10,2),
    -- Mismo formato que appointments.slot_start: 'YYYY-MM-DD HH:MM' en citas,
    -- 'sched:<producto>:<grupo>' en grupos.
    slot_start   text not null,
    slot_end     text,
    grupo        text not null default '' check (char_length(grupo) <= 120),
    employee_id  text not null default '',
    nombre       text not null check (char_length(nombre) between 2 and 80),
    telefono     text not null check (telefono ~ '^\d{8,15}$'),
    beneficiario text not null default '' check (char_length(beneficiario) <= 80),
    nota         text not null default '' check (char_length(nota) <= 300),
    estado       text not null default 'apartada'
                 check (estado in ('apartada', 'confirmada', 'atendida', 'no_vino', 'cancelada')),
    idem         text not null check (char_length(idem) between 8 and 64),
    creado_at    timestamptz not null default now(),
    cambiado_at  timestamptz not null default now(),
    check ((tipo = 'cita' and slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and slot_end ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and slot_end > slot_start)
        or (tipo = 'grupo' and slot_start like 'sched:%' and slot_end is null)),
    unique (company_id, codigo),
    unique (company_id, idem)
);
create index if not exists idx_reservas_web_lista on public.reservas_web(company_id, estado, creado_at desc);
create index if not exists idx_reservas_web_slot on public.reservas_web(company_id, slot_start) where estado in ('apartada', 'confirmada');

-- ── RLS y grants: mismo criterio que los envíos (llevan nombres y teléfonos) ───

alter table public.pedidos_web  enable row level security;
alter table public.reservas_web enable row level security;
revoke all on public.pedidos_web, public.reservas_web from anon, authenticated;
grant select on public.pedidos_web, public.reservas_web to authenticated;

drop policy if exists pedidos_web_leer on public.pedidos_web;
create policy pedidos_web_leer on public.pedidos_web
    for select to authenticated using ((select public.puede(company_id, 'clientes.ver')));
drop policy if exists reservas_web_leer on public.reservas_web;
create policy reservas_web_leer on public.reservas_web
    for select to authenticated using ((select public.puede(company_id, 'clientes.ver')));

-- ── Lo que la página necesita para pintarse (clave del servidor) ──────────────
-- Catálogo, fotos, opciones, equipo, horario y lo OCUPADO como horas sueltas:
-- ni un nombre ni un teléfono de otro cliente sale de aquí.
create or replace function public.tu_pagina_srv_datos(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v     public.tu_pagina;
    c     public.companies;
    v_hoy text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
begin
    perform public.loyalty_srv_check();
    select * into v from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select * into c from public.companies where id = v.company_id;

    return jsonb_build_object(
        'status', 'ok',
        'negocio', jsonb_build_object(
            'modo', c.business_mode, 'horario', c.schedule, 'slot_minutes', c.slot_minutes,
            'pide_profesional', c.ask_employee, 'entrega', c.delivery_type, 'direccion', c.location),
        'catalogo', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', k.id, 'nombre', k.name, 'descripcion', k.description, 'precio', k.price,
                'duracion', k.duration_minutes, 'stock', k.stock, 'grupos', k.schedule_slots,
                'vigencia_meses', k.vigencia_meses, 'promo_vigencia', k.promo_vigencia, 'familia', k.familia)
                order by k.sort_order nulls last, k.name)
              from public.catalog k
             where k.company_id = v.company_id and coalesce(k.is_active, 1) = 1), '[]'::jsonb),
        'media', coalesce((
            select jsonb_agg(jsonb_build_object(
                'catalog_id', m.catalog_id, 'url', m.url, 'tipo', m.media_type, 'principal', m.is_primary)
                order by m.is_primary desc nulls last, m.sort_order nulls last, m.created_ts)
              from public.catalog_media m
              join public.catalog k on k.company_id = m.company_id and k.id = m.catalog_id and coalesce(k.is_active, 1) = 1
             where m.company_id = v.company_id), '[]'::jsonb),
        'variantes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', w.id, 'catalog_id', w.catalog_id, 'etiqueta', w.etiqueta, 'atributos', w.atributos, 'stock', w.stock)
                order by w.etiqueta)
              from public.catalog_variantes w where w.company_id = v.company_id), '[]'::jsonb),
        'equipo', coalesce((
            select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.name, 'horario', e.schedule) order by e.name)
              from public.employees e where e.company_id = v.company_id and coalesce(e.is_active, 1) = 1), '[]'::jsonb),
        'bloqueos', coalesce((
            select jsonb_agg(jsonb_build_object('employee_id', b.employee_id, 'inicio', b.start, 'fin', b."end"))
              from public.employee_blocks b where b.company_id = v.company_id and b."end" >= v_hoy), '[]'::jsonb),
        'citas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'slot_start', a.slot_start, 'slot_end', a.slot_end, 'slot_minutes', a.slot_minutes,
                'employee_id', a.employee_id, 'status', a.status,
                'periodo_desde', a.periodo_desde, 'periodo_hasta', a.periodo_hasta))
              from public.appointments a
             where a.company_id = v.company_id
               and ((a.slot_start like 'sched:%' and a.status = 'confirmed'
                     and (coalesce(a.periodo_hasta, '') = '' or a.periodo_hasta >= v_hoy))
                 or (a.slot_start >= v_hoy and a.status in ('confirmed', 'pending_payment', 'completed')))), '[]'::jsonb),
        'web', coalesce((
            select jsonb_agg(jsonb_build_object('slot_start', r.slot_start, 'slot_end', r.slot_end, 'employee_id', r.employee_id))
              from public.reservas_web r
             where r.company_id = v.company_id and r.estado in ('apartada', 'confirmada')
               and (r.tipo = 'grupo' or r.slot_start >= v_hoy)), '[]'::jsonb),
        'apartado', coalesce((
            select jsonb_object_agg(s.clave, s.n) from (
                select (l->>'catalog_id') || '|' || coalesce(l->>'variante_id', '') as clave, sum((l->>'cantidad')::int) as n
                  from public.pedidos_web p, jsonb_array_elements(p.lineas) l
                 where p.company_id = v.company_id and p.estado in ('nuevo', 'confirmado')
                 group by 1) s), '{}'::jsonb),
        'hoy', v_hoy,
        'ahora', to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI'));
end $$;

-- 'YYYY-MM-DD HH:MM' + minutos, en el mismo formato. Texto raro → null (no tumba nada).
create or replace function public.tu_pagina_sumar_min(p text, p_min integer)
returns text language sql immutable as $$
    select case when p ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
                then to_char(to_timestamp(p, 'YYYY-MM-DD HH24:MI')::timestamp + make_interval(mins => coalesce(p_min, 60)), 'YYYY-MM-DD HH24:MI')
           end;
$$;

-- ── Separar un cupo ───────────────────────────────────────────────────────────
-- p_datos: {tipo, catalog_id, slot_start, slot_end, paso, employee_id, capacidad,
--           grupo, nombre, telefono, beneficiario, nota}
create or replace function public.reserva_srv_crear(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag   public.tu_pagina;
    v_item  public.catalog;
    v_fila  public.reservas_web;
    v_tel   text;
    v_tipo  text := p_datos->>'tipo';
    v_ini   text := p_datos->>'slot_start';
    v_fin   text := nullif(p_datos->>'slot_end', '');
    v_emp   text := coalesce(p_datos->>'employee_id', '');
    v_cap   integer := (p_datos->>'capacidad')::integer;
    v_paso  integer := greatest(5, coalesce((p_datos->>'paso')::integer, 30));
    v_ahora text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_hoy   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
    v_n     integer;
    i       integer := 0;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'reservar')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_fila from public.reservas_web where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'repetido', true); end if;

    -- Un negocio a la vez: lo que se cuenta aquí no cambia hasta el COMMIT.
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    select * into v_item from public.catalog
     where company_id = v_pag.company_id and id = p_datos->>'catalog_id' and coalesce(is_active, 1) = 1;
    if not found then return jsonb_build_object('status', 'no_existe'); end if;

    v_tel := regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g');
    if char_length(v_tel) = 9 and v_tel like '9%' then v_tel := '51' || v_tel; end if;

    -- Un mismo teléfono no llena la agenda: 5 vivas como mucho.
    if (select count(*) from public.reservas_web
         where company_id = v_pag.company_id and telefono = v_tel and estado = 'apartada') >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    if v_cap is null or v_cap < -1 then return jsonb_build_object('status', 'datos_invalidos'); end if;

    if v_tipo = 'cita' then
        if v_ini !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' or coalesce(v_fin, '') !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' or v_fin <= v_ini then
            return jsonb_build_object('status', 'datos_invalidos');
        end if;
        if v_ini <= v_ahora then return jsonb_build_object('status', 'pasada'); end if;
        if v_emp <> '' and not exists (
            select 1 from public.employees where company_id = v_pag.company_id and id = v_emp and coalesce(is_active, 1) = 1) then
            return jsonb_build_object('status', 'datos_invalidos');
        end if;

        -- Lo que pisa este rato: citas del bot y reservas de la página.
        -- La regla, igual que en agenda.ts: lo más lleno de cualquier tramo < el aforo.
        with ocupado as (
            select a.employee_id as emp, a.slot_start as ini,
                   coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) as fin
              from public.appointments a
             where a.company_id = v_pag.company_id
               and a.status in ('confirmed', 'pending_payment', 'completed')
               and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
               and a.slot_start < v_fin
            union all
            select r.employee_id, r.slot_start, r.slot_end
              from public.reservas_web r
             where r.company_id = v_pag.company_id and r.tipo = 'cita'
               and r.estado in ('apartada', 'confirmada') and r.slot_start < v_fin
        ), tramos as (
            select to_char(g, 'YYYY-MM-DD HH24:MI') as t0,
                   to_char(g + make_interval(mins => v_paso), 'YYYY-MM-DD HH24:MI') as t1
              from generate_series(to_timestamp(v_ini, 'YYYY-MM-DD HH24:MI')::timestamp,
                                   to_timestamp(v_fin, 'YYYY-MM-DD HH24:MI')::timestamp - interval '1 minute',
                                   make_interval(mins => v_paso)) g
        )
        select coalesce(max((select count(*) from ocupado o where o.ini < t.t1 and o.fin > t.t0)), 0)
          into v_n from tramos t;
        if v_n >= v_cap then return jsonb_build_object('status', 'lleno'); end if;

        if v_emp <> '' and (
            exists (select 1 from public.appointments a
                     where a.company_id = v_pag.company_id and a.employee_id = v_emp
                       and a.status in ('confirmed', 'pending_payment', 'completed')
                       and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
                       and a.slot_start < v_fin
                       and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > v_ini)
            or exists (select 1 from public.reservas_web r
                        where r.company_id = v_pag.company_id and r.employee_id = v_emp and r.tipo = 'cita'
                          and r.estado in ('apartada', 'confirmada') and r.slot_start < v_fin and r.slot_end > v_ini)) then
            return jsonb_build_object('status', 'lleno');
        end if;

    elsif v_tipo = 'grupo' then
        if v_ini not like 'sched:' || v_item.id || ':%' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        v_fin := null;
        v_emp := '';
        if v_cap >= 0 then
            -- Quién ocupa plaza: la regla del bot (lib/panel/inscripciones.ts → ocupa),
            -- más las separadas en la página.
            select (select count(*) from public.appointments a
                     where a.company_id = v_pag.company_id and a.slot_start = v_ini and a.status = 'confirmed'
                       and (coalesce(a.periodo_desde, '') = '' or (a.periodo_desde <= v_hoy and coalesce(a.periodo_hasta, '') >= v_hoy)))
                 + (select count(*) from public.reservas_web r
                     where r.company_id = v_pag.company_id and r.slot_start = v_ini and r.estado in ('apartada', 'confirmada'))
              into v_n;
            if v_n >= v_cap then return jsonb_build_object('status', 'lleno'); end if;
        end if;
    else
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    loop
        begin
            insert into public.reservas_web (
                company_id, codigo, tipo, catalog_id, servicio, precio, slot_start, slot_end, grupo, employee_id,
                nombre, telefono, beneficiario, nota, idem)
            values (
                v_pag.company_id, public.envio_codigo('R'), v_tipo, v_item.id, v_item.name, v_item.price, v_ini, v_fin,
                left(btrim(coalesce(p_datos->>'grupo', '')), 120), v_emp,
                btrim(coalesce(p_datos->>'nombre', '')), v_tel, btrim(coalesce(p_datos->>'beneficiario', '')),
                btrim(coalesce(p_datos->>'nota', '')), p_idem)
            returning * into v_fila;
            exit;
        exception when unique_violation then
            select * into v_fila from public.reservas_web where company_id = v_pag.company_id and idem = p_idem;
            if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'repetido', true); end if;
            i := i + 1;
            if i > 5 then raise; end if;
        end;
    end loop;
    return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'servicio', v_fila.servicio,
                              'precio', v_fila.precio, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation or invalid_datetime_format then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- ── Hacer un pedido ───────────────────────────────────────────────────────────
-- p_datos: {nombre, telefono, entrega, direccion, referencia, nota,
--           lineas: [{catalog_id, variante_id, cantidad}]}
-- El precio y el nombre salen del catálogo, nunca del navegador.
create or replace function public.pedido_srv_crear(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag      public.tu_pagina;
    v_fila     public.pedidos_web;
    v_item     public.catalog;
    v_var      public.catalog_variantes;
    v_var_id   text;
    v_etiqueta text;
    l          jsonb;
    v_lineas   jsonb := '[]'::jsonb;
    v_cant     integer;
    v_stock    integer;
    v_aparte   integer;
    v_total    numeric := 0;
    v_tel      text;
    v_entrega  text := p_datos->>'entrega';
    i          integer := 0;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'catalogo')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_fila from public.pedidos_web where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'total', v_fila.total, 'lineas', v_fila.lineas, 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    v_tel := regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g');
    if char_length(v_tel) = 9 and v_tel like '9%' then v_tel := '51' || v_tel; end if;
    if (select count(*) from public.pedidos_web
         where company_id = v_pag.company_id and telefono = v_tel and estado = 'nuevo') >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    if jsonb_typeof(p_datos->'lineas') is distinct from 'array' or jsonb_array_length(p_datos->'lineas') not between 1 and 30 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    for l in select * from jsonb_array_elements(p_datos->'lineas') loop
        v_cant := (l->>'cantidad')::integer;
        if v_cant is null or v_cant not between 1 and 99 then return jsonb_build_object('status', 'datos_invalidos'); end if;

        select * into v_item from public.catalog
         where company_id = v_pag.company_id and id = l->>'catalog_id' and coalesce(is_active, 1) = 1;
        if not found then return jsonb_build_object('status', 'no_existe'); end if;

        v_var_id := ''; v_etiqueta := ''; v_stock := v_item.stock;
        if coalesce(l->>'variante_id', '') <> '' then
            select * into v_var from public.catalog_variantes
             where company_id = v_pag.company_id and catalog_id = v_item.id and id = l->>'variante_id';
            if not found then return jsonb_build_object('status', 'no_existe'); end if;
            v_var_id := v_var.id; v_etiqueta := v_var.etiqueta; v_stock := v_var.stock;
        elsif exists (select 1 from public.catalog_variantes where company_id = v_pag.company_id and catalog_id = v_item.id) then
            return jsonb_build_object('status', 'falta_opcion', 'producto', v_item.name);
        end if;

        if v_stock is not null then
            select coalesce(sum((x->>'cantidad')::integer), 0) into v_aparte
              from public.pedidos_web p, jsonb_array_elements(p.lineas) x
             where p.company_id = v_pag.company_id and p.estado in ('nuevo', 'confirmado')
               and x->>'catalog_id' = v_item.id and coalesce(x->>'variante_id', '') = v_var_id;
            v_aparte := v_aparte + coalesce((
                select sum((y->>'cantidad')::integer) from jsonb_array_elements(v_lineas) y
                 where y->>'catalog_id' = v_item.id and y->>'variante_id' = v_var_id), 0);
            if v_cant > v_stock - v_aparte then
                return jsonb_build_object('status', 'sin_stock',
                    'producto', v_item.name || case when v_etiqueta <> '' then ' · ' || v_etiqueta else '' end,
                    'quedan', greatest(v_stock - v_aparte, 0));
            end if;
        end if;

        v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
            'catalog_id', v_item.id, 'variante_id', v_var_id, 'nombre', v_item.name, 'opcion', v_etiqueta,
            'precio', coalesce(v_item.price, 0), 'cantidad', v_cant));
        v_total := v_total + coalesce(v_item.price, 0) * v_cant;
    end loop;

    if v_entrega not in ('recojo', 'delivery') then return jsonb_build_object('status', 'datos_invalidos'); end if;
    if v_entrega = 'delivery' and char_length(btrim(coalesce(p_datos->>'direccion', ''))) < 5 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    loop
        begin
            insert into public.pedidos_web (company_id, codigo, nombre, telefono, lineas, total, entrega, direccion, referencia, nota, idem)
            values (
                v_pag.company_id, public.envio_codigo('P'), btrim(coalesce(p_datos->>'nombre', '')), v_tel, v_lineas, v_total,
                v_entrega, btrim(coalesce(p_datos->>'direccion', '')), btrim(coalesce(p_datos->>'referencia', '')),
                btrim(coalesce(p_datos->>'nota', '')), p_idem)
            returning * into v_fila;
            exit;
        exception when unique_violation then
            select * into v_fila from public.pedidos_web where company_id = v_pag.company_id and idem = p_idem;
            if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'total', v_fila.total, 'lineas', v_fila.lineas, 'repetido', true); end if;
            i := i + 1;
            if i > 5 then raise; end if;
        end;
    end loop;
    return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'total', v_fila.total, 'lineas', v_fila.lineas, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- ── El panel: confirmar, cancelar, entregar… ─────────────────────────────────

create or replace function public.pedidos_web_estado(p_company text, p_ids uuid[], p_estado text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.pedidos_web set estado = p_estado, cambiado_at = now()
     where company_id = p_company and id = any(p_ids);
    get diagnostics n = row_count;
    return n;
end $$;

create or replace function public.reservas_web_estado(p_company text, p_ids uuid[], p_estado text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.reservas_web set estado = p_estado, cambiado_at = now()
     where company_id = p_company and id = any(p_ids);
    get diagnostics n = row_count;
    return n;
end $$;

-- ── Aviso al celular del dueño (modules/avisos) ──────────────────────────────
-- Mismo tipo que una reserva o un pedido de Mia; `clase` dice que vino de la página.

create or replace function public.avisos_tg_web() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if tg_table_name = 'pedidos_web' then
        perform public.avisos_apuntar(new.company_id, 'reserva', 'web:' || new.codigo,
            jsonb_build_object('clase', 'web_pedido', 'nombre', new.nombre, 'total', new.total, 'codigo', new.codigo));
    else
        perform public.avisos_apuntar(new.company_id, 'reserva', 'web:' || new.codigo,
            jsonb_build_object('clase', 'web_reserva', 'nombre', new.nombre, 'servicio', new.servicio,
                               'slot', new.slot_start, 'codigo', new.codigo));
    end if;
    return null;
exception when others then
    raise warning 'avisos_tg_web: %', sqlerrm;
    return null;
end $$;

drop trigger if exists avisos_pedido_web on public.pedidos_web;
create trigger avisos_pedido_web after insert on public.pedidos_web
    for each row execute function public.avisos_tg_web();
drop trigger if exists avisos_reserva_web on public.reservas_web;
create trigger avisos_reserva_web after insert on public.reservas_web
    for each row execute function public.avisos_tg_web();

-- ── Permisos de ejecución ─────────────────────────────────────────────────────

revoke execute on function public.pedidos_web_estado(text, uuid[], text) from public, anon;
revoke execute on function public.reservas_web_estado(text, uuid[], text) from public, anon;
grant  execute on function public.pedidos_web_estado(text, uuid[], text) to authenticated;
grant  execute on function public.reservas_web_estado(text, uuid[], text) to authenticated;
revoke execute on function public.avisos_tg_web() from public, anon, authenticated;

revoke execute on function public.tu_pagina_srv_datos(text) from public;
revoke execute on function public.reserva_srv_crear(text, jsonb, text) from public;
revoke execute on function public.pedido_srv_crear(text, jsonb, text) from public;
grant  execute on function public.tu_pagina_srv_datos(text) to anon;
grant  execute on function public.reserva_srv_crear(text, jsonb, text) to anon;
grant  execute on function public.pedido_srv_crear(text, jsonb, text) to anon;

commit;
