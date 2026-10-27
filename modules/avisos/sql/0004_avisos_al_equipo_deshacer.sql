-- Deshace 0004_avisos_al_equipo.sql: el empleado deja de recibir avisos y de poder
-- suscribirse, como con la 0002.
--
-- El despachador de la 0004 se queda: sin eventos 'mi_agenda' ni 'recordatorio'
-- hace exactamente lo de la 0003, y quitarlo obligaría a copiarlo aquí entero.

begin;

-- El reloj, sin los recordatorios (el de la 0001).
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

drop trigger if exists avisos_agenda_equipo on public.appointments;
drop function if exists public.avisos_tg_agenda_equipo();
drop function if exists public.avisos_generar_recordatorios();
drop index if exists public.ix_appointments_recordatorio;

delete from public.panel_push_events where tipo in ('mi_agenda', 'recordatorio');
alter table public.panel_push_events drop constraint panel_push_events_tipo_chk;
alter table public.panel_push_events add constraint panel_push_events_tipo_chk
    check (tipo in ('pago', 'reserva', 'whatsapp', 'plan', 'persona', 'stock', 'por_aprobar'));

-- Suscribirse, otra vez solo dueño y administrador (la 0002).
drop policy if exists p_panel_push_subs_own on public.panel_push_subscriptions;
create policy p_panel_push_subs_own on public.panel_push_subscriptions
    for all to authenticated
    using (auth_user_id = auth.uid() and public.is_member(company_id))
    with check (auth_user_id = auth.uid() and public.avisos_recibe(auth.uid(), company_id));

commit;
