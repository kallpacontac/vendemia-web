-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0022: ¿el equipo ve Fideliza? Lo decide cada negocio
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 19-nov-2026 (The 24/7): «Fideliza no deberían verlo los empleados (debe ser configurable)».
-- En Kallpa, en cambio, el equipo SÍ lo usa: escanea las tarjetas en el mostrador.
--
--   · menu_ajustes.equipo_fideliza: null = como siempre (lo ve); false = el empleado no lo ve
--     (ni en el menú ni entrando por la dirección); true = lo ve.
--   · menu_orden(company) lo devuelve junto al orden del menú: el panel ya lo lee al entrar.
--   · menu_equipo_fideliza_guardar(company, ve): dueño, administrador o equipo de Vendemia.
--   · menu_orden_guardar: «Volver al de siempre» ya no borra la fila si guarda este ajuste.
--
-- Esto ESCONDE la pantalla. Lo que el empleado puede hacer en Fideliza lo siguen imponiendo
-- sus propios roles en la base (modules/fideliza).
--
-- Deja a The 24/7 con Fideliza oculto para el equipo. Necesita la 0020. Idempotente.
-- Deshacer: alter table public.menu_ajustes drop column equipo_fideliza; (y volver a correr la 0020).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.menu_ajustes add column if not exists equipo_fideliza boolean;

create or replace function public.menu_orden(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    m public.menu_ajustes;
begin
    if public.rol_en(p_company) is null and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
    select * into m from public.menu_ajustes where company_id = p_company;
    if not found then
        return jsonb_build_object('orden', '[]'::jsonb, 'en_mas', '[]'::jsonb, 'equipo_fideliza', null);
    end if;
    return jsonb_build_object('orden', to_jsonb(m.orden), 'en_mas', to_jsonb(m.en_mas),
                              'equipo_fideliza', to_jsonb(m.equipo_fideliza));
end $$;

create or replace function public.menu_orden_guardar(p_company text, p_orden text[], p_en_mas text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_orden  text[];
    v_en_mas text[];
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') and not public.es_admin_plataforma() then
        raise exception 'El orden del menú lo cambia el dueño o el administrador.' using errcode = '42501';
    end if;
    select coalesce(array_agg(x order by i), '{}') into v_orden
      from (select distinct on (x) x, i from unnest(coalesce(p_orden, '{}')) with ordinality u(x, i)
             where x like '/panel%' and length(x) <= 80 order by x, i) d;
    select coalesce(array_agg(distinct x), '{}') into v_en_mas
      from unnest(coalesce(p_en_mas, '{}')) x where x like '/panel/%' and length(x) <= 80;
    if cardinality(v_orden) > 40 or cardinality(v_en_mas) > 40 then
        raise exception 'Demasiadas entradas en el menú.';
    end if;

    insert into public.menu_ajustes (company_id, orden, en_mas, updated_by, updated_at)
    values (p_company, v_orden, v_en_mas, (select auth.uid()), now())
    on conflict (company_id) do update
       set orden = excluded.orden, en_mas = excluded.en_mas,
           updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    -- Sin orden y sin el ajuste de Fideliza, no queda nada que guardar: el de siempre.
    delete from public.menu_ajustes
     where company_id = p_company and cardinality(orden) = 0 and cardinality(en_mas) = 0 and equipo_fideliza is null;
    return jsonb_build_object('orden', to_jsonb(v_orden), 'en_mas', to_jsonb(v_en_mas));
end $$;

create or replace function public.menu_equipo_fideliza_guardar(p_company text, p_ve boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') and not public.es_admin_plataforma() then
        raise exception 'Esto lo cambia el dueño o el administrador.' using errcode = '42501';
    end if;
    insert into public.menu_ajustes (company_id, equipo_fideliza, updated_by, updated_at)
    values (p_company, p_ve, (select auth.uid()), now())
    on conflict (company_id) do update
       set equipo_fideliza = excluded.equipo_fideliza, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    delete from public.menu_ajustes
     where company_id = p_company and cardinality(orden) = 0 and cardinality(en_mas) = 0 and equipo_fideliza is null;
    return p_ve;
end $$;

revoke all on function public.menu_equipo_fideliza_guardar(text, boolean) from public, anon;
grant execute on function public.menu_equipo_fideliza_guardar(text, boolean) to authenticated;

-- The 24/7: los barberos no ven Fideliza (lo lleva la caja).
insert into public.menu_ajustes (company_id, equipo_fideliza)
select 'the247barbershop', false
 where exists (select 1 from public.companies where id = 'the247barbershop')
on conflict (company_id) do update set equipo_fideliza = false;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «false» para The 24/7.
select company_id, equipo_fideliza from public.menu_ajustes where company_id = 'the247barbershop';
