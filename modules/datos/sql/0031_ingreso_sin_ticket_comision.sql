-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0031: el ingreso sin ticket de un barbero SUMA a su comisión
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 24-nov-2026 (The 24/7, Alvaro): «al ingresar sin ticket no le suma en su comisión al barbero».
-- La 0026 lo dejó fuera a propósito; ahora cuenta, con estas reglas:
--
--   · caja_ingresos.suma_comision: si este ingreso cuenta para la comisión de su barbero. Con
--     barbero, SÍ de serie, sea cual sea el concepto (Alvaro: «si lo indica al barbero debería
--     sumarle su comisión, obvio»); el panel trae «Suma a su comisión» encendido y el dueño lo
--     puede apagar (datos.suma_comision = false). Sin barbero, nunca.
--   · caja_ingresos.comision_pct: el % del barbero el día que se apuntó, CONGELADO como en la 0011:
--     subirle el % luego no cambia lo que ya ganó. null = no tenía % ese día → se usa el de hoy
--     (la misma regla que «sin tarifa congelada no es una tarifa»).
--   · ingresos_con_comision(company, desde, hasta): los que suman, para Comisiones, Mi comisión y
--     los cierres. El dueño y el administrador ven todos; un empleado, solo los suyos.
--   · Los que ya estaban apuntados con barbero (desde la 0026) pasan a sumar, con el % que tenga
--     hoy su barbero.
--
-- La comisión se sigue calculando en el panel (lib/panel/comisiones.ts): aquí solo se guarda.
-- Necesita la 0026. Idempotente. Pruebas: tests/pruebas_0031_pglite.mjs. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.caja_ingresos add column if not exists suma_comision boolean not null default false;
alter table public.caja_ingresos add column if not exists comision_pct numeric(5,2);

-- Los de antes con barbero: suman, con el % de hoy.
do $$
begin
    if not exists (select 1 from public.caja_ingresos where suma_comision) then
        update public.caja_ingresos i
           set suma_comision = true,
               comision_pct = nullif((select e.comision_pct from public.employees e
                                       where e.company_id = i.company_id and e.id = i.employee_id), 0)
         where coalesce(i.employee_id, '') <> '';
    end if;
end $$;

create or replace function public.caja_ingresos_leer(p_company text, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'El cierre de caja es del dueño o del administrador.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'dia', i.dia, 'concepto', i.concepto, 'importe', i.importe,
                                            'metodo', i.metodo, 'sede', i.sede, 'employee_id', i.employee_id,
                                            'suma_comision', i.suma_comision, 'comision_pct', i.comision_pct,
                                            'creado_at', i.creado_at)
                         order by i.creado_at)
          from public.caja_ingresos i
         where i.company_id = p_company and i.dia = p_dia), '[]'::jsonb);
end $$;

create or replace function public.caja_ingreso_guardar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_fila public.caja_ingresos;
    v_dia  date;
    v_imp  numeric;
    v_emp  text := btrim(coalesce(p_datos->>'employee_id', ''));
    v_suma boolean;
    v_pct  numeric;
begin
    if coalesce(public.rol_en(p_company), '') <> 'dueno' then
        raise exception 'Los ingresos del día solo los apunta el dueño.' using errcode = '42501';
    end if;
    begin
        v_dia := (p_datos->>'dia')::date;
        v_imp := round((p_datos->>'importe')::numeric, 2);
    exception when others then
        raise exception 'Revisa el día y el importe.' using errcode = '22023';
    end;
    if v_dia is null or v_dia > current_date + 1 then raise exception 'Ese día no vale.' using errcode = '22023'; end if;
    if v_imp is null or v_imp <= 0 then raise exception '¿Cuánto entró?' using errcode = '22023'; end if;
    if btrim(coalesce(p_datos->>'concepto', '')) = '' then raise exception '¿De qué es el ingreso?' using errcode = '22023'; end if;
    if v_emp <> '' then
        select nullif(e.comision_pct, 0) into v_pct from public.employees e where e.company_id = p_company and e.id = v_emp;
        if not found then raise exception 'Ese barbero no es de este negocio.' using errcode = '22023'; end if;
    end if;
    -- Con barbero, a su comisión salvo que digan que no (el interruptor del panel).
    v_suma := v_emp <> '' and coalesce(case when p_datos ? 'suma_comision' then (p_datos->>'suma_comision')::boolean end, true);

    insert into public.caja_ingresos (company_id, dia, concepto, importe, metodo, sede, employee_id, suma_comision, comision_pct, creado_por)
    values (p_company, v_dia, left(btrim(p_datos->>'concepto'), 120), v_imp,
            coalesce(nullif(p_datos->>'metodo', ''), 'cash'), left(btrim(coalesce(p_datos->>'sede', '')), 120),
            v_emp, v_suma, case when v_suma then v_pct end, (select auth.uid()))
    returning * into v_fila;
    return to_jsonb(v_fila) - 'company_id' - 'creado_por';
end $$;

-- Los que suman a la comisión, entre dos días. Dueño/admin: todos; empleado: solo los suyos.
create or replace function public.ingresos_con_comision(p_company text, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_rol   text := public.rol_en(p_company);
    v_ficha text;
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        v_ficha := coalesce(public.mi_empleado(p_company), '');
        if v_ficha = '' then return '[]'::jsonb; end if;
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'dia', i.dia, 'concepto', i.concepto, 'importe', i.importe,
                                            'employee_id', i.employee_id, 'comision_pct', i.comision_pct,
                                            'creado_at', i.creado_at)
                         order by i.dia, i.creado_at)
          from public.caja_ingresos i
         where i.company_id = p_company and i.suma_comision and coalesce(i.employee_id, '') <> ''
           and i.dia between p_desde and p_hasta
           and (v_ficha is null or i.employee_id = v_ficha)), '[]'::jsonb);
end $$;

-- Pagarle (0014): el cierre lleva también sus ingresos sin ticket, como 'ingreso:<id>' en `citas`
-- (así «ya se pagó» se comprueba igual que con las citas). La de la 0014 tal cual, salvo eso.
create or replace function public.comision_cierre_guardar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d jsonb := coalesce(p_datos, '{}'::jsonb);
    v_emp text := btrim(coalesce(d->>'employee_id', ''));
    v_citas text[];
    v_adelantos text[];
    v_desde date;
    v_comision numeric;
    v_adelantado numeric;
    v_pagado numeric;
    v_metodo text := coalesce(nullif(btrim(d->>'metodo'), ''), 'efectivo');
    v_malas integer;
    v_fila public.comision_cierres;
    v_nombre text;
    v_gasto text := '';
begin
    perform public.v2_autorizar_agenda(p_company);

    select e.name into v_nombre from public.employees e where e.id = v_emp and e.company_id = p_company;
    if v_emp = '' or not found then
        raise exception 'Ese barbero no es de este negocio.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct x), '{}') into v_citas
      from jsonb_array_elements_text(case when jsonb_typeof(d->'citas') = 'array' then d->'citas' else '[]' end) x;
    select coalesce(array_agg(distinct x), '{}') into v_adelantos
      from jsonb_array_elements_text(case when jsonb_typeof(d->'adelantos') = 'array' then d->'adelantos' else '[]' end) x;
    if cardinality(v_citas) = 0 and cardinality(v_adelantos) = 0 then
        raise exception 'No hay nada que pagar.' using errcode = '22023';
    end if;
    begin
        v_desde := (d->>'desde')::date;
        v_comision := round(coalesce((d->>'comision')::numeric, 0), 2);
        v_adelantado := round(coalesce((d->>'adelantado')::numeric, 0), 2);
        v_pagado := round(coalesce((d->>'pagado')::numeric, 0), 2);
    exception when others then
        raise exception 'Los montos o la fecha no son válidos.' using errcode = '22023';
    end;
    if v_desde is null or v_comision < 0 or v_adelantado < 0 or v_pagado < 0 then
        raise exception 'Los montos o la fecha no son válidos.' using errcode = '22023';
    end if;

    -- Las citas: de este negocio, de este barbero y atendidas. Los ingresos: suyos y que suman.
    select count(*) into v_malas
      from unnest(v_citas) x
     where case when x like 'ingreso:%' then
                not exists (select 1 from public.caja_ingresos i
                             where i.id::text = substr(x, 9) and i.company_id = p_company
                               and i.employee_id = v_emp and i.suma_comision)
           else
                not exists (select 1 from public.appointments a
                             where a.id = x and a.company_id = p_company and a.employee_id = v_emp
                               and a.status = 'completed')
           end;
    if v_malas > 0 then
        raise exception 'Hay citas que no son de este barbero o no están atendidas. Recarga la página.' using errcode = '22023';
    end if;

    -- Que nadie las haya pagado ya (otra pestaña, otro celular). Bloqueo por negocio y barbero.
    perform pg_advisory_xact_lock(hashtext('comision_cierre:' || p_company || ':' || v_emp));
    if exists (select 1 from public.comision_cierres c
                where c.company_id = p_company and (c.citas && v_citas or c.adelantos && v_adelantos)) then
        raise exception 'Parte de esto ya se pagó en otro cierre. Recarga la página.' using errcode = '23505';
    end if;

    insert into public.comision_cierres (company_id, employee_id, desde, citas, adelantos, comision, adelantado,
                                         pagado, metodo, nota, pagado_por)
    values (p_company, v_emp, v_desde, v_citas, v_adelantos, v_comision, v_adelantado, v_pagado, v_metodo,
            left(btrim(coalesce(d->>'nota', '')), 200), auth.uid())
    returning * into v_fila;

    -- El dinero que salió, en la Caja de hoy (día de Lima).
    if v_pagado > 0 then
        v_gasto := 'cierre-' || v_fila.id::text;
        insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por)
        values (v_gasto, p_company, to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'),
                left('Comisión de ' || coalesce(nullif(btrim(v_nombre), ''), 'barbero') || ' (' || v_metodo || ')', 200),
                'Comisiones', v_pagado, coalesce(auth.uid()::text, ''));
        -- Con la 0013, el gasto dice a quién fue (y sigue siendo del negocio, no un adelanto).
        if exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'gastos' and column_name = 'employee_id') then
            execute 'update public.gastos set employee_id = $1 where id = $2' using v_emp, v_gasto;
        end if;
        update public.comision_cierres set gasto_id = v_gasto where id = v_fila.id returning * into v_fila;
    end if;
    return to_jsonb(v_fila) - 'company_id';
end $$;

revoke execute on function public.ingresos_con_comision(text, date, date) from public, anon;
grant execute on function public.ingresos_con_comision(text, date, date) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: cuántos ingresos de The 24/7 suman ahora a una comisión.
select count(*) filter (where suma_comision) as suman, count(*) filter (where coalesce(employee_id, '') <> '') as con_barbero
  from public.caja_ingresos where company_id = 'the247barbershop';

-- Deshacer (vuelve a la 0026): correr modules/datos/sql/0026_ingresos_por_barbero.sql y luego
--   drop function if exists public.ingresos_con_comision(text, date, date);
--   alter table public.caja_ingresos drop column if exists suma_comision, drop column if exists comision_pct;
