-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0030: anotar una cita de hasta 24 horas atrás
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 17-nov-2026 (The 24/7): «que deje registrar hasta 24 horas antes; pasada la
-- hora actual no deja». El cliente que ya se atendió y nadie anotó: se registra después, con su hora
-- real, y entra en la Caja y en Métricas de ese día.
--
--   · agenda_crear_cita acepta desde AHORA − 24 h (antes: solo horas futuras). Más atrás, lo dice.
--   · Todo lo demás igual que la 0029 (sin nombre ni número, cliente de mostrador) y la 0011
--     (horario, aforo, profesional, canchas): la hora pasada se comprueba igual contra el horario.
--   · La cita nace «confirmada»: si ya vino, se marca «Vino» como cualquier otra.
--
-- Necesita la 0029. Idempotente. Deshacer: volver a correr la 0029.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

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
    v_tel    text := public.v2_telefono(coalesce(p_datos->>'telefono', ''));
    v_nombre text := left(btrim(coalesce(p_datos->>'nombre', '')), 120);
    v_mostrador boolean := false;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    -- Hasta 24 h atrás (0030): el que ya se atendió y no se anotó a tiempo.
    if v_slot < to_char(now() at time zone 'America/Lima' - interval '24 hours', 'YYYY-MM-DD HH24:MI') then
        raise exception 'Solo se puede anotar una cita de hasta 24 horas atrás. Elige una hora más reciente.';
    end if;
    select * into v_item from public.catalog where company_id = p_company and id = p_datos->>'catalog_item_id';
    if not found then raise exception 'Elige un servicio: una cita sin servicio entra en los ingresos como S/ 0'; end if;
    if jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0 then
        raise exception '% es un grupo con horarios fijos: se inscribe, no se agenda por hora', v_item.name;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    if coalesce(p_datos->>'lead_id', '') <> '' then
        select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
        if not found then raise exception 'Ese cliente no es de este negocio.'; end if;
        if v_lead.name = '' and v_nombre <> '' then
            update public.leads set name = v_nombre where id = v_lead.id returning * into v_lead;
        end if;
    elsif v_tel ~ '^\d{8,15}$' then
        if v_nombre <> '' then
            select l.lead_id, l.nuevo into v_lead_id, v_nuevo from public.v2_lead(p_company, v_tel, v_nombre, 'panel') l;
            select * into v_lead from public.leads where id = v_lead_id;
        else
            -- Solo el número: su ficha si ya existe; si no, una nueva sin nombre.
            select * into v_lead from public.leads where company_id = p_company and phone = v_tel order by created_at limit 1;
            if not found then
                insert into public.leads (id, company_id, phone, name, source)
                values (gen_random_uuid()::text, p_company, v_tel, '', 'panel')
                returning * into v_lead;
                v_nuevo := true;
            end if;
        end if;
    elsif regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g') <> '' then
        raise exception 'Ese teléfono no está completo: escribe los 9 dígitos o déjalo vacío.';
    else
        -- Sin teléfono: el cliente de mostrador del negocio; el nombre va en la cita.
        v_mostrador := true;
        select * into v_lead from public.leads where company_id = p_company and coalesce(phone, '') = '' order by created_at limit 1;
        if not found then
            insert into public.leads (id, company_id, phone, name, source)
            values ('mostrador-' || gen_random_uuid()::text, p_company, '', '', 'panel')
            returning * into v_lead;
        end if;
    end if;

    if coalesce(p_datos->>'employee_id', '') <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    end if;

    -- Una cancha (0011) se ocupa por separado, admite varios turnos y turno fijo: v2_crear_cancha.
    if public.v2_es_cancha(p_company, v_item.id) then
        return public.v2_crear_cancha(p_company, v_item, v_lead, v_nuevo, v_slot, p_datos);
    end if;

    v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_fin  := public.tu_pagina_sumar_min(v_slot, v_span);

    -- ¿Ya tenía esta cita? (no aplica al de mostrador: son personas distintas)
    if not v_mostrador then
        select * into v_cita from public.appointments a
         where a.company_id = p_company and a.lead_id = v_lead.id and a.status <> 'completed' and public.v2_ocupa_hora(a.status, a.created_at)
           and a.slot_start < v_fin and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > v_slot
         limit 1;
        v_dup := found;
    end if;
    if not v_dup then
        v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''));
        if v_motivo is not null then raise exception '%', v_motivo; end if;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, beneficiario_edad)
        values (gen_random_uuid()::text, p_company, v_lead.id, v_item.name, v_slot, v_fin, v_span, coalesce(v_emp.id, ''), 'confirmed',
                coalesce(nullif(btrim(coalesce(p_datos->>'beneficiario', '')), ''), case when v_mostrador then v_nombre else '' end),
                btrim(coalesce(p_datos->>'beneficiario_edad', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, p_company, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);
    end if;

    v_msg := 'Hola' || public.v2_primer_nombre(coalesce(nullif(v_cita.beneficiario, ''), v_lead.name)) || '! Te dejé agendada tu cita de ' || v_item.name || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?';
    return jsonb_build_object(
        'id', v_cita.id, 'lead_id', v_lead.id, 'cliente_nuevo', v_nuevo, 'duplicada', v_dup, 'sin_telefono', coalesce(v_lead.phone, '') = '',
        'slot_start', v_cita.slot_start, 'slot_minutes', v_cita.slot_minutes, 'employee_id', v_cita.employee_id,
        'service', v_cita.service, 'precio', coalesce(v_item.price, 0), 'estado', v_cita.status,
        'mensaje', v_msg, 'wa_link', case when coalesce(v_lead.phone, '') = '' then '' else public.v2_wa(v_lead.phone, v_msg) end);
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: dos «sí».
select position('24 hours' in pg_get_functiondef('public.agenda_crear_cita(text, jsonb)'::regprocedure)) > 0 as hasta_24h_atras,
       position('v_mostrador' in pg_get_functiondef('public.agenda_crear_cita(text, jsonb)'::regprocedure)) > 0 as sin_datos_sigue;
