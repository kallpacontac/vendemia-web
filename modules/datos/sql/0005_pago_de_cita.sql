-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0005: registrar un pago con importe en una CITA PUNTUAL
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido del bot (19-oct-2026, punto 5) y de Alvaro: la seña o el resto en efectivo de
-- una cita no tenía cómo apuntarse; registrar_pago era solo para inscripciones.
--
-- agenda_registrar_pago (0004, ya aplicada) copiada sin más cambio que una rama al
-- principio: con `appointment_id` de una cita puntual, el pago va a esa cita. «Cobrada»
-- (pagado_por = 'panel') solo cuando lo pagado cubre el total; si no, «por cobrar», y
-- su dinero suma a la caja del día como «a cuenta» (lib/panel/dinero.ts).
--
-- Idempotente (create or replace); los permisos de la 0004 se conservan.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

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

commit;
