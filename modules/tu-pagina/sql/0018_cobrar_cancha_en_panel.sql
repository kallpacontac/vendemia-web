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
--   · comprobantes_panel   Trae también el número de operación leído de la captura.
--   · Validar el n.º de operación se puede apagar por negocio (secciones.canchas.validarOperacion
--                      = false): se sigue leyendo, guardando y mostrando, pero una operación repetida
--                      ya no se rechaza. Para demos. Por defecto, encendido. Ver
--                      scripts/zona-gol-demo-sin-validar-operacion.sql y su reverso.
--   · v2_comprobante_aplicar   Un pago que no llega al adelanto (S/ 20 de S/ 40) da otro plazo
--                      completo desde ese pago, para que no pierda la cancha mientras paga el resto.
--
-- Todas: solo el dueño y el administrador de ESE negocio (v2_autorizar_agenda).
-- Deshacer: scripts/cobrar-cancha-0018-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ¿Se rechaza una operación repetida en este negocio? Sí, salvo validarOperacion = false.
create or replace function public.v2_valida_operacion(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce(public.v2_canchas_cfg(p_company) ->> 'validarOperacion', 'true') <> 'false';
$$;
revoke execute on function public.v2_valida_operacion(text) from public, anon, authenticated;

-- Igual que en la 0017, con el interruptor de la operación repetida.
create or replace function public.comprobante_srv_registrar(p_slug text, p_codigo text, p_telefono text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cita     public.appointments;
    v_decision text := p_datos->>'decision';
    v_motivo   text := coalesce(p_datos->>'motivo', '');
    v_hash     text := coalesce(p_datos->>'hash', '');
    v_op       text := coalesce(p_datos->>'operacion', '');
    v_url      text := coalesce(p_datos->>'url', '');
    v_metodo   text := coalesce(p_datos->>'metodo', '');
    v_monto    numeric;
    v_r        jsonb;
    v_estado   text;
begin
    perform public.loyalty_srv_check();
    if v_hash !~ '^[0-9a-f]{64}$' or v_decision not in ('aprobar', 'revisar', 'rechazar') then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    begin
        v_monto := (p_datos->>'monto')::numeric;
    exception when others then
        v_monto := null;
    end;

    v_cita := public.v2_comprobante_cita(p_slug, p_codigo, p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_cita.company_id));
    -- Otra vez, ya con el candado: pudo cancelarse o cobrarse mientras se leía la captura.
    select * into v_cita from public.appointments where id = v_cita.id;
    if v_cita.status not in ('pending_payment', 'confirmed') then return jsonb_build_object('status', 'vencida'); end if;
    if coalesce(v_cita.pagado_por, '') <> '' then return jsonb_build_object('status', 'cobrada'); end if;

    if exists (select 1 from public.comprobantes_web where company_id = v_cita.company_id and image_hash = v_hash)
       or exists (select 1 from public.pending_payments where company_id = v_cita.company_id and image_hash = v_hash) then
        return jsonb_build_object('status', 'repetida');
    end if;
    if v_op <> '' and public.v2_valida_operacion(v_cita.company_id)
       and (exists (select 1 from public.pending_payments where company_id = v_cita.company_id and operation_id = v_op)
                       or exists (select 1 from public.comprobantes_web where company_id = v_cita.company_id and operacion = v_op and estado <> 'rechazado')) then
        return jsonb_build_object('status', 'operacion_repetida', 'operacion', v_op);
    end if;

    if v_decision = 'aprobar' then
        if v_monto is null or v_monto <= 0 then
            v_decision := 'revisar';
            v_motivo := 'No se ve el monto.';
        else
            v_r := public.v2_comprobante_aplicar(v_cita, v_monto, v_metodo, v_op, v_hash, v_url, 'voucher');
            if v_r->>'resultado' = 'sin_sitio' then
                v_decision := 'revisar';
                v_motivo := 'Pagó, pero la cancha ya no está libre: ' || (v_r->>'motivo') || '. Dale otra hora o devuélvele el dinero.';
            end if;
        end if;
    end if;

    v_estado := case v_decision when 'aprobar' then 'aprobado' when 'revisar' then 'revisar' else 'rechazado' end;
    insert into public.comprobantes_web (company_id, appointment_id, lead_id, codigo, url, image_hash, estado, motivo, monto, metodo, operacion, destino, fecha_pago, revisado_por, revisado_at)
    values (v_cita.company_id, v_cita.id, v_cita.lead_id, upper(btrim(p_codigo)), v_url, v_hash, v_estado, v_motivo, v_monto, v_metodo, v_op,
            coalesce(p_datos->>'destino', ''), coalesce(p_datos->>'fecha_pago', ''),
            case when v_estado = 'aprobado' then 'automatico' else '' end,
            case when v_estado = 'aprobado' then now() end);

    if v_decision = 'aprobar' then return jsonb_build_object('status', 'ok') || v_r; end if;
    if v_decision = 'rechazar' then return jsonb_build_object('status', 'ok', 'resultado', 'rechazado', 'motivo', v_motivo); end if;

    -- Por revisar: el cliente ya hizo su parte. Que el plazo no le quite la cancha mientras
    -- alguien mira la captura: se cuenta otra vez desde ahora (como mucho 6 veces por reserva).
    if v_cita.status = 'pending_payment' then
        update public.appointments set created_at = extract(epoch from now())::bigint where id = v_cita.id;
    end if;
    begin
        perform public.avisos_apuntar(v_cita.company_id, 'pago', 'comprobante:' || v_hash,
            jsonb_build_object('clase', 'comprobante_por_revisar', 'servicio', v_cita.service, 'slot', v_cita.slot_start));
    exception when others then
        raise warning 'comprobante_srv_registrar: aviso: %', sqlerrm;
    end;
    return jsonb_build_object('status', 'ok', 'resultado', 'revisar');
end $$;

-- Igual que en la 0017, con el interruptor de la operación repetida.
create or replace function public.comprobante_revisar(p_company text, p_id uuid, p_accion text, p_monto numeric, p_metodo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_c    public.comprobantes_web;
    v_cita public.appointments;
    v_r    jsonb;
begin
    perform public.v2_autorizar_agenda(p_company);
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    select * into v_c from public.comprobantes_web where id = p_id and company_id = p_company and estado = 'revisar';
    if not found then raise exception 'Ese comprobante ya se revisó.'; end if;

    if p_accion = 'rechazar' then
        update public.comprobantes_web set estado = 'rechazado', revisado_por = 'panel', revisado_at = now() where id = p_id;
        return jsonb_build_object('detalle', 'Comprobante rechazado.');
    end if;
    if p_accion <> 'aprobar' then raise exception 'Acción no válida.'; end if;
    if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto que ves en el comprobante.'; end if;

    select * into v_cita from public.appointments where id = v_c.appointment_id and company_id = p_company;
    if not found or v_cita.status not in ('pending_payment', 'confirmed') then
        raise exception 'Esta reserva ya no está activa: fue cancelada. Devuélvele el dinero o dale otra hora.';
    end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Esta reserva ya consta cobrada entera.'; end if;
    if v_c.operacion <> '' and public.v2_valida_operacion(p_company)
       and exists (select 1 from public.pending_payments where company_id = p_company and operation_id = v_c.operacion) then
        raise exception 'La operación #% ya fue registrada antes.', v_c.operacion;
    end if;

    v_r := public.v2_comprobante_aplicar(v_cita, p_monto, p_metodo, v_c.operacion, v_c.image_hash, v_c.url, 'panel');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Mueve la reserva a otra hora y vuelve a aprobar.', v_r->>'motivo';
    end if;
    update public.comprobantes_web set estado = 'aprobado', monto = p_monto, metodo = coalesce(p_metodo, metodo), revisado_por = 'panel', revisado_at = now() where id = p_id;
    return v_r || jsonb_build_object('detalle', case v_r->>'resultado'
        when 'parcial' then 'Pago registrado, pero no alcanza el adelanto: sigue apartada. Faltan S/ ' || ((v_r->>'minimo')::numeric - (v_r->>'pagado')::numeric) || ' para confirmarla.'
        when 'cobrada' then 'Pago registrado. Reserva confirmada y cobrada completa.'
        else 'Pago registrado. Reserva confirmada. Faltan S/ ' || (v_r->>'falta') || '. Avísale al cliente por WhatsApp.' end);
end $$;

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

-- Igual que en la 0017, con el número de operación para «Por revisar».
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

revoke execute on function public.cancha_codigos(text, text[]) from public, anon, authenticated;
revoke execute on function public.cancha_buscar(text, text) from public, anon, authenticated;
revoke execute on function public.cancha_validar_pago(text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cancha_codigos(text, text[]) to authenticated;
grant execute on function public.cancha_buscar(text, text) to authenticated;
grant execute on function public.cancha_validar_pago(text, text, numeric, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
