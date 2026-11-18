-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0013: todo gasto en un sitio, y el adelanto que se le da a un barbero
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 18-nov-2026 (The 24/7): «realiza adelantos o gastos, por ejemplo darle un
-- almuerzo; que cualquier gasto esté centralizado aquí, sin tantos botones». En su sistema de
-- antes los gastos eran «del negocio» o «personal», y los adelantos iban aparte.
--
--   · gastos.tipo: 'negocio' (luz, insumos, el almuerzo del equipo), 'adelanto' (a cuenta del
--     sueldo o la comisión de un barbero: se le DESCUENTA) o 'personal' (lo que retira el dueño).
--   · gastos.employee_id: a quién fue, si fue a alguien. Un adelanto siempre tiene a quién.
--   · agenda_gasto_guardar: igual que en la 0004, más tipo y barbero (validados aquí).
--   · mis_adelantos: lo que el barbero ve en «Mi comisión»: SUS adelantos de esas fechas. No ve
--     ningún otro gasto.
--   · caja_mas_vendidos: cuántas veces se vendió cada cosa del catálogo en los últimos 60 días,
--     para poner primero lo más pedido en «Cobrar ticket» y «Agregar».
--
-- Necesita la 0004 (gastos en la nube) y mi_empleado (roles del bot, 0041). Idempotente.
-- Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.gastos add column if not exists tipo text not null default 'negocio';
alter table public.gastos add column if not exists employee_id text not null default '';
do $$ begin
    alter table public.gastos add constraint gastos_tipo_valido check (tipo in ('negocio', 'adelanto', 'personal'));
exception when duplicate_object then null; end $$;
-- Los de antes con la categoría «Adelanto» (el panel la sugería) pasan a ser adelantos sin
-- barbero: no se descuentan a nadie hasta que se les ponga uno.
update public.gastos set tipo = 'adelanto' where tipo = 'negocio' and lower(btrim(categoria)) = 'adelanto';
create index if not exists gastos_adelantos on public.gastos (company_id, employee_id, fecha) where tipo = 'adelanto';

create or replace function public.agenda_gasto_guardar(p_company text, p_gasto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_id      text := coalesce(nullif(btrim(p_gasto->>'id'), ''), gen_random_uuid()::text);
    v_fecha   text := btrim(coalesce(p_gasto->>'fecha', ''));
    v_concepto text := btrim(coalesce(p_gasto->>'concepto', ''));
    v_tipo    text := coalesce(nullif(btrim(p_gasto->>'tipo'), ''), 'negocio');
    v_emp     text := btrim(coalesce(p_gasto->>'employee_id', ''));
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
    select * into v_previo from public.gastos where id = v_id;
    if found and v_previo.company_id <> p_company then raise exception 'Ese gasto no es de este negocio.'; end if;
    insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por, created_at, tipo, employee_id)
    values (v_id, p_company, v_fecha, v_concepto, btrim(coalesce(p_gasto->>'categoria', '')), v_importe,
            coalesce(v_previo.creado_por, (select auth.uid())::text, ''), coalesce(v_previo.created_at, extract(epoch from now())::bigint),
            v_tipo, v_emp)
    on conflict (id) do update
       set fecha = excluded.fecha, concepto = excluded.concepto, categoria = excluded.categoria, importe = excluded.importe,
           tipo = excluded.tipo, employee_id = excluded.employee_id;
    return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'importe', v_importe, 'tipo', v_tipo, 'employee_id', v_emp,
                              'nuevo', v_previo.id is null);
end $$;

-- Lo que ve el barbero: solo SUS adelantos, nada más de la caja.
create or replace function public.mis_adelantos(p_company text, p_desde text, p_hasta text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_ficha text;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    v_ficha := public.mi_empleado(p_company);
    if v_ficha is null then return jsonb_build_object('total', 0, 'filas', '[]'::jsonb); end if;
    return jsonb_build_object(
        'total', coalesce((select sum(importe) from public.gastos
                            where company_id = p_company and tipo = 'adelanto' and employee_id = v_ficha
                              and fecha between p_desde and p_hasta), 0),
        'filas', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'concepto', concepto, 'importe', importe) order by fecha desc)
                             from public.gastos
                            where company_id = p_company and tipo = 'adelanto' and employee_id = v_ficha
                              and fecha between p_desde and p_hasta), '[]'::jsonb));
end $$;

-- Lo más pedido primero: veces vendido cada ítem del catálogo en los últimos 60 días.
create or replace function public.caja_mas_vendidos(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company, true);
    return coalesce((
        select jsonb_object_agg(catalog_item_id, n)
          from (select s.catalog_item_id, count(*) as n
                  from public.appointment_services s
                  join public.appointments a on a.id = s.appointment_id
                 where s.company_id = p_company and a.company_id = p_company
                   and coalesce(s.catalog_item_id, '') <> ''
                   and a.status in ('confirmed', 'completed')
                   and a.slot_start >= to_char((now() at time zone 'America/Lima') - interval '60 days', 'YYYY-MM-DD')
                 group by s.catalog_item_id) t), '{}'::jsonb);
end $$;

revoke execute on function public.mis_adelantos(text, text, text) from public, anon;
grant execute on function public.mis_adelantos(text, text, text) to authenticated;
revoke execute on function public.caja_mas_vendidos(text) from public, anon;
grant execute on function public.caja_mas_vendidos(text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: tres «sí».
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gastos' and column_name = 'employee_id') as gastos_con_barbero,
       to_regprocedure('public.mis_adelantos(text, text, text)') is not null as adelantos,
       to_regprocedure('public.caja_mas_vendidos(text)') is not null as mas_vendidos;

-- Deshacer (vuelve a la 0004; las columnas se quedan, no estorban):
--   drop function if exists public.caja_mas_vendidos(text);
--   drop function if exists public.mis_adelantos(text, text, text);
--   y volver a correr agenda_gasto_guardar de modules/datos/sql/0004_agenda_en_nube.sql
