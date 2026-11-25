-- ═══════════════════════════════════════════════════════════════════════════════
-- barberia-01 (demo) · BORRAR LOS DATOS DE PRUEBA de scripts/barberia-01-prueba-cargar.sql.
-- ═══════════════════════════════════════════════════════════════════════════════
--   Solo lo que lleva «demob01-» o «cierre-demob01»: citas, cobros, capturas, gastos, el pago de
--   comisión, clientes, y los barberos y productos que creó (si los creó). No toca nada más.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

delete from public.comision_cierres c where c.company_id = 'barberia-01' and exists (select 1 from unnest(c.citas) x where x like 'demob01-%');
delete from public.gastos where company_id = 'barberia-01' and (id like 'demob01-%' or id like 'cierre-demob01%');
delete from public.comprobantes_web where company_id = 'barberia-01' and (lead_id like 'demob01-%' or appointment_id like 'demob01-%');
delete from public.pending_payments where company_id = 'barberia-01' and (lead_id like 'demob01-%' or appointment_id like 'demob01-%');
do $$ begin
    if to_regclass('public.comisiones_congeladas') is not null then
        delete from public.comisiones_congeladas where company_id = 'barberia-01' and appointment_id like 'demob01-%';
    end if;
end $$;
delete from public.appointment_services where appointment_id in
    (select id from public.appointments where company_id = 'barberia-01' and (id like 'demob01-%' or lead_id like 'demob01-%'));
delete from public.appointments where company_id = 'barberia-01' and (id like 'demob01-%' or lead_id like 'demob01-%');
delete from public.leads where company_id = 'barberia-01' and id like 'demob01-%';
-- Barberos y productos creados por la prueba: se desactivan (una cita real podría apuntarles).
update public.employees set is_active = 0 where company_id = 'barberia-01' and id like 'demob01-e%';
update public.catalog set is_active = 0 where company_id = 'barberia-01' and id like 'demob01-p%';

commit;

select count(*) as citas_de_prueba_que_quedan from public.appointments where company_id = 'barberia-01' and id like 'demob01-%';
