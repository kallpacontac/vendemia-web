-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · PRUEBAS DE 0009 (alta rápida y código de pedido)
--
-- Igual que pruebas.sql: en STAGING, con 0001–0009 aplicadas. Todo dentro de
-- BEGIN … ROLLBACK. Termina con «PRUEBAS 0009 PASARON».
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

insert into public.platform_admins (auth_user_id) values ('00000000-0000-4000-8000-0000000000ad');
-- Un negocio que ya existe con el slug que saldría de «Barbería Lucas».
insert into public.companies (id, name) values ('barberia-lucas', 'Otra Barbería Lucas');

-- ── Alta del negocio ─────────────────────────────────────────────────────────
set local role anon;
select pg_temp.esperar_error($$select public.loyalty_business_create('Barbería Lucas', null)$$, 'permission denied', 'A1 anon no crea');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
select pg_temp.esperar_error($$select public.loyalty_business_create(' x ', null)$$, 'invalid_name', 'A2 nombre corto');
select pg_temp.esperar_error($$select public.loyalty_business_create('Barbería Lucas', '123')$$, 'invalid_phone', 'A3 teléfono');
select set_config('fz.alta', public.loyalty_business_create('  Barbería   Lucas ', '+51 987 654 321')::text, true);
select pg_temp.ok(pg_temp.v('alta')::jsonb ->> 'company_id' = 'barberia-lucas-2', 'A4 slug libre con sufijo: ' || pg_temp.v('alta'));
select pg_temp.ok((select role from public.memberships where company_id = 'barberia-lucas-2') = 'owner', 'A5 queda de owner');
select pg_temp.ok((select name = 'Barbería Lucas' and owner_phone = '51987654321' from public.companies where id = 'barberia-lucas-2'), 'A6 nombre y teléfono limpios');
select pg_temp.ok((select display_name = 'Barbería Lucas' and slug = 'barberia-lucas-2' from public.loyalty_settings where company_id = 'barberia-lucas-2'), 'A7 ajustes creados');
select pg_temp.ok(public.loyalty_role('barberia-lucas-2') = 'owner', 'A8 rol de Fideliza');
select pg_temp.esperar_error($$select public.loyalty_business_create('Segundo negocio', null)$$, 'already_has_business', 'A9 solo uno por cuenta');
select pg_temp.esperar_error($$select public.loyalty_admin_device_order(3, 'x', 'nfc_qr')$$, 'forbidden', 'A10 un dueño no fabrica');

-- Nombre sin letras útiles → 'negocio'.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}';
select pg_temp.ok(public.loyalty_business_create('¡¡ !!', null) ->> 'company_id' = 'negocio', 'A11 nombre raro');
-- Tildes y eñes.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}';
select pg_temp.ok(public.loyalty_business_create('Peluquería Ñaña & Cía', null) ->> 'company_id' = 'peluqueria-nana-cia', 'A12 tildes');

-- ── Fábrica: un pedido de 3 placas con código común ─────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
select set_config('fz.pedido', public.loyalty_admin_device_order(3, 'pedido-lucas', 'nfc_qr')::text, true);
select pg_temp.ok(jsonb_array_length(pg_temp.v('pedido')::jsonb -> 'devices') = 3, 'B1 tres placas');
select pg_temp.ok(pg_temp.v('pedido')::jsonb ->> 'order_code' ~ '^P[A-Z2-9]{4}-[A-Z2-9]{5}$', 'B2 formato del código de pedido');
-- Y una placa suelta de otro lote.
select set_config('fz.suelta', public.loyalty_admin_device_batch(1, 'suelta', 'nfc_qr')::text, true);

-- ── El dueño reclama con el código del pedido ───────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}';
-- Una placa del pedido la activa antes con su código individual.
select pg_temp.ok((public.loyalty_device_claim('barberia-lucas-2',
        pg_temp.v('pedido')::jsonb -> 'devices' -> 0 ->> 'activation_code') ->> 'count')::int = 1, 'C1 código individual');
select set_config('fz.r', public.loyalty_device_claim('barberia-lucas-2',
        lower(pg_temp.v('pedido')::jsonb ->> 'order_code'))::text, true);
select pg_temp.ok((pg_temp.v('r')::jsonb ->> 'count')::int = 2, 'C2 el pedido se queda con las otras dos: ' || pg_temp.v('r'));
select pg_temp.ok(pg_temp.v('r')::jsonb ->> 'id' is not null, 'C3 sigue devolviendo id');
select pg_temp.ok((select count(*) from public.loyalty_devices where company_id = 'barberia-lucas-2' and status = 'assigned') = 3, 'C4 tres asignadas');
select pg_temp.ok((select count(*) from public.loyalty_device_claims where company_id = 'barberia-lucas-2') = 3, 'C5 tres reclamos registrados');
select pg_temp.esperar_error(format($$select public.loyalty_device_claim('barberia-lucas-2', %L)$$, pg_temp.v('pedido')::jsonb ->> 'order_code'),
                             'invalid_activation_code', 'C6 el código de pedido no sirve dos veces');
select pg_temp.esperar_error(format($$select public.loyalty_device_claim('barberia-lucas-2', %L)$$, pg_temp.v('pedido')::jsonb -> 'devices' -> 1 ->> 'activation_code'),
                             'invalid_activation_code', 'C7 ni el individual de una ya reclamada');
-- La suelta no entra en el pedido.
reset role;  -- el RLS no deja ver placas sin dueño: se mira como superusuario
select pg_temp.ok((select company_id is null from public.loyalty_devices
                    where id = (pg_temp.v('suelta')::jsonb -> 0 ->> 'id')::uuid), 'C8 la placa de otro lote sigue libre');
set local role authenticated;

-- Otro negocio no puede reclamar a nombre de uno ajeno.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}';
select pg_temp.esperar_error(format($$select public.loyalty_device_claim('barberia-lucas-2', %L)$$, pg_temp.v('suelta')::jsonb -> 0 ->> 'activation_code'),
                             'forbidden|loyalty:', 'C9 sin permiso en compañía ajena');
select pg_temp.ok((public.loyalty_device_claim('negocio', pg_temp.v('suelta')::jsonb -> 0 ->> 'activation_code') ->> 'count')::int = 1, 'C10 la suelta para su dueño');

reset role;
select 'PRUEBAS 0009 PASARON' as resultado;
rollback;
