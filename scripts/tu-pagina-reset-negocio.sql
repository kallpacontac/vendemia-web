-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · Dejar la página de un negocio en cero, para volver a probar
--
-- Borra: la página (dirección, WhatsApp, Agenda/Tienda/Las dos, plantilla,
-- color), los envíos, y lo que entró por la página sin la agenda en la nube
-- (pedidos_web, reservas_web) y su rastro de idempotencia (pagina_idem).
-- Al abrir Mi página en el panel vuelve a salir «Crea tu página en un minuto».
--
-- Conserva: el negocio, la membresía, el catálogo, y las citas y pedidos que ya
-- entraron en la Agenda / Pedidos de verdad (appointments / orders): eso es la
-- agenda del negocio, no la página. La dirección (slug) queda libre.
--
-- La página pública deja de abrir en ≤ 60 s (caché de paginaDe).
--
-- Busca el negocio por el correo de quien entra al panel. Si ese correo tiene
-- más de un negocio, para y los lista: pon el id en v_company.
-- Se ejecuta en el SQL editor de Supabase. Todo va en una transacción.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0 · Mira primero qué negocio(s) y qué se borraría:
-- select m.company_id, c.name, m.role, p.slug, p.secciones,
--        (select count(*) from public.envios e where e.company_id = m.company_id) as envios
--   from auth.users u
--   join public.memberships m on m.auth_user_id = u.id::text
--   join public.companies c on c.id = m.company_id
--   left join public.tu_pagina p on p.company_id = m.company_id
--  where lower(u.email) = 'subovideodetodo@gmail.com';

begin;

do $$
declare
    v_email   text := 'subovideodetodo@gmail.com';  -- ← correo de quien entra al panel
    v_company text := '';                           -- ← solo si el correo tiene varios negocios
    c         text;
    v_slug    text;
    n         integer;
    t         text;
begin
    if v_company <> '' then
        select m.company_id into c
          from auth.users u join public.memberships m on m.auth_user_id = u.id::text
         where lower(u.email) = lower(v_email) and m.company_id = v_company;
    else
        select min(m.company_id) into c
          from auth.users u join public.memberships m on m.auth_user_id = u.id::text
         where lower(u.email) = lower(v_email)
        having count(distinct m.company_id) = 1;
    end if;
    if c is null then
        raise exception 'No hay un negocio claro para «%». Tiene: %', v_email,
            coalesce((select string_agg(m.company_id || ' = ' || coalesce(co.name, '?') || ' (' || m.role || ')', ' · ')
                        from auth.users u
                        join public.memberships m on m.auth_user_id = u.id::text
                        left join public.companies co on co.id = m.company_id
                       where lower(u.email) = lower(v_email)), 'ninguno (¿correo bien escrito?)');
    end if;

    select slug into v_slug from public.tu_pagina where company_id = c;

    -- Lo que entró por la página (las tablas de la 0002 / 0004 pueden no existir aún)
    foreach t in array array['pedidos_web', 'reservas_web', 'pagina_idem'] loop
        if to_regclass('public.' || t) is not null then
            execute format('delete from public.%I where company_id = $1', t) using c;
            get diagnostics n = row_count;
            raise notice '%: % filas', t, n;
        end if;
    end loop;

    delete from public.envios where company_id = c;
    get diagnostics n = row_count;
    raise notice 'envios: % filas', n;

    delete from public.tu_pagina where company_id = c;
    get diagnostics n = row_count;

    raise notice 'Mi página de % (%, slug «%») en cero: % página borrada', v_email, c, coalesce(v_slug, '—'), n;
end $$;

commit;
