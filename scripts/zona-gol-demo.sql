-- ═══════════════════════════════════════════════════════════════════════════════
-- EMPRESA DE EJEMPLO · Zona Gol, un negocio de canchas para probar y enseñar
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 5-nov-2026. Se corre entero en el editor SQL de Supabase.
-- ANTES: corre modules/tu-pagina/sql/0017_pago_de_cancha.sql y rellena lo que falta abajo (celular y titular).
--
-- Deja listo:
--   · Zona Gol como negocio de subovideodetodo@gmail.com (Alvaro, 5-nov). Esa cuenta ya existe y es dueña de
--     `vendemia`: no se crea otra ni se toca su contraseña; en el panel se cambia de negocio con el selector.
--     Para otra cuenta que aún no exista, pon su correo y una contraseña: la crea ya confirmada.
--   · 5 canchas de S/ 90 a S/ 180 según jugadores, y 2 consumos.
--   · Adelanto de S/ 40, que aparta la cancha 30 minutos. Yape y Plin al número de abajo.
--   · Página publicada en agenda.vendemias.com/zona-gol.
--   · El comprobante se sube EN LA PÁGINA y se valida solo. Sin bot y sin botones de WhatsApp: hoy no hay
--     un número propio para Zona Gol, y escribir al número compartido lo contestaría el bot de otro negocio.
--   · Dos semanas de reservas, pagos y clientes inventados, y dos en «Avísame».
--
-- Los clientes inventados llevan teléfonos 5190000…: el bot nunca les escribe de verdad
-- a esos números. Por eso no se usan otros: los recordatorios irían a gente real.
--
-- Se niega a correr si ya existe `zona-gol`. Deshacer: scripts/zona-gol-demo-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Avisos push apagados mientras se siembra: al dueño no le deben sonar 80 reservas.
do $$
declare t record;
begin
    for t in select c.relname, g.tgname
               from pg_trigger g
               join pg_class c on c.oid = g.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and g.tgname in ('avisos_cita', 'avisos_pedido', 'avisos_pago') loop
        execute format('alter table public.%I disable trigger %I', t.relname, t.tgname);
    end loop;
end $$;

do $$
declare
    -- ▼▼▼ RELLENA LO QUE FALTA ▼▼▼
    v_email     text := 'subovideodetodo@gmail.com';
    v_clave     text := '';                    -- solo si la cuenta NO existe: su contraseña, 8 caracteres o más
    v_whatsapp  text := '51000000000';         -- el celular del dueño, con 51 delante. La página no lo muestra
    v_yape      text := '51947144701';         -- el número que recibe Yape y Plin (Alvaro, 5-nov)
    v_titular   text := 'CAMBIA-ESTE-NOMBRE';  -- a nombre de quién está ese Yape
    -- ▲▲▲ RELLENA LO QUE FALTA ▲▲▲

    v_id        constant text := 'zona-gol';
    v_user      uuid;
    v_hoy       date := (now() at time zone 'America/Lima')::date;
    v_ahora     text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_horario   jsonb := '{}'::jsonb;
    v_dia       text;
    v_d         integer;
    v_h         integer;
    v_m         integer;
    v_umbral    integer;
    v_turnos    integer;
    v_fecha     date;
    v_ini       text;
    v_fin       text;
    v_total     numeric;
    v_ap        text;
    v_lead      text;
    v_creada    bigint;
    v_jugada    boolean;
    v_completa  boolean;
    v_clientes  constant text[] := array['Los Cracks FC', 'Carlos Medina', 'Pichanga del jueves', 'Oficina Sur', 'Renzo Salas',
        'Real Barrio', 'Lucía Paredes', 'Amigos de la U', 'Deportivo Lince', 'Marco Quispe', 'Los Veteranos', 'Ana Torres',
        'Colegio San Martín', 'Jorge Huamán'];
    c           record;
    i           integer;
begin
    select id into v_user from auth.users where lower(email) = lower(v_email);
    if v_user is null and length(coalesce(v_clave, '')) < 8 then
        raise exception 'La cuenta % no existe: pon en v_clave una contraseña de 8 caracteres o más para crearla.', v_email;
    end if;
    if v_whatsapp !~ '^51\d{9}$' or v_whatsapp = '51000000000' then
        raise exception 'Pon el celular del dueño en v_whatsapp, con 51 delante.';
    end if;
    if v_yape !~ '^51\d{9}$' or v_yape = '51000000000' then
        raise exception 'Pon el número de Yape y Plin en v_yape, con 51 delante.';
    end if;
    if v_titular = 'CAMBIA-ESTE-NOMBRE' or btrim(v_titular) = '' then
        raise exception 'Pon a nombre de quién está el Yape en v_titular.';
    end if;
    if exists (select 1 from public.companies where id = v_id) or exists (select 1 from public.tu_pagina where slug = v_id) then
        raise exception 'Ya existe zona-gol. Si quieres empezar de cero, corre antes scripts/zona-gol-demo-deshacer.sql.';
    end if;

    -- ── 1 · La cuenta del dueño: solo se crea si no existe ──────────────────────
    if v_user is null then
        v_user := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión.
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', lower(v_email),
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"Dueño Zona Gol"}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text,
                jsonb_build_object('sub', v_user::text, 'email', lower(v_email), 'email_verified', true),
                'email', now(), now(), now());
    end if;

    -- ── 2 · El negocio ──────────────────────────────────────────────────────────
    foreach v_dia in array array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] loop
        -- capacity = número de canchas. Las canchas se ocupan por separado; esto es para el bot,
        -- que al confirmar un pago todavía cuenta el aforo general.
        v_horario := v_horario || jsonb_build_object(v_dia, jsonb_build_object('open', '08:00', 'close', '23:00', 'closed', false, 'slot_minutes', 60, 'capacity', 5));
    end loop;

    insert into public.companies (id, name, bot_name, bot_tone, owner_phone, whatsapp_phone, plan, business_mode, slot_minutes, schedule,
                                  payment_methods, require_payment_to_confirm, verify_vouchers, location, business_description,
                                  custom_rules, reminder_config, request_location, proactive_venue)
    values (v_id, 'Zona Gol', 'Mia', 'cercano y directo', v_whatsapp, v_whatsapp, 'best_seller', 'appointment', 60, v_horario::text,
            jsonb_build_array(jsonb_build_object('type', 'yape', 'number', v_yape, 'name', v_titular),
                              jsonb_build_object('type', 'plin', 'number', v_yape, 'name', v_titular))::text,
            1, 1, 'Miraflores, Lima',
            'Alquiler de canchas de fútbol por hora: 5 vs 5, 6 vs 6, 7 vs 7 y 9 vs 9. Abierto todos los días de 08:00 a 23:00.',
            'Las reservas se hacen SOLO en el enlace agenda.vendemias.com/zona-gol: ahí se ve qué cancha está libre. No agendes por chat: si piden reservar, pásales ese enlace. Si te escriben «quiero confirmar mi reserva» con un código (R-XXXX): esa cancha está apartada 30 minutos, todavía sin confirmar. Dile que para confirmarla pague S/ 40 de adelanto, NUNCA el total, pásale el Yape o Plin y pídele la captura. El resto se paga en la cancha. Solo está confirmada cuando te llegue un veredicto de COMPROBANTE VÁLIDO.',
            '{"lead_hours_min":1,"lead_hours_max":3}', 0, 1);

    insert into public.memberships (id, auth_user_id, company_id, role)
    values ('m-' || gen_random_uuid(), v_user::text, v_id, 'owner');

    -- Nace en la nube. Sin esto, la página respondería «ya no recibe reservas en línea».
    insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube)
    values (v_id, true, true)
    on conflict (company_id) do update set config_en_nube = true, agenda_en_nube = true;

    -- ── 3 · Canchas y consumos ──────────────────────────────────────────────────
    insert into public.catalog (id, company_id, name, description, price, duration_minutes, is_active, sort_order, familia, tipo, capacity) values
        ('zg-norte',     v_id, 'Cancha Norte',     '10 jugadores, grass sintético', 90,  60, 1, 1, '5 vs 5', '', 1),
        ('zg-central',   v_id, 'Cancha Central',   '12 jugadores, grass sintético', 110, 60, 1, 2, '6 vs 6', '', 1),
        ('zg-principal', v_id, 'Cancha Principal', '14 jugadores, grass sintético', 140, 60, 1, 3, '7 vs 7', '', 1),
        ('zg-anexo',     v_id, 'Cancha Anexo',     '14 jugadores, grass sintético', 140, 60, 1, 4, '7 vs 7', '', 1),
        ('zg-grande',    v_id, 'Cancha Grande',    '18 jugadores, grass sintético', 180, 60, 1, 5, '9 vs 9', '', 1);
    insert into public.catalog (id, company_id, name, price, is_active, sort_order, tipo, stock) values
        ('zg-gaseosa', v_id, 'Gaseosa',           5,  1, 6, 'producto', 24),
        ('zg-pelota',  v_id, 'Alquiler de pelota', 10, 1, 7, 'producto', 6);

    -- ── 4 · La página ───────────────────────────────────────────────────────────
    insert into public.tu_pagina (company_id, slug, titulo, frase, whatsapp, plantilla, color, publicada, secciones)
    values (v_id, v_id, 'Zona Gol', 'Tu partido empieza aquí. Canchas listas para jugar con tu equipo.', v_whatsapp, 'canchas', '#183D2B', true,
            jsonb_build_object('reservar', true, 'catalogo', false, 'envios', false,
                'apariencia', jsonb_build_object('plantillaActiva', true, 'fotoPlantilla', 'canchas', 'mostrarWhatsapp', false),
                'canchas', jsonb_build_object('activo', true, 'desde', '18:00', 'finde', false, 'noche', '{}'::jsonb, 'plazo', 30, 'adelanto', 40, 'comprobante', 'pagina', 'validacion', 'automatica')));

    -- ── 5 · Clientes inventados ─────────────────────────────────────────────────
    for i in 1 .. array_length(v_clientes, 1) loop
        insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
        values ('seed-zg-l' || i, v_id, '5190000' || lpad(i::text, 4, '0'), v_clientes[i], 'inquiry', 'exploring',
                extract(epoch from now() - interval '20 days')::bigint, 0, 'web', extract(epoch from now() - interval '1 day')::bigint);
    end loop;

    -- ── 6 · Reservas: la semana pasada, hoy y la que viene ──────────────────────
    -- Sin azar: hashtext da lo mismo para la misma cancha, día y hora. Cada cancha avanza
    -- hora a hora y salta lo que ya reservó: no puede pisarse a sí misma.
    for c in select id, name, price from public.catalog where company_id = v_id and tipo = '' order by sort_order loop
        for v_d in -7 .. 7 loop
            v_fecha := v_hoy + v_d;
            v_h := 8;
            while v_h < 23 loop
                v_m := abs(hashtext(c.id || ':' || v_d || ':' || v_h)) % 100;
                v_umbral := case when v_h >= 18 then 45 when v_h >= 12 then 18 else 10 end
                          + case when extract(isodow from v_fecha) >= 6 then 10 else 0 end;
                if v_m >= v_umbral then
                    v_h := v_h + 1;
                    continue;
                end if;
                v_turnos := case when v_m % 3 = 0 and v_h < 22 then 2 else 1 end;
                v_ini := to_char(v_fecha, 'YYYY-MM-DD') || ' ' || lpad(v_h::text, 2, '0') || ':00';
                v_fin := to_char(v_fecha, 'YYYY-MM-DD') || ' ' || lpad((v_h + v_turnos)::text, 2, '0') || ':00';
                v_total := c.price * v_turnos;
                v_ap := 'seed-zg-a-' || c.id || '-' || (v_d + 7) || '-' || v_h;
                v_lead := 'seed-zg-l' || (1 + v_m % array_length(v_clientes, 1));
                v_jugada := v_fin <= v_ahora;
                v_completa := v_m % 5 = 0;           -- una de cada cinco se pagó entera por adelantado
                v_creada := extract(epoch from (v_fecha - 2)::timestamp at time zone 'America/Lima')::bigint;

                insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                                 created_at, pagado_por, cumplido_por, metodo_pago, beneficiario)
                values (v_ap, v_id, v_lead, c.name, v_ini, v_fin, 60 * v_turnos, '',
                        case when v_jugada then 'completed' else 'confirmed' end, v_creada,
                        case when v_jugada then 'panel' when v_completa then 'voucher' else '' end,
                        case when v_jugada then 'panel' else '' end,
                        case when v_m % 2 = 0 then 'yape' else 'plin' end, '');
                insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
                values (v_ap || '-s', v_ap, v_id, c.id, c.name, v_total, 60 * v_turnos, 0);

                -- El adelanto, el día que se reservó; el resto, al jugar.
                insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
                values (v_ap || '-p1', v_lead, v_id, case when v_completa then v_total else 40 end, 'seed-' || v_ap || '-1', 1, v_creada + 600, '', v_ap);
                if v_jugada and not v_completa then
                    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
                    values (v_ap || '-p2', v_lead, v_id, v_total - 40, 'seed-' || v_ap || '-2', 1,
                            extract(epoch from (v_fin || ':00')::timestamp at time zone 'America/Lima')::bigint, '', v_ap);
                end if;

                v_h := v_h + v_turnos;
            end loop;
        end loop;
    end loop;

    -- ── 7 · Dos en lista de espera, en la primera hora ocupada de mañana por la noche ─
    insert into public.pagina_avisame (company_id, catalog_id, slot_start, nombre, telefono)
    select v_id, s.catalog_item_id, a.slot_start, n.nombre, n.telefono
      from (select a.id, a.slot_start from public.appointments a
             where a.company_id = v_id and a.slot_start >= to_char(v_hoy + 1, 'YYYY-MM-DD') || ' 18:00' order by a.slot_start limit 1) a
      join public.appointment_services s on s.appointment_id = a.id
      join lateral (select 'Pedro Rojas' as nombre, '51900000901' as telefono union all select 'Sofía Vega', '51900000902') n on true;

    raise notice 'Listo: entra en el panel con % y abre agenda.vendemias.com/zona-gol', v_email;
end $$;

-- Avisos encendidos otra vez.
do $$
declare t record;
begin
    for t in select c.relname, g.tgname
               from pg_trigger g
               join pg_class c on c.oid = g.tgrelid
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and g.tgname in ('avisos_cita', 'avisos_pedido', 'avisos_pago') loop
        execute format('alter table public.%I enable trigger %I', t.relname, t.tgname);
    end loop;
end $$;

commit;

-- Comprobación: una fila, con 7 ítems de catálogo y decenas de reservas.
select c.id, c.require_payment_to_confirm as pide_pago, c.payment_methods,
       (select count(*) from public.catalog k where k.company_id = c.id) as catalogo,
       (select count(*) from public.appointments a where a.company_id = c.id) as reservas,
       (select count(*) from public.pagina_avisame v where v.company_id = c.id) as avisame,
       (select p.secciones -> 'canchas' from public.tu_pagina p where p.company_id = c.id) as canchas
  from public.companies c
 where c.id = 'zona-gol';
