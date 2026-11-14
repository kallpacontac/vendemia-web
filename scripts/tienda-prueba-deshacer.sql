-- ═══════════════════════════════════════════════════════════════════════════════
-- DESHACER la tienda de scripts/tienda-prueba-alta.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Borra TODO lo de `tienda-prueba`, también los pedidos de prueba hechos después. No toca
-- ninguna cuenta. Solo actúa si es la de prueba (exige el producto tp-pollo). Se corre entero.

do $$
declare
    v_id     constant text := 'tienda-prueba';
    t        record;
    v_vuelta integer;
    v_quedan integer;
begin
    if not exists (select 1 from public.catalog where company_id = v_id and id = 'tp-pollo') then
        raise exception 'tienda-prueba no parece la tienda de prueba. No se borra nada.';
    end if;
    -- Hijas primero; lo que aún tenga dependientes se reintenta en la vuelta siguiente.
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

select (select count(*) from public.companies where id = 'tienda-prueba') as negocio,
       (select count(*) from public.tu_pagina where slug = 'tienda-prueba') as pagina;
