-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0034: en cada sede, solo sus barberos
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7): «que en la página se filtren los barberos por sede: si alguno
-- corresponde a una sede, no debe aparecer en la otra».
--
-- Las sedes de cada empleado se marcan en Panel › Equipo (datos 0018, empleado_fichas). Aquí
-- tu_pagina_srv_datos las manda con el equipo; la página (dominio/agenda.ts, agendaDeSede)
-- enseña y cuenta solo a los de la sede elegida, y la reserva rechaza un barbero de otra sede.
-- Sin sedes marcadas, el barbero está en todas.
--
-- Es la tu_pagina_srv_datos de la 0033 con un campo más. Necesita la 0033 y datos 0018.
-- Idempotente. Deshacer: correr otra vez la 0033.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$ begin
    if to_regclass('public.empleado_fichas') is null then
        raise exception 'Corre antes modules/datos/sql/0018_ficha_del_empleado.sql (las sedes de cada empleado).';
    end if;
end $$;

begin;

create or replace function public.tu_pagina_srv_datos(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v     public.tu_pagina;
    c     public.companies;
    v_hoy text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD');
    -- Desde ayer: una reserva de las 23:00 que acaba a la 01:00 aún ocupa la madrugada de hoy.
    v_ayer text := to_char((now() at time zone 'America/Lima') - interval '1 day', 'YYYY-MM-DD');
begin
    perform public.loyalty_srv_check();
    select * into v from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select * into c from public.companies where id = v.company_id;

    return jsonb_build_object(
        'status', 'ok',
        'negocio', jsonb_build_object(
            'modo', c.business_mode, 'horario', c.schedule, 'slot_minutes', c.slot_minutes,
            'pide_profesional', c.ask_employee, 'entrega', c.delivery_type, 'direccion', c.location),
        'catalogo', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', k.id, 'nombre', k.name, 'descripcion', k.description, 'precio', k.price,
                'duracion', k.duration_minutes, 'stock', k.stock, 'grupos', k.schedule_slots,
                'vigencia_meses', k.vigencia_meses, 'promo_vigencia', k.promo_vigencia, 'familia', k.familia,
                -- 0033: servicio o producto (catalog.tipo). La página de solo Agenda no ofrece productos.
                'tipo', coalesce(k.tipo, ''))
                order by k.sort_order nulls last, k.name)
              from public.catalog k
             where k.company_id = v.company_id and coalesce(k.is_active, 1) = 1), '[]'::jsonb),
        'media', coalesce((
            select jsonb_agg(jsonb_build_object(
                'catalog_id', m.catalog_id, 'url', m.url, 'tipo', m.media_type, 'principal', m.is_primary)
                order by m.is_primary desc nulls last, m.sort_order nulls last, m.created_ts)
              from public.catalog_media m
              join public.catalog k on k.company_id = m.company_id and k.id = m.catalog_id and coalesce(k.is_active, 1) = 1
             where m.company_id = v.company_id), '[]'::jsonb),
        'variantes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', w.id, 'catalog_id', w.catalog_id, 'etiqueta', w.etiqueta, 'atributos', w.atributos, 'stock', w.stock)
                order by w.etiqueta)
              from public.catalog_variantes w where w.company_id = v.company_id), '[]'::jsonb),
        'equipo', coalesce((
            select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.name, 'horario', e.schedule, 'foto', e.foto_url,
                    -- 0034: en qué sedes trabaja (Equipo, datos 0018). [] = en todas.
                    'sedes', coalesce((select to_jsonb(f.sedes) from public.empleado_fichas f
                                        where f.company_id = e.company_id and f.employee_id = e.id), '[]'::jsonb)) order by e.name)
              from public.employees e where e.company_id = v.company_id and coalesce(e.is_active, 1) = 1), '[]'::jsonb),
        'bloqueos', coalesce((
            select jsonb_agg(jsonb_build_object('employee_id', b.employee_id, 'inicio', b.start, 'fin', b."end"))
              from public.employee_blocks b where b.company_id = v.company_id and b."end" >= v_hoy), '[]'::jsonb),
        'citas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'slot_start', a.slot_start, 'slot_end', a.slot_end, 'slot_minutes', a.slot_minutes,
                'employee_id', a.employee_id, 'status', a.status, 'creada', a.created_at, 'sede', coalesce(a.sede, ''),
                'catalog_id', (select s.catalog_item_id from public.appointment_services s
                                where s.appointment_id = a.id order by s.sort_order limit 1),
                'periodo_desde', a.periodo_desde, 'periodo_hasta', a.periodo_hasta))
              from public.appointments a
             where a.company_id = v.company_id
               and ((a.slot_start like 'sched:%' and a.status = 'confirmed'
                     and (coalesce(a.periodo_hasta, '') = '' or a.periodo_hasta >= v_hoy))
                 or (a.slot_start >= v_ayer and (a.status in ('confirmed', 'completed') or (a.status = 'pending_payment' and a.created_at > extract(epoch from now() - interval '24 hours')))))), '[]'::jsonb),
        'web', coalesce((
            select jsonb_agg(jsonb_build_object('slot_start', r.slot_start, 'slot_end', r.slot_end, 'employee_id', r.employee_id))
              from public.reservas_web r
             where r.company_id = v.company_id and r.estado in ('apartada', 'confirmada')
               and (r.tipo = 'grupo' or r.slot_start >= v_hoy)), '[]'::jsonb),
        'apartado', coalesce((
            select jsonb_object_agg(s.clave, s.n) from (
                select (l->>'catalog_id') || '|' || coalesce(l->>'variante_id', '') as clave, sum((l->>'cantidad')::int) as n
                  from public.pedidos_web p, jsonb_array_elements(p.lineas) l
                 where p.company_id = v.company_id and p.estado in ('nuevo', 'confirmado')
                 group by 1) s), '{}'::jsonb),
        'hoy', v_hoy,
        'ahora', to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI'));
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y los barberos con sus sedes.
select position('empleado_fichas' in pg_get_functiondef('public.tu_pagina_srv_datos(text)'::regprocedure)) > 0 as con_sedes;
select e.name as barbero, coalesce(array_to_string(f.sedes, ', '), '') as sedes_vacio_es_todas
  from public.employees e
  left join public.empleado_fichas f on f.company_id = e.company_id and f.employee_id = e.id
 where e.company_id = 'the247barbershop' and coalesce(e.is_active, 1) = 1
 order by e.name;
