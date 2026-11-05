-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · PRUEBAS DE 0014 (enviar un aviso ahora)
--
-- Igual que pruebas.sql: en STAGING, con 0001–0014 aplicadas. Todo dentro de
-- BEGIN … ROLLBACK. Termina con «PRUEBAS 0014 PASARON».
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

create function pg_temp.esperar_error(p_sql text, p_patron text, p_n text) returns void language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlerrm !~ p_patron then
            raise exception 'FALLO %: esperaba «%» y salió «%»', p_n, p_patron, sqlerrm;
        end if;
        return;
    end;
    raise exception 'FALLO %: esperaba el error «%» y no hubo error', p_n, p_patron;
end $$;
grant execute on function pg_temp.esperar_error(text, text, text) to authenticated, anon;
create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated, anon;
create function pg_temp.v(p text) returns text language sql as $$ select current_setting('fz.' || p, true) $$;
grant execute on function pg_temp.v(text) to authenticated, anon;

-- Siempre dentro del horario de envío, sea cual sea la hora de la prueba (se deshace con el ROLLBACK).
create or replace function public.loyalty_next_send_slot(p_from timestamptz default now())
returns timestamptz language sql stable as $$ select p_from $$;

insert into public.companies (id, name) values ('zz-av-a', 'Aviso A'), ('zz-av-b', 'Aviso B');
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-av-m1', '00000000-0000-4000-8000-0000000000e1', 'zz-av-a', 'owner'),
    ('zz-av-m2', '00000000-0000-4000-8000-0000000000e2', 'zz-av-a', 'member'),
    ('zz-av-m3', '00000000-0000-4000-8000-0000000000e3', 'zz-av-b', 'owner');
insert into public.loyalty_server_keys (key_hash, label)
values (sha256(convert_to('clave-de-prueba-solo-en-esta-transaccion-0014', 'UTF8')), 'zz-av');
select set_config('request.headers', '{"x-fideliza-key":"clave-de-prueba-solo-en-esta-transaccion-0014"}', true);

-- Tres clientes: «cerca» (le faltan 2), «lejos» (le faltan 9, hace 60 días) y «sinavisos».
insert into public.loyalty_settings (company_id, slug, display_name) values ('zz-av-a', 'zz-av-a', 'Aviso A');
insert into public.loyalty_programs (id, company_id, name, status)
values ('00000000-0000-4000-8000-00000000aa01', 'zz-av-a', 'Club', 'active');
insert into public.loyalty_program_versions (id, company_id, program_id, version, rule_type, stamps_per_purchase, reward_threshold, reward_description)
values ('00000000-0000-4000-8000-00000000aa02', 'zz-av-a', '00000000-0000-4000-8000-00000000aa01', 1, 'stamps', 1, 10, 'Premio');
update public.loyalty_programs set current_version_id = '00000000-0000-4000-8000-00000000aa02' where id = '00000000-0000-4000-8000-00000000aa01';

insert into public.loyalty_members (id, company_id, program_id, public_code, qr_token, card_token_hash, balance, joined_via, last_op_at) values
    ('00000000-0000-4000-8000-00000000bb01', 'zz-av-a', '00000000-0000-4000-8000-00000000aa01', 'VDM-AAAAAA', repeat('a', 30), '\x01', 8, 'panel', now() - interval '1 day'),
    ('00000000-0000-4000-8000-00000000bb02', 'zz-av-a', '00000000-0000-4000-8000-00000000aa01', 'VDM-BBBBBB', repeat('b', 30), '\x02', 1, 'panel', now() - interval '60 days'),
    ('00000000-0000-4000-8000-00000000bb03', 'zz-av-a', '00000000-0000-4000-8000-00000000aa01', 'VDM-CCCCCC', repeat('c', 30), '\x03', 9, 'panel', now() - interval '60 days');
insert into public.loyalty_consents (company_id, member_id, channel, granted, text_version, source)
select 'zz-av-a', id, 'push', true, 'push-v1', 'panel'
  from public.loyalty_members where id in ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-00000000bb02');
insert into public.loyalty_push_subscriptions (company_id, member_id, endpoint, p256dh, auth)
select 'zz-av-a', id, 'https://push.example/' || id, 'p', 'a'
  from public.loyalty_members where id in ('00000000-0000-4000-8000-00000000bb01', '00000000-0000-4000-8000-00000000bb02');

-- ── Permisos ──────────────────────────────────────────────────────────────────
set local role anon;
select pg_temp.esperar_error($$select public.loyalty_aviso_enviar('zz-av-a', 'todos', 1, 'T', 'B')$$, 'permission denied', 'P1 anon no envía');
select pg_temp.esperar_error($$select public.loyalty_aviso_miembros('zz-av-a', 'todos', 1)$$, 'permission denied', 'P2 anon no lista');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}';
select pg_temp.esperar_error($$select public.loyalty_aviso_enviar('zz-av-a', 'todos', 1, 'T', 'B')$$, 'forbidden', 'P3 otro negocio no envía');
select pg_temp.esperar_error($$select public.loyalty_aviso_audiencia('zz-av-a', 'todos', 1)$$, 'forbidden', 'P4 otro negocio no cuenta');
select pg_temp.esperar_error($$select public.loyalty_aviso_miembros('zz-av-a', 'todos', 1)$$, 'permission denied', 'P5 el ayudante es interno');

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}';
select pg_temp.esperar_error($$select public.loyalty_aviso_enviar('zz-av-a', 'todos', 1, 'T', 'B')$$, 'forbidden', 'P6 el cajero no envía');

-- ── Audiencia y validaciones ──────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select pg_temp.ok((public.loyalty_aviso_audiencia('zz-av-a', 'todos', 1) ->> 'matching')::int = 3, 'A1 todos cumplen');
select pg_temp.ok((public.loyalty_aviso_audiencia('zz-av-a', 'todos', 1) ->> 'reachable')::int = 2, 'A2 sin avisos no cuenta');
select pg_temp.ok((public.loyalty_aviso_audiencia('zz-av-a', 'cerca', 2) ->> 'matching')::int = 2, 'A3 les faltan 2 o menos');
select pg_temp.ok((public.loyalty_aviso_audiencia('zz-av-a', 'cerca', 2) ->> 'reachable')::int = 1, 'A4 solo uno con avisos');
select pg_temp.ok(public.loyalty_aviso_audiencia('zz-av-a', 'cerca', 2) ->> 'ejemplo' = '2 sellos', 'A5 ejemplo en plural');
select pg_temp.ok(public.loyalty_aviso_audiencia('zz-av-a', 'cerca', 1) ->> 'ejemplo' = '1 sello', 'A6 ejemplo en singular');
select pg_temp.ok((public.loyalty_aviso_audiencia('zz-av-a', 'inactivos', 30) ->> 'reachable')::int = 1, 'A7 inactivos con avisos');
select pg_temp.esperar_error($$select public.loyalty_aviso_audiencia('zz-av-a', 'inactivos', 3)$$, 'invalid_audience', 'A8 días fuera de rango');
select pg_temp.esperar_error($$select public.loyalty_aviso_audiencia('zz-av-a', 'otro', 3)$$, 'invalid_audience', 'A9 público desconocido');
select pg_temp.esperar_error($$select public.loyalty_aviso_enviar('zz-av-a', 'todos', 1, 'Te faltan {faltan}', 'B')$$, 'faltan_sin_audiencia', 'A10 {faltan} sin su público');
select pg_temp.esperar_error($$select public.loyalty_aviso_enviar('zz-av-a', 'todos', 1, '  ', 'B')$$, 'invalid_campaign', 'A11 título vacío');

-- ── Envío ─────────────────────────────────────────────────────────────────────
select set_config('fz.r1', public.loyalty_aviso_enviar('zz-av-a', 'cerca', 2, '¡Ya casi!', 'Solo {faltan} más para tu premio')::text, true);
select pg_temp.ok((pg_temp.v('r1')::jsonb ->> 'queued')::int = 1, 'E1 encola a uno: ' || pg_temp.v('r1'));
select pg_temp.ok((public.loyalty_aviso_enviar('zz-av-a', 'cerca', 2, '¡Ya casi!', 'Solo {faltan} más para tu premio') ->> 'queued')::int = 0, 'E2 reenviar el mismo no duplica');
select pg_temp.ok((public.loyalty_aviso_enviar('zz-av-a', 'todos', 1, 'Promo', 'Sellos dobles') ->> 'queued')::int = 2, 'E3 otro mensaje sí sale');

reset role;
select pg_temp.ok((select count(*) = 3 from public.loyalty_outbox where company_id = 'zz-av-a' and payload ->> 'template' = 'manual'), 'E4 tres trabajos en cola');
select pg_temp.ok((select count(*) = 3 from public.loyalty_campaign_events where company_id = 'zz-av-a' and stage = 'eligible'), 'E5 tres elegibles');
select pg_temp.ok((select count(*) = 1 from public.loyalty_campaigns where company_id = 'zz-av-a' and template = 'manual'), 'E6 una sola fila de campaña');
select pg_temp.ok((select count(*) = 1 from public.loyalty_audit_log where company_id = 'zz-av-a' and action = 'campaign.send' and (context ->> 'queued')::int = 1), 'E7 queda en auditoría');
update public.loyalty_outbox set next_attempt_at = now() where company_id = 'zz-av-a';

-- ── Preparar el envío (lo que hace el worker) ─────────────────────────────────
create or replace function pg_temp.preparar(p_dedupe_like text, p_member uuid) returns jsonb language sql as $$
    select public.loyalty_srv_push_prepare((select id from public.loyalty_outbox
        where company_id = 'zz-av-a' and payload ->> 'member_id' = p_member::text and payload ->> 'title' = p_dedupe_like limit 1));
$$;
select set_config('fz.p1', pg_temp.preparar('¡Ya casi!', '00000000-0000-4000-8000-00000000bb01')::text, true);
select pg_temp.ok(pg_temp.v('p1')::jsonb ->> 'body' = 'Solo 2 sellos más para tu premio', 'S1 cambia {faltan}: ' || pg_temp.v('p1'));

-- Le cambió el saldo después de encolar: se calcula al enviar.
update public.loyalty_members set balance = 9 where id = '00000000-0000-4000-8000-00000000bb01';
select set_config('fz.p2', pg_temp.preparar('¡Ya casi!', '00000000-0000-4000-8000-00000000bb01')::text, true);
select pg_temp.ok(pg_temp.v('p2')::jsonb ->> 'body' = 'Solo 1 sello más para tu premio', 'S2 usa el saldo actual: ' || pg_temp.v('p2'));

-- Ya alcanzó la meta: no se le dice que le falta algo.
update public.loyalty_members set balance = 10 where id = '00000000-0000-4000-8000-00000000bb01';
select pg_temp.ok(pg_temp.preparar('¡Ya casi!', '00000000-0000-4000-8000-00000000bb01') ->> 'reason' = 'no_faltan', 'S3 ya no le falta');

-- Volvió mientras esperaba las 09:00: «te extrañamos» ya no le toca.
update public.loyalty_outbox set payload = payload || jsonb_build_object('audience', 'inactivos', 'title', 'Te extrañamos', 'eligible_at', now() - interval '1 hour')
 where payload ->> 'member_id' = '00000000-0000-4000-8000-00000000bb02' and payload ->> 'title' = 'Promo';
update public.loyalty_members set last_op_at = now() where id = '00000000-0000-4000-8000-00000000bb02';
select pg_temp.ok(pg_temp.preparar('Te extrañamos', '00000000-0000-4000-8000-00000000bb02') ->> 'reason' = 'purchased', 'S4 volvió antes de enviar');

-- El texto del trabajo manda, aunque la fila tenga otro más nuevo.
select pg_temp.ok((select title = 'Promo' from public.loyalty_campaigns where company_id = 'zz-av-a' and template = 'manual'), 'S5 la fila guarda el último');

-- Baja: la cola se vacía para ese cliente, también los manuales.
select public.loyalty_cancel_member_pushes('00000000-0000-4000-8000-00000000bb01', 'unsubscribed');
select pg_temp.ok((select count(*) = 0 from public.loyalty_outbox
    where payload ->> 'member_id' = '00000000-0000-4000-8000-00000000bb01' and status in ('pending', 'retry')), 'S6 la baja cancela');

-- Las plantillas de siempre siguen con su texto.
insert into public.loyalty_campaigns (id, company_id, template, status, title, body)
values ('00000000-0000-4000-8000-00000000cc01', 'zz-av-a', 'winback', 'active', 'Título viejo', 'Texto viejo');
update public.loyalty_members set last_op_at = now() - interval '60 days' where id = '00000000-0000-4000-8000-00000000bb02';
insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
values ('zz-av-a', 'push.send', jsonb_build_object('member_id', '00000000-0000-4000-8000-00000000bb02',
        'campaign_id', '00000000-0000-4000-8000-00000000cc01', 'template', 'winback', 'eligible_at', now()), 'zz-winback');
select set_config('fz.p3', public.loyalty_srv_push_prepare((select id from public.loyalty_outbox where dedupe_key = 'zz-winback'))::text, true);
select pg_temp.ok(pg_temp.v('p3')::jsonb ->> 'title' = 'Título viejo', 'S7 plantillas intactas: ' || pg_temp.v('p3'));

-- Tope: con cuatro intentos en 30 días ya no cuenta ni se encola.
insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
select 'zz-av-a', '00000000-0000-4000-8000-00000000cc01', '00000000-0000-4000-8000-00000000bb02', 'attempted' from generate_series(1, 4);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select pg_temp.ok((public.loyalty_aviso_enviar('zz-av-a', 'inactivos', 30, 'Tope', 'Llegó al tope') ->> 'queued')::int = 0, 'T1 el tope no encola');

-- Fuera de horario: queda programado, y al prepararlo se reprograma sin enviar.
reset role;
create or replace function public.loyalty_next_send_slot(p_from timestamptz default now())
returns timestamptz language sql stable as $$ select p_from + interval '3 hours' $$;
update public.loyalty_campaign_events set created_at = now() - interval '40 days' where stage = 'attempted';
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';
select set_config('fz.r2', public.loyalty_aviso_enviar('zz-av-a', 'inactivos', 30, 'Noche', 'Fuera de horario')::text, true);
select pg_temp.ok((pg_temp.v('r2')::jsonb ->> 'immediate')::boolean = false and (pg_temp.v('r2')::jsonb ->> 'queued')::int = 1, 'H1 queda programado: ' || pg_temp.v('r2'));
reset role;
select pg_temp.ok((select next_attempt_at > now() + interval '2 hours' from public.loyalty_outbox where payload ->> 'title' = 'Noche'), 'H2 con su hora');
select pg_temp.ok(pg_temp.preparar('Noche', '00000000-0000-4000-8000-00000000bb02') ? 'reschedule_at', 'H3 no se envía de noche');

reset role;
select 'PRUEBAS 0014 PASARON' as resultado;
rollback;
