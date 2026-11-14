-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · precios reales, combos, aforo 6 + 6 y tarjeta «5 cortes, el 6.º gratis»
-- ═══════════════════════════════════════════════════════════════════════════════
-- Datos que mandó el cliente el 14-nov-2026 (por WhatsApp, a Alvaro). Se puede repetir.
-- Necesita corridas la 0023–0025 y scripts/the247-sedes.sql.
--
--   · Catálogo: sus 9 servicios y 4 combos con SUS precios. Los que no están en su lista
--     (corte + cejas, corte + raya, corte con diseño, corte niño, perfilado) se APAGAN (is_active
--     = 0), no se borran: las citas que ya los tengan no se rompen.
--   · ⚠️ DURACIONES SUPUESTAS (no las mandó): clásico 30, degradado 45, barba 20, cejas 15,
--     mascarilla 30, lavado 15, rayitos 90, tinte completo 120, ondulación 120; combos 45, 60,
--     60 y 75. Se cambian en Panel → Catálogo.
--   · Sin foto propia todavía: mascarilla, tintes/rayitos, tinte completo y ondulación (la
--     página les pone una de ejemplo de la plantilla hasta que suban la suya).
--   · Aforo: 6 a la vez en cada sede; el general del negocio, 12 (la suma).
--   · Club 24/7: cada 5 cortes, el 6.º gratis (antes 6 → 1). Se vuelve a publicar: nueva
--     versión, los sellos que ya tienen los clientes se conservan.
--   · Cumpleaños: «cortesía y mascarilla gratis con cualquier corte» (loyalty_settings.cumple_regalo,
--     de la 0019 de Fideliza). La Caja pregunta el cumpleaños y el cron saluda ese día.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_id    constant text := 'the247barbershop';
    v_url   constant text := 'https://vendemias.com/assets/the247/';
    v_dueno text;
    v_prog  uuid;
begin
    if not exists (select 1 from public.companies where id = v_id) then raise exception 'No existe %.', v_id; end if;

    -- ── 1 · Servicios y combos (upsert por id) ──────────────────────────────────
    -- Sin «on conflict»: actualiza lo que ya existe e inserta lo que falta (vale sea cual sea la clave).
    create temp table t247_cat (id text, company_id text, name text, description text, price numeric, duration_minutes integer,
                                is_active integer, sort_order integer, familia text, tipo text) on commit drop;
    insert into t247_cat values
        ('t247-corte',           v_id, 'Corte clásico',            'Tijera y máquina, con acabado a navaja.',                       15,  30, 1,  1, 'Cortes', ''),
        ('t247-degradado',       v_id, 'Corte degradado',          'Fade, taper o el degradado que quieras.',                       20,  45, 1,  2, 'Cortes', ''),
        ('t247-corte-barba',     v_id, 'Corte + barba',            'Corte completo y barba perfilada.',                             30,  60, 1,  3, 'Combos', ''),
        ('t247-combo-degradado', v_id, 'Corte degradado + lavado + cortesía', 'Degradado, lavado de cabello y cortesía de la casa.', 25,  60, 1,  4, 'Combos', ''),
        ('t247-combo-clasico',   v_id, 'Corte clásico + lavado + cortesía',   'Corte clásico, lavado de cabello y cortesía de la casa.', 20, 45, 1, 5, 'Combos', ''),
        ('t247-combo-mascarilla',v_id, 'Corte + mascarilla + lavado', 'Corte, mascarilla facial con vaporizador y lavado de cabello.', 35, 75, 1, 6, 'Combos', ''),
        ('t247-barba',           v_id, 'Barba',                    'Perfilado y arreglo de barba.',                                 10,  20, 1,  7, 'Barba y cejas', ''),
        ('t247-cejas',           v_id, 'Cejas',                    'Perfilado de cejas.',                                           10,  15, 1,  8, 'Barba y cejas', ''),
        ('t247-mascarilla',      v_id, 'Mascarilla facial + vaporizador', 'Limpieza con vapor y mascarilla.',                       15,  30, 1,  9, 'Cuidado', ''),
        ('t247-lavado',          v_id, 'Lavado de cabello',        'Lavado con masaje capilar.',                                    10,  15, 1, 10, 'Cuidado', ''),
        ('t247-rayitos',         v_id, 'Tintes, rayitos',          'Rayitos o mechas.',                                             60,  90, 1, 11, 'Color y forma', ''),
        ('t247-tinte',           v_id, 'Tinte completo',           'Color en todo el cabello.',                                     80, 120, 1, 12, 'Color y forma', ''),
        ('t247-ondulacion',      v_id, 'Ondulación',               'Ondulación permanente.',                                        40, 120, 1, 13, 'Color y forma', '');
    update public.catalog k
       set name = t.name, description = t.description, price = t.price, duration_minutes = t.duration_minutes,
           is_active = 1, sort_order = t.sort_order, familia = t.familia
      from t247_cat t
     where k.company_id = v_id and k.id = t.id;
    insert into public.catalog (id, company_id, name, description, price, duration_minutes, is_active, sort_order, familia, tipo)
    select t.id, t.company_id, t.name, t.description, t.price, t.duration_minutes, t.is_active, t.sort_order, t.familia, t.tipo
      from t247_cat t
     where not exists (select 1 from public.catalog k where k.company_id = v_id and k.id = t.id);

    -- Lo que no está en su lista: apagado, no borrado.
    update public.catalog set is_active = 0
     where company_id = v_id and id in ('t247-corte-cejas', 't247-corte-raya', 't247-corte-diseno', 't247-corte-nino', 't247-perfilado');

    -- Fotos: las suyas, encuadradas en el corte (public/assets/the247/). Sin foto: los 4 de arriba.
    delete from public.catalog_media where company_id = v_id and id like 't247-m-%';
    insert into public.catalog_media (id, company_id, catalog_id, product_name, url, media_type, sort_order, is_primary)
    select 't247-m-' || f.id, v_id, f.id, k.name, v_url || f.archivo, 'image', 0, 1
      from (values ('t247-corte', 'corte-diseno.webp'), ('t247-degradado', 'corte.webp'), ('t247-corte-barba', 'corte-barba.webp'),
                   ('t247-combo-degradado', 'corte-raya.webp'), ('t247-combo-clasico', 'corte-cejas.webp'),
                   ('t247-combo-mascarilla', 'video-lavado.webp'), ('t247-barba', 'arreglo-barba.webp'),
                   ('t247-cejas', 'corte-cejas.webp'), ('t247-lavado', 'video-lavado.webp')) as f(id, archivo)
      join public.catalog k on k.id = f.id and k.company_id = v_id;

    -- ── 2 · Aforo: 6 + 6, general 12 ────────────────────────────────────────────
    update public.tu_pagina
       set secciones = jsonb_set(secciones, '{citas,sedes}', (
             select jsonb_agg(s || '{"capacidad": 6}'::jsonb) from jsonb_array_elements(secciones #> '{citas,sedes}') s))
     where company_id = v_id and jsonb_typeof(secciones #> '{citas,sedes}') = 'array';
    update public.companies c
       set schedule = (select jsonb_object_agg(e.k, case when jsonb_typeof(e.v) = 'object' then e.v || '{"capacity": 12}'::jsonb else e.v end)
                         from jsonb_each(c.schedule::jsonb) e(k, v))::text
     where c.id = v_id;

    -- ── 3 · Club 24/7: 5 cortes → el 6.º gratis ─────────────────────────────────
    -- Con las mismas funciones que el panel, actuando como el dueño.
    select auth_user_id into v_dueno from public.memberships where company_id = v_id and role = 'owner' limit 1;
    if v_dueno is null then raise exception 'El negocio no tiene dueño en memberships.'; end if;
    perform set_config('request.jwt.claim.sub', v_dueno, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);

    select id into v_prog from public.loyalty_programs
     where company_id = v_id and parent_program_id is null and status in ('active', 'paused') limit 1;
    if v_prog is null then raise exception 'No encuentro el Club 24/7 publicado.'; end if;
    perform public.loyalty_program_save(v_id, v_prog, 'Club 24/7',
        -- Máx. 120 caracteres (loyalty_programs.short_description).
        'Cada corte suma un sello en las dos sedes: al 5.º, tu 6.º corte es gratis. Cumpleaños: cortesía + mascarilla gratis.',
        'repeat',
        jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 5,
                           'reward_description', 'tu 6.º corte gratis'));
    perform public.loyalty_program_publish(v_id, v_prog);

    -- ── 4 · Regalo de cumpleaños (con la 0019 de Fideliza; sin ella, se omite) ──
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'loyalty_settings' and column_name = 'cumple_regalo') then
        execute 'update public.loyalty_settings set cumple_regalo = $1 where company_id = $2'
          using 'cortesía y mascarilla gratis con cualquier corte', v_id;
    else
        raise notice 'Falta modules/fideliza/sql/0019_cumpleanos.sql: el regalo de cumpleaños no se puso. Córrela y vuelve a correr esto.';
    end if;
end $$;

commit;

-- Comprobación: 13 servicios activos, 5 apagados, sedes con 6, general 12 y el club con 5 sellos.
select (select count(*) from public.catalog where company_id = 'the247barbershop' and is_active = 1) as activos,
       (select count(*) from public.catalog where company_id = 'the247barbershop' and is_active = 0) as apagados,
       (select jsonb_path_query_array(secciones, '$.citas.sedes[*].capacidad') from public.tu_pagina where company_id = 'the247barbershop') as aforo_sedes,
       (select schedule::jsonb -> 'monday' ->> 'capacity' from public.companies where id = 'the247barbershop') as aforo_general,
       (select v.reward_threshold || ' sellos → ' || v.reward_description
          from public.loyalty_programs p join public.loyalty_program_versions v on v.id = p.current_version_id
         where p.company_id = 'the247barbershop' and p.parent_program_id is null) as club;
