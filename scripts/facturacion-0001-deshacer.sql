-- Deshace modules/facturacion/sql/0001_facturacion.sql.
-- ⚠️ BORRA los comprobantes guardados. SUNAT pide conservarlos: exporta antes si hubo alguno en producción.
begin;
drop function if exists public.factura_srv_resultado(uuid, jsonb);
drop function if exists public.factura_srv_cargar(uuid);
drop function if exists public.factura_pedir_baja(text, uuid, text);
drop function if exists public.factura_uno(text, uuid);
drop function if exists public.factura_lista(text, date, date);
drop function if exists public.factura_reservar(text, jsonb);
drop function if exists public.factura_ajustes_guardar(text, jsonb, text, text);
drop function if exists public.factura_ajustes_leer(text);
drop function if exists public.factura_tasa(text, numeric, date);
drop function if exists public.factura_mype_proximo_cambio(date);
drop function if exists public.factura_tasa_mype(date);
drop function if exists public.factura_hoy();
drop function if exists public.factura_rol(text, boolean);
drop table if exists public.comprobantes_electronicos;
drop table if exists public.factura_series;
drop table if exists public.factura_credenciales;
drop table if exists public.factura_ajustes;
commit;
notify pgrst, 'reload schema';
