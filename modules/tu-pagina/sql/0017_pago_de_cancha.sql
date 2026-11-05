-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0017: a dónde se paga el adelanto de una cancha
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Al apartar una cancha, la página tiene que decir a qué número yapear. Ese número
-- vive en companies.payment_methods, el mismo que usa el bot para comprobar el
-- destinatario del comprobante: si la página tuviera el suyo, podrían no coincidir.
--
-- Solo salen Yape y Plin, y solo con la clave de servidor (loyalty_srv_check), como
-- las demás _srv_. Sin esta función la reserva funciona igual: la página dice
-- «escríbenos por WhatsApp para pagar» en vez del número.
--
-- Idempotente. Deshacer: scripts/pago-cancha-0017-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.tu_pagina_srv_pago(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_metodos jsonb;
begin
    perform public.loyalty_srv_check();
    select c.payment_methods::jsonb into v_metodos
      from public.tu_pagina p
      join public.companies c on c.id = p.company_id
     where p.slug = lower(p_slug) and p.publicada;
    if v_metodos is null or jsonb_typeof(v_metodos) <> 'array' then
        return jsonb_build_object('status', 'ok', 'metodos', '[]'::jsonb);
    end if;
    return jsonb_build_object('status', 'ok', 'metodos', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', m->>'type', 'numero', m->>'number', 'titular', coalesce(m->>'name', '')))
          from jsonb_array_elements(v_metodos) m
         where m->>'type' in ('yape', 'plin') and coalesce(m->>'number', '') <> ''), '[]'::jsonb));
exception when invalid_text_representation then
    -- Un payment_methods mal escrito no puede tumbar una reserva ya guardada.
    return jsonb_build_object('status', 'ok', 'metodos', '[]'::jsonb);
end $$;

revoke execute on function public.tu_pagina_srv_pago(text) from public;
grant execute on function public.tu_pagina_srv_pago(text) to anon;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Subir el comprobante en la página (secciones.canchas.comprobante = 'pagina' o 'ambos')
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- La IA lee y la web decide (dominio/comprobante.ts); aquí se guarda y se aplica, con el candado
-- del negocio. Las mismas reglas de dinero que el comprobante del bot: pending_payments con
-- operation_id e image_hash (así una operación no entra dos veces por los dos caminos), y al
-- confirmar se comprueba ESA cancha con v2_cancha_motivo. A diferencia del bot, exige el adelanto:
-- por debajo de secciones.canchas.adelanto la reserva sigue apartada.
--
-- Para tocar una reserva hacen falta su código y el celular con que se hizo. Si no coinciden, la
-- respuesta es la misma que si no existiera: no se puede probar códigos a ver cuál es real.

begin;

create table if not exists public.comprobantes_web (
    id             uuid primary key default gen_random_uuid(),
    company_id     text not null,
    appointment_id text not null,
    lead_id        text not null,
    codigo         text not null,
    url            text not null default '',
    image_hash     text not null,
    estado         text not null check (estado in ('revisar', 'aprobado', 'rechazado')),
    motivo         text not null default '',
    monto          numeric(12,2),
    metodo         text not null default '',
    operacion      text not null default '',
    destino        text not null default '',
    fecha_pago     text not null default '',
    revisado_por   text not null default '',
    creado_at      timestamptz not null default now(),
    revisado_at    timestamptz,
    unique (company_id, image_hash)
);
create index if not exists comprobantes_web_revisar on public.comprobantes_web (company_id, creado_at) where estado = 'revisar';
alter table public.comprobantes_web enable row level security;
revoke all on public.comprobantes_web from anon, authenticated;

-- La reserva por código y celular. null = no existe, no es de ese celular o el negocio no usa esto.
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

create or replace function public.comprobante_srv_repetido(p_slug text, p_codigo text, p_telefono text, p_hash text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_cita public.appointments;
begin
    perform public.loyalty_srv_check();
    v_cita := public.v2_comprobante_cita(p_slug, p_codigo, p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if exists (select 1 from public.comprobantes_web where company_id = v_cita.company_id and image_hash = p_hash)
       or exists (select 1 from public.pending_payments where company_id = v_cita.company_id and image_hash = p_hash) then
        return jsonb_build_object('status', 'repetida');
    end if;
    return jsonb_build_object('status', 'ok');
end $$;

-- Aplica un pago ya dado por bueno. Sin sitio, no registra nada: lo resuelve una persona.
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
           pagado_por  = case when v_cubre then p_quien else pagado_por end
     where id = p_cita.id;

    return jsonb_build_object(
        'resultado', case when v_cubre then 'cobrada' when v_confirma then 'confirmada'
                          when p_cita.status = 'pending_payment' then 'parcial' else 'a_cuenta' end,
        'total', v_total, 'pagado', v_pagado, 'falta', greatest(v_total - v_pagado, 0), 'minimo', v_minimo);
end $$;

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
    if v_op <> '' and (exists (select 1 from public.pending_payments where company_id = v_cita.company_id and operation_id = v_op)
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

create or replace function public.comprobantes_panel(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', c.id, 'cliente', coalesce(nullif(l.name, ''), l.phone), 'telefono', l.phone, 'servicio', a.service, 'slot', a.slot_start,
            'total', (select coalesce(sum(s.price), 0) from public.appointment_services s where s.appointment_id = a.id),
            'pagado', (select coalesce(sum(p.amount), 0) from public.pending_payments p where p.company_id = c.company_id and p.appointment_id = a.id),
            'url', c.url, 'monto', c.monto, 'metodo', c.metodo, 'motivo', c.motivo) order by c.creado_at)
          from public.comprobantes_web c
          join public.appointments a on a.id = c.appointment_id
          join public.leads l on l.id = c.lead_id
         where c.company_id = p_company and c.estado = 'revisar'), '[]'::jsonb);
end $$;

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
    if v_c.operacion <> '' and exists (select 1 from public.pending_payments where company_id = p_company and operation_id = v_c.operacion) then
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

do $$
declare f text;
begin
    foreach f in array array[
        'v2_comprobante_cita(text, text, text)',
        'v2_comprobante_aplicar(public.appointments, numeric, text, text, text, text, text)',
        'comprobante_srv_buscar(text, text, text)',
        'comprobante_srv_repetido(text, text, text, text)',
        'comprobante_srv_registrar(text, text, text, jsonb)',
        'comprobantes_panel(text)',
        'comprobante_revisar(text, uuid, text, numeric, text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
    -- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
    foreach f in array array['comprobante_srv_buscar(text, text, text)', 'comprobante_srv_repetido(text, text, text, text)', 'comprobante_srv_registrar(text, text, text, jsonb)'] loop
        execute format('grant execute on function public.%s to anon', f);
    end loop;
    -- El panel, con la sesión del dueño.
    foreach f in array array['comprobantes_panel(text)', 'comprobante_revisar(text, uuid, text, numeric, text)'] loop
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Validar pago desde el tablero de canchas (dueño o administrador)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Para el pago que se vio fuera de la página: en la app de Yape, en el chat o en efectivo. Las
-- mismas reglas que un comprobante validado (v2_comprobante_aplicar): el adelanto confirma una
-- apartada, y solo si ESA cancha sigue libre. La operación empieza por 'panel:', así que no suena
-- un aviso de pago por lo que acaba de hacer una persona.

begin;

create or replace function public.cancha_validar_pago(p_company text, p_appointment text, p_monto numeric, p_metodo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cita  public.appointments;
    v_total numeric;
    v_pagado numeric;
    v_r     jsonb;
begin
    -- Sin el segundo argumento, el empleado no pasa: el dinero es del dueño y del administrador.
    perform public.v2_autorizar_agenda(p_company);
    if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto que recibiste.'; end if;
    if p_metodo not in ('yape', 'plin', 'cash', 'bank_transfer') then raise exception 'Elige cómo te pagaron.'; end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    select * into v_cita from public.appointments where id = p_appointment and company_id = p_company;
    if not found then raise exception 'Esa reserva no es de este negocio.'; end if;
    if v_cita.status not in ('pending_payment', 'confirmed', 'completed') then
        raise exception 'Esta reserva está cancelada: no se le registra un pago.';
    end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Esta reserva ya está cobrada completa.'; end if;

    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id;
    if p_monto > v_total - v_pagado then
        raise exception 'Le faltan S/ %: no se puede registrar más que eso.', greatest(v_total - v_pagado, 0);
    end if;

    v_r := public.v2_comprobante_aplicar(v_cita, p_monto, p_metodo, 'panel:' || gen_random_uuid(), '', '', 'panel');
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

revoke execute on function public.cancha_validar_pago(text, text, numeric, text) from public, anon, authenticated;
grant execute on function public.cancha_validar_pago(text, text, numeric, text) to authenticated;

commit;
