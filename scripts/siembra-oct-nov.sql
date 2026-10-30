-- ═══════════════════════════════════════════════════════════════════════════
-- SIEMBRA · ventas, conversaciones y leads de piel-futbolera, kallpa y
-- barberia-01, del 1-oct al 30-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 27-oct-2026, sabiendo lo que cuesta: va a la base REAL,
-- junto a la facturación real de clientes reales (ver el aviso de
-- lib/panel/demo.ts: con barberia-01 ya pasó una vez). Por eso:
--
--   · TODA fila sembrada lleva id `seed-…`. Se quita entera, y solo ella, con
--     scripts/siembra-oct-nov-deshacer.sql. Nada real se toca ni se actualiza.
--   · Teléfonos 51000xxxxxxx: no existen en Perú. Si un día alguien enciende un
--     bot o un recordatorio, no le escribe a una persona de verdad.
--   · Los avisos push (avisos_cita / avisos_pedido / avisos_pago) se apagan
--     durante la siembra y se vuelven a encender al final: si no, cada cita de
--     noviembre sería un aviso al celular del dueño.
--   · El stock del catálogo NO se descuenta: los pedidos sembrados no se llevan
--     camisetas de verdad.
--   · Usa el catálogo, el equipo y el horario que hay HOY en la nube, no una
--     copia: los nombres de servicio y los precios salen de `catalog`.
--
-- Lo que deja:
--   barberia-01     clientes que escriben, citas puntuales con su barbero y
--                   vuelven cada 2–4 semanas. Lo pasado, cumplido y cobrado
--                   (Yape/Plin con comprobante, efectivo marcado en el panel);
--                   unas pocas «no vino» y canceladas. Noviembre, confirmadas.
--   kallpa          padres que preguntan por su hijo, inscripciones por grupo y
--                   mes (oct, nov y algo de dic) respetando el cupo de cada
--                   franja contando las inscripciones reales; renovaciones.
--                   Algunas pagan una seña de S/ 50: salen «por cobrar».
--   piel-futbolera  consultas por camisetas, pedidos con talla, delivery o
--                   recojo, Yape/Plin/contraentrega. Lo viejo, entregado; lo
--                   reciente y noviembre, pagado o por cobrar.
--
-- ⚠️ «Todo noviembre», como lo pidió: hay leads, mensajes y pedidos con fecha
-- POSTERIOR a hoy. El panel los enseña como si ya hubieran pasado. Para dejar
-- solo lo de hasta hoy, cambia `v_hasta` en los tres bloques antes de correrlo.
--
-- Es determinista (setseed): la misma base y el mismo día dan lo mismo.
-- Si ya hay una siembra, se niega: deshaz primero.
--
-- Ejecútalo entero en el editor SQL de Supabase (rol postgres).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

select setseed(0.2026);

-- ── 0 · Comprobar antes de escribir nada ─────────────────────────────────────

do $$
begin
    if (select count(*) from public.companies where id in ('piel-futbolera', 'kallpa', 'barberia-01')) <> 3 then
        raise exception 'Falta alguno de los tres negocios (piel-futbolera, kallpa, barberia-01).';
    end if;
    if exists (select 1 from public.leads where id like 'seed-%') then
        raise exception 'Ya hay una siembra (leads seed-%%). Corre antes scripts/siembra-oct-nov-deshacer.sql.';
    end if;
end $$;

-- ── 1 · Avisos apagados mientras dura la siembra ─────────────────────────────

do $$
declare
    t record;
begin
    for t in select c.relname, g.tgname
               from pg_trigger g
               join pg_class c on c.oid = g.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and g.tgname in ('avisos_cita', 'avisos_pedido', 'avisos_pago') loop
        execute format('alter table public.%I disable trigger %I', t.relname, t.tgname);
    end loop;
end $$;

-- ── 2 · Ayudantes (pg_temp: desaparecen con la sesión) ───────────────────────

create or replace function pg_temp.r(a int, b int) returns int
language sql volatile as $$ select a + floor(random() * (b - a + 1))::int $$;

create or replace function pg_temp.p(xs text[]) returns text
language sql volatile as $$ select xs[1 + floor(random() * array_length(xs, 1))::int] $$;

-- Epoch de una hora LOCAL de Lima: como el bot, que guarda created_at en segundos.
create or replace function pg_temp.lima(d date, h int, mi int) returns bigint
language sql immutable as $$ select extract(epoch from ((d + make_time(h, mi, 0)) at time zone 'America/Lima'))::bigint $$;

create or replace function pg_temp.soles(x numeric) returns text
language sql immutable as $$
    select 'S/ ' || case when x = trunc(x) then trunc(x)::bigint::text else to_char(x, 'FM999990.00') end
$$;

create or replace function pg_temp.mes(d date) returns text
language sql immutable as $$
    select (array['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
                  'septiembre', 'octubre', 'noviembre', 'diciembre'])[extract(month from d)::int]
$$;

create or replace function pg_temp.legible(d date) returns text
language sql immutable as $$
    select (array['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'])[extract(dow from d)::int + 1]
           || ' ' || extract(day from d)::int || ' de ' || pg_temp.mes(d)
$$;

create or replace function pg_temp.nombre(genero text default null) returns text
language plpgsql volatile as $$
declare
    h text[] := array['Carlos', 'Luis', 'Jorge', 'Diego', 'Renzo', 'Bruno', 'Piero', 'Kevin', 'Joel', 'Miguel',
                      'Andrés', 'Sebastián', 'Martín', 'Rodrigo', 'Gonzalo', 'César', 'Iván', 'Franco', 'Gabriel',
                      'Mateo', 'Josué', 'Alonso', 'Fabián', 'Christian', 'Ricardo', 'Eduardo', 'Paolo',
                      'Gianfranco', 'Jhon', 'Anthony', 'Thiago', 'Santiago'];
    m text[] := array['María', 'Lucía', 'Ana', 'Sofía', 'Valeria', 'Camila', 'Daniela', 'Fernanda', 'Rocío',
                      'Milagros', 'Patricia', 'Carla', 'Andrea', 'Gabriela', 'Karina', 'Paola', 'Jimena',
                      'Mariana', 'Claudia', 'Katherine', 'Rosa', 'Fiorella', 'Gianella', 'Ximena', 'Brenda',
                      'Valentina', 'Luana'];
    a text[] := array['Quispe', 'Flores', 'Rojas', 'Huamán', 'Mendoza', 'Torres', 'Chávez', 'Ramírez', 'Vargas',
                      'Castillo', 'Gutiérrez', 'Salazar', 'Paredes', 'Espinoza', 'Ríos', 'Cárdenas', 'Vásquez',
                      'Morales', 'Díaz', 'Herrera', 'Mamani', 'Condori', 'Romero', 'Palacios', 'Sánchez',
                      'Villanueva', 'Zapata', 'Alarcón', 'Bustamante', 'Ccori'];
    g text := coalesce(genero, case when random() < 0.5 then 'h' else 'm' end);
begin
    return (case when g = 'h' then pg_temp.p(h) else pg_temp.p(m) end) || ' ' || pg_temp.p(a);
end $$;

create or replace function pg_temp.lead(p_co text, p_id text, p_tel text, p_nombre text, p_creado bigint) returns void
language sql volatile as $$
    insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
    values (p_id, p_co, p_tel, p_nombre, 'inquiry', 'exploring', p_creado, 1, 'organico', p_creado)
$$;

-- Una conversación: cada línea 'u|…' (cliente) o 'a|…' (Mia). Devuelve la hora
-- del último mensaje. Se puede llamar varias veces sobre el mismo lead.
create or replace function pg_temp.chat(p_lead text, p_desde bigint, p_guion text[]) returns bigint
language plpgsql volatile as $$
declare
    t    bigint := p_desde;
    base int;
    rol  text;
    i    int;
begin
    select count(*) into base from public.messages where lead_id = p_lead;
    for i in 1 .. coalesce(array_length(p_guion, 1), 0) loop
        rol := case left(p_guion[i], 2) when 'a|' then 'assistant' else 'user' end;
        if i > 1 then t := t + case when rol = 'user' then pg_temp.r(40, 420) else pg_temp.r(8, 45) end; end if;
        insert into public.messages (id, lead_id, role, content, created_at)
        values (p_lead || '-m' || (base + i), p_lead, rol, substr(p_guion[i], 3), t);
    end loop;
    update public.leads set last_activity_at = greatest(last_activity_at, t) where id = p_lead;
    return t;
end $$;

-- Una cita puntual de barbería en un hueco libre del barbero. null = no cupo.
-- p_fijo: el servicio de siempre, para el que vuelve.
create or replace function pg_temp.cita_barberia(
    p_co text, p_id text, p_lead text, p_dia date, p_minimo bigint, p_creado bigint,
    p_items jsonb, p_emps jsonb, p_sched jsonb, p_fijo jsonb default null
) returns jsonb
language plpgsql volatile as $$
declare
    v_dia      jsonb := p_sched -> to_char(p_dia, 'FMday');
    v_abre     int;
    v_cierra   int;
    v_a        jsonb;
    v_b        jsonb;
    v_dur      int;
    v_precio   numeric;
    v_serv     text;
    v_emp      jsonb;
    v_ini      text;
    v_fin      text;
    v_m        int;
    v_ts       bigint;
    v_ok       boolean := false;
    v_estado   text;
    v_metodo   text := '';
    v_pagado   text := '';
    v_cumplido text := '';
    i          int;
begin
    if p_sched = '{}'::jsonb then
        if extract(dow from p_dia) = 0 then return null; end if;
        v_dia := '{"open":"09:00","close":"19:00"}';
    end if;
    if v_dia is null or coalesce(v_dia ->> 'open', '') = '' or coalesce(v_dia ->> 'close', '') = ''
       or coalesce(v_dia ->> 'closed', 'false') = 'true' then
        return null;
    end if;
    v_abre   := split_part(v_dia ->> 'open', ':', 1)::int * 60 + split_part(v_dia ->> 'open', ':', 2)::int;
    v_cierra := split_part(v_dia ->> 'close', ':', 1)::int * 60 + split_part(v_dia ->> 'close', ':', 2)::int;

    v_a      := coalesce(p_fijo, p_items -> floor(random() * jsonb_array_length(p_items))::int);
    v_dur    := (v_a ->> 'dur')::int;
    v_precio := (v_a ->> 'price')::numeric;
    v_serv   := v_a ->> 'name';
    if p_fijo is null and random() < 0.18 then
        v_b := p_items -> floor(random() * jsonb_array_length(p_items))::int;
        if v_b ->> 'id' <> v_a ->> 'id' and (v_a ->> 'name') !~* 'pack' and (v_b ->> 'name') !~* 'pack' then
            v_dur    := v_dur + (v_b ->> 'dur')::int;
            v_precio := v_precio + (v_b ->> 'price')::numeric;
            v_serv   := v_serv || ' + ' || (v_b ->> 'name');
        else
            v_b := null;
        end if;
    end if;
    if v_cierra - v_abre < v_dur then return null; end if;

    for i in 1 .. 10 loop
        v_m  := v_abre + 30 * pg_temp.r(0, (v_cierra - v_abre - v_dur) / 30);
        v_ts := pg_temp.lima(p_dia, v_m / 60, v_m % 60);
        continue when v_ts < p_minimo;
        if jsonb_array_length(p_emps) > 0 then
            v_emp := p_emps -> floor(random() * jsonb_array_length(p_emps))::int;
        end if;
        v_ini := to_char(p_dia, 'YYYY-MM-DD') || ' ' || lpad((v_m / 60)::text, 2, '0') || ':' || lpad((v_m % 60)::text, 2, '0');
        v_fin := to_char(p_dia, 'YYYY-MM-DD') || ' ' || lpad(((v_m + v_dur) / 60)::text, 2, '0') || ':' || lpad(((v_m + v_dur) % 60)::text, 2, '0');
        if not exists (
            select 1 from public.appointments a
             where a.company_id = p_co
               and a.employee_id = coalesce(v_emp ->> 'id', '')
               and a.status in ('confirmed', 'pending_payment', 'completed')
               and left(a.slot_start, 10) = left(v_ini, 10)
               and a.slot_start < v_fin
               and coalesce(nullif(a.slot_end, ''), a.slot_start) > v_ini
        ) then
            v_ok := true;
            exit;
        end if;
    end loop;
    if not v_ok then return null; end if;

    if v_ts + v_dur * 60 < extract(epoch from now()) then
        v_estado := case when random() < 0.85 then 'completed' when random() < 0.5 then 'no_show' else 'cancelled' end;
    else
        v_estado := case when random() < 0.92 then 'confirmed' else 'cancelled' end;
    end if;
    if v_estado = 'completed' then
        v_metodo   := pg_temp.p(array['yape', 'yape', 'yape', 'plin', 'cash', 'cash', 'cash']);
        v_pagado   := case when v_metodo = 'cash' then 'panel' else 'voucher' end;
        v_cumplido := 'panel';
    end if;

    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id,
                                     status, created_at, pagado_por, cumplido_por, metodo_pago)
    values (p_id, p_co, p_lead, v_serv, v_ini, v_fin, v_dur, coalesce(v_emp ->> 'id', ''),
            v_estado, least(p_creado, v_ts - 900), v_pagado, v_cumplido, v_metodo);
    insert into public.appointment_services (id, appointment_id, catalog_item_id, name, price, duration_minutes, sort_order)
    values (p_id || '-s1', p_id, v_a ->> 'id', v_a ->> 'name', (v_a ->> 'price')::numeric, (v_a ->> 'dur')::int, 0);
    if v_b is not null then
        insert into public.appointment_services (id, appointment_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (p_id || '-s2', p_id, v_b ->> 'id', v_b ->> 'name', (v_b ->> 'price')::numeric, (v_b ->> 'dur')::int, 1);
    end if;
    if v_pagado = 'voucher' then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
        values (p_id || '-p', p_lead, p_co, v_precio, 'seed-op-' || p_id, 1, v_ts + v_dur * 60 + pg_temp.r(60, 900), '', p_id);
    end if;

    return jsonb_build_object('id', p_id, 'item', v_a, 'dia', p_dia, 'hora', substr(v_ini, 12, 5), 'fin_ts', v_ts + v_dur * 60,
                              'servicio', v_serv, 'precio', v_precio, 'barbero', coalesce(v_emp ->> 'name', ''),
                              'estado', v_estado, 'metodo', v_metodo);
end $$;

-- Una inscripción de kallpa a un grupo y un periodo, si queda cupo contando
-- las reales (las sin periodo ocupan siempre, como en el bot). null = lleno.
create or replace function pg_temp.inscribir(
    p_co text, p_id text, p_lead text, p_it jsonb, p_fr jsonb, p_mes date, p_creado bigint, p_nino text, p_edad text
) returns jsonb
language plpgsql volatile as $$
declare
    v_slot   text    := 'sched:' || (p_it ->> 'id') || ':' || (p_fr ->> 'id');
    v_vig    int     := greatest(coalesce((p_it ->> 'vig')::int, 1), 1);
    v_d      text    := to_char(p_mes, 'YYYY-MM-DD');
    v_h      text    := to_char((p_mes + make_interval(months => v_vig) - interval '1 day')::date, 'YYYY-MM-DD');
    v_cap    int     := coalesce(nullif(p_fr ->> 'capacity', '')::int, -1);
    v_precio numeric := (p_it ->> 'price')::numeric;
    v_estado text;
    v_monto  numeric := 0;
    v_metodo text    := '';
begin
    if v_cap <> -1 and (
        select count(*) from public.appointments o
         where o.company_id = p_co and o.slot_start = v_slot
           and o.status in ('confirmed', 'pending_payment')
           and (coalesce(o.periodo_desde, '') = '' or (o.periodo_desde <= v_h and o.periodo_hasta >= v_d))
    ) >= v_cap then
        return null;
    end if;

    v_estado := case when random() < 0.05 then 'cancelled' else 'confirmed' end;
    if v_estado = 'confirmed' then
        v_monto  := case when random() < 0.8 or v_precio <= 50 then v_precio else 50 end;
        v_metodo := case when random() < 0.8 then 'yape' else 'plin' end;
    end if;

    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id,
                                     status, created_at, pagado_por, cumplido_por, metodo_pago,
                                     beneficiario, beneficiario_edad, periodo_desde, periodo_hasta)
    values (p_id, p_co, p_lead, p_it ->> 'name', v_slot, '', 60, '',
            v_estado, p_creado, case when v_monto > 0 then 'voucher' else '' end, '', v_metodo,
            p_nino, p_edad, v_d, v_h);
    insert into public.appointment_services (id, appointment_id, catalog_item_id, name, price, duration_minutes, sort_order)
    values (p_id || '-s1', p_id, p_it ->> 'id', p_it ->> 'name', v_precio, 0, 0);
    if v_monto > 0 then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
        values (p_id || '-p', p_lead, p_co, v_monto, 'seed-op-' || p_id, 1, p_creado + pg_temp.r(300, 1800), '', p_id);
        -- La mitad de las señas viejas ya pagaron el resto; las otras siguen «por cobrar».
        if v_monto < v_precio and p_creado + 9 * 86400 < extract(epoch from now()) and random() < 0.5 then
            insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
            values (p_id || '-p2', p_lead, p_co, v_precio - v_monto, 'seed-op-' || p_id || '-2', 1,
                    p_creado + pg_temp.r(5, 9) * 86400, '', p_id);
        end if;
    end if;

    return jsonb_build_object('id', p_id, 'estado', v_estado, 'monto', v_monto, 'precio', v_precio, 'metodo', v_metodo,
                              'periodo', case when v_vig = 1 then pg_temp.mes(p_mes)
                                              else pg_temp.mes(p_mes) || ' a ' || pg_temp.mes((p_mes + make_interval(months => v_vig - 1))::date) end);
end $$;

-- Un pedido de camisetas, con talla en el nombre de la línea como lo escribe Mi página.
create or replace function pg_temp.pedido_piel(p_co text, p_id text, p_lead text, p_creado bigint, p_items jsonb) returns jsonb
language plpgsql volatile as $$
declare
    v_n        int := case when random() < 0.75 then 1 when random() < 0.8 then 2 else 3 end;
    v_lineas   jsonb := '[]'::jsonb;
    v_res      text := '';
    v_total    numeric := 0;
    v_x        jsonb;
    v_talla    text;
    v_q        int;
    v_primera  jsonb;
    v_talla1   text;
    v_entrega  text;
    v_distrito text;
    v_dir      text := '';
    v_metodo   text;
    v_estado   text;
    v_pagado   text := '';
    v_cumplido text := '';
    v_dia      date;
    i          int;
begin
    for i in 1 .. v_n loop
        v_x     := p_items -> floor(random() * jsonb_array_length(p_items))::int;
        v_talla := pg_temp.p(array['S', 'M', 'M', 'L', 'L', 'L', 'XL']);
        v_q     := case when random() < 0.1 then 2 else 1 end;
        if i = 1 then v_primera := v_x; v_talla1 := v_talla; end if;
        v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
            'name', (v_x ->> 'name') || ' · Talla ' || v_talla, 'price', (v_x ->> 'price')::numeric,
            'quantity', v_q, 'catalog_item_id', v_x ->> 'id'));
        v_res   := v_res || case when i > 1 then ' + ' else '' end || case when v_q > 1 then v_q || '× ' else '' end
                   || (v_x ->> 'name') || ' (talla ' || v_talla || ')';
        v_total := v_total + (v_x ->> 'price')::numeric * v_q;
    end loop;

    v_distrito := pg_temp.p(array['Los Olivos', 'San Martín de Porres', 'Comas', 'Surco', 'San Juan de Lurigancho',
                                  'La Victoria', 'Miraflores', 'Ate', 'Chorrillos', 'Callao', 'Independencia',
                                  'Jesús María', 'Breña', 'Villa El Salvador', 'San Miguel']);
    v_entrega  := case when random() < 0.8 then 'delivery' else 'pickup' end;
    if v_entrega = 'delivery' then
        v_dir := pg_temp.p(array['Av. ', 'Jr. ', 'Calle ', 'Psje. '])
                 || pg_temp.p(array['Los Pinos', 'Las Gardenias', 'Túpac Amaru', 'Los Alisos', 'San Felipe', 'Grau',
                                    'Bolognesi', 'Las Begonias', 'Huáscar', 'Los Jazmines'])
                 || ' ' || pg_temp.r(100, 2899) || ', ' || v_distrito;
    end if;
    v_metodo := pg_temp.p(array['yape', 'yape', 'yape', 'yape', 'yape', 'plin', 'plin', 'cod', 'cod', 'cod']);
    if v_metodo = 'cod' and v_entrega = 'pickup' then v_metodo := 'cash'; end if;
    v_dia := (to_timestamp(p_creado) at time zone 'America/Lima')::date + pg_temp.r(1, 3);

    if p_creado < extract(epoch from now()) - 3 * 86400 then
        v_estado := case when random() < 0.9 then 'delivered' else 'cancelled' end;
    elsif random() < 0.1 then
        v_estado := 'cancelled';
    else
        v_estado := case when v_metodo in ('yape', 'plin') then 'paid' else 'pending' end;
    end if;
    if v_estado in ('paid', 'delivered') then
        v_pagado := case when v_metodo in ('yape', 'plin') then 'voucher' else 'panel' end;
    end if;
    if v_estado = 'delivered' then v_cumplido := 'panel'; end if;

    insert into public.orders (id, company_id, lead_id, items, total, status, payment_method, delivery_address,
                               delivery_option, delivery_at, created_at, pagado_por, cumplido_por, discount)
    values (p_id, p_co, p_lead, v_lineas::text, v_total, v_estado, v_metodo, v_dir,
            v_entrega, to_char(v_dia, 'YYYY-MM-DD'), p_creado, v_pagado, v_cumplido, 0);
    if v_pagado = 'voucher' then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
        values (p_id || '-p', p_lead, p_co, v_total, 'seed-op-' || p_id, 1, p_creado + pg_temp.r(300, 1500), p_id, '');
    end if;

    return jsonb_build_object('resumen', v_res, 'total', v_total, 'entrega', v_entrega, 'distrito', v_distrito,
                              'dir', v_dir, 'metodo', v_metodo, 'estado', v_estado, 'dia', v_dia,
                              'primero', v_primera ->> 'name', 'precio1', (v_primera ->> 'price')::numeric, 'talla1', v_talla1);
end $$;

-- ── 3 · barberia-01 ──────────────────────────────────────────────────────────

do $$
declare
    v_co    constant text   := 'barberia-01';
    v_desde constant date   := date '2026-10-01';
    v_hasta constant date   := date '2026-11-30';
    v_ahora constant bigint := extract(epoch from now())::bigint;
    v_negocio text;
    v_bot     text;
    v_sched   jsonb;
    v_items   jsonb;
    v_emps    jsonb;
    d         date;
    v_k       int;
    v_j       int;
    v_i       int;
    v_n       int := 0;
    v_nc      int := 0;
    v_lead    text;
    v_nom     text;
    v_pri     text;
    v_t       bigint;
    v_c       jsonb;
    v_r       jsonb;
    v_x       jsonb;
    v_con     text;
    v_dia2    date;
    v_crea    bigint;
    v_g       text;
    v_fijo    jsonb;
begin
    select name, coalesce(nullif(bot_name, ''), 'Mia'),
           case when schedule ~ '^\s*\{' then schedule::jsonb else '{}'::jsonb end
      into v_negocio, v_bot, v_sched
      from public.companies where id = v_co;

    -- Ponderado: lo barato se pide más (un corte por cada pack).
    select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'price', k.price,
                                                 'dur', greatest(coalesce(nullif(k.duration_minutes, 0), 30), 15))), '[]'::jsonb)
      into v_items
      from public.catalog k
     cross join lateral generate_series(1, case when k.price <= 25 then 3 when k.price <= 40 then 2 else 1 end) w
     where k.company_id = v_co and k.is_active = 1 and k.price > 0 and k.name !~* '^zz'
       and coalesce(to_jsonb(k) ->> 'tipo', '') <> 'producto';
    if jsonb_array_length(v_items) = 0 then raise exception '% no tiene servicios activos con precio', v_co; end if;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb)
      into v_emps
      from public.employees where company_id = v_co and is_active = 1;

    for d in select g::date from generate_series(v_desde, v_hasta, interval '1 day') g loop
        v_k := pg_temp.r(3, 6) + case when extract(dow from d) in (5, 6) then 2 else 0 end;
        for v_j in 1 .. v_k loop
            v_n    := v_n + 1;
            v_lead := 'seed-bar-' || lpad(v_n::text, 4, '0');
            v_g    := case when random() < 0.88 then 'h' else 'm' end;
            v_nom  := pg_temp.nombre(v_g);
            v_pri  := split_part(v_nom, ' ', 1);
            v_t    := pg_temp.lima(d, pg_temp.r(8, 20), pg_temp.r(0, 59));
            -- A ellas, nada de barba.
            v_fijo := case when v_g = 'm' then (select e from jsonb_array_elements(v_items) e
                                                 where e ->> 'name' !~* 'barba' order by random() limit 1) end;
            perform pg_temp.lead(v_co, v_lead, '510001' || lpad(v_n::text, 6, '0'), v_nom, v_t);

            v_c := null;
            if random() < 0.68 then
                for v_i in 1 .. 4 loop
                    v_nc := v_nc + 1;
                    v_c := pg_temp.cita_barberia(v_co, 'seed-bar-c' || lpad(v_nc::text, 5, '0'), v_lead,
                                                 least(d + pg_temp.r(0, 3), v_hasta), v_t + 1800, v_t + pg_temp.r(240, 600),
                                                 v_items, v_emps, v_sched, v_fijo);
                    exit when v_c is not null;
                end loop;
            end if;

            if v_c is null then
                v_x := coalesce(v_fijo, v_items -> floor(random() * jsonb_array_length(v_items))::int);
                perform pg_temp.chat(v_lead, v_t, array[
                    'u|' || pg_temp.p(array['Hola, ¿cuánto está ' || lower(v_x ->> 'name') || '?',
                                            'Buenas, ¿qué precio tiene ' || lower(v_x ->> 'name') || '?',
                                            'Hola bro, ¿precio de ' || lower(v_x ->> 'name') || '?']),
                    'a|¡Hola ' || v_pri || '! Soy ' || v_bot || ' de ' || v_negocio || ' 💈 ' || (v_x ->> 'name')
                        || ' está ' || pg_temp.soles((v_x ->> 'price')::numeric) || '. ¿Te separo una hora?',
                    'u|' || pg_temp.p(array['Ok, lo veo y te aviso', 'Gracias, te escribo', 'Mmm ok, más tarde te confirmo',
                                            'Dale, luego te escribo']),
                    'a|Cuando quieras 🙌 Aquí estamos.']);
                update public.leads
                   set status = case when v_t < v_ahora - 7 * 86400 then pg_temp.p(array['dormant', 'dormant', 'lost', 'exploring'])
                                     else pg_temp.p(array['new', 'exploring', 'evaluating']) end,
                       intent = pg_temp.p(array['inquiry', 'quote', 'quote'])
                 where id = v_lead;
                continue;
            end if;

            v_con := case when v_c ->> 'barbero' <> '' then ' con ' || (v_c ->> 'barbero') else '' end;
            perform pg_temp.chat(v_lead, v_t, array[
                'u|' || pg_temp.p(array['Hola, buenas 👋', 'Hola, ¿tienen cupo?', 'Buenas, quería separar una cita',
                                        'Hola bro, ¿atienden con cita?', 'Buenas tardes, ¿hay espacio esta semana?']),
                'a|¡Hola ' || v_pri || '! Soy ' || v_bot || ' de ' || v_negocio || ' 💈 ¿Qué te gustaría hacerte?',
                'u|' || pg_temp.p(array[(v_c ->> 'servicio') || ' porfa', 'Quiero ' || lower(v_c ->> 'servicio'),
                                        lower(v_c ->> 'servicio') || ', ¿cuánto sale?']),
                'a|' || (v_c ->> 'servicio') || ' está ' || pg_temp.soles((v_c ->> 'precio')::numeric) || '. Tengo libre el '
                    || pg_temp.legible((v_c ->> 'dia')::date) || ' a las ' || (v_c ->> 'hora') || v_con || '. ¿Te la separo?',
                'u|' || pg_temp.p(array['Sí, dale', 'Ya, perfecto', 'Sí porfa 🙌', 'Listo, sepáralo']),
                'a|Listo ✅ Quedó tu cita: ' || (v_c ->> 'servicio') || ' el ' || pg_temp.legible((v_c ->> 'dia')::date)
                    || ' a las ' || (v_c ->> 'hora') || v_con || '. Te esperamos 🙌',
                'u|' || pg_temp.p(array['Gracias!', '👍', 'Gracias bro', 'Perfecto, nos vemos'])]);
            if v_c ->> 'metodo' in ('yape', 'plin') then
                perform pg_temp.chat(v_lead, (v_c ->> 'fin_ts')::bigint + 60, array[
                    'u|Listo, ya te ' || case when v_c ->> 'metodo' = 'yape' then 'yapeé' else 'pliné' end || ' 🙌',
                    'a|¡Recibido, gracias ' || v_pri || '! Vuelve pronto 💈']);
            end if;
            update public.leads
               set status = 'customer', intent = 'purchase_ready',
                   customer_notes = 'Viene por ' || lower(v_c ->> 'servicio')
                                    || case when v_con <> '' then '; lo atendió ' || (v_c ->> 'barbero') else '' end || '.'
             where id = v_lead;

            -- Los que vuelven: cada 2–4 semanas, mientras quede periodo.
            v_dia2 := (v_c ->> 'dia')::date + pg_temp.r(14, 28);
            while v_dia2 <= v_hasta and random() < 0.55 loop
                v_crea := pg_temp.lima(v_dia2 - pg_temp.r(0, 2), pg_temp.r(8, 19), pg_temp.r(0, 59));
                v_nc   := v_nc + 1;
                v_r    := pg_temp.cita_barberia(v_co, 'seed-bar-c' || lpad(v_nc::text, 5, '0'), v_lead, v_dia2,
                                                v_crea + 1800, v_crea + 300, v_items, v_emps, v_sched, v_c -> 'item');
                if v_r is null then
                    v_dia2 := v_dia2 + 1;
                    continue;
                end if;
                v_con := case when v_r ->> 'barbero' <> '' then ' con ' || (v_r ->> 'barbero') else '' end;
                perform pg_temp.chat(v_lead, v_crea, array[
                    'u|' || pg_temp.p(array['Hola, ¿me separas una hora?', 'Buenas! quiero repetir lo de la vez pasada',
                                            'Hola, ¿tienes espacio estos días?']),
                    'a|¡Hola de nuevo ' || v_pri || '! 🙌 ¿Lo de siempre, ' || lower(v_r ->> 'servicio') || '? Tengo el '
                        || pg_temp.legible((v_r ->> 'dia')::date) || ' a las ' || (v_r ->> 'hora') || v_con || '. ¿Te la separo?',
                    'u|' || pg_temp.p(array['Sí, dale', 'Perfecto', 'Ya 👍']),
                    'a|Listo ✅ Te esperamos el ' || pg_temp.legible((v_r ->> 'dia')::date) || ' a las ' || (v_r ->> 'hora') || '.']);
                if v_r ->> 'metodo' in ('yape', 'plin') then
                    perform pg_temp.chat(v_lead, (v_r ->> 'fin_ts')::bigint + 60, array[
                        'u|Ya te ' || case when v_r ->> 'metodo' = 'yape' then 'yapeé' else 'pliné' end,
                        'a|¡Recibido ✅ Gracias, ' || v_pri || '!']);
                end if;
                v_dia2 := v_dia2 + pg_temp.r(14, 28);
            end loop;
        end loop;
    end loop;
end $$;

-- ── 4 · kallpa ───────────────────────────────────────────────────────────────

do $$
declare
    v_co    constant text   := 'kallpa';
    v_desde constant date   := date '2026-10-01';
    v_hasta constant date   := date '2026-11-30';
    v_ahora constant bigint := extract(epoch from now())::bigint;
    v_negocio  text;
    v_bot      text;
    v_items    jsonb;
    d          date;
    v_k        int;
    v_j        int;
    v_n        int := 0;
    v_nc       int := 0;
    v_lead     text;
    v_nom      text;
    v_pri      text;
    v_ape      text;
    v_t        bigint;
    v_it       jsonb;
    v_fr       jsonb;
    v_horarios text;
    v_edad     int;
    v_g        text;
    v_nino     text;
    v_ni       text;
    v_oa       text;
    v_mes      date;
    v_c        jsonb;
    v_quiso    boolean;
    v_origen   text;
    v_pg       text;
    r          record;
begin
    select name, coalesce(nullif(bot_name, ''), 'Mia') into v_negocio, v_bot from public.companies where id = v_co;

    -- Solo lo que se inscribe: grupos con franjas.
    select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'price', k.price,
                                                 'vig', greatest(coalesce(k.vigencia_meses, 1), 1), 'franjas', f.fr)
                              order by k.sort_order, k.name), '[]'::jsonb)
      into v_items
      from public.catalog k
     cross join lateral (select case when k.schedule_slots ~ '^\s*\[' then k.schedule_slots::jsonb else '[]'::jsonb end as fr) f
     where k.company_id = v_co and k.is_active = 1 and k.price > 0 and jsonb_array_length(f.fr) > 0;
    if jsonb_array_length(v_items) = 0 then raise exception '% no tiene grupos activos con horarios', v_co; end if;

    for d in select g::date from generate_series(v_desde, v_hasta, interval '1 day') g loop
        v_k := pg_temp.r(2, 5) + case when extract(day from d) >= 24 or extract(day from d) <= 5 then 1 else 0 end;
        for v_j in 1 .. v_k loop
            v_n    := v_n + 1;
            v_lead := 'seed-kal-' || lpad(v_n::text, 4, '0');
            v_pg   := case when random() < 0.7 then 'm' else 'h' end;
            v_nom  := pg_temp.nombre(v_pg);
            v_pri  := split_part(v_nom, ' ', 1);
            v_ape  := split_part(v_nom, ' ', 2);
            v_t    := pg_temp.lima(d, pg_temp.r(7, 21), pg_temp.r(0, 59));
            v_it   := v_items -> floor(random() * jsonb_array_length(v_items))::int;
            v_fr   := (v_it -> 'franjas') -> floor(random() * jsonb_array_length(v_it -> 'franjas'))::int;
            select string_agg(f ->> 'label', ' · ') into v_horarios from jsonb_array_elements(v_it -> 'franjas') f;
            v_edad := case when v_it ->> 'name' ~* 'pollito|b[aá]sico' then pg_temp.r(4, 7)
                           when v_it ->> 'name' ~* 'delf|intermedio' then pg_temp.r(7, 11)
                           when v_it ->> 'name' ~* 'tibur|avanzado' then pg_temp.r(10, 15)
                           else pg_temp.r(5, 12) end;
            v_g    := case when random() < 0.5 then 'h' else 'm' end;
            v_ni   := split_part(pg_temp.nombre(v_g), ' ', 1);
            v_nino := v_ni || ' ' || v_ape;
            v_oa   := case when v_g = 'h' then 'o' else 'a' end;
            v_mes  := case when extract(day from d) <= 12 then date_trunc('month', d)::date
                           else (date_trunc('month', d) + interval '1 month')::date end;
            perform pg_temp.lead(v_co, v_lead, '510003' || lpad(v_n::text, 6, '0'), v_nom, v_t);

            v_quiso := random() < 0.55;
            v_c := null;
            if v_quiso then
                v_nc := v_nc + 1;
                v_c := pg_temp.inscribir(v_co, 'seed-kal-c' || lpad(v_nc::text, 5, '0'), v_lead, v_it, v_fr, v_mes,
                                         v_t + pg_temp.r(900, 3600), v_nino, v_edad::text);
            end if;

            if v_c is null then
                perform pg_temp.chat(v_lead, v_t, array[
                    'u|Hola, ¿qué horarios tienen para niños de ' || v_edad || ' años?',
                    'a|¡Hola ' || v_pri || '! 🏊 Soy ' || v_bot || ' de ' || v_negocio || '. Para ' || v_edad
                        || ' años va en ' || (v_it ->> 'name') || ': ' || v_horarios || '. La mensualidad es '
                        || pg_temp.soles((v_it ->> 'price')::numeric) || '.',
                    'u|' || case when v_quiso then '¿Hay cupo en ' || (v_fr ->> 'label') || '?'
                                 else pg_temp.p(array['Ok, lo converso en casa y te aviso', 'Gracias, te escribo la próxima semana',
                                                      'Ya, lo voy a pensar']) end,
                    'a|' || case when v_quiso then 'Ese grupo está lleno para ' || pg_temp.mes(v_mes)
                                                   || ' 🙏 Si se libera un cupo te aviso. ¿Te sirve otro horario?'
                                 else 'Claro 😊 Cuando quieras te separo un cupo.' end]);
                update public.leads
                   set status = case when v_quiso then 'evaluating'
                                     when v_t < v_ahora - 10 * 86400 then pg_temp.p(array['dormant', 'lost', 'exploring'])
                                     else pg_temp.p(array['new', 'exploring', 'evaluating']) end,
                       intent = pg_temp.p(array['inquiry', 'inquiry', 'quote'])
                 where id = v_lead;
                continue;
            end if;

            perform pg_temp.chat(v_lead, v_t, array[
                'u|' || pg_temp.p(array['Hola, buenas. Quería información de las clases de natación para mi '
                                            || case when v_g = 'h' then 'hijo' else 'hija' end || ' de ' || v_edad || ' años',
                                        'Hola! ¿Tienen clases para niños de ' || v_edad || ' años?',
                                        'Buenas, ¿cuánto cuesta la mensualidad? Es para mi '
                                            || case when v_g = 'h' then 'hijo' else 'hija' end || ' de ' || v_edad]),
                'a|¡Hola ' || v_pri || '! 🏊 Soy ' || v_bot || ' de ' || v_negocio || '. Para ' || v_edad
                    || ' años le corresponde ' || (v_it ->> 'name') || '. La mensualidad es '
                    || pg_temp.soles((v_it ->> 'price')::numeric) || '. Horarios: ' || v_horarios || '.',
                'u|' || pg_temp.p(array['¿Hay cupo en ' || (v_fr ->> 'label') || '?', 'El de ' || (v_fr ->> 'label') || ' me queda bien',
                                        'Me interesa ' || (v_fr ->> 'label')]),
                'a|¡Sí, hay cupo! 🙌 ¿Me pasas el nombre del alumno para inscribirl' || v_oa || '?',
                'u|' || v_nino,
                'a|Perfecto. Para separar el cupo de ' || (v_c ->> 'periodo') || ' puedes yapear al número del negocio y mandarme la captura 📸']);
            if v_c ->> 'estado' = 'cancelled' then
                perform pg_temp.chat(v_lead, v_t + 3600, array[
                    'u|Al final no vamos a poder este mes, disculpa 🙏',
                    'a|No te preocupes, ' || v_pri || '. Cuando quieras retomamos 🙌']);
                update public.leads set status = 'evaluating', intent = 'purchase_ready' where id = v_lead;
                continue;
            end if;
            if (v_c ->> 'monto')::numeric < (v_c ->> 'precio')::numeric then
                perform pg_temp.chat(v_lead, v_t + 1200, array[
                    'u|Te adelanto ' || pg_temp.soles((v_c ->> 'monto')::numeric) || ' y el resto la próxima semana, ¿se puede?',
                    'a|Claro 🙌 Con eso ya separamos el cupo de ' || v_ni || '. Quedan '
                        || pg_temp.soles((v_c ->> 'precio')::numeric - (v_c ->> 'monto')::numeric) || ' por pagar.']);
            else
                perform pg_temp.chat(v_lead, v_t + 1200, array[
                    'u|' || pg_temp.p(array['Listo, ya pagué', 'Ahí va la captura', 'Ya te yapeé 🙌']),
                    'a|¡Pago recibido ✅! ' || v_ni || ' queda inscrit' || v_oa || ' en ' || (v_it ->> 'name') || ' ('
                        || (v_fr ->> 'label') || ') para ' || (v_c ->> 'periodo') || '. ¡L' || v_oa || ' esperamos!']);
            end if;
            update public.leads
               set status = 'customer', intent = 'purchase_ready',
                   customer_notes = case when v_pg = 'm' then 'Mamá' else 'Papá' end || ' de ' || v_nino || ' (' || v_edad
                                    || ' años). ' || (v_it ->> 'name') || ', ' || (v_fr ->> 'label') || '.'
             where id = v_lead;
        end loop;
    end loop;

    -- Renovaciones al mes siguiente, mismo grupo y horario. Dos pasadas: la de
    -- noviembre ya ve las renovaciones de octubre.
    foreach v_origen in array array['2026-10-01', '2026-11-01'] loop
        for r in select a.id, a.lead_id, a.slot_start, a.beneficiario, a.beneficiario_edad, a.periodo_desde, l.name as lead_name
                   from public.appointments a
                   join public.leads l on l.id = a.lead_id
                  where a.id like 'seed-kal-c%' and a.status = 'confirmed' and a.periodo_desde = v_origen
                    and a.periodo_hasta = to_char((v_origen::date + interval '1 month' - interval '1 day')::date, 'YYYY-MM-DD')
                  order by a.id loop
            v_mes := (r.periodo_desde::date + interval '1 month')::date;
            continue when exists (select 1 from public.appointments x
                                   where x.lead_id = r.lead_id and x.slot_start = r.slot_start
                                     and x.periodo_desde = to_char(v_mes, 'YYYY-MM-DD'));
            continue when random() > 0.7;
            select e into v_it from jsonb_array_elements(v_items) e where e ->> 'id' = split_part(r.slot_start, ':', 2);
            continue when v_it is null;
            select f into v_fr from jsonb_array_elements(v_it -> 'franjas') f where f ->> 'id' = split_part(r.slot_start, ':', 3);
            continue when v_fr is null;
            v_t := pg_temp.lima(v_mes - pg_temp.r(1, 7), pg_temp.r(8, 20), pg_temp.r(0, 59));
            continue when v_t > pg_temp.lima(v_hasta, 23, 0);
            v_nc := v_nc + 1;
            v_c  := pg_temp.inscribir(v_co, 'seed-kal-c' || lpad(v_nc::text, 5, '0'), r.lead_id, v_it, v_fr, v_mes,
                                      v_t + pg_temp.r(600, 2400), r.beneficiario, r.beneficiario_edad);
            continue when v_c is null or v_c ->> 'estado' <> 'confirmed';
            v_pri := split_part(r.lead_name, ' ', 1);
            v_ni  := split_part(r.beneficiario, ' ', 1);
            perform pg_temp.chat(r.lead_id, v_t, array[
                'u|Hola, quiero renovar a ' || v_ni || ' para ' || pg_temp.mes(v_mes) || ' 🙌',
                'a|¡Hola ' || v_pri || '! Claro, mismo horario (' || (v_fr ->> 'label') || '), '
                    || pg_temp.soles((v_it ->> 'price')::numeric) || '. Me mandas la captura cuando puedas.',
                'u|Listo, ahí va',
                'a|' || case when (v_c ->> 'monto')::numeric < (v_c ->> 'precio')::numeric
                             then 'Recibido ✅ Quedan ' || pg_temp.soles((v_c ->> 'precio')::numeric - (v_c ->> 'monto')::numeric)
                                  || ' por pagar; el cupo de ' || v_ni || ' ya está separado.'
                             else '¡Renovado ✅! ' || v_ni || ' sigue en ' || (v_it ->> 'name') || ' en ' || pg_temp.mes(v_mes) || '.' end]);
        end loop;
    end loop;
end $$;

-- ── 5 · piel-futbolera ───────────────────────────────────────────────────────

do $$
declare
    v_co    constant text   := 'piel-futbolera';
    v_desde constant date   := date '2026-10-01';
    v_hasta constant date   := date '2026-11-30';
    v_ahora constant bigint := extract(epoch from now())::bigint;
    v_negocio text;
    v_bot     text;
    v_items   jsonb;
    d         date;
    v_k       int;
    v_j       int;
    v_n       int := 0;
    v_lead    text;
    v_nom     text;
    v_pri     text;
    v_t       bigint;
    v_o       jsonb;
    v_x       jsonb;
    v_lista   text;
    v_q       int;
    v_cierre  text[];
begin
    select name, coalesce(nullif(bot_name, ''), 'Mia') into v_negocio, v_bot from public.companies where id = v_co;

    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price) order by sort_order, name), '[]'::jsonb)
      into v_items
      from public.catalog
     where company_id = v_co and is_active = 1 and price > 0 and name !~* '^producto de ejemplo';
    if jsonb_array_length(v_items) = 0 then raise exception '% no tiene productos activos con precio', v_co; end if;

    for d in select g::date from generate_series(v_desde, v_hasta, interval '1 day') g loop
        v_k := pg_temp.r(4, 8) + case when extract(dow from d) in (0, 5, 6) then 2 else 0 end;
        for v_j in 1 .. v_k loop
            v_n    := v_n + 1;
            v_lead := 'seed-pf-' || lpad(v_n::text, 4, '0');
            v_nom  := pg_temp.nombre(case when random() < 0.8 then 'h' else 'm' end);
            v_pri  := split_part(v_nom, ' ', 1);
            v_t    := pg_temp.lima(d, pg_temp.r(8, 22), pg_temp.r(0, 59));
            perform pg_temp.lead(v_co, v_lead, '510002' || lpad(v_n::text, 6, '0'), v_nom, v_t);

            if random() >= 0.45 then
                v_x := v_items -> floor(random() * jsonb_array_length(v_items))::int;
                select string_agg(e ->> 'name', ', ') into v_lista
                  from (select e from jsonb_array_elements(v_items) e order by random() limit 3) s;
                v_q := pg_temp.r(1, 3);
                perform pg_temp.chat(v_lead, v_t, array[
                    'u|' || case v_q when 1 then '¿Cuánto está la ' || (v_x ->> 'name') || '?'
                                     when 2 then 'Hola, ¿qué camisetas tienen disponibles?'
                                     else '¿Tienen la de Sporting Cristal?' end,
                    'a|' || case v_q when 1 then '¡Hola ' || v_pri || '! ⚽ La ' || (v_x ->> 'name') || ' está '
                                                 || pg_temp.soles((v_x ->> 'price')::numeric) || '. ¿Qué talla buscas?'
                                     when 2 then '¡Hola ' || v_pri || '! ⚽ Ahora tenemos: ' || v_lista || '. ¿Cuál te interesa?'
                                     else 'Por ahora no tenemos de Cristal 🙏 Pero sí: ' || v_lista || '. ¿Te muestro alguna?' end,
                    'u|' || pg_temp.p(array['Ok, lo pienso', 'Gracias, te aviso', 'Voy a juntar plata y te escribo 😅', 'Ok 👍']),
                    'a|Dale, aquí estamos ⚽']);
                update public.leads
                   set status = case when v_t < v_ahora - 7 * 86400 then pg_temp.p(array['dormant', 'dormant', 'lost', 'exploring'])
                                     else pg_temp.p(array['new', 'exploring', 'evaluating', 'ready']) end,
                       intent = pg_temp.p(array['inquiry', 'quote', 'quote'])
                 where id = v_lead;
                continue;
            end if;

            v_o := pg_temp.pedido_piel(v_co, 'seed-pf-o' || lpad(v_n::text, 4, '0'), v_lead, v_t + pg_temp.r(900, 3600), v_items);
            v_cierre := case
                when v_o ->> 'estado' = 'cancelled' then array[
                    'u|Disculpa, al final ya no la voy a llevar 🙏',
                    'a|No te preocupes, cuando quieras aquí estamos ⚽']
                when v_o ->> 'metodo' in ('yape', 'plin') then array[
                    'u|' || case when v_o ->> 'metodo' = 'yape' then 'Yape' else 'Plin' end,
                    'a|Perfecto, envíame la captura cuando hagas el pago 📸',
                    'u|Listo, ahí va la captura',
                    'a|¡Pago verificado ✅! ' || case when v_o ->> 'entrega' = 'delivery'
                                                      then 'Tu pedido sale el ' || pg_temp.legible((v_o ->> 'dia')::date)
                                                      else 'Puedes recogerlo desde el ' || pg_temp.legible((v_o ->> 'dia')::date) end
                        || '. Gracias por comprar en ' || v_negocio || ' ⚽']
                when v_o ->> 'metodo' = 'cod' then array[
                    'u|Contraentrega mejor',
                    'a|¡Listo ✅! Pagas al recibir. Te llega el ' || pg_temp.legible((v_o ->> 'dia')::date) || '.']
                else array[
                    'u|Pago en efectivo cuando la recoja',
                    'a|¡Listo ✅! Te la separamos; puedes recogerla desde el ' || pg_temp.legible((v_o ->> 'dia')::date) || '.']
                end;
            perform pg_temp.chat(v_lead, v_t, array[
                'u|' || pg_temp.p(array['Hola, ¿tienen la ' || (v_o ->> 'primero') || '?',
                                        'Buenas! ¿Precio de la ' || (v_o ->> 'primero') || '?',
                                        'Hola, vi la ' || (v_o ->> 'primero') || ' en su Instagram, ¿hay talla ' || (v_o ->> 'talla1') || '?']),
                'a|¡Hola ' || v_pri || '! ⚽ Sí, la ' || (v_o ->> 'primero') || ' está '
                    || pg_temp.soles((v_o ->> 'precio1')::numeric) || '. ¿Qué talla buscas?',
                'u|Talla ' || (v_o ->> 'talla1') || pg_temp.p(array['', ' porfa', ' 🙌']),
                'a|Talla ' || (v_o ->> 'talla1') || ' disponible ✅ ¿Te la enviamos a domicilio o la recoges?',
                'u|' || case when v_o ->> 'entrega' = 'delivery' then 'Delivery a ' || (v_o ->> 'distrito') else 'Paso a recogerla' end,
                'a|Listo. Tu pedido: ' || (v_o ->> 'resumen') || '. Total ' || pg_temp.soles((v_o ->> 'total')::numeric)
                    || '. Puedes pagar con Yape o Plin' || case when v_o ->> 'entrega' = 'delivery' then ', o contraentrega' else '' end || '.']
                || v_cierre);
            update public.leads
               set status = case when v_o ->> 'estado' = 'cancelled' then 'lost' else 'customer' end,
                   intent = 'purchase_ready',
                   customer_address = coalesce(v_o ->> 'dir', ''),
                   customer_notes = 'Pidió ' || (v_o ->> 'resumen') || '.'
             where id = v_lead;
        end loop;
    end loop;
end $$;

-- ── 6 · Avisos encendidos otra vez ───────────────────────────────────────────

do $$
declare
    t record;
begin
    for t in select c.relname, g.tgname
               from pg_trigger g
               join pg_class c on c.oid = g.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and g.tgname in ('avisos_cita', 'avisos_pedido', 'avisos_pago') loop
        execute format('alter table public.%I enable trigger %I', t.relname, t.tgname);
    end loop;
end $$;

drop function pg_temp.pedido_piel(text, text, text, bigint, jsonb);
drop function pg_temp.inscribir(text, text, text, jsonb, jsonb, date, bigint, text, text);
drop function pg_temp.cita_barberia(text, text, text, date, bigint, bigint, jsonb, jsonb, jsonb, jsonb);
drop function pg_temp.chat(text, bigint, text[]);
drop function pg_temp.lead(text, text, text, text, bigint);
drop function pg_temp.nombre(text);
drop function pg_temp.legible(date);
drop function pg_temp.mes(date);
drop function pg_temp.soles(numeric);
drop function pg_temp.lima(date, int, int);
drop function pg_temp.p(text[]);
drop function pg_temp.r(int, int);

commit;

-- ── 7 · Lo que quedó ─────────────────────────────────────────────────────────

select c.id as negocio,
       (select count(*) from public.leads l where l.company_id = c.id and l.id like 'seed-%')                 as leads,
       (select count(*) from public.messages m join public.leads l on l.id = m.lead_id
         where l.company_id = c.id and l.id like 'seed-%')                                                      as mensajes,
       (select count(*) from public.appointments a where a.company_id = c.id and a.id like 'seed-%')          as citas,
       (select count(*) from public.orders o where o.company_id = c.id and o.id like 'seed-%')                as pedidos,
       (select coalesce(sum(amount), 0) from public.pending_payments p where p.company_id = c.id and p.id like 'seed-%') as pagos_con_importe,
       (select coalesce(sum(importe), 0) from public.v_movimientos v
         where v.company_id = c.id and v.movimiento_id like 'seed-%' and v.cuenta_ingreso)                      as ingresos
  from public.companies c
 where c.id in ('barberia-01', 'kallpa', 'piel-futbolera')
 order by c.id;
