-- ═══════════════════════════════════════════════════════════════════════════════
-- 0023 + 0024 + 0025 de Mi página, en orden, para pegar de una vez en el editor SQL.
-- Copia de modules/tu-pagina/sql/ (14-nov-2026). Cada una va en su propia transacción y se
-- puede repetir. Las «Comprobación» de cada una salen como resultados al final.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- 0023_sede_de_la_cita.sql
-- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0023: en qué sede es la cita
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7, dos locales en Jr. Huallaga): «debe estar claro
-- para qué sede está escogiendo la reserva».
--
--   · appointments.sede: el nombre de la sede (secciones.citas.sedes[].nombre). '' = sin sede
--     (negocios de un solo local y todas las citas anteriores). La Agenda del panel la lee con
--     select('*'): sin esta columna simplemente no sale.
--   · cita_srv_sede: la página la llama justo después de crear la cita. Igual que el
--     comprobante, solo con el código de la reserva Y el celular con que se hizo; y la sede tiene
--     que ser una de las configuradas. Solo rellena una sede vacía: no cambia la de nadie.
--
-- No toca agenda_srv_reservar. Aforo: sigue siendo uno para todo el negocio (no por sede).
-- Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.appointments add column if not exists sede text not null default '';

create or replace function public.cita_srv_sede(p_slug text, p_codigo text, p_telefono text, p_sede text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag   public.tu_pagina;
    v_sedes jsonb;
    v_id    text;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;

    v_sedes := v_pag.secciones #> '{citas,sedes}';
    if v_sedes is null or jsonb_typeof(v_sedes) <> 'array'
       or not exists (select 1 from jsonb_array_elements(v_sedes) s where btrim(s->>'nombre') = btrim(coalesce(p_sede, ''))) then
        return jsonb_build_object('status', 'sede_invalida');
    end if;

    update public.appointments a
       set sede = btrim(p_sede)
      from public.pagina_idem i, public.leads l
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo)) and a.id = i.ref_id
       and a.company_id = v_pag.company_id and l.id = a.lead_id and l.company_id = a.company_id
       and l.phone = public.v2_telefono(p_telefono) and coalesce(a.sede, '') = ''
    returning a.id into v_id;
    if v_id is null then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object('status', 'ok');
end $$;

revoke execute on function public.cita_srv_sede(text, text, text, text) from public, authenticated;
-- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
grant execute on function public.cita_srv_sede(text, text, text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y «sí».
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'sede') as columna,
       to_regprocedure('public.cita_srv_sede(text, text, text, text)') is not null as funcion;

-- Deshacer (la columna se queda: borrarla perdería las sedes ya guardadas):
--   drop function if exists public.cita_srv_sede(text, text, text, text);
--   notify pgrst, 'reload schema';


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- 0024_plazo_de_cita_apartada.sql
-- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0024: plazo para pagar una cita apartada desde la página (no 24 h)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7): «¿cuánto es el tiempo de espera hasta liberarla?
-- Si la hora de la reserva es muy cercana a la actual, debería ser menor».
--
-- Hasta hoy una cita apartada (pending_payment) ocupaba su hora 24 h desde created_at
-- (v2_ocupa_hora, lib/panel/adelantos.ts, tu_pagina_srv_datos). En una barbería eso bloquea la
-- hora de alguien que nunca paga. Ahora, al apartarla desde la página:
--
--     plazo = entre 10 y P minutos, y como mucho un tercio de lo que falta para la cita
--     P = secciones.citas.plazo (10–1440), por defecto 60
--     → cita en 30 min: 10 · en 1 h: 20 · en 2 h: 40 · en 3 h o más: 60
--
-- CÓMO: created_at ya es el ancla del plazo en todas partes (la 0018 la mueve al llegar un
-- pago parcial). Aquí se pone en «ahora + plazo − 24 h»: así la cita deja de ocupar justo al
-- vencer el plazo en la agenda, en la página y en el panel, sin tocar v2_ocupa_hora ni al bot.
-- Si el cliente sube la captura, comprobante_srv_registrar vuelve a poner created_at = ahora
-- (24 h mientras el dueño la revisa), como antes.
--
-- Solo citas de la página, del negocio de esa página, con el código y el celular de la reserva,
-- y solo si siguen apartadas. Las canchas tienen su propio plazo y no pasan por aquí.
-- Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.cita_srv_apartar(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag    public.tu_pagina;
    v_cita   public.appointments;
    v_base   integer := 60;
    v_falta  numeric;
    v_plazo  integer;
    v_vence  timestamptz;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if public.v2_canchas_cfg(v_pag.company_id) is not null then return jsonb_build_object('status', 'canchas'); end if;

    select a.* into v_cita
      from public.pagina_idem i
      join public.appointments a on a.id = i.ref_id and a.company_id = i.company_id
      join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo))
       and l.phone = public.v2_telefono(p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if v_cita.status <> 'pending_payment' or v_cita.slot_start !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
        return jsonb_build_object('status', 'no_apartada');
    end if;

    if coalesce(v_pag.secciones #>> '{citas,plazo}', '') ~ '^\d+$' then
        v_base := least(greatest((v_pag.secciones #>> '{citas,plazo}')::integer, 10), 1440);
    end if;
    v_falta := extract(epoch from ((v_cita.slot_start || ':00')::timestamp at time zone 'America/Lima') - now()) / 60;
    v_plazo := greatest(10, least(v_base, floor(v_falta / 3)::integer));
    v_vence := now() + make_interval(mins => v_plazo);

    update public.appointments
       set created_at = extract(epoch from v_vence - interval '24 hours')::bigint
     where id = v_cita.id and status = 'pending_payment';

    return jsonb_build_object('status', 'ok', 'plazo', v_plazo,
        'vence', to_char(v_vence at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI'),
        'vence_ms', floor(extract(epoch from v_vence) * 1000)::bigint);
end $$;

revoke execute on function public.cita_srv_apartar(text, text, text) from public, authenticated;
-- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
grant execute on function public.cita_srv_apartar(text, text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.cita_srv_apartar(text, text, text)') is not null as existe;

-- Deshacer (las citas vuelven a ocupar 24 h desde que se aparten):
--   drop function if exists public.cita_srv_apartar(text, text, text);
--   notify pgrst, 'reload schema';


-- ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
-- 0025_aforo_por_sede.sql
-- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0025: aforo independiente por sede
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7, dos locales): «el aforo debe ser independiente».
-- Cada sede de secciones.citas.sedes lleva su `capacidad` (cuántas citas a la vez). Lo ocupado en
-- una no quita sitio en la otra. Necesita la 0023 (appointments.sede).
--
--   · tu_pagina_srv_datos: igual que en la 0012, y cada cita trae su `sede`, para que la página
--     calcule lo libre de la sede elegida (dominio/agenda.ts agendaDeSede).
--   · cita_srv_sede: como en la 0023, y además es la última palabra del aforo de la sede: con el
--     candado del negocio cuenta, paso a paso, las citas que ocupan esa sede a esa hora (las de
--     esa sede y las que no tienen sede: ante la duda, ocupan). Si ya está llena, la cita recién
--     creada se CANCELA y devuelve 'lleno' (la página dice «Alguien acaba de tomar ese lugar»).
--     Solo pasa si dos personas reservan la misma sede y hora a la vez: la página ya filtra antes.
--   · cita_sede_panel: el dueño (o el administrador) pone la sede a una cita hecha en el panel.
--     No bloquea —el dueño manda—, pero avisa si con ella esa sede queda por encima de su aforo.
--
-- El aforo global del negocio (companies.schedule.capacity) sigue existiendo y lo miran el bot y
-- el panel: debe ser la SUMA de las sedes (scripts/the247-sedes.sql lo pone).
-- Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Igual que en la 0012, con la sede de cada cita.
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

-- ¿Esa sede está llena para esta cita? Paso a paso (el del negocio), como decidir() en la página.
-- Cuentan las citas de esa sede y las que no tienen sede (ante la duda, ocupan), sin la propia.
create or replace function public.v2_sede_llena(p_cita public.appointments, p_sede text, p_cap integer)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
    v_paso integer;
    v_fin  text;
    v_t    text;
    v_t1   text;
    v_n    integer;
begin
    if p_cap is null or p_cap < 1 or p_cita.slot_start !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then return false; end if;
    select coalesce(nullif(slot_minutes, 0), 30) into v_paso from public.companies where id = p_cita.company_id;
    v_paso := coalesce(v_paso, 30);
    v_fin := coalesce(nullif(p_cita.slot_end, ''), public.tu_pagina_sumar_min(p_cita.slot_start, coalesce(nullif(p_cita.slot_minutes, 0), v_paso)));
    v_t := p_cita.slot_start;
    while v_t < v_fin loop
        v_t1 := least(public.tu_pagina_sumar_min(v_t, v_paso), v_fin);
        select count(*) into v_n
          from public.appointments o
         where o.company_id = p_cita.company_id and o.id <> p_cita.id
           and o.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
           and (coalesce(o.sede, '') = p_sede or coalesce(o.sede, '') = '')
           and public.v2_ocupa_hora(o.status, o.created_at)
           and o.slot_start < v_t1
           and coalesce(nullif(o.slot_end, ''), public.tu_pagina_sumar_min(o.slot_start, coalesce(nullif(o.slot_minutes, 0), v_paso))) > v_t;
        if v_n >= p_cap then return true; end if;
        v_t := v_t1;
    end loop;
    return false;
end $$;

-- La sede por su nombre en la configuración de la página del negocio, o null.
create or replace function public.v2_sede_cfg(p_company text, p_sede text)
returns jsonb language sql stable security definer set search_path = public as $$
    select s from public.tu_pagina p,
           jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array' then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
     where p.company_id = p_company and btrim(s->>'nombre') = btrim(coalesce(p_sede, ''))
     limit 1;
$$;

-- Igual que en la 0023, y con el aforo de la sede como última palabra.
create or replace function public.cita_srv_sede(p_slug text, p_codigo text, p_telefono text, p_sede text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag  public.tu_pagina;
    v_sede jsonb;
    v_cap  integer;
    v_cita public.appointments;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    v_sede := public.v2_sede_cfg(v_pag.company_id, p_sede);
    if v_sede is null then return jsonb_build_object('status', 'sede_invalida'); end if;
    if coalesce(v_sede->>'capacidad', '') ~ '^\d+$' then v_cap := (v_sede->>'capacidad')::integer; end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));
    select a.* into v_cita
      from public.pagina_idem i
      join public.appointments a on a.id = i.ref_id and a.company_id = i.company_id
      join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo))
       and l.phone = public.v2_telefono(p_telefono) and coalesce(a.sede, '') = '';
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;

    if public.v2_sede_llena(v_cita, btrim(p_sede), v_cap) then
        update public.appointments set status = 'cancelled', sede = btrim(p_sede) where id = v_cita.id;
        return jsonb_build_object('status', 'lleno');
    end if;
    update public.appointments set sede = btrim(p_sede) where id = v_cita.id;
    return jsonb_build_object('status', 'ok');
end $$;

-- El panel: poner (o cambiar) la sede de una cita. Avisa si queda por encima del aforo; no bloquea.
create or replace function public.cita_sede_panel(p_company text, p_id text, p_sede text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_sede jsonb;
    v_cap  integer;
    v_cita public.appointments;
begin
    perform public.v2_autorizar_agenda(p_company);
    v_sede := public.v2_sede_cfg(p_company, p_sede);
    if v_sede is null then raise exception 'Esa sede no está en Mi página.'; end if;
    if coalesce(v_sede->>'capacidad', '') ~ '^\d+$' then v_cap := (v_sede->>'capacidad')::integer; end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    update public.appointments set sede = btrim(p_sede) where id = p_id and company_id = p_company returning * into v_cita;
    if v_cita.id is null then raise exception 'No encuentro esa cita.'; end if;
    -- Por encima del aforo: sin contarla a ella, ya estaban todas las sillas ocupadas.
    return jsonb_build_object('status', 'ok', 'sobre_aforo', public.v2_sede_llena(v_cita, btrim(p_sede), v_cap));
end $$;

revoke execute on function public.v2_sede_llena(public.appointments, text, integer) from public, anon, authenticated;
revoke execute on function public.v2_sede_cfg(text, text) from public, anon, authenticated;
revoke execute on function public.cita_srv_sede(text, text, text, text) from public, authenticated;
grant execute on function public.cita_srv_sede(text, text, text, text) to anon;
revoke execute on function public.cita_sede_panel(text, text, text) from public, anon;
grant execute on function public.cita_sede_panel(text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: tres «sí».
select to_regprocedure('public.v2_sede_llena(public.appointments, text, integer)') is not null as aforo_por_sede,
       to_regprocedure('public.cita_sede_panel(text, text, text)') is not null as sede_desde_el_panel,
       (select pg_get_functiondef('public.tu_pagina_srv_datos(text)'::regprocedure) like '%''sede''%') as pagina_con_sede;

-- Deshacer: vuelve a correr la tu_pagina_srv_datos de la 0012 y la cita_srv_sede de la 0023, y
--   drop function if exists public.cita_sede_panel(text, text, text);
--   drop function if exists public.v2_sede_cfg(text, text);
--   drop function if exists public.v2_sede_llena(public.appointments, text, integer);
