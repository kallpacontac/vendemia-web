-- ═══════════════════════════════════════════════════════════════════════════════
-- DESHACER scripts/sosa-pelaez-alta.sql · borra el negocio sosa-pelaez entero
-- ═══════════════════════════════════════════════════════════════════════════════
-- ⚠️ También borra lo que el cliente haya hecho ya: reservas, clientes, pagos. Úsalo solo
-- si el alta salió mal y aún no hay nada real. NO borra cuentas ni toca la demo zona-gol.
-- Solo actúa si es la de este alta: exige las canchas sp-*.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare
    v_id     constant text := 'sosa-pelaez';
    t        record;
    v_vuelta integer;
    v_quedan integer;
begin
    if not exists (select 1 from public.catalog where company_id = v_id and id like 'sp-%') then
        raise exception 'sosa-pelaez no parece la del alta. No se borra nada.';
    end if;

    delete from public.appointment_services s using public.appointments a where s.appointment_id = a.id and a.company_id = v_id;

    -- Hijas primero: lo que no se pueda borrar aún se reintenta en la vuelta siguiente.
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
select (select count(*) from public.companies where id = 'sosa-pelaez') as negocio,
       (select count(*) from public.tu_pagina where slug = 'sosa-pelaez') as pagina;
