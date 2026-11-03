-- ═══════════════════════════════════════
-- MI PÁGINA · 0014: la nota, la ubicación y el método de pago se guardan en el pedido
-- ═══════════════════════════════════════
--
-- Alvaro, 3-nov-2026: esos tres datos solo viajaban en el mensaje de WhatsApp. Si el
-- cliente no lo enviaba, el pedido quedaba guardado sin ellos y el dueño no los veía.
--
-- 1. orders y pedidos_web guardan nota, ubicacion y pagara_con. pedidos_web ya tenía
--    nota, pero la web nunca la mandaba.
--
-- 2. pagara_con y NO orders.payment_method: la Caja lee payment_method como el método
--    con el que SE COBRÓ. Esto es lo que el cliente dijo que usará, y puede cambiar.
--
-- 3. Columnas con default '': el espejo del bot sube solo las suyas y la bajada solo
--    escribe las que SQLite conoce (bajada.service.ts), así que el bot no las ve.
--
-- 4. agenda_srv_pedir (0004 de datos) y pedido_srv_crear (0002) son copias exactas salvo
--    el insert. La web valida el enlace de Maps antes de llamarlas, y el panel lo vuelve
--    a validar antes de pintarlo como enlace.
--
-- No se ejecuta sola: se corre entera en el editor SQL de Supabase. Se puede subir la
-- web antes: sin esta migración los pedidos siguen entrando como hasta hoy, sin estos
-- datos. Deshacer: scripts/detalles-pedido-0014-deshacer.sql.
-- ═══════════════════════════════════════

begin;

alter table public.orders
    add column if not exists nota       text not null default '',
    add column if not exists ubicacion  text not null default '',
    add column if not exists pagara_con text not null default '';

alter table public.pedidos_web
    add column if not exists ubicacion  text not null default '' check (char_length(ubicacion) <= 300),
    add column if not exists pagara_con text not null default '' check (char_length(pagara_con) <= 40);

create or replace function public.agenda_srv_pedir(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag     public.tu_pagina;
    v_lead    public.leads;
    v_lead_id text;
    v_item    public.catalog;
    v_var     public.catalog_variantes;
    l         jsonb;
    v_lineas  jsonb := '[]'::jsonb;
    v_items   jsonb := '[]'::jsonb;
    v_cant    integer;
    v_total   numeric := 0;
    v_entrega text := p_datos->>'entrega';
    v_dir     text;
    v_order   text := gen_random_uuid()::text;
    v_cod     text;
    v_ya      public.pagina_idem;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'catalogo')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.agenda_en_nube(v_pag.company_id) then return jsonb_build_object('status', 'no_es_nube'); end if;

    select * into v_ya from public.pagina_idem where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_ya.codigo, 'total', v_ya.datos->'total', 'lineas', v_ya.datos->'lineas', 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    if jsonb_typeof(p_datos->'lineas') is distinct from 'array' or jsonb_array_length(p_datos->'lineas') not between 1 and 30 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if v_entrega not in ('recojo', 'delivery') then return jsonb_build_object('status', 'datos_invalidos'); end if;
    v_dir := btrim(coalesce(p_datos->>'direccion', ''));
    if v_entrega = 'delivery' and char_length(v_dir) < 5 then return jsonb_build_object('status', 'datos_invalidos'); end if;

    begin
        select l.lead_id into v_lead_id from public.v2_lead(v_pag.company_id, p_datos->>'telefono', p_datos->>'nombre', 'web') l;
        select * into v_lead from public.leads where id = v_lead_id;
    exception when sqlstate '22023' then
        return jsonb_build_object('status', 'datos_invalidos');
    end;
    if (select count(*) from public.orders where company_id = v_pag.company_id and lead_id = v_lead.id and status = 'pending'
          and created_at > extract(epoch from now() - interval '1 day')) >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    -- El stock es de la nube desde la etapa 2: se descuenta aquí, como create_order en el bot.
    for l in select * from jsonb_array_elements(p_datos->'lineas') loop
        v_cant := (l->>'cantidad')::integer;
        if v_cant is null or v_cant not between 1 and 99 then return jsonb_build_object('status', 'datos_invalidos'); end if;
        select * into v_item from public.catalog
         where company_id = v_pag.company_id and id = l->>'catalog_id' and coalesce(is_active, 1) = 1 for update;
        if not found then return jsonb_build_object('status', 'no_existe'); end if;
        v_var := null;
        if coalesce(l->>'variante_id', '') <> '' then
            select * into v_var from public.catalog_variantes
             where company_id = v_pag.company_id and catalog_id = v_item.id and id = l->>'variante_id' for update;
            if not found then return jsonb_build_object('status', 'no_existe'); end if;
            if v_var.stock < v_cant then
                return jsonb_build_object('status', 'sin_stock', 'producto', v_item.name || ' · ' || v_var.etiqueta, 'quedan', greatest(v_var.stock, 0));
            end if;
            update public.catalog_variantes set stock = stock - v_cant where id = v_var.id;
            perform public.v2_sincronizar_stock(v_pag.company_id, v_item.id);
        elsif exists (select 1 from public.catalog_variantes where company_id = v_pag.company_id and catalog_id = v_item.id) then
            return jsonb_build_object('status', 'falta_opcion', 'producto', v_item.name);
        elsif v_item.stock is not null then
            if v_item.stock < v_cant then
                return jsonb_build_object('status', 'sin_stock', 'producto', v_item.name, 'quedan', greatest(v_item.stock, 0));
            end if;
            update public.catalog set stock = stock - v_cant where company_id = v_pag.company_id and id = v_item.id;
        end if;
        v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
            'catalog_id', v_item.id, 'variante_id', coalesce(v_var.id, ''), 'nombre', v_item.name, 'opcion', coalesce(v_var.etiqueta, ''),
            'precio', coalesce(v_item.price, 0), 'cantidad', v_cant));
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'name', v_item.name || coalesce(' · ' || v_var.etiqueta, ''), 'price', coalesce(v_item.price, 0),
            'quantity', v_cant, 'catalog_item_id', v_item.id));
        v_total := v_total + coalesce(v_item.price, 0) * v_cant;
    end loop;

    insert into public.orders (id, company_id, lead_id, items, total, status, delivery_address, delivery_option, nota, ubicacion, pagara_con)
    values (v_order, v_pag.company_id, v_lead.id, v_items::text, v_total, 'pending',
            case when v_entrega = 'delivery' then v_dir || case when btrim(coalesce(p_datos->>'referencia', '')) <> ''
                                                              then ' (' || btrim(p_datos->>'referencia') || ')' else '' end else '' end,
            case when v_entrega = 'delivery' then 'delivery' else 'pickup' end,
            left(btrim(coalesce(p_datos->>'nota', '')), 300),
            case when v_entrega = 'delivery' then left(btrim(coalesce(p_datos->>'ubicacion', '')), 300) else '' end,
            left(btrim(coalesce(p_datos->>'pagara_con', '')), 40));

    loop
        v_cod := public.envio_codigo('P');
        exit when not exists (select 1 from public.pagina_idem where company_id = v_pag.company_id and codigo = v_cod);
    end loop;
    insert into public.pagina_idem (company_id, idem, codigo, ref_id, datos)
    values (v_pag.company_id, p_idem, v_cod, v_order, jsonb_build_object('total', v_total, 'lineas', v_lineas));
    return jsonb_build_object('status', 'ok', 'codigo', v_cod, 'total', v_total, 'lineas', v_lineas, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

create or replace function public.pedido_srv_crear(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag      public.tu_pagina;
    v_fila     public.pedidos_web;
    v_item     public.catalog;
    v_var      public.catalog_variantes;
    v_var_id   text;
    v_etiqueta text;
    l          jsonb;
    v_lineas   jsonb := '[]'::jsonb;
    v_cant     integer;
    v_stock    integer;
    v_aparte   integer;
    v_total    numeric := 0;
    v_tel      text;
    v_entrega  text := p_datos->>'entrega';
    i          integer := 0;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'catalogo')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_fila from public.pedidos_web where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'total', v_fila.total, 'lineas', v_fila.lineas, 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    v_tel := regexp_replace(coalesce(p_datos->>'telefono', ''), '\D', '', 'g');
    if char_length(v_tel) = 9 and v_tel like '9%' then v_tel := '51' || v_tel; end if;
    if (select count(*) from public.pedidos_web
         where company_id = v_pag.company_id and telefono = v_tel and estado = 'nuevo') >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    if jsonb_typeof(p_datos->'lineas') is distinct from 'array' or jsonb_array_length(p_datos->'lineas') not between 1 and 30 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    for l in select * from jsonb_array_elements(p_datos->'lineas') loop
        v_cant := (l->>'cantidad')::integer;
        if v_cant is null or v_cant not between 1 and 99 then return jsonb_build_object('status', 'datos_invalidos'); end if;

        select * into v_item from public.catalog
         where company_id = v_pag.company_id and id = l->>'catalog_id' and coalesce(is_active, 1) = 1;
        if not found then return jsonb_build_object('status', 'no_existe'); end if;

        v_var_id := ''; v_etiqueta := ''; v_stock := v_item.stock;
        if coalesce(l->>'variante_id', '') <> '' then
            select * into v_var from public.catalog_variantes
             where company_id = v_pag.company_id and catalog_id = v_item.id and id = l->>'variante_id';
            if not found then return jsonb_build_object('status', 'no_existe'); end if;
            v_var_id := v_var.id; v_etiqueta := v_var.etiqueta; v_stock := v_var.stock;
        elsif exists (select 1 from public.catalog_variantes where company_id = v_pag.company_id and catalog_id = v_item.id) then
            return jsonb_build_object('status', 'falta_opcion', 'producto', v_item.name);
        end if;

        if v_stock is not null then
            select coalesce(sum((x->>'cantidad')::integer), 0) into v_aparte
              from public.pedidos_web p, jsonb_array_elements(p.lineas) x
             where p.company_id = v_pag.company_id and p.estado in ('nuevo', 'confirmado')
               and x->>'catalog_id' = v_item.id and coalesce(x->>'variante_id', '') = v_var_id;
            v_aparte := v_aparte + coalesce((
                select sum((y->>'cantidad')::integer) from jsonb_array_elements(v_lineas) y
                 where y->>'catalog_id' = v_item.id and y->>'variante_id' = v_var_id), 0);
            if v_cant > v_stock - v_aparte then
                return jsonb_build_object('status', 'sin_stock',
                    'producto', v_item.name || case when v_etiqueta <> '' then ' · ' || v_etiqueta else '' end,
                    'quedan', greatest(v_stock - v_aparte, 0));
            end if;
        end if;

        v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
            'catalog_id', v_item.id, 'variante_id', v_var_id, 'nombre', v_item.name, 'opcion', v_etiqueta,
            'precio', coalesce(v_item.price, 0), 'cantidad', v_cant));
        v_total := v_total + coalesce(v_item.price, 0) * v_cant;
    end loop;

    if v_entrega not in ('recojo', 'delivery') then return jsonb_build_object('status', 'datos_invalidos'); end if;
    if v_entrega = 'delivery' and char_length(btrim(coalesce(p_datos->>'direccion', ''))) < 5 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    loop
        begin
            insert into public.pedidos_web (company_id, codigo, nombre, telefono, lineas, total, entrega, direccion, referencia, nota, ubicacion, pagara_con, idem)
            values (
                v_pag.company_id, public.envio_codigo('P'), btrim(coalesce(p_datos->>'nombre', '')), v_tel, v_lineas, v_total,
                v_entrega, btrim(coalesce(p_datos->>'direccion', '')), btrim(coalesce(p_datos->>'referencia', '')),
                btrim(coalesce(p_datos->>'nota', '')),
                case when v_entrega = 'delivery' then left(btrim(coalesce(p_datos->>'ubicacion', '')), 300) else '' end,
                left(btrim(coalesce(p_datos->>'pagara_con', '')), 40), p_idem)
            returning * into v_fila;
            exit;
        exception when unique_violation then
            select * into v_fila from public.pedidos_web where company_id = v_pag.company_id and idem = p_idem;
            if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'total', v_fila.total, 'lineas', v_fila.lineas, 'repetido', true); end if;
            i := i + 1;
            if i > 5 then raise; end if;
        end;
    end loop;
    return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'total', v_fila.total, 'lineas', v_fila.lineas, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

commit;
