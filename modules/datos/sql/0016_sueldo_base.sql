-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0016: sueldo base del empleado (opcional)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7): «en empleados, ingresa su sueldo base, opcional claro».
--
-- En una tabla APARTE y no como columna de employees, a propósito: employees la lee todo el
-- equipo (Mia, la agenda del barbero, la página al reservar). Un sueldo ahí lo vería cualquier
-- barbero, el de todos. Aquí nadie lee directo; solo por estas funciones:
--   · empleado_sueldos_leer(company): { employee_id: sueldo } (solo el dueño).
--   · empleado_sueldo_guardar(company, employee_id, sueldo): null o 0 = sin sueldo base (solo el dueño).
--
-- Mensual, en soles. Necesita v2_autorizar_agenda y rol_en. Idempotente.
-- Deshacer: drop function public.empleado_sueldo_guardar(text, text, numeric);
--           drop function public.empleado_sueldos_leer(text); drop table public.empleado_sueldos;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.empleado_sueldos (
    company_id     text not null,
    employee_id    text not null,
    sueldo_base    numeric(12,2) not null check (sueldo_base > 0 and sueldo_base <= 100000),
    actualizado_por uuid,
    actualizado_at timestamptz not null default now(),
    primary key (company_id, employee_id)
);
alter table public.empleado_sueldos enable row level security;
revoke all on public.empleado_sueldos from anon, authenticated;

create or replace function public.empleado_sueldos_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if public.rol_en(p_company) is distinct from 'dueno' then
        return '{}'::jsonb;   -- los demás no ven sueldos (ni el administrador)
    end if;
    return coalesce((select jsonb_object_agg(employee_id, sueldo_base)
                       from public.empleado_sueldos where company_id = p_company), '{}'::jsonb);
end $$;

create or replace function public.empleado_sueldo_guardar(p_company text, p_employee text, p_sueldo numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if public.rol_en(p_company) is distinct from 'dueno' then
        raise exception 'El sueldo solo lo cambia el dueño.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.employees where id = p_employee and company_id = p_company) then
        raise exception 'Ese empleado no es de este negocio.' using errcode = '22023';
    end if;
    if p_sueldo is null or p_sueldo <= 0 then
        delete from public.empleado_sueldos where company_id = p_company and employee_id = p_employee;
        return jsonb_build_object('employee_id', p_employee, 'sueldo_base', null);
    end if;
    if p_sueldo > 100000 then
        raise exception 'Ese sueldo es demasiado alto: revisa el número.' using errcode = '22023';
    end if;
    insert into public.empleado_sueldos (company_id, employee_id, sueldo_base, actualizado_por)
    values (p_company, p_employee, round(p_sueldo, 2), auth.uid())
    on conflict (company_id, employee_id) do update
        set sueldo_base = excluded.sueldo_base, actualizado_por = excluded.actualizado_por, actualizado_at = now();
    return jsonb_build_object('employee_id', p_employee, 'sueldo_base', round(p_sueldo, 2));
end $$;

revoke execute on function public.empleado_sueldos_leer(text) from public, anon;
revoke execute on function public.empleado_sueldo_guardar(text, text, numeric) from public, anon;
grant execute on function public.empleado_sueldos_leer(text) to authenticated;
grant execute on function public.empleado_sueldo_guardar(text, text, numeric) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y «sí».
select to_regprocedure('public.empleado_sueldos_leer(text)') is not null as leer,
       to_regprocedure('public.empleado_sueldo_guardar(text,text,numeric)') is not null as guardar;
