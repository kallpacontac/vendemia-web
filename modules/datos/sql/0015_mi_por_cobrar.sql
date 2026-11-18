-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0015: lo que el barbero ve en «Mi comisión» = lo que el dueño ve en «Por pagar»
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7). El dueño ve «Por pagar a tu equipo» desde el último pago (cierres,
-- 0014); el barbero veía «Vas a recibir» por quincena. Dos números para la misma pregunta son
-- una discusión asegurada. Ahora los dos salen de la misma cuenta (lib/panel/cierres.ts):
-- la comisión de lo atendido que ningún pago cubre, menos los adelantos que ningún pago descontó.
--
-- El barbero no lee comision_cierres ni gastos (solo dueño y administrador). mi_por_cobrar le da
-- SOLO lo suyo:
--   · primero: desde cuándo lleva cuentas el negocio (el primer cierre de cualquiera): fija
--     desde qué día se cuenta, igual que para el dueño.
--   · cierres: sus pagos (citas y adelantos que cubrió, cuánto, cómo y cuándo).
--   · adelantos: sus adelantos que ningún pago descontó todavía.
--
-- Necesita la 0013 (gastos.tipo) y la 0014 (comision_cierres), y mi_empleado (roles del bot).
-- Idempotente. Deshacer: drop function public.mi_por_cobrar(text);
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.mi_por_cobrar(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_ficha text;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    v_ficha := public.mi_empleado(p_company);
    if v_ficha is null then return jsonb_build_object('ficha', null); end if;
    return jsonb_build_object(
        'ficha', v_ficha,
        'primero', (select min(desde)::text from public.comision_cierres where company_id = p_company),
        'cierres', coalesce((
            select jsonb_agg(jsonb_build_object('citas', c.citas, 'adelantos', c.adelantos, 'comision', c.comision,
                                                'adelantado', c.adelantado, 'pagado', c.pagado, 'metodo', c.metodo,
                                                'pagado_at', c.pagado_at) order by c.pagado_at desc)
              from public.comision_cierres c
             where c.company_id = p_company and c.employee_id = v_ficha), '[]'::jsonb),
        'adelantos', coalesce((
            select jsonb_agg(jsonb_build_object('id', g.id, 'fecha', g.fecha, 'concepto', g.concepto, 'importe', g.importe) order by g.fecha desc)
              from public.gastos g
             where g.company_id = p_company and g.tipo = 'adelanto' and g.employee_id = v_ficha
               and not exists (select 1 from public.comision_cierres c
                                where c.company_id = p_company and g.id = any (c.adelantos))), '[]'::jsonb));
end $$;

revoke execute on function public.mi_por_cobrar(text) from public, anon;
grant execute on function public.mi_por_cobrar(text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.mi_por_cobrar(text)') is not null as mi_por_cobrar;
