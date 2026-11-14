-- Deshacer modules/fideliza/sql/0019_cumpleanos.sql. ⚠️ Borra los cumpleaños guardados.
begin;
drop function if exists public.loyalty_srv_cumple_hoy();
drop function if exists public.loyalty_birthday_set(text, uuid, text);
drop function if exists public.loyalty_birthday_get(text, uuid);
drop function if exists public.loyalty_persona(text, uuid);
drop table if exists public.loyalty_birthday_sent;
drop table if exists public.loyalty_birthdays;
alter table public.loyalty_settings drop column if exists cumple_regalo;
commit;
notify pgrst, 'reload schema';
