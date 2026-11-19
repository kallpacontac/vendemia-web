-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0020: el orden del menú del panel, por negocio
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (Kallpa): «Fideliza es lo que usan: lo primero luego del Dashboard; que sea
-- configurable las posiciones, mejor en Ajustes».
--
--   · menu_ajustes.orden: las direcciones del menú en el orden que quiere el negocio
--     ('/panel', '/panel/fideliza', …). Lo que no esté en la lista va detrás, en el orden de
--     siempre (una pantalla nueva aparece sola, al final).
--   · menu_ajustes.en_mas: las que van dentro de «Más» en vez de a la vista.
--   · Sin fila, el menú de siempre (components/panel/Sidebar.tsx decide por tipo de negocio).
--   · El dashboard va siempre primero y Ajustes siempre a la vista: el panel lo fuerza, no la base.
--
--   · menu_orden(company): lo lee cualquiera del negocio (el menú es de todos).
--   · menu_orden_guardar(company, orden, en_mas): dueño, administrador o equipo de Vendemia.
--     Con orden vacío vuelve al de siempre (borra la fila).
--
-- Y deja a kallpa con Fideliza justo detrás del Dashboard (si aún no eligió otro orden).
--
-- Idempotente. Pruebas: tests/pruebas_0020_pglite.mjs. Deshacer: drop table public.menu_ajustes cascade;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.menu_ajustes (
    company_id text primary key,
    orden      text[] not null default '{}',
    en_mas     text[] not null default '{}',
    updated_by uuid,
    updated_at timestamptz not null default now()
);
-- Solo por las funciones: nadie la lee ni la escribe directo.
alter table public.menu_ajustes enable row level security;
revoke all on public.menu_ajustes from anon, authenticated;

create or replace function public.menu_orden(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    m public.menu_ajustes;
begin
    if public.rol_en(p_company) is null and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
    select * into m from public.menu_ajustes where company_id = p_company;
    if not found then return jsonb_build_object('orden', '[]'::jsonb, 'en_mas', '[]'::jsonb); end if;
    return jsonb_build_object('orden', to_jsonb(m.orden), 'en_mas', to_jsonb(m.en_mas));
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
    -- Solo direcciones del panel, sin repetir, en el orden en que llegaron.
    select coalesce(array_agg(x order by i), '{}') into v_orden
      from (select distinct on (x) x, i from unnest(coalesce(p_orden, '{}')) with ordinality u(x, i)
             where x like '/panel%' and length(x) <= 80 order by x, i) d;
    select coalesce(array_agg(distinct x), '{}') into v_en_mas
      from unnest(coalesce(p_en_mas, '{}')) x where x like '/panel/%' and length(x) <= 80;
    if cardinality(v_orden) > 40 or cardinality(v_en_mas) > 40 then
        raise exception 'Demasiadas entradas en el menú.';
    end if;

    if cardinality(v_orden) = 0 and cardinality(v_en_mas) = 0 then
        delete from public.menu_ajustes where company_id = p_company;
    else
        insert into public.menu_ajustes (company_id, orden, en_mas, updated_by, updated_at)
        values (p_company, v_orden, v_en_mas, (select auth.uid()), now())
        on conflict (company_id) do update
           set orden = excluded.orden, en_mas = excluded.en_mas,
               updated_by = excluded.updated_by, updated_at = excluded.updated_at;
    end if;
    return jsonb_build_object('orden', to_jsonb(v_orden), 'en_mas', to_jsonb(v_en_mas));
end $$;

revoke all on function public.menu_orden(text) from public, anon;
revoke all on function public.menu_orden_guardar(text, text[], text[]) from public, anon;
grant execute on function public.menu_orden(text) to authenticated;
grant execute on function public.menu_orden_guardar(text, text[], text[]) to authenticated;

-- Kallpa: Fideliza es lo que usan. El resto, a la vista como hoy (Agenda/Clases, Clientes,
-- Caja…); Mia Gerente y Mensajes, en «Más».
insert into public.menu_ajustes (company_id, orden, en_mas)
select 'kallpa',
       array['/panel', '/panel/fideliza', '/panel/caja', '/panel/agenda', '/panel/alumnos', '/panel/leads',
             '/panel/asistente', '/panel/mensajes', '/panel/configuracion'],
       array['/panel/asistente', '/panel/mensajes']
 where exists (select 1 from public.companies where id = 'kallpa')
on conflict (company_id) do nothing;

commit;

notify pgrst, 'reload schema';

-- Comprobación: la fila de kallpa.
select company_id, orden, en_mas from public.menu_ajustes where company_id = 'kallpa';
