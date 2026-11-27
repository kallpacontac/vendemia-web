-- Deshace modules/fideliza/sql/0028_amigos_y_google.sql.
-- ⚠️ Borra las invitaciones, los códigos de amigos y los enlaces con Google. Los premios de amigos
-- que ya se ganaron se quedan como premios normales (solo se quita la columna `origen`).
begin;
drop trigger if exists tr_loyalty_amigos_ledger on public.loyalty_ledger;
drop function if exists public.loyalty_amigos_ledger();
drop function if exists public.loyalty_amigos_premiar(uuid);
drop function if exists public.loyalty_amigos_guardar(text, jsonb);
drop function if exists public.loyalty_amigos_leer(text);
drop function if exists public.loyalty_amigos_resumen(text, timestamptz, timestamptz);
drop function if exists public.loyalty_srv_tarjeta_extras(text);
drop function if exists public.loyalty_srv_amigos_invita(text, text);
drop function if exists public.loyalty_srv_amigo_anotar(text, text);
drop function if exists public.loyalty_srv_amigo_avisos(text, uuid);
drop function if exists public.loyalty_srv_google_vincular(text, text);
drop function if exists public.loyalty_srv_google_recuperar(text, text);
drop function if exists public.loyalty_srv_celular_en_uso(text, text);
drop function if exists public.loyalty_amigos_vivo(text);
drop function if exists public.loyalty_amigos_cfg(text);
drop table if exists public.loyalty_amigos;
drop table if exists public.loyalty_amigo_codigos;
drop table if exists public.loyalty_member_google;
alter table public.loyalty_rewards drop constraint if exists loyalty_rewards_origen_ck;
alter table public.loyalty_rewards drop column if exists origen;
alter table public.loyalty_settings drop column if exists amigos;
commit;
notify pgrst, 'reload schema';
