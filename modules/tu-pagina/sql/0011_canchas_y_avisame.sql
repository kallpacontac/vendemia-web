-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0011: canchas, horarios pasada la medianoche y «Avísame si se libera»
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Para un negocio de canchas (Alvaro, 29-oct-2026).
--
-- 1. MEDIANOCHE. Un horario de 18:00 a 01:00 (o «hasta las 12», close = '00:00')
--    dejaba el día CERRADO entero: todo exigía cierre > apertura. Ahora, si un día
--    cierra a la misma hora o antes de abrir, cierra al día siguiente, y las horas
--    de la madrugada las cubre el día anterior. v2_dia_que_cubre es la regla; v2_aforo
--    (0004) se rehace con ella, así que la sigue también v2_hueco (panel y página).
--    En TypeScript: lib/panel/medianoche.ts. El bot NO la conoce todavía.
--
-- 2. CANCHAS. Con secciones.canchas encendida, lo que se reserva por hora es una
--    cancha (v2_es_cancha) y se ocupa por separado (no cuenta el aforo general).
--    agenda_srv_reservar (0004) gana el tipo 'cancha': varios turnos seguidos y precio
--    de día/noche (v2_precio_cancha) guardado en appointment_services. Una apartada sin
--    pagar ocupa su cancha solo `plazo` minutos (15 min–24 h) y se cancela si otro la
--    reserva después. tu_pagina_srv_datos (0003) devuelve además qué se reservó en cada
--    cita, cuándo se creó y las citas desde ayer (la madrugada).
--
-- 3. AVÍSAME. Tabla pagina_avisame: quien encuentra una cancha ocupada deja nombre y
--    celular para esa cancha, día y hora. El dueño los ve en Mi página → «Avísame»,
--    con «se liberó» cuando ya no hay reserva, y les escribe por WhatsApp.
--
-- 4. PANEL. agenda_crear_cita y agenda_modificar_cita (0004) saben de canchas: por
--    teléfono, varios turnos y TURNO FIJO semanal (canchas_fijas: cancelar y renovar
--    juntos). Mover una reserva de cancha recalcula su precio a la hora nueva.
--
-- 5. CONSUMOS. agenda_consumo: gaseosas, pelota… como líneas más de la reserva
--    (suman al total, a lo que falta cobrar y a la caja); descuenta y devuelve stock.
--
-- 6. AVISO. Al cancelar o mover una reserva de cancha que alguien esperaba, aviso al
--    celular del dueño (modules/avisos, clase 'cancha_libre').
--
-- Requiere 0002/0003 de Mi página, modules/datos/sql/0004, catalog.tipo (bot 0047 +
-- datos 0007) y avisos 0001 aplicadas. Idempotente (create or replace / if not exists);
-- los permisos de lo que ya existía se conservan. Deshacer: scripts/canchas-0011-deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Medianoche ─────────────────────────────────────────────────────────────

-- El tramo de un día en minutos desde SU medianoche; `cierra` pasa de 1440 si cierra al día siguiente.
create or replace function public.v2_tramo(p_d jsonb, out abre integer, out cierra integer)
language plpgsql immutable as $$
begin
    if p_d is null or jsonb_typeof(p_d) <> 'object' or coalesce((p_d->>'closed')::boolean, false)
       or coalesce(p_d->>'open', '') = '' or coalesce(p_d->>'close', '') = '' then
        return;
    end if;
    abre := public.v2_min(p_d->>'open');
    cierra := public.v2_min(p_d->>'close');
    if cierra <= abre then cierra := cierra + 1440; end if;
end $$;

-- El día del horario que cubre el minuto p_min (0–1439) de p_fecha: el suyo, o la cola del
-- anterior si cerró pasada la medianoche. null = cerrado. Igual que diaQueCubre (medianoche.ts).
create or replace function public.v2_dia_que_cubre(p_h jsonb, p_fecha text, p_min integer)
returns jsonb language plpgsql immutable as $$
declare
    v_hoy  text := public.v2_clave_dia(p_fecha);
    v_ayer text := public.v2_clave_dia(to_char(p_fecha::date - 1, 'YYYY-MM-DD'));
    t      record;
begin
    select * into t from public.v2_tramo(p_h -> v_hoy);
    if t.abre is not null and p_min >= t.abre and p_min < t.cierra then return p_h -> v_hoy; end if;
    select * into t from public.v2_tramo(p_h -> v_ayer);
    if t.abre is not null and t.cierra > 1440 and p_min + 1440 < t.cierra then return p_h -> v_ayer; end if;
    return null;
end $$;

-- ¿Trabaja este profesional a esa hora? Su horario ∩ el del negocio; sin horario propio, el del
-- negocio. Como v2_en_turno (0004), pero por fecha, para mirar también la cola del día anterior.
create or replace function public.v2_en_turno_el(p_emp_horario text, p_negocio jsonb, p_fecha text, p_min integer)
returns boolean language sql immutable as $$
    select public.v2_dia_que_cubre(p_negocio, p_fecha, p_min) is not null
       and (public.v2_json(p_emp_horario) = '{}'::jsonb
            or public.v2_dia_que_cubre(public.v2_json(p_emp_horario), p_fecha, p_min) is not null);
$$;

create or replace function public.v2_aforo(p_company text, p_momento text, p_paso integer, p_empleado text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
    v_h     jsonb;
    v_min   integer := public.v2_min(substr(p_momento, 12, 5));
    v_fin   text := public.tu_pagina_sumar_min(p_momento, p_paso);
    v_dia   jsonb;
    n       integer;
begin
    select public.v2_json(schedule) into v_h from public.companies where id = p_company;
    if coalesce(p_empleado, '') <> '' then
        select count(*) into n from public.employees e
         where e.company_id = p_company and e.id = p_empleado and coalesce(e.is_active, 1) = 1
           and public.v2_en_turno_el(e.schedule, v_h, left(p_momento, 10), v_min)
           and not exists (select 1 from public.employee_blocks b
                            where b.company_id = p_company and b.employee_id = e.id and b.start < v_fin and b."end" > p_momento);
        return least(n, 1);
    end if;
    if exists (select 1 from public.employees e where e.company_id = p_company and coalesce(e.is_active, 1) = 1) then
        select count(*) into n from public.employees e
         where e.company_id = p_company and coalesce(e.is_active, 1) = 1
           and public.v2_en_turno_el(e.schedule, v_h, left(p_momento, 10), v_min)
           and not exists (select 1 from public.employee_blocks b
                            where b.company_id = p_company and b.employee_id = e.id and b.start < v_fin and b."end" > p_momento);
        return n;
    end if;
    -- Sin equipo, manda la silla del día.
    v_dia := public.v2_dia_que_cubre(v_h, left(p_momento, 10), v_min);
    if v_dia is null then return 0; end if;
    return coalesce((v_dia->>'capacity')::integer, 1);
end $$;

-- ── 2. Canchas ────────────────────────────────────────────────────────────────

-- secciones.canchas de la página si las canchas están encendidas; null si no.
create or replace function public.v2_canchas_cfg(p_company text)
returns jsonb language sql stable security definer set search_path = public as $$
    select case when coalesce((secciones->>'reservar')::boolean, false)
                 and coalesce((secciones->'canchas'->>'activo')::boolean, false)
                then secciones->'canchas' end
      from public.tu_pagina where company_id = p_company;
$$;

-- ¿Es una cancha? Con las canchas encendidas, lo que se reserva por hora: ni los grupos
-- (schedule_slots) ni los productos (catalog.tipo o lo marcado en la página).
create or replace function public.v2_es_cancha(p_company text, p_item text)
returns boolean language sql stable security definer set search_path = public as $$
    select public.v2_canchas_cfg(p_company) is not null and exists (
        select 1 from public.catalog k, public.tu_pagina p
         where k.company_id = p_company and k.id = p_item and p.company_id = p_company
           and jsonb_array_length(public.v2_franjas(k.schedule_slots)) = 0
           and coalesce(k.tipo, '') <> 'producto'
           and coalesce(p.secciones->'tipos'->>k.id, '') <> 'producto');
$$;

-- Minutos que una cancha apartada sin pagar (pending_payment) sigue ocupando: secciones.canchas.plazo,
-- de 15 min a 24 h; 24 h si no se eligió (lo mismo que v2_ocupa_hora y el bot).
create or replace function public.v2_cancha_plazo(p_cfg jsonb)
returns integer language sql immutable as $$
    select least(greatest(coalesce(case when coalesce(p_cfg->>'plazo', '') ~ '^\d+$' then (p_cfg->>'plazo')::integer end, 1440), 15), 1440);
$$;

-- El precio de p_turnos turnos seguidos desde p_ini: el de noche (secciones.canchas.noche) desde
-- `desde`, en la madrugada (antes de las 06:00) y, con `finde`, sábado y domingo. Igual que
-- precioReserva (modules/tu-pagina/dominio/canchas.ts).
create or replace function public.v2_precio_cancha(p_cfg jsonb, p_item text, p_precio numeric, p_turno integer, p_ini text, p_turnos integer)
returns numeric language plpgsql immutable as $$
declare
    v_noche numeric;
    v_total numeric := 0;
    v_t     text;
    v_h     text;
    i       integer;
begin
    begin
        v_noche := nullif(p_cfg->'noche'->>p_item, '')::numeric;
    exception when others then
        v_noche := null;
    end;
    for i in 0 .. greatest(p_turnos, 1) - 1 loop
        v_t := public.tu_pagina_sumar_min(p_ini, i * p_turno);
        v_h := substr(v_t, 12, 5);
        if v_noche is not null and v_noche >= 0 and (
               (coalesce((p_cfg->>'finde')::boolean, false) and extract(dow from left(v_t, 10)::date) in (0, 6))
            or v_h < '06:00'
            or (coalesce(p_cfg->>'desde', '') ~ '^\d{2}:\d{2}$' and v_h >= p_cfg->>'desde')) then
            v_total := v_total + v_noche;
        else
            v_total := v_total + coalesce(p_precio, 0);
        end if;
    end loop;
    return v_total;
end $$;

-- ¿Hay ya una reserva viva de ESTA cancha que pise [p_ini, p_fin)? Viva: confirmada, cumplida o
-- apartada sin pagar dentro del plazo de la cancha (v2_cancha_plazo). p_excepto: la que se mueve.
create or replace function public.v2_cancha_ocupada(p_company text, p_item text, p_ini text, p_fin text, p_excepto text default '')
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.appointments a
          join public.appointment_services s on s.appointment_id = a.id and s.company_id = a.company_id
         where a.company_id = p_company and s.catalog_item_id = p_item and a.id <> coalesce(p_excepto, '')
           and (a.status in ('confirmed', 'completed')
                or (a.status = 'pending_payment'
                    and a.created_at > extract(epoch from now() - make_interval(mins => public.v2_cancha_plazo(public.v2_canchas_cfg(p_company))))))
           and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and a.slot_start < p_fin
           and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > p_ini);
$$;

-- ¿Cabe la cancha? null = sí; si no, el motivo para el panel. Abierto en cada paso de la rejilla y
-- en el último minuto (de 23:30 a 00:30 no cabe si cierra a las 00:00), y la cancha libre.
create or replace function public.v2_cancha_motivo(p_company text, p_item text, p_ini text, p_minutos integer, p_excepto text default '')
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_h    jsonb;
    v_paso integer;
    v_fin  text := public.tu_pagina_sumar_min(p_ini, p_minutos);
    v_ult  text := public.tu_pagina_sumar_min(p_ini, p_minutos - 1);
    v_t    text := p_ini;
begin
    if v_fin is null then return 'la hora no es válida'; end if;
    select public.v2_json(schedule), coalesce(nullif(slot_minutes, 0), 60) into v_h, v_paso
      from public.companies where id = p_company;
    v_paso := coalesce(nullif((v_h -> public.v2_clave_dia(left(p_ini, 10)) ->> 'slot_minutes'), '')::integer, v_paso);
    loop
        if public.v2_dia_que_cubre(v_h, left(v_t, 10), public.v2_min(substr(v_t, 12, 5))) is null then
            return 'a esa hora el local está cerrado';
        end if;
        exit when v_t >= v_ult;
        v_t := least(public.tu_pagina_sumar_min(v_t, v_paso), v_ult);
    end loop;
    if public.v2_cancha_ocupada(p_company, p_item, p_ini, v_fin, p_excepto) then
        return 'esa cancha ya está reservada a esa hora';
    end if;
    return null;
end $$;

-- Las apartadas sin pagar de esa cancha y ese rato que ya pasaron su plazo se cancelan al
-- reservar encima: si no, el panel enseñaría dos reservas en la misma cancha.
create or replace function public.v2_cancha_soltar_vencidas(p_company text, p_item text, p_ini text, p_fin text)
returns void language plpgsql security definer set search_path = public as $$
begin
    -- avisos_tg_cancha_libre no avisa de esto: se suelta porque otro la reserva ahora mismo.
    perform set_config('vendemia.soltando', '1', true);
    update public.appointments a set status = 'cancelled'
      from public.appointment_services s
     where s.appointment_id = a.id and s.company_id = a.company_id and s.catalog_item_id = p_item
       and a.company_id = p_company and a.status = 'pending_payment'
       and a.created_at <= extract(epoch from now() - make_interval(mins => public.v2_cancha_plazo(public.v2_canchas_cfg(p_company))))
       and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and a.slot_start < p_fin
       and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > p_ini;
    perform set_config('vendemia.soltando', '', true);
end $$;

-- ── 3. Avísame si se libera ───────────────────────────────────────────────────

create table if not exists public.pagina_avisame (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null,
    catalog_id  text not null,
    slot_start  text not null check (slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'),
    nombre      text not null check (char_length(nombre) between 2 and 80),
    telefono    text not null check (telefono ~ '^\d{8,15}$'),
    creado_at   timestamptz not null default now(),
    avisado_at  timestamptz,
    unique (company_id, catalog_id, slot_start, telefono)
);
create index if not exists pagina_avisame_hora on public.pagina_avisame (company_id, slot_start);
alter table public.pagina_avisame enable row level security;
revoke all on public.pagina_avisame from anon, authenticated;

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
            select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.name, 'horario', e.schedule) order by e.name)
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

create or replace function public.agenda_srv_reservar(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag    public.tu_pagina;
    v_item   public.catalog;
    v_lead   public.leads;
    v_cita   public.appointments;
    v_lead_id text;
    v_tipo   text := p_datos->>'tipo';
    v_ini    text := p_datos->>'slot_start';
    v_emp    text := coalesce(p_datos->>'employee_id', '');
    v_hoy    text := left(public.v2_ahora(), 10);
    v_span   integer;
    v_motivo text;
    v_franja jsonb;
    v_cap    integer;
    v_n      integer;
    v_per    record;
    v_estado text;
    v_cod    text;
    v_ya     public.pagina_idem;
    -- Canchas (0011)
    v_turno  integer;
    v_fin    text;
    v_precio numeric;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'reservar')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.agenda_en_nube(v_pag.company_id) then return jsonb_build_object('status', 'no_es_nube'); end if;

    select * into v_ya from public.pagina_idem where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_ya.codigo, 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    select * into v_item from public.catalog
     where company_id = v_pag.company_id and id = p_datos->>'catalog_id' and coalesce(is_active, 1) = 1;
    if not found then return jsonb_build_object('status', 'no_existe'); end if;

    begin
        select l.lead_id into v_lead_id from public.v2_lead(v_pag.company_id, p_datos->>'telefono', p_datos->>'nombre', 'web') l;
        select * into v_lead from public.leads where id = v_lead_id;
    exception when sqlstate '22023' then
        return jsonb_build_object('status', 'datos_invalidos');
    end;

    if (select count(*) from public.appointments where company_id = v_pag.company_id and lead_id = v_lead.id
          and status in ('confirmed', 'pending_payment') and created_at > extract(epoch from now() - interval '1 day')) >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    if v_tipo = 'cita' then
        if v_ini !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        if v_ini <= public.v2_ahora() then return jsonb_build_object('status', 'pasada'); end if;
        v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = v_pag.company_id), 60);
        v_motivo := public.v2_hueco(v_pag.company_id, v_ini, v_span, v_emp);
        if v_motivo is not null then return jsonb_build_object('status', 'lleno', 'motivo', v_motivo); end if;
        -- «Requerir pago para confirmar» y un servicio con precio: la cita queda APARTADA, ocupando su
        -- hora 24 h (v2_ocupa_hora) hasta que llegue el comprobante. Igual que book_appointment del bot.
        v_estado := case when coalesce(v_item.price, 0) > 0
                          and (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, beneficiario)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, public.tu_pagina_sumar_min(v_ini, v_span), v_span,
                v_emp, v_estado, btrim(coalesce(p_datos->>'beneficiario', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);

    elsif v_tipo = 'grupo' then
        if v_ini not like 'sched:' || v_item.id || ':%' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        select f into v_franja from jsonb_array_elements(public.v2_franjas(v_item.schedule_slots)) f
         where f->>'id' = split_part(v_ini, ':', 3) limit 1;
        if v_franja is null then return jsonb_build_object('status', 'no_existe'); end if;
        select * into v_per from public.v2_periodo(v_hoy, v_franja->>'start_date', coalesce(v_item.vigencia_meses, 1));
        v_cap := coalesce((v_franja->>'capacity')::integer, -1);
        if v_cap <> -1 then
            -- Ocupan su plaza los confirmados de ese periodo y, desde la página, también los que la
            -- apartaron sin pagar aún (ante la duda, lleno).
            select count(*) into v_n from public.appointments o
             where o.company_id = v_pag.company_id and o.slot_start = v_ini
               and (o.status = 'confirmed' or (o.status = 'pending_payment' and (coalesce(o.periodo_hasta, '') = '' or o.periodo_hasta >= v_hoy)))
               and (coalesce(o.periodo_desde, '') = '' or (o.periodo_desde <= v_per.hasta and o.periodo_hasta >= v_per.desde));
            if v_n >= v_cap then return jsonb_build_object('status', 'lleno'); end if;
        end if;
        v_estado := case when (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, periodo_desde, periodo_hasta)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, '', 60, '', v_estado,
                btrim(coalesce(p_datos->>'beneficiario', '')), v_per.desde, v_per.hasta)
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, coalesce(v_item.price, 0), 0, 0);
    elsif v_tipo = 'cancha' then
        -- Cada cancha se ocupa por separado (no cuenta el aforo general): abierta todo el rato,
        -- también pasada la medianoche, y ESA cancha libre (v2_cancha_motivo). El precio lo pone
        -- Postgres con secciones.canchas (v2_precio_cancha), igual que la tabla de la página.
        if v_ini !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        if v_ini <= public.v2_ahora() then return jsonb_build_object('status', 'pasada'); end if;
        if not public.v2_es_cancha(v_pag.company_id, v_item.id) then return jsonb_build_object('status', 'datos_invalidos'); end if;
        v_turno := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = v_pag.company_id), 60);
        v_span := (p_datos->>'minutos')::integer;
        if v_span is null or v_span < v_turno or v_span > v_turno * 4 or v_span % v_turno <> 0 then
            return jsonb_build_object('status', 'datos_invalidos');
        end if;
        v_fin := public.tu_pagina_sumar_min(v_ini, v_span);
        perform public.v2_cancha_soltar_vencidas(v_pag.company_id, v_item.id, v_ini, v_fin);
        v_motivo := public.v2_cancha_motivo(v_pag.company_id, v_item.id, v_ini, v_span);
        if v_motivo is not null then return jsonb_build_object('status', 'lleno', 'motivo', v_motivo); end if;
        v_precio := public.v2_precio_cancha(public.v2_canchas_cfg(v_pag.company_id), v_item.id, v_item.price, v_turno, v_ini, v_span / v_turno);
        v_estado := case when v_precio > 0
                          and (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, beneficiario)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, v_fin, v_span, '', v_estado, '')
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, v_precio, v_span, 0);
        -- Quien esperaba esta cancha a esta hora ya no espera: la tiene.
        update public.pagina_avisame set avisado_at = coalesce(avisado_at, now())
         where company_id = v_pag.company_id and catalog_id = v_item.id and slot_start = v_ini
           and telefono = public.v2_telefono(p_datos->>'telefono');

    else
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    loop
        v_cod := public.envio_codigo('R');
        exit when not exists (select 1 from public.pagina_idem where company_id = v_pag.company_id and codigo = v_cod);
    end loop;
    insert into public.pagina_idem (company_id, idem, codigo, ref_id) values (v_pag.company_id, p_idem, v_cod, v_cita.id);
    return jsonb_build_object('status', 'ok', 'codigo', v_cod, 'servicio', v_item.name, 'precio', coalesce(v_precio, v_item.price),
                              'estado', v_cita.status, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation or invalid_datetime_format then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

create or replace function public.agenda_crear_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_slot   text := coalesce(p_datos->>'slot_start', '');
    v_item   public.catalog;
    v_emp    public.employees;
    v_lead   public.leads;
    v_lead_id text;
    v_nuevo  boolean := false;
    v_span   integer;
    v_fin    text;
    v_motivo text;
    v_cita   public.appointments;
    v_dup    boolean := false;
    v_msg    text;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    if v_slot <= public.v2_ahora() then raise exception '% ya pasó: elige un horario futuro', v_slot; end if;
    select * into v_item from public.catalog where company_id = p_company and id = p_datos->>'catalog_item_id';
    if not found then raise exception 'Elige un servicio: una cita sin servicio entra en los ingresos como S/ 0'; end if;
    if jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0 then
        raise exception '% es un grupo con horarios fijos: se inscribe, no se agenda por hora', v_item.name;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    if coalesce(p_datos->>'lead_id', '') <> '' then
        select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
        if not found then raise exception 'Ese cliente no es de este negocio.'; end if;
        if v_lead.name = '' and btrim(coalesce(p_datos->>'nombre', '')) <> '' then
            update public.leads set name = left(btrim(p_datos->>'nombre'), 120) where id = v_lead.id returning * into v_lead;
        end if;
    else
        select l.lead_id, l.nuevo into v_lead_id, v_nuevo from public.v2_lead(p_company, p_datos->>'telefono', p_datos->>'nombre', 'panel') l;
        select * into v_lead from public.leads where id = v_lead_id;
    end if;

    if coalesce(p_datos->>'employee_id', '') <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    end if;

    -- Una cancha (0011) se ocupa por separado, admite varios turnos y turno fijo: v2_crear_cancha.
    if public.v2_es_cancha(p_company, v_item.id) then
        return public.v2_crear_cancha(p_company, v_item, v_lead, v_nuevo, v_slot, p_datos);
    end if;

    v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_fin  := public.tu_pagina_sumar_min(v_slot, v_span);

    select * into v_cita from public.appointments a
     where a.company_id = p_company and a.lead_id = v_lead.id and a.status <> 'completed' and public.v2_ocupa_hora(a.status, a.created_at)
       and a.slot_start < v_fin and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > v_slot
     limit 1;
    if found then
        v_dup := true;
    else
        v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''));
        if v_motivo is not null then raise exception '%', v_motivo; end if;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, beneficiario_edad)
        values (gen_random_uuid()::text, p_company, v_lead.id, v_item.name, v_slot, v_fin, v_span, coalesce(v_emp.id, ''), 'confirmed',
                btrim(coalesce(p_datos->>'beneficiario', '')), btrim(coalesce(p_datos->>'beneficiario_edad', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, p_company, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);
    end if;

    v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Te dejé agendada tu cita de ' || v_item.name || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?';
    return jsonb_build_object(
        'id', v_cita.id, 'lead_id', v_lead.id, 'cliente_nuevo', v_nuevo, 'duplicada', v_dup,
        'slot_start', v_cita.slot_start, 'slot_minutes', v_cita.slot_minutes, 'employee_id', v_cita.employee_id,
        'service', v_cita.service, 'precio', coalesce(v_item.price, 0), 'estado', v_cita.status,
        'mensaje', v_msg, 'wa_link', public.v2_wa(v_lead.phone, v_msg));
end $$;

create or replace function public.agenda_modificar_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_acc    text := coalesce(p_datos->>'accion', '');
    v_cita   public.appointments;
    v_lead   public.leads;
    v_emp    public.employees;
    v_slot   text;
    v_span   integer;
    v_motivo text;
    v_msg    text;
    v_rec    boolean;
    v_item   text;
    v_k      public.catalog;
    v_turno  integer;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_acc not in ('cancelar', 'mover', 'reasignar') then raise exception 'accion debe ser cancelar, mover o reasignar'; end if;
    select * into v_cita from public.appointments where company_id = p_company and id = p_datos->>'id';
    if not found then raise exception 'Esa cita no existe en este negocio.'; end if;
    if v_cita.status = 'cancelled' then raise exception 'esa cita ya estaba cancelada'; end if;
    select * into v_lead from public.leads where id = v_cita.lead_id;
    v_rec := v_cita.slot_start like 'sched:%';
    if v_rec and v_acc <> 'cancelar' then
        raise exception 'una inscripción a un grupo no se mueve ni se reasigna: cancélala y vuelve a inscribir';
    end if;

    if v_acc = 'cancelar' then
        update public.appointments set status = 'cancelled' where id = v_cita.id;
        update public.leads set pending_slot = '', booking_draft = '' where id = v_cita.lead_id;
        v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Tuvimos que cancelar tu reserva de ' || v_cita.service
                 || case when v_rec then '' else ' del ' || substr(public.v2_fecha_legible(v_cita.slot_start), 4) end || '. ¿Te busco otro horario?';
        return jsonb_build_object('id', v_cita.id, 'accion', 'cancelar', 'antes', v_cita.status, 'ahora', 'cancelled',
            'libera', case when v_rec then 'una plaza del grupo' else 'el horario' end,
            'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
    end if;

    if coalesce(nullif(v_cita.slot_end, ''), public.tu_pagina_sumar_min(v_cita.slot_start, v_cita.slot_minutes)) <= public.v2_ahora() then
        raise exception 'esa cita ya pasó: es historial. Si el cliente vuelve, se le agenda una nueva';
    end if;
    v_slot := coalesce(nullif(p_datos->>'slot_start', ''), v_cita.slot_start);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    if v_slot <= public.v2_ahora() then raise exception '% ya pasó: elige un horario futuro', v_slot; end if;

    if v_acc = 'reasignar' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    elsif v_cita.employee_id <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = v_cita.employee_id;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    v_span := coalesce(nullif(v_cita.slot_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    -- Una cancha (0011): libre ESA cancha (sin contar esta misma reserva), y el precio el de la hora nueva.
    select s.catalog_item_id into v_item from public.appointment_services s where s.appointment_id = v_cita.id order by s.sort_order limit 1;
    if v_item is not null and public.v2_es_cancha(p_company, v_item) then
        perform public.v2_cancha_soltar_vencidas(p_company, v_item, v_slot, public.tu_pagina_sumar_min(v_slot, v_span));
        v_motivo := public.v2_cancha_motivo(p_company, v_item, v_slot, v_span, v_cita.id);
        if v_motivo is not null then raise exception '%', v_motivo; end if;
        select * into v_k from public.catalog where company_id = p_company and id = v_item;
        v_turno := coalesce(nullif(v_k.duration_minutes, 0), v_span);
        update public.appointment_services
           set price = public.v2_precio_cancha(public.v2_canchas_cfg(p_company), v_item, v_k.price, v_turno, v_slot, greatest(v_span / v_turno, 1))
         where appointment_id = v_cita.id and catalog_item_id = v_item
           and sort_order = (select min(sort_order) from public.appointment_services where appointment_id = v_cita.id);
    else
        v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''), v_cita.id);
        if v_motivo is not null then raise exception '%', v_motivo; end if;
    end if;

    update public.appointments
       set slot_start = v_slot, slot_end = public.tu_pagina_sumar_min(v_slot, v_span), slot_minutes = v_span, employee_id = coalesce(v_emp.id, '')
     where id = v_cita.id;

    v_msg := case when v_acc = 'mover'
        then 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Movimos tu cita de ' || v_cita.service || ' a '
             || substr(public.v2_fecha_legible(v_slot), 4) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?'
        else 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Tu cita de ' || v_cita.service || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5) || ' la atenderá ' || v_emp.name || '. ¿Te parece bien?'
        end;
    return jsonb_build_object('id', v_cita.id, 'accion', v_acc,
        'antes', jsonb_build_object('slot_start', v_cita.slot_start, 'employee_id', v_cita.employee_id),
        'ahora', jsonb_build_object('slot_start', v_slot, 'employee_id', coalesce(v_emp.id, '')),
        'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
end $$;

-- ── 4. Canchas desde el panel: por teléfono, varios turnos y turno fijo ───────

-- Un turno fijo: el mismo cliente, la misma cancha, el mismo día y hora cada semana. Cada semana
-- es una reserva normal (appointments); esta tabla solo las une para cancelarlas o renovarlas juntas.
create table if not exists public.canchas_fijas (
    id           uuid primary key default gen_random_uuid(),
    company_id   text not null,
    lead_id      text not null,
    catalog_id   text not null,
    dia          integer not null check (dia between 0 and 6),
    hora         text not null check (hora ~ '^\d{2}:\d{2}$'),
    minutos      integer not null check (minutos > 0),
    desde        text not null,
    hasta        text not null,
    creado_at    timestamptz not null default now(),
    cancelado_at timestamptz
);
create index if not exists canchas_fijas_negocio on public.canchas_fijas (company_id, cancelado_at);
create table if not exists public.canchas_fijas_citas (
    fija_id        uuid not null references public.canchas_fijas (id) on delete cascade,
    appointment_id text not null,
    primary key (fija_id, appointment_id)
);
alter table public.canchas_fijas enable row level security;
alter table public.canchas_fijas_citas enable row level security;
revoke all on public.canchas_fijas, public.canchas_fijas_citas from anon, authenticated;

-- «lunes» → «lunes»; «sábado» → «sábados»: para «todos los …».
create or replace function public.v2_dias_plural(p_fecha text) returns text language sql immutable as $$
    select (array['domingos','lunes','martes','miércoles','jueves','viernes','sábados'])[extract(dow from p_fecha::date)::integer + 1];
$$;

-- Reserva p_semanas semanas seguidas desde p_primera (mismo día y hora), p_turnos turnos cada una.
-- Lo que no cabe se salta y se dice por qué. Si p_fija, cada reserva queda unida al turno fijo.
-- Se llama con el candado del negocio ya tomado.
create or replace function public.v2_cancha_semanas(p_company text, p_item public.catalog, p_lead_id text, p_fija uuid,
                                                    p_primera text, p_semanas integer, p_turnos integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cfg      jsonb := public.v2_canchas_cfg(p_company);
    v_turno    integer := coalesce(nullif(p_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_span     integer := v_turno * p_turnos;
    v_slot     text;
    v_motivo   text;
    v_precio   numeric;
    v_cita     public.appointments;
    v_primera  text;
    v_precio1  numeric;
    v_creadas  jsonb := '[]'::jsonb;
    v_saltadas jsonb := '[]'::jsonb;
    i          integer;
begin
    for i in 0 .. p_semanas - 1 loop
        v_slot := to_char(left(p_primera, 10)::date + 7 * i, 'YYYY-MM-DD') || ' ' || substr(p_primera, 12, 5);
        perform public.v2_cancha_soltar_vencidas(p_company, p_item.id, v_slot, public.tu_pagina_sumar_min(v_slot, v_span));
        v_motivo := public.v2_cancha_motivo(p_company, p_item.id, v_slot, v_span);
        if v_motivo is not null then
            v_saltadas := v_saltadas || jsonb_build_array(jsonb_build_object('slot_start', v_slot, 'motivo', v_motivo));
            continue;
        end if;
        v_precio := public.v2_precio_cancha(v_cfg, p_item.id, p_item.price, v_turno, v_slot, p_turnos);
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, beneficiario)
        values (gen_random_uuid()::text, p_company, p_lead_id, p_item.name, v_slot, public.tu_pagina_sumar_min(v_slot, v_span), v_span,
                '', 'confirmed', '')
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, p_company, p_item.id, p_item.name, v_precio, v_span, 0);
        if p_fija is not null then insert into public.canchas_fijas_citas values (p_fija, v_cita.id); end if;
        if v_primera is null then
            v_primera := v_cita.id;
            v_precio1 := v_precio;
        end if;
        v_creadas := v_creadas || jsonb_build_array(v_slot);
    end loop;
    return jsonb_build_object('primera', v_primera, 'precio', v_precio1, 'minutos', v_span,
                              'creadas', v_creadas, 'saltadas', v_saltadas);
end $$;

-- La reserva de una cancha desde el panel (la llama agenda_crear_cita). p_datos.turnos: 1–4 seguidos;
-- p_datos.semanas: 1 = una vez; 2–26 = turno fijo cada semana.
create or replace function public.v2_crear_cancha(p_company text, p_item public.catalog, p_lead public.leads, p_nuevo boolean,
                                                  p_slot text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_turnos  integer := coalesce(nullif(p_datos->>'turnos', '')::integer, 1);
    v_semanas integer := coalesce(nullif(p_datos->>'semanas', '')::integer, 1);
    v_fija    uuid;
    v_r       jsonb;
    v_cita    public.appointments;
    v_n       integer;
    v_msg     text;
begin
    if v_turnos not between 1 and 4 then raise exception 'Se reservan de 1 a 4 turnos seguidos.'; end if;
    if v_semanas not between 1 and 26 then raise exception 'Un turno fijo va de 2 a 26 semanas.'; end if;
    if v_semanas > 1 then
        insert into public.canchas_fijas (company_id, lead_id, catalog_id, dia, hora, minutos, desde, hasta)
        values (p_company, p_lead.id, p_item.id, extract(dow from left(p_slot, 10)::date)::integer, substr(p_slot, 12, 5), 1,
                left(p_slot, 10), to_char(left(p_slot, 10)::date + 7 * (v_semanas - 1), 'YYYY-MM-DD'))
        returning id into v_fija;
    end if;
    v_r := public.v2_cancha_semanas(p_company, p_item, p_lead.id, v_fija, p_slot, v_semanas, v_turnos);
    if v_r->>'primera' is null then
        raise exception '%', coalesce(v_r->'saltadas'->0->>'motivo', 'no cabe');
    end if;
    if v_fija is not null then update public.canchas_fijas set minutos = (v_r->>'minutos')::integer where id = v_fija; end if;
    select * into v_cita from public.appointments where id = v_r->>'primera';
    v_n := jsonb_array_length(v_r->'creadas');

    v_msg := 'Hola' || public.v2_primer_nombre(p_lead.name) || '! Te dejé reservada la ' || p_item.name || ' '
             || case when v_semanas > 1
                     then 'todos los ' || public.v2_dias_plural(p_slot) || ' a las ' || substr(p_slot, 12, 5)
                          || ', desde ' || substr(public.v2_fecha_legible(v_cita.slot_start), 4) || ' (' || v_n || ' semanas)'
                     else public.v2_fecha_legible(p_slot) || ' a las ' || substr(p_slot, 12, 5) end
             || ', de ' || substr(v_cita.slot_start, 12, 5) || ' a ' || substr(v_cita.slot_end, 12, 5) || '. ¿Te queda bien?';
    return jsonb_build_object(
        'id', v_cita.id, 'lead_id', p_lead.id, 'cliente_nuevo', p_nuevo, 'duplicada', false,
        'slot_start', v_cita.slot_start, 'slot_minutes', v_cita.slot_minutes, 'employee_id', '',
        'service', v_cita.service, 'precio', (v_r->>'precio')::numeric, 'estado', v_cita.status,
        'mensaje', v_msg, 'wa_link', public.v2_wa(p_lead.phone, v_msg),
        'fija_id', v_fija, 'creadas', v_r->'creadas', 'saltadas', v_r->'saltadas');
end $$;

-- Los turnos fijos del negocio, con su próxima fecha y cuántas semanas le quedan.
create or replace function public.canchas_fijas_panel(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    return coalesce((
        select jsonb_agg(to_jsonb(x) order by x.activa desc, x.dia, x.hora) from (
            select f.id, f.dia, f.hora, f.minutos, f.desde, f.hasta, f.cancelado_at is null as activa,
                   coalesce(nullif(l.name, ''), l.phone) as cliente, l.phone as telefono, coalesce(k.name, 'Cancha') as cancha,
                   (select count(*) from public.canchas_fijas_citas c join public.appointments a on a.id = c.appointment_id
                     where c.fija_id = f.id and a.status in ('confirmed', 'pending_payment') and a.slot_start > public.v2_ahora()) as quedan,
                   (select min(a.slot_start) from public.canchas_fijas_citas c join public.appointments a on a.id = c.appointment_id
                     where c.fija_id = f.id and a.status in ('confirmed', 'pending_payment') and a.slot_start > public.v2_ahora()) as siguiente
              from public.canchas_fijas f
              left join public.leads l on l.id = f.lead_id
              left join public.catalog k on k.company_id = f.company_id and k.id = f.catalog_id
             where f.company_id = p_company
               and (f.cancelado_at is null or f.cancelado_at > now() - interval '30 days')
             limit 300) x), '[]'::jsonb);
end $$;

-- Cancelar un turno fijo: las semanas que aún no llegan se cancelan; las pasadas se quedan.
create or replace function public.canchas_fija_cancelar(p_company text, p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
    n integer;
begin
    perform public.v2_autorizar_agenda(p_company);
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    update public.appointments a set status = 'cancelled'
      from public.canchas_fijas_citas c, public.canchas_fijas f
     where c.appointment_id = a.id and f.id = c.fija_id and f.id = p_id and f.company_id = p_company
       and a.company_id = p_company and a.status in ('confirmed', 'pending_payment') and a.slot_start > public.v2_ahora();
    get diagnostics n = row_count;
    update public.canchas_fijas set cancelado_at = coalesce(cancelado_at, now()) where id = p_id and company_id = p_company;
    return n;
end $$;

-- Renovar: p_semanas semanas más, desde la semana siguiente a la última.
create or replace function public.canchas_fija_renovar(p_company text, p_id uuid, p_semanas integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    f        public.canchas_fijas;
    v_item   public.catalog;
    v_turno  integer;
    v_desde  text;
    v_r      jsonb;
begin
    perform public.v2_autorizar_agenda(p_company);
    if p_semanas not between 1 and 26 then raise exception 'Se renueva de 1 a 26 semanas.'; end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    select * into f from public.canchas_fijas where id = p_id and company_id = p_company;
    if not found then raise exception 'Ese turno fijo no existe en este negocio.'; end if;
    if f.cancelado_at is not null then raise exception 'Ese turno fijo está cancelado: crea uno nuevo.'; end if;
    select * into v_item from public.catalog where company_id = p_company and id = f.catalog_id;
    if not found then raise exception 'Esa cancha ya no está en el catálogo.'; end if;
    v_turno := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    -- La semana siguiente a la última, y nunca en el pasado.
    v_desde := greatest(to_char(f.hasta::date + 7, 'YYYY-MM-DD'),
                        to_char(left(public.v2_ahora(), 10)::date + ((f.dia - extract(dow from left(public.v2_ahora(), 10)::date)::integer + 7) % 7), 'YYYY-MM-DD'));
    if v_desde || ' ' || f.hora <= public.v2_ahora() then v_desde := to_char(v_desde::date + 7, 'YYYY-MM-DD'); end if;
    v_r := public.v2_cancha_semanas(p_company, v_item, f.lead_id, f.id, v_desde || ' ' || f.hora, p_semanas, greatest(f.minutos / v_turno, 1));
    update public.canchas_fijas set hasta = to_char(v_desde::date + 7 * (p_semanas - 1), 'YYYY-MM-DD') where id = f.id;
    return v_r;
end $$;

-- ── 5. Consumos cargados a la reserva (gaseosas, pelota, chalecos) ────────────

-- Cada consumo es una línea más de la reserva (appointment_services): suma a su total, a lo que
-- falta cobrar y a la caja. Aquí se apunta cuántas unidades, para devolverlas al stock si se quita.
create table if not exists public.cita_consumos (
    linea_id       text primary key,
    company_id     text not null,
    appointment_id text not null,
    catalog_id     text not null,
    cantidad       integer not null check (cantidad between 1 and 99),
    creado_at      timestamptz not null default now()
);
create index if not exists cita_consumos_cita on public.cita_consumos (company_id, appointment_id);
alter table public.cita_consumos enable row level security;
revoke all on public.cita_consumos from anon, authenticated;

-- accion 'ver' | 'agregar' (catalog_item_id, cantidad) | 'quitar' (linea). Devuelve las líneas y el total.
create or replace function public.agenda_consumo(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_acc   text := coalesce(p_datos->>'accion', 'ver');
    v_cita  public.appointments;
    v_item  public.catalog;
    v_cant  integer;
    v_linea text;
    v_con   public.cita_consumos;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    select * into v_cita from public.appointments where company_id = p_company and id = p_datos->>'id';
    if not found then raise exception 'Esa reserva no existe en este negocio.'; end if;

    if v_acc = 'agregar' then
        if v_cita.status = 'cancelled' then raise exception 'Esa reserva está cancelada.'; end if;
        v_cant := coalesce(nullif(p_datos->>'cantidad', '')::integer, 1);
        if v_cant not between 1 and 99 then raise exception 'La cantidad va de 1 a 99.'; end if;
        select * into v_item from public.catalog
         where company_id = p_company and id = p_datos->>'catalog_item_id' and coalesce(is_active, 1) = 1 for update;
        if not found then raise exception 'Ese producto no está en tu catálogo.'; end if;
        if jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0 or public.v2_es_cancha(p_company, v_item.id) then
            raise exception '% no es un consumo: se reserva aparte.', v_item.name;
        end if;
        if exists (select 1 from public.catalog_variantes where company_id = p_company and catalog_id = v_item.id) then
            raise exception '% tiene opciones (sabor, talla): todavía no se carga a una reserva.', v_item.name;
        end if;
        if v_item.stock is not null then
            if v_item.stock < v_cant then raise exception 'De % solo quedan %.', v_item.name, greatest(v_item.stock, 0); end if;
            update public.catalog set stock = stock - v_cant where company_id = p_company and id = v_item.id;
        end if;
        v_linea := gen_random_uuid()::text;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (v_linea, v_cita.id, p_company, v_item.id,
                v_item.name || case when v_cant > 1 then ' × ' || v_cant else '' end, coalesce(v_item.price, 0) * v_cant, 0,
                coalesce((select max(sort_order) from public.appointment_services where appointment_id = v_cita.id), 0) + 1);
        insert into public.cita_consumos (linea_id, company_id, appointment_id, catalog_id, cantidad)
        values (v_linea, p_company, v_cita.id, v_item.id, v_cant);
    elsif v_acc = 'quitar' then
        select * into v_con from public.cita_consumos
         where company_id = p_company and appointment_id = v_cita.id and linea_id = p_datos->>'linea';
        if not found then raise exception 'Eso no es un consumo de esta reserva.'; end if;
        update public.catalog set stock = stock + v_con.cantidad
         where company_id = p_company and id = v_con.catalog_id and stock is not null;
        delete from public.appointment_services where id = v_con.linea_id and appointment_id = v_cita.id;
        delete from public.cita_consumos where linea_id = v_con.linea_id;
    elsif v_acc <> 'ver' then
        raise exception 'accion debe ser ver, agregar o quitar';
    end if;

    return jsonb_build_object(
        'lineas', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'nombre', s.name, 'precio', s.price,
                                                'consumo', exists (select 1 from public.cita_consumos c where c.linea_id = s.id))
                             order by s.sort_order)
              from public.appointment_services s where s.appointment_id = v_cita.id), '[]'::jsonb),
        'total', (select coalesce(sum(price), 0) from public.appointment_services where appointment_id = v_cita.id));
end $$;

-- ── 6. Aviso al dueño cuando se libera una cancha que alguien esperaba ────────

-- Al cancelar o mover una reserva de cancha, si hay quien espera esa cancha a esa hora (pagina_avisame),
-- un aviso al celular del dueño (modules/avisos): tipo 'reserva', clase 'cancha_libre'. Lo que suelta
-- v2_cancha_soltar_vencidas no avisa: se suelta porque otro la está reservando en ese momento.
create or replace function public.avisos_tg_cancha_libre() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_item text;
    v_fin  text;
    v_n    integer;
begin
    if coalesce(current_setting('vendemia.soltando', true), '') = '1' then return null; end if;
    if old.status = 'cancelled' or old.slot_start !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then return null; end if;
    if not (new.status = 'cancelled' or new.slot_start is distinct from old.slot_start) then return null; end if;
    select s.catalog_item_id into v_item from public.appointment_services s where s.appointment_id = old.id order by s.sort_order limit 1;
    if v_item is null or not public.v2_es_cancha(old.company_id, v_item) then return null; end if;
    v_fin := coalesce(nullif(old.slot_end, ''), public.tu_pagina_sumar_min(old.slot_start, old.slot_minutes));
    select count(*) into v_n from public.pagina_avisame w
     where w.company_id = old.company_id and w.catalog_id = v_item and w.avisado_at is null
       and w.slot_start >= old.slot_start and w.slot_start < v_fin and w.slot_start > public.v2_ahora();
    if v_n > 0 then
        perform public.avisos_apuntar(old.company_id, 'reserva', 'libre:' || old.id || ':' || old.slot_start,
            jsonb_build_object('clase', 'cancha_libre', 'servicio', old.service, 'slot', old.slot_start, 'esperan', v_n));
    end if;
    return null;
exception when others then
    -- Un aviso nunca tumba la cancelación.
    raise warning 'avisos_tg_cancha_libre: %', sqlerrm;
    return null;
end $$;

drop trigger if exists avisos_cancha_libre on public.appointments;
create trigger avisos_cancha_libre after update of status, slot_start on public.appointments
    for each row execute function public.avisos_tg_cancha_libre();

-- Apuntarse desde la página. Solo el servidor (clave de servidor), como las demás _srv_.
create or replace function public.avisame_srv_crear(p_slug text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag  public.tu_pagina;
    v_ini  text := p_datos->>'slot_start';
    v_tel  text := public.v2_telefono(p_datos->>'telefono');
    v_nom  text := btrim(coalesce(p_datos->>'nombre', ''));
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'reservar')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not exists (select 1 from public.catalog where company_id = v_pag.company_id and id = p_datos->>'catalog_id'
                     and coalesce(is_active, 1) = 1) then
        return jsonb_build_object('status', 'no_existe');
    end if;
    if coalesce(v_ini, '') !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' or char_length(v_nom) not between 2 and 80
       or v_tel !~ '^\d{8,15}$' then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if v_ini <= public.v2_ahora() then return jsonb_build_object('status', 'pasada'); end if;
    if (select count(*) from public.pagina_avisame where company_id = v_pag.company_id and telefono = v_tel
          and creado_at > now() - interval '1 day') >= 10 then
        return jsonb_build_object('status', 'demasiados');
    end if;
    insert into public.pagina_avisame (company_id, catalog_id, slot_start, nombre, telefono)
    values (v_pag.company_id, p_datos->>'catalog_id', v_ini, v_nom, v_tel)
    on conflict (company_id, catalog_id, slot_start, telefono) do update set nombre = excluded.nombre;
    return jsonb_build_object('status', 'ok');
exception when check_violation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- La lista del panel: lo que aún no pasó (y lo de hace una hora), con el nombre de la cancha y
-- si ya se liberó (ninguna reserva viva la pisa).
create or replace function public.avisame_panel(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_desde text := to_char((now() at time zone 'America/Lima') - interval '1 hour', 'YYYY-MM-DD HH24:MI');
begin
    perform public.tu_pagina_autorizar(p_company);
    return coalesce((
        select jsonb_agg(to_jsonb(x) order by x.libre desc, x.avisado nulls first, x.slot_start) from (
            select w.id, w.catalog_id, coalesce(k.name, 'Cancha') as cancha, w.slot_start, w.nombre, w.telefono,
                   w.creado_at as creado, w.avisado_at as avisado,
                   not public.v2_cancha_ocupada(w.company_id, w.catalog_id, w.slot_start,
                       public.tu_pagina_sumar_min(w.slot_start, coalesce(nullif(k.duration_minutes, 0), 60))) as libre
              from public.pagina_avisame w
              left join public.catalog k on k.company_id = w.company_id and k.id = w.catalog_id
             where w.company_id = p_company and w.slot_start >= v_desde
             order by w.slot_start
             limit 500) x), '[]'::jsonb);
end $$;

create or replace function public.avisame_marcar(p_company text, p_id uuid, p_avisado boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.pagina_avisame set avisado_at = case when p_avisado then coalesce(avisado_at, now()) end
     where company_id = p_company and id = p_id;
end $$;

create or replace function public.avisame_borrar(p_company text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    delete from public.pagina_avisame where company_id = p_company and id = p_id;
end $$;

-- ── Permisos de lo nuevo ──────────────────────────────────────────────────────

do $$
declare
    f text;
begin
    -- Por dentro: solo las llaman otras funciones (security definer).
    foreach f in array array[
        'v2_tramo(jsonb)', 'v2_dia_que_cubre(jsonb, text, integer)', 'v2_en_turno_el(text, jsonb, text, integer)',
        'v2_canchas_cfg(text)', 'v2_es_cancha(text, text)', 'v2_cancha_plazo(jsonb)',
        'v2_precio_cancha(jsonb, text, numeric, integer, text, integer)',
        'v2_cancha_ocupada(text, text, text, text, text)', 'v2_cancha_motivo(text, text, text, integer, text)',
        'v2_cancha_soltar_vencidas(text, text, text, text)', 'v2_dias_plural(text)',
        'v2_cancha_semanas(text, public.catalog, text, uuid, text, integer, integer)',
        'v2_crear_cancha(text, public.catalog, public.leads, boolean, text, jsonb)',
        'avisos_tg_cancha_libre()'
    ] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
    -- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
    execute 'revoke execute on function public.avisame_srv_crear(text, jsonb) from public';
    execute 'grant execute on function public.avisame_srv_crear(text, jsonb) to anon';
    -- El panel, con la sesión del dueño (o del empleado, en los consumos).
    foreach f in array array[
        'avisame_panel(text)', 'avisame_marcar(text, uuid, boolean)', 'avisame_borrar(text, uuid)',
        'canchas_fijas_panel(text)', 'canchas_fija_cancelar(text, uuid)', 'canchas_fija_renovar(text, uuid, integer)',
        'agenda_consumo(text, jsonb)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

commit;
