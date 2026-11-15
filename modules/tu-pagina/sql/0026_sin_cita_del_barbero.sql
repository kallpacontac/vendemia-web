-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0026: el barbero anota en SU agenda a quien llega sin cita
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7). Estaba decidido en docs/QUIEN-PUEDE-QUE.md
-- («Crear una cita a quien llega sin reserva: empleado ✅ solo en su agenda, al precio del
-- catálogo») y sin construir. Sin esto, el que llega sin cita no ocupa silla en el sistema y la
-- página puede vender una hora que en el local ya no hay.
--
--   · mi_agenda_sin_cita_datos: lo que necesita el formulario de Mi agenda — los servicios que
--     se agendan por hora (sin productos, grupos ni canchas) y los nombres de las sedes.
--   · mi_agenda_sin_cita: crea la cita. Reglas, todas aquí y no en la pantalla:
--       - Cualquiera del negocio (dueño, admin, empleado), pero SIEMPRE a nombre de su propia
--         ficha (mi_empleado). Sin ficha enlazada, no: es «mi» agenda.
--       - El precio es el del catálogo; no se acepta otro.
--       - Hoy, desde hace 30 min (el cliente ya está en la silla) hasta el final del día. Sin
--         hora: ahora.
--       - Si el barbero ya tiene una cita viva que se cruza, no: que la marque («No vino») o
--         que la muevan. No puede cortar a dos.
--       - Con 2 o más sedes, la sede es obligatoria. El aforo AVISA, no bloquea (el cliente ya
--         está ahí), igual que la «Nueva cita» del dueño (cita_sede_panel).
--
-- Necesita la 0023–0025 (appointments.sede, v2_sede_cfg, v2_sede_llena) y las de roles del bot
-- (mi_empleado, 0041). Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.mi_agenda_sin_cita_datos(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company, true);
    return jsonb_build_object(
        'ficha', public.mi_empleado(p_company),
        'servicios', coalesce((
            select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'minutos', coalesce(nullif(c.duration_minutes, 0), 30))
                             order by c.sort_order nulls last, c.name)
              from public.catalog c
             where c.company_id = p_company and coalesce(c.is_active, 1) <> 0 and coalesce(c.tipo, '') <> 'producto'
               and jsonb_array_length(public.v2_franjas(c.schedule_slots)) = 0
               and not public.v2_es_cancha(p_company, c.id)), '[]'::jsonb),
        'sedes', coalesce((
            select jsonb_agg(btrim(s->>'nombre'))
              from public.tu_pagina p,
                   jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array' then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
             where p.company_id = p_company and btrim(coalesce(s->>'nombre', '')) <> ''), '[]'::jsonb));
end $$;

create or replace function public.mi_agenda_sin_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ahora  text := public.v2_ahora();
    v_desde  text := to_char(public.v2_ahora()::timestamp - interval '30 minutes', 'YYYY-MM-DD HH24:MI');
    v_slot   text := coalesce(nullif(btrim(p_datos->>'slot_start'), ''), public.v2_ahora());
    v_ficha  text;
    v_emp    public.employees;
    v_item   public.catalog;
    v_lead   public.leads;
    v_lead_id text;
    v_nuevo  boolean;
    v_span   integer;
    v_fin    text;
    v_sedes  integer;
    v_sede   text := btrim(coalesce(p_datos->>'sede', ''));
    v_cfg    jsonb;
    v_cap    integer;
    v_cita   public.appointments;
    v_aviso  text;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    v_ficha := public.mi_empleado(p_company);
    if v_ficha is null then
        raise exception 'Todavía no tienes una ficha enlazada. Pídele al dueño que te la ponga en Ajustes › Acceso del equipo.' using errcode = '42501';
    end if;
    select * into v_emp from public.employees where company_id = p_company and id = v_ficha;
    if not found or coalesce(v_emp.is_active, 1) = 0 then raise exception 'Tu ficha está dada de baja en este negocio.' using errcode = '42501'; end if;

    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'La hora no es válida.'; end if;
    if left(v_slot, 10) <> left(v_ahora, 10) then raise exception 'Solo se anota a quien llega hoy. Para otro día, pídeselo a la caja.'; end if;
    if v_slot < v_desde then raise exception 'Esa hora ya pasó hace más de media hora.'; end if;

    select * into v_item from public.catalog
     where company_id = p_company and id = p_datos->>'catalog_item_id' and coalesce(is_active, 1) <> 0;
    if not found then raise exception 'Elige el servicio.'; end if;
    if coalesce(v_item.tipo, '') = 'producto' or jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0
       or public.v2_es_cancha(p_company, v_item.id) then
        raise exception '% no se agenda por hora.', v_item.name;
    end if;

    -- La sede: obligatoria con 2 o más.
    select count(*) into v_sedes
      from public.tu_pagina p,
           jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array' then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
     where p.company_id = p_company;
    if v_sede <> '' or v_sedes >= 2 then
        v_cfg := public.v2_sede_cfg(p_company, v_sede);
        if v_cfg is null then raise exception 'Elige en qué sede estás.'; end if;
        if coalesce(v_cfg->>'capacidad', '') ~ '^\d+$' then v_cap := (v_cfg->>'capacidad')::integer; end if;
    end if;

    v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 30);
    v_fin  := public.tu_pagina_sumar_min(v_slot, v_span);

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    -- No puede cortar a dos: una cita suya, viva y sin cerrar, que se cruce.
    if exists (
        select 1 from public.appointments a
         where a.company_id = p_company and a.employee_id = v_ficha
           and a.status in ('confirmed', 'pending_payment') and public.v2_ocupa_hora(a.status, a.created_at)
           and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and a.slot_start < v_fin
           and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > v_slot) then
        raise exception 'Ya tienes una cita a esa hora. Si ese cliente no vino, márcalo «No vino» y vuelve a intentarlo.';
    end if;

    select l.lead_id, l.nuevo into v_lead_id, v_nuevo from public.v2_lead(p_company, p_datos->>'telefono', p_datos->>'nombre', 'panel') l;
    select * into v_lead from public.leads where id = v_lead_id;

    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, sede)
    values (gen_random_uuid()::text, p_company, v_lead.id, v_item.name, v_slot, v_fin, v_span, v_ficha, 'confirmed', v_sede)
    returning * into v_cita;
    insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
    values (gen_random_uuid()::text, v_cita.id, p_company, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);

    -- Avisa (no bloquea) si con esta el local o la sede quedan por encima de su aforo.
    if v_sede <> '' and public.v2_sede_llena(v_cita, v_sede, v_cap) then
        v_aviso := v_sede || ' ya tenía todas sus sillas ocupadas a esa hora. La cita quedó igual: avisa a la caja.';
    elsif v_sede = '' then
        v_aviso := public.v2_hueco(p_company, v_slot, v_span, '', v_cita.id);
        if v_aviso is not null then v_aviso := 'Ojo: ' || v_aviso || '. La cita quedó igual: avisa a la caja.'; end if;
    end if;

    return jsonb_build_object('status', 'ok', 'id', v_cita.id, 'servicio', v_item.name, 'slot_start', v_slot,
                              'minutos', v_span, 'sede', v_sede, 'cliente_nuevo', v_nuevo, 'aviso', v_aviso);
end $$;

revoke execute on function public.mi_agenda_sin_cita_datos(text) from public, anon;
grant execute on function public.mi_agenda_sin_cita_datos(text) to authenticated;
revoke execute on function public.mi_agenda_sin_cita(text, jsonb) from public, anon;
grant execute on function public.mi_agenda_sin_cita(text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: dos «sí».
select to_regprocedure('public.mi_agenda_sin_cita_datos(text)') is not null as datos,
       to_regprocedure('public.mi_agenda_sin_cita(text, jsonb)') is not null as crear;

-- Deshacer:
--   drop function if exists public.mi_agenda_sin_cita(text, jsonb);
--   drop function if exists public.mi_agenda_sin_cita_datos(text);
