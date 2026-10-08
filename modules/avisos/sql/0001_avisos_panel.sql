-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA AVISOS · 0001 · Notificaciones push al dueño del negocio
--
-- Los eventos nacen en el bot y llegan aquí por el ESPEJO. No se toca el bot:
-- unos triggers sobre las tablas espejadas apuntan cada evento en
-- panel_push_events, y pg_cron (cada minuto) llama por pg_net a la web
-- (/api/avisos/despachar), que agrupa, respeta el silencio y envía.
--
-- MESURA, porque un aviso de más y nos desinstalan:
--   · Por tipo y configurable por dispositivo (prefs). Por defecto: pago,
--     reserva/pedido, WhatsApp caído y plan. «Cliente pide una persona», apagado.
--   · Ráfagas del mismo minuto → un solo aviso («3 reservas nuevas»): lo agrupa
--     la web.
--   · Horario de silencio por dispositivo (22:00–07:00 Lima por defecto): lo de
--     la noche sale como UN resumen a la hora de fin.
--   · Anti-avalancha del espejo: si el bot estuvo apagado y al volver sube filas
--     viejas, lo que tiene más de 30 min no avisa.
--   · WhatsApp caído: espera 5 min y se cancela si vuelve (los cortes de
--     segundos no avisan); como mucho 1 cada 6 h por negocio.
--   · Lo que hizo el propio dueño (registrar_pago, operation_id 'panel:…') no
--     le avisa a él.
--
-- APLICAR (Alvaro, en el SQL editor de Supabase), en este orden:
--   1. Este fichero entero.
--   2. Una vez, el secreto para que la base pueda llamar a la web:
--        select vault.create_secret('<el mismo CRON_SECRET de Vercel>', 'vendemia_cron_secret');
--   3. Probar con modules/avisos/sql/pruebas.sql (BEGIN … ROLLBACK).
--
-- Requiere: 0001–0006 de Fideliza (loyalty_srv_check y la clave del servidor),
-- y las extensiones pg_cron y pg_net (Supabase las trae; se activan abajo).
-- ═══════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- La web a la que llama la base. Si cambia el dominio, se cambia aquí.
create or replace function public.avisos_base_url()
returns text language sql immutable as $$ select 'https://vendemias.com'::text $$;

-- ── 1 · Suscripciones: un celular del dueño, para UN negocio ─────────────────
create table if not exists public.panel_push_subscriptions (
    id              uuid primary key default gen_random_uuid(),
    auth_user_id    uuid not null default auth.uid(),
    company_id      text not null references public.companies(id) on delete cascade,
    endpoint        text not null check (char_length(endpoint) between 20 and 1000),
    p256dh          text not null check (char_length(p256dh) between 20 and 200),
    auth            text not null check (char_length(auth) between 8 and 100),
    user_agent      text not null default '',
    prefs           jsonb not null default '{"pago":true,"reserva":true,"whatsapp":true,"plan":true,"persona":false}'::jsonb,
    -- Silencio en hora de Lima. Si desde > hasta, cruza la medianoche (22:00–07:00).
    silencio_desde  time default '22:00',
    silencio_hasta  time default '07:00',
    ultimo_resumen  date,
    last_sent_at    timestamptz,
    revoked_at      timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (endpoint, company_id)
);
create index if not exists ix_panel_push_subs_company on public.panel_push_subscriptions (company_id) where revoked_at is null;

alter table public.panel_push_subscriptions enable row level security;
grant select, insert, update, delete on public.panel_push_subscriptions to authenticated;

-- Cada uno las suyas, y solo de negocios de los que es miembro. Las claves del
-- navegador (p256dh/auth) no las ve nadie más.
drop policy if exists p_panel_push_subs_own on public.panel_push_subscriptions;
create policy p_panel_push_subs_own on public.panel_push_subscriptions
    for all to authenticated
    using (auth_user_id = auth.uid() and public.is_member(company_id))
    with check (auth_user_id = auth.uid() and public.is_member(company_id));

-- ── 2 · Eventos: lo que hay que contar, una fila por hecho ──────────────────
create table if not exists public.panel_push_events (
    id           bigserial primary key,
    company_id   text not null references public.companies(id) on delete cascade,
    tipo         text not null check (tipo in ('pago', 'reserva', 'whatsapp', 'plan', 'persona')),
    ref          text not null,
    datos        jsonb not null default '{}'::jsonb,
    creado       timestamptz not null default now(),
    not_before   timestamptz not null default now(),
    estado       text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'descartado', 'cancelado')),
    enviado_at   timestamptz,
    unique (company_id, tipo, ref)
);
create index if not exists ix_panel_push_events_pend on public.panel_push_events (not_before) where estado = 'pendiente';
create index if not exists ix_panel_push_events_company on public.panel_push_events (company_id, creado desc);

-- Sin políticas: nadie la lee desde la API. Solo los triggers y las srv.
alter table public.panel_push_events enable row level security;
revoke all on public.panel_push_events from anon, authenticated;

-- Apunta un evento. Si la fila de origen tiene más de 30 min, nace descartado:
-- es el espejo poniéndose al día, no algo que acaba de pasar.
create or replace function public.avisos_apuntar(
    p_company text, p_tipo text, p_ref text, p_datos jsonb,
    p_fila_creada timestamptz default now(), p_retraso interval default interval '0'
) returns void language plpgsql security definer set search_path = public as $$
begin
    insert into public.panel_push_events (company_id, tipo, ref, datos, not_before, estado)
    values (
        p_company, p_tipo, left(p_ref, 200), coalesce(p_datos, '{}'::jsonb), now() + p_retraso,
        case when p_fila_creada < now() - interval '30 minutes' then 'descartado' else 'pendiente' end
    )
    on conflict (company_id, tipo, ref) do nothing;
exception when others then
    -- Un aviso NUNCA puede tumbar el espejo: si algo falla aquí, se pierde el
    -- aviso, no la fila del bot.
    raise warning 'avisos_apuntar: %', sqlerrm;
end $$;
revoke execute on function public.avisos_apuntar(text, text, text, jsonb, timestamptz, interval) from public, anon, authenticated;

-- ── 3 · Triggers sobre lo que sube el espejo ─────────────────────────────────

-- Reserva/inscripción nueva. Solo las vivas: una cancelada que llega ya
-- cancelada no es noticia.
create or replace function public.avisos_tg_cita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.status in ('confirmed', 'pending_payment') then
        perform public.avisos_apuntar(new.company_id, 'reserva', 'cita:' || new.id,
            jsonb_build_object('clase', 'cita', 'lead_id', new.lead_id, 'servicio', new.service,
                               'slot', new.slot_start, 'estado', new.status),
            coalesce(to_timestamp(new.created_at), now()));
    end if;
    return null;
end $$;
drop trigger if exists avisos_cita on public.appointments;
create trigger avisos_cita after insert on public.appointments
    for each row execute function public.avisos_tg_cita();

-- Pedido nuevo: nace 'pending' cuando el cliente lo confirma con Mia.
create or replace function public.avisos_tg_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.status <> 'cancelled' then
        perform public.avisos_apuntar(new.company_id, 'reserva', 'pedido:' || new.id,
            jsonb_build_object('clase', 'pedido', 'lead_id', new.lead_id, 'total', new.total),
            coalesce(to_timestamp(new.created_at), now()));
    end if;
    return null;
end $$;
drop trigger if exists avisos_pedido on public.orders;
create trigger avisos_pedido after insert on public.orders
    for each row execute function public.avisos_tg_pedido();

-- Pago: comprobante por revisar (verified = 0) o verificado por Mia. Los que
-- apuntó el propio dueño desde el panel no le avisan a él.
create or replace function public.avisos_tg_pago() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if coalesce(new.operation_id, '') not like 'panel:%' then
        perform public.avisos_apuntar(new.company_id, 'pago', 'pago:' || new.id,
            jsonb_build_object('lead_id', new.lead_id, 'monto', new.amount, 'verificado', new.verified,
                               'cita', nullif(new.appointment_id, ''), 'pedido', nullif(new.order_id, '')),
            coalesce(to_timestamp(new.created_at), now()));
    end if;
    return null;
end $$;
drop trigger if exists avisos_pago on public.pending_payments;
create trigger avisos_pago after insert on public.pending_payments
    for each row execute function public.avisos_tg_pago();

-- WhatsApp: se cae → aviso a los 5 min (uno por franja de 6 h); vuelve antes →
-- se cancela.
create or replace function public.avisos_tg_whatsapp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if old.wa_connected and not new.wa_connected then
        perform public.avisos_apuntar(new.company_id, 'whatsapp',
            'wa:' || floor(extract(epoch from now()) / 21600)::bigint,
            jsonb_build_object('motivo', new.last_disconnect_reason), now(), interval '5 minutes');
    elsif new.wa_connected and not old.wa_connected then
        update public.panel_push_events set estado = 'cancelado'
         where company_id = new.company_id and tipo = 'whatsapp' and estado = 'pendiente';
    end if;
    return null;
end $$;
drop trigger if exists avisos_whatsapp on public.instances;
create trigger avisos_whatsapp after update of wa_connected on public.instances
    for each row execute function public.avisos_tg_whatsapp();

-- Cliente pide una persona (apagado por defecto en prefs).
create or replace function public.avisos_tg_persona() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.handoff_at is not null and new.handoff_at is distinct from old.handoff_at then
        perform public.avisos_apuntar(new.company_id, 'persona', 'handoff:' || new.id || ':' || new.handoff_at,
            jsonb_build_object('lead_id', new.id), coalesce(to_timestamp(new.handoff_at), now()));
    end if;
    return null;
end $$;
drop trigger if exists avisos_persona on public.leads;
create trigger avisos_persona after update of handoff_at on public.leads
    for each row execute function public.avisos_tg_persona();

-- Plan al 80 % / 100 %: cuando el bot pone avisado_* a 1 (una vez al mes).
-- consumo_mensual es de la 0036 del bot: si aún no existe, este trigger se
-- crea al volver a correr este fichero después de aplicarla.
create or replace function public.avisos_tg_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.avisado_80 = 1 and coalesce(old.avisado_80, 0) = 0 then
        perform public.avisos_apuntar(new.company_id, 'plan', 'plan80:' || new.mes,
            jsonb_build_object('nivel', 80, 'mes', new.mes, 'conversaciones', new.conversaciones));
    end if;
    if new.avisado_100 = 1 and coalesce(old.avisado_100, 0) = 0 then
        perform public.avisos_apuntar(new.company_id, 'plan', 'plan100:' || new.mes,
            jsonb_build_object('nivel', 100, 'mes', new.mes, 'conversaciones', new.conversaciones));
    end if;
    return null;
end $$;
do $$
begin
    if to_regclass('public.consumo_mensual') is not null then
        execute 'drop trigger if exists avisos_plan on public.consumo_mensual';
        execute 'create trigger avisos_plan after update on public.consumo_mensual
                 for each row execute function public.avisos_tg_plan()';
    end if;
end $$;

-- ── 4 · Lo que llama la web (con la clave del servidor, como loyalty_srv_*) ──

-- ¿Este momento cae en el silencio de esa suscripción? (hora de Lima)
create or replace function public.avisos_en_silencio(p_desde time, p_hasta time, p_ahora timestamptz default now())
returns boolean language sql stable as $$
    select case
        when p_desde is null or p_hasta is null or p_desde = p_hasta then false
        when p_desde < p_hasta then (p_ahora at time zone 'America/Lima')::time >= p_desde
                                 and (p_ahora at time zone 'America/Lima')::time <  p_hasta
        else (p_ahora at time zone 'America/Lima')::time >= p_desde
          or (p_ahora at time zone 'America/Lima')::time <  p_hasta
    end
$$;

-- Lo que hay que enviar ahora: eventos vencidos con sus destinatarios (las
-- suscripciones del negocio que quieren ese tipo y no están en silencio), y
-- los resúmenes de quien acaba de salir del silencio. Reclama los eventos
-- (pasan a 'enviado') en la misma llamada: dos despachos a la vez no repiten.
create or replace function public.panel_push_srv_pendientes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_eventos jsonb;
    v_resumenes jsonb;
begin
    perform public.loyalty_srv_check();

    with vencidos as (
        update public.panel_push_events e set estado = 'enviado', enviado_at = now()
         where e.id in (select id from public.panel_push_events
                         where estado = 'pendiente' and not_before <= now()
                         order by id limit 300 for update skip locked)
        returning e.*
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'company_id', v.company_id, 'tipo', v.tipo, 'datos', v.datos, 'creado', v.creado,
        'negocio', c.name, 'modo', c.business_mode,
        'cliente', coalesce(nullif(l.name, ''), l.phone),
        'destinos', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
              from public.panel_push_subscriptions s
             where s.company_id = v.company_id and s.revoked_at is null
               and coalesce((s.prefs ->> v.tipo)::boolean, v.tipo <> 'persona')
               and not public.avisos_en_silencio(s.silencio_desde, s.silencio_hasta)
        ), '[]'::jsonb)
    ) order by v.id), '[]'::jsonb)
      into v_eventos
      from vencidos v
      join public.companies c on c.id = v.company_id
      left join public.leads l on l.id = v.datos ->> 'lead_id';

    -- Resúmenes: suscripciones cuyo silencio terminó hace menos de 15 min y que
    -- hoy aún no lo recibieron. Cuenta lo que pasó durante su silencio.
    with listas as (
        -- fin = hoy a la hora en que termina su silencio, en hora de Lima.
        select s.*,
               ((now() at time zone 'America/Lima')::date + s.silencio_hasta) at time zone 'America/Lima' as fin
          from public.panel_push_subscriptions s
         where s.revoked_at is null and s.silencio_desde is not null and s.silencio_hasta is not null
           and s.silencio_desde <> s.silencio_hasta
           and (s.ultimo_resumen is null or s.ultimo_resumen < (now() at time zone 'America/Lima')::date)
    ), tocan as (
        select l.*,
               -- inicio del silencio que acaba de terminar
               (case when l.silencio_desde > l.silencio_hasta
                     then ((now() at time zone 'America/Lima')::date - 1 + l.silencio_desde)
                     else ((now() at time zone 'America/Lima')::date + l.silencio_desde) end) at time zone 'America/Lima' as inicio
          from listas l
         where now() >= l.fin and now() < l.fin + interval '15 minutes'
    ), marcadas as (
        update public.panel_push_subscriptions s set ultimo_resumen = (now() at time zone 'America/Lima')::date
          from tocan t where s.id = t.id
        returning s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
        'negocio', c.name, 'modo', c.business_mode,
        'conteos', (select coalesce(jsonb_object_agg(x.tipo, x.n), '{}'::jsonb) from (
            select e.tipo, count(*) as n from public.panel_push_events e
             where e.company_id = t.company_id and e.estado in ('enviado', 'pendiente')
               and e.creado >= t.inicio and e.creado < t.fin
               and coalesce((t.prefs ->> e.tipo)::boolean, e.tipo <> 'persona')
             group by e.tipo) x)
    )), '[]'::jsonb)
      into v_resumenes
      from tocan t join public.companies c on c.id = t.company_id
     where t.id in (select id from marcadas);

    return jsonb_build_object('eventos', v_eventos, 'resumenes', v_resumenes);
end $$;
revoke execute on function public.panel_push_srv_pendientes() from public, anon, authenticated;
grant execute on function public.panel_push_srv_pendientes() to anon;

-- Resultado del envío: da de baja lo caducado (404/410) y apunta la hora.
create or replace function public.panel_push_srv_resultado(p_enviados uuid[], p_caducados text[])
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.panel_push_subscriptions set last_sent_at = now()
     where id = any(coalesce(p_enviados, '{}'));
    update public.panel_push_subscriptions set revoked_at = now()
     where endpoint = any(coalesce(p_caducados, '{}')) and revoked_at is null;
    -- Higiene: los eventos de más de 30 días no le sirven a nadie.
    delete from public.panel_push_events where creado < now() - interval '30 days';
end $$;
revoke execute on function public.panel_push_srv_resultado(uuid[], text[]) from public, anon, authenticated;
grant execute on function public.panel_push_srv_resultado(uuid[], text[]) to anon;

-- ── 5 · El reloj: pg_cron + pg_net ───────────────────────────────────────────

-- Cada minuto: si hay algo vencido o alguien sale del silencio, llama a la web.
-- Sin nada que hacer no hace ninguna llamada.
create or replace function public.avisos_disparar() returns void
language plpgsql security definer set search_path = public as $$
declare v_secreto text;
begin
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

-- Fideliza: drenar su cola cada 5 min (hoy un «premio disponible» espera al
-- cron diario de Vercel). La ruta ya respeta su horario 09–20 y sus topes.
create or replace function public.avisos_fideliza_cron() returns void
language plpgsql security definer set search_path = public as $$
declare v_secreto text;
begin
    if not exists (select 1 from public.loyalty_outbox where status in ('pending', 'retry')) then
        return;
    end if;
    select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'vendemia_cron_secret' limit 1;
    if v_secreto is null then return; end if;
    perform net.http_get(
        url := public.avisos_base_url() || '/api/fideliza/cron',
        headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto),
        timeout_milliseconds := 55000
    );
end $$;
revoke execute on function public.avisos_fideliza_cron() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('vendemia-avisos', 'vendemia-fideliza');
select cron.schedule('vendemia-avisos', '* * * * *', $$select public.avisos_disparar()$$);
select cron.schedule('vendemia-fideliza', '*/5 * * * *', $$select public.avisos_fideliza_cron()$$);
