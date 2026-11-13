-- Deshace modules/datos/sql/0012_cobra_el_empleado.sql.
-- Después hay que volver a correr la 0010 para recuperar sus versiones de cobro_foto_modo,
-- cobro_foto_permiso y cobro_fotos_del_dia.
-- ⚠️ Si algún empleado ya cobró, sus fotos (via = 'empleado') impiden volver a la restricción
-- de la 0010: se dejan con la restricción ampliada.
begin;
drop function if exists public.empleado_cobrar_saldo(text, text, text, jsonb);
drop function if exists public.empleado_saldos(text, text[]);
drop function if exists public.cobro_empleado_guardar(text, boolean);
drop function if exists public.v2_empleado_puede_cobrar(text);
drop function if exists public.v2_empleado_cobra(text);
alter table public.cobro_ajustes drop column if exists empleado_cobra;
alter table public.cobro_ajustes drop column if exists empleado_cobra_por;
alter table public.cobro_ajustes drop column if exists empleado_cobra_at;
commit;
notify pgrst, 'reload schema';
