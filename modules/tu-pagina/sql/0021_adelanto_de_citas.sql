-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0021: adelanto en % para separar CITAS, con el comprobante subido en la página
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 para The 24/7 Barber Shop («50 % de adelanto obligatorio»,
-- «hay que asegurarnos que adjunten las evidencias», «la validación con IA desactivada»).
--
-- Lo de las canchas (0017/0018) para cualquier negocio de citas:
--   · secciones.citas = {"adelanto": 50, "comprobante": "pagina", "validacion": "manual"}
--     adelanto = % del precio (1–100) que confirma la cita; validacion por defecto 'manual'.
--     Hace falta además «Requerir pago para confirmar» (companies.require_payment_to_confirm = 1):
--     sin eso la cita nace confirmada y no hay nada que pagar.
--   · La cita nace apartada (pending_payment), ocupa su hora 24 h (v2_ocupa_hora, sin cambios) y el
--     cliente sube la captura con su código y su celular (comprobante_srv_*, ya existentes).
--   · Con validación manual la captura queda «por revisar» y avisa al dueño (aviso 'pago'); al
--     aprobarla en Agenda → «Comprobantes por revisar», la cita se confirma si lo pagado llega al
--     adelanto. El sitio se vuelve a comprobar con v2_hueco (aforo y profesional), no con la regla
--     de canchas: en una barbería dos «Corte clásico» a la misma hora caben si hay sillas.
--
-- Las canchas siguen exactamente igual: si el negocio tiene canchas, manda su configuración.
-- Cambia: v2_comprobante_cita, comprobante_srv_buscar (0017), v2_comprobante_aplicar y
-- comprobantes_panel (0018). Nuevas: v2_citas_cfg, v2_adelanto_minimo (internas).
-- Idempotente. Deshacer: scripts/adelanto-citas-0021-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- La configuración de citas con adelanto, o null si no hay (o si es de canchas: esas mandan).
create or replace function public.v2_citas_cfg(p_company text)
returns jsonb language sql stable security definer set search_path = public as $$
    select case when public.v2_canchas_cfg(p_company) is null
                 and coalesce(secciones->>'reservar', '') = 'true'
                 and coalesce(secciones #>> '{citas,adelanto}', '') ~ '^\d+(\.\d+)?$'
                 and (secciones #>> '{citas,adelanto}')::numeric between 1 and 100
                then secciones->'citas' end
      from public.tu_pagina where company_id = p_company;
$$;

-- Lo que confirma una reserva de `p_total`: el fijo de las canchas o el % de las citas.
create or replace function public.v2_adelanto_minimo(p_company text, p_total numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
    v_c jsonb := public.v2_canchas_cfg(p_company);
    v_t jsonb;
begin
    if v_c is not null then
        if coalesce(v_c->>'adelanto', '') ~ '^\d+(\.\d+)?$' then return least((v_c->>'adelanto')::numeric, p_total); end if;
        return 0;
    end if;
    v_t := public.v2_citas_cfg(p_company);
    if v_t is null then return 0; end if;
    return least(round(p_total * (v_t->>'adelanto')::numeric / 100, 2), p_total);
end $$;

-- Igual que en la 0017, y también para citas con adelanto subido en la página.
create or replace function public.v2_comprobante_cita(p_slug text, p_codigo text, p_telefono text)
returns public.appointments language plpgsql stable security definer set search_path = public as $$
declare
    v_pag  public.tu_pagina;
    v_cita public.appointments;
begin
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return null; end if;
    if coalesce(v_pag.secciones #>> '{canchas,comprobante}', 'whatsapp') not in ('pagina', 'ambos')
       and not (public.v2_citas_cfg(v_pag.company_id) is not null
                and coalesce(v_pag.secciones #>> '{citas,comprobante}', 'pagina') = 'pagina') then
        return null;
    end if;
    select a.* into v_cita
      from public.pagina_idem i
      join public.appointments a on a.id = i.ref_id and a.company_id = i.company_id
      join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo))
       and l.phone = public.v2_telefono(p_telefono);
    return v_cita;
end $$;

-- Igual que en la 0017; en citas la validación es a mano salvo que se pida otra cosa.
create or replace function public.comprobante_srv_buscar(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_cita public.appointments;
    v_cfg  jsonb;
    v_val  text;
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
    if v_cfg is not null then
        v_val := coalesce(v_cfg->>'validacion', 'automatica');
    elsif public.v2_citas_cfg(v_cita.company_id) is not null then
        v_val := case when public.v2_citas_cfg(v_cita.company_id)->>'validacion' = 'automatica' then 'automatica' else 'manual' end;
    else
        v_val := 'automatica';
    end if;
    select payment_methods into v_met from public.companies where id = v_cita.company_id;
    return jsonb_build_object('status', 'ok', 'company_id', v_cita.company_id,
        'validacion', v_val,
        'numeros', coalesce((select jsonb_agg(m->>'number') from jsonb_array_elements(v_met::jsonb) m
                              where m->>'type' in ('yape', 'plin') and coalesce(m->>'number', '') <> ''), '[]'::jsonb));
exception when invalid_text_representation then
    return jsonb_build_object('status', 'ok', 'company_id', v_cita.company_id, 'validacion', 'manual', 'numeros', '[]'::jsonb);
end $$;

-- Igual que en la 0018, con el adelanto de v2_adelanto_minimo y, en citas, el sitio de v2_hueco.
create or replace function public.v2_comprobante_aplicar(p_cita public.appointments, p_monto numeric, p_metodo text,
                                                         p_op text, p_hash text, p_url text, p_quien text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_total    numeric;
    v_previo   numeric;
    v_pagado   numeric;
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
    v_minimo := public.v2_adelanto_minimo(p_cita.company_id, v_total);

    if p_cita.status = 'pending_payment' and v_pagado >= v_minimo then
        if public.v2_canchas_cfg(p_cita.company_id) is not null then
            select s.catalog_item_id into v_item
              from public.appointment_services s
              join public.catalog k on k.id = s.catalog_item_id and k.company_id = p_cita.company_id
             where s.appointment_id = p_cita.id and coalesce(k.tipo, '') <> 'producto' limit 1;
            v_motivo := public.v2_cancha_motivo(p_cita.company_id, coalesce(v_item, ''), p_cita.slot_start, p_cita.slot_minutes, p_cita.id);
        else
            -- Una cita: cabe si hay aforo (y su profesional está libre), sin contarse a sí misma.
            v_motivo := public.v2_hueco(p_cita.company_id, p_cita.slot_start, coalesce(nullif(p_cita.slot_minutes, 0), 30),
                                        coalesce(p_cita.employee_id, ''), p_cita.id);
        end if;
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
           created_at  = case when p_cita.status = 'pending_payment' and not v_confirma
                              then extract(epoch from now())::bigint else created_at end
     where id = p_cita.id;

    return jsonb_build_object(
        'resultado', case when v_cubre then 'cobrada' when v_confirma then 'confirmada'
                          when p_cita.status = 'pending_payment' then 'parcial' else 'a_cuenta' end,
        'total', v_total, 'pagado', v_pagado, 'falta', greatest(v_total - v_pagado, 0), 'minimo', v_minimo);
end $$;

-- Igual que en la 0018, con el adelanto de cada reserva y si sigue apartada (el panel ya no adivina).
create or replace function public.comprobantes_panel(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', c.id, 'cliente', coalesce(nullif(l.name, ''), l.phone), 'telefono', l.phone, 'servicio', a.service, 'slot', a.slot_start,
            'total', t.total,
            'pagado', (select coalesce(sum(p.amount), 0) from public.pending_payments p where p.company_id = c.company_id and p.appointment_id = a.id),
            'url', c.url, 'monto', c.monto, 'metodo', c.metodo, 'motivo', c.motivo,
            'operacion', coalesce(c.operacion, ''),
            'adelanto', public.v2_adelanto_minimo(p_company, t.total),
            'apartada', a.status = 'pending_payment') order by c.creado_at)
          from public.comprobantes_web c
          join public.appointments a on a.id = c.appointment_id
          join public.leads l on l.id = c.lead_id
          cross join lateral (select coalesce(sum(s.price), 0) as total from public.appointment_services s where s.appointment_id = a.id) t
         where c.company_id = p_company and c.estado = 'revisar'), '[]'::jsonb);
end $$;

revoke execute on function public.v2_citas_cfg(text) from public, anon, authenticated;
revoke execute on function public.v2_adelanto_minimo(text, numeric) from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: tres filas «sí».
select 'v2_citas_cfg' as funcion, to_regprocedure('public.v2_citas_cfg(text)') is not null as existe
union all select 'v2_adelanto_minimo', to_regprocedure('public.v2_adelanto_minimo(text, numeric)') is not null
union all select 'comprobantes_panel', to_regprocedure('public.comprobantes_panel(text)') is not null;
