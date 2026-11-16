-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · lo que respondió el dueño por WhatsApp (16-nov-2026). Se puede repetir.
-- ═══════════════════════════════════════════════════════════════════════════════
--   1. Caja: Jhony Ruiz Ruiz (jhonyruizruiz51@gmail.com), ADMINISTRADOR del negocio: aprueba los
--      pagos y anota citas en las dos sedes. Si no tiene cuenta, se le crea con la contraseña
--      temporal de v_clave (como al dueño); la cambia en el panel, menú de la cuenta.
--   2. Duraciones reales. Dio rangos («30 a 35»): se toma el MAYOR, para que la agenda no
--      prometa una hora que no alcanza. Mascarilla (30) y lavado (15) no los dio: se quedan.
--      Todo se cambia luego en Panel › Catálogo.
--   3. Si no viene o cancela: el adelanto NO se pierde, la cita se pasa a la hora que le indique
--      el local. Va en «Antes de tu cita» de la página y en las reglas de Mia.
--   4. Club 24/7: el 6.º gratis vale para corte o barba, no para la mascarilla facial.
--   5. Yape: 902 318 120 (antes 914 440 860, que sigue siendo el WhatsApp). El titular lo pondrán
--      ellos desde el panel.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_id     constant text := 'the247barbershop';
    v_email  constant text := 'jhonyruizruiz51@gmail.com';
    v_clave  constant text := 'peru123456';
    v_caja   uuid;
    v_dueno  text;
    v_prog   uuid;
begin
    if not exists (select 1 from public.companies where id = v_id) then raise exception 'No existe %.', v_id; end if;

    -- ── 1 · Jhony, administrador ─────────────────────────────────────────────────
    select id into v_caja from auth.users where lower(email) = v_email;
    if v_caja is null then
        v_caja := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión.
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_caja, 'authenticated', 'authenticated', v_email,
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Jhony Ruiz Ruiz"}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_caja, v_caja::text,
                jsonb_build_object('sub', v_caja::text, 'email', v_email, 'email_verified', true),
                'email', now(), now(), now());
        raise notice 'Cuenta creada: % (contraseña temporal %).', v_email, v_clave;
    end if;
    if exists (select 1 from public.memberships where company_id = v_id and auth_user_id = v_caja::text) then
        -- Ya estaba: que sea administrador (sin tocar al dueño).
        update public.memberships set role = 'admin'
         where company_id = v_id and auth_user_id = v_caja::text and role <> 'owner';
    else
        insert into public.memberships (id, auth_user_id, company_id, role)
        values ('m-' || gen_random_uuid(), v_caja::text, v_id, 'admin');
    end if;

    -- ── 2 · Duraciones reales (minutos) ─────────────────────────────────────────
    update public.catalog k
       set duration_minutes = d.min
      from (values ('t247-corte', 35), ('t247-degradado', 50), ('t247-barba', 15), ('t247-cejas', 10),
                   ('t247-rayitos', 120), ('t247-tinte', 120), ('t247-ondulacion', 90),
                   ('t247-combo-clasico', 40), ('t247-combo-degradado', 50), ('t247-corte-barba', 50),
                   ('t247-combo-mascarilla', 60)) as d(id, min)
     where k.company_id = v_id and k.id = d.id;

    -- ── 3 · Si no viene: el adelanto se pasa a otra hora ────────────────────────
    update public.tu_pagina
       set secciones = jsonb_set(secciones, '{citas,indicaciones}', jsonb_build_array(
             'Tolerancia máxima de 10 minutos: pasado ese tiempo, la cita se reprograma.',
             'Tu cita queda confirmada cuando revisamos la captura del adelanto (50 %). El resto lo pagas en el local.',
             'Si no puedes venir o llegas tarde, tu adelanto no se pierde: te damos otra hora y lo usas en esa cita.',
             'Te atendemos en Jr. Huallaga 625 o en 24/7 Premium (Jr. Huallaga 646), Iquitos.',
             'Avísanos por WhatsApp con tiempo para darle tu hora a otra persona.'))
     where company_id = v_id and secciones ? 'citas';
    update public.companies
       set custom_rules = 'Las citas se separan en agenda.vendemias.com/the247. Términos de reserva: 50 % de adelanto obligatorio por Yape, y la captura se sube en la misma página. Tolerancia máxima de 10 minutos: pasado ese tiempo la cita se reprograma. Si el cliente no viene o cancela, el adelanto NO se pierde ni se devuelve: se pasa a otra hora que le indique el local.'
     where id = v_id;

    -- ── 5 · Yape 902 318 120 (el WhatsApp sigue siendo 914 440 860) ──────────────
    update public.companies
       set payment_methods = (
             select jsonb_agg(case when e->>'type' = 'yape' then e || '{"number":"51902318120"}'::jsonb else e end)
               from jsonb_array_elements(payment_methods::jsonb) e)::text
     where id = v_id and payment_methods::jsonb @> '[{"type":"yape"}]';
    if not found then
        update public.companies
           set payment_methods = (coalesce(nullif(payment_methods, '')::jsonb, '[]'::jsonb)
                                  || '[{"type":"yape","number":"51902318120","name":""}]'::jsonb)::text
         where id = v_id;
    end if;

    -- ── 4 · Club 24/7: el 6.º gratis es corte o barba, sin mascarilla ───────────
    select auth_user_id into v_dueno from public.memberships where company_id = v_id and role = 'owner' limit 1;
    if v_dueno is null then raise exception 'El negocio no tiene dueño en memberships.'; end if;
    perform set_config('request.jwt.claim.sub', v_dueno, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);
    select id into v_prog from public.loyalty_programs
     where company_id = v_id and parent_program_id is null and status in ('active', 'paused') limit 1;
    if v_prog is null then raise exception 'No encuentro el Club 24/7 publicado.'; end if;
    perform public.loyalty_program_save(v_id, v_prog, 'Club 24/7',
        -- Máx. 120 caracteres.
        'Cada corte o arreglo de barba suma un sello, en las dos sedes. Al 5.º, el 6.º es gratis (no incluye mascarilla).',
        'repeat',
        jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 5,
                           'reward_description', 'tu 6.º corte o barba gratis'));
    perform public.loyalty_program_publish(v_id, v_prog);
end $$;

commit;

-- Comprobación: Jhony como admin, las duraciones nuevas, el Yape y el premio del club.
select payment_methods as yape from public.companies where id = 'the247barbershop';
select u.email, m.role from public.memberships m join auth.users u on u.id::text = m.auth_user_id
 where m.company_id = 'the247barbershop' order by m.role;
select name, duration_minutes from public.catalog where company_id = 'the247barbershop' and is_active = 1 order by sort_order;
select v.reward_threshold || ' sellos → ' || v.reward_description as club
  from public.loyalty_programs p join public.loyalty_program_versions v on v.id = p.current_version_id
 where p.company_id = 'the247barbershop' and p.parent_program_id is null;
