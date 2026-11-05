-- ═══════════════════════════════════════════════════════════════════════════════
-- 0018 · Cobrar una cancha desde el panel: buscar por código y foto del pago
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 5-nov-2026. Se corre entero en el editor SQL. Necesita la 0017.
--
--   · cancha_codigos   Los códigos R-XXXX de las reservas que se ven en la lista del panel.
--                      La tabla de códigos (pagina_idem) sigue cerrada al navegador.
--   · cancha_buscar    Encontrar una reserva por código, nombre o celular, de cualquier día
--                      (los últimos 30 y los que vienen): el cliente llega y dice «R-7K2Q».
--   · cancha_validar_pago   Ahora guarda también la foto del pago (p_url) y rechaza la misma
--                      foto o la misma operación dos veces. Los argumentos nuevos son
--                      opcionales: el panel de antes sigue funcionando igual.
--   · v2_comprobante_aplicar   Un pago que no llega al adelanto (S/ 20 de S/ 40) da otro plazo
--                      completo desde ese pago, para que no pierda la cancha mientras paga el resto.
--
-- Todas: solo el dueño y el administrador de ESE negocio (v2_autorizar_agenda).
-- Deshacer: scripts/cobrar-cancha-0018-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.cancha_codigos(p_company text, p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(array_length(p_ids, 1), 0) > 500 then raise exception 'Demasiadas reservas de una vez.'; end if;
    return coalesce((
        select jsonb_object_agg(i.ref_id, i.codigo)
          from public.pagina_idem i
         where i.company_id = p_company and i.ref_id = any(p_ids) and coalesce(i.codigo, '') <> ''), '{}'::jsonb);
end $$;

create or replace function public.cancha_buscar(p_company text, p_texto text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_txt   text := btrim(coalesce(p_texto, ''));
    v_cod   text := upper(regexp_replace(btrim(coalesce(p_texto, '')), '\s', '', 'g'));
    v_dig   text := regexp_replace(coalesce(p_texto, ''), '\D', '', 'g');
    v_nom   text;
    v_ahora text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_desde text := to_char((now() at time zone 'America/Lima')::date - 30, 'YYYY-MM-DD');
begin
    perform public.v2_autorizar_agenda(p_company);
    if length(v_txt) < 3 then return '[]'::jsonb; end if;
    -- El nombre se busca tal cual: sin comodines de quien escribe.
    v_nom := '%' || replace(replace(replace(v_txt, '\', '\\'), '%', '\%'), '_', '\_') || '%';

    return coalesce((
        select jsonb_agg(s.fila order by s.n)
          from (select jsonb_build_object(
                           'id', a.id, 'slot', a.slot_start, 'servicio', a.service, 'estado', a.status,
                           'cliente', coalesce(nullif(l.name, ''), l.phone), 'telefono', l.phone,
                           'codigo', coalesce(i.codigo, '')) as fila,
                       -- Primero lo que viene (la más cercana arriba); después lo que ya pasó.
                       row_number() over (order by a.slot_start < v_ahora,
                                                   case when a.slot_start >= v_ahora then a.slot_start end,
                                                   a.slot_start desc) as n
                  from public.appointments a
                  join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
                  left join public.pagina_idem i on i.company_id = a.company_id and i.ref_id = a.id
                 where a.company_id = p_company
                   and a.status in ('pending_payment', 'confirmed', 'completed')
                   and a.slot_start >= v_desde
                   and (i.codigo = v_cod or i.codigo = 'R-' || v_cod
                        or (length(v_dig) >= 6 and l.phone like '%' || v_dig)
                        or l.name ilike v_nom)
                 order by n
                 limit 15) s), '[]'::jsonb);
end $$;

-- Igual que en la 0017, salvo el plazo tras un pago parcial (ver created_at).
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

-- La de la 0017 tenía 4 argumentos: se quita para que no haya dos con el mismo nombre.
drop function if exists public.cancha_validar_pago(text, text, numeric, text);

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
    if v_op <> '' and exists (select 1 from public.pending_payments where company_id = p_company and operation_id = v_op) then
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

revoke execute on function public.cancha_codigos(text, text[]) from public, anon, authenticated;
revoke execute on function public.cancha_buscar(text, text) from public, anon, authenticated;
revoke execute on function public.cancha_validar_pago(text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cancha_codigos(text, text[]) to authenticated;
grant execute on function public.cancha_buscar(text, text) to authenticated;
grant execute on function public.cancha_validar_pago(text, text, numeric, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
