-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0007_catalogo_tipo.sql
--
-- Se corre DESPUÉS de aplicar la 0047 del bot y la 0007. Todo dentro de BEGIN … ROLLBACK. Si
-- algo falla se para con «FALLO n: …»; si llega al final, la última fila dice
-- «TODAS LAS PRUEBAS PASARON».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated;

create function pg_temp.rechaza(p_item jsonb, p_motivo text, p_n text) returns void language plpgsql as $$
begin
    perform public.cfg_producto_guardar('zz-v2t-a', p_item);
    raise exception 'FALLO % (lo aceptó)', p_n;
exception when others then
    if sqlerrm like 'FALLO %' then raise; end if;
    if position(p_motivo in sqlerrm) = 0 then raise exception 'FALLO % (motivo: %)', p_n, sqlerrm; end if;
end $$;
grant execute on function pg_temp.rechaza(jsonb, text, text) to authenticated;

insert into public.companies (id, name, business_mode) values ('zz-v2t-a', 'Barbería de prueba', 'appointment');
insert into public.datos_v2_empresas (company_id, config_en_nube) values ('zz-v2t-a', true);
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-v2t-m1', '00000000-0000-4000-8000-0000000002f1', 'zz-v2t-a', 'owner');
insert into public.catalog (id, company_id, name, duration_minutes) values ('zz-v2t-c1', 'zz-v2t-a', 'Cera mate', 30);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002f1","role":"authenticated"}';

-- 1 · Lo que manda la ficha al marcar «Es un producto».
select public.cfg_producto_guardar('zz-v2t-a', '{"id":"zz-v2t-c1","tipo":"producto","stock":12,"duration_minutes":null}');
reset role;
select pg_temp.ok((select tipo = 'producto' and stock = 12 and duration_minutes = 0
                     from public.catalog where id = 'zz-v2t-c1'), '1 guarda producto');

-- 2 · Volver a servicio: la ficha manda '' (no 'servicio'). Y null también deja ''.
set local role authenticated;
select public.cfg_producto_guardar('zz-v2t-a', '{"id":"zz-v2t-c1","tipo":""}');
reset role;
select pg_temp.ok((select tipo = '' from public.catalog where id = 'zz-v2t-c1'), '2a vuelve a servicio');
set local role authenticated;
select public.cfg_producto_guardar('zz-v2t-a', '{"id":"zz-v2t-c1","tipo":"servicio"}');
select public.cfg_producto_guardar('zz-v2t-a', '{"id":"zz-v2t-c1","tipo":null}');
reset role;
select pg_temp.ok((select tipo = '' from public.catalog where id = 'zz-v2t-c1'), '2b null = vacío');

-- 3 · Sin `tipo` en el patch, no se toca.
set local role authenticated;
select public.cfg_producto_guardar('zz-v2t-a', '{"id":"zz-v2t-c1","tipo":"producto"}');
select public.cfg_producto_guardar('zz-v2t-a', '{"id":"zz-v2t-c1","price":15}');
reset role;
select pg_temp.ok((select tipo = 'producto' and price = 15 from public.catalog where id = 'zz-v2t-c1'), '3 no se toca');

-- 4 · Otro valor se rechaza con su motivo, y no se guarda nada del patch.
set local role authenticated;
select pg_temp.rechaza('{"id":"zz-v2t-c1","tipo":"Producto","price":99}', 'tipo debe ser', '4a mayúscula');
select pg_temp.rechaza('{"id":"zz-v2t-c1","tipo":"articulo"}', 'tipo debe ser', '4b otro');
reset role;
select pg_temp.ok((select tipo = 'producto' and price = 15 from public.catalog where id = 'zz-v2t-c1'), '4c nada guardado');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
