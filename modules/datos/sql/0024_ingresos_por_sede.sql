-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0024: los ingresos sin ticket, con su SEDE
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 20-nov-2026 (The 24/7): «las sedes por el ingreso sin ticket no lo tenemos». Con 2 sedes, el
-- cierre de cada local tiene que cuadrar con SU cajón: el ingreso se apunta en una sede.
--
--   · caja_ingresos.sede: el nombre de la sede (como en appointments.sede). '' = del negocio.
--   · caja_ingreso_guardar acepta datos.sede; caja_ingresos_leer la devuelve.
--
-- Necesita la 0023. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.caja_ingresos add column if not exists sede text not null default '';

create or replace function public.caja_ingresos_leer(p_company text, p_dia date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'El cierre de caja es del dueño o del administrador.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', i.id, 'dia', i.dia, 'concepto', i.concepto, 'importe', i.importe,
                                            'metodo', i.metodo, 'sede', i.sede, 'creado_at', i.creado_at)
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

    insert into public.caja_ingresos (company_id, dia, concepto, importe, metodo, sede, creado_por)
    values (p_company, v_dia, left(btrim(p_datos->>'concepto'), 120), v_imp,
            coalesce(nullif(p_datos->>'metodo', ''), 'cash'), left(btrim(coalesce(p_datos->>'sede', '')), 120),
            (select auth.uid()))
    returning * into v_fila;
    return to_jsonb(v_fila) - 'company_id' - 'creado_por';
end $$;

commit;

notify pgrst, 'reload schema';

select exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'caja_ingresos' and column_name = 'sede') as ingresos_por_sede;
