-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0005 · Lo del mayorista: código, precio por mayor y pedido mínimo
--
-- Lo que pide quien compra al por mayor y que sale en el catálogo en PDF
-- (/<negocio>/catalogo.pdf, docs/PLAN-TU-PAGINA.md §7.1):
--   · codigo         «P-015», para pedir rápido por WhatsApp.
--   · precio_mayor   el precio por unidad desde `desde` unidades («desde 12 u.: S/ 18»).
--   · pedido_minimo  unidades mínimas por pedido.
--
-- Tabla APARTE de `catalog` a propósito: catalog es configuración que el bot baja
-- a SQLite (arquitectura v2) y la escribe cfg_producto_guardar; esto no lo usa
-- Mia, solo la página. Una fila por producto, solo si tiene algo.
--
-- Leer: cualquier miembro del negocio (RLS). Escribir: dueño o admin, por
-- catalogo_mayorista_guardar. La página pública lee por catalogo_mayorista_srv
-- (clave de servidor, como el resto de *_srv_*), solo de páginas publicadas.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.catalogo_mayorista (
    catalog_id     text primary key,
    company_id     text not null references public.companies(id) on delete cascade,
    codigo         text not null default '' check (char_length(codigo) <= 30),
    precio_mayor   numeric(12, 2) check (precio_mayor is null or precio_mayor >= 0),
    desde          integer check (desde is null or desde between 2 and 100000),
    pedido_minimo  integer check (pedido_minimo is null or pedido_minimo between 1 and 100000),
    cambiada_at    timestamptz not null default now(),
    -- Precio por mayor y «desde» van juntos: uno sin el otro no se puede leer.
    constraint catalogo_mayorista_par check ((precio_mayor is null) = (desde is null))
);
create index if not exists catalogo_mayorista_company on public.catalogo_mayorista (company_id);

alter table public.catalogo_mayorista enable row level security;
revoke all on public.catalogo_mayorista from anon, authenticated;
grant select on public.catalogo_mayorista to authenticated;

drop policy if exists catalogo_mayorista_leer on public.catalogo_mayorista;
create policy catalogo_mayorista_leer on public.catalogo_mayorista
    for select to authenticated using ((select public.is_member(company_id)));

-- Guarda lo de un producto (todo junto: lo que no viene, se vacía). Sin nada, borra la fila.
create or replace function public.catalogo_mayorista_guardar(p_company text, p_catalog text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_codigo text    := btrim(coalesce(p_datos->>'codigo', ''));
    v_precio numeric := nullif(p_datos->>'precio_mayor', '')::numeric;
    v_desde  integer := nullif(p_datos->>'desde', '')::integer;
    v_minimo integer := nullif(p_datos->>'pedido_minimo', '')::integer;
begin
    perform public.tu_pagina_autorizar(p_company);
    if not exists (select 1 from public.catalog where id = p_catalog and company_id = p_company) then
        raise exception 'tu_pagina:no_existe';
    end if;
    if (v_precio is null) <> (v_desde is null) then
        raise exception 'tu_pagina:mayor_incompleto' using hint = 'Precio por mayor y «desde cuántas» van juntos';
    end if;

    if v_codigo = '' and v_precio is null and v_minimo is null then
        delete from public.catalogo_mayorista where catalog_id = p_catalog and company_id = p_company;
        return jsonb_build_object('status', 'ok', 'vacio', true);
    end if;

    insert into public.catalogo_mayorista (catalog_id, company_id, codigo, precio_mayor, desde, pedido_minimo)
    values (p_catalog, p_company, v_codigo, v_precio, v_desde, v_minimo)
    on conflict (catalog_id) do update set
        codigo = excluded.codigo, precio_mayor = excluded.precio_mayor, desde = excluded.desde,
        pedido_minimo = excluded.pedido_minimo, cambiada_at = now()
    where catalogo_mayorista.company_id = p_company;
    return jsonb_build_object('status', 'ok');
end $$;

-- Lo de todos los productos de una página publicada, para el PDF.
create or replace function public.catalogo_mayorista_srv(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_pag public.tu_pagina;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object('status', 'ok', 'filas', coalesce((
        select jsonb_agg(jsonb_build_object('catalog_id', m.catalog_id, 'codigo', m.codigo,
                   'precio_mayor', m.precio_mayor, 'desde', m.desde, 'pedido_minimo', m.pedido_minimo))
          from public.catalogo_mayorista m where m.company_id = v_pag.company_id), '[]'::jsonb));
end $$;

revoke execute on function public.catalogo_mayorista_guardar(text, text, jsonb) from public, anon;
grant  execute on function public.catalogo_mayorista_guardar(text, text, jsonb) to authenticated;
revoke execute on function public.catalogo_mayorista_srv(text) from public, authenticated;
grant  execute on function public.catalogo_mayorista_srv(text) to anon;

commit;
