-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0003_nulos_del_formulario.sql
--
-- Se corre DESPUÉS de aplicar la 0003. Todo dentro de BEGIN … ROLLBACK. Si algo falla se
-- para con «FALLO n: …»; si llega al final, la última fila dice «TODAS LAS PRUEBAS PASARON».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated;

insert into public.companies (id, name, business_mode) values ('zz-v2c-a', 'Academia de prueba', 'recurring_appointment');
insert into public.datos_v2_empresas (company_id, config_en_nube) values ('zz-v2c-a', true);
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-v2c-m1', '00000000-0000-4000-8000-0000000002d1', 'zz-v2c-a', 'owner');
insert into public.catalog (id, company_id, name, description, price, capacity, schedule_slots, vigencia_meses, is_active)
values ('zz-v2c-pollito', 'zz-v2c-a', 'Nivel Pollito', 'Para empezar', 120, 8, '[{"id":"tarde"}]', 3, 1);
insert into public.employees (id, company_id, name, comision_pct) values ('zz-v2c-marco', 'zz-v2c-a', 'Marco', 40);

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002d1","role":"authenticated"}';

-- 1 · Lo que manda de verdad el formulario al guardar un nivel en un negocio de grupos.
select public.cfg_producto_guardar('zz-v2c-a', '{
    "id": "zz-v2c-pollito", "name": "Nivel Pollito", "description": null, "price": 150, "currency": "PEN",
    "is_active": 1, "stock": null, "max_discount": null, "duration_minutes": null, "capacity": null,
    "package_services": "[]", "promo_vigencia": "", "vigencia_meses": null
}');

reset role;
select pg_temp.ok((select price = 150 from public.catalog where id = 'zz-v2c-pollito'), '1a guarda el precio');
select pg_temp.ok((select capacity = 8 from public.catalog where id = 'zz-v2c-pollito'), '1b el cupo NO baja a 1');
select pg_temp.ok((select vigencia_meses = 3 from public.catalog where id = 'zz-v2c-pollito'), '1c los meses se conservan');
select pg_temp.ok((select description = '' from public.catalog where id = 'zz-v2c-pollito'), '1d descripción vaciada');
select pg_temp.ok((select duration_minutes = 0 and max_discount = 0 from public.catalog where id = 'zz-v2c-pollito'), '1e números vaciados a 0');
select pg_temp.ok((select stock is null from public.catalog where id = 'zz-v2c-pollito'), '1f stock null de verdad');
select pg_temp.ok((select schedule_slots = '[{"id":"tarde"}]' from public.catalog where id = 'zz-v2c-pollito'), '1g los grupos intactos');

-- 2 · Un producto nuevo con nulls nace con los valores por defecto, no falla.
set local role authenticated;
select public.cfg_producto_guardar('zz-v2c-a', '{"id":"zz-v2c-nuevo","name":"Nuevo","capacity":null,"is_active":null,"description":null}');
reset role;
select pg_temp.ok((select capacity = 1 and is_active = 1 and description = '' from public.catalog where id = 'zz-v2c-nuevo'), '2 nuevo con defectos');

-- 3 · Equipo: comision_pct null → 0 (sin comisión), is_active null → se conserva.
set local role authenticated;
select public.cfg_trabajador_guardar('zz-v2c-a', '{"id":"zz-v2c-marco","comision_pct":null,"is_active":null}');
reset role;
select pg_temp.ok((select comision_pct = 0 and is_active = 1 from public.employees where id = 'zz-v2c-marco'), '3 equipo');

-- 4 · Ajustes: un null en una columna NOT NULL de companies se ignora, no tumba el resto.
set local role authenticated;
select public.cfg_empresa_actualizar('zz-v2c-a', '{"name":null,"bot_name":"Mia"}');
reset role;
select pg_temp.ok((select name = 'Academia de prueba' from public.companies where id = 'zz-v2c-a'), '4 nombre conservado');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
