-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0018: la ficha del empleado · sus sedes, su teléfono y su DNI
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7): «en empleados necesitamos las sedes a las que corresponden y sus
-- teléfonos, todo desde el módulo de Equipo… DNI también».
--
-- En una tabla APARTE de employees (como el sueldo, 0016): employees la lee todo el equipo y
-- la página de reservas; el DNI y el celular de cada barbero no son para todos. Aquí se lee y
-- se cambia solo por estas funciones, y solo el dueño o el administrador:
--   · empleado_fichas_leer(company): { employee_id: { telefono, dni, sedes[] } }.
--   · empleado_ficha_guardar(company, employee_id, { telefono, dni, sedes }).
--
-- Sedes: los nombres de Mi página (secciones.citas.sedes). Vacío = trabaja en todas.
-- Necesita v2_autorizar_agenda y rol_en. Idempotente.
-- Deshacer: drop function public.empleado_ficha_guardar(text, text, jsonb);
--           drop function public.empleado_fichas_leer(text); drop table public.empleado_fichas;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.empleado_fichas (
    company_id      text not null,
    employee_id     text not null,
    telefono        text not null default '' check (telefono ~ '^\d{0,15}$'),
    dni             text not null default '' check (dni ~ '^[0-9A-Za-z]{0,12}$'),
    sedes           text[] not null default '{}',
    actualizado_por uuid,
    actualizado_at  timestamptz not null default now(),
    primary key (company_id, employee_id)
);
alter table public.empleado_fichas enable row level security;
revoke all on public.empleado_fichas from anon, authenticated;

create or replace function public.empleado_fichas_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        return '{}'::jsonb;
    end if;
    return coalesce((select jsonb_object_agg(employee_id, jsonb_build_object('telefono', telefono, 'dni', dni, 'sedes', to_jsonb(sedes)))
                       from public.empleado_fichas where company_id = p_company), '{}'::jsonb);
end $$;

create or replace function public.empleado_ficha_guardar(p_company text, p_employee text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d       jsonb := coalesce(p_datos, '{}'::jsonb);
    v_tel   text := right(regexp_replace(coalesce(d->>'telefono', ''), '\D', '', 'g'), 15);
    v_dni   text := upper(regexp_replace(coalesce(d->>'dni', ''), '[^0-9A-Za-z]', '', 'g'));
    v_sedes text[];
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'La ficha del empleado la cambia el dueño o el administrador.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.employees where id = p_employee and company_id = p_company) then
        raise exception 'Ese empleado no es de este negocio.' using errcode = '22023';
    end if;
    if v_tel <> '' and length(v_tel) < 9 then
        raise exception 'El teléfono tiene que tener 9 dígitos.' using errcode = '22023';
    end if;
    if length(v_dni) > 12 or (v_dni <> '' and length(v_dni) < 8) then
        raise exception 'El DNI tiene 8 dígitos (o el carné de extranjería, hasta 12).' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct left(btrim(x), 80)) filter (where btrim(x) <> ''), '{}') into v_sedes
      from jsonb_array_elements_text(case when jsonb_typeof(d->'sedes') = 'array' then d->'sedes' else '[]' end) x;

    insert into public.empleado_fichas (company_id, employee_id, telefono, dni, sedes, actualizado_por)
    values (p_company, p_employee, v_tel, v_dni, v_sedes, auth.uid())
    on conflict (company_id, employee_id) do update
        set telefono = excluded.telefono, dni = excluded.dni, sedes = excluded.sedes,
            actualizado_por = excluded.actualizado_por, actualizado_at = now();
    return jsonb_build_object('telefono', v_tel, 'dni', v_dni, 'sedes', to_jsonb(v_sedes));
end $$;

revoke execute on function public.empleado_fichas_leer(text) from public, anon;
revoke execute on function public.empleado_ficha_guardar(text, text, jsonb) from public, anon;
grant execute on function public.empleado_fichas_leer(text) to authenticated;
grant execute on function public.empleado_ficha_guardar(text, text, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y «sí».
select to_regprocedure('public.empleado_fichas_leer(text)') is not null as leer,
       to_regprocedure('public.empleado_ficha_guardar(text,text,jsonb)') is not null as guardar;
