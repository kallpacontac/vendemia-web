-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTA · The 24/7 Barber Shop (Iquitos), cliente real. Pedido por Alvaro el 14-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ANTES, dos cosas (el script se niega a correr si falta alguna):
--   1. modules/tu-pagina/sql/0021_adelanto_de_citas.sql corrida (adelanto en % y comprobante en
--      la página para citas).
--   2. Nada más: si la cuenta ruizruizalexander04@gmail.com no existe, la crea aquí (correo y
--      contraseña de v_clave, ya confirmada), igual que kallpa-todo-en-uno.sql. Si existe, no la toca.
--      Podrá entrar con esa contraseña o con «Continuar con Google» (mismo Gmail).
--
-- Lo que deja, en una sola transacción (si algo falla no queda nada a medias):
--   · Negocio `the247barbershop`, de citas, en la nube, de la cuenta del cliente (dueño) y la de
--     soporte (kallpa.contacto.peru@gmail.com) como administrador.
--   · Horario: todos los días de 9:00 a 21:00, turnos de 30 min, 5 sillas a la vez (aforo).
--     Sin barberos: todavía no sabemos nombres ni sede. La página no pide elegir barbero.
--   · Dos sedes en la misma agenda: Jr. Huallaga 625 (The 24/7 Barber Shop) y Jr. Huallaga 646
--     (24/7 Premium). Salen en la dirección y como dos sucursales de la tarjeta de puntos.
--   · CATÁLOGO con PRECIOS DE REFERENCIA, POR CONFIRMAR con el dueño. Base: su promo de Halloween
--     (corte+barba S/25, corte+cejas S/20, corte+raya S/20, perfilado S/10) como precio rebajado.
--     Se cambian en Panel → Catálogo. Fotos: las suyas (public/assets/the247/).
--   · Página agenda.vendemias.com/the247barbershop, plantilla Luxury, publicada, con su logo y
--     fotos, y la tarjeta de puntos.
--   · ADELANTO del 50 % para separar (su regla de «Reservas»): la cita queda apartada, el cliente
--     yapea al 914 440 860 y SUBE LA CAPTURA en la página (obligatoria para confirmar). Validación
--     A MANO, sin IA: el dueño la aprueba en Agenda → «Comprobantes por revisar».
--     Tolerancia de 5 minutos: va en la descripción; no hay regla automática para eso.
--   · FIDELIZA «Club 24/7»: 6 cortes = 1 corte clásico gratis. Publicado, sin tarjetas de prueba.
--     Alta pública: fideliza.vendemias.com/n/the247barbershop/unirse
--
-- No crea clientes, citas, pagos ni gastos: es un negocio real.
-- Deshacer: scripts/the247-alta-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    -- ▼▼▼ REVISA ▼▼▼
    v_email     text := 'ruizruizalexander04@gmail.com';
    v_clave     text := 'peru123456';                   -- solo si hay que crear la cuenta. Que la cambie luego
    v_soporte   text := 'kallpa.contacto.peru@gmail.com'; -- cuenta de soporte, como administrador. '' = sin acceso
    v_whatsapp  text := '51914440860';                  -- el de su post «Reservas»
    v_yape      text := '51914440860';                  -- ¡CONFIRMA que su Yape es este número!
    v_titular   text := '';                             -- a nombre de quién está el Yape ('' = no se muestra)
    -- ▲▲▲ REVISA ▲▲▲

    v_id        constant text := 'the247barbershop';
    v_nombre    constant text := 'The 24/7 Barber Shop';
    v_assets    constant text := 'https://vendemias.com/assets/the247/';
    v_cliente   uuid;
    v_admin     uuid;
    v_horario   jsonb := '{}'::jsonb;
    v_dia       text;
    v_prog      uuid;
    v_otros     text;
begin
    -- ── Comprobaciones ──────────────────────────────────────────────────────────
    if to_regprocedure('public.v2_citas_cfg(text)') is null then
        raise exception 'Falta la 0021: corre antes modules/tu-pagina/sql/0021_adelanto_de_citas.sql.';
    end if;
    select id into v_cliente from auth.users where lower(email) = lower(btrim(v_email));
    if v_whatsapp !~ '^51\d{9}$' or v_yape !~ '^51\d{9}$' then raise exception 'WhatsApp y Yape van con 51 delante y 9 cifras.'; end if;
    if v_yape = '51947144701' then raise exception 'v_yape es tu número. Pon el del cliente.'; end if;
    if exists (select 1 from public.companies where id = v_id) then
        raise exception 'Ya existe el negocio %. Para empezar de cero: scripts/the247-alta-deshacer.sql.', v_id;
    end if;
    if exists (select 1 from public.tu_pagina where slug = v_id) or exists (select 1 from public.loyalty_settings where slug = v_id) then
        raise exception 'La dirección % ya la usa otro negocio (página o Fideliza). No se toca nada.', v_id;
    end if;
    if btrim(v_soporte) <> '' then
        select id into v_admin from auth.users where lower(email) = lower(btrim(v_soporte));
        if v_admin is null then raise exception 'No hay cuenta con el correo de soporte «%». Déjalo en blanco o corrígelo.', v_soporte; end if;
        if v_admin = v_cliente then v_admin := null; end if;
    end if;

    -- ── 0 · La cuenta del cliente (como en kallpa-todo-en-uno.sql) ──────────────
    if v_cliente is null then
        if length(v_clave) < 8 then raise exception 'No hay cuenta con «%». Pon una contraseña de 8+ caracteres en v_clave.', v_email; end if;
        v_cliente := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión.
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_cliente, 'authenticated', 'authenticated', lower(btrim(v_email)),
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_cliente, v_cliente::text,
                jsonb_build_object('sub', v_cliente::text, 'email', lower(btrim(v_email)), 'email_verified', true),
                'email', now(), now(), now());
        raise notice 'Cuenta creada: % (contraseña de v_clave).', v_email;
    end if;

    -- ── 1 · El negocio ──────────────────────────────────────────────────────────
    foreach v_dia in array array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] loop
        v_horario := v_horario || jsonb_build_object(v_dia, jsonb_build_object('open', '09:00', 'close', '21:00', 'closed', false, 'slot_minutes', 30, 'capacity', 5));
    end loop;

    insert into public.companies (id, name, bot_name, bot_tone, owner_phone, whatsapp_phone, plan, business_mode, slot_minutes, schedule,
                                  payment_methods, require_payment_to_confirm, verify_vouchers, location, business_description,
                                  custom_rules, reminder_config, request_location, proactive_venue, ask_employee)
    values (v_id, v_nombre, 'Mia', 'cercano y con onda', v_whatsapp, v_whatsapp, 'best_seller', 'appointment', 30, v_horario::text,
            jsonb_build_array(jsonb_build_object('type', 'yape', 'number', v_yape, 'name', v_titular))::text,
            1, 0,
            'Jr. Huallaga 625 (The 24/7 Barber Shop) y Jr. Huallaga 646 (24/7 Premium), Iquitos',
            'Barbería en Iquitos con dos sedes en Jr. Huallaga: The 24/7 Barber Shop (n.º 625) y 24/7 Barber Shop Premium (n.º 646). Cortes, degradados, barba, cejas, diseños y cortes para niños. Todos los días de 9:00 a 21:00.',
            'Las citas se separan en agenda.vendemias.com/the247barbershop. Términos de reserva: 50 % de adelanto obligatorio por Yape, y la captura se sube en la misma página. Tolerancia máxima de 5 minutos: pasado ese tiempo la cita se reprograma sin excepción.',
            '{"lead_hours_min":2,"lead_hours_max":24}', 0, 1, 0);

    -- Nace en la nube: sin esto la página diría «ya no recibe reservas en línea».
    insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube)
    values (v_id, true, true)
    on conflict (company_id) do update set config_en_nube = true, agenda_en_nube = true;

    -- ── 2 · Accesos ─────────────────────────────────────────────────────────────
    insert into public.memberships (id, auth_user_id, company_id, role)
    values ('m-' || gen_random_uuid(), v_cliente::text, v_id, 'owner');
    if v_admin is not null then
        insert into public.memberships (id, auth_user_id, company_id, role)
        values ('m-' || gen_random_uuid(), v_admin::text, v_id, 'admin');
    end if;

    -- ── 3 · Catálogo (PRECIOS DE REFERENCIA, POR CONFIRMAR) ────────────────────
    -- Los cuatro primeros salen en la portada Luxury.
    insert into public.catalog (id, company_id, name, description, price, duration_minutes, is_active, sort_order, familia, tipo) values
        ('t247-corte',        v_id, 'Corte clásico',        'Degradado, taper o el corte que quieras, con acabado a navaja.',      20, 30, 1, 1, 'Cortes', ''),
        ('t247-corte-barba',  v_id, 'Corte + barba',        'Corte completo y barba perfilada con toalla caliente.',               30, 60, 1, 2, 'Combos', ''),
        ('t247-corte-cejas',  v_id, 'Corte + cejas',        'Corte completo y perfilado de cejas.',                                23, 30, 1, 3, 'Combos', ''),
        ('t247-corte-raya',   v_id, 'Corte + raya',         'Corte completo con raya o línea marcada a navaja.',                   23, 30, 1, 4, 'Combos', ''),
        ('t247-corte-diseno', v_id, 'Corte con diseño',     'Corte con diseño o freestyle a tu gusto.',                            28, 60, 1, 5, 'Cortes', ''),
        ('t247-corte-nino',   v_id, 'Corte niño',           'Para los más pequeños, con paciencia y buen acabado.',                15, 30, 1, 6, 'Cortes', ''),
        ('t247-perfilado',    v_id, 'Perfilado de barba',   'Contorno y líneas de la barba a navaja.',                             12, 30, 1, 7, 'Barba', ''),
        ('t247-barba',        v_id, 'Arreglo de barba',     'Rebaje, perfilado y toalla caliente.',                                15, 30, 1, 8, 'Barba', '');

    insert into public.catalog_media (id, company_id, catalog_id, product_name, url, media_type, sort_order, is_primary)
    select 't247-m-' || k.id, v_id, k.id, k.name, v_assets || f.archivo, 'image', 0, 1
      from public.catalog k
      join (values ('t247-corte', 'corte.webp'), ('t247-corte-barba', 'corte-barba.webp'), ('t247-corte-cejas', 'corte-cejas.webp'),
                   ('t247-corte-raya', 'corte-raya.webp'), ('t247-corte-diseno', 'corte-diseno.webp'), ('t247-corte-nino', 'corte-nino.webp'),
                   ('t247-perfilado', 'perfilado.webp'), ('t247-barba', 'arreglo-barba.webp')) as f(id, archivo) on f.id = k.id
     where k.company_id = v_id;

    -- ── 4 · La página ───────────────────────────────────────────────────────────
    insert into public.tu_pagina (company_id, slug, titulo, frase, whatsapp, plantilla, color, logo_url, portada_url, publicada, secciones)
    values (v_id, v_id, v_nombre, 'Dos sedes en Jr. Huallaga, Iquitos. Separa tu cita en línea, todos los días de 9:00 a 21:00.',
            v_whatsapp, 'luxury', '#D0AB75', v_assets || 'logo.webp', v_assets || 'portada.webp', true,
            jsonb_build_object('reservar', true, 'catalogo', false, 'envios', false,
                'citas', jsonb_build_object('adelanto', 50, 'comprobante', 'pagina', 'validacion', 'manual'),
                'fideliza', jsonb_build_object('activo', true, 'slug', v_id),
                'apariencia', jsonb_build_object('plantillaActiva', true, 'fotoPlantilla', 'barberia', 'mostrarWhatsapp', true,
                    'mostrarHorario', true, 'vistaServiciosLuxury', 'vertical',
                    'tituloBanner', 'Tu estilo, a toda hora',
                    'portadaLuxurySecundaria', v_assets || 'portada-2.webp')));

    -- ── 5 · Fideliza: «Club 24/7» ───────────────────────────────────────────────
    -- Con las mismas funciones que usa el panel, actuando como el dueño: pasan sus comprobaciones.
    perform set_config('request.jwt.claim.sub', v_cliente::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_cliente::text, 'role', 'authenticated')::text, true);

    perform public.loyalty_settings_save(v_id, jsonb_build_object(
        'slug', v_id, 'display_name', v_nombre, 'tagline', 'Cada corte suma', 'bg_color', '#111111',
        'logo_url', v_assets || 'logo-660.png'));
    perform public.loyalty_page_style_save(v_id, jsonb_build_object('plantilla', 'oscura', 'sello', 'tijera', 'tarjeta', 'nocturna'));
    perform public.loyalty_location_save(v_id, null, 'The 24/7 Barber Shop · Jr. Huallaga 625', true);
    perform public.loyalty_location_save(v_id, null, '24/7 Premium · Jr. Huallaga 646', true);
    v_prog := public.loyalty_program_save(v_id, null, 'Club 24/7', 'Un sello por cada corte, en cualquiera de las dos sedes. Al sexto, un corte gratis.', 'repeat',
        jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 6,
                           'reward_description', 'un corte clásico gratis'));
    perform public.loyalty_program_publish(v_id, v_prog);

    -- ── 6 · ¿Creó otro negocio al entrar? Solo se avisa ─────────────────────────
    select string_agg(m.company_id, ', ') into v_otros
      from public.memberships m where m.auth_user_id = v_cliente::text and m.company_id <> v_id;
    if v_otros is not null then
        raise notice 'Ojo: el cliente también está en: %. Si lo creó sin querer al entrar, bórralo aparte.', v_otros;
    end if;
    raise notice 'Listo: agenda.vendemias.com/% · fideliza.vendemias.com/n/%/unirse', v_id, v_id;
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: una fila. Espera 8 servicios con foto, adelanto 50, pide pago = 1, club activo,
-- 2 sucursales y los accesos «owner, admin».
select c.id, c.require_payment_to_confirm as pide_pago, c.payment_methods,
       (select count(*) from public.catalog k where k.company_id = c.id) as servicios,
       (select count(*) from public.catalog_media m where m.company_id = c.id) as fotos,
       public.v2_citas_cfg(c.id) as adelanto_citas,
       (select status from public.loyalty_programs p where p.company_id = c.id) as club,
       (select count(*) from public.loyalty_locations l where l.company_id = c.id) as sucursales,
       (select string_agg(m.role, ', ') from public.memberships m where m.company_id = c.id) as accesos
  from public.companies c
 where c.id = 'the247barbershop';
