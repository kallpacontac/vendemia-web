-- Deshace modules/tu-pagina/sql/0019_tablero_de_pedidos.sql.
-- Los pedidos de la página en 'listo' vuelven a 'confirmado' para que entren en el check de antes.
begin;

drop function if exists public.pedido_etapa(text, text, text);

update public.pedidos_web set estado = 'confirmado' where estado = 'listo';
alter table public.pedidos_web drop constraint if exists pedidos_web_estado_check;
alter table public.pedidos_web add constraint pedidos_web_estado_check
    check (estado in ('nuevo', 'confirmado', 'entregado', 'cancelado'));

alter table public.orders drop constraint if exists orders_etapa_check;
alter table public.orders drop column if exists etapa_at;
alter table public.orders drop column if exists etapa;

commit;
