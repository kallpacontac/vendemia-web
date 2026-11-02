-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0012: la cara de cada empleado al reservar
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 2-nov-2026: si el negocio deja elegir empleado, el cliente elige viendo
-- su foto, no un nombre en una lista.
--
-- 1. employees.foto_url. Nula o vacía = sin foto: la página pinta su inicial.
--
-- 2. cfg_trabajador_foto, y NO un campo más de cfg_trabajador_guardar: en un negocio
--    que aún es del bot, `upsert_employee` va a su cola y su lista blanca no conoce
--    la foto; la ignoraría. La foto no pinta nada para el bot, así que se escribe
--    directa y vale igual con bot que sin él. Por eso autoriza con
--    tu_pagina_autorizar (admin o dueño), que no exige config_en_nube.
--
-- 3. tu_pagina_srv_datos (0011) devuelve además la foto de cada uno.
--
-- No se ejecuta sola: se corre entera en el editor SQL de Supabase. Se puede subir
-- la web antes: sin esta migración el equipo sale con iniciales y subir una foto
-- da error. Deshacer: scripts/foto-equipo-0012-deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.employees add column if not exists foto_url text;

create or replace function public.cfg_trabajador_foto(p_company text, p_id text, p_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
    perform public.tu_pagina_autorizar(p_company);
    if v_url is not null and (v_url !~ '^https://[^[:space:]]+$' or length(v_url) > 600) then
        raise exception 'La foto debe tener un enlace público https.' using errcode = '22023';
    end if;
    update public.employees set foto_url = v_url where id = p_id and company_id = p_company;
    if not found then raise exception 'el trabajador % no es de %', p_id, p_company; end if;
    return jsonb_build_object('id', p_id, 'foto_url', v_url);
end $$;

revoke execute on function public.cfg_trabajador_foto(text, text, text) from public, anon;
grant  execute on function public.cfg_trabajador_foto(text, text, text) to authenticated;

-- Igual que en la 0011, con la foto en `equipo`.
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
                'vigencia_meses', k.vigencia_meses, 'promo_vigencia', k.promo_vigencia, 'familia', k.familia)
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
            select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.name, 'horario', e.schedule, 'foto', e.foto_url) order by e.name)
              from public.employees e where e.company_id = v.company_id and coalesce(e.is_active, 1) = 1), '[]'::jsonb),
        'bloqueos', coalesce((
            select jsonb_agg(jsonb_build_object('employee_id', b.employee_id, 'inicio', b.start, 'fin', b."end"))
              from public.employee_blocks b where b.company_id = v.company_id and b."end" >= v_hoy), '[]'::jsonb),
        'citas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'slot_start', a.slot_start, 'slot_end', a.slot_end, 'slot_minutes', a.slot_minutes,
                'employee_id', a.employee_id, 'status', a.status, 'creada', a.created_at,
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
