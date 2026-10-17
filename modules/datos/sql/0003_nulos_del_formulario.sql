-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0003: los null del formulario (17-oct-2026, corte de kallpa)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- El fallo, en el primer guardado de kallpa tras el corte:
--   «null value in column "capacity" of relation "catalog" violates not-null constraint»
--
-- El formulario del catálogo manda `null` en los campos que deja vacíos, y en un negocio
-- de grupos manda SIEMPRE `capacity: null` y `duration_minutes: null` (solo se enseñan en
-- citas). La 0001 aplicaba el null tal cual y Postgres lo rechazaba. No se escribió nada.
--
-- El bot no fallaba porque upsertCatalogItem convierte cada null en el valor por defecto.
-- Pero copiarlo sin más sería copiar un fallo: `capacity: null` → 1 dejaba el cupo de un
-- nivel (Pollito 8, Tiburón 6) en 1 cada vez que alguien lo guardaba. Así que:
--
--   null = VACIAR      description, linked_service, start_date, familia, promo_vigencia → ''
--   (como el bot)      package_services, schedule_slots, discovery_questions          → '[]'
--                      price, sort_order, duration_minutes, max_discount               → 0
--                      currency                                                        → 'PEN'
--                      employees.comision_pct (0 = sin comisión, como `?? 0` del bot)  → 0
--
--   null = NO TOCAR    capacity, is_active, vigencia_meses: un valor por defecto aquí
--   (mejor que el bot) destruye datos (el cupo, la visibilidad, los meses que cubre).
--
--   null DE VERDAD     stock (sin control), comision_pct / comision_monto del producto
--                      (usa la del trabajador).
--
-- Y una red general en v2_parchear: un null en una columna NOT NULL que nadie ha mapeado
-- se ignora (se conserva lo que había) en vez de tumbar el guardado entero. Cubre también
-- Equipo y Ajustes (companies), que tienen el mismo riesgo.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · La red general ────────────────────────────────────────────────────────

create or replace function public.v2_parchear(p_tabla text, p_id text, p_patch jsonb, p_cols text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
    v_cols text[];
    v_lista text;
begin
    select coalesce(array_agg(a.attname::text order by a.attnum), '{}') into v_cols
      from pg_attribute a
     where a.attrelid = ('public.' || p_tabla)::regclass
       and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and a.attname::text = any(p_cols)
       and p_patch ? a.attname::text
       -- Un null en una columna que no lo admite: se conserva lo que había (0003).
       and not (a.attnotnull and p_patch -> a.attname::text = 'null'::jsonb);
    if cardinality(v_cols) = 0 then return v_cols; end if;
    select string_agg(quote_ident(c), ', ') into v_lista from unnest(v_cols) c;
    if cardinality(v_cols) = 1 then
        execute format('update public.%I t set %s = (select r.%s from jsonb_populate_record(t, $1) r) where t.id = $2',
                       p_tabla, v_lista, v_lista) using p_patch, p_id;
    else
        execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(t, $1) r) where t.id = $2',
                       p_tabla, v_lista, (select string_agg('r.' || quote_ident(c), ', ') from unnest(v_cols) c))
            using p_patch, p_id;
    end if;
    return v_cols;
end $$;
revoke execute on function public.v2_parchear(text, text, jsonb, text[]) from public, anon, authenticated;

-- Cambia cada null explícito de `p` por su vacío según `vacios` ({"clave": vacío}). Las
-- claves que no vienen no se añaden.
create or replace function public.v2_vaciar_nulos(p jsonb, vacios jsonb)
returns jsonb language sql immutable as $$
    select p || coalesce((select jsonb_object_agg(k, vacios -> k)
                            from jsonb_object_keys(vacios) k
                           where p -> k = 'null'::jsonb), '{}'::jsonb);
$$;
revoke execute on function public.v2_vaciar_nulos(jsonb, jsonb) from public, anon, authenticated;

-- ── 2 · Catálogo ──────────────────────────────────────────────────────────────

-- Igual que en la 0001, con los null del formulario vaciados antes del PATCH.
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

    -- null = vaciar. capacity, is_active y vigencia_meses NO están: su null se ignora
    -- en v2_parchear y se conserva lo que había.
    v_item := public.v2_vaciar_nulos(v_item, jsonb_build_object(
        'description', '', 'linked_service', '', 'start_date', '', 'familia', '', 'promo_vigencia', '',
        'package_services', '[]', 'schedule_slots', '[]', 'discovery_questions', '[]',
        'price', 0, 'sort_order', 0, 'duration_minutes', 0, 'max_discount', 0,
        'currency', 'PEN'));

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
        'updated_at'
    ]);
    return jsonb_build_object('id', v_id, 'fusionado', v_prev.id is not null, 'sin_permiso', to_jsonb(v_sin));
end $$;

-- ── 3 · Equipo ────────────────────────────────────────────────────────────────

-- Igual que en la 0001, con comision_pct null → 0 (0 = sin comisión, como el bot).
create or replace function public.cfg_trabajador_guardar(p_company text, p_emp jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol  text := public.v2_autorizar_config(p_company);
    v_id   text := nullif(btrim(coalesce(p_emp->>'id', '')), '');
    v_prev public.employees;
    v_emp  jsonb := p_emp - 'id' - 'company_id';
    v_sin  text[] := '{}';
    v_nombre text;
    v_error text;
begin
    if v_id is not null then
        select * into v_prev from public.employees where id = v_id;
        if found and v_prev.company_id <> p_company then
            raise exception 'el trabajador % no es de %', v_id, p_company;
        end if;
    end if;
    if v_rol <> 'dueno' and v_emp ? 'comision_pct' then
        v_sin := array['comision_pct'];
        v_emp := v_emp - 'comision_pct';
    end if;
    v_emp := public.v2_vaciar_nulos(v_emp, jsonb_build_object('comision_pct', 0));
    perform public.v2_comision_valida(v_emp->'comision_pct', 'comision_pct del trabajador');
    -- null = «que herede el del negocio», que en la base es ''.
    if v_emp ? 'schedule' and v_emp->'schedule' = 'null'::jsonb then
        v_emp := v_emp || jsonb_build_object('schedule', '');
    end if;
    if v_emp ? 'schedule' then
        v_error := public.horario_error(v_emp->>'schedule');
        if v_error is not null then raise exception 'horario inválido: %', v_error; end if;
    end if;
    v_nombre := btrim(coalesce(v_emp->>'name', v_prev.name, ''));
    if v_nombre = '' then raise exception 'payload.employee.name requerido'; end if;
    v_emp := v_emp || jsonb_build_object('name', v_nombre);

    if v_prev.id is null then
        v_id := coalesce(v_id, gen_random_uuid()::text);
        insert into public.employees (id, company_id, name) values (v_id, p_company, v_nombre);
    end if;
    perform public.v2_parchear('employees', v_id, v_emp, array['name', 'schedule', 'is_active', 'comision_pct']);
    return jsonb_build_object('id', v_id, 'fusionado', v_prev.id is not null, 'sin_permiso', to_jsonb(v_sin));
end $$;

commit;
