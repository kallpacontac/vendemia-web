-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0032: el barbero ve cómo va el pago de cada cita suya
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 24-nov-2026 (The 24/7, Alvaro, con la Mi agenda de Alexander): «los estados deben ser lo más
-- claros posibles; si falta completar que diga el monto, y si está sin verificar que lo diga; al
-- barbero debería salirle un aviso: corrobora con caja el pago total de la cita».
--
--   · mi_pagos(company, ids): de cada cita que el empleado ve (suya o sin asignar, no cancelada),
--     el total, lo pagado, si hay una captura sin verificar y si ya está cobrada entera.
--     El dueño y el administrador, de todas. Solo lectura: no da permiso para cobrar nada.
--
-- Necesita datos 0010 (pending_payments con appointment_id) y tu-pagina 0017 (comprobantes_web).
-- Idempotente. Deshacer: drop function if exists public.mi_pagos(text, text[]);
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.mi_pagos(p_company text, p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_rol   text := public.rol_en(p_company);
    v_ficha text;
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        v_ficha := coalesce(public.mi_empleado(p_company), '');
    end if;
    return coalesce((
        select jsonb_object_agg(x.id, jsonb_build_object(
                   'total', x.total, 'pagado', x.pagado, 'por_revisar', x.por_revisar, 'cobrada', x.cobrada))
          from (select a.id,
                       coalesce((select sum(s.price) from public.appointment_services s where s.appointment_id = a.id), 0) as total,
                       coalesce((select sum(p.amount) from public.pending_payments p
                                  where p.company_id = a.company_id and p.appointment_id = a.id), 0) as pagado,
                       exists (select 1 from public.comprobantes_web c
                                where c.company_id = a.company_id and c.appointment_id = a.id and c.estado = 'revisar') as por_revisar,
                       coalesce(a.pagado_por, '') <> '' as cobrada
                  from public.appointments a
                 where a.company_id = p_company
                   and a.id = any (coalesce(p_ids, '{}'::text[]))
                   and a.status <> 'cancelled'
                   and (v_ficha is null or coalesce(a.employee_id, '') = '' or a.employee_id = v_ficha)) x),
        '{}'::jsonb);
end $$;

revoke execute on function public.mi_pagos(text, text[]) from public, anon;
grant execute on function public.mi_pagos(text, text[]) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.mi_pagos(text, text[])') is not null as mi_pagos;
