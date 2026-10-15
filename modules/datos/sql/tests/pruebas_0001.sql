-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE LA ETAPA 1 (0001_cimientos_v2.sql)
--
-- Todo dentro de BEGIN … ROLLBACK: no deja nada escrito. Si una comprobación falla se
-- para con «FALLO n: …»; si llega al final, la última fila dice «TODAS LAS PRUEBAS PASARON».
-- Simula usuarios fijando el `sub` del JWT, como hace PostgREST con un token real.
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
grant execute on function pg_temp.esperar_error(text, text, text) to authenticated;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated;

-- Montaje: A en la nube, B todavía del bot (como el espejo: sin auth.uid()).
insert into public.companies (id, name) values ('zz-v2-a', 'Nube A'), ('zz-v2-b', 'Bot B');
insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube) values ('zz-v2-a', true, false);
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-v2-m1', '00000000-0000-4000-8000-0000000002a1', 'zz-v2-a', 'owner'),
    ('zz-v2-m2', '00000000-0000-4000-8000-0000000002a2', 'zz-v2-a', 'admin'),
    ('zz-v2-m3', '00000000-0000-4000-8000-0000000002a3', 'zz-v2-a', 'member'),
    ('zz-v2-m4', '00000000-0000-4000-8000-0000000002b1', 'zz-v2-b', 'owner');

-- 1 · Un alta del espejo (sin auth.uid()) NO nace en la nube.
select pg_temp.ok(not public.config_en_nube('zz-v2-b'), '1 alta del espejo');

-- 2 · La bajada: toda fila lleva sync_version y crece.
select pg_temp.ok((select sync_version from public.companies where id = 'zz-v2-a') is not null, '2 sync_version');

-- ── El dueño de A ─────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';

select set_config('v2.p1', public.cfg_producto_guardar('zz-v2-a',
    '{"name":"Corte","price":35,"duration_minutes":30,"comision_pct":45,"schedule_slots":"[{\"id\":\"x\"}]"}') ->> 'id', true);
select pg_temp.ok((select price = 35 and comision_pct = 45 from public.catalog where id = current_setting('v2.p1')), '3 alta de producto');

-- 4 · PATCH: cambiar el precio NO borra los grupos (el bug de Kallpa que arregló el bot).
select public.cfg_producto_guardar('zz-v2-a', jsonb_build_object('id', current_setting('v2.p1'), 'price', 40));
select pg_temp.ok((select price = 40 and schedule_slots = '[{"id":"x"}]' and name = 'Corte'
                     from public.catalog where id = current_setting('v2.p1')), '4 patch conserva lo no enviado');

-- 5 · Un null explícito SÍ se aplica («stock: null» = sin control de stock).
select public.cfg_producto_guardar('zz-v2-a', jsonb_build_object('id', current_setting('v2.p1'), 'stock', 5));
select public.cfg_producto_guardar('zz-v2-a', jsonb_build_object('id', current_setting('v2.p1'), 'stock', null));
select pg_temp.ok((select stock is null from public.catalog where id = current_setting('v2.p1')), '5 null explícito');

-- 6 · Comisión fuera de rango, y en texto sí vale.
select pg_temp.esperar_error($$select public.cfg_producto_guardar('zz-v2-a', '{"name":"X","comision_pct":120}')$$, 'Va de 0 a 100', '6a');
select public.cfg_producto_guardar('zz-v2-a', jsonb_build_object('id', current_setting('v2.p1'), 'comision_pct', '50'));
select pg_temp.ok((select comision_pct = 50 from public.catalog where id = current_setting('v2.p1')), '6b comisión en texto');

-- 7 · Horario: roto se rechaza; null = hereda ('').
select pg_temp.esperar_error($$select public.cfg_trabajador_guardar('zz-v2-a', '{"name":"Marco","schedule":"{\"lunes\":{}}"}')$$, 'no es un día', '7a');
select set_config('v2.e1', public.cfg_trabajador_guardar('zz-v2-a', '{"name":"Marco","schedule":null,"comision_pct":40}') ->> 'id', true);
select pg_temp.ok((select schedule = '' and comision_pct = 40 from public.employees where id = current_setting('v2.e1')), '7b hereda horario');

-- 8 · Bloqueo con fechas al revés.
select pg_temp.esperar_error(format($$select public.cfg_bloqueo_guardar('zz-v2-a', '{"employee_id":"%s","start":"2026-11-02 10:00","end":"2026-11-01 10:00"}')$$,
    current_setting('v2.e1')), 'antes de empezar', '8');

-- 9 · Fotos: al final por defecto, y una sola principal.
select set_config('v2.f1', public.cfg_media_guardar('zz-v2-a', jsonb_build_object('catalog_id', current_setting('v2.p1'), 'url', 'https://x/1.jpg')) ->> 'id', true);
select set_config('v2.f2', public.cfg_media_guardar('zz-v2-a', jsonb_build_object('catalog_id', current_setting('v2.p1'), 'url', 'https://x/2.jpg')) ->> 'id', true);
select pg_temp.ok((select sort_order = 1 from public.catalog_media where id = current_setting('v2.f2')), '9a orden MAX+1');
select public.cfg_media_principal('zz-v2-a', current_setting('v2.f1'));
select public.cfg_media_principal('zz-v2-a', current_setting('v2.f2'));
select pg_temp.ok((select count(*) = 1 from public.catalog_media where catalog_id = current_setting('v2.p1') and is_primary = 1), '9b una principal');

-- 10 · Ajustes: un campo que no existe vuelve en `ignored`.
select pg_temp.ok((public.cfg_empresa_actualizar('zz-v2-a', '{"bot_name":"Mia","inventado":1}') -> 'ignored') ? 'inventado', '10 ignored');

-- 11 · Un negocio que todavía es del bot no se puede escribir desde aquí.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002b1","role":"authenticated"}';
select pg_temp.esperar_error($$select public.cfg_producto_guardar('zz-v2-b', '{"name":"Y"}')$$, 'todavía la guarda su bot', '11');

-- 12 · Ni editar un producto de otro negocio colando su id.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a1","role":"authenticated"}';
reset role;
insert into public.catalog (id, company_id, name) values ('zz-v2-ajeno', 'zz-v2-b', 'Ajeno');
set local role authenticated;
select pg_temp.esperar_error($$select public.cfg_producto_guardar('zz-v2-a', '{"id":"zz-v2-ajeno","price":1}')$$, 'no es de', '12');

-- ── El administrador de A ─────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a2","role":"authenticated"}';

-- 13 · Edita, pero la comisión se le quita y se le dice.
select pg_temp.ok((public.cfg_producto_guardar('zz-v2-a', jsonb_build_object('id', current_setting('v2.p1'), 'price', 45, 'comision_pct', 10))
                   -> 'sin_permiso') ? 'comision_pct', '13a sin_permiso');
select pg_temp.ok((select price = 45 and comision_pct = 50 from public.catalog where id = current_setting('v2.p1')), '13b comisión intacta');

-- 14 · Los campos de cobro, tampoco.
select pg_temp.ok((public.cfg_empresa_actualizar('zz-v2-a', '{"payment_methods":"[]"}') -> 'sin_permiso') ? 'payment_methods', '14');

-- ── El empleado de A ──────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002a3","role":"authenticated"}';
select pg_temp.esperar_error($$select public.cfg_producto_guardar('zz-v2-a', '{"name":"Z"}')$$, 'dueño o el administrador', '15');

-- ── Borrados ──────────────────────────────────────────────────────────────────
reset role;
-- 16 · Borrar deja rastro para la bajada.
delete from public.catalog_media where id = current_setting('v2.f1');
select pg_temp.ok(exists (select 1 from public.sync_borrados where tabla = 'catalog_media' and pk = current_setting('v2.f1')), '16 rastro');

-- 17 · El stock solo lo toca la clave de servicio.
set local role authenticated;
select pg_temp.esperar_error($$select public.ajustar_stock('zz-v2-a', 'x', -1)$$, 'permission denied|solo el bot', '17');

reset role;
select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
