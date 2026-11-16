-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0027: el adelanto no se pierde — reprogramar a quien no vino
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 16-nov-2026 (The 24/7: «el adelanto no se pierde, se posterga para una hora
-- que nosotros le indiquemos… que una no dependa de otra»).
--
--   · «No vino» sigue igual: la hora queda libre AL MOMENTO (v2_ocupa_hora no cuenta no_show) y se
--     puede agendar a otro. Reprogramar es aparte y puede ser hoy o dentro de una semana.
--   · agenda_adelantos_sin_usar: las citas «No vino» o canceladas que tienen pagos y aún no se
--     reprogramaron (últimos 120 días). Es la tarjeta «Adelantos por reprogramar» de la Agenda.
--   · agenda_reprogramar: crea una cita NUEVA (confirmada, mismo cliente, mismos servicios y
--     precios) y le PASA los pagos (pending_payments.appointment_id). La vieja se queda como
--     estaba («No vino» sigue contando en el historial del cliente) con reprogramada_a. El dinero
--     no se duplica en la caja: son las mismas filas de pago, con su fecha de siempre.
--   · Sin profesional (sillas): cabe si hay aforo — el del local (v2_hueco) y el de la sede
--     (v2_sede_llena). Si no cabe, NO se crea y se dice por qué, en palabras del local.
--
-- Necesita la 0023–0025. Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.appointments add column if not exists reprogramada_a  text not null default '';
alter table public.appointments add column if not exists reprogramada_de text not null default '';

create or replace function public.agenda_adelantos_sin_usar(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(x order by x->>'slot' desc)
          from (
            select jsonb_build_object(
                       'id', a.id, 'cliente', coalesce(nullif(l.name, ''), l.phone, ''), 'telefono', coalesce(l.phone, ''),
                       'servicio', a.service, 'slot', a.slot_start, 'sede', coalesce(a.sede, ''), 'estado', a.status,
                       'pagado', p.pagado,
                       'total', (select coalesce(sum(s.price), 0) from public.appointment_services s where s.appointment_id = a.id)) as x
              from public.appointments a
              join lateral (select coalesce(sum(pp.amount), 0) as pagado from public.pending_payments pp
                             where pp.company_id = a.company_id and pp.appointment_id = a.id) p on true
              left join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
             where a.company_id = p_company and a.status in ('no_show', 'cancelled')
               and coalesce(a.reprogramada_a, '') = '' and p.pagado > 0
               and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
               and a.slot_start >= to_char(now() at time zone 'America/Lima' - interval '120 days', 'YYYY-MM-DD')
             limit 50) t), '[]'::jsonb);
end $$;

create or replace function public.agenda_reprogramar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_vieja  public.appointments;
    v_nueva  public.appointments;
    v_lead   public.leads;
    v_slot   text := btrim(coalesce(p_datos->>'slot_start', ''));
    v_span   integer;
    v_sede   text;
    v_sedes  integer;
    v_cfg    jsonb;
    v_cap    integer;
    v_motivo text;
    v_total  numeric;
    v_pagado numeric;
    v_cuando text;
    v_msg    text;
begin
    perform public.v2_autorizar_agenda(p_company);
    select * into v_vieja from public.appointments where company_id = p_company and id = p_datos->>'id' for update;
    if not found then raise exception 'Esa cita no existe en este negocio.'; end if;
    if v_vieja.status not in ('no_show', 'cancelled') then
        raise exception 'Solo se reprograma una cita marcada «No vino» o cancelada. Para cambiarle la hora a una cita que sigue en pie, usa «Cambiar».';
    end if;
    if coalesce(v_vieja.reprogramada_a, '') <> '' then raise exception 'Esa cita ya se reprogramó.'; end if;

    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'Elige el día y la hora.'; end if;
    if v_slot <= public.v2_ahora() then raise exception 'Esa hora ya pasó: elige una que venga.'; end if;
    v_cuando := public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5);

    -- Lo que dura hoy (las duraciones del catálogo pueden haber cambiado), sin contar productos.
    select sum(coalesce(nullif(k.duration_minutes, 0), nullif(s.duration_minutes, 0), 0)) into v_span
      from public.appointment_services s
      left join public.catalog k on k.id = s.catalog_item_id and k.company_id = p_company
     where s.appointment_id = v_vieja.id and coalesce(k.tipo, '') <> 'producto';
    v_span := coalesce(nullif(v_span, 0), nullif(v_vieja.slot_minutes, 0), 30);

    -- La sede: la que se pide, o la que tenía. Con 2 o más, tiene que ser una de ellas.
    v_sede := coalesce(nullif(btrim(p_datos->>'sede'), ''), coalesce(v_vieja.sede, ''));
    select count(*) into v_sedes
      from public.tu_pagina p,
           jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array' then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
     where p.company_id = p_company;
    if v_sedes >= 2 or v_sede <> '' then
        v_cfg := public.v2_sede_cfg(p_company, v_sede);
        if v_cfg is null then
            if v_sedes >= 2 then raise exception 'Elige la sede.'; end if;
            v_sede := '';
        elsif coalesce(v_cfg->>'capacidad', '') ~ '^\d+$' then
            v_cap := (v_cfg->>'capacidad')::integer;
        end if;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    -- ¿Cabe? El local (horario y aforo general; el profesional, si tenía) y luego la sede.
    v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_vieja.employee_id, ''), '');
    if v_motivo is not null then
        raise exception 'No se puede %: %. Elige otra hora.', v_cuando, v_motivo;
    end if;
    v_nueva.id := gen_random_uuid()::text;
    v_nueva.company_id := p_company;
    v_nueva.slot_start := v_slot;
    v_nueva.slot_minutes := v_span;
    v_nueva.slot_end := public.tu_pagina_sumar_min(v_slot, v_span);
    if v_sede <> '' and public.v2_sede_llena(v_nueva, v_sede, v_cap) then
        raise exception 'No se puede %: % ya tiene sus % sillas ocupadas a esa hora. Elige otra hora%.',
            v_cuando, v_sede, v_cap, case when v_sedes >= 2 then ' u otra sede' else '' end;
    end if;

    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                     sede, beneficiario, beneficiario_edad, metodo_pago, reprogramada_de)
    values (v_nueva.id, p_company, v_vieja.lead_id, v_vieja.service, v_slot, v_nueva.slot_end, v_span, coalesce(v_vieja.employee_id, ''),
            'confirmed', v_sede, coalesce(v_vieja.beneficiario, ''), coalesce(v_vieja.beneficiario_edad, ''),
            coalesce(v_vieja.metodo_pago, ''), v_vieja.id)
    returning * into v_nueva;
    insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
    select gen_random_uuid()::text, v_nueva.id, p_company, s.catalog_item_id, s.name, s.price, s.duration_minutes, s.sort_order
      from public.appointment_services s where s.appointment_id = v_vieja.id;

    -- El dinero pasa a la nueva: las mismas filas, no copias.
    update public.pending_payments set appointment_id = v_nueva.id
     where company_id = p_company and appointment_id = v_vieja.id;
    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_nueva.id;
    select coalesce(sum(amount), 0) into v_pagado from public.pending_payments where company_id = p_company and appointment_id = v_nueva.id;
    update public.appointments
       set pagado_por = case when v_total > 0 and v_pagado >= v_total then coalesce(nullif(v_vieja.pagado_por, ''), 'panel') else '' end
     where id = v_nueva.id;
    update public.appointments set reprogramada_a = v_nueva.id, pagado_por = '' where id = v_vieja.id;

    select * into v_lead from public.leads where id = v_vieja.lead_id;
    v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Te reprogramamos tu cita de ' || coalesce(v_vieja.service, '')
             || ' para ' || v_cuando || case when v_sede <> '' then ' en ' || v_sede else '' end || '.'
             || case when v_total > 0 and v_pagado >= v_total then ' Ya la tienes pagada: no pagas nada en el local.'
                     when v_pagado > 0 then ' Tu adelanto de S/ ' || trim(to_char(v_pagado, 'FM999990.##'), '.') || ' ya está en esta cita.'
                     else '' end
             || ' ¿Te queda bien?';
    return jsonb_build_object('status', 'ok', 'id', v_nueva.id, 'slot_start', v_slot, 'sede', v_sede, 'minutos', v_span,
                              'total', v_total, 'pagado', v_pagado, 'falta', greatest(v_total - v_pagado, 0),
                              'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
end $$;

revoke execute on function public.agenda_adelantos_sin_usar(text) from public, anon;
grant execute on function public.agenda_adelantos_sin_usar(text) to authenticated;
revoke execute on function public.agenda_reprogramar(text, jsonb) from public, anon;
grant execute on function public.agenda_reprogramar(text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: tres «sí».
select exists (select 1 from information_schema.columns where table_name = 'appointments' and column_name = 'reprogramada_a') as columna,
       to_regprocedure('public.agenda_adelantos_sin_usar(text)') is not null as lista,
       to_regprocedure('public.agenda_reprogramar(text, jsonb)') is not null as reprogramar;

-- Deshacer:
--   drop function if exists public.agenda_reprogramar(text, jsonb);
--   drop function if exists public.agenda_adelantos_sin_usar(text);
--   alter table public.appointments drop column if exists reprogramada_a, drop column if exists reprogramada_de;
