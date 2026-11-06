-- ═══════════════════════════════════════════════════════════════════════════════
-- EMPRESA DE EJEMPLO · Mara Beauty Studio, para enseñársela a la dueña
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 6-nov-2026 («igualito que Zona Gol, pero con la plantilla de uñas»;
-- después: «genera todo el equipo, comisiones y otros apartados para mostrarlos funcionando»).
-- Se corre entero en el editor SQL de Supabase. No hay nada que rellenar.
--
-- Sacado de su volante (Jr. Pedro Donofrio 296, Breña):
--   · Servicios de uñas, pestañas, cejas, cabello y facial, con sus nombres del volante.
--     LOS PRECIOS Y DURACIONES SON INVENTADOS: el volante no trae precios. Cámbialos en el
--     panel (Catálogo) en cuanto te los diga, o antes de la demo si los sabes.
--   · Horario: lunes a sábado 10:00–20:00 y domingo 10:00–15:00 (escrito a mano en el volante).
--
-- Deja listo, para enseñarlo funcionando:
--   · Mara como negocio de subovideodetodo@gmail.com (la cuenta de Alvaro, dueña de `vendemia`
--     y de `zona-gol`): en el panel se cambia de negocio con el selector.
--   · Página publicada en agenda.vendemias.com/mara-beauty-studio con la plantilla «Estudio de uñas»,
--     eligiendo profesional, y con su tarjeta de puntos (sección «Club Mara»).
--   · EQUIPO de 4: Fiorella y Kiara (uñas, 40 %), Lucero (pestañas, cejas y facial, 45 %) y
--     Joel (cabello, 50 %). Pigmentación paga S/ 60 fijos y Balayage un 35 %: así se ve en
--     Comisiones que la regla del servicio gana a la de la persona.
--   · Dos semanas de citas, cada una con su profesional. Lo pasado: cobrado (Yape o efectivo),
--     algún «No vino» y algunas de los dos últimos días SIN MARCAR, para enseñar
--     Agenda → «Ya pasaron» → Vino / No vino, y por qué la comisión sale menor que Ingresos.
--   · CAJA: gastos de la semana (insumos, luz, un adelanto a Kiara).
--   · FICHA: notas del salón en tres clientas (alergias, preferencias).
--   · FIDELIZA: «Club Mara», 6 sellos = un esmaltado en gel gratis, publicado; 10 clientas con
--     su tarjeta y sellos (una ya ganó su premio, para enseñar el «¡Ganó!» de la Caja).
--     Se unen en fideliza.vendemias.com/n/mara-beauty-studio/unirse. La comprobación del final
--     da el enlace de la tarjeta de Valeria (la que ganó): GUÁRDALO, no se puede volver a sacar.
--
-- El WhatsApp de la página y el del dueño son el de Alvaro, no el de Mara: así nadie que pruebe
-- la página le escribe a ella sin querer. Para la demo con ella se puede cambiar en Mi página.
-- Las clientas inventadas llevan teléfonos 5190001…: nadie real recibe nada. Las tarjetas de
-- Fideliza van sin teléfono.
--
-- Incluye 0016_plantilla_unas.sql (idempotente), por si no se corrió.
-- Se niega a correr si ya existe `mara-beauty-studio` (negocio, página o Fideliza).
-- Deshacer: scripts/mara-beauty-demo-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Aquí deja el script el enlace de una tarjeta ya llena, para abrirla en la demo.
create temp table mara_demo_tarjeta (clienta text, enlace text) on commit preserve rows;

-- 0016: la plantilla «unas» tiene que estar permitida.
alter table public.tu_pagina drop constraint if exists tu_pagina_plantilla_check;
alter table public.tu_pagina add constraint tu_pagina_plantilla_check
  check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios', 'impulso', 'luxury', 'restaurante', 'canchas', 'mesa', 'unas'));

-- Avisos push apagados mientras se siembra: al dueño no le deben sonar cien citas.
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
    v_email     constant text := 'subovideodetodo@gmail.com';
    v_whatsapp  constant text := '51947144701';   -- Alvaro (el de Zona Gol). El de Mara es 51970480603
    v_id        constant text := 'mara-beauty-studio';
    v_user      uuid;
    v_hoy       date := (now() at time zone 'America/Lima')::date;
    v_ahora     text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_horario   jsonb := '{}'::jsonb;
    v_dia       text;
    v_d         integer;
    v_p         integer;
    v_t         integer;    -- minutos desde medianoche
    v_cierre    integer;
    v_m         integer;
    v_umbral    integer;
    v_k         integer;
    v_dur       integer;
    v_fecha     date;
    v_ini       text;
    v_fin       text;
    v_ap        text;
    v_lead      text;
    v_creada    bigint;
    v_hecha     boolean;
    v_estado    text;
    v_ids       text[];
    v_nombres   text[];
    v_precios   numeric[];
    v_duras     integer[];
    -- El equipo. Cada una atiende lo suyo: índices (sort_order) de los servicios que hace.
    v_emp_ids   constant text[] := array['mb-e-fiorella', 'mb-e-kiara', 'mb-e-lucero', 'mb-e-joel'];
    v_emp_nom   constant text[] := array['Fiorella', 'Kiara', 'Lucero', 'Joel'];
    v_emp_pct   constant integer[] := array[40, 40, 45, 50];
    v_hace      integer[];
    v_clientes  constant text[] := array['Valeria Ríos', 'Camila Flores', 'Andrea Mendoza', 'Rosa Huamán', 'Daniela Castro',
        'Milagros Quispe', 'Fiorella Vargas', 'Sandra Chávez', 'Lucía Paredes', 'Karen Rojas', 'Jimena Salazar', 'Patricia León',
        'Nicole Gutiérrez', 'Mariela Torres', 'Ximena Delgado', 'Gabriela Ramos'];
    -- Fideliza: sellos de las 10 primeras clientas. La primera llega a 6 y gana.
    v_sellos    constant integer[] := array[6, 5, 4, 4, 3, 3, 2, 2, 1, 1];
    v_prog      uuid;
    v_alta      jsonb;
    v_miembro   uuid;
    i           integer;
    j           integer;
begin
    select id into v_user from auth.users where lower(email) = lower(v_email);
    if v_user is null then
        raise exception 'No existe la cuenta %. Entra una vez en el panel con ella y vuelve a correr esto.', v_email;
    end if;
    if exists (select 1 from public.companies where id = v_id) or exists (select 1 from public.tu_pagina where slug = v_id)
       or exists (select 1 from public.loyalty_settings where slug = v_id) then
        raise exception 'Ya existe %. Si quieres empezar de cero, corre antes scripts/mara-beauty-demo-deshacer.sql.', v_id;
    end if;

    -- ── 1 · El negocio ──────────────────────────────────────────────────────────
    foreach v_dia in array array['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] loop
        v_horario := v_horario || jsonb_build_object(v_dia, jsonb_build_object('open', '10:00', 'close', '20:00', 'closed', false, 'slot_minutes', 30, 'capacity', 4));
    end loop;
    v_horario := v_horario || jsonb_build_object('sunday', jsonb_build_object('open', '10:00', 'close', '15:00', 'closed', false, 'slot_minutes', 30, 'capacity', 4));

    insert into public.companies (id, name, bot_name, bot_tone, owner_phone, whatsapp_phone, plan, business_mode, slot_minutes, schedule,
                                  payment_methods, require_payment_to_confirm, verify_vouchers, location, business_description,
                                  custom_rules, reminder_config, request_location, proactive_venue, ask_employee)
    values (v_id, 'Mara Beauty Studio', 'Mia', 'cálido y cercano', v_whatsapp, v_whatsapp, 'best_seller', 'appointment', 30, v_horario::text,
            '[]', 0, 0, 'Jr. Pedro Donofrio 296, Breña',
            'Estudio de belleza en Breña: uñas (gel, rubber, builder, acrílicas, polygel, soft gel, esculpidas; todas con manicure rusa), pedicure, pestañas, cejas, cabello y belleza facial. Lunes a sábado de 10:00 a 20:00 y domingo de 10:00 a 15:00.',
            'Las citas se reservan en el enlace agenda.vendemias.com/mara-beauty-studio: ahí se ve qué horas están libres y con quién. Si piden reservar, pásales ese enlace. Uñas: Fiorella y Kiara. Pestañas, cejas y facial: Lucero. Cabello: Joel.',
            '{"lead_hours_min":2,"lead_hours_max":24}', 0, 1, 1);

    insert into public.memberships (id, auth_user_id, company_id, role)
    values ('m-' || gen_random_uuid(), v_user::text, v_id, 'owner');

    -- Nace en la nube. Sin esto, la página respondería «ya no recibe reservas en línea».
    insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube)
    values (v_id, true, true)
    on conflict (company_id) do update set config_en_nube = true, agenda_en_nube = true;

    -- ── 2 · Servicios (nombres del volante; precios y duraciones INVENTADOS) ───
    -- Uñas primero: la portada de la plantilla enseña los cuatro primeros.
    insert into public.catalog (id, company_id, name, description, price, duration_minutes, is_active, sort_order, familia, tipo) values
        ('mb-gel',          v_id, 'Esmaltado en gel',      'Incluye manicure rusa.',                         35,  60, 1,  1, 'Uñas', ''),
        ('mb-acrilicas',    v_id, 'Uñas acrílicas',        'Incluye manicure rusa.',                         70, 120, 1,  2, 'Uñas', ''),
        ('mb-polygel',      v_id, 'Polygel',               'Incluye manicure rusa.',                         65, 105, 1,  3, 'Uñas', ''),
        ('mb-pedicure',     v_id, 'Pedicure',              'Limpieza, cutícula y esmaltado.',                40,  60, 1,  4, 'Uñas', ''),
        ('mb-rubber',       v_id, 'Rubber',                'Base rubber. Incluye manicure rusa.',            45,  75, 1,  5, 'Uñas', ''),
        ('mb-builder',      v_id, 'Builder',               'Nivelación con builder gel. Incluye manicure rusa.', 55, 90, 1, 6, 'Uñas', ''),
        ('mb-softgel',      v_id, 'Soft gel',              'Tips de soft gel. Incluye manicure rusa.',       60,  90, 1,  7, 'Uñas', ''),
        ('mb-esculpidas',   v_id, 'Uñas esculpidas',       'Incluye manicure rusa.',                         80, 120, 1,  8, 'Uñas', ''),
        ('mb-extensiones',  v_id, 'Extensiones de pestañas', 'Volumen a tu medida.',                         90, 120, 1,  9, 'Pestañas', ''),
        ('mb-1x1',          v_id, 'Pestañas 1x1',          'Pelo a pelo, efecto natural.',                  120, 150, 1, 10, 'Pestañas', ''),
        ('mb-lifting',      v_id, 'Lifting de pestañas',   'Curvatura y tinte.',                             60,  60, 1, 11, 'Pestañas', ''),
        ('mb-rizado',       v_id, 'Rizado de pestañas',    '',                                               35,  45, 1, 12, 'Pestañas', ''),
        ('mb-pigmentacion', v_id, 'Pigmentación de cejas', '',                                              180, 120, 1, 13, 'Cejas', ''),
        ('mb-visajismo',    v_id, 'Visajismo',             'Diseño de cejas según tu rostro.',               40,  45, 1, 14, 'Cejas', ''),
        ('mb-hilo',         v_id, 'Depilación con hilo',   '',                                               20,  30, 1, 15, 'Cejas', ''),
        ('mb-depilacion',   v_id, 'Depilación de cejas',   '',                                               15,  30, 1, 16, 'Cejas', ''),
        ('mb-corte-dama',   v_id, 'Corte damas',           '',                                               35,  45, 1, 17, 'Cabello', ''),
        ('mb-corte-cab',    v_id, 'Corte caballeros',      '',                                               20,  30, 1, 18, 'Cabello', ''),
        ('mb-tinte',        v_id, 'Tinte',                 '',                                               90, 120, 1, 19, 'Cabello', ''),
        ('mb-mechas',       v_id, 'Mechas',                '',                                              150, 180, 1, 20, 'Cabello', ''),
        ('mb-balayage',     v_id, 'Balayage',              '',                                              250, 240, 1, 21, 'Cabello', ''),
        ('mb-planchado',    v_id, 'Planchado',             '',                                               30,  45, 1, 22, 'Cabello', ''),
        ('mb-cepillado',    v_id, 'Cepillado',             '',                                               30,  45, 1, 23, 'Cabello', ''),
        ('mb-ondas',        v_id, 'Ondas',                 '',                                               35,  45, 1, 24, 'Cabello', ''),
        ('mb-tratamiento',  v_id, 'Tratamiento capilar',   '',                                               60,  60, 1, 25, 'Cabello', ''),
        ('mb-botox',        v_id, 'Botox capilar',         '',                                              120, 120, 1, 26, 'Cabello', ''),
        ('mb-hidratacion',  v_id, 'Hidratación profunda',  '',                                               50,  60, 1, 27, 'Cabello', ''),
        ('mb-alisado',      v_id, 'Alisado',               '',                                              180, 180, 1, 28, 'Cabello', ''),
        ('mb-facial',       v_id, 'Limpieza facial',       'Limpieza profunda e hidratación.',               70,  60, 1, 29, 'Belleza facial', '');

    -- Reglas de comisión por servicio: el fijo gana al %, y las dos ganan a la de la persona.
    update public.catalog set comision_monto = 60 where company_id = v_id and id = 'mb-pigmentacion';
    update public.catalog set comision_pct = 35   where company_id = v_id and id = 'mb-balayage';

    -- ── 3 · El equipo ───────────────────────────────────────────────────────────
    for i in 1 .. array_length(v_emp_ids, 1) loop
        insert into public.employees (id, company_id, name, is_active, schedule, comision_pct)
        values (v_emp_ids[i], v_id, v_emp_nom[i], 1, '', v_emp_pct[i]);
    end loop;

    -- ── 4 · La página ───────────────────────────────────────────────────────────
    insert into public.tu_pagina (company_id, slug, titulo, frase, whatsapp, plantilla, color, publicada, secciones)
    values (v_id, v_id, 'Mara Beauty Studio', 'Tu belleza, nuestra esencia. Un espacio pensado para ti en Breña.', v_whatsapp, 'unas', '#8A6A5C', true,
            jsonb_build_object('reservar', true, 'catalogo', false, 'envios', false,
                'fideliza', jsonb_build_object('activo', true, 'slug', v_id),
                'apariencia', jsonb_build_object('plantillaActiva', true, 'fotoPlantilla', 'unas', 'mostrarWhatsapp', true,
                    'tituloBanner', 'Tu belleza, nuestra esencia.',
                    'promocionTexto', '20% de descuento en tu primer servicio de uñas',
                    'tituloSeccionUnas', 'Un espacio pensado para ti',
                    'textoSeccionUnas', 'Manicure, pedicure, pestañas, cejas, cabello y belleza facial en Jr. Pedro Donofrio 296, Breña. Todas nuestras uñas incluyen manicure rusa.')));

    -- ── 5 · Clientas inventadas y notas del salón ───────────────────────────────
    for i in 1 .. array_length(v_clientes, 1) loop
        insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
        values ('seed-mb-l' || i, v_id, '5190001' || lpad(i::text, 4, '0'), v_clientes[i], 'inquiry', 'exploring',
                extract(epoch from now() - interval '20 days')::bigint, 0, 'web', extract(epoch from now() - interval '1 day')::bigint);
    end loop;
    update public.leads set notas_salon = 'Alérgica al monómero del acrílico: solo gel o rubber.' where id = 'seed-mb-l1';
    update public.leads set notas_salon = 'Siempre con Lucero. Le gusta el efecto natural en pestañas.' where id = 'seed-mb-l3';
    update public.leads set notas_salon = 'Uñas cortas, tonos nude. Paga con Yape.' where id = 'seed-mb-l6';

    -- ── 6 · Citas: la semana pasada, hoy y la que viene, cada una con su profesional ─
    -- Sin azar: hashtext da lo mismo para la misma persona, día y hora. Cada profesional avanza
    -- media hora a media hora y salta lo que ya tiene: nunca se pisa a sí misma.
    select array_agg(id order by sort_order), array_agg(name order by sort_order),
           array_agg(price order by sort_order), array_agg(duration_minutes order by sort_order)
      into v_ids, v_nombres, v_precios, v_duras
      from public.catalog where company_id = v_id;

    for v_p in 1 .. array_length(v_emp_ids, 1) loop
        v_hace := case v_p when 1 then array[1, 2, 3, 4, 5, 6, 7, 8]
                           when 2 then array[1, 4, 5, 1, 7, 3, 8, 6]
                           when 3 then array[9, 10, 11, 12, 13, 14, 15, 16, 29]
                           else array[17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28] end;
        for v_d in -7 .. 7 loop
            v_fecha := v_hoy + v_d;
            v_t := 10 * 60;
            v_cierre := case when extract(isodow from v_fecha) = 7 then 15 * 60 else 20 * 60 end;
            while v_t < v_cierre loop
                v_m := abs(hashtext('mb:' || v_p || ':' || v_d || ':' || v_t)) % 100;
                v_umbral := case when v_t >= 16 * 60 then 40 when v_t >= 12 * 60 then 26 else 15 end
                          + case when extract(isodow from v_fecha) >= 6 then 12 else 0 end
                          - case when v_p = 4 then 6 else 0 end;   -- cabello, algo menos
                if v_m >= v_umbral then
                    v_t := v_t + 30;
                    continue;
                end if;
                v_k := v_hace[1 + v_m % array_length(v_hace, 1)];
                v_dur := v_duras[v_k];
                if v_t + v_dur > v_cierre then
                    v_t := v_t + 30;
                    continue;
                end if;
                v_ini := to_char(v_fecha, 'YYYY-MM-DD') || ' ' || lpad((v_t / 60)::text, 2, '0') || ':' || lpad((v_t % 60)::text, 2, '0');
                v_fin := to_char(v_fecha, 'YYYY-MM-DD') || ' ' || lpad(((v_t + v_dur) / 60)::text, 2, '0') || ':' || lpad(((v_t + v_dur) % 60)::text, 2, '0');
                v_ap := 'seed-mb-a-' || v_p || '-' || (v_d + 7) || '-' || v_t;
                v_lead := 'seed-mb-l' || (1 + (v_m * 7 + v_p) % array_length(v_clientes, 1));
                v_hecha := v_fin <= v_ahora;
                v_creada := extract(epoch from (v_fecha - 3)::timestamp at time zone 'America/Lima')::bigint;
                -- Lo pasado: casi todo atendido y cobrado; alguna no vino; y en los dos últimos
                -- días, alguna sin marcar todavía (Agenda → «Ya pasaron»).
                v_estado := case when not v_hecha then 'confirmed'
                                 when v_m % 13 = 0 then 'no_show'
                                 when v_d >= -2 and v_m % 5 = 1 then 'sin_marcar'
                                 else 'completed' end;

                insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                                 created_at, pagado_por, cumplido_por, metodo_pago, beneficiario)
                values (v_ap, v_id, v_lead, v_nombres[v_k], v_ini, v_fin, v_dur, v_emp_ids[v_p],
                        case v_estado when 'sin_marcar' then 'confirmed' else v_estado end, v_creada,
                        case when v_estado = 'completed' then 'panel' else '' end,
                        case when v_estado in ('completed', 'no_show') then 'panel' else '' end,
                        case when v_m % 2 = 0 then 'yape' else 'cash' end, '');
                insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
                values (v_ap || '-s', v_ap, v_id, v_ids[v_k], v_nombres[v_k], v_precios[v_k], v_dur, 0);

                -- Se cobra al terminar, en el local.
                if v_estado = 'completed' then
                    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, created_at, order_id, appointment_id)
                    values (v_ap || '-p', v_lead, v_id, v_precios[v_k], 'seed-' || v_ap, 1,
                            extract(epoch from (v_fin || ':00')::timestamp at time zone 'America/Lima')::bigint, '', v_ap);
                end if;

                v_t := v_t + v_dur;
            end loop;
        end loop;
    end loop;

    -- ── 7 · Caja: gastos de la semana ───────────────────────────────────────────
    insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por, created_at)
    select 'seed-mb-g' || g.n, v_id, to_char(v_hoy - g.dias, 'YYYY-MM-DD'), g.concepto, g.categoria, g.importe, v_user::text,
           extract(epoch from (v_hoy - g.dias + time '13:00')::timestamp at time zone 'America/Lima')::bigint
      from (values (1, 6, 'Esmaltes y geles', 'insumos', 180),
                   (2, 4, 'Adelanto a Kiara', 'adelanto', 100),
                   (3, 3, 'Algodón, acetona y limas', 'insumos', 65),
                   (4, 2, 'Recibo de luz', 'servicios', 140),
                   (5, 1, 'Pestañas y pegamento', 'insumos', 120),
                   (6, 0, 'Taxi para recoger insumos', 'movilidad', 15)) as g(n, dias, concepto, categoria, importe);

    -- ── 8 · Fideliza: «Club Mara» y sus primeras tarjetas ───────────────────────
    -- Con las mismas funciones que usa el panel («Crear el club en una pantalla» y la Caja),
    -- actuando como la dueña: así pasan todas sus comprobaciones.
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

    perform public.loyalty_settings_save(v_id, jsonb_build_object(
        'slug', v_id, 'display_name', 'Mara Beauty Studio', 'tagline', 'Tu belleza, nuestra esencia', 'bg_color', '#8A6A5C'));
    perform public.loyalty_page_style_save(v_id, jsonb_build_object('plantilla', 'clasica', 'sello', 'gema', 'tarjeta', 'organica'));
    v_prog := public.loyalty_program_save(v_id, null, 'Club Mara', 'Junta sellos en cada visita y gana.', 'repeat',
        jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 6,
                           'reward_description', 'un esmaltado en gel gratis'));
    perform public.loyalty_program_publish(v_id, v_prog);

    for i in 1 .. array_length(v_sellos, 1) loop
        v_alta := public.loyalty_member_create(v_id, v_clientes[i], null, null, false, 'seed-mb-fz-' || i, 'panel');
        v_miembro := (v_alta ->> 'member_id')::uuid;
        if i = 1 then
            insert into mara_demo_tarjeta values (v_clientes[i], 'https://fideliza.vendemias.com/m/' || (v_alta ->> 'card_token'));
        end if;
        for j in 1 .. v_sellos[i] loop
            perform public.loyalty_record(v_id, v_miembro, 'purchase', (v_precios[1 + (i + j) % 8] * 100)::bigint,
                                          null, null, 'seed-mb-fz-' || i || '-' || j, 'caja');
        end loop;
    end loop;

    raise notice 'Listo: entra en el panel con %, elige Mara Beauty Studio y abre agenda.vendemias.com/%', v_email, v_id;
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

-- Comprobación: una fila. Espera 29 servicios, 4 en el equipo, cientos de citas, 6 gastos,
-- el club activo con 10 tarjetas.
select c.id, c.ask_employee as elige_profesional,
       (select count(*) from public.catalog k where k.company_id = c.id) as servicios,
       (select count(*) from public.employees e where e.company_id = c.id) as equipo,
       (select count(*) from public.appointments a where a.company_id = c.id) as citas,
       (select count(*) from public.appointments a where a.company_id = c.id and a.status = 'completed') as atendidas,
       (select count(*) from public.gastos g where g.company_id = c.id) as gastos,
       (select status from public.loyalty_programs p where p.company_id = c.id) as club,
       (select count(*) from public.loyalty_members m where m.company_id = c.id) as tarjetas,
       (select p.secciones -> 'fideliza' from public.tu_pagina p where p.company_id = c.id) as tarjeta_en_pagina,
       (select enlace from mara_demo_tarjeta) as tarjeta_que_ya_gano
  from public.companies c
 where c.id = 'mara-beauty-studio';
