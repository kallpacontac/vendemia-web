-- ═══════════════════════════════════════════════════════════════════════════════
-- DESHACER la empresa de ejemplo de scripts/zona-gol-demo.sql
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Borra TODO lo de `zona-gol`, también las reservas de prueba que se hayan hecho después,
-- y la cuenta de abajo solo si se queda sin ningún negocio (subovideodetodo@gmail.com conserva `vendemia`). Solo actúa si es la de ejemplo: exige
-- las canchas zg-*. Apaga antes su bot, si lo levantaste. Se corre entero en el editor SQL.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare
    v_email text := 'subovideodetodo@gmail.com';   -- la de v_email. Solo se borra si se queda sin negocios: con `vendemia` NO
    v_id    constant text := 'zona-gol';
    t       record;
    v_vuelta integer;
    v_quedan integer;
begin
    if not exists (select 1 from public.catalog where company_id = v_id and id = 'zg-principal') then
        raise exception 'zona-gol no parece la empresa de ejemplo. No se borra nada.';
    end if;

    delete from public.appointment_services s using public.appointments a where s.appointment_id = a.id and a.company_id = v_id;

    -- Hijas primero. Sin conocer todas las claves foráneas: lo que no se pueda borrar
    -- todavía se reintenta en la vuelta siguiente, cuando ya no tenga dependientes.
    for v_vuelta in 1 .. 5 loop
        v_quedan := 0;
        for t in select table_name from information_schema.columns
                  where table_schema = 'public' and column_name = 'company_id' and table_name <> 'companies'
                    and table_name in (select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') loop
            begin
                execute format('delete from public.%I where company_id = $1', t.table_name) using v_id;
            exception when foreign_key_violation then
                v_quedan := v_quedan + 1;
            end;
        end loop;
        exit when v_quedan = 0;
    end loop;

    delete from public.companies where id = v_id;

    if not exists (select 1 from public.memberships m join auth.users u on m.auth_user_id = u.id::text where lower(u.email) = lower(v_email)) then
        delete from auth.users where lower(email) = lower(v_email);
    end if;
end $$;

-- Comprobación: las dos a cero.
select (select count(*) from public.companies where id = 'zona-gol') as negocio,
       (select count(*) from public.tu_pagina where slug = 'zona-gol') as pagina;
