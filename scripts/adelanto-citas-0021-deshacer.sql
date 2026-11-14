-- ═══════════════════════════════════════════════════════════════════════════════
-- Deshacer 0021 (adelanto de citas): las cuatro funciones vuelven a como las dejaron la 0017 y
-- la 0018, y se borran v2_adelanto_minimo y v2_citas_cfg. Copiadas tal cual de esos ficheros.
-- No toca datos: secciones.citas se queda en la página sin efecto, y los comprobantes y pagos
-- ya registrados siguen ahí. Las citas apartadas vuelven a ser solo «Requerir pago para confirmar».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- v2_comprobante_cita y comprobante_srv_buscar: como en la 0017.
create or replace function public.v2_comprobante_cita(p_slug text, p_codigo text, p_telefono text)
returns public.appointments language plpgsql stable security definer set search_path = public as $$
declare
    v_pag  public.tu_pagina;
    v_cita public.appointments;
begin
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce(v_pag.secciones #>> '{canchas,comprobante}', 'whatsapp') not in ('pagina', 'ambos') then return null; end if;
    select a.* into v_cita
      from public.pagina_idem i
      join public.appointments a on a.id = i.ref_id and a.company_id = i.company_id
      join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo))
       and l.phone = public.v2_telefono(p_telefono);
    return v_cita;
end $$;

create or replace function public.comprobante_srv_buscar(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_cita public.appointments;
    v_cfg  jsonb;
    v_met  text;
begin
    perform public.loyalty_srv_check();
    v_cita := public.v2_comprobante_cita(p_slug, p_codigo, p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if v_cita.status not in ('pending_payment', 'confirmed') then return jsonb_build_object('status', 'vencida'); end if;
    if coalesce(v_cita.pagado_por, '') <> '' then return jsonb_build_object('status', 'cobrada'); end if;
    if (select count(*) from public.comprobantes_web where appointment_id = v_cita.id) >= 6 then
        return jsonb_build_object('status', 'demasiados');
    end if;
    v_cfg := public.v2_canchas_cfg(v_cita.company_id);
    select payment_methods into v_met from public.companies where id = v_cita.company_id;
    return jsonb_build_object('status', 'ok', 'company_id', v_cita.company_id,
        'validacion', coalesce(v_cfg->>'validacion', 'automatica'),
        'numeros', coalesce((select jsonb_agg(m->>'number') from jsonb_array_elements(v_met::jsonb) m
                              where m->>'type' in ('yape', 'plin') and coalesce(m->>'number', '') <> ''), '[]'::jsonb));
exception when invalid_text_representation then
    return jsonb_build_object('status', 'ok', 'company_id', v_cita.company_id, 'validacion', 'manual', 'numeros', '[]'::jsonb);
end $$;

-- v2_comprobante_aplicar y comprobantes_panel: como en la 0018.
create or replace function public.v2_comprobante_aplicar(p_cita public.appointments, p_monto numeric, p_metodo text,
                                                         p_op text, p_hash text, p_url text, p_quien text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cfg      jsonb := public.v2_canchas_cfg(p_cita.company_id);
    v_total    numeric;
    v_previo   numeric;
    v_pagado   numeric;
    v_adelanto numeric := 0;
    v_minimo   numeric;
    v_item     text;
    v_motivo   text;
    v_confirma boolean := false;
    v_cubre    boolean;
begin
    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = p_cita.id;
    select coalesce(sum(p.amount), 0) into v_previo from public.pending_payments p
     where p.company_id = p_cita.company_id and p.appointment_id = p_cita.id;
    v_pagado := v_previo + p_monto;
    if coalesce(v_cfg->>'adelanto', '') ~ '^\d+(\.\d+)?$' then v_adelanto := (v_cfg->>'adelanto')::numeric; end if;
    v_minimo := least(v_adelanto, v_total);

    if p_cita.status = 'pending_payment' and v_pagado >= v_minimo then
        select s.catalog_item_id into v_item
          from public.appointment_services s
          join public.catalog k on k.id = s.catalog_item_id and k.company_id = p_cita.company_id
         where s.appointment_id = p_cita.id and coalesce(k.tipo, '') <> 'producto' limit 1;
        v_motivo := public.v2_cancha_motivo(p_cita.company_id, coalesce(v_item, ''), p_cita.slot_start, p_cita.slot_minutes, p_cita.id);
        if v_motivo is not null then
            return jsonb_build_object('resultado', 'sin_sitio', 'motivo', v_motivo, 'total', v_total, 'pagado', v_previo);
        end if;
        v_confirma := true;
    end if;

    insert into public.pending_payments (id, lead_id, company_id, amount, voucher_path, operation_id, image_hash, verified, order_id, appointment_id)
    values (gen_random_uuid()::text, p_cita.lead_id, p_cita.company_id, p_monto, p_url, coalesce(p_op, ''), coalesce(p_hash, ''), 1, '', p_cita.id);

    v_cubre := v_total > 0 and v_pagado >= v_total;
    update public.appointments
       set metodo_pago = case when p_metodo in ('yape', 'plin', 'bank_transfer', 'cash') then p_metodo else metodo_pago end,
           status      = case when v_confirma then 'confirmed' else status end,
           pagado_por  = case when v_cubre then p_quien else pagado_por end,
           -- Pagó algo pero no llega al adelanto: el plazo vuelve a empezar desde este pago.
           -- Si no, quien yapeó S/ 20 de S/ 40 perdía la cancha a los 30 minutos de reservar
           -- (y otro podía reservarla encima) con su dinero ya dentro.
           created_at  = case when p_cita.status = 'pending_payment' and not v_confirma
                              then extract(epoch from now())::bigint else created_at end
     where id = p_cita.id;

    return jsonb_build_object(
        'resultado', case when v_cubre then 'cobrada' when v_confirma then 'confirmada'
                          when p_cita.status = 'pending_payment' then 'parcial' else 'a_cuenta' end,
        'total', v_total, 'pagado', v_pagado, 'falta', greatest(v_total - v_pagado, 0), 'minimo', v_minimo);
end $$;

create or replace function public.comprobantes_panel(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', c.id, 'cliente', coalesce(nullif(l.name, ''), l.phone), 'telefono', l.phone, 'servicio', a.service, 'slot', a.slot_start,
            'total', (select coalesce(sum(s.price), 0) from public.appointment_services s where s.appointment_id = a.id),
            'pagado', (select coalesce(sum(p.amount), 0) from public.pending_payments p where p.company_id = c.company_id and p.appointment_id = a.id),
            'url', c.url, 'monto', c.monto, 'metodo', c.metodo, 'motivo', c.motivo,
            'operacion', coalesce(c.operacion, '')) order by c.creado_at)
          from public.comprobantes_web c
          join public.appointments a on a.id = c.appointment_id
          join public.leads l on l.id = c.lead_id
         where c.company_id = p_company and c.estado = 'revisar'), '[]'::jsonb);
end $$;

drop function if exists public.v2_adelanto_minimo(text, numeric);
drop function if exists public.v2_citas_cfg(text);

commit;

notify pgrst, 'reload schema';
