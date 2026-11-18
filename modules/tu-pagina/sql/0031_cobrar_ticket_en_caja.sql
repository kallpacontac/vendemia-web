-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0031: «Cobrar ticket» en la Caja
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 17-nov-2026 (The 24/7): «el cliente va con el barbero, lo atiende, este le
-- da un ticket y el cliente va a caja a pagar con ese ticket; lo anota el cajero / admin».
--
-- Hasta hoy, para cobrar a quien no estaba en la agenda, la caja tenía que ir a Agenda › Nueva cita
-- (que además se niega si la hora está llena: justo cuando hay más gente), luego a «Ya pasaron»
-- › Vino, y luego a Cobrada. Tres pantallas con el cliente esperando delante.
--
--   · caja_ticket: crea en UN paso lo que dice el ticket, ya ATENDIDO (completed): quién atendió,
--     qué se hizo (uno o varios servicios y productos del catálogo, a su precio) y en qué sede.
--     El cobro (método y foto) va después con el marcar_pagado de siempre, para que la foto, la
--     caja del día y la boleta funcionen igual que en cualquier otro cobro. Si ese segundo paso
--     falla, el ticket queda en «Listos para cobrar» y no se pierde nada.
--   · Reglas, todas aquí:
--       - Solo el dueño o el administrador (la caja). El barbero anota en Mi agenda (0026).
--       - NO mira el aforo: el cliente ya fue atendido. Ocupó su silla hasta ahora.
--       - Precio del catálogo, sin teclear. Productos: descuentan stock (si lo llevan).
--       - La comisión se congela sola al quedar completada (datos 0011), con el barbero elegido.
--       - Cliente opcional, como en la Nueva cita (0029): con celular, su ficha (y su tarjeta);
--         sin celular, el «cliente de mostrador» con el nombre en la cita.
--       - Con 2 o más sedes, la sede es obligatoria.
--
-- Necesita la 0023, 0025 y 0029, y la 0011 de datos. Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.caja_ticket(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ahora  text := public.v2_ahora();
    v_items  jsonb := case when jsonb_typeof(p_datos->'items') = 'array' then p_datos->'items' else '[]'::jsonb end;
    v_id     text;
    v_item   public.catalog;
    v_emp    public.employees;
    v_lead   public.leads;
    v_lead_id text;
    v_nuevo  boolean := false;
    v_tel    text := public.v2_telefono(coalesce(p_datos->>'telefono', ''));
    v_nombre text := left(btrim(coalesce(p_datos->>'nombre', '')), 120);
    v_mostrador boolean := false;
    v_sedes  integer;
    v_sede   text := btrim(coalesce(p_datos->>'sede', ''));
    v_span   integer := 0;
    v_inicio text;
    v_cita   public.appointments;
    v_total  numeric := 0;
    v_nombres text[] := '{}';
    v_orden  integer := 0;
    v_cant   jsonb := '{}'::jsonb;
begin
    perform public.v2_autorizar_agenda(p_company);

    if jsonb_array_length(v_items) = 0 then raise exception 'Elige lo que se hizo: sin servicio el ticket sería S/ 0.'; end if;
    if jsonb_array_length(v_items) > 20 then raise exception 'Demasiadas cosas en un ticket.'; end if;

    -- Revisar todo antes de escribir nada (y contar cuántos de cada producto).
    for v_id in select jsonb_array_elements_text(v_items) loop
        select * into v_item from public.catalog where company_id = p_company and id = v_id and coalesce(is_active, 1) <> 0;
        if not found then raise exception 'Algo del ticket ya no está en el catálogo. Vuelve a elegirlo.'; end if;
        if jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0 or public.v2_es_cancha(p_company, v_item.id) then
            raise exception '% no se cobra como ticket.', v_item.name;
        end if;
        v_cant := jsonb_set(v_cant, array[v_id], to_jsonb(coalesce((v_cant->>v_id)::integer, 0) + 1));
        if coalesce(v_item.tipo, '') <> 'producto' then
            v_span := v_span + coalesce(nullif(v_item.duration_minutes, 0), 30);
        end if;
    end loop;
    for v_id in select jsonb_object_keys(v_cant) loop
        select * into v_item from public.catalog where company_id = p_company and id = v_id;
        if v_item.stock is not null and v_item.stock < (v_cant->>v_id)::integer then
            raise exception 'De % solo quedan %.', v_item.name, greatest(v_item.stock, 0);
        end if;
    end loop;

    if coalesce(p_datos->>'employee_id', '') <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese barbero no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja.', v_emp.name; end if;
    end if;

    -- La sede: obligatoria con 2 o más.
    select count(*) into v_sedes
      from public.tu_pagina p,
           jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array' then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
     where p.company_id = p_company;
    if v_sede <> '' or v_sedes >= 2 then
        if public.v2_sede_cfg(p_company, v_sede) is null then raise exception 'Elige la sede.'; end if;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    -- El cliente (opcional), con la misma regla que la Nueva cita (0029).
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

    -- Ya atendido: ocupó la silla hasta ahora.
    v_span := greatest(v_span, 15);
    v_inicio := to_char(v_ahora::timestamp - make_interval(mins => v_span), 'YYYY-MM-DD HH24:MI');

    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, sede, beneficiario)
    values (gen_random_uuid()::text, p_company, v_lead.id, '', v_inicio, v_ahora, v_span, coalesce(v_emp.id, ''), 'confirmed', v_sede,
            case when v_mostrador then v_nombre else '' end)
    returning * into v_cita;

    for v_id in select jsonb_array_elements_text(v_items) loop
        select * into v_item from public.catalog where company_id = p_company and id = v_id;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, p_company, v_item.id, v_item.name, coalesce(v_item.price, 0),
                case when coalesce(v_item.tipo, '') = 'producto' then 0 else coalesce(nullif(v_item.duration_minutes, 0), 30) end, v_orden);
        v_orden := v_orden + 1;
        v_total := v_total + coalesce(v_item.price, 0);
        v_nombres := v_nombres || v_item.name;
    end loop;
    for v_id in select jsonb_object_keys(v_cant) loop
        update public.catalog set stock = stock - (v_cant->>v_id)::integer
         where company_id = p_company and id = v_id and stock is not null;
    end loop;

    -- Atendido: así cuenta para la comisión del barbero (se congela sola, datos 0011).
    update public.appointments set service = array_to_string(v_nombres, ' + '), status = 'completed', cumplido_por = 'panel'
     where id = v_cita.id
    returning * into v_cita;

    return jsonb_build_object('status', 'ok', 'id', v_cita.id, 'servicio', v_cita.service, 'total', v_total,
                              'barbero', coalesce(v_emp.name, ''), 'sede', v_sede, 'cliente_nuevo', v_nuevo,
                              'lead_id', v_lead.id, 'sin_telefono', coalesce(v_lead.phone, '') = '');
end $$;

revoke execute on function public.caja_ticket(text, jsonb) from public, anon;
grant execute on function public.caja_ticket(text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.caja_ticket(text, jsonb)') is not null as cobrar_ticket;

-- Deshacer:
--   drop function if exists public.caja_ticket(text, jsonb);
