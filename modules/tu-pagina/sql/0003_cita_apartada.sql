-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0003: la cita apartada deja de ocupar a las 24 h
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- El bot (19-oct-2026) ya implementa «Requerir pago para confirmar» en citas puntuales:
-- la cita nace `pending_payment` y OCUPA su hora 24 h desde `created_at`
-- (PAGO_CADUCA_HORAS); pasado el plazo deja de ocupar y la fila no se toca. Hasta hoy
-- la página contaba toda `pending_payment` como ocupada, para siempre: una cita
-- apartada y nunca pagada bloqueaba esa hora en la página de por vida.
--
-- Dos funciones de la 0002 (ya aplicada), copiadas sin más cambio que esa condición:
--   · tu_pagina_srv_datos: las citas que la página pinta como ocupadas.
--   · reserva_srv_crear:   la reserva de un negocio cuya agenda aún lleva el bot.
-- La misma regla vive en public.v2_ocupa_hora (modules/datos/sql/0004) para la agenda
-- en la nube, y en lib/panel/adelantos.ts para el panel.
--
-- Idempotente (create or replace); los permisos de la 0002 se conservan.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

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
                 or (a.slot_start >= v_hoy and (a.status in ('confirmed', 'completed') or (a.status = 'pending_payment' and a.created_at > extract(epoch from now() - interval '24 hours')))))), '[]'::jsonb),
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
               and (a.status in ('confirmed', 'completed') or (a.status = 'pending_payment' and a.created_at > extract(epoch from now() - interval '24 hours')))
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
                       and (a.status in ('confirmed', 'completed') or (a.status = 'pending_payment' and a.created_at > extract(epoch from now() - interval '24 hours')))
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

commit;
