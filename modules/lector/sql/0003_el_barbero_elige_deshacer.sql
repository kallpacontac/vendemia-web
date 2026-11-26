-- Deshace modules/lector/sql/0003_el_barbero_elige.sql. Los cobros que ya hizo el barbero con un Yape se
-- quedan (son cobros). lector_estado y lector_desasignar vuelven a los de la 0002: después de esto,
-- corre otra vez la 0002.
drop function if exists public.lector_cobrar_con(text, text, bigint, jsonb);
drop function if exists public.lector_para_cobrar(text, text);
drop function if exists public.lector_srv_lectura(text, text, numeric, text, text, text);
drop function if exists public.lector_ajustes_guardar(text, int, int, text);
drop function if exists public.lector_ajustes_ver(text);
drop function if exists public.lector_dispositivo_sede(text, uuid, text);
drop function if exists public.lector_quien_cobra(text);
drop function if exists public.lector_ajustes_de(text);
drop table if exists public.lector_lecturas;
drop table if exists public.lector_ajustes;
update public.lector_avisos set asignado = 'panel' where asignado = 'equipo';
alter table public.lector_avisos drop constraint if exists lector_avisos_asignado_chk;
alter table public.lector_avisos add constraint lector_avisos_asignado_chk check (asignado in ('', 'auto', 'panel'));
alter table public.lector_avisos drop column if exists foto_ok, drop column if exists sobra, drop column if exists elegido_por;
alter table public.lector_dispositivos drop column if exists sede;
notify pgrst, 'reload schema';
