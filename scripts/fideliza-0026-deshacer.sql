-- Deshace modules/fideliza/sql/0026_resena_y_nota.sql (pedir reseña y nota del cliente).
-- Borra la configuración de reseñas, a quién se le pidió y las notas de los clientes.
begin;
drop function if exists public.loyalty_resena_guardar(text, jsonb);
drop function if exists public.loyalty_resena_leer(text);
drop function if exists public.loyalty_srv_resenas_hoy();
drop function if exists public.loyalty_srv_resena_tarjeta(text);
drop function if exists public.loyalty_resena_url_ok(text);
drop function if exists public.loyalty_member_nota_get(text, uuid);
drop function if exists public.loyalty_member_nota_set(text, uuid, text);
drop table if exists public.loyalty_resena_pedidos;
drop table if exists public.loyalty_member_notas;
alter table public.loyalty_settings drop column if exists resena;
commit;
notify pgrst, 'reload schema';
