-- Deshace tu-pagina 0038. Las citas que ya tienen el precio rebajado lo conservan.
begin;
drop function if exists public.cita_srv_descuento_web(text, text, text);
drop function if exists public.v2_descuento_web_pct(jsonb);
drop table if exists public.descuentos_web;
commit;
notify pgrst, 'reload schema';
