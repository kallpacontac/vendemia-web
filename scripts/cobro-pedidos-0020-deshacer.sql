-- Deshace modules/tu-pagina/sql/0020_cobro_de_pedidos.sql.
-- Los pagos ya apuntados (adelantos y restos) se quedan: es dinero que entró y la Caja los cuenta.
begin;
drop trigger if exists orders_pagar_antes on public.orders;
drop trigger if exists orders_resto_al_cobrar on public.orders;
drop function if exists public.v2_orders_pagar_antes();
drop function if exists public.v2_orders_resto();
drop function if exists public.pedido_srv_cobro(text, text);
drop function if exists public.pedido_cobrar(text, text, numeric, text, text);
drop function if exists public.pedido_cobro_guardar(text, jsonb);
drop function if exists public.v2_pedido_a_pagar(text, numeric);
update public.tu_pagina set secciones = secciones - 'cobroPedidos' where secciones ? 'cobroPedidos';
alter table public.orders drop column if exists pagar_antes;
commit;
