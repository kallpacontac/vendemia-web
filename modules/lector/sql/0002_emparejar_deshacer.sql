-- Deshace modules/lector/sql/0002_emparejar.sql. Los pagos ya aplicados a citas se quedan (son
-- cobros); solo se deja de emparejar. lector_srv_recibir y lector_estado vuelven a los de la 0001:
-- después de esto, corre otra vez la 0001.
drop trigger if exists lector_cita on public.appointments;
drop trigger if exists lector_lineas on public.appointment_services;
drop function if exists public.lector_tg_cita();
drop function if exists public.lector_tg_lineas();
drop function if exists public.lector_desasignar(text, bigint);
drop function if exists public.lector_asignar(text, bigint, text);
drop function if exists public.lector_por_asignar(text);
drop function if exists public.lector_srv_ya_pague(text, text, text);
drop function if exists public.lector_srv_activo(text);
drop function if exists public.lector_emparejar(text);
drop function if exists public.lector_aplicar(bigint, text, text, uuid, uuid, text);
drop function if exists public.lector_candidatos(public.lector_avisos);
drop function if exists public.lector_clave_pagador(text);
drop function if exists public.lector_parecido(text, text);
drop function if exists public.lector_palabras(text);
drop function if exists public.lector_suena(text);
drop table if exists public.lector_alias;
drop table if exists public.lector_esperas;
alter table public.lector_avisos drop constraint if exists lector_avisos_asignado_chk;
alter table public.lector_avisos drop column if exists motivo, drop column if exists descartes, drop column if exists dudoso, drop column if exists antes,
    drop column if exists como, drop column if exists asignado_at, drop column if exists asignado, drop column if exists cita_id;
notify pgrst, 'reload schema';
