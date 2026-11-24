-- Deshace modules/lector/sql/0001_lector_de_pagos.sql. Borra los avisos leídos y los celulares
-- vinculados: después hay que volver a vincularlos.
do $$
begin
    perform cron.unschedule('lector_limpiar') where exists (select 1 from cron.job where jobname = 'lector_limpiar');
exception when others then null;
end $$;
drop function if exists public.lector_limpiar();
drop function if exists public.lector_srv_recibir(uuid, text, jsonb);
drop function if exists public.lector_srv_clave(uuid);
drop function if exists public.lector_srv_vincular(text, uuid, text, text);
drop function if exists public.lector_desvincular(text, uuid);
drop function if exists public.lector_estado(text, timestamptz);
drop function if exists public.lector_codigo_nuevo(text);
drop function if exists public.lector_puede(text);
drop table if exists public.lector_avisos;
drop table if exists public.lector_codigos;
drop table if exists public.lector_dispositivos;
notify pgrst, 'reload schema';
