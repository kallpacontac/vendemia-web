-- ═══════════════════════════════════════════════════════════════════════════
-- DESHACER la siembra de scripts/siembra-oct-nov.sql
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Borra SOLO lo que tiene id `seed-…`: ningún dato real lleva ese prefijo (el
-- bot y la nube usan uuid). Cada borrado de cita, pedido o pago queda anotado
-- en sync_borrados, que es lo correcto: si un bot llegó a bajar la siembra, la
-- quita también de su SQLite.
--
-- Ejecútalo entero en el editor SQL de Supabase (rol postgres).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

delete from public.pending_payments     where id like 'seed-%';
delete from public.appointment_services where appointment_id like 'seed-%';
delete from public.appointments         where id like 'seed-%';
delete from public.orders               where id like 'seed-%';
delete from public.messages             where lead_id like 'seed-%';
delete from public.leads                where id like 'seed-%';

-- Por si la siembra corrió con los avisos encendidos (no debería).
do $$
begin
    if to_regclass('public.panel_push_events') is not null then
        delete from public.panel_push_events where ref ~ '^(cita|pedido|pago):seed-';
    end if;
end $$;

commit;

select (select count(*) from public.leads where id like 'seed-%')        as leads_que_quedan,
       (select count(*) from public.appointments where id like 'seed-%') as citas_que_quedan,
       (select count(*) from public.orders where id like 'seed-%')       as pedidos_que_quedan;
