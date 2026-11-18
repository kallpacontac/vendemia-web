-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0032: comprobantes con menos fraude, «cotejar en tu Yape» y recordatorio a los 15 min
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 17-nov-2026: validar con IA las capturas de las citas, sabiendo que en
-- Perú circulan apps que fabrican comprobantes de Yape/Plin y que ya hay condenas por capturas
-- editadas con IA (Huancavelica, oct-2026). Una imagen sola NUNCA prueba que el dinero llegó:
-- la IA confirma al cliente al momento, pero el dueño coteja después con su app.
--
--   1. comprobantes_web guarda el código de seguridad de Yape (3 dígitos que salen también en
--      la notificación del que recibe) y si el dueño ya lo cotejó (cotejo: '' | llego | no_llego).
--   2. comprobante_srv_buscar dice además cuándo se hizo la reserva (un pago de antes no es de
--      ella) y si ese celular ya mandó un comprobante que «no llegó» (entonces va a revisión).
--   3. comprobante_srv_registrar guarda el código de seguridad.
--   4. comprobantes_panel lo enseña; comprobantes_por_cotejar lista los validados solos de los
--      últimos 7 días que el dueño no ha cotejado; comprobante_cotejar los marca:
--        · «Llegó»     → queda cotejado.
--        · «No llegó»  → se borra ese pago, la cita se cancela si se queda sin el adelanto y el
--                        celular queda marcado (sus próximas capturas las revisa una persona).
--   5. Recordatorio: un comprobante que lleva 15 min por revisar avisa otra vez al dueño (push) y
--      le manda un correo (lo envía /api/avisos/despachar con datos.correos). Una sola vez.
--
-- Necesita: tu-pagina 0017, 0018, 0021; avisos 0004. Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Columnas ──────────────────────────────────────────────────────────────
alter table public.comprobantes_web add column if not exists codigo_seguridad text not null default '';
alter table public.comprobantes_web add column if not exists cotejo text not null default '';
alter table public.comprobantes_web add column if not exists cotejado_at timestamptz;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'comprobantes_web_cotejo_check') then
        alter table public.comprobantes_web add constraint comprobantes_web_cotejo_check check (cotejo in ('', 'llego', 'no_llego'));
    end if;
end $$;
create index if not exists comprobantes_web_por_cotejar on public.comprobantes_web (company_id, creado_at)
    where estado = 'aprobado' and revisado_por = 'automatico' and cotejo = '';

-- ── 2 · Buscar la reserva: + cuándo se hizo y si el celular ya falló un cotejo ──
create or replace function public.comprobante_srv_buscar(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_cita public.appointments;
    v_cfg  jsonb;
    v_val  text;
    v_met  text;
    v_extra jsonb;
begin
    perform public.loyalty_srv_check();
    v_cita := public.v2_comprobante_cita(p_slug, p_codigo, p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if v_cita.status not in ('pending_payment', 'confirmed') then return jsonb_build_object('status', 'vencida'); end if;
    if coalesce(v_cita.pagado_por, '') <> '' then return jsonb_build_object('status', 'cobrada'); end if;
    if (select count(*) from public.comprobantes_web where appointment_id = v_cita.id) >= 6 then
        return jsonb_build_object('status', 'demasiados');
    end if;
    -- created_at NO sirve: es el ancla del plazo (0018, 0024). La hora real está en pagina_idem.
    v_extra := jsonb_build_object(
        'reservada_ms', (select round(extract(epoch from min(i.creado_at)) * 1000)
                           from public.pagina_idem i where i.company_id = v_cita.company_id and i.ref_id = v_cita.id),
        'sospechoso', exists (select 1 from public.comprobantes_web w
                               where w.company_id = v_cita.company_id and w.lead_id = v_cita.lead_id and w.cotejo = 'no_llego'));
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
                              where m->>'type' in ('yape', 'plin') and coalesce(m->>'number', '') <> ''), '[]'::jsonb)) || v_extra;
exception when invalid_text_representation then
    return jsonb_build_object('status', 'ok', 'company_id', v_cita.company_id, 'validacion', 'manual', 'numeros', '[]'::jsonb) || coalesce(v_extra, '{}'::jsonb);
end $$;

-- ── 3 · Registrar: igual que en la 0018, guardando el código de seguridad ──────
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
    v_cod      text := left(regexp_replace(coalesce(p_datos->>'codigo_seguridad', ''), '\D', '', 'g'), 6);
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
                v_motivo := 'Pagó, pero la hora ya no está libre: ' || (v_r->>'motivo') || '. Dale otra hora o devuélvele el dinero.';
            end if;
        end if;
    end if;

    v_estado := case v_decision when 'aprobar' then 'aprobado' when 'revisar' then 'revisar' else 'rechazado' end;
    insert into public.comprobantes_web (company_id, appointment_id, lead_id, codigo, url, image_hash, estado, motivo, monto, metodo, operacion, destino, fecha_pago, revisado_por, revisado_at, codigo_seguridad)
    values (v_cita.company_id, v_cita.id, v_cita.lead_id, upper(btrim(p_codigo)), v_url, v_hash, v_estado, v_motivo, v_monto, v_metodo, v_op,
            coalesce(p_datos->>'destino', ''), coalesce(p_datos->>'fecha_pago', ''),
            case when v_estado = 'aprobado' then 'automatico' else '' end,
            case when v_estado = 'aprobado' then now() end,
            v_cod);

    if v_decision = 'aprobar' then return jsonb_build_object('status', 'ok') || v_r; end if;
    if v_decision = 'rechazar' then return jsonb_build_object('status', 'ok', 'resultado', 'rechazado', 'motivo', v_motivo); end if;

    -- Por revisar: el cliente ya hizo su parte. Que el plazo no le quite la hora mientras
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

-- ── 4 · Panel ─────────────────────────────────────────────────────────────────
-- Igual que en la 0021, con el código de seguridad.
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
            'codigo_seguridad', c.codigo_seguridad,
            'adelanto', public.v2_adelanto_minimo(p_company, t.total),
            'apartada', a.status = 'pending_payment') order by c.creado_at)
          from public.comprobantes_web c
          join public.appointments a on a.id = c.appointment_id
          join public.leads l on l.id = c.lead_id
          cross join lateral (select coalesce(sum(s.price), 0) as total from public.appointment_services s where s.appointment_id = a.id) t
         where c.company_id = p_company and c.estado = 'revisar'), '[]'::jsonb);
end $$;

-- Los que la IA dio por buenos y nadie ha mirado en su app: 7 días, los más nuevos primero.
create or replace function public.comprobantes_por_cotejar(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', c.id, 'cliente', coalesce(nullif(l.name, ''), l.phone), 'telefono', l.phone,
            'servicio', a.service, 'slot', a.slot_start, 'estado_cita', a.status,
            'monto', c.monto, 'metodo', c.metodo, 'operacion', c.operacion, 'codigo_seguridad', c.codigo_seguridad,
            'fecha_pago', c.fecha_pago, 'url', c.url, 'creado', c.creado_at) order by c.creado_at desc)
          from public.comprobantes_web c
          join public.appointments a on a.id = c.appointment_id
          join public.leads l on l.id = c.lead_id
         where c.company_id = p_company and c.estado = 'aprobado' and c.revisado_por = 'automatico' and c.cotejo = ''
           and c.creado_at > now() - interval '7 days'), '[]'::jsonb);
end $$;

-- «Llegó» / «No llegó». Solo dueño y administrador (v2_autorizar_agenda sin empleado).
create or replace function public.comprobante_cotejar(p_company text, p_id uuid, p_llego boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_c       public.comprobantes_web;
    v_cita    public.appointments;
    v_lead    public.leads;
    v_total   numeric;
    v_pagado  numeric;
    v_cancela boolean := false;
    v_msg     text;
begin
    perform public.v2_autorizar_agenda(p_company);
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    select * into v_c from public.comprobantes_web
     where id = p_id and company_id = p_company and estado = 'aprobado' and revisado_por = 'automatico' and cotejo = '';
    if not found then raise exception 'Ese comprobante ya se cotejó.'; end if;

    if p_llego then
        update public.comprobantes_web set cotejo = 'llego', cotejado_at = now() where id = p_id;
        return jsonb_build_object('detalle', 'Listo: el pago consta como cotejado en tu app.');
    end if;

    -- No llegó: fuera ese pago (deja de contar en la Caja) y la cita, si se queda sin adelanto.
    delete from public.pending_payments
     where company_id = p_company and appointment_id = v_c.appointment_id and image_hash = v_c.image_hash;
    select * into v_cita from public.appointments where id = v_c.appointment_id and company_id = p_company;
    if found then
        select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
        select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id;
        v_cancela := v_cita.status in ('confirmed', 'pending_payment')
                     and v_pagado < public.v2_adelanto_minimo(p_company, v_total);
        update public.appointments
           set status     = case when v_cancela then 'cancelled' else status end,
               pagado_por = case when v_total > 0 and v_pagado >= v_total then pagado_por else '' end
         where id = v_cita.id;
    end if;
    update public.comprobantes_web
       set estado = 'rechazado', cotejo = 'no_llego', cotejado_at = now(), revisado_por = 'panel', revisado_at = now(),
           motivo = 'No llegó a tu app: lo marcaste en el panel.'
     where id = p_id;

    select * into v_lead from public.leads where id = v_c.lead_id;
    v_msg := 'Hola' || public.v2_primer_nombre(coalesce(v_lead.name, '')) || '. No encontramos en nuestra cuenta el pago de '
             || coalesce('S/ ' || to_char(v_c.monto, 'FM999990.00'), 'tu comprobante')
             || coalesce(' (operación ' || nullif(v_c.operacion, '') || ')', '')
             || case when v_cancela then ', así que tu reserva quedó cancelada' else '' end
             || '. Si fue un error, envíanos la constancia desde tu app y lo revisamos.';
    return jsonb_build_object(
        'detalle', case when v_cancela then 'Pago quitado de la Caja y reserva cancelada: la hora vuelve a estar libre.'
                        else 'Pago quitado de la Caja.' end,
        'cancelada', v_cancela, 'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
end $$;

-- ── 5 · Recordatorio a los 15 minutos (push + correo) ─────────────────────────
-- Uno por comprobante (avisos_apuntar no repite ref). Hasta 3 h: lo más viejo ya no es un recordatorio útil.
create or replace function public.avisos_comprobantes_esperando() returns void
language plpgsql security definer set search_path = public as $$
declare
    r record;
begin
    for r in
        select c.id, c.company_id, c.lead_id, c.monto, c.creado_at, a.service, a.slot_start
          from public.comprobantes_web c
          join public.appointments a on a.id = c.appointment_id
         where c.estado = 'revisar'
           and c.creado_at <= now() - interval '15 minutes'
           and c.creado_at > now() - interval '3 hours'
           and not exists (select 1 from public.panel_push_events e
                            where e.company_id = c.company_id and e.tipo = 'pago' and e.ref = 'comprobante_espera:' || c.id)
    loop
        perform public.avisos_apuntar(r.company_id, 'pago', 'comprobante_espera:' || r.id,
            jsonb_build_object('clase', 'comprobante_esperando', 'lead_id', r.lead_id, 'monto', r.monto,
                               'servicio', r.service, 'slot', r.slot_start,
                               'minutos', floor(extract(epoch from now() - r.creado_at) / 60),
                               'correos', coalesce((
                                   select jsonb_agg(distinct u.email)
                                     from public.memberships m join auth.users u on u.id::text = m.auth_user_id
                                    where m.company_id = r.company_id and m.role in ('owner', 'admin')
                                      and coalesce(u.email, '') <> ''), '[]'::jsonb)));
    end loop;
exception when others then
    raise warning 'avisos_comprobantes_esperando: %', sqlerrm;
end $$;
revoke execute on function public.avisos_comprobantes_esperando() from public, anon, authenticated;

-- El de la 0004, con el recordatorio de comprobantes antes de mirar si hay algo que mandar.
create or replace function public.avisos_disparar() returns void
language plpgsql security definer set search_path = public as $$
declare v_secreto text;
begin
    perform public.avisos_generar_recordatorios();
    perform public.avisos_comprobantes_esperando();
    if not exists (select 1 from public.panel_push_events where estado = 'pendiente' and not_before <= now())
       and not exists (
            select 1 from public.panel_push_subscriptions s
             where s.revoked_at is null and s.silencio_hasta is not null and s.silencio_desde <> s.silencio_hasta
               and (s.ultimo_resumen is null or s.ultimo_resumen < (now() at time zone 'America/Lima')::date)
               and (now() at time zone 'America/Lima')::time >= s.silencio_hasta
               and (now() at time zone 'America/Lima')::time <  s.silencio_hasta + interval '15 minutes')
    then
        return;
    end if;
    select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'vendemia_cron_secret' limit 1;
    if v_secreto is null then
        raise warning 'avisos_disparar: falta el secreto vendemia_cron_secret en Vault';
        return;
    end if;
    perform net.http_post(
        url := public.avisos_base_url() || '/api/avisos/despachar',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto, 'Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
    );
end $$;
revoke execute on function public.avisos_disparar() from public, anon, authenticated;

-- ── Permisos ──────────────────────────────────────────────────────────────────
do $$
declare
    f text;
begin
    foreach f in array array[
        'comprobante_srv_buscar(text, text, text)', 'comprobante_srv_registrar(text, text, text, jsonb)',
        'comprobantes_panel(text)', 'comprobantes_por_cotejar(text)', 'comprobante_cotejar(text, uuid, boolean)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
    -- La página, con la clave de servidor (loyalty_srv_check).
    foreach f in array array['comprobante_srv_buscar(text, text, text)', 'comprobante_srv_registrar(text, text, text, jsonb)'] loop
        execute format('grant execute on function public.%s to anon', f);
    end loop;
    -- El panel, con la sesión del dueño.
    foreach f in array array['comprobantes_panel(text)', 'comprobantes_por_cotejar(text)', 'comprobante_cotejar(text, uuid, boolean)'] loop
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: cuatro filas «sí».
select 'comprobantes_por_cotejar' as funcion, to_regprocedure('public.comprobantes_por_cotejar(text)') is not null as existe
union all select 'comprobante_cotejar', to_regprocedure('public.comprobante_cotejar(text, uuid, boolean)') is not null
union all select 'avisos_comprobantes_esperando', to_regprocedure('public.avisos_comprobantes_esperando()') is not null
union all select 'columna cotejo', exists (select 1 from information_schema.columns where table_name = 'comprobantes_web' and column_name = 'cotejo');

-- ── Deshacer (a mano, si hiciera falta) ───────────────────────────────────────
-- Vuelve a correr la 0021 (buscar, panel) y la 0018 (registrar) y avisos 0004 (avisos_disparar);
-- luego: drop function public.comprobantes_por_cotejar(text); drop function public.comprobante_cotejar(text, uuid, boolean);
--        drop function public.avisos_comprobantes_esperando();
-- Las columnas nuevas pueden quedarse: nadie más las lee.
