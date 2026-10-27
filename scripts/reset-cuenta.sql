-- ═══════════════════════════════════════════════════════════════════════════════
-- CUENTA · Borrar una cuenta entera, para volver a probar el alta desde cero
--
-- Borra: el usuario de Supabase Auth (y con él sus sesiones e identidades), sus
-- membresías, todo lo que lleve su auth_user_id (avisos, suscripciones push…) y
-- los negocios en los que es el ÚNICO miembro, con todo lo que cuelga de ellos
-- (cualquier tabla de public con company_id).
--
-- Conserva: los negocios que comparte con otra persona (solo pierde su acceso),
-- y nunca toca a un admin de plataforma.
--
-- Google Wallet: los pases viejos siguen en Google. Cloudinary no se limpia.
--
-- El correo queda libre: se puede volver a crear la cuenta con él al momento.
-- Se ejecuta en el SQL editor de Supabase (rol postgres). Todo va en una
-- transacción: si algo falla, no se borra nada.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0 · Mira primero quién es y qué negocios caerían:
-- select u.id, u.email, u.created_at, u.email_confirmed_at, m.company_id, c.name, m.role,
--        (select count(*) from public.memberships m2 where m2.company_id = m.company_id) as miembros
--   from auth.users u
--   left join public.memberships m on m.auth_user_id = u.id::text
--   left join public.companies c on c.id = m.company_id
--  where lower(u.email) = 'subovideosdetodo@gmail.com';

begin;

do $$
declare
    v_email    text := 'subovideosdetodo@gmail.com';  -- ← correo de la cuenta
    v_uid      uuid;
    v_empresas text[];
    c          text;
    t          record;
    n          integer;
    pasada     integer;
    pendientes integer;
begin
    select id into v_uid from auth.users where lower(email) = lower(v_email);
    if v_uid is null then
        raise exception 'No hay ninguna cuenta con el correo «%»', v_email;
    end if;

    if to_regclass('public.platform_admins') is not null then
        execute 'select count(*) from public.platform_admins where auth_user_id::text = $1'
           into n using v_uid::text;
        if n > 0 then
            raise exception '«%» es admin de plataforma: no se borra desde aquí', v_email;
        end if;
    end if;

    -- Negocios donde es el único miembro: esos se van enteros.
    select coalesce(array_agg(m.company_id), '{}') into v_empresas
      from public.memberships m
     where m.auth_user_id = v_uid::text
       and not exists (select 1 from public.memberships o
                        where o.company_id = m.company_id and o.auth_user_id <> v_uid::text);

    -- El ledger de Fideliza es inmutable por trigger; se apaga solo durante esto.
    if to_regclass('public.loyalty_ledger') is not null then
        alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;
    end if;

    foreach c in array v_empresas loop
        /*
          Todas las tablas con company_id, en varias pasadas: las claves foráneas
          entre ellas fijan un orden que aquí no se conoce. Lo que choca con una
          FK se reintenta en la siguiente pasada, cuando ya se borró lo que la
          tenía agarrada.
        */
        for pasada in 1..8 loop
            pendientes := 0;
            for t in
                select table_name from information_schema.columns
                 where table_schema = 'public' and column_name = 'company_id'
                   and table_name in (select table_name from information_schema.tables
                                       where table_schema = 'public' and table_type = 'BASE TABLE')
            loop
                begin
                    execute format('delete from public.%I where company_id::text = $1', t.table_name) using c;
                    get diagnostics n = row_count;
                    if n > 0 then raise notice '% · %: % filas', c, t.table_name, n; end if;
                exception when foreign_key_violation then
                    pendientes := pendientes + 1;
                end;
            end loop;
            exit when pendientes = 0;
        end loop;
        if pendientes > 0 then
            raise exception 'El negocio % sigue teniendo filas atadas por FK tras 8 pasadas', c;
        end if;

        delete from public.companies where id = c;
        raise notice 'Negocio % borrado', c;
    end loop;

    if to_regclass('public.loyalty_ledger') is not null then
        alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;
    end if;

    /*
      Lo que lleva su id en cualquier tabla (membresías incluidas). Solo
      auth_user_id: staff_user_id está en las transacciones de Fideliza, y en un
      negocio compartido eso es historial del negocio, no de la persona.
    */
    for t in
        select table_name, column_name from information_schema.columns
         where table_schema = 'public' and column_name = 'auth_user_id'
           and table_name in (select table_name from information_schema.tables
                               where table_schema = 'public' and table_type = 'BASE TABLE')
    loop
        execute format('delete from public.%I where %I::text = $1', t.table_name, t.column_name) using v_uid::text;
        get diagnostics n = row_count;
        if n > 0 then raise notice '%: % filas', t.table_name, n; end if;
    end loop;

    delete from auth.users where id = v_uid;
    raise notice 'Cuenta % (%) borrada. Negocios borrados: %', v_email, v_uid, coalesce(array_length(v_empresas, 1), 0);
end $$;

commit;
