-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0023: ingresos sueltos del día en el Cierre de caja (solo el dueño los apunta)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 19-nov-2026 (The 24/7): «en el cierre de caja, solo para la cuenta del dueño, que pueda
-- ingresar los ingresos del día y los gastos/adelantos».
--
-- Un ingreso suelto es dinero que entró a la caja sin un ticket: un corte que no se anotó, una
-- venta por fuera, un fondo que se puso. Suma a «Entró, por método» y al neto del día.
--
--   · caja_ingresos_leer(company, dia)        dueño o administrador (el cierre tiene que cuadrar).
--   · caja_ingreso_guardar(company, datos)    SOLO el dueño. datos: {dia, concepto, importe, metodo}.
--   · caja_ingreso_borrar(company, id)        SOLO el dueño.
--
-- La tabla no se lee ni se escribe directo: solo por estas funciones. Idempotente.
-- Deshacer: drop table public.caja_ingresos cascade;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.caja_ingresos (
    id         uuid primary key default gen_random_uuid(),
    company_id text not null,
    dia        date not null,
    concepto   text not null check (char_length(concepto) between 1 and 120),
    importe    numeric(12,2) not null check (importe > 0 and importe < 1000000),
    metodo     text not null check (metodo in ('cash', 'yape', 'plin', 'bank_transfer')),
    creado_por uuid,
    creado_at  timestamptz not null default now()
);
create index if not exists caja_ingresos_por_dia on public.caja_ingresos (company_id, dia);
alter table public.caja_ingresos enable row level security;
revoke all on public.caja_ingresos from anon, authenticated;

create or replace function public.caja_ingresos_leer(p_company text, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'El cierre de caja es del dueño o del administrador.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'dia', i.dia, 'concepto', i.concepto,
                                            'importe', i.importe, 'metodo', i.metodo, 'creado_at', i.creado_at)
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

    insert into public.caja_ingresos (company_id, dia, concepto, importe, metodo, creado_por)
    values (p_company, v_dia, left(btrim(p_datos->>'concepto'), 120), v_imp,
            coalesce(nullif(p_datos->>'metodo', ''), 'cash'), (select auth.uid()))
    returning * into v_fila;
    return to_jsonb(v_fila) - 'company_id' - 'creado_por';
end $$;

create or replace function public.caja_ingreso_borrar(p_company text, p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
    n integer;
begin
    if coalesce(public.rol_en(p_company), '') <> 'dueno' then
        raise exception 'Los ingresos del día solo los borra el dueño.' using errcode = '42501';
    end if;
    delete from public.caja_ingresos where company_id = p_company and id = p_id;
    get diagnostics n = row_count;
    return n;
end $$;

revoke execute on function public.caja_ingresos_leer(text, date) from public, anon;
revoke execute on function public.caja_ingreso_guardar(text, jsonb) from public, anon;
revoke execute on function public.caja_ingreso_borrar(text, uuid) from public, anon;
grant execute on function public.caja_ingresos_leer(text, date) to authenticated;
grant execute on function public.caja_ingreso_guardar(text, jsonb) to authenticated;
grant execute on function public.caja_ingreso_borrar(text, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

select to_regprocedure('public.caja_ingreso_guardar(text,jsonb)') is not null as ingresos_de_caja;
