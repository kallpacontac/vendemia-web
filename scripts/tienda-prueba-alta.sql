-- ═══════════════════════════════════════════════════════════════════════════════
-- TIENDA DE PRUEBA · «Pollería de Prueba», para ver el tablero de Pedidos con datos
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 12-nov-2026: «dame otra empresa asociada a esta cuenta». Se corre entero en el
-- editor SQL de Supabase. Necesita tu-pagina 0019 y 0020 (corridas).
--
-- Deja listo:
--   · El negocio `tienda-prueba`, tienda online (ecommerce) con la agenda en la nube, de la
--     cuenta de v_email. En el panel se cambia de negocio con el selector de arriba a la derecha;
--     «Pedidos» sale en la barra principal.
--   · 8 productos de pollería y su página publicada en agenda.vendemias.com/tienda-prueba
--     (plantilla Carta visual), que cobra un ADELANTO de S/ 10 por pedido.
--   · 10 pedidos repartidos en el tablero: 2 en «Por cobrar», 2 Nuevos (uno tarde),
--     2 Preparando, 2 Listos y 2 Entregados hoy; unos cobrados, otros con el adelanto a cuenta.
--     Y 6 entregados de días anteriores, para «Ver todos los pedidos» y la Caja.
--
-- Clientes inventados con teléfonos 5190001…: nadie real recibe nada. Los avisos al
-- celular se apagan mientras se siembra. Sin bot: no se conecta a ningún WhatsApp.
--
-- Se niega a correr si ya existe. Deshacer: scripts/tienda-prueba-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare t record;
begin
    for t in select c.relname, g.tgname from pg_trigger g
               join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and g.tgname in ('avisos_cita', 'avisos_pedido', 'avisos_pago') loop
        execute format('alter table public.%I disable trigger %I', t.relname, t.tgname);
    end loop;
end $$;

do $$
declare
    -- ▼ La cuenta con la que entras al panel (debe existir). ▼
    v_email    text := 'subovideodetodo@gmail.com';
    -- El número que recibe Yape/Plin y los WhatsApp de la página (el mismo de Zona Gol).
    v_numero   text := '51947144701';
    v_titular  text := 'Pollería de Prueba';

    v_id       constant text := 'tienda-prueba';
    v_user     uuid;
    v_ahora    bigint := extract(epoch from now())::bigint;
    v_horario  jsonb := '{}'::jsonb;
    v_dia      text;
    v_clientes constant text[] := array['Ana Torres', 'Luis Paz', 'Rosa Díaz', 'Carlos Medina', 'Lucía Paredes',
                                        'Jorge Huamán', 'Marco Quispe', 'Sofía Vega', 'Renzo Salas', 'Carmen Rojas'];
    i          integer;
begin
    select id into v_user from auth.users where lower(email) = lower(v_email);
    if v_user is null then raise exception 'No existe la cuenta %. Pon en v_email la cuenta con la que entras al panel.', v_email; end if;
    if exists (select 1 from public.companies where id = v_id) or exists (select 1 from public.tu_pagina where slug = v_id) then
        raise exception 'Ya existe tienda-prueba. Para empezar de cero, corre antes scripts/tienda-prueba-deshacer.sql.';
    end if;
    if to_regprocedure('public.pedido_cobrar(text, text, numeric, text, text)') is null then
        raise exception 'Falta tu-pagina 0020 (cobro de pedidos). Córrela antes.';
    end if;

    -- ── El negocio ──────────────────────────────────────────────────────────────
    foreach v_dia in array array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] loop
        v_horario := v_horario || jsonb_build_object(v_dia, jsonb_build_object('open', '11:00', 'close', '23:00', 'closed', false));
    end loop;
    insert into public.companies (id, name, bot_name, bot_tone, owner_phone, whatsapp_phone, plan, business_mode, slot_minutes, schedule,
                                  payment_methods, require_payment_to_confirm, verify_vouchers, location, business_description,
                                  custom_rules, reminder_config, request_location, proactive_venue)
    values (v_id, 'Pollería de Prueba', 'Mia', 'cercano y directo', v_numero, v_numero, 'best_seller', 'ecommerce', 60, v_horario::text,
            jsonb_build_array(jsonb_build_object('type', 'yape', 'number', v_numero, 'name', v_titular),
                              jsonb_build_object('type', 'plin', 'number', v_numero, 'name', v_titular))::text,
            0, 1, 'Los Olivos, Lima', 'Pollería de PRUEBA para enseñar el tablero de pedidos. No es un negocio real.',
            '', '{"lead_hours_min":1,"lead_hours_max":3}', 1, 0);
    insert into public.memberships (id, auth_user_id, company_id, role) values ('m-' || gen_random_uuid(), v_user::text, v_id, 'owner');
    insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube) values (v_id, true, true)
    on conflict (company_id) do update set config_en_nube = true, agenda_en_nube = true;

    -- ── Productos ───────────────────────────────────────────────────────────────
    insert into public.catalog (id, company_id, name, description, price, is_active, sort_order, familia, tipo) values
        ('tp-pollo',    v_id, 'Pollo a la brasa entero', 'Con papas familiares y ensalada', 64, 1, 1, 'Pollos', 'producto'),
        ('tp-medio',    v_id, '1/2 Pollo a la brasa',    'Con papas y ensalada',            36, 1, 2, 'Pollos', 'producto'),
        ('tp-cuarto',   v_id, '1/4 Pollo a la brasa',    'Con papas y ensalada',            20, 1, 3, 'Pollos', 'producto'),
        ('tp-mostrito', v_id, 'Mostrito',                '1/4 de pollo con chaufa',         24, 1, 4, 'Pollos', 'producto'),
        ('tp-alitas',   v_id, 'Alitas BBQ (8)',          'Con papas',                       28, 1, 5, 'Piqueos', 'producto'),
        ('tp-chicha',   v_id, 'Chicha morada 1 L',       '',                                12, 1, 6, 'Bebidas', 'producto'),
        ('tp-inca',     v_id, 'Inca Kola 1.5 L',         '',                                10, 1, 7, 'Bebidas', 'producto'),
        ('tp-helado',   v_id, 'Helado de lúcuma',        '',                                 8, 1, 8, 'Postres', 'producto');

    -- ── La página: Carta visual y un adelanto de S/ 10 (sql/0020) ───────────────
    -- Antes que los pedidos: el trigger de la 0020 lee de aquí cuánto pagar antes.
    insert into public.tu_pagina (company_id, slug, titulo, frase, whatsapp, plantilla, color, publicada, secciones)
    values (v_id, v_id, 'Pollería de Prueba', 'Pollo a la brasa de prueba: aquí se ensaya, no se cocina.', v_numero, 'restaurante', '#B9662F', true,
            jsonb_build_object('catalogo', true, 'reservar', false, 'envios', false,
                'apariencia', jsonb_build_object('plantillaActiva', true, 'mostrarWhatsapp', true, 'pedirMetodoPago', true, 'pedirNotaPedido', true, 'pedirUbicacion', true),
                'cobroPedidos', jsonb_build_object('modo', 'adelanto', 'tipo', 'monto', 'valor', 10)));

    -- ── Clientes ────────────────────────────────────────────────────────────────
    for i in 1 .. array_length(v_clientes, 1) loop
        insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
        values ('seed-tp-l' || i, v_id, '5190001' || lpad(i::text, 4, '0'), v_clientes[i], 'inquiry', 'exploring',
                v_ahora - 20 * 86400, 0, 'web', v_ahora - 3600);
    end loop;
end $$;

-- ── Pedidos: (id, cliente, minutos atrás, entrega, dirección, nota, status, etapa, minutos en la etapa, cobrado, método, líneas) ──
create or replace function pg_temp.pedido(p_id text, p_lead integer, p_hace integer, p_entrega text, p_dir text, p_nota text,
                               p_status text, p_etapa text, p_en_etapa integer, p_pagado numeric, p_metodo text, p_lineas jsonb)
returns void language plpgsql as $$
declare
    v_items jsonb := '[]'::jsonb;
    v_total numeric := 0;
    l       jsonb;
    k       public.catalog;
    v_cre   bigint := extract(epoch from now() - make_interval(mins => p_hace))::bigint;
begin
    for l in select * from jsonb_array_elements(p_lineas) loop
        select * into k from public.catalog where company_id = 'tienda-prueba' and id = l->>0;
        v_items := v_items || jsonb_build_array(jsonb_build_object('name', k.name, 'price', k.price, 'quantity', (l->>1)::int, 'catalog_item_id', k.id));
        v_total := v_total + k.price * (l->>1)::int;
    end loop;
    insert into public.orders (id, company_id, lead_id, items, total, status, payment_method, delivery_address, delivery_option,
                               created_at, pagado_por, cumplido_por, discount, nota, pagara_con, etapa, etapa_at)
    values (p_id, 'tienda-prueba', 'seed-tp-l' || p_lead, v_items::text, v_total, p_status, p_metodo, p_dir, p_entrega,
            v_cre, case when p_status in ('paid', 'delivered') then 'panel' else '' end,
            case when p_status = 'delivered' then 'panel' else '' end, 0, p_nota,
            case p_metodo when 'yape' then 'Yape' when 'plin' then 'Plin' when 'cash' then 'Efectivo' else '' end,
            p_etapa, case when p_etapa = '' then null else now() - make_interval(mins => p_en_etapa) end);
    -- Lo cobrado, como pago con importe: el adelanto, o el total si ya se pagó entero.
    if p_pagado > 0 then
        insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
        values (p_id || '-p', 'seed-tp-l' || p_lead, 'tienda-prueba', least(p_pagado, v_total), 'seed-tp-' || p_id, 1, v_cre + 120, p_id, '');
    end if;
end $$;

-- Por cobrar: nuevos, sin el adelanto.
select pg_temp.pedido('seed-tp-o01', 1, 3,  'delivery', 'Av. Los Pinos 345, Los Olivos', 'Sin ají, por favor', 'pending', '', 0, 0, 'yape', '[["tp-pollo",1],["tp-chicha",1]]');
select pg_temp.pedido('seed-tp-o02', 2, 7,  'pickup',   '', '', 'pending', '', 0, 0, 'plin', '[["tp-medio",1],["tp-inca",1]]');
-- Nuevos: con el adelanto pagado; uno lleva 14 min esperando (sale en rojo).
select pg_temp.pedido('seed-tp-o03', 3, 14, 'delivery', 'Jr. Grau 120, Comas', 'Tocar el timbre dos veces', 'pending', '', 0, 10, 'yape', '[["tp-mostrito",2],["tp-inca",1]]');
select pg_temp.pedido('seed-tp-o04', 4, 4,  'pickup',   '', '', 'pending', '', 0, 10, 'yape', '[["tp-cuarto",1]]');
-- Preparando: uno con adelanto, otro pagado entero.
select pg_temp.pedido('seed-tp-o05', 5, 25, 'delivery', 'Calle Las Gardenias 80, Surco', '', 'pending', 'preparando', 12, 10, 'plin', '[["tp-alitas",1],["tp-chicha",1],["tp-helado",2]]');
select pg_temp.pedido('seed-tp-o06', 6, 30, 'pickup',   '', 'Para llevar, con cubiertos', 'paid', 'preparando', 18, 999, 'yape', '[["tp-pollo",1],["tp-medio",1],["tp-inca",2]]');
-- Listos: uno en camino que falta cobrar, otro para recoger y pagado.
select pg_temp.pedido('seed-tp-o07', 7, 45, 'delivery', 'Av. Túpac Amaru 2200, Independencia', '', 'pending', 'listo', 6, 10, 'cash', '[["tp-medio",2],["tp-chicha",1]]');
select pg_temp.pedido('seed-tp-o08', 8, 40, 'pickup',   '', '', 'paid', 'listo', 3, 999, 'plin', '[["tp-mostrito",1],["tp-helado",1]]');
-- Entregados hoy: uno cobrado; otro entregado y aún con el resto por cobrar.
select pg_temp.pedido('seed-tp-o09', 9, 90, 'delivery', 'Psje. Los Alisos 15, San Martín de Porres', '', 'delivered', 'entregado', 40, 999, 'yape', '[["tp-pollo",1]]');
select pg_temp.pedido('seed-tp-o10', 10, 75, 'pickup',  '', '', 'pending', 'entregado', 20, 10, 'cash', '[["tp-alitas",2]]');
-- Días anteriores, ya entregados y cobrados: para el historial y la Caja.
select pg_temp.pedido('seed-tp-o' || (10 + d), 1 + d % 10, d * 1440 + 120, 'delivery', 'Av. Los Pinos 345, Los Olivos', '', 'delivered', 'entregado', d * 1440, 999, 'yape', '[["tp-medio",1],["tp-inca",1]]')
  from generate_series(1, 6) d;

do $$
declare t record;
begin
    for t in select c.relname, g.tgname from pg_trigger g
               join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and g.tgname in ('avisos_cita', 'avisos_pedido', 'avisos_pago') loop
        execute format('alter table public.%I enable trigger %I', t.relname, t.tgname);
    end loop;
end $$;

commit;

-- Comprobación: una fila, con 8 productos, 16 pedidos y el adelanto de S/ 10.
select c.id, c.business_mode,
       (select count(*) from public.catalog k where k.company_id = c.id) as productos,
       (select count(*) from public.orders o where o.company_id = c.id) as pedidos,
       (select count(*) from public.orders o where o.company_id = c.id and o.pagar_antes = 10) as con_adelanto,
       (select p.secciones -> 'cobroPedidos' from public.tu_pagina p where p.company_id = c.id) as cobro
  from public.companies c
 where c.id = 'tienda-prueba';
