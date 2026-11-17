-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · DEMO para enseñar el panel (17-nov-2026). Se puede repetir: borra su demo anterior.
-- ═══════════════════════════════════════════════════════════════════════════════
--   Todo lo que crea lleva id «demo247-…» (clientes, citas, pagos, comprobantes) y se borra entero
--   con scripts/the247-reset.sql. No toca catálogo, página, club ni cuentas.
--
--   Qué deja (las dos sedes, con los nombres de Mi página):
--     HOY
--       · 2 comprobantes por revisar: uno de ADELANTO (S/ 7.50, hoy 17:00) y uno de PAGO COMPLETO
--         (S/ 25, mañana 12:00), con una captura marcada «DEMO».
--       · 1 «No vino» con adelanto pagado → sale en «Adelantos por reprogramar».
--       · 2 citas que ya pasaron sin marcar (12:30 y 13:00) → para enseñar «Vino» / «No vino».
--       · Atendidas y cobradas (efectivo y Yape) y citas por venir con adelanto → la Caja tiene
--         de todo: entró por método, a cuenta, por cobrar.
--     LOS 7 DÍAS ANTERIORES: citas atendidas y algún «No vino» en cada sede → Métricas › Por sede.
--
--   Los celulares son de mentira (51 900 247 0xx): no le escriban a esos clientes.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Una cita con su servicio (nombre, precio y duración del catálogo) y, si hay, su pago.
create or replace function pg_temp.cita(p_co text, p_id text, p_lead text, p_sede text, p_dia date, p_hora text,
                                        p_item text, p_estado text, p_pagado_por text, p_metodo text,
                                        p_pago numeric, p_pago_ts bigint, p_creada bigint)
returns void language plpgsql as $$
declare
    k   record;
    ini timestamp := p_dia + p_hora::time;
begin
    select name, coalesce(price, 0) as price, coalesce(nullif(duration_minutes, 0), 30) as dur into k
      from public.catalog where company_id = p_co and id = p_item;
    if not found then raise exception 'No está el servicio % en el catálogo.', p_item; end if;
    insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id,
                                     status, created_at, pagado_por, cumplido_por, metodo_pago, sede)
    values (p_id, p_co, p_lead, k.name, to_char(ini, 'YYYY-MM-DD HH24:MI'),
            to_char(ini + make_interval(mins => k.dur), 'YYYY-MM-DD HH24:MI'), k.dur, '',
            p_estado, p_creada, p_pagado_por, case when p_estado = 'completed' then 'panel' else '' end, p_metodo, p_sede);
    insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
    values (p_id || '-s1', p_id, p_co, p_item, k.name, k.price, k.dur, 0);
    if p_pago > 0 then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
        values (p_id || '-p', p_lead, p_co, p_pago, 'DEMO-' || p_id, 1, p_pago_ts, '', p_id);
    end if;
end $$;

do $$
declare
    v_id    constant text := 'the247barbershop';
    v_url   constant text := 'https://vendemias.com/assets/the247/';
    v_hoy   date := (now() at time zone 'America/Lima')::date;
    v_ahora bigint := extract(epoch from now())::bigint;
    v_s1    text;
    v_s2    text;
    v_nombres text[] := array['Carlos Ríos', 'Diego Paredes', 'Luis Tananta', 'Jorge Panduro', 'Kevin Arévalo', 'Piero Vásquez',
                              'Marco Del Águila', 'Renzo Ruiz', 'Bruno Pinedo', 'André Flores', 'Joel Saldaña', 'Franco Rengifo'];
    i       integer;
    d       integer;
    -- epoch de una hora de Lima de un día
    ts      bigint;
begin
    if not exists (select 1 from public.companies where id = v_id) then raise exception 'No existe %.', v_id; end if;
    select secciones #>> '{citas,sedes,0,nombre}', secciones #>> '{citas,sedes,1,nombre}' into v_s1, v_s2
      from public.tu_pagina where company_id = v_id;
    if v_s1 is null or v_s2 is null then raise exception 'La página no tiene las dos sedes (secciones.citas.sedes).'; end if;

    -- ── 0 · Fuera la demo anterior ─────────────────────────────────────────────
    delete from public.comprobantes_web where company_id = v_id and (lead_id like 'demo247-%' or appointment_id like 'demo247-%');
    delete from public.pending_payments where company_id = v_id and (lead_id like 'demo247-%' or appointment_id like 'demo247-%');
    delete from public.appointment_services where appointment_id in
        (select id from public.appointments where company_id = v_id and (id like 'demo247-%' or lead_id like 'demo247-%'));
    delete from public.appointments where company_id = v_id and (id like 'demo247-%' or lead_id like 'demo247-%');
    delete from public.leads where company_id = v_id and id like 'demo247-%';

    -- ── 1 · Clientes ────────────────────────────────────────────────────────────
    for i in 1 .. array_length(v_nombres, 1) loop
        insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
        values ('demo247-l' || lpad(i::text, 2, '0'), v_id, '51900247' || lpad(i::text, 3, '0'), v_nombres[i], 'inquiry', 'exploring',
                v_ahora - 10 * 86400, 0, 'web', v_ahora - 3600);
    end loop;

    -- ── 2 · HOY, sede 1 ─────────────────────────────────────────────────────────
    --                    id              cliente          sede  día    hora     servicio            estado        cobro      método  pago  cuándo pagó                                   creada
    perform pg_temp.cita(v_id, 'demo247-a01', 'demo247-l01', v_s1, v_hoy, '09:30', 't247-corte',       'completed',  'panel',   'cash', 0,    0,                                             v_ahora - 2 * 86400);
    ts := extract(epoch from (v_hoy + time '10:55') at time zone 'America/Lima')::bigint;
    perform pg_temp.cita(v_id, 'demo247-a02', 'demo247-l02', v_s1, v_hoy, '10:30', 't247-corte-barba', 'completed',  'voucher', 'yape', 30,   ts,                                            v_ahora - 86400);
    -- No vino, con su adelanto pagado ayer → «Adelantos por reprogramar».
    perform pg_temp.cita(v_id, 'demo247-a03', 'demo247-l03', v_s1, v_hoy, '11:30', 't247-degradado',   'no_show',    '',        'yape', 10,   v_ahora - 86400,                               v_ahora - 86400 - 600);
    -- Ya pasó y nadie la marcó → «Vino» / «No vino».
    perform pg_temp.cita(v_id, 'demo247-a07', 'demo247-l07', v_s1, v_hoy, '12:30', 't247-corte',       'confirmed',  '',        'yape', 7.5,  v_ahora - 86400,                               v_ahora - 86400 - 600);
    -- Por venir, con adelanto.
    perform pg_temp.cita(v_id, 'demo247-a04', 'demo247-l04', v_s1, v_hoy, '16:00', 't247-corte',       'confirmed',  '',        'yape', 7.5,  v_ahora - 86400,                               v_ahora - 86400 - 600);
    perform pg_temp.cita(v_id, 'demo247-a05', 'demo247-l05', v_s1, v_hoy, '18:30', 't247-barba',       'confirmed',  '',        'yape', 5,    v_ahora - 1800,                                v_ahora - 2000);

    -- ── 3 · HOY, sede 2 ─────────────────────────────────────────────────────────
    ts := extract(epoch from (v_hoy + time '10:50') at time zone 'America/Lima')::bigint;
    perform pg_temp.cita(v_id, 'demo247-b01', 'demo247-l06', v_s2, v_hoy, '10:00', 't247-combo-degradado', 'completed', 'voucher', 'yape', 25, ts,                                          v_ahora - 86400);
    perform pg_temp.cita(v_id, 'demo247-b02', 'demo247-l08', v_s2, v_hoy, '11:00', 't247-corte',       'completed',  'panel',   'cash', 0,    0,                                             v_ahora - 86400);
    perform pg_temp.cita(v_id, 'demo247-b06', 'demo247-l09', v_s2, v_hoy, '13:00', 't247-degradado',   'confirmed',  'voucher', 'yape', 20,   v_ahora - 86400,                               v_ahora - 86400 - 600);
    -- Apartada: subió la captura del ADELANTO, falta que la aprueben.
    perform pg_temp.cita(v_id, 'demo247-b03', 'demo247-l10', v_s2, v_hoy, '17:00', 't247-corte',       'pending_payment', '',     'yape', 0,    0,                                             v_ahora);
    perform pg_temp.cita(v_id, 'demo247-b04', 'demo247-l11', v_s2, v_hoy, '19:00', 't247-corte-barba', 'confirmed',  'voucher', 'yape', 30,   v_ahora - 86400,                               v_ahora - 86400 - 600);

    -- ── 4 · MAÑANA ──────────────────────────────────────────────────────────────
    -- Apartada: subió la captura del pago COMPLETO.
    perform pg_temp.cita(v_id, 'demo247-b05', 'demo247-l12', v_s2, v_hoy + 1, '12:00', 't247-combo-degradado', 'pending_payment', '', 'yape', 0, 0,                                         v_ahora);
    perform pg_temp.cita(v_id, 'demo247-a06', 'demo247-l01', v_s1, v_hoy + 1, '15:00', 't247-corte',   'confirmed',  '',        'yape', 7.5,  v_ahora - 3000,                                v_ahora - 3600);

    insert into public.comprobantes_web (company_id, appointment_id, lead_id, codigo, url, image_hash, estado, motivo, monto, metodo, operacion)
    values (v_id, 'demo247-b03', 'demo247-l10', 'DEMO1', v_url || 'demo-captura-1.webp', 'demo247-h1', 'revisar',
            'Lo revisas tú: la validación automática está apagada.', 7.5, 'yape', 'DEMO-0001'),
           (v_id, 'demo247-b05', 'demo247-l12', 'DEMO2', v_url || 'demo-captura-2.webp', 'demo247-h2', 'revisar',
            'Lo revisas tú: la validación automática está apagada.', 25, 'yape', 'DEMO-0002');

    -- ── 5 · Los 7 días anteriores (para Métricas › Por sede) ─────────────────────
    for d in 1 .. 7 loop
        perform pg_temp.cita(v_id, 'demo247-h' || d || 'a1', 'demo247-l' || lpad((1 + d % 12)::text, 2, '0'), v_s1, v_hoy - d, '10:00',
                             (array['t247-corte', 't247-degradado', 't247-corte-barba'])[1 + d % 3], 'completed', 'panel', 'cash', 0, 0, v_ahora - (d + 2) * 86400);
        perform pg_temp.cita(v_id, 'demo247-h' || d || 'a2', 'demo247-l' || lpad((1 + (d + 4) % 12)::text, 2, '0'), v_s1, v_hoy - d, '16:00',
                             (array['t247-barba', 't247-corte', 't247-combo-clasico'])[1 + d % 3], 'completed', 'panel', 'yape', 0, 0, v_ahora - (d + 2) * 86400);
        perform pg_temp.cita(v_id, 'demo247-h' || d || 'b1', 'demo247-l' || lpad((1 + (d + 7) % 12)::text, 2, '0'), v_s2, v_hoy - d, '11:00',
                             (array['t247-combo-degradado', 't247-corte-barba', 't247-combo-mascarilla'])[1 + d % 3], 'completed', 'panel', 'yape', 0, 0, v_ahora - (d + 2) * 86400);
        perform pg_temp.cita(v_id, 'demo247-h' || d || 'b2', 'demo247-l' || lpad((1 + (d + 9) % 12)::text, 2, '0'), v_s2, v_hoy - d, '18:00',
                             (array['t247-degradado', 't247-corte', 't247-corte-barba'])[1 + d % 3],
                             case when d in (2, 5) then 'no_show' else 'completed' end,
                             case when d in (2, 5) then '' else 'panel' end, 'cash', 0, 0, v_ahora - (d + 2) * 86400);
    end loop;

    raise notice 'Demo lista: sedes «%» y «%», % citas.', v_s1, v_s2,
        (select count(*) from public.appointments where company_id = v_id and id like 'demo247-%');
end $$;

commit;

-- Comprobación: citas de la demo por día y sede.
select substr(slot_start, 1, 10) as dia, sede, status, count(*)
  from public.appointments where company_id = 'the247barbershop' and id like 'demo247-%'
 group by 1, 2, 3 order by 1 desc, 2, 3;
