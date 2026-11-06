-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTA · Cancha Sosa Pelaez, primer cliente de canchas (pedido por Alvaro el 6-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Un negocio NUEVO copiado de la demo Zona Gol (canchas, precios, horario, adelanto, página y
-- su apariencia), SIN sus clientes, reservas ni pagos inventados. Zona Gol se queda de demo.
--
-- ANTES: tiene que existir su cuenta. Una de dos (este script no crea cuentas):
--   a) Tú la creas: Supabase → Authentication → Users → Add user → Create new user, con su
--      correo, una contraseña temporal y «Auto Confirm User» marcado. Mejor así: corres esto
--      antes de que entre y la primera vez ya cae en su panel, sin pasar por «crea tu negocio».
--   b) Él entra una vez en vendemias.com/login con «Continuar con Google».
--
-- Hace, en una sola transacción (si algo falla, no queda nada a medias):
--   1. La demo vuelve a su dirección: agenda.vendemias.com/zona-gol, título «Zona Gol».
--   2. Crea `sosa-pelaez` con lo de Zona Gol y los datos de abajo, en la nube.
--   3. Su página en agenda.vendemias.com/sosa-pelaez, publicada, con el mismo aspecto.
--   4. El cliente, dueño. Tu cuenta, administrador para darle soporte (o nada, ver v_soporte).
--   5. Avisa si el cliente creó por su cuenta otro negocio al entrar (no lo borra).
--
-- Después, desde SU panel o el tuyo: Catálogo (canchas y precios reales), Ajustes (horario) y
-- Mi página (logo, fotos). Deshacer: scripts/sosa-pelaez-alta-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- Copia una fila (en jsonb) a su tabla, solo con las columnas que se pueden escribir: las
-- calculadas (created_ts…) las rellena Postgres. Temporal: desaparece al cerrar la sesión.
create or replace function pg_temp.copiar(p_tabla text, p_fila jsonb) returns void language plpgsql as $f$
declare
    v_cols text;
begin
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
      from information_schema.columns
     where table_schema = 'public' and table_name = p_tabla
       and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS';
    execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1)', p_tabla, v_cols)
      using p_fila;
end $f$;

do $$
declare
    -- ▼▼▼ RELLENA LO QUE FALTA ▼▼▼
    v_email     text := '';                    -- el correo con el que entró el cliente (Google)
    v_whatsapp  text := '51000000000';         -- su celular, con 51 delante. La página no lo muestra
    v_yape      text := '51000000000';         -- SU número de Yape/Plin, con 51 delante (¡no el tuyo!)
    v_titular   text := 'CAMBIA-ESTE-NOMBRE';  -- a nombre de quién está ese Yape
    v_direccion text := 'CAMBIA-LA-DIRECCION'; -- p. ej. «Av. Los Álamos 123, Comas»
    v_soporte   text := 'subovideodetodo@gmail.com'; -- tu cuenta, como administrador. '' = sin acceso tuyo
    -- ▲▲▲ RELLENA LO QUE FALTA ▲▲▲

    v_id        constant text := 'sosa-pelaez';
    v_nombre    constant text := 'Cancha Sosa Pelaez';
    v_demo      constant text := 'zona-gol';
    v_cliente   uuid;
    v_admin     uuid;
    v_otros     text;
begin
    -- ── Comprobaciones: nada se crea con datos de mentira ─────────────────────
    select id into v_cliente from auth.users where lower(email) = lower(btrim(v_email));
    if v_cliente is null then
        raise exception 'No hay ninguna cuenta con el correo «%». Créala en Supabase → Authentication → Add user (con «Auto Confirm User») o que el cliente entre antes con Google.', v_email;
    end if;
    if v_whatsapp !~ '^51\d{9}$' or v_whatsapp = '51000000000' then raise exception 'Pon el celular del cliente en v_whatsapp, con 51 delante.'; end if;
    if v_yape !~ '^51\d{9}$' or v_yape = '51000000000' then raise exception 'Pon el Yape/Plin DEL CLIENTE en v_yape, con 51 delante.'; end if;
    if v_yape = '51947144701' then raise exception 'v_yape es tu número (947 144 701). Pon el del cliente: la validación compara contra ese número.'; end if;
    if v_titular = 'CAMBIA-ESTE-NOMBRE' or btrim(v_titular) = '' then raise exception 'Pon a nombre de quién está el Yape en v_titular.'; end if;
    if v_direccion = 'CAMBIA-LA-DIRECCION' or btrim(v_direccion) = '' then raise exception 'Pon la dirección de la cancha en v_direccion.'; end if;
    if not exists (select 1 from public.companies where id = v_demo) then raise exception 'No está la demo zona-gol: es de donde se copia.'; end if;
    if exists (select 1 from public.companies where id = v_id) then
        raise exception 'Ya existe el negocio sosa-pelaez. Si quieres empezar de cero: scripts/sosa-pelaez-alta-deshacer.sql.';
    end if;
    if exists (select 1 from public.tu_pagina where slug = v_id and company_id <> v_demo) then
        raise exception 'La dirección sosa-pelaez ya la usa otro negocio. No se toca nada.';
    end if;
    if exists (select 1 from public.tu_pagina where slug = v_demo and company_id <> v_demo) then
        raise exception 'La dirección zona-gol la usa otro negocio: la demo no puede volver a ella.';
    end if;
    if btrim(v_soporte) <> '' then
        select id into v_admin from auth.users where lower(email) = lower(btrim(v_soporte));
        if v_admin is null then raise exception 'No hay cuenta con el correo de soporte «%». Déjalo en blanco o corrígelo.', v_soporte; end if;
        if v_admin = v_cliente then v_admin := null; end if;
    end if;

    -- ── 1 · La demo vuelve a zona-gol ───────────────────────────────────────────
    update public.tu_pagina set slug = v_demo, titulo = 'Zona Gol' where company_id = v_demo;

    -- ── 2 · El negocio: todo lo de Zona Gol, con lo suyo encima ─────────────────
    -- Copia columna a columna (las que tenga hoy la tabla) y pisa solo lo que cambia.
    perform pg_temp.copiar('companies', to_jsonb(c) || jsonb_build_object(
               'id', v_id, 'name', v_nombre, 'owner_phone', v_whatsapp, 'whatsapp_phone', v_whatsapp,
               'location', v_direccion,
               'payment_methods', jsonb_build_array(
                    jsonb_build_object('type', 'yape', 'number', v_yape, 'name', v_titular),
                    jsonb_build_object('type', 'plin', 'number', v_yape, 'name', v_titular))::text,
               'custom_rules', replace(coalesce(c.custom_rules, ''), 'agenda.vendemias.com/zona-gol', 'agenda.vendemias.com/' || v_id)))
      from public.companies c where c.id = v_demo;

    insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube)
    values (v_id, true, true)
    on conflict (company_id) do update set config_en_nube = true, agenda_en_nube = true;

    -- Canchas y consumos, con id propio (sp-…). Los precios se ajustan luego en Catálogo.
    perform pg_temp.copiar('catalog', to_jsonb(k) || jsonb_build_object('id', 'sp-' || substr(k.id, 4), 'company_id', v_id))
      from public.catalog k where k.company_id = v_demo and k.id like 'zg-%';

    -- ── 3 · Su página, con el aspecto de la demo ────────────────────────────────
    perform pg_temp.copiar('tu_pagina', to_jsonb(p) || jsonb_build_object(
               'company_id', v_id, 'slug', v_id, 'titulo', v_nombre, 'whatsapp', v_whatsapp, 'publicada', true))
      from public.tu_pagina p where p.company_id = v_demo;

    -- ── 4 · Accesos ────────────────────────────────────────────────────────────
    insert into public.memberships (id, auth_user_id, company_id, role)
    values ('m-' || gen_random_uuid(), v_cliente::text, v_id, 'owner');
    if v_admin is not null then
        insert into public.memberships (id, auth_user_id, company_id, role)
        values ('m-' || gen_random_uuid(), v_admin::text, v_id, 'admin');
    end if;

    -- ── 5 · ¿Creó otro negocio al entrar? Solo se avisa ─────────────────────────
    select string_agg(m.company_id, ', ') into v_otros
      from public.memberships m where m.auth_user_id = v_cliente::text and m.company_id <> v_id;
    if v_otros is not null then
        raise notice 'Ojo: el cliente también está en: %. Si lo creó sin querer al entrar, bórralo aparte.', v_otros;
    end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: dos filas. sosa-pelaez con 7 en catálogo, 0 reservas y su Yape; zona-gol, la demo.
select p.slug, c.id as negocio, c.name, p.publicada,
       (select count(*) from public.catalog k where k.company_id = c.id) as catalogo,
       (select count(*) from public.appointments a where a.company_id = c.id) as reservas,
       c.payment_methods,
       (select string_agg(m.role, ', ') from public.memberships m where m.company_id = c.id) as accesos
  from public.companies c join public.tu_pagina p on p.company_id = c.id
 where c.id in ('sosa-pelaez', 'zona-gol')
 order by c.id;
