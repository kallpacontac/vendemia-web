-- ═══════════════════════════════════════════════════════════════════════════════
-- DESHACER la empresa de ejemplo de scripts/mara-beauty-demo.sql
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Borra TODO lo de `mara-beauty-studio`, también las reservas de prueba que se hayan hecho después.
-- No toca la cuenta subovideodetodo@gmail.com (conserva `vendemia` y `zona-gol`).
-- Solo actúa si es la de ejemplo: exige el servicio mb-gel. Se corre entero en el editor SQL.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare
    v_id     constant text := 'mara-beauty-studio';
    t        record;
    v_vuelta integer;
    v_quedan integer;
begin
    if not exists (select 1 from public.catalog where company_id = v_id and id = 'mb-gel') then
        raise exception 'mara-beauty-studio no parece la empresa de ejemplo. No se borra nada.';
    end if;

    delete from public.appointment_services s using public.appointments a where s.appointment_id = a.id and a.company_id = v_id;

    -- Hijas primero; lo que no se pueda borrar todavía se reintenta en la vuelta siguiente.
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
end $$;

-- Comprobación: las dos a cero.
select (select count(*) from public.companies where id = 'mara-beauty-studio') as negocio,
       (select count(*) from public.tu_pagina where slug = 'mara-beauty-studio') as pagina;
