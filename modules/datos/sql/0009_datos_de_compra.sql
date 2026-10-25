-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0009: datos de compra de cada producto (24-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Para que Mia Gerente diga CUÁNTO pedir y CUÁNDO (docs/prompt-bot-mia-gerente-consejos.md,
-- parte 3; encargo al bot en docs/prompt-bot-mia-gerente-compras.md). La cuenta la hace el bot
-- con las ventas; aquí solo lo que sabe el dueño y no sale de ningún otro dato:
--
--   · catalogo_compras: cuánto tarda en llegar, cada cuánto compra, por cuántas viene la caja.
--     Lo ven y lo cambian el dueño y el administrador.
--   · catalogo_costos: cuánto le cuesta cada unidad. SOLO el dueño (el administrador no ve
--     dinero del negocio: ni costo ni margen). Tabla aparte para que el RLS lo impida, no la
--     pantalla.
--
-- Hasta hoy el costo vivía solo en el SQLite del bot (`catalog_costos`, cargado por script).
-- El bot lo sube aquí una vez y desde entonces lee de aquí (encargo, §1).
--
-- Se guarda con `compras_guardar` (un solo botón en la ficha). El bot lee con `compras_srv_de`.
-- APLICAR: después de la 0008. Prueba: tests/pruebas_0009.sql. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.catalogo_compras (
    catalog_id       text primary key,
    company_id       text not null references public.companies(id) on delete cascade,
    -- Desde que lo pide hasta que lo tiene para vender. 0 = lo consigue el mismo día.
    dias_reposicion  integer check (dias_reposicion is null or dias_reposicion between 0 and 365),
    -- Cada cuánto hace pedido al proveedor.
    cada_cuanto      integer check (cada_cuanto is null or cada_cuanto between 1 and 365),
    -- Si se lo venden por caja o docena: para redondear el pedido.
    por_caja         integer check (por_caja is null or por_caja between 1 and 100000),
    cambiada_at      timestamptz not null default now()
);
create index if not exists ix_catalogo_compras_company on public.catalogo_compras (company_id);

create table if not exists public.catalogo_costos (
    catalog_id   text primary key,
    company_id   text not null references public.companies(id) on delete cascade,
    costo        numeric(12, 2) not null check (costo >= 0),
    cambiada_at  timestamptz not null default now()
);
create index if not exists ix_catalogo_costos_company on public.catalogo_costos (company_id);

alter table public.catalogo_compras enable row level security;
alter table public.catalogo_costos  enable row level security;
revoke all on public.catalogo_compras from anon, authenticated;
revoke all on public.catalogo_costos  from anon, authenticated;
grant select on public.catalogo_compras to authenticated;
grant select on public.catalogo_costos  to authenticated;

drop policy if exists p_catalogo_compras_leer on public.catalogo_compras;
create policy p_catalogo_compras_leer on public.catalogo_compras
    for select to authenticated using ((select public.rol_en(company_id)) in ('dueno', 'admin'));
drop policy if exists p_catalogo_costos_leer on public.catalogo_costos;
create policy p_catalogo_costos_leer on public.catalogo_costos
    for select to authenticated using ((select public.rol_en(company_id)) = 'dueno');

-- Guardar desde la ficha. Solo cambia las claves que vienen; null = vaciar ese dato.
-- `costo` solo lo puede mandar el dueño.
create or replace function public.compras_guardar(p_company text, p_catalog text, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
    v_rol  text := coalesce(public.rol_en(p_company), '');
    v_num  integer;
    v_cost numeric;
begin
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Esto lo cambia el dueño o el administrador.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.catalog where id = p_catalog and company_id = p_company) then
        raise exception 'Ese producto no está en tu catálogo.';
    end if;

    if p_datos ?| array['dias_reposicion', 'cada_cuanto', 'por_caja'] then
        insert into public.catalogo_compras (catalog_id, company_id) values (p_catalog, p_company)
        on conflict (catalog_id) do nothing;
        if p_datos ? 'dias_reposicion' then
            v_num := nullif(p_datos->>'dias_reposicion', '')::integer;
            if v_num is not null and v_num not between 0 and 365 then
                raise exception 'Lo que tarda en llegar va de 0 a 365 días.';
            end if;
            update public.catalogo_compras set dias_reposicion = v_num where catalog_id = p_catalog;
        end if;
        if p_datos ? 'cada_cuanto' then
            v_num := nullif(p_datos->>'cada_cuanto', '')::integer;
            if v_num is not null and v_num not between 1 and 365 then
                raise exception 'Cada cuánto compras va de 1 a 365 días.';
            end if;
            update public.catalogo_compras set cada_cuanto = v_num where catalog_id = p_catalog;
        end if;
        if p_datos ? 'por_caja' then
            v_num := nullif(p_datos->>'por_caja', '')::integer;
            if v_num is not null and v_num not between 1 and 100000 then
                raise exception 'La caja tiene que traer de 1 unidad en adelante.';
            end if;
            update public.catalogo_compras set por_caja = v_num where catalog_id = p_catalog;
        end if;
        update public.catalogo_compras set cambiada_at = now() where catalog_id = p_catalog;
        -- Sin ningún dato, la fila sobra.
        delete from public.catalogo_compras
         where catalog_id = p_catalog and dias_reposicion is null and cada_cuanto is null and por_caja is null;
    end if;

    if p_datos ? 'costo' then
        if v_rol <> 'dueno' then
            raise exception 'El costo lo pone el dueño.' using errcode = '42501';
        end if;
        v_cost := nullif(p_datos->>'costo', '')::numeric;
        if v_cost is null then
            delete from public.catalogo_costos where catalog_id = p_catalog;
        elsif v_cost < 0 then
            raise exception 'El costo no puede ser negativo.';
        else
            insert into public.catalogo_costos (catalog_id, company_id, costo) values (p_catalog, p_company, v_cost)
            on conflict (catalog_id) do update set costo = excluded.costo, cambiada_at = now();
        end if;
    end if;
end $$;

-- Lo que lee el bot, todo junto: [{catalog_id, costo, dias_reposicion, cada_cuanto, por_caja}].
create or replace function public.compras_srv_de(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    return (
        select coalesce(jsonb_agg(jsonb_build_object(
                   'catalog_id', x.catalog_id, 'costo', k.costo, 'dias_reposicion', c.dias_reposicion,
                   'cada_cuanto', c.cada_cuanto, 'por_caja', c.por_caja)), '[]'::jsonb)
          from (select catalog_id from public.catalogo_compras where company_id = p_company
                union
                select catalog_id from public.catalogo_costos where company_id = p_company) x
          left join public.catalogo_compras c on c.catalog_id = x.catalog_id
          left join public.catalogo_costos  k on k.catalog_id = x.catalog_id
    );
end $$;

-- El bot sube de una vez los costos que tenía en su SQLite. No pisa uno que ya puso el dueño aquí.
create or replace function public.costos_srv_subir(p_company text, p_costos jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    insert into public.catalogo_costos (catalog_id, company_id, costo)
    select e->>'catalog_id', p_company, (e->>'costo')::numeric
      from jsonb_array_elements(coalesce(p_costos, '[]'::jsonb)) e
     where (e->>'costo')::numeric >= 0
       and exists (select 1 from public.catalog c where c.id = e->>'catalog_id' and c.company_id = p_company)
    on conflict (catalog_id) do nothing;
    get diagnostics v_n = row_count;
    return v_n;
end $$;

revoke execute on function public.compras_guardar(text, text, jsonb)  from public, anon;
revoke execute on function public.compras_srv_de(text)                from public, anon, authenticated;
revoke execute on function public.costos_srv_subir(text, jsonb)       from public, anon, authenticated;
grant  execute on function public.compras_guardar(text, text, jsonb)  to authenticated;
grant  execute on function public.compras_srv_de(text)                to service_role;
grant  execute on function public.costos_srv_subir(text, jsonb)       to service_role;
grant  select on public.catalogo_compras, public.catalogo_costos to service_role;

commit;
