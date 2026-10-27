-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA AVISOS · 0004 · Avisos al empleado: SU agenda (27-oct-2026)
--
-- Pedido de Alvaro: el barbero / profesor tiene que enterarse en el celular de lo
-- suyo («te acaban de asignar una cita», «tienes una cita a las 4:30»), y al tocar
-- el aviso caer en su agenda, en ese día. Hasta hoy los avisos eran solo del dueño
-- y del administrador (0002), y el empleado ni siquiera podía suscribirse.
--
-- Dos tipos nuevos en panel_push_events:
--
--   · 'mi_agenda' — un cambio en una cita que es de alguien del equipo:
--        nueva      entra una cita con él (o sin nadie: la ven todos los empleados)
--        asignada   se la pasan a él
--        quitada    se la pasan a otro
--        movida     cambia la hora
--        cancelada  se cancela
--     En una academia, `nueva` es un alumno nuevo en un grupo (las renovaciones no:
--     el profesor ya lo tiene).
--
--   · 'recordatorio' — 15 min antes de cada cita CONFIRMADA con empleado. No se
--     apunta al crear la cita, sino que lo genera el reloj de cada minuto
--     (avisos_generar_recordatorios): así una cita movida o cancelada no deja un
--     recordatorio colgado que haya que ir a buscar y anular.
--
-- A quién van (avisos_para_equipo): a quien tenga ENLAZADA la ficha de ese empleado
-- (memberships.employee_id), sea cual sea su rol: el dueño que también corta pelo
-- recibe sus recordatorios. Una cita «nueva» no se le repite al dueño ni al
-- administrador: ya les llega como 'reserva'. Las «sin asignar», solo a empleados.
--
-- Qué NO llevan: ni importes ni teléfonos. El nombre del cliente sí (lo ve en Mi
-- agenda); si el cliente no tiene nombre, el aviso dice «Cliente», no su número.
--
-- Lo demás no cambia: los otros tipos siguen siendo solo del dueño y del
-- administrador (avisos_recibe), y los resúmenes de la mañana tampoco cuentan
-- estos dos tipos (son de otra persona).
--
-- APLICAR después de la 0003 de este módulo. Prueba: pruebas_0004.sql (BEGIN … ROLLBACK).
-- Deshacer: 0004_avisos_al_equipo_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if to_regprocedure('public.avisos_recibe(uuid, text)') is null then
        raise exception 'Falta avisos_recibe: aplica antes modules/avisos/sql/0002_avisos_por_rol.sql.';
    end if;
    if not exists (select 1 from pg_constraint where conname = 'panel_push_events_tipo_chk') then
        raise exception 'Falta la 0003 de avisos (tipos stock y por_aprobar): aplícala antes.';
    end if;
end $$;

-- ── 1 · Los tipos ─────────────────────────────────────────────────────────────
alter table public.panel_push_events drop constraint panel_push_events_tipo_chk;
alter table public.panel_push_events add constraint panel_push_events_tipo_chk
    check (tipo in ('pago', 'reserva', 'whatsapp', 'plan', 'persona', 'stock', 'por_aprobar',
                    'mi_agenda', 'recordatorio'));

-- ── 2 · A quién le toca un aviso del equipo ───────────────────────────────────
-- `datos.empleado` = la ficha (employees.id) de quien atiende; '' = sin asignar.
create or replace function public.avisos_para_equipo(p_user uuid, p_company text, p_tipo text, p_datos jsonb)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.memberships m
         where m.auth_user_id = p_user::text and m.company_id = p_company
           and case
                 when coalesce(p_datos ->> 'empleado', '') = '' then
                     -- Sin asignar: todo el equipo, menos quien ya recibe la 'reserva'.
                     p_tipo = 'mi_agenda' and m.role not in ('owner', 'admin')
                 else
                     coalesce(m.employee_id, '') = p_datos ->> 'empleado'
                     and not (p_datos ->> 'que' = 'nueva' and m.role in ('owner', 'admin'))
               end
    );
$$;
revoke execute on function public.avisos_para_equipo(uuid, text, text, jsonb) from public, anon, authenticated;

-- ── 3 · Lo que cambia en una cita ─────────────────────────────────────────────
create or replace function public.avisos_tg_agenda_equipo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_ahora   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_puntual boolean := new.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$';
    v_viva    boolean := new.status in ('confirmed', 'pending_payment');
    v_antes   boolean;
    v_base    jsonb;
    v_t       text := floor(extract(epoch from clock_timestamp()))::text;
    v_emp     text := coalesce(new.employee_id, '');
    v_old_emp text;
begin
    begin
        -- Lo que ya pasó no es noticia (el espejo poniéndose al día, una corrección).
        if v_puntual and new.slot_start < v_ahora then return null; end if;

        v_base := jsonb_build_object(
            'cita', new.id, 'lead_id', new.lead_id, 'servicio', coalesce(new.service, ''),
            'slot', new.slot_start, 'recurrente', not v_puntual,
            -- to_jsonb: si la columna no existe en este negocio, sale null y no falla.
            'beneficiario', nullif(btrim(coalesce(to_jsonb(new) ->> 'beneficiario', '')), ''));

        if tg_op = 'INSERT' then
            if not v_viva then return null; end if;
            -- Academia: una renovación del mismo grupo no es un alumno nuevo.
            if not v_puntual and exists (
                select 1 from public.appointments a
                 where a.company_id = new.company_id and a.lead_id = new.lead_id and a.id <> new.id
                   and a.slot_start = new.slot_start and a.status <> 'cancelled') then
                return null;
            end if;
            perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:nueva:' || new.id,
                v_base || jsonb_build_object('que', 'nueva', 'empleado', v_emp),
                coalesce(to_timestamp(new.created_at), now()));
            return null;
        end if;

        -- UPDATE. Las academias solo avisan del alumno nuevo: el resto es de cobro.
        if not v_puntual then return null; end if;
        v_antes   := old.status in ('confirmed', 'pending_payment');
        v_old_emp := coalesce(old.employee_id, '');

        if v_antes and new.status = 'cancelled' then
            if v_old_emp <> '' then
                perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:cancelada:' || new.id || ':' || v_t,
                    v_base || jsonb_build_object('que', 'cancelada', 'empleado', v_old_emp));
            end if;
        elsif v_viva and v_emp is distinct from v_old_emp then
            if v_emp <> '' then
                perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:asignada:' || new.id || ':' || v_t,
                    v_base || jsonb_build_object('que', 'asignada', 'empleado', v_emp));
            end if;
            if v_old_emp <> '' then
                perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:quitada:' || new.id || ':' || v_t,
                    v_base || jsonb_build_object('que', 'quitada', 'empleado', v_old_emp));
            end if;
        elsif v_viva and new.slot_start is distinct from old.slot_start and v_emp <> '' then
            perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:movida:' || new.id || ':' || v_t,
                v_base || jsonb_build_object('que', 'movida', 'empleado', v_emp, 'antes', old.slot_start));
        end if;
    exception when others then
        -- Un aviso nunca tumba el cambio de la cita.
        raise warning 'avisos_tg_agenda_equipo: %', sqlerrm;
    end;
    return null;
end $$;
revoke execute on function public.avisos_tg_agenda_equipo() from public, anon, authenticated;

drop trigger if exists avisos_agenda_equipo on public.appointments;
create trigger avisos_agenda_equipo
    after insert or update of employee_id, slot_start, status on public.appointments
    for each row execute function public.avisos_tg_agenda_equipo();

-- ── 4 · Los recordatorios: 15 min antes ───────────────────────────────────────
-- Las citas confirmadas que empiezan dentro de 15 min, con empleado, de negocios
-- donde ESE empleado tiene el celular suscrito (si nadie lo va a recibir, no se
-- apunta nada). La `ref` lleva la hora y el empleado: si la cita se mueve o pasa a
-- otro, el recordatorio nuevo es otro, y el viejo nunca llega a generarse.
-- Una cita creada hace menos de 15 min no se recuerda: acaba de llegar su aviso.
create or replace function public.avisos_generar_recordatorios() returns void
language plpgsql security definer set search_path = public as $$
declare
    v_desde text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_hasta text := to_char((now() + interval '15 minutes') at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
begin
    insert into public.panel_push_events (company_id, tipo, ref, datos)
    select a.company_id, 'recordatorio',
           'rec:' || a.id || ':' || a.slot_start || ':' || a.employee_id,
           jsonb_build_object('cita', a.id, 'lead_id', a.lead_id, 'servicio', coalesce(a.service, ''),
                              'slot', a.slot_start, 'empleado', a.employee_id,
                              'beneficiario', nullif(btrim(coalesce(to_jsonb(a) ->> 'beneficiario', '')), ''))
      from public.appointments a
     where a.status = 'confirmed'
       and a.slot_start >= v_desde and a.slot_start <= v_hasta
       and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
       and coalesce(a.employee_id, '') <> ''
       and coalesce(to_timestamp(a.created_at), now() - interval '1 day') < now() - interval '15 minutes'
       and exists (
            select 1 from public.memberships m
              join public.panel_push_subscriptions s
                on s.company_id = m.company_id and s.auth_user_id::text = m.auth_user_id and s.revoked_at is null
             where m.company_id = a.company_id and m.employee_id = a.employee_id)
    on conflict (company_id, tipo, ref) do nothing;
exception when others then
    raise warning 'avisos_generar_recordatorios: %', sqlerrm;
end $$;
revoke execute on function public.avisos_generar_recordatorios() from public, anon, authenticated;

-- Para que la búsqueda de cada minuto no recorra todas las citas de la plataforma.
create index if not exists ix_appointments_recordatorio
    on public.appointments (slot_start) where status = 'confirmed';

-- El reloj de la 0001, con los recordatorios delante: se generan y, si hay alguno,
-- el mismo minuto los manda.
create or replace function public.avisos_disparar() returns void
language plpgsql security definer set search_path = public as $$
declare v_secreto text;
begin
    perform public.avisos_generar_recordatorios();
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

-- ── 5 · El despachador: el de la 0003, con los dos tipos del equipo ───────────
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
        -- Al equipo, el nombre y nunca el teléfono.
        'cliente', case when v.tipo in ('mi_agenda', 'recordatorio') then nullif(l.name, '')
                        else coalesce(nullif(l.name, ''), l.phone) end,
        'destinos', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
              from public.panel_push_subscriptions s
             where s.company_id = v.company_id and s.revoked_at is null
               and case when v.tipo in ('mi_agenda', 'recordatorio')
                        then public.avisos_para_equipo(s.auth_user_id, s.company_id, v.tipo, v.datos)
                        else public.avisos_recibe(s.auth_user_id, s.company_id)
                             and (v.datos ->> 'para' is null or s.auth_user_id::text = v.datos ->> 'para')
                   end
               and coalesce((s.prefs ->> v.tipo)::boolean, v.tipo <> 'persona')
               and not public.avisos_en_silencio(s.silencio_desde, s.silencio_hasta)
        ), '[]'::jsonb)
    ) order by v.id), '[]'::jsonb)
      into v_eventos
      from vencidos v
      join public.companies c on c.id = v.company_id
      left join public.leads l on l.id = v.datos ->> 'lead_id';

    with listas as (
        select s.*,
               ((now() at time zone 'America/Lima')::date + s.silencio_hasta) at time zone 'America/Lima' as fin
          from public.panel_push_subscriptions s
         where s.revoked_at is null and s.silencio_desde is not null and s.silencio_hasta is not null
           and s.silencio_desde <> s.silencio_hasta
           and (s.ultimo_resumen is null or s.ultimo_resumen < (now() at time zone 'America/Lima')::date)
           and public.avisos_recibe(s.auth_user_id, s.company_id)
    ), tocan as (
        select l.*,
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
               and e.tipo not in ('mi_agenda', 'recordatorio')
               and (e.datos ->> 'para' is null or t.auth_user_id::text = e.datos ->> 'para')
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

-- ── 6 · Suscribirse: cualquier miembro otra vez ───────────────────────────────
-- La 0002 lo cerró al empleado porque entonces le habría llegado todo. Ya no: el
-- despachador decide tipo a tipo, y al empleado solo le llegan los dos de aquí.
drop policy if exists p_panel_push_subs_own on public.panel_push_subscriptions;
create policy p_panel_push_subs_own on public.panel_push_subscriptions
    for all to authenticated
    using (auth_user_id = auth.uid() and public.is_member(company_id))
    with check (auth_user_id = auth.uid() and public.is_member(company_id));

commit;
