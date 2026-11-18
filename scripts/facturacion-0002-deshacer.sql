-- Deshace modules/facturacion/sql/0002_servicios_y_productos.sql.
-- Los locales con «ambas» pasan a «servicios» (2002). Los comprobantes ya emitidos no se tocan.
-- Después vuelve a correr la sección 4 de la 0001 (factura_reservar) para que no llame a factura_leyendas.
begin;
update public.factura_ajustes set leyenda_amazonia = '2002' where leyenda_amazonia = 'ambas';
alter table public.factura_ajustes drop constraint if exists factura_ajustes_leyenda_amazonia_check;
alter table public.factura_ajustes add constraint factura_ajustes_leyenda_amazonia_check
    check (leyenda_amazonia in ('2001', '2002'));
commit;
-- (Cuando factura_reservar ya sea la de la 0001:)
-- drop function if exists public.factura_leyendas(text, text, jsonb);
notify pgrst, 'reload schema';
