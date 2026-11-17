-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · RESET después de la demo y las pruebas (17-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   Borra:
--     1. Todo lo de scripts/the247-demo.sql (clientes «demo247-…» y sus citas, pagos y comprobantes,
--        también las citas que se crearon en la demo para ellos: reprogramadas, «Nueva cita»…).
--     2. Las citas, pagos y comprobantes de los CELULARES DE PRUEBA de v_telefonos (abajo). Pon ahí
--        cada número con el que se hicieron reservas de prueba (solo los 9 dígitos).
--   No borra: catálogo, página, sedes, club, cuentas, ni a ningún otro cliente. Las citas reales de
--   clientes reales se quedan.
--   No toca el Club 24/7: una tarjeta creada en la prueba se queda (es inofensiva; sus sellos están
--   auditados y no se borran a mano).
--
--   Primero corre SOLO el bloque «Vista previa» (abajo del todo, comentado) si quieres ver qué se
--   va a borrar.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_id        constant text := 'the247barbershop';
    -- ⚠️ Los celulares de prueba (9 dígitos). Añade los que usaron en la demo.
    v_telefonos constant text[] := array['947144701'];
    v_citas     text[];
    v_leads     text[];
    n_comp integer; n_pagos integer; n_citas integer; n_leads integer;
begin
    select coalesce(array_agg(id), '{}') into v_leads from public.leads
     where company_id = v_id
       and (id like 'demo247-%' or right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = any(v_telefonos));
    select coalesce(array_agg(id), '{}') into v_citas from public.appointments
     where company_id = v_id and (id like 'demo247-%' or lead_id = any(v_leads));

    delete from public.comprobantes_web where company_id = v_id and (appointment_id = any(v_citas) or lead_id = any(v_leads));
    get diagnostics n_comp = row_count;
    delete from public.pending_payments where company_id = v_id and (appointment_id = any(v_citas) or lead_id = any(v_leads));
    get diagnostics n_pagos = row_count;
    delete from public.appointment_services where appointment_id = any(v_citas);
    delete from public.appointments where company_id = v_id and id = any(v_citas);
    get diagnostics n_citas = row_count;
    -- Solo los clientes de mentira; el de un celular de prueba se queda (puede tener chat o tarjeta).
    delete from public.leads where company_id = v_id and id like 'demo247-%';
    get diagnostics n_leads = row_count;

    raise notice 'Borrado: % citas, % pagos, % comprobantes, % clientes demo.', n_citas, n_pagos, n_comp, n_leads;
end $$;

commit;

-- Comprobación: lo que queda (debería ser solo lo de clientes reales).
select count(*) filter (where id like 'demo247-%') as citas_demo_que_quedan,
       count(*) as citas_en_total
  from public.appointments where company_id = 'the247barbershop';
select count(*) as comprobantes_por_revisar from public.comprobantes_web where company_id = 'the247barbershop' and estado = 'revisar';

-- Vista previa (córrela sola, ANTES del reset, para ver qué se iría):
-- select a.slot_start, a.sede, a.status, a.service, l.name, l.phone
--   from public.appointments a left join public.leads l on l.id = a.lead_id
--  where a.company_id = 'the247barbershop'
--    and (a.id like 'demo247-%' or l.id like 'demo247-%'
--         or right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = any(array['947144701']))
--  order by a.slot_start;
