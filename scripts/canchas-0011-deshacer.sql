-- ═══════════════════════════════════════════════════════════════════════════════
-- Deshacer modules/tu-pagina/sql/0011_canchas_y_avisame.sql
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Devuelve las cinco funciones que la 0011 rehízo a su versión anterior (copiadas de
-- modules/datos/sql/0004 y modules/tu-pagina/sql/0003) y borra lo nuevo. Las reservas
-- de canchas que ya se hicieron se quedan en la agenda como citas normales.
-- ⚠️ Borra la lista de «Avísame», los turnos fijos y el registro de consumos (las
-- líneas de consumo siguen en las reservas, pero ya no se pueden quitar devolviendo stock).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

drop trigger if exists avisos_cancha_libre on public.appointments;

create or replace function public.v2_aforo(p_company text, p_momento text, p_paso integer, p_empleado text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
    v_h     jsonb;
    v_clave text := public.v2_clave_dia(left(p_momento, 10));
    v_min   integer := public.v2_min(substr(p_momento, 12, 5));
    v_fin   text := public.tu_pagina_sumar_min(p_momento, p_paso);
    v_dia   jsonb;
    n       integer;
begin
    select public.v2_json(schedule) into v_h from public.companies where id = p_company;
    if coalesce(p_empleado, '') <> '' then
        select count(*) into n from public.employees e
         where e.company_id = p_company and e.id = p_empleado and coalesce(e.is_active, 1) = 1
           and public.v2_en_turno(e.schedule, v_h, v_clave, v_min)
           and not exists (select 1 from public.employee_blocks b
                            where b.company_id = p_company and b.employee_id = e.id and b.start < v_fin and b."end" > p_momento);
        return least(n, 1);
    end if;
    if exists (select 1 from public.employees e where e.company_id = p_company and coalesce(e.is_active, 1) = 1) then
        select count(*) into n from public.employees e
         where e.company_id = p_company and coalesce(e.is_active, 1) = 1
           and public.v2_en_turno(e.schedule, v_h, v_clave, v_min)
           and not exists (select 1 from public.employee_blocks b
                            where b.company_id = p_company and b.employee_id = e.id and b.start < v_fin and b."end" > p_momento);
        return n;
    end if;
    -- Sin equipo, manda la silla del día.
    v_dia := v_h -> v_clave;
    if not public.v2_en_turno('', v_h, v_clave, v_min) then return 0; end if;
    return coalesce((v_dia->>'capacity')::integer, 1);
end $$;

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

create or replace function public.agenda_srv_reservar(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag    public.tu_pagina;
    v_item   public.catalog;
    v_lead   public.leads;
    v_cita   public.appointments;
    v_lead_id text;
    v_tipo   text := p_datos->>'tipo';
    v_ini    text := p_datos->>'slot_start';
    v_emp    text := coalesce(p_datos->>'employee_id', '');
    v_hoy    text := left(public.v2_ahora(), 10);
    v_span   integer;
    v_motivo text;
    v_franja jsonb;
    v_cap    integer;
    v_n      integer;
    v_per    record;
    v_estado text;
    v_cod    text;
    v_ya     public.pagina_idem;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'reservar')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.agenda_en_nube(v_pag.company_id) then return jsonb_build_object('status', 'no_es_nube'); end if;

    select * into v_ya from public.pagina_idem where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_ya.codigo, 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    select * into v_item from public.catalog
     where company_id = v_pag.company_id and id = p_datos->>'catalog_id' and coalesce(is_active, 1) = 1;
    if not found then return jsonb_build_object('status', 'no_existe'); end if;

    begin
        select l.lead_id into v_lead_id from public.v2_lead(v_pag.company_id, p_datos->>'telefono', p_datos->>'nombre', 'web') l;
        select * into v_lead from public.leads where id = v_lead_id;
    exception when sqlstate '22023' then
        return jsonb_build_object('status', 'datos_invalidos');
    end;

    if (select count(*) from public.appointments where company_id = v_pag.company_id and lead_id = v_lead.id
          and status in ('confirmed', 'pending_payment') and created_at > extract(epoch from now() - interval '1 day')) >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    if v_tipo = 'cita' then
        if v_ini !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        if v_ini <= public.v2_ahora() then return jsonb_build_object('status', 'pasada'); end if;
        v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = v_pag.company_id), 60);
        v_motivo := public.v2_hueco(v_pag.company_id, v_ini, v_span, v_emp);
        if v_motivo is not null then return jsonb_build_object('status', 'lleno', 'motivo', v_motivo); end if;
        -- «Requerir pago para confirmar» y un servicio con precio: la cita queda APARTADA, ocupando su
        -- hora 24 h (v2_ocupa_hora) hasta que llegue el comprobante. Igual que book_appointment del bot.
        v_estado := case when coalesce(v_item.price, 0) > 0
                          and (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, beneficiario)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, public.tu_pagina_sumar_min(v_ini, v_span), v_span,
                v_emp, v_estado, btrim(coalesce(p_datos->>'beneficiario', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);

    elsif v_tipo = 'grupo' then
        if v_ini not like 'sched:' || v_item.id || ':%' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        select f into v_franja from jsonb_array_elements(public.v2_franjas(v_item.schedule_slots)) f
         where f->>'id' = split_part(v_ini, ':', 3) limit 1;
        if v_franja is null then return jsonb_build_object('status', 'no_existe'); end if;
        select * into v_per from public.v2_periodo(v_hoy, v_franja->>'start_date', coalesce(v_item.vigencia_meses, 1));
        v_cap := coalesce((v_franja->>'capacity')::integer, -1);
        if v_cap <> -1 then
            -- Ocupan su plaza los confirmados de ese periodo y, desde la página, también los que la
            -- apartaron sin pagar aún (ante la duda, lleno).
            select count(*) into v_n from public.appointments o
             where o.company_id = v_pag.company_id and o.slot_start = v_ini
               and (o.status = 'confirmed' or (o.status = 'pending_payment' and (coalesce(o.periodo_hasta, '') = '' or o.periodo_hasta >= v_hoy)))
               and (coalesce(o.periodo_desde, '') = '' or (o.periodo_desde <= v_per.hasta and o.periodo_hasta >= v_per.desde));
            if v_n >= v_cap then return jsonb_build_object('status', 'lleno'); end if;
        end if;
        v_estado := case when (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, periodo_desde, periodo_hasta)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, '', 60, '', v_estado,
                btrim(coalesce(p_datos->>'beneficiario', '')), v_per.desde, v_per.hasta)
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, coalesce(v_item.price, 0), 0, 0);
    else
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    loop
        v_cod := public.envio_codigo('R');
        exit when not exists (select 1 from public.pagina_idem where company_id = v_pag.company_id and codigo = v_cod);
    end loop;
    insert into public.pagina_idem (company_id, idem, codigo, ref_id) values (v_pag.company_id, p_idem, v_cod, v_cita.id);
    return jsonb_build_object('status', 'ok', 'codigo', v_cod, 'servicio', v_item.name, 'precio', v_item.price,
                              'estado', v_cita.status, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation or invalid_datetime_format then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

create or replace function public.agenda_crear_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_slot   text := coalesce(p_datos->>'slot_start', '');
    v_item   public.catalog;
    v_emp    public.employees;
    v_lead   public.leads;
    v_lead_id text;
    v_nuevo  boolean := false;
    v_span   integer;
    v_fin    text;
    v_motivo text;
    v_cita   public.appointments;
    v_dup    boolean := false;
    v_msg    text;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    if v_slot <= public.v2_ahora() then raise exception '% ya pasó: elige un horario futuro', v_slot; end if;
    select * into v_item from public.catalog where company_id = p_company and id = p_datos->>'catalog_item_id';
    if not found then raise exception 'Elige un servicio: una cita sin servicio entra en los ingresos como S/ 0'; end if;
    if jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0 then
        raise exception '% es un grupo con horarios fijos: se inscribe, no se agenda por hora', v_item.name;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    if coalesce(p_datos->>'lead_id', '') <> '' then
        select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
        if not found then raise exception 'Ese cliente no es de este negocio.'; end if;
        if v_lead.name = '' and btrim(coalesce(p_datos->>'nombre', '')) <> '' then
            update public.leads set name = left(btrim(p_datos->>'nombre'), 120) where id = v_lead.id returning * into v_lead;
        end if;
    else
        select l.lead_id, l.nuevo into v_lead_id, v_nuevo from public.v2_lead(p_company, p_datos->>'telefono', p_datos->>'nombre', 'panel') l;
        select * into v_lead from public.leads where id = v_lead_id;
    end if;

    if coalesce(p_datos->>'employee_id', '') <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    end if;

    v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_fin  := public.tu_pagina_sumar_min(v_slot, v_span);

    select * into v_cita from public.appointments a
     where a.company_id = p_company and a.lead_id = v_lead.id and a.status <> 'completed' and public.v2_ocupa_hora(a.status, a.created_at)
       and a.slot_start < v_fin and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > v_slot
     limit 1;
    if found then
        v_dup := true;
    else
        v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''));
        if v_motivo is not null then raise exception '%', v_motivo; end if;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, beneficiario_edad)
        values (gen_random_uuid()::text, p_company, v_lead.id, v_item.name, v_slot, v_fin, v_span, coalesce(v_emp.id, ''), 'confirmed',
                btrim(coalesce(p_datos->>'beneficiario', '')), btrim(coalesce(p_datos->>'beneficiario_edad', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, p_company, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);
    end if;

    v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Te dejé agendada tu cita de ' || v_item.name || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?';
    return jsonb_build_object(
        'id', v_cita.id, 'lead_id', v_lead.id, 'cliente_nuevo', v_nuevo, 'duplicada', v_dup,
        'slot_start', v_cita.slot_start, 'slot_minutes', v_cita.slot_minutes, 'employee_id', v_cita.employee_id,
        'service', v_cita.service, 'precio', coalesce(v_item.price, 0), 'estado', v_cita.status,
        'mensaje', v_msg, 'wa_link', public.v2_wa(v_lead.phone, v_msg));
end $$;

create or replace function public.agenda_modificar_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_acc    text := coalesce(p_datos->>'accion', '');
    v_cita   public.appointments;
    v_lead   public.leads;
    v_emp    public.employees;
    v_slot   text;
    v_span   integer;
    v_motivo text;
    v_msg    text;
    v_rec    boolean;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_acc not in ('cancelar', 'mover', 'reasignar') then raise exception 'accion debe ser cancelar, mover o reasignar'; end if;
    select * into v_cita from public.appointments where company_id = p_company and id = p_datos->>'id';
    if not found then raise exception 'Esa cita no existe en este negocio.'; end if;
    if v_cita.status = 'cancelled' then raise exception 'esa cita ya estaba cancelada'; end if;
    select * into v_lead from public.leads where id = v_cita.lead_id;
    v_rec := v_cita.slot_start like 'sched:%';
    if v_rec and v_acc <> 'cancelar' then
        raise exception 'una inscripción a un grupo no se mueve ni se reasigna: cancélala y vuelve a inscribir';
    end if;

    if v_acc = 'cancelar' then
        update public.appointments set status = 'cancelled' where id = v_cita.id;
        update public.leads set pending_slot = '', booking_draft = '' where id = v_cita.lead_id;
        v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Tuvimos que cancelar tu reserva de ' || v_cita.service
                 || case when v_rec then '' else ' del ' || substr(public.v2_fecha_legible(v_cita.slot_start), 4) end || '. ¿Te busco otro horario?';
        return jsonb_build_object('id', v_cita.id, 'accion', 'cancelar', 'antes', v_cita.status, 'ahora', 'cancelled',
            'libera', case when v_rec then 'una plaza del grupo' else 'el horario' end,
            'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
    end if;

    if coalesce(nullif(v_cita.slot_end, ''), public.tu_pagina_sumar_min(v_cita.slot_start, v_cita.slot_minutes)) <= public.v2_ahora() then
        raise exception 'esa cita ya pasó: es historial. Si el cliente vuelve, se le agenda una nueva';
    end if;
    v_slot := coalesce(nullif(p_datos->>'slot_start', ''), v_cita.slot_start);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    if v_slot <= public.v2_ahora() then raise exception '% ya pasó: elige un horario futuro', v_slot; end if;

    if v_acc = 'reasignar' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    elsif v_cita.employee_id <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = v_cita.employee_id;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    v_span := coalesce(nullif(v_cita.slot_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''), v_cita.id);
    if v_motivo is not null then raise exception '%', v_motivo; end if;

    update public.appointments
       set slot_start = v_slot, slot_end = public.tu_pagina_sumar_min(v_slot, v_span), slot_minutes = v_span, employee_id = coalesce(v_emp.id, '')
     where id = v_cita.id;

    v_msg := case when v_acc = 'mover'
        then 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Movimos tu cita de ' || v_cita.service || ' a '
             || substr(public.v2_fecha_legible(v_slot), 4) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?'
        else 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Tu cita de ' || v_cita.service || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5) || ' la atenderá ' || v_emp.name || '. ¿Te parece bien?'
        end;
    return jsonb_build_object('id', v_cita.id, 'accion', v_acc,
        'antes', jsonb_build_object('slot_start', v_cita.slot_start, 'employee_id', v_cita.employee_id),
        'ahora', jsonb_build_object('slot_start', v_slot, 'employee_id', coalesce(v_emp.id, '')),
        'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
end $$;

drop function if exists public.avisos_tg_cancha_libre();
drop function if exists public.agenda_consumo(text, jsonb);
drop function if exists public.canchas_fija_renovar(text, uuid, integer);
drop function if exists public.canchas_fija_cancelar(text, uuid);
drop function if exists public.canchas_fijas_panel(text);
drop function if exists public.v2_crear_cancha(text, public.catalog, public.leads, boolean, text, jsonb);
drop function if exists public.v2_cancha_semanas(text, public.catalog, text, uuid, text, integer, integer);
drop function if exists public.v2_dias_plural(text);
drop function if exists public.avisame_borrar(text, uuid);
drop function if exists public.avisame_marcar(text, uuid, boolean);
drop function if exists public.avisame_panel(text);
drop function if exists public.avisame_srv_crear(text, jsonb);
drop function if exists public.v2_cancha_soltar_vencidas(text, text, text, text);
drop function if exists public.v2_cancha_motivo(text, text, text, integer, text);
drop function if exists public.v2_cancha_ocupada(text, text, text, text, text);
drop function if exists public.v2_precio_cancha(jsonb, text, numeric, integer, text, integer);
drop function if exists public.v2_cancha_plazo(jsonb);
drop function if exists public.v2_es_cancha(text, text);
drop function if exists public.v2_canchas_cfg(text);
drop function if exists public.v2_en_turno_el(text, jsonb, text, integer);
drop function if exists public.v2_dia_que_cubre(jsonb, text, integer);
drop function if exists public.v2_tramo(jsonb);
drop table if exists public.cita_consumos;
drop table if exists public.canchas_fijas_citas;
drop table if exists public.canchas_fijas;
drop table if exists public.pagina_avisame;

commit;
