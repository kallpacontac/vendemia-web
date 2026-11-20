-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0028: gastos y adelantos con su SEDE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 20-nov-2026 (The 24/7): con 2 locales, el Cierre de cada sede tiene que cuadrar con SU cajón.
--
--   · gastos.sede: el nombre de la sede (como appointments.sede). '' = de todo el negocio.
--   · Adelanto (o gasto para un barbero): la sede SE DEDUCE de su ficha si tiene UNA sola sede
--     (empleado_fichas.sedes, datos 0018). Nadie elige nada.
--   · Gasto del negocio o personal: sede OPCIONAL (p_gasto.sede). Sin elegir, de todo el negocio
--     (la luz, los insumos compartidos) y se ve en «Todas las sedes».
--   · agenda_gasto_guardar: la de la 0013, más la sede. Lo demás, igual.
--
-- Necesita la 0013 y la 0018. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.gastos add column if not exists sede text not null default '';

-- La sede de un barbero, si tiene una sola en su ficha. '' si ninguna o varias.
create or replace function public.v2_sede_del_barbero(p_company text, p_employee text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_sedes text[];
begin
    if coalesce(p_employee, '') = '' or to_regclass('public.empleado_fichas') is null then return ''; end if;
    execute 'select sedes from public.empleado_fichas where company_id = $1 and employee_id = $2'
       into v_sedes using p_company, p_employee;
    return case when cardinality(coalesce(v_sedes, '{}')) = 1 then v_sedes[1] else '' end;
end $$;
revoke execute on function public.v2_sede_del_barbero(text, text) from public, anon, authenticated;

create or replace function public.agenda_gasto_guardar(p_company text, p_gasto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_id      text := coalesce(nullif(btrim(p_gasto->>'id'), ''), gen_random_uuid()::text);
    v_fecha   text := btrim(coalesce(p_gasto->>'fecha', ''));
    v_concepto text := btrim(coalesce(p_gasto->>'concepto', ''));
    v_tipo    text := coalesce(nullif(btrim(p_gasto->>'tipo'), ''), 'negocio');
    v_emp     text := btrim(coalesce(p_gasto->>'employee_id', ''));
    v_sede    text := left(btrim(coalesce(p_gasto->>'sede', '')), 120);
    v_importe numeric;
    v_previo  public.gastos;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_concepto = '' then raise exception 'Falta el concepto del gasto.'; end if;
    if v_fecha !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'La fecha del gasto tiene que ser YYYY-MM-DD.'; end if;
    begin
        v_importe := (p_gasto->>'importe')::numeric;
    exception when others then
        v_importe := null;
    end;
    if v_importe is null or v_importe <= 0 then raise exception 'Escribe cuánto fue: un número mayor que 0.'; end if;
    if v_tipo not in ('negocio', 'adelanto', 'personal') then raise exception 'Ese tipo de gasto no existe.'; end if;
    if v_tipo = 'adelanto' and v_emp = '' then raise exception 'Un adelanto es para alguien: elige el barbero.'; end if;
    if v_tipo = 'personal' then v_emp := ''; end if;
    if v_emp <> '' and not exists (select 1 from public.employees where company_id = p_company and id = v_emp) then
        raise exception 'Ese barbero no es de este negocio.';
    end if;
    -- Para un barbero, sin sede elegida: la de su ficha (si tiene una sola).
    if v_sede = '' and v_emp <> '' then v_sede := public.v2_sede_del_barbero(p_company, v_emp); end if;

    select * into v_previo from public.gastos where id = v_id;
    if found and v_previo.company_id <> p_company then raise exception 'Ese gasto no es de este negocio.'; end if;
    insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por, created_at, tipo, employee_id, sede)
    values (v_id, p_company, v_fecha, v_concepto, btrim(coalesce(p_gasto->>'categoria', '')), v_importe,
            coalesce(v_previo.creado_por, (select auth.uid())::text, ''), coalesce(v_previo.created_at, extract(epoch from now())::bigint),
            v_tipo, v_emp, v_sede)
    on conflict (id) do update
       set fecha = excluded.fecha, concepto = excluded.concepto, categoria = excluded.categoria, importe = excluded.importe,
           tipo = excluded.tipo, employee_id = excluded.employee_id, sede = excluded.sede;
    return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'importe', v_importe, 'tipo', v_tipo, 'employee_id', v_emp,
                              'sede', v_sede, 'nuevo', v_previo.id is null);
end $$;

-- Los adelantos que ya están: la sede de su barbero (si tiene una sola).
update public.gastos g set sede = public.v2_sede_del_barbero(g.company_id, g.employee_id)
 where g.sede = '' and g.employee_id <> '';

commit;

notify pgrst, 'reload schema';

select exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'gastos' and column_name = 'sede') as gastos_por_sede;
