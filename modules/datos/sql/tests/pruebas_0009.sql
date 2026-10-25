-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0009_datos_de_compra.sql
--
-- Se corre DESPUÉS de aplicar la 0009. Todo dentro de BEGIN … ROLLBACK. Si algo falla se
-- para con «FALLO n: …»; si llega al final, la última fila dice «TODAS LAS PRUEBAS PASARON».
-- Sin tablas temporales: con `set local role` no se ven.
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
grant execute on function pg_temp.esperar_error(text, text, text) to authenticated, service_role;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated, service_role;

-- Dueña (…5c1), administrador (…5c2) y empleado (…5c3).
insert into public.companies (id, name) values ('zz-co-a', 'Tienda de prueba');
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-co-m1', '00000000-0000-4000-8000-0000000005c1', 'zz-co-a', 'owner'),
    ('zz-co-m2', '00000000-0000-4000-8000-0000000005c2', 'zz-co-a', 'admin'),
    ('zz-co-m3', '00000000-0000-4000-8000-0000000005c3', 'zz-co-a', 'member');
insert into public.catalog (id, company_id, name, stock) values ('zz-co-polo', 'zz-co-a', 'Polo negro', 12);
insert into public.catalog (id, company_id, name, stock) values ('zz-co-gorra', 'zz-co-a', 'Gorra', 4);

set local role authenticated;

-- 1 · La dueña guarda todo.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005c1","role":"authenticated"}';
select public.compras_guardar('zz-co-a', 'zz-co-polo', '{"dias_reposicion":7,"cada_cuanto":15,"por_caja":12,"costo":18.5}');
select pg_temp.ok((select dias_reposicion = 7 and cada_cuanto = 15 and por_caja = 12 from public.catalogo_compras where catalog_id = 'zz-co-polo'), '1a datos de compra');
select pg_temp.ok((select costo = 18.5 from public.catalogo_costos where catalog_id = 'zz-co-polo'), '1b costo');

-- 2 · Solo cambia lo que viene; null vacía.
select public.compras_guardar('zz-co-a', 'zz-co-polo', '{"por_caja":null}');
select pg_temp.ok((select dias_reposicion = 7 and por_caja is null from public.catalogo_compras where catalog_id = 'zz-co-polo'), '2 parcial');

-- 3 · Validaciones.
select pg_temp.esperar_error($$select public.compras_guardar('zz-co-a', 'zz-co-polo', '{"dias_reposicion":400}')$$, 'de 0 a 365', '3a días');
select pg_temp.esperar_error($$select public.compras_guardar('zz-co-a', 'zz-co-polo', '{"costo":-1}')$$, 'negativo', '3b costo negativo');
select pg_temp.esperar_error($$select public.compras_guardar('zz-co-a', 'zz-co-nada', '{"cada_cuanto":7}')$$, 'no está en tu catálogo', '3c no existe');

-- 4 · El administrador: datos de compra sí, costo ni verlo ni ponerlo.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005c2","role":"authenticated"}';
select pg_temp.ok((select count(*) = 1 from public.catalogo_compras where company_id = 'zz-co-a'), '4a ve los datos de compra');
select pg_temp.ok((select count(*) = 0 from public.catalogo_costos), '4b no ve costos');
select public.compras_guardar('zz-co-a', 'zz-co-gorra', '{"dias_reposicion":3}');
select pg_temp.esperar_error($$select public.compras_guardar('zz-co-a', 'zz-co-gorra', '{"costo":5}')$$, 'lo pone el dueño', '4c no pone costo');

-- 5 · El empleado, nada.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000005c3","role":"authenticated"}';
select pg_temp.ok((select count(*) = 0 from public.catalogo_compras), '5a no ve');
select pg_temp.esperar_error($$select public.compras_guardar('zz-co-a', 'zz-co-gorra', '{"cada_cuanto":7}')$$, 'dueño o el administrador', '5b no guarda');
reset role;

-- 6 · El bot: lee todo y sube sus costos sin pisar los del dueño.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.ok(jsonb_array_length(public.compras_srv_de('zz-co-a')) = 2, '6a dos productos con datos');
select pg_temp.ok(public.costos_srv_subir('zz-co-a', '[{"catalog_id":"zz-co-polo","costo":99},{"catalog_id":"zz-co-gorra","costo":6},{"catalog_id":"zz-ajeno","costo":1}]') = 1,
                  '6b sube solo el que faltaba y es del negocio');
reset role;
select pg_temp.ok((select costo = 18.5 from public.catalogo_costos where catalog_id = 'zz-co-polo'), '6c no pisó el del dueño');
select pg_temp.ok((select costo = 6 from public.catalogo_costos where catalog_id = 'zz-co-gorra'), '6d subió el de la gorra');

-- 7 · Cerrado a quien no toca.
select pg_temp.ok(not has_function_privilege('authenticated', 'public.compras_srv_de(text)', 'execute'), '7a srv_de cerrado');
select pg_temp.ok(not has_function_privilege('anon', 'public.compras_guardar(text, text, jsonb)', 'execute'), '7b anon no guarda');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
