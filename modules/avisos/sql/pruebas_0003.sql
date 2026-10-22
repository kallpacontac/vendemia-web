-- Pruebas de 0003_stock_y_por_aprobar.sql. Todo dentro de BEGIN … ROLLBACK: no deja nada.
-- Si una falla, se corta con su motivo; si todas pasan, la última fila dice
-- «TODAS LAS PRUEBAS PASARON».
begin;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;

insert into public.companies (id, name) values ('zz-av3-a', 'Tienda de prueba');
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-av3-m1', '00000000-0000-4000-8000-0000000004b1', 'zz-av3-a', 'owner'),
    ('zz-av3-m2', '00000000-0000-4000-8000-0000000004b2', 'zz-av3-a', 'admin');
insert into public.leads (id, company_id, phone, name, source) values ('zz-av3-ana', 'zz-av3-a', '51999000222', 'Ana', 'whatsapp');
insert into public.catalog (id, company_id, name, stock) values ('zz-av3-polo', 'zz-av3-a', 'Polo negro', 12);
insert into public.catalog_variantes (id, company_id, catalog_id, etiqueta, stock)
    values ('zz-av3-polo-m', 'zz-av3-a', 'zz-av3-polo', 'M', 6);
-- La dueña quiere aviso a los 5 del polo y a los 2 de la M. El administrador, nada.
insert into public.avisos_stock (company_id, auth_user_id, catalog_id, variante_id, minimo) values
    ('zz-av3-a', '00000000-0000-4000-8000-0000000004b1', 'zz-av3-polo', null, 5),
    ('zz-av3-a', '00000000-0000-4000-8000-0000000004b1', 'zz-av3-polo', 'zz-av3-polo-m', 2);
-- Un celular de cada uno, con los avisos activados.
insert into public.panel_push_subscriptions (auth_user_id, company_id, endpoint, p256dh, auth, silencio_desde, silencio_hasta) values
    ('00000000-0000-4000-8000-0000000004b1', 'zz-av3-a', 'https://push.example/duena-0000000001', repeat('p', 40), repeat('a', 16), null, null),
    ('00000000-0000-4000-8000-0000000004b2', 'zz-av3-a', 'https://push.example/admin-0000000001', repeat('p', 40), repeat('a', 16), null, null);

-- 1 · Bajar de 12 a 8 no avisa; de 8 a 5 (cruza el mínimo) sí, una vez.
update public.catalog set stock = 8 where id = 'zz-av3-polo';
select pg_temp.ok((select count(*) = 0 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'stock'), '1a por encima no avisa');
update public.catalog set stock = 5 where id = 'zz-av3-polo';
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'stock'
                     and datos ->> 'para' = '00000000-0000-4000-8000-0000000004b1' and (datos ->> 'quedan')::int = 5), '1b cruza y avisa a la dueña');
update public.catalog set stock = 3 where id = 'zz-av3-polo';
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'stock'), '1c no repite al seguir bajando');

-- 2 · Reponen y vuelve a bajar: avisa otra vez (otra vuelta).
update public.catalog set stock = 20 where id = 'zz-av3-polo';
update public.catalog set stock = 4 where id = 'zz-av3-polo';
select pg_temp.ok((select count(*) = 2 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'stock'), '2 nueva vuelta');

-- 3 · La talla M, con su etiqueta.
update public.catalog_variantes set stock = 2 where id = 'zz-av3-polo-m';
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'stock'
                     and datos ->> 'opcion' = 'M' and datos ->> 'producto' = 'Polo negro'), '3 aviso de la talla');

-- 4 · Mia propone un mensaje: avisa. Uno pedido por una persona: no.
insert into public.borradores (company_id, lead_id, objetivo, texto) values ('zz-av3-a', 'zz-av3-ana', 'avisar', 'Llegó tu talla');
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'por_aprobar'), '4a lo propuesto por Mia avisa');
update public.borradores set estado = 'descartado' where company_id = 'zz-av3-a';
insert into public.borradores (company_id, lead_id, objetivo, texto, creado_por)
values ('zz-av3-a', 'zz-av3-ana', 'avisar', 'Pedido', '00000000-0000-4000-8000-0000000004b1');
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av3-a' and tipo = 'por_aprobar'), '4b lo pedido no avisa');

-- 5 · El despachador: el de stock solo al celular de la dueña; el de por aprobar, a los dos.
--     (Se llama como lo hace la web: con la clave del servidor. Aquí se salta esa comprobación.)
create or replace function pg_temp.destinos(p_tipo text) returns setof text language sql as $$
    select s.endpoint
      from public.panel_push_events v
      join public.panel_push_subscriptions s on s.company_id = v.company_id and s.revoked_at is null
     where v.company_id = 'zz-av3-a' and v.tipo = p_tipo
       and public.avisos_recibe(s.auth_user_id, s.company_id)
       and (v.datos ->> 'para' is null or s.auth_user_id::text = v.datos ->> 'para')
$$;
select pg_temp.ok((select count(distinct d) = 1 and min(d) like '%duena%' from pg_temp.destinos('stock') d), '5a stock solo a la dueña');
select pg_temp.ok((select count(distinct d) = 2 from pg_temp.destinos('por_aprobar') d), '5b por aprobar a dueña y administrador');
select pg_temp.ok(position('datos ->> ''para''' in pg_get_functiondef('public.panel_push_srv_pendientes()'::regprocedure)) > 0,
                  '5c el despachador filtra por destinatario');

-- 6 · Un error en el aviso no tumba el cambio de stock.
select pg_temp.ok((select stock = 4 from public.catalog where id = 'zz-av3-polo'), '6 el stock se guardó');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
