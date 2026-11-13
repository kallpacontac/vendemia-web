-- Deshace modules/datos/sql/0011_venta_congelada.sql.
-- ⚠️ Borra lo congelado: las comisiones vuelven a calcularse con la tarifa de hoy.
begin;
drop trigger if exists v2_congelar_cita on public.appointments;
drop trigger if exists v2_congelar_linea on public.appointment_services;
drop trigger if exists v2_congelar_pedido on public.orders;
drop function if exists public.v2_tg_congelar_cita();
drop function if exists public.v2_tg_congelar_linea();
drop function if exists public.v2_tg_congelar_pedido();
drop function if exists public.v2_congelar_cita(text);
drop function if exists public.v2_congelar_pedido(text);
drop table if exists public.comisiones_congeladas;
drop table if exists public.costos_congelados;
drop table if exists public.pedido_costos;
commit;
notify pgrst, 'reload schema';
