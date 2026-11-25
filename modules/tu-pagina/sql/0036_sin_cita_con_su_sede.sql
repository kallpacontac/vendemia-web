-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0036: «Llegó sin cita» ya trae la sede del barbero
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 24-nov-2026 (The 24/7, Alvaro): «si el empleado está asignado a alguna sede, que lo infiera y
-- salga en el formulario». La de la 0026 tal cual, más `mis_sedes`: las sedes de su ficha
-- (Equipo, datos 0018 empleado_fichas), solo las que existen en Mi página. [] = trabaja en todas.
-- El formulario elige sola la suya si es una; si son varias, la última que usó de entre ellas.
--
-- Necesita la 0026 y datos 0018. Sin la 0018, `mis_sedes` sale vacío. Idempotente.
-- Deshacer: volver a correr modules/tu-pagina/sql/0026_sin_cita_del_barbero.sql (y luego la 0035).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.mi_agenda_sin_cita_datos(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_ficha text;
    v_sedes jsonb;
    v_mias  jsonb := '[]'::jsonb;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    v_ficha := public.mi_empleado(p_company);
    v_sedes := coalesce((
        select jsonb_agg(btrim(s->>'nombre'))
          from public.tu_pagina p,
               jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array' then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
         where p.company_id = p_company and btrim(coalesce(s->>'nombre', '')) <> ''), '[]'::jsonb);
    if v_ficha is not null then
        begin
            execute 'select coalesce(jsonb_agg(x), ''[]''::jsonb)
                       from public.empleado_fichas f, unnest(f.sedes) x
                      where f.company_id = $1 and f.employee_id = $2 and $3 ? x'
               into v_mias using p_company, v_ficha, v_sedes;
        exception when undefined_table then v_mias := '[]'::jsonb;
        end;
    end if;
    return jsonb_build_object(
        'ficha', v_ficha,
        'servicios', coalesce((
            select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'minutos', coalesce(nullif(c.duration_minutes, 0), 30))
                             order by c.sort_order nulls last, c.name)
              from public.catalog c
             where c.company_id = p_company and coalesce(c.is_active, 1) <> 0 and coalesce(c.tipo, '') <> 'producto'
               and jsonb_array_length(public.v2_franjas(c.schedule_slots)) = 0
               and not public.v2_es_cancha(p_company, c.id)), '[]'::jsonb),
        'sedes', v_sedes,
        'mis_sedes', v_mias);
end $$;

revoke execute on function public.mi_agenda_sin_cita_datos(text) from public, anon;
grant execute on function public.mi_agenda_sin_cita_datos(text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: cada barbero de The 24/7 con sus sedes (vacío = todas).
select e.name as barbero, coalesce(array_to_string(f.sedes, ', '), '') as sedes_vacio_es_todas
  from public.employees e
  left join public.empleado_fichas f on f.company_id = e.company_id and f.employee_id = e.id
 where e.company_id = 'the247barbershop' and coalesce(e.is_active, 1) <> 0
 order by e.name;
