-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · PRUEBAS EN POSTGRES
--
-- Pégalo ENTERO en el SQL Editor de un proyecto de STAGING con 0001–0006
-- aplicadas. Va todo dentro de BEGIN … ROLLBACK: no deja nada escrito.
--
-- Si una comprobación falla, se para con «FALLO n: …». Si llega al final,
-- la última fila dice «TODAS LAS PRUEBAS PASARON».
--
-- Simula usuarios cambiando de rol (authenticated) y fijando el `sub` del JWT,
-- que es exactamente lo que hace PostgREST con un token real.
--
-- Lo que NO se puede probar aquí (una sola sesión): dos canjes A LA VEZ.
-- Procedimiento manual en el README de esta carpeta, apartado «Concurrencia».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── Montaje ───────────────────────────────────────────────────────────────────
-- Los valores intermedios (ids, tokens) viajan en variables de la transacción
-- (set_config … true), no en una tabla temporal: valen igual para cualquier rol.

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

insert into public.companies (id, name) values ('zz-fz-a', 'Prueba A'), ('zz-fz-b', 'Prueba B');
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-m1', '00000000-0000-4000-8000-0000000000a1', 'zz-fz-a', 'owner'),
    ('zz-m2', '00000000-0000-4000-8000-0000000000a2', 'zz-fz-a', 'member'),   -- cajero (por defecto)
    ('zz-m3', '00000000-0000-4000-8000-0000000000b1', 'zz-fz-b', 'owner');
insert into public.loyalty_server_keys (key_hash, label)
values (sha256(convert_to('clave-de-prueba-solo-en-esta-transaccion-0123456789', 'UTF8')), 'zz-prueba');

-- ── Propietario A configura y publica ─────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select public.loyalty_settings_save('zz-fz-a', '{"slug":"zz-prueba-a","display_name":"Prueba A"}');
select set_config('fz.loc', public.loyalty_location_save('zz-fz-a', null, 'Centro', true)::text, true);
select set_config('fz.prog', public.loyalty_program_save('zz-fz-a', null, 'Club A', 'desc', 'repeat',
    '{"rule_type":"stamps","stamps_per_purchase":1,"min_purchase_cents":1000,"reward_threshold":3,"reward_description":"Corte gratis"}')::text, true);
select set_config('fz.v1', public.loyalty_program_publish('zz-fz-a', pg_temp.v('prog')::uuid) ->> 'id', true);

-- El token de la tarjeta solo existe en ESTA respuesta: se guarda ahora.
select set_config('fz.m', x.r ->> 'member_id', true), set_config('fz.card', x.r ->> 'card_token', true)
  from (select public.loyalty_member_create('zz-fz-a', 'Ana', '987654321', null, true, 'crear-ana-000001', 'caja') r) x;
select pg_temp.ok((public.loyalty_member_create('zz-fz-a', 'Ana', '987654321', null, true, 'crear-ana-000001', 'caja') ->> 'replayed')::boolean, '1a0 reintento de alta = replayed');
select pg_temp.ok((select count(*) = 1 from public.loyalty_members where company_id = 'zz-fz-a'), '1a reintento de alta no duplica');

-- ── 1 · Misma referencia/clave → un solo movimiento ───────────────────────────
select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2500, pg_temp.v('loc')::uuid, 'B001-1', 'idem-compra-0001');
select pg_temp.ok((public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2500, pg_temp.v('loc')::uuid, 'B001-1', 'idem-compra-0001') ->> 'status') = 'replayed', '1b reintento devuelve replayed');
select pg_temp.esperar_error($$select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2500, pg_temp.v('loc')::uuid, 'B001-1', 'idem-compra-0002')$$, 'duplicate_reference', '1c');
select pg_temp.esperar_error($$select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 9999, pg_temp.v('loc')::uuid, 'B001-1', 'idem-compra-0001')$$, 'idempotency_conflict', '1d');
select pg_temp.ok((select balance = 1 and ops_count = 1 from public.loyalty_members where id = pg_temp.v('m')::uuid), '1e saldo 1 tras reintentos');

-- Compra por debajo del mínimo: se registra, no suma.
select pg_temp.ok((public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 500, pg_temp.v('loc')::uuid, null, 'idem-compra-0003') ->> 'units')::int = 0, '1f bajo mínimo no suma');

-- ── Hasta el premio ───────────────────────────────────────────────────────────
select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2000, pg_temp.v('loc')::uuid, null, 'idem-compra-0004');
select set_config('fz.tx3', r ->> 'transaction_id', true)
  from (select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2000, pg_temp.v('loc')::uuid, null, 'idem-compra-0005') r) x;
select pg_temp.ok((select balance = 0 and rewards_available = 1 from public.loyalty_members where id = pg_temp.v('m')::uuid), '1g premio emitido y saldo a 0');

-- ── 2 · Canje: una vez, y el reintento no consume otro ────────────────────────
select pg_temp.ok((public.loyalty_redeem('zz-fz-a', pg_temp.v('m')::uuid, null, pg_temp.v('loc')::uuid, 'idem-canje-0001') ->> 'status') = 'created', '2a canje');
select pg_temp.ok((public.loyalty_redeem('zz-fz-a', pg_temp.v('m')::uuid, null, pg_temp.v('loc')::uuid, 'idem-canje-0001') ->> 'status') = 'replayed', '2b reintento de canje');
select pg_temp.esperar_error($$select public.loyalty_redeem('zz-fz-a', pg_temp.v('m')::uuid, null, pg_temp.v('loc')::uuid, 'idem-canje-0002')$$, 'no_reward_available', '2c sin premio');
select pg_temp.ok((select count(*) = 1 from public.loyalty_redemptions where member_id = pg_temp.v('m')::uuid), '2d un solo canje');

-- ── 3 · Devolución compensa y el libro cuadra ─────────────────────────────────
select public.loyalty_refund('zz-fz-a', pg_temp.v('tx3')::uuid, null, 'cliente devolvió', 'idem-devol-0001');
select pg_temp.ok((select m.balance = (select sum(units) from public.loyalty_ledger l where l.member_id = m.id)
                     from public.loyalty_members m where m.id = pg_temp.v('m')::uuid), '3a saldo = suma del libro');
select pg_temp.ok((select balance = -1 from public.loyalty_members where id = pg_temp.v('m')::uuid), '3b premio ya canjeado: saldo queda en -1');
select pg_temp.esperar_error($$select public.loyalty_refund('zz-fz-a', pg_temp.v('tx3')::uuid, null, 'otra vez', 'idem-devol-0002')$$, 'already_refunded', '3c');
select pg_temp.ok((select jsonb_array_length(public.loyalty_reconcile('zz-fz-a', false) -> 'mismatches') = 0), '3d conciliación limpia');

-- ── 4 · Regla nueva no reescribe el pasado ────────────────────────────────────
select public.loyalty_program_save('zz-fz-a', pg_temp.v('prog')::uuid, null, null, null,
    '{"rule_type":"stamps","stamps_per_purchase":2,"min_purchase_cents":0,"reward_threshold":5,"reward_description":"Barba gratis"}');
select set_config('fz.v2', public.loyalty_program_publish('zz-fz-a', pg_temp.v('prog')::uuid) ->> 'id', true);
select pg_temp.ok((select version_id = pg_temp.v('v1')::uuid from public.loyalty_transactions where id = pg_temp.v('tx3')::uuid), '4a la operación vieja sigue en v1');
select pg_temp.ok((public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 100, pg_temp.v('loc')::uuid, null, 'idem-compra-0006') ->> 'units')::int = 2, '4b la nueva usa v2');
select public.loyalty_program_save('zz-fz-a', pg_temp.v('prog')::uuid, null, null, null, '{"rule_type":"points","reward_threshold":5,"reward_description":"x"}');
select pg_temp.esperar_error($$select public.loyalty_program_publish('zz-fz-a', pg_temp.v('prog')::uuid)$$, 'rule_type_locked', '4c');
select public.loyalty_program_save('zz-fz-a', pg_temp.v('prog')::uuid, null, null, null,
    '{"rule_type":"stamps","stamps_per_purchase":2,"reward_threshold":5,"reward_description":"Barba gratis"}');

-- El libro no se edita.
select pg_temp.esperar_error($$update public.loyalty_ledger set units = 99$$, 'permission denied|ledger_inmutable', '4d ledger');

-- ── 7 · Placas: 0 / 1 / N y el token no cambia ────────────────────────────────
select set_config('fz.perfil', public.loyalty_profile_save('zz-fz-a', null, 'Caja', '', '', '[]', true)::text, true);
select public.loyalty_profile_publish('zz-fz-a', pg_temp.v('perfil')::uuid, false);
select set_config('fz.placa', r ->> 'id', true) from (select public.loyalty_device_create('zz-fz-a', 'Mostrador', 'qr', null, pg_temp.v('perfil')::uuid) r) x;
select set_config('fz.tok', public_token, true) from public.loyalty_devices where id = pg_temp.v('placa')::uuid;
select pg_temp.esperar_error($$select public.loyalty_device_set_status('zz-fz-a', pg_temp.v('placa')::uuid, 'active')$$, 'device_no_destination', '7a cero enlaces no activa');
select public.loyalty_profile_save('zz-fz-a', pg_temp.v('perfil')::uuid, 'Caja', '', '', '[{"label":"Reseña","kind":"url","url":"https://g.page/r/x"}]', true);
select public.loyalty_profile_publish('zz-fz-a', pg_temp.v('perfil')::uuid, false);
select public.loyalty_device_set_status('zz-fz-a', pg_temp.v('placa')::uuid, 'active');
select pg_temp.esperar_error($$select public.loyalty_profile_save('zz-fz-a', pg_temp.v('perfil')::uuid, 'Caja', '', '', '[{"label":"Bucle","kind":"url","url":"https://fideliza.vendemias.com/t/abc"}]', true)$$, 'invalid_url', '7b bucle bloqueado');
select pg_temp.esperar_error($$select public.loyalty_profile_save('zz-fz-a', pg_temp.v('perfil')::uuid, 'Caja', '', '', '[{"label":"JS","kind":"url","url":"javascript:alert(1)"}]', true)$$, 'invalid_url', '7c javascript: bloqueado');

-- ── 5 · Compañía B no ve ni toca A ────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}';
select pg_temp.ok((select count(*) = 0 from public.loyalty_members where company_id = 'zz-fz-a'), '5a B no lee miembros de A');
select pg_temp.ok((select count(*) = 0 from public.loyalty_transactions where company_id = 'zz-fz-a'), '5b B no lee operaciones de A');
select pg_temp.esperar_error($$select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2500, null, null, 'idem-intruso-0001')$$, 'forbidden', '5c B no registra en A');
select public.loyalty_settings_save('zz-fz-b', '{"slug":"zz-prueba-b","display_name":"Prueba B"}');
select pg_temp.esperar_error($$select public.loyalty_record('zz-fz-b', pg_temp.v('m')::uuid, 'purchase', 2500, null, null, 'idem-intruso-0002')$$, 'member_not_found', '5d id de A con compañía B');
select pg_temp.esperar_error($$select public.loyalty_member_detail('zz-fz-a', pg_temp.v('m')::uuid)$$, 'forbidden', '5e ficha ajena');
select pg_temp.esperar_error($$insert into public.loyalty_members (company_id) values ('zz-fz-b')$$, 'permission denied', '5f sin INSERT directo');

-- ── Cajero de A: opera, no exporta ni cambia reglas ───────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 100, null, null, 'idem-cajero-0001');
select pg_temp.esperar_error($$select public.loyalty_member_export('zz-fz-a', pg_temp.v('m')::uuid)$$, 'forbidden', '5g cajero no exporta');
select pg_temp.esperar_error($$select public.loyalty_program_publish('zz-fz-a', pg_temp.v('prog')::uuid)$$, 'forbidden', '5h cajero no publica');
select pg_temp.ok((select count(*) = 0 from public.loyalty_contacts where company_id = 'zz-fz-a'), '5i cajero no lee contactos');

-- ── 9 · Suspendida: ni operaciones ni Wallet ──────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select set_config('fz.card2', r ->> 'card_token', true) from (select public.loyalty_member_create('zz-fz-a', 'Luis', null, null, false, 'crear-luis-00001', 'panel') r) x;
select set_config('fz.m2', id::text, true) from public.loyalty_members where company_id = 'zz-fz-a' and alias = 'Luis';
select public.loyalty_member_set_status('zz-fz-a', pg_temp.v('m2')::uuid, 'suspended', 'prueba');
-- El QR de Ana se guarda AHORA: como anon, más abajo, no se puede leer la tabla (6b).
select set_config('fz.qr', qr_token, true) from public.loyalty_members where id = pg_temp.v('m')::uuid;
select pg_temp.esperar_error($$select public.loyalty_record('zz-fz-a', pg_temp.v('m2')::uuid, 'visit', 0, null, null, 'idem-susp-00001')$$, 'member_inactive|kind_mismatch', '9a');

-- ── Lo público: sin clave, nada; con clave, solo lo suyo ──────────────────────
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.esperar_error($$select public.loyalty_srv_card(pg_temp.v('card2'), false)$$, 'server_key', '6a sin clave');
select pg_temp.esperar_error($$select * from public.loyalty_members limit 1$$, 'permission denied', '6b anon no lee tablas');
select pg_temp.esperar_error($$select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 2500, null, null, 'idem-anon-00001')$$, 'permission denied|forbidden', '6c anon no acredita');
set local request.headers = '{"x-fideliza-key":"clave-de-prueba-solo-en-esta-transaccion-0123456789"}';
select pg_temp.ok((public.loyalty_srv_card(pg_temp.v('card2'), false) -> 'member' ->> 'status') = 'suspended', '6d la tarjeta se lee con su token');
select pg_temp.ok((public.loyalty_srv_card('token-inventado-que-no-existe-0123456789', false) ->> 'status') = 'not_found', '6e token falso');
select pg_temp.esperar_error($$select public.loyalty_srv_wallet_object_data(null, pg_temp.v('card2'), '3388000000023213846')$$, 'member_inactive', '9b sin enlace Wallet');
-- Un QR (qr_token) no es un token de tarjeta: no abre nada.
select pg_temp.ok((public.loyalty_srv_card(pg_temp.v('qr'), false) ->> 'status') = 'not_found', '6f el QR no abre la tarjeta');

select pg_temp.ok((public.loyalty_srv_resolve(pg_temp.v('tok'), 'qr') ->> 'status') = 'ok'
              and jsonb_array_length(public.loyalty_srv_resolve(pg_temp.v('tok'), 'qr') -> 'links') = 1, '7d un enlace');

-- ── 10/11 · Wallet: fallo de Google no toca la compra; reintento no duplica ──
select public.loyalty_srv_wallet_object_data(null, pg_temp.v('card'), '3388000000023213846');
select public.loyalty_srv_wallet_object_data(null, pg_temp.v('card'), '3388000000023213846');
reset role;
select pg_temp.ok((select count(*) = 1 from public.loyalty_wallet_passes where member_id = pg_temp.v('m')::uuid), '11a un solo pase');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';
select public.loyalty_record('zz-fz-a', pg_temp.v('m')::uuid, 'purchase', 100, pg_temp.v('loc')::uuid, null, 'idem-compra-0007');
reset role;
select pg_temp.ok((select count(*) = 1 from public.loyalty_outbox
                    where dedupe_key = 'wallet.object:' || pg_temp.v('m') and status = 'pending'), '10a outbox pendiente (deduplicado)');
set local request.headers = '{"x-fideliza-key":"clave-de-prueba-solo-en-esta-transaccion-0123456789"}';
select set_config('fz.job', id::text, true) from public.loyalty_srv_outbox_claim('prueba', 50, 'zz-fz-a') where kind = 'wallet.object.sync' limit 1;
select public.loyalty_srv_outbox_finish(pg_temp.v('job')::bigint, false, 'Google 503', false, null, null);
select pg_temp.ok((select status = 'retry' from public.loyalty_outbox where id = pg_temp.v('job')::bigint), '10b queda para reintentar');
select pg_temp.ok((select count(*) = 1 from public.loyalty_transactions where idempotency_key = 'idem-compra-0007'), '10c la compra sigue');

-- ── 13 · Una baja vacía la cola de avisos ─────────────────────────────────────
insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
values ('zz-fz-a', 'push.send', jsonb_build_object('member_id', pg_temp.v('m'), 'template', 'winback'), 'zz-push-prueba');
set local role anon;
select public.loyalty_srv_card_action(pg_temp.v('card'), 'consent', '{"channel":"push","granted":false}');
reset role;
select pg_temp.ok((select status = 'done' from public.loyalty_outbox where dedupe_key = 'zz-push-prueba'), '13a baja cancela envíos en cola');

select 'TODAS LAS PRUEBAS PASARON' as resultado;
rollback;
