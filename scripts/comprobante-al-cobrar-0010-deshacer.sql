-- ═══════════════════════════════════════════════════════════════════════════════
-- Deshace modules/datos/sql/0010_comprobante_al_cobrar.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Vuelve a dejar los tres cobros del panel como estaban (copiados tal cual de la 0005, la 0004 y
-- la 0018) y quita las funciones nuevas. Las tablas cobro_ajustes y comprobantes_cobro se QUEDAN:
-- tienen las fotos de cobros que ya entraron en la caja. Los pagos tampoco se tocan.
-- El panel, sin las funciones nuevas, vuelve solo a lo de antes: foto únicamente en canchas.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── agenda_registrar_pago, la de la 0005 ──
create or replace function public.agenda_registrar_pago(p_company text, p_datos jsonb, p_op text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_lead     public.leads;
    v_monto    numeric;
    v_metodo   text := btrim(coalesce(nullif(p_datos->>'metodo_pago', ''), 'cash'));
    v_op       text := 'panel:' || coalesce(nullif(p_op, ''), gen_random_uuid()::text);
    v_hoy      text := left(public.v2_ahora(), 10);
    v_dest     public.appointments;
    v_total    numeric := 0;
    v_pagado   numeric := 0;
    v_desde    bigint;
    a          public.appointments;
    v_item     public.catalog;
    v_franja   jsonb;
    v_cap      integer;
    v_n        integer;
    v_conf     integer := 0;
    v_llenos   text[] := '{}';
    v_ids      text[];
    v_motivo   text;
    v_confirma boolean := false;
begin
    perform public.v2_autorizar_agenda(p_company);
    select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
    if not found then raise exception 'Ese cliente no es de este negocio.'; end if;
    begin
        v_monto := (p_datos->>'monto')::numeric;
    exception when others then
        v_monto := null;
    end;
    if v_monto is null or v_monto <= 0 then raise exception 'monto inválido: es el importe cobrado, un número mayor que 0'; end if;
    if v_metodo not in ('yape', 'plin', 'bank_transfer', 'cash', 'cod') then
        raise exception 'metodo_pago inválido: "%". Valores: yape · plin · bank_transfer · cash · cod', v_metodo;
    end if;
    if exists (select 1 from public.pending_payments where operation_id = v_op) then
        return jsonb_build_object('lead_id', v_lead.id, 'monto', v_monto, 'metodo_pago', v_metodo, 'duplicado', true);
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    -- ── Una CITA PUNTUAL (19-oct-2026): la seña o el resto, en efectivo o como sea ──────────
    -- El pago queda en la cita, como el voucher del bot. Con lo pagado cubriendo el total de sus
    -- líneas, pagado_por = 'panel' (cobrada); si no, sigue «por cobrar». Una apartada
    -- (pending_payment) se confirma con cualquier pago, revalidando su hora: si ya no está libre,
    -- falla SIN registrar nada, igual que marcar_pagado.
    if coalesce(p_datos->>'appointment_id', '') <> '' then
        select * into v_dest from public.appointments
         where company_id = p_company and id = p_datos->>'appointment_id' and lead_id = v_lead.id;
        if not found then raise exception 'esa cita no es de este cliente'; end if;
        if v_dest.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
            if v_dest.status not in ('confirmed', 'pending_payment', 'completed') then
                raise exception 'esa cita está cancelada o no vino: no se le registra un pago';
            end if;
            if coalesce(v_dest.pagado_por, '') <> '' then
                raise exception 'esa cita ya consta cobrada entera';
            end if;
            if v_dest.status = 'pending_payment' then
                v_motivo := public.v2_hueco(p_company, v_dest.slot_start, v_dest.slot_minutes, v_dest.employee_id, v_dest.id);
                if v_motivo is not null then
                    raise exception 'no se puede confirmar: %. Muévela a otra hora y registra el pago', v_motivo;
                end if;
                v_confirma := true;
            end if;

            insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, order_id, appointment_id)
            values (gen_random_uuid()::text, v_lead.id, p_company, v_monto, v_op, 1, '', v_dest.id);
            select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_dest.id;
            select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
             where p.company_id = p_company and p.appointment_id = v_dest.id;
            update public.appointments
               set metodo_pago = v_metodo,
                   status      = case when v_confirma then 'confirmed' else status end,
                   pagado_por  = case when v_total > 0 and v_pagado >= v_total then 'panel' else pagado_por end
             where id = v_dest.id;

            return jsonb_build_object('lead_id', v_lead.id, 'monto', v_monto, 'metodo_pago', v_metodo, 'appointment_id', v_dest.id,
                'cobrada', v_total > 0 and v_pagado >= v_total,
                'detalle', 'S/ ' || v_pagado || ' de S/ ' || v_total
                           || case when v_total > v_pagado then ' (faltan S/ ' || (v_total - v_pagado) || ')' else ' (cobrada)' end
                           || case when v_confirma then ' · cita confirmada' else '' end);
        end if;
    end if;

    -- La venta viva: sus inscripciones que siguen en pie.
    v_ids := array(select id from public.appointments
                    where company_id = p_company and lead_id = v_lead.id and slot_start like 'sched:%'
                      and status in ('pending_payment', 'confirmed') and (coalesce(periodo_hasta, '') = '' or periodo_hasta >= v_hoy));
    if cardinality(v_ids) = 0 then
        raise exception 'este cliente no tiene ninguna inscripción viva a la que atribuir el pago. Para cobrar un PEDIDO usa «Cobrada»';
    end if;

    if coalesce(p_datos->>'appointment_id', '') <> '' then
        select * into v_dest from public.appointments where id = p_datos->>'appointment_id' and id = any(v_ids);
        if not found then raise exception 'esa inscripción no es una viva de este cliente'; end if;
    else
        select * into v_dest from public.appointments where id = any(v_ids) order by (status = 'pending_payment') desc, created_at desc limit 1;
    end if;

    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, order_id, appointment_id)
    values (gen_random_uuid()::text, v_lead.id, p_company, v_monto, v_op, 1, '', v_dest.id);
    update public.appointments set metodo_pago = v_metodo where id = v_dest.id;

    -- El saldo es de la VENTA (settlePendingEnrolment): líneas de todas sus inscripciones vivas…
    select coalesce(sum(coalesce(nullif((select sum(s.price) from public.appointment_services s where s.appointment_id = x.id), 0),
                                 (select k.price from public.catalog k where k.company_id = p_company and k.id = split_part(x.slot_start, ':', 2)), 0)), 0),
           min(x.created_at)
      into v_total, v_desde from public.appointments x where x.id = any(v_ids);
    -- …contra sus pagos: los enganchados a ellas y los sueltos que llegaron después.
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
     where p.lead_id = v_lead.id and p.company_id = p_company
       and ((p.appointment_id <> '' and p.appointment_id = any(v_ids))
         or (p.appointment_id = '' and p.order_id = '' and p.created_at >= v_desde));

    for a in select * from public.appointments where id = any(v_ids) and status = 'pending_payment' loop
        select * into v_item from public.catalog where company_id = p_company and id = split_part(a.slot_start, ':', 2);
        select f into v_franja from jsonb_array_elements(public.v2_franjas(v_item.schedule_slots)) f
         where f->>'id' = split_part(a.slot_start, ':', 3) limit 1;
        v_cap := coalesce((v_franja->>'capacity')::integer, -1);
        if v_cap <> -1 then
            select count(*) into v_n from public.appointments o
             where o.company_id = p_company and o.slot_start = a.slot_start and o.status = 'confirmed'
               and (coalesce(o.periodo_desde, '') = '' or coalesce(a.periodo_desde, '') = ''
                    or (o.periodo_desde <= a.periodo_hasta and o.periodo_hasta >= a.periodo_desde));
            if v_n >= v_cap then
                v_llenos := v_llenos || (coalesce(nullif(btrim(a.beneficiario), ''), 'el cliente') || ' en «' || coalesce(v_franja->>'label', a.service) || '»');
                continue;
            end if;
        end if;
        update public.appointments set status = 'confirmed', pagado_por = 'panel' where id = a.id;
        v_conf := v_conf + 1;
    end loop;

    return jsonb_build_object('lead_id', v_lead.id, 'monto', v_monto, 'metodo_pago', v_metodo, 'appointment_id', v_dest.id,
        'detalle', 'S/ ' || v_pagado || ' de S/ ' || v_total
                   || case when v_total > v_pagado then ' (faltan S/ ' || (v_total - v_pagado) || ')' else ' (pagado completo)' end
                   || case when v_conf > 0 then ' · ' || v_conf || ' cupo(s) confirmado(s)' else '' end
                   || case when cardinality(v_llenos) > 0 then ' · GRUPO LLENO, lo resuelve una persona: ' || array_to_string(v_llenos, ', ') else '' end);
end $$;

-- ── agenda_marcar_pagado, la de la 0004 ──
create or replace function public.agenda_marcar_pagado(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tipo   text := p_datos->>'tipo';
    v_id     text := p_datos->>'id';
    v_metodo text := btrim(coalesce(p_datos->>'metodo_pago', ''));
    v_antes  text;
    v_slot   text;
    v_min    integer;
    v_emp    text;
    v_falta  boolean;
    v_motivo text;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_tipo not in ('order', 'appointment') then raise exception 'tipo debe ser order o appointment'; end if;
    if v_metodo <> '' and v_metodo not in ('yape', 'plin', 'bank_transfer', 'cash', 'cod') then
        raise exception 'metodo_pago inválido: "%". Valores: yape · plin · bank_transfer · cash · cod', v_metodo;
    end if;
    if v_tipo = 'order' then
        select status into v_antes from public.orders where company_id = p_company and id = v_id;
    else
        select status, slot_start, slot_minutes, employee_id into v_antes, v_slot, v_min, v_emp
          from public.appointments where company_id = p_company and id = v_id;
    end if;
    if v_antes is null then raise exception 'Eso no existe en este negocio.'; end if;
    if v_antes = 'cancelled' then
        raise exception '%: no se puede marcar como pagada. Si el cliente pagó y lo quiere igual, se crea de nuevo',
            case when v_tipo = 'order' then 'ese pedido está cancelado' else 'esa cita está cancelada' end;
    end if;

    v_falta := (v_tipo = 'order' and v_antes = 'pending') or (v_tipo = 'appointment' and v_antes = 'pending_payment');
    if v_falta then
        if v_tipo = 'order' then
            update public.orders set status = 'paid' where id = v_id;
        else
            if v_slot not like 'sched:%' then
                perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
                v_motivo := public.v2_hueco(p_company, v_slot, v_min, v_emp, v_id);
                if v_motivo is not null then
                    raise exception 'no se puede confirmar: %. Muévela a otra hora y márcala pagada', v_motivo;
                end if;
            end if;
            update public.appointments set status = 'confirmed' where id = v_id;
        end if;
    end if;
    if v_tipo = 'order' then
        update public.orders set pagado_por = 'panel' where id = v_id;
    else
        update public.appointments set pagado_por = 'panel',
               metodo_pago = case when v_metodo <> '' then v_metodo else metodo_pago end where id = v_id;
    end if;
    return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'cambio', v_falta, 'antes', v_antes, 'pagado_por', 'panel')
           || case when v_metodo <> '' then jsonb_build_object('metodo_pago', v_metodo) else '{}'::jsonb end;
end $$;

-- ── cancha_validar_pago, la de la 0018 ──
create or replace function public.cancha_validar_pago(p_company text, p_appointment text, p_monto numeric, p_metodo text,
                                                      p_url text default '', p_hash text default '', p_op text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cita   public.appointments;
    v_total  numeric;
    v_pagado numeric;
    v_url    text := btrim(coalesce(p_url, ''));
    v_hash   text := lower(btrim(coalesce(p_hash, '')));
    v_op     text := regexp_replace(coalesce(p_op, ''), '\D', '', 'g');
    v_r      jsonb;
begin
    -- Sin el segundo argumento, el empleado no pasa: el dinero es del dueño y del administrador.
    perform public.v2_autorizar_agenda(p_company);
    if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto que recibiste.'; end if;
    if p_metodo not in ('yape', 'plin', 'cash', 'bank_transfer') then raise exception 'Elige cómo te pagaron.'; end if;
    -- Solo fotos que subió el propio servidor a Cloudinary; nada de enlaces cualquiera.
    if v_url <> '' and v_url !~ '^https://res\.cloudinary\.com/' then raise exception 'La foto del pago no es válida. Vuelve a tomarla.'; end if;
    if v_hash <> '' and v_hash !~ '^[0-9a-f]{64}$' then raise exception 'La foto del pago no es válida. Vuelve a tomarla.'; end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    select * into v_cita from public.appointments where id = p_appointment and company_id = p_company;
    if not found then raise exception 'Esa reserva no es de este negocio.'; end if;
    if v_cita.status not in ('pending_payment', 'confirmed', 'completed') then
        raise exception 'Esta reserva está cancelada: no se le registra un pago.';
    end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Esta reserva ya está cobrada completa.'; end if;

    if v_hash <> '' and exists (select 1 from public.pending_payments where company_id = p_company and image_hash = v_hash) then
        raise exception 'Esta misma foto ya se usó para registrar otro pago.';
    end if;
    if v_op <> '' and public.v2_valida_operacion(p_company)
       and exists (select 1 from public.pending_payments where company_id = p_company and operation_id = v_op) then
        raise exception 'La operación #% ya fue registrada antes.', v_op;
    end if;

    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id;
    if p_monto > v_total - v_pagado then
        raise exception 'Le faltan S/ %: no se puede registrar más que eso.', greatest(v_total - v_pagado, 0);
    end if;

    v_r := public.v2_comprobante_aplicar(v_cita, p_monto, p_metodo,
                                         case when v_op <> '' then v_op else 'panel:' || gen_random_uuid() end,
                                         v_hash, v_url, 'panel');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Mueve la reserva a otra hora y vuelve a validar.', v_r->>'motivo';
    end if;
    return v_r || jsonb_build_object('detalle', case v_r->>'resultado'
        when 'parcial' then 'Pago apuntado, pero no alcanza el adelanto: sigue apartada. Faltan S/ '
                            || ((v_r->>'minimo')::numeric - (v_r->>'pagado')::numeric) || ' para confirmarla.'
        when 'cobrada' then 'Pago validado. Reserva cobrada completa.'
        when 'confirmada' then 'Pago validado. Reserva confirmada. Faltan S/ ' || (v_r->>'falta') || '.'
        else 'Pago validado. Faltan S/ ' || (v_r->>'falta') || '.' end);
end $$;

drop function if exists public.cobro_fotos_del_dia(text, text);
drop function if exists public.cobro_foto_permiso(text);
drop function if exists public.cobro_foto_guardar(text, text);
drop function if exists public.cobro_foto_modo(text);
drop function if exists public.v2_foto_pago_guardar(text, text, text, text, text, jsonb, text, numeric);
drop function if exists public.v2_foto_pago_validar(text, text, jsonb);
drop function if exists public.v2_foto_pago(text);

commit;

notify pgrst, 'reload schema';
