-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0035: «Llegó sin cita» del barbero, sin nombre ni celular obligatorios
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 24-nov-2026 (The 24/7, Alvaro, con el aviso «Escribe el nombre del cliente»): «que el nombre y
-- el número no sean obligatorios». La de la 0026 tal cual, salvo el cliente, que sigue la regla
-- de «Cobrar ticket» (0031) y de la «Nueva cita» sin datos (0029):
--
--   · celular + nombre → su ficha (v2_lead), como antes;
--   · solo celular     → la ficha de ese celular (o una nueva sin nombre);
--   · sin celular      → el cliente de mostrador (lead sin teléfono) y el nombre, si lo hay, en
--                        appointments.beneficiario;
--   · celular a medias → error: «escribe los 9 dígitos o déjalo vacío».
--
-- Necesita la 0026 y la 0029 (beneficiario). Idempotente.
-- Deshacer: volver a correr modules/tu-pagina/sql/0026_sin_cita_del_barbero.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

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
    v_tel    text := public.v2_telefono(coalesce(p_datos->>'telefono', ''));
    v_nombre text := left(btrim(coalesce(p_datos->>'nombre', '')), 120);
    v_mostrador boolean := false;
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

    -- El cliente: nombre y celular OPCIONALES (24-nov-2026). La misma regla que «Cobrar ticket»
    -- (0031): con celular, su ficha; sin celular, el cliente de mostrador y el nombre en la cita.
    v_nuevo := false;
    if v_tel ~ '^\d{8,15}$' then
        if v_nombre <> '' then
            select l.lead_id, l.nuevo into v_lead_id, v_nuevo from public.v2_lead(p_company, v_tel, v_nombre, 'panel') l;
            select * into v_lead from public.leads where id = v_lead_id;
        else
            select * into v_lead from public.leads where company_id = p_company and phone = v_tel order by created_at limit 1;
            if not found then
                insert into public.leads (id, company_id, phone, name, source)
                values (gen_random_uuid()::text, p_company, v_tel, '', 'panel')
                returning * into v_lead;
                v_nuevo := true;
            end if;
        end if;
    elsif regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g') <> '' then
        raise exception 'Ese celular no está completo: escribe los 9 dígitos o déjalo vacío.';
    else
        v_mostrador := true;
        select * into v_lead from public.leads where company_id = p_company and coalesce(phone, '') = '' order by created_at limit 1;
        if not found then
            insert into public.leads (id, company_id, phone, name, source)
            values ('mostrador-' || gen_random_uuid()::text, p_company, '', '', 'panel')
            returning * into v_lead;
        end if;
    end if;

    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, sede, beneficiario)
    values (gen_random_uuid()::text, p_company, v_lead.id, v_item.name, v_slot, v_fin, v_span, v_ficha, 'confirmed', v_sede,
            case when v_mostrador then v_nombre else '' end)
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

revoke execute on function public.mi_agenda_sin_cita(text, jsonb) from public, anon;
grant execute on function public.mi_agenda_sin_cita(text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.mi_agenda_sin_cita(text, jsonb)') is not null as sin_cita;
