-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · CARGAR DATOS DE PRUEBA (18-nov-2026). Se puede repetir: borra su carga anterior.
-- ═══════════════════════════════════════════════════════════════════════════════
--   Para ver TODO funcionando, con las horas pegadas a la hora en que lo corras:
--
--   INICIO («Lo que necesita atención», con la campana)
--     · 2 clientes por cobrar · 2 citas que pasaron sin marcar · 2 pagos por verificar
--     · 1 adelanto por reprogramar (pagó y no vino) · «S/ … por pagar a tu equipo»
--   CAJA › Cobrar: 2 en «Listos para cobrar» (una con producto), con su barbero.
--   CAJA › Cierre del día: cobros en efectivo y Yape, a cuenta, gastos (almuerzo, luz) y un adelanto.
--   COMISIONES: los 8 barberos con atenciones de la semana, un pago hecho hace 4 días
--     (para «Último pago») y adelantos que se descuentan.
--   MI COMISIÓN (entrando con un barbero): su «Por cobrar» = lo que el dueño ve para él.
--   «Lo más pedido»: servicios y productos vendidos en la semana.
--   MÉTRICAS: 7 días hacia atrás en las dos sedes.
--
--   Todo lleva «demo247-» o «cierre-demo247» en el id. Se borra con scripts/the247-prueba-cero.sql
--   (que deja TODO en cero) o volviendo a correr este. No toca catálogo, barberos, página ni cuentas.
--   Los celulares son de mentira (51 900 247 0xx): no les escriban.
--
--   Necesita: los 8 barberos (the247-barberos.sql), los productos (the247-productos.sql), las dos
--   sedes en Mi página, y datos 0013 + 0014 (gastos y cierres).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Una cita con sus líneas (servicio + productos) y, si hay, su pago.
create or replace function pg_temp.cita(p_co text, p_id text, p_lead text, p_sede text, p_ini timestamp, p_items text[],
                                        p_emp text, p_estado text, p_pagado_por text, p_metodo text,
                                        p_pago numeric, p_pago_ts bigint, p_creada bigint)
returns void language plpgsql as $$
declare
    k      record;
    v_dur  integer := 0;
    v_nom  text := '';
    i      integer := 0;
begin
    for k in select c.id, c.name, coalesce(c.price, 0) as price, coalesce(nullif(c.duration_minutes, 0), 30) as dur, coalesce(c.tipo, '') as tipo
               from unnest(p_items) with ordinality u(item, ord) join public.catalog c on c.company_id = p_co and c.id = u.item
              order by u.ord loop
        if k.tipo <> 'producto' then v_dur := v_dur + k.dur; end if;
        v_nom := v_nom || case when v_nom = '' then '' else ' + ' end || k.name;
    end loop;
    if v_nom = '' then raise exception 'No está en el catálogo: %', p_items; end if;
    v_dur := greatest(v_dur, 30);
    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id,
                                     status, created_at, pagado_por, cumplido_por, metodo_pago, sede)
    values (p_id, p_co, p_lead, v_nom, to_char(p_ini, 'YYYY-MM-DD HH24:MI'),
            to_char(p_ini + make_interval(mins => v_dur), 'YYYY-MM-DD HH24:MI'), v_dur, p_emp,
            p_estado, p_creada, p_pagado_por, case when p_estado = 'completed' then 'panel' else '' end, p_metodo, p_sede);
    for k in select c.id, c.name, coalesce(c.price, 0) as price, coalesce(nullif(c.duration_minutes, 0), 30) as dur, coalesce(c.tipo, '') as tipo
               from unnest(p_items) with ordinality u(item, ord) join public.catalog c on c.company_id = p_co and c.id = u.item
              order by u.ord loop
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (p_id || '-s' || i, p_id, p_co, k.id, k.name, k.price, case when k.tipo = 'producto' then 0 else k.dur end, i);
        i := i + 1;
    end loop;
    -- Con sus líneas puestas: congelar la comisión como lo hace el panel (datos 0011).
    if p_estado = 'completed' then
        update public.appointments set status = status where id = p_id;
    end if;
    if p_pago > 0 then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
        values (p_id || '-p', p_lead, p_co, p_pago, 'DEMO-' || p_id, 1, p_pago_ts, '', p_id);
    end if;
end $$;

-- Un gasto (datos 0013): del negocio, adelanto a un barbero o personal.
create or replace function pg_temp.gasto(p_co text, p_id text, p_fecha date, p_concepto text, p_cat text, p_importe numeric,
                                         p_tipo text, p_emp text, p_ts bigint)
returns void language plpgsql as $$
begin
    insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por, created_at, tipo, employee_id)
    values (p_id, p_co, to_char(p_fecha, 'YYYY-MM-DD'), p_concepto, p_cat, p_importe, '', p_ts, p_tipo, p_emp);
end $$;

do $$
declare
    v_id    constant text := 'the247barbershop';
    v_url   constant text := 'https://vendemias.com/assets/the247/';
    v_ahora_l timestamp := now() at time zone 'America/Lima';
    v_hoy   date := (now() at time zone 'America/Lima')::date;
    v_ahora bigint := extract(epoch from now())::bigint;
    -- La media hora en curso: las horas de hoy se ponen alrededor de ella.
    v_base  timestamp := date_trunc('hour', now() at time zone 'America/Lima')
                         + case when extract(minute from now() at time zone 'America/Lima') >= 30 then interval '30 min' else interval '0' end;
    v_s1 text; v_s2 text;
    v_e  text[];      -- los barberos activos
    v_en text[];      -- sus nombres
    v_sv text[];      -- servicios activos, en el orden del catálogo
    v_pr text[];      -- productos activos
    v_nombres text[] := array['Carlos Ríos', 'Diego Paredes', 'Luis Tananta', 'Jorge Panduro', 'Kevin Arévalo', 'Piero Vásquez',
                              'Marco Del Águila', 'Renzo Ruiz', 'Bruno Pinedo', 'André Flores', 'Joel Saldaña', 'Franco Rengifo'];
    i integer; d integer; ts bigint; n integer;
    v_cierre_citas text[]; v_cierre_com numeric; v_cierre_id uuid := gen_random_uuid();
    l text;  -- un cliente
    e text;  -- un barbero
begin
    if not exists (select 1 from public.companies where id = v_id) then raise exception 'No existe %.', v_id; end if;
    select secciones #>> '{citas,sedes,0,nombre}', secciones #>> '{citas,sedes,1,nombre}' into v_s1, v_s2
      from public.tu_pagina where company_id = v_id;
    if v_s1 is null or v_s2 is null then raise exception 'La página no tiene las dos sedes (secciones.citas.sedes).'; end if;
    select array_agg(id order by name), array_agg(name order by name) into v_e, v_en
      from public.employees where company_id = v_id and coalesce(is_active, 1) = 1;
    if coalesce(array_length(v_e, 1), 0) < 4 then raise exception 'Faltan barberos: corre antes scripts/the247-barberos.sql.'; end if;
    select array_agg(id order by sort_order, name) into v_sv from public.catalog
     where company_id = v_id and coalesce(is_active, 1) = 1 and coalesce(tipo, '') <> 'producto' and coalesce(price, 0) > 0;
    select array_agg(id order by sort_order, name) into v_pr from public.catalog
     where company_id = v_id and coalesce(is_active, 1) = 1 and tipo = 'producto' and coalesce(price, 0) > 0;
    if coalesce(array_length(v_sv, 1), 0) < 3 then raise exception 'El catálogo necesita al menos 3 servicios activos con precio.'; end if;
    if coalesce(array_length(v_pr, 1), 0) < 3 then raise exception 'Faltan productos: corre antes scripts/the247-productos.sql.'; end if;
    -- La 0014 al día: con «gasto_id» (el pago al barbero sale como gasto en la Caja).
    if to_regclass('public.comision_cierres') is null or not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'comision_cierres' and column_name = 'gasto_id') then
        raise exception 'Corre antes (otra vez) modules/datos/sql/0014_cierres_de_comision.sql: tu base tiene la versión vieja, sin el pago como gasto de la Caja.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'gastos' and column_name = 'employee_id') then
        raise exception 'Corre antes modules/datos/sql/0013_gastos_y_adelantos.sql (gastos y adelantos).';
    end if;

    -- ── 0 · Fuera la carga anterior ──────────────────────────────────────────
    -- Los pagos de prueba se reconocen por sus citas («demo247-…»).
    delete from public.comision_cierres c where c.company_id = v_id and exists (select 1 from unnest(c.citas) x where x like 'demo247-%');
    delete from public.gastos where company_id = v_id and (id like 'demo247-%' or id like 'cierre-demo247%');
    delete from public.comprobantes_web where company_id = v_id and (lead_id like 'demo247-%' or appointment_id like 'demo247-%');
    delete from public.pending_payments where company_id = v_id and (lead_id like 'demo247-%' or appointment_id like 'demo247-%');
    if to_regclass('public.comisiones_congeladas') is not null then
        delete from public.comisiones_congeladas where company_id = v_id and appointment_id like 'demo247-%';
    end if;
    delete from public.appointment_services where appointment_id in
        (select id from public.appointments where company_id = v_id and (id like 'demo247-%' or lead_id like 'demo247-%'));
    delete from public.appointments where company_id = v_id and (id like 'demo247-%' or lead_id like 'demo247-%');
    delete from public.leads where company_id = v_id and id like 'demo247-%';

    -- ── 1 · Clientes ─────────────────────────────────────────────────────────
    for i in 1 .. array_length(v_nombres, 1) loop
        insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
        values ('demo247-l' || lpad(i::text, 2, '0'), v_id, '51900247' || lpad(i::text, 3, '0'), v_nombres[i], 'inquiry', 'exploring',
                v_ahora - 10 * 86400, 0, 'web', v_ahora - 3600);
    end loop;

    -- ── 2 · HOY, alrededor de la hora en que se corre ────────────────────────
    --                    id             cliente        sede  inicio                         lo que se hizo                 barbero  estado       cobro      método  pago  cuándo pagó        creada
    -- Cobradas (efectivo y Yape), una con bebida.
    perform pg_temp.cita(v_id, 'demo247-a01', 'demo247-l01', v_s1, v_base - interval '4 hours',   array[v_sv[1], v_pr[1]],       v_e[1], 'completed', 'panel',   'cash', 0,   0,                  v_ahora - 2 * 86400);
    perform pg_temp.cita(v_id, 'demo247-a02', 'demo247-l02', v_s1, v_base - interval '3 hours',   array[v_sv[3]],                v_e[2], 'completed', 'voucher', 'yape', 30,  v_ahora - 3 * 3600, v_ahora - 86400);
    perform pg_temp.cita(v_id, 'demo247-b01', 'demo247-l06', v_s2, v_base - interval '3.5 hours', array[v_sv[2]],                v_e[5], 'completed', 'panel',   'yape', 0,   0,                  v_ahora - 86400);
    perform pg_temp.cita(v_id, 'demo247-b02', 'demo247-l08', v_s2, v_base - interval '150 min',   array[v_sv[1], v_pr[array_length(v_pr,1)]], v_e[6], 'completed', 'panel', 'cash', 0, 0,           v_ahora - 86400);
    -- LISTOS PARA COBRAR: atendidos, sin cobro (uno con una cera) → «2 clientes por cobrar».
    perform pg_temp.cita(v_id, 'demo247-a08', 'demo247-l09', v_s1, v_base - interval '1 hour',    array[v_sv[2], v_pr[2]],       v_e[3], 'completed', '',        '',     0,   0,                  v_ahora - 86400);
    perform pg_temp.cita(v_id, 'demo247-b07', 'demo247-l10', v_s2, v_base - interval '1 hour',    array[v_sv[3]],                v_e[7], 'completed', '',        '',     0,   0,                  v_ahora - 86400);
    -- PASARON SIN MARCAR → «2 citas pasaron sin marcar» (Vino / No vino).
    perform pg_temp.cita(v_id, 'demo247-a07', 'demo247-l07', v_s1, v_base - interval '90 min',    array[v_sv[1]],                v_e[4], 'confirmed', '',        'yape', 7.5, v_ahora - 86400,    v_ahora - 86400 - 600);
    perform pg_temp.cita(v_id, 'demo247-b06', 'demo247-l11', v_s2, v_base - interval '2 hours',   array[v_sv[2]],                v_e[8], 'confirmed', '',        '',     0,   0,                  v_ahora - 86400 - 600);
    -- NO VINO con adelanto pagado → «Adelantos por reprogramar».
    perform pg_temp.cita(v_id, 'demo247-a03', 'demo247-l03', v_s1, v_base - interval '5 hours',   array[v_sv[2]],                v_e[2], 'no_show',   '',        'yape', 10,  v_ahora - 86400,    v_ahora - 86400 - 600);
    -- POR VENIR, con adelanto.
    perform pg_temp.cita(v_id, 'demo247-a04', 'demo247-l04', v_s1, v_base + interval '1 hour',    array[v_sv[1]],                v_e[1], 'confirmed', '',        'yape', 7.5, v_ahora - 86400,    v_ahora - 86400 - 600);
    perform pg_temp.cita(v_id, 'demo247-a05', 'demo247-l05', v_s1, v_base + interval '2 hours',   array[v_sv[3]],                v_e[3], 'confirmed', '',        'yape', 5,   v_ahora - 1800,     v_ahora - 2000);
    perform pg_temp.cita(v_id, 'demo247-b04', 'demo247-l12', v_s2, v_base + interval '90 min',    array[v_sv[1]],                v_e[5], 'confirmed', 'voucher', 'yape', 30,  v_ahora - 86400,    v_ahora - 86400 - 600);
    -- APARTADAS con captura por revisar → «2 pagos por verificar».
    perform pg_temp.cita(v_id, 'demo247-b03', 'demo247-l06', v_s2, v_base + interval '3 hours',   array[v_sv[1]],                '',     'pending_payment', '', 'yape', 0, 0,                   v_ahora);
    perform pg_temp.cita(v_id, 'demo247-b05', 'demo247-l02', v_s2, (v_hoy + 1) + time '12:00',    array[v_sv[2]],                '',     'pending_payment', '', 'yape', 0, 0,                   v_ahora);
    insert into public.comprobantes_web (company_id, appointment_id, lead_id, codigo, url, image_hash, estado, motivo, monto, metodo, operacion)
    values (v_id, 'demo247-b03', 'demo247-l06', 'DEMO1', v_url || 'demo-captura-1.webp', 'demo247-h1', 'revisar',
            'Lo revisas tú: la validación automática está apagada.', 7.5, 'yape', 'DEMO-0001'),
           (v_id, 'demo247-b05', 'demo247-l02', 'DEMO2', v_url || 'demo-captura-2.webp', 'demo247-h2', 'revisar',
            'Lo revisas tú: la validación automática está apagada.', 25, 'yape', 'DEMO-0002');

    -- ── 3 · Los 7 días anteriores: 4 atenciones al día, cada barbero en su turno ─
    for d in 1 .. 7 loop
        for n in 0 .. 3 loop
            i := ((d * 4 + n) % array_length(v_e, 1)) + 1;                     -- barbero
            l := 'demo247-l' || lpad((((d * 3 + n) % 12) + 1)::text, 2, '0');    -- cliente
            perform pg_temp.cita(v_id, 'demo247-h' || d || '-' || n, l,
                case when n % 2 = 0 then v_s1 else v_s2 end,
                (v_hoy - d) + make_interval(hours => 10 + n * 2),
                case when (d + n) % 3 = 0 then array[v_sv[1 + (d + n) % array_length(v_sv, 1)], v_pr[1 + (d * n) % array_length(v_pr, 1)]]
                     else array[v_sv[1 + (d + n) % least(array_length(v_sv, 1), 5)]] end,
                v_e[i],
                case when d in (2, 5) and n = 3 then 'no_show' else 'completed' end,
                case when d in (2, 5) and n = 3 then '' else 'panel' end,
                case when n % 2 = 0 then 'cash' else 'yape' end, 0, 0, v_ahora - (d + 2) * 86400);
        end loop;
    end loop;

    -- ── 4 · Gastos y adelantos ───────────────────────────────────────────────
    perform pg_temp.gasto(v_id, 'demo247-g1', v_hoy,     'Almuerzo de ' || v_en[3], 'Almuerzo', 12,  'negocio',  v_e[3], v_ahora - 7200);
    perform pg_temp.gasto(v_id, 'demo247-g2', v_hoy,     'Luz / agua',              'Luz / agua', 80, 'negocio', '',     v_ahora - 5400);
    perform pg_temp.gasto(v_id, 'demo247-g3', v_hoy,     'Adelanto',                'Adelanto', 20,  'adelanto', v_e[2], v_ahora - 3600);
    perform pg_temp.gasto(v_id, 'demo247-g4', v_hoy - 2, 'Adelanto',                'Adelanto', 15,  'adelanto', v_e[6], v_ahora - 2 * 86400);
    perform pg_temp.gasto(v_id, 'demo247-g5', v_hoy - 3, 'Navajas',                 'Insumos',  35,  'negocio',  '',     v_ahora - 3 * 86400);

    -- ── 5 · Un pago de comisión hecho hace 4 días (al primer barbero) ────────
    -- Cubre sus atenciones de hace 7 a 5 días: lo de después sale en «Por pagar».
    e := v_e[1];
    select coalesce(array_agg(a.id), '{}'),
           -- (price puede ser double precision: a numeric para redondear)
           coalesce(round(sum(s.price::numeric * coalesce((select comision_pct from public.employees where id = e), 50)::numeric / 100), 2), 0)
      into v_cierre_citas, v_cierre_com
      from public.appointments a join public.appointment_services s on s.appointment_id = a.id
      left join public.catalog c on c.company_id = v_id and c.id = s.catalog_item_id
     where a.company_id = v_id and a.id like 'demo247-h%' and a.employee_id = e and a.status = 'completed'
       and coalesce(c.tipo, '') <> 'producto'
       and substr(a.slot_start, 1, 10) between to_char(v_hoy - 7, 'YYYY-MM-DD') and to_char(v_hoy - 5, 'YYYY-MM-DD');
    v_cierre_citas := array(select distinct x from unnest(v_cierre_citas) x);
    if array_length(v_cierre_citas, 1) > 0 then
        ts := extract(epoch from ((v_hoy - 4) + time '20:00') at time zone 'America/Lima')::bigint;
        perform pg_temp.gasto(v_id, 'cierre-demo247', v_hoy - 4, 'Comisión de ' || v_en[1] || ' (efectivo)', 'Comisiones', v_cierre_com, 'negocio', e, ts);
        insert into public.comision_cierres (id, company_id, employee_id, desde, citas, adelantos, comision, adelantado, pagado, metodo, pagado_at, gasto_id)
        values (v_cierre_id, v_id, e, v_hoy - 7, v_cierre_citas, '{}', v_cierre_com, 0, v_cierre_com, 'efectivo',
                ((v_hoy - 4) + time '20:00') at time zone 'America/Lima', 'cierre-demo247');
    end if;

    raise notice 'Prueba cargada: % citas (sedes «%» y «%»), % barberos, pago de comisión a % por S/ %.',
        (select count(*) from public.appointments where company_id = v_id and id like 'demo247-%'), v_s1, v_s2,
        array_length(v_e, 1), v_en[1], v_cierre_com;
end $$;

commit;

-- Comprobación: lo de hoy, por estado (deben salir completed con y sin cobro, confirmed, no_show, pending_payment).
select status, case when status = 'completed' and coalesce(pagado_por, '') = '' then 'SIN COBRAR' else coalesce(nullif(pagado_por, ''), '—') end as cobro,
       count(*)
  from public.appointments
 where company_id = 'the247barbershop' and id like 'demo247-%'
   and slot_start like to_char((now() at time zone 'America/Lima')::date, 'YYYY-MM-DD') || '%'
 group by 1, 2 order by 1, 2;
