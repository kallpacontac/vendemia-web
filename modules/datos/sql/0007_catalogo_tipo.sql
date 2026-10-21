-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0007: servicio o producto, por ítem del catálogo (21-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido del bot (21-oct-2026). Una barbería vende la cera; una academia, el uniforme. Se
-- ofrecen igual, pero el producto no ocupa hora: va al carrito y a un pedido. Catálogo →
-- ficha lleva un selector «Es un servicio / Es un producto» en los negocios de citas.
--
-- Columna `catalog.tipo`: texto, '' por defecto. La crea la migración del BOT
-- supabase/migrations/0047_catalogo_tipo.sql, que va ANTES que esta (si falta, esta se
-- para con un aviso).
--
--   ''          lo que diga el negocio: servicio en uno de citas, producto en una tienda
--   'servicio'  aparta tiempo (cita o grupo semanal)
--   'producto'  aparta unidades (carrito, stock y pedido)
--
-- Aquí, que `cfg_producto_guardar` lo guarde en los negocios con la configuración en la
-- nube. Hasta hoy se descartaba en silencio (no estaba en la lista de columnas). null = ''.
-- Un valor fuera de los tres se rechaza con su motivo, como el bot; el check
-- `catalog_tipo_valido` lo pararía igual, pero con un mensaje que nadie entiende.
--
-- El resto, idéntico a la 0003. Idempotente (create or replace); permisos repetidos.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'catalog' and column_name = 'tipo') then
        raise exception 'Falta catalog.tipo: aplica primero la 0047 del bot (supabase/migrations/0047_catalogo_tipo.sql).';
    end if;
end $$;

create or replace function public.cfg_producto_guardar(p_company text, p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol  text := public.v2_autorizar_config(p_company);
    v_id   text := nullif(btrim(coalesce(p_item->>'id', '')), '');
    v_prev public.catalog;
    v_item jsonb := p_item - 'id' - 'company_id';
    v_sin  text[] := '{}';
    v_nombre text;
begin
    if v_id is not null then
        select * into v_prev from public.catalog where id = v_id;
        if found and v_prev.company_id <> p_company then
            raise exception 'el producto % no es de %', v_id, p_company;
        end if;
    end if;
    -- Comisiones: el administrador las ve, no las cambia.
    if v_rol <> 'dueno' then
        select coalesce(array_agg(k), '{}') into v_sin from unnest(array['comision_pct', 'comision_monto']) k where v_item ? k;
        v_item := v_item - 'comision_pct' - 'comision_monto';
    end if;
    perform public.v2_comision_valida(v_item->'comision_pct', 'comision_pct del servicio');
    if v_item ? 'comision_monto' and v_item->'comision_monto' <> 'null'::jsonb
       and coalesce(v_item->>'comision_monto', '') !~ '^\d+(\.\d+)?$' then
        raise exception 'comision_monto debe ser un número >= 0';
    end if;
    -- 0007: los tres valores del bot y nada más.
    if v_item ? 'tipo' and v_item->'tipo' <> 'null'::jsonb
       and coalesce(v_item->>'tipo', '') not in ('', 'servicio', 'producto') then
        raise exception 'tipo debe ser '''', ''servicio'' o ''producto'' (llegó «%»)', v_item->>'tipo';
    end if;

    -- null = vaciar. capacity, is_active y vigencia_meses NO están: su null se ignora
    -- en v2_parchear y se conserva lo que había.
    v_item := public.v2_vaciar_nulos(v_item, jsonb_build_object(
        'description', '', 'linked_service', '', 'start_date', '', 'familia', '', 'promo_vigencia', '',
        'package_services', '[]', 'schedule_slots', '[]', 'discovery_questions', '[]',
        'price', 0, 'sort_order', 0, 'duration_minutes', 0, 'max_discount', 0,
        'currency', 'PEN', 'tipo', ''));

    v_nombre := btrim(coalesce(v_item->>'name', v_prev.name, ''));
    if v_nombre = '' then raise exception 'payload.item.name requerido'; end if;
    v_item := v_item || jsonb_build_object('name', v_nombre, 'updated_at', extract(epoch from now())::bigint);

    if v_prev.id is null then
        v_id := coalesce(v_id, gen_random_uuid()::text);
        insert into public.catalog (id, company_id, name) values (v_id, p_company, v_nombre);
    end if;
    perform public.v2_parchear('catalog', v_id, v_item, array[
        'name', 'description', 'price', 'currency', 'duration_minutes', 'is_active', 'sort_order', 'stock',
        'capacity', 'max_discount', 'package_services', 'schedule_slots', 'start_date', 'vigencia_meses',
        'comision_pct', 'comision_monto', 'promo_vigencia', 'familia', 'discovery_questions', 'linked_service',
        'tipo', 'updated_at'
    ]);
    return jsonb_build_object('id', v_id, 'fusionado', v_prev.id is not null, 'sin_permiso', to_jsonb(v_sin));
end $$;

revoke execute on function public.cfg_producto_guardar(text, jsonb) from public, anon;
grant  execute on function public.cfg_producto_guardar(text, jsonb) to authenticated;

commit;
