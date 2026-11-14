-- ═══════════════════════════════════════════════════════════════════════════════
-- Deshacer scripts/the247-alta.sql: borra el negocio `the247barbershop` entero (página, catálogo,
-- accesos, Fideliza…). Es un CLIENTE REAL: se niega si ya tiene citas o tarjetas de puntos, salvo
-- que pongas v_forzar := true sabiendo que se pierden.
-- Las cuentas de usuario no se tocan. Las fotos de public/assets/the247/ tampoco.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;

do $$
declare
    v_forzar boolean := false;   -- true = borrar aunque ya tenga citas o tarjetas
    v_id     constant text := 'the247barbershop';
    t        record;
    v_vuelta integer;
    v_quedan integer;
begin
    if not exists (select 1 from public.catalog where company_id = v_id and id = 't247-corte') then
        raise exception '% no parece el alta de the247-alta.sql. No se borra nada.', v_id;
    end if;
    if not v_forzar and (exists (select 1 from public.appointments where company_id = v_id)
                         or exists (select 1 from public.loyalty_members where company_id = v_id)) then
        raise exception '% ya tiene citas o tarjetas de clientes reales. Si de verdad quieres borrarlo, pon v_forzar := true.', v_id;
    end if;

    delete from public.appointment_services s using public.appointments a where s.appointment_id = a.id and a.company_id = v_id;

    -- Hijas primero; lo que no se pueda borrar todavía se reintenta en la vuelta siguiente.
    for v_vuelta in 1 .. 8 loop
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

alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;

commit;

select (select count(*) from public.companies where id = 'the247barbershop') as negocio,
       (select count(*) from public.tu_pagina where slug = 'the247barbershop') as pagina,
       (select count(*) from public.loyalty_settings where slug = 'the247barbershop') as fideliza;
