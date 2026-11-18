-- Deshace modules/facturacion/sql/0003_boleta_al_cobrar.sql.
-- Los enlaces /comprobante/<id> ya enviados dejan de abrir. Los comprobantes no se tocan.
begin;
drop function if exists public.factura_publica(uuid);
drop function if exists public.factura_al_cobrar_guardar(text, text);
alter table public.factura_ajustes drop constraint if exists factura_ajustes_al_cobrar_check;
alter table public.factura_ajustes drop column if exists al_cobrar;
commit;
notify pgrst, 'reload schema';
