-- ═══════════════════════════════════════════════════════════════════════════
-- USUARIO DE PRUEBA · un barbero (empleado) de barberia-01
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 27-oct-2026, para ver Mi agenda y los avisos como los ve
-- un barbero. Se corre en el editor SQL de Supabase (lo hace todo de una vez):
--
--   1. Crea la cuenta (correo + contraseña), ya confirmada: entra sin esperar
--      ningún correo. «Confirm email» está encendido en el proyecto, por eso no
--      se puede crear con un registro normal.
--   2. La hace EMPLEADO de barberia-01 (memberships.role = 'member').
--   3. Le enlaza la ficha del barbero que más citas tiene por delante (lo que
--      sembró scripts/siembra-oct-nov.sql), para que Mi agenda no salga vacía.
--      Para otro, escribe su nombre en v_barbero.
--
-- ANTES DE CORRER: cambia v_clave. Se niega con la de ejemplo.
-- Si el correo ya existe, no crea otra cuenta: solo rehace el paso 2 y 3.
--
-- Deshacer (al final del fichero, comentado): borra la cuenta y su acceso.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
    v_email   text := 'barbero.prueba@vendemias.com';
    v_clave   text := 'CAMBIA-ESTA-CLAVE';
    v_negocio text := 'barberia-01';
    v_barbero text := '';          -- vacío = el que más citas tiene por delante
    v_user    uuid;
    v_ficha   text;
    v_nombre  text;
begin
    if v_clave = 'CAMBIA-ESTA-CLAVE' or length(v_clave) < 8 then
        raise exception 'Pon una contraseña de 8 caracteres o más en v_clave.';
    end if;
    if not exists (select 1 from public.companies where id = v_negocio) then
        raise exception 'No existe el negocio %', v_negocio;
    end if;

    -- La ficha: por nombre, o la que más citas confirmadas tiene de hoy en adelante.
    select e.id, e.name into v_ficha, v_nombre
      from public.employees e
     where e.company_id = v_negocio and coalesce(e.is_active, 1) <> 0
       and (v_barbero = '' or lower(e.name) = lower(v_barbero))
     order by (select count(*) from public.appointments a
                where a.company_id = e.company_id and a.employee_id = e.id and a.status = 'confirmed'
                  and a.slot_start >= to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD')) desc, e.name
     limit 1;
    if v_ficha is null then
        raise exception 'barberia-01 no tiene ningún barbero activo%.',
            case when v_barbero <> '' then ' llamado «' || v_barbero || '»' else '' end;
    end if;

    -- 1 · La cuenta
    select id into v_user from auth.users where lower(email) = lower(v_email);
    if v_user is null then
        v_user := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión
            -- («Database error querying schema»).
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', lower(v_email),
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', v_nombre), now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text,
                jsonb_build_object('sub', v_user::text, 'email', lower(v_email), 'email_verified', true),
                'email', now(), now(), now());
    end if;

    -- 2 y 3 · Empleado de la barbería, con la ficha enlazada
    if exists (select 1 from public.memberships where company_id = v_negocio and auth_user_id = v_user::text) then
        update public.memberships set role = 'member', employee_id = v_ficha
         where company_id = v_negocio and auth_user_id = v_user::text;
    else
        insert into public.memberships (id, auth_user_id, company_id, role, employee_id)
        values ('m-' || gen_random_uuid(), v_user::text, v_negocio, 'member', v_ficha);
    end if;

    raise notice 'Listo: % entra como empleado de % con la ficha de «%» (%).', v_email, v_negocio, v_nombre, v_ficha;
end $$;

-- Comprobación: debe salir una fila, rol member, con su ficha.
select u.email, m.company_id, m.role, m.employee_id, e.name as ficha
  from auth.users u
  join public.memberships m on m.auth_user_id = u.id::text
  left join public.employees e on e.id = m.employee_id and e.company_id = m.company_id
 where lower(u.email) = 'barbero.prueba@vendemias.com';

-- ── Deshacer ──────────────────────────────────────────────────────────────
-- delete from public.panel_push_subscriptions where auth_user_id = (select id from auth.users where email = 'barbero.prueba@vendemias.com');
-- delete from public.memberships where auth_user_id = (select id::text from auth.users where email = 'barbero.prueba@vendemias.com');
-- delete from auth.users where email = 'barbero.prueba@vendemias.com';
