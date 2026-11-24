-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0033: el «latido» de la Caja — ¿cambió algo hoy?
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 24-nov-2026 (The 24/7, Alvaro): «que el atendido del barbero pase a la caja automáticamente, rápido
-- y óptimo, sin afectar el rendimiento del dueño/cajero». La Caja recargaba TODO cada 20 s (citas,
-- movimientos, pagos, gastos…: varias consultas). Ahora pregunta cada 10 s solo esto: una huella
-- (md5) de lo que mueve la caja del día. Si no cambió, no recarga nada.
--
--   · caja_latido(company, dia) → texto. Cambia si cambia una cita del día (estado, cobro, barbero,
--     hora, sede), un pago apuntado hoy, un gasto o un ingreso sin ticket del día, o una captura por
--     revisar. Cualquiera del negocio puede pedirla: es una huella, no dice nada.
--
-- Idempotente. Deshacer: drop function if exists public.caja_latido(text, date);
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.caja_latido(p_company text, p_dia date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_dia   text := to_char(p_dia, 'YYYY-MM-DD');
    v_desde bigint := extract(epoch from (p_dia::timestamp at time zone 'America/Lima'))::bigint;
    v_citas text;
    v_pagos text;
    v_gastos text;
    v_ingresos text := '';
    v_revisar text := '';
begin
    if public.rol_en(p_company) is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;

    select count(*)::text || ':' || coalesce(md5(string_agg(
               a.id || '|' || coalesce(a.status, '') || '|' || coalesce(a.pagado_por, '') || '|' ||
               coalesce(a.employee_id, '') || '|' || a.slot_start || '|' || coalesce(a.sede, ''), ',' order by a.id)), '')
      into v_citas
      from public.appointments a
     where a.company_id = p_company and a.slot_start >= v_dia and a.slot_start < v_dia || '~';

    select count(*)::text || ':' || coalesce(sum(p.amount), 0)::text || ':' || coalesce(max(p.created_at), 0)::text
      into v_pagos
      from public.pending_payments p
     where p.company_id = p_company and p.created_at >= v_desde;

    select count(*)::text || ':' || coalesce(sum(g.importe), 0)::text
      into v_gastos
      from public.gastos g
     where g.company_id = p_company and g.fecha = v_dia;

    -- Sin la 0023 (ingresos) o la 0017 de tu-pagina (capturas), esa parte queda vacía.
    begin
        execute 'select count(*)::text || '':'' || coalesce(sum(importe), 0)::text from public.caja_ingresos
                  where company_id = $1 and dia = $2' into v_ingresos using p_company, p_dia;
    exception when undefined_table then v_ingresos := '';
    end;
    begin
        execute 'select count(*)::text from public.comprobantes_web where company_id = $1 and estado = ''revisar'''
           into v_revisar using p_company;
    exception when undefined_table then v_revisar := '';
    end;

    return md5(v_citas || '#' || v_pagos || '#' || v_gastos || '#' || v_ingresos || '#' || v_revisar);
end $$;

revoke execute on function public.caja_latido(text, date) from public, anon;
grant execute on function public.caja_latido(text, date) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: una huella de 32 caracteres (si eres de ese negocio) o «sí» de que existe.
select to_regprocedure('public.caja_latido(text, date)') is not null as caja_latido;
