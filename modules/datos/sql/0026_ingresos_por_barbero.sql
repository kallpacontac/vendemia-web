-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0026: los ingresos sin ticket, también con su BARBERO
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 20-nov-2026 (The 24/7): «necesito que el ingreso y cierre sea por barbero también». Con la 0024
-- un ingreso sin ticket ya dice su sede; ahora puede decir además de quién es (un corte que se
-- cobró sin ticket lo hizo alguien), y el Cierre del día se puede mirar por barbero.
--
--   · caja_ingresos.employee_id: la ficha del barbero ('' = del negocio, como antes).
--   · caja_ingreso_guardar acepta datos.employee_id (tiene que ser de este negocio);
--     caja_ingresos_leer lo devuelve. Lo demás, igual que la 0024 (sede incluida).
--   · NO suma a su comisión: la comisión sale de lo que atendió con ticket o cita (datos 0011).
--     Esto es para que el cierre de cada uno cuadre con lo que entregó.
--
-- Necesita la 0023 y la 0024. Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.caja_ingresos add column if not exists employee_id text not null default '';

create or replace function public.caja_ingresos_leer(p_company text, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'El cierre de caja es del dueño o del administrador.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'dia', i.dia, 'concepto', i.concepto, 'importe', i.importe,
                                            'metodo', i.metodo, 'sede', i.sede, 'employee_id', i.employee_id,
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
    if v_emp <> '' and not exists (select 1 from public.employees where company_id = p_company and id = v_emp) then
        raise exception 'Ese barbero no es de este negocio.' using errcode = '22023';
    end if;

    insert into public.caja_ingresos (company_id, dia, concepto, importe, metodo, sede, employee_id, creado_por)
    values (p_company, v_dia, left(btrim(p_datos->>'concepto'), 120), v_imp,
            coalesce(nullif(p_datos->>'metodo', ''), 'cash'), left(btrim(coalesce(p_datos->>'sede', '')), 120),
            v_emp, (select auth.uid()))
    returning * into v_fila;
    return to_jsonb(v_fila) - 'company_id' - 'creado_por';
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'caja_ingresos' and column_name = 'employee_id') as ingresos_por_barbero;

-- Deshacer (vuelve a la 0024): correr modules/datos/sql/0024_ingresos_por_sede.sql y luego
--   alter table public.caja_ingresos drop column if exists employee_id;
