-- ═══════════════════════════════════════════════════════════════════════════════
-- ALTA · Club Kallpa: UNA tarjeta con dos líneas · 12/13-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro: «una tarjeta para todo; que el de caja marque asistencia o
-- compra». Las reglas siguen siendo DISTINTAS (las del dueño):
--
--   ASISTENCIA (línea principal, el gimnasio)
--     · 12 sesiones en el mes → 5 % en la próxima membresía + 1 batido proteico
--     · 16 → 10 % + 2 batidos      · 20 → 15 % + 3 batidos
--       (los batidos se suman: 1 al llegar a 12, otro a 16 y otro a 20)
--     · Botón «Reto del BOX +4».
--     · Entre una sesión y la siguiente, 12 horas como mínimo.
--     · El día 1 de cada mes vuelve a 0. Descuento y batidos sin canjear duran 45 días.
--
--   COMPRA (línea de la cafetería)
--     · Cada compra = 1 sello (no por producto). 12 sellos → un kekito o un batido.
--     · Sin espera y sin reinicio mensual.
--
-- Todo en el negocio `kallpa` que YA existe (bot, agenda, alumnos). El cliente tiene
-- un solo QR; en la caja y en Clientes salen «+ Asistencia» y «+ Compra».
--
-- ANTES: aplicadas modules/fideliza/sql/0015, 0016 y 0017.
--
-- `kallpa` YA tiene dueño y la base admite UNO por negocio (idx_memberships_un_dueno).
-- v_modo decide:
--   'vincular'  (por defecto) → tu papá entra como ADMINISTRADOR de kallpa y como GERENTE
--               en MiaTap (cambia el club, da sellos, entrega premios, deshace).
--               El dueño actual no cambia. Es lo menos invasivo para el bot.
--   'traspasar' → tu papá pasa a ser el DUEÑO y el dueño actual queda como administrador
--               (y gerente en MiaTap). ⚠️ Solo cambia Postgres: si el bot guarda los dueños
--               en su SQLite, allí seguirá el anterior hasta que se sincronice.
--
-- La cuenta de v_email: si no existe, se crea con v_clave (ya confirmada: entra sin
-- esperar ningún correo). Si ya existe, no se toca.
--
-- Se puede volver a correr: si `kallpa` ya tiene el «Club Kallpa» (de una corrida
-- anterior) lo reutiliza y solo añade la línea «Compra» si falta. Si tiene OTRO club
-- vivo, se niega. Si quedó `kallpa-tienda` de la versión anterior de este script, la
-- avisa y no la toca (ya no hace falta: ver el deshacer del final).
-- Todo en una transacción: si algo falla, no queda nada a medias.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    -- ▼▼▼ RELLENA LO QUE FALTA ▼▼▼
    v_email        text := 'luispelaez42a@gmail.com';
    v_clave        text := '';   -- SOLO si la cuenta no existe: 8 caracteres o más. Pásasela tú.
    v_modo         text := 'vincular';   -- 'vincular' o 'traspasar' (ver arriba)
    v_dias_premio  integer := 45;
    -- ▲▲▲ RELLENA LO QUE FALTA ▲▲▲

    v_negocio constant text := 'kallpa';
    v_user     uuid;
    v_slug     text;
    v_prog     uuid;
    v_linea    uuid;
    v_rol      text;
    v_dueno    text;
    v_vivo     public.loyalty_programs;
begin
    if v_modo not in ('vincular', 'traspasar') then
        raise exception 'v_modo tiene que ser ''vincular'' o ''traspasar''.';
    end if;
    -- ── Comprobaciones ───────────────────────────────────────────────────────
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_program_versions' and column_name = 'tiers') then
        raise exception 'Falta la migración 0015 (modules/fideliza/sql/0015_niveles_del_mes.sql). Córrela antes.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_programs' and column_name = 'parent_program_id') then
        raise exception 'Falta la migración 0017 (modules/fideliza/sql/0017_una_tarjeta_varias_lineas.sql). Córrela antes.';
    end if;
    if not exists (select 1 from public.companies where id = v_negocio) then
        raise exception 'No existe el negocio «kallpa».';
    end if;
    select * into v_vivo from public.loyalty_programs
     where company_id = v_negocio and status in ('active', 'paused') and parent_program_id is null;
    if v_vivo.id is not null and v_vivo.name <> 'Club Kallpa' then
        raise exception 'kallpa ya tiene otro club vivo («%»). No se pisa: revísalo en el panel (Fideliza → Programa).', v_vivo.name;
    end if;

    -- ── 1 · La cuenta ────────────────────────────────────────────────────────
    select id into v_user from auth.users where lower(email) = lower(btrim(v_email));
    if v_user is null then
        if length(v_clave) < 8 then
            raise exception 'No hay cuenta con «%». Pon una contraseña de 8+ caracteres en v_clave (o que entre una vez con Google y vuelve a correr esto).', v_email;
        end if;
        v_user := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión.
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', lower(btrim(v_email)),
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text,
                jsonb_build_object('sub', v_user::text, 'email', lower(btrim(v_email)), 'email_verified', true),
                'email', now(), now(), now());
        raise notice 'Cuenta creada: % (con la contraseña de v_clave).', v_email;
    end if;

    -- ── 2 · Acceso a kallpa (el negocio del bot, ya con dueño) ──────────────
    select auth_user_id into v_dueno from public.memberships where company_id = v_negocio and role = 'owner';
    select role into v_rol from public.memberships where company_id = v_negocio and auth_user_id = v_user::text;

    if v_rol = 'owner' then
        raise notice '% ya es el dueño de kallpa: no se cambia nada.', v_email;
    elsif v_modo = 'traspasar' then
        -- Primero el anterior deja de ser dueño (el índice no admite dos ni un instante).
        if v_dueno is not null then
            update public.memberships set role = 'admin' where company_id = v_negocio and auth_user_id = v_dueno;
            insert into public.loyalty_staff (company_id, auth_user_id, role)
            values (v_negocio, v_dueno, 'manager')
            on conflict (company_id, auth_user_id) do update set role = 'manager', updated_at = now();
        end if;
        if v_rol is null then
            insert into public.memberships (id, auth_user_id, company_id, role)
            values ('m-' || gen_random_uuid(), v_user::text, v_negocio, 'owner');
        else
            update public.memberships set role = 'owner' where company_id = v_negocio and auth_user_id = v_user::text;
        end if;
        delete from public.loyalty_staff where company_id = v_negocio and auth_user_id = v_user::text;
        raise notice 'kallpa traspasada a %. El dueño anterior queda como administrador.', v_email;
    else
        if v_rol is null then
            insert into public.memberships (id, auth_user_id, company_id, role)
            values ('m-' || gen_random_uuid(), v_user::text, v_negocio, 'admin');
        end if;
        -- Sin esta fila un administrador entra en MiaTap como cajero.
        insert into public.loyalty_staff (company_id, auth_user_id, role)
        values (v_negocio, v_user::text, 'manager')
        on conflict (company_id, auth_user_id) do update set role = 'manager', updated_at = now();
        raise notice '% vinculado a kallpa como administrador (gerente en MiaTap).', v_email;
    end if;

    -- ── 3 · El club y sus dos líneas, con las funciones del panel ────────────
    -- Actúa tu papá (dueño o gerente: los dos pueden editar el club).
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

    if not exists (select 1 from public.loyalty_settings where company_id = v_negocio) then
        v_slug := case when exists (select 1 from public.loyalty_settings where slug = 'kallpa') then 'kallpa-club' else 'kallpa' end;
        perform public.loyalty_settings_save(v_negocio, jsonb_build_object(
            'slug', v_slug, 'display_name', 'Kallpa', 'tagline', 'Entrena, suma y gana', 'bg_color', '#0B6E99'));
        perform public.loyalty_page_style_save(v_negocio, jsonb_build_object('plantilla', 'clasica', 'sello', 'pesa', 'tarjeta', 'organica'));
    end if;

    -- Asistencia (principal)
    if v_vivo.id is null then
        v_prog := public.loyalty_program_save(v_negocio, null, 'Club Kallpa',
            'Cada sesión del mes suma; cada compra en la cafetería, también. Una sola tarjeta.', 'frequency',
            jsonb_build_object(
                'rule_type', 'visits', 'period', 'month', 'cooldown_hours', 12,
                'bonus_label', 'Reto del BOX', 'bonus_units', 4,
                'reward_valid_days', v_dias_premio,
                'tiers', jsonb_build_array(
                    jsonb_build_object('at', 12, 'level', '5% de dscto en tu próxima membresía', 'gift', 'Batido proteico', 'gift_count', 1),
                    jsonb_build_object('at', 16, 'level', '10% de dscto en tu próxima membresía', 'gift', 'Batido proteico', 'gift_count', 1),
                    jsonb_build_object('at', 20, 'level', '15% de dscto en tu próxima membresía', 'gift', 'Batido proteico', 'gift_count', 1))));
        perform public.loyalty_program_publish(v_negocio, v_prog);
    else
        v_prog := v_vivo.id;
        raise notice 'kallpa ya tenía el «Club Kallpa»: se reutiliza tal cual.';
    end if;
    perform public.loyalty_program_line(v_negocio, v_prog, null, 'Asistencia');

    -- Compra (línea)
    select id into v_linea from public.loyalty_programs where company_id = v_negocio and parent_program_id = v_prog;
    if v_linea is null then
        v_linea := public.loyalty_program_save(v_negocio, null, 'Club Kallpa · Compra',
            'Cada compra en la cafetería suma un sello. Con 12, un kekito o un batido.', 'repeat',
            jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 12,
                               'reward_description', 'Un kekito o un batido', 'reward_valid_days', v_dias_premio));
        perform public.loyalty_program_line(v_negocio, v_linea, v_prog, 'Compra');
        perform public.loyalty_program_publish(v_negocio, v_linea);
    else
        raise notice 'El club ya tenía una línea: no se añade otra.';
    end if;

    if exists (select 1 from public.companies where id = 'kallpa-tienda') then
        raise notice 'Queda el negocio «kallpa-tienda» de la versión anterior de este script. Ya no hace falta: bórralo con el deshacer del final (si no tiene clientes).';
    end if;

    raise notice 'Listo: kallpa con una tarjeta y dos líneas (Asistencia + Compra). % entra como %.',
        v_email, case when v_modo = 'traspasar' or v_rol = 'owner' then 'dueño' else 'administrador/gerente' end;
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: dos filas (Asistencia y Compra), cada una con su regla publicada.
select coalesce(p.line_label, p.name) as linea, p.parent_program_id is null as principal, s.slug,
       v.rule_type, v.period, v.cooldown_hours, v.bonus_label, v.bonus_units,
       v.reward_threshold, v.reward_description, jsonb_array_length(v.tiers) as niveles,
       (select string_agg(u.email || ' (' || m.role || ')', ', ')
          from public.memberships m join auth.users u on u.id::text = m.auth_user_id
         where m.company_id = p.company_id) as accesos
  from public.loyalty_programs p
  join public.loyalty_settings s on s.company_id = p.company_id
  join public.loyalty_program_versions v on v.id = p.current_version_id
 where p.company_id = 'kallpa' and p.status in ('active', 'paused')
 order by p.parent_program_id nulls first;

-- ── Deshacer (comentado) ─────────────────────────────────────────────────────
-- Solo si aún no hay clientes en el club: con tarjetas, el libro no deja borrar.
-- begin;
-- update public.loyalty_programs set parent_program_id = null where company_id = 'kallpa';
-- delete from public.loyalty_wallet_classes where company_id in ('kallpa', 'kallpa-tienda');
-- delete from public.loyalty_outbox where company_id in ('kallpa', 'kallpa-tienda');
-- update public.loyalty_programs set current_version_id = null where company_id in ('kallpa', 'kallpa-tienda');
-- delete from public.loyalty_program_versions where company_id in ('kallpa', 'kallpa-tienda');
-- delete from public.loyalty_programs where company_id in ('kallpa', 'kallpa-tienda');
-- -- Si usaste 'vincular': quitar el acceso de tu papá a kallpa
-- delete from public.loyalty_staff where company_id = 'kallpa' and auth_user_id = (select id::text from auth.users where email = 'luispelaez42a@gmail.com');
-- delete from public.memberships where company_id = 'kallpa' and auth_user_id = (select id::text from auth.users where email = 'luispelaez42a@gmail.com');
-- -- Si usaste 'traspasar', devolver el dueño a mano: primero el papá a 'admin', luego el anterior a 'owner'.
-- -- La «kallpa-tienda» de la versión anterior (si se creó):
-- delete from public.loyalty_settings where company_id = 'kallpa-tienda';
-- delete from public.loyalty_staff where company_id = 'kallpa-tienda';
-- delete from public.memberships where company_id = 'kallpa-tienda';
-- delete from public.companies where id = 'kallpa-tienda';
-- commit;
