-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA DE DATOS v2 · 0002: lo que corrigió la medida del bot (16-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Viene del informe de la etapa 0 (repo del bot, docs/medidas-arquitectura-v2.md, §3.3 y §6):
--
--   1. Faltaba una tabla: `catalog_variantes` (stock por talla, color, sabor…). Es
--      configuración, la escriben Mia y el voucher al vender, y hoy no existe en Postgres:
--      el panel no ve el stock por talla. `catalog.stock` es la SUMA de sus variantes, así
--      que en un producto con variantes `ajustar_stock` no basta: restaría el total sin saber
--      de qué talla. Aquí: la tabla, `ajustar_stock_variante` atómico que deja también la
--      suma, y las cfg_variante_* con las reglas de siempre.
--      Es también la tabla de las opciones de «Tu página» (talla, color…): una sola, no dos.
--
--   2. `cfg_empresa_actualizar` no ponía `field_key` a las preguntas obligatorias que no la
--      traen. El bot sí (conClaves, utils/calificacion.ts): una pregunta sin clave nunca
--      queda contestada y Mia la repite. Se copia la regla tal cual.
--
--   3. `sync_borrados` no tenía limpieza: los borrados del bot (evals, suites) la hacen
--      crecer desde ya. `sync_borrados_limpiar(días)`.
--
--   4. El bot también escribe configuración después del corte (Mia Gerente cambiando un
--      precio por WhatsApp, `scripts/asistente.ts` con las variantes). Llega con la clave
--      de servicio, sin auth.uid(), y las cfg_* lo rechazaban. Ahora lo aceptan como dueño:
--      el bot ya comprobó el rol de quien se lo pidió (utils/roles.ts) antes de llamar.
--
-- Lo que NO se cambia a propósito: `cfg_producto_guardar` sigue sin aceptar `image_url`.
-- Es un campo muerto (las fotos viven en catalog_media; ver lib/supabase/types.ts) y el
-- PATCH conserva el valor que tenga la fila, así que no se pierde nada.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Variantes ─────────────────────────────────────────────────────────────

-- Mismo esquema que SQLite (bot: src/services/variantes.ts), más lo que pide el espejo:
-- `mirrored_at` (la estampa quien sube) y `updated_at` en epoch de segundos. Sin FK a
-- catalog, igual que en SQLite: una variante huérfana no puede tumbar la subida de la tabla.
create table if not exists public.catalog_variantes (
    id           text primary key,
    company_id   text not null references public.companies(id) on delete cascade,
    catalog_id   text not null,
    etiqueta     text not null,
    atributos    text not null default '{}',
    stock        integer not null default 0,
    updated_at   bigint not null default extract(epoch from now())::bigint,
    mirrored_at  timestamptz not null default now(),
    sync_version bigint,
    unique (company_id, catalog_id, etiqueta)
);
create index if not exists idx_variantes_item on public.catalog_variantes(company_id, catalog_id);
create index if not exists idx_sync_catalog_variantes on public.catalog_variantes(company_id, sync_version);

drop trigger if exists v2_sellar on public.catalog_variantes;
create trigger v2_sellar before insert or update on public.catalog_variantes
    for each row execute function public.v2_sellar();
drop trigger if exists v2_anotar_borrado on public.catalog_variantes;
create trigger v2_anotar_borrado after delete on public.catalog_variantes
    for each row execute function public.v2_anotar_borrado();

alter table public.catalog_variantes enable row level security;
revoke all on public.catalog_variantes from anon, authenticated;
grant select on public.catalog_variantes to authenticated;
drop policy if exists catalog_variantes_leer on public.catalog_variantes;
create policy catalog_variantes_leer on public.catalog_variantes
    for select to authenticated using ((select public.puede(company_id, 'catalogo.ver')));

-- `catalog.stock` = suma de las variantes. Sin variantes no se toca (sincronizarStockProducto).
create or replace function public.v2_sincronizar_stock(p_company text, p_catalog text)
returns integer language plpgsql security definer set search_path = public as $$
declare
    n integer;
    s integer;
begin
    select count(*), coalesce(sum(stock), 0) into n, s
      from public.catalog_variantes where company_id = p_company and catalog_id = p_catalog;
    if n > 0 then
        update public.catalog set stock = s, updated_at = extract(epoch from now())::bigint
         where id = p_catalog and company_id = p_company;
        return s;
    end if;
    return null;
end $$;

-- guardarVariante: crea o actualiza por (producto, etiqueta) y deja la suma.
create or replace function public.cfg_variante_guardar(p_company text, p_catalog text, p_etiqueta text,
                                                       p_stock integer, p_atributos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_etiqueta text := btrim(coalesce(p_etiqueta, ''));
    v_id text;
begin
    perform public.v2_autorizar_config(p_company);
    if v_etiqueta = '' then raise exception 'la variante necesita un nombre (S, M, Negro…)'; end if;
    if not exists (select 1 from public.catalog where id = p_catalog and company_id = p_company) then
        raise exception 'el producto % no existe en %', p_catalog, p_company;
    end if;
    if jsonb_typeof(coalesce(p_atributos, '{}'::jsonb)) <> 'object' then
        raise exception 'atributos va como objeto: {"talla":"M","color":"Negro"}';
    end if;
    insert into public.catalog_variantes (id, company_id, catalog_id, etiqueta, atributos, stock)
    values (gen_random_uuid()::text, p_company, p_catalog, v_etiqueta, coalesce(p_atributos, '{}'::jsonb)::text,
            greatest(0, coalesce(p_stock, 0)))
    on conflict (company_id, catalog_id, etiqueta) do update
       set stock = excluded.stock, atributos = excluded.atributos,
           updated_at = extract(epoch from now())::bigint
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'stock_producto', public.v2_sincronizar_stock(p_company, p_catalog));
end $$;

create or replace function public.cfg_variante_borrar(p_company text, p_catalog text, p_etiqueta text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    n integer;
begin
    perform public.v2_autorizar_config(p_company);
    delete from public.catalog_variantes
     where company_id = p_company and catalog_id = p_catalog and etiqueta = btrim(coalesce(p_etiqueta, ''));
    get diagnostics n = row_count;
    return jsonb_build_object('borrada', n > 0, 'stock_producto', public.v2_sincronizar_stock(p_company, p_catalog));
end $$;

-- Al vender o devolver una talla concreta (moverStockVariante). El bot elige la variante
-- en local (emparejar, con el texto del cliente) y aquí llega su id. Atómico, nunca baja
-- de 0, y deja la suma del producto en la misma transacción.
create or replace function public.ajustar_stock_variante(p_company text, p_variante text, p_delta integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_catalog text;
    v_stock integer;
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    update public.catalog_variantes
       set stock = greatest(0, stock + p_delta), updated_at = extract(epoch from now())::bigint
     where id = p_variante and company_id = p_company
    returning catalog_id, stock into v_catalog, v_stock;
    if v_catalog is null then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object('status', 'ok', 'stock_variante', v_stock,
                              'stock_producto', public.v2_sincronizar_stock(p_company, v_catalog));
end $$;

-- Con variantes, el stock del producto ya no se mueve a pelo: se movería el total sin
-- saber de qué talla. Se rechaza con el camino correcto en el mensaje.
create or replace function public.ajustar_stock(p_company text, p_id text, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
    v_stock integer;
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    if exists (select 1 from public.catalog_variantes where company_id = p_company and catalog_id = p_id) then
        raise exception 'el producto % tiene variantes: usa ajustar_stock_variante', p_id;
    end if;
    update public.catalog
       set stock = greatest(0, stock + p_delta), updated_at = extract(epoch from now())::bigint
     where id = p_id and company_id = p_company and stock is not null
    returning stock into v_stock;
    return v_stock;   -- null = ese producto no controla stock
end $$;

-- ── 1b · El bot escribe configuración como dueño ──────────────────────────────

-- Igual que en la 0001, más la clave de servicio. Sigue exigiendo config_en_nube: en un
-- negocio que todavía es del bot, el bot escribe en su SQLite como siempre.
create or replace function public.v2_autorizar_config(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text;
begin
    if (select auth.role()) = 'service_role' then
        v_rol := 'dueno';
    else
        v_rol := public.rol_en(p_company);
        if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
        if v_rol not in ('admin', 'dueno') then
            raise exception 'Eso lo hace el dueño o el administrador del negocio.' using errcode = '42501';
        end if;
    end if;
    if not public.config_en_nube(p_company) then
        raise exception 'La configuración de este negocio todavía la guarda su bot (arquitectura v2, etapa 2 sin cortar).'
            using errcode = '55000';
    end if;
    return v_rol;
end $$;
revoke execute on function public.v2_autorizar_config(text) from public, anon, authenticated;

-- ── 2 · Las claves de las preguntas obligatorias ──────────────────────────────

-- claveDePregunta (bot: utils/calificacion.ts). «¿Desde qué distrito nos escribes?» →
-- «distrito». Nunca vacía. La lista de relleno es la del bot, palabra por palabra.
create or replace function public.v2_clave_de_pregunta(p text)
returns text language sql immutable as $$
    select coalesce(nullif(array_to_string((array_agg(w order by ord))[1:2], '_'), ''), 'respuesta')
      from regexp_split_to_table(
               regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñàèìòùâêîôûäëïö', 'aeiouunaeiouaeiouaeio'),
                              '[^a-z0-9\s]', ' ', 'g'),
               '\s+') with ordinality as t(w, ord)
     where w <> '' and not (w = any(array[
        'a', 'al', 'con', 'cual', 'cuales', 'cuando', 'cuanto', 'cuantos', 'cuantas', 'de', 'del', 'desde', 'donde',
        'el', 'en', 'es', 'esta', 'este', 'la', 'las', 'le', 'lo', 'los', 'me', 'mi', 'nos', 'o', 'para', 'por',
        'que', 'quien', 'se', 'son', 'su', 'sus', 'te', 'tu', 'tus', 'un', 'una', 'y', 'ya',
        'escribes', 'puedes', 'puede', 'podrias', 'tienes', 'tiene', 'buscas', 'busca', 'quieres', 'quiere',
        'seria', 'serian', 'sera', 'eres', 'estas', 'vives', 'vienes', 'vas', 'hay', 'necesitas', 'asistir', 'venir',
        'gustaria', 'prefieres']));
$$;

-- conClaves: el mismo JSON con una field_key en cada pregunta que no la tenía, sin repetir
-- ninguna. Una clave ya puesta no se toca nunca (lead.custom_data guarda las respuestas bajo
-- ella). Si nada cambia, o el JSON no se entiende, devuelve el texto tal cual.
create or replace function public.v2_con_claves(p text)
returns text language plpgsql immutable as $$
declare
    qs jsonb;
    q jsonb;
    salida jsonb := '[]'::jsonb;
    usadas text[];
    base text;
    clave text;
    n integer;
    cambio boolean := false;
begin
    begin
        qs := p::jsonb;
    exception when others then
        return p;
    end;
    if jsonb_typeof(qs) <> 'array' then return p; end if;
    select coalesce(array_agg(e->>'field_key'), '{}') into usadas
      from jsonb_array_elements(qs) e where coalesce(e->>'field_key', '') <> '';
    for q in select * from jsonb_array_elements(qs) loop
        if jsonb_typeof(q) = 'object' and coalesce(q->>'field_key', '') = '' and btrim(coalesce(q->>'question', '')) <> '' then
            base := public.v2_clave_de_pregunta(q->>'question');
            clave := base;
            n := 2;
            while clave = any(usadas) loop
                clave := base || '_' || n;
                n := n + 1;
            end loop;
            q := q || jsonb_build_object('field_key', clave);
            usadas := usadas || clave;
            cambio := true;
        end if;
        salida := salida || jsonb_build_array(q);
    end loop;
    return case when cambio then salida::text else p end;
end $$;

-- Igual que en la 0001, con las claves. Lo demás no cambia.
create or replace function public.cfg_empresa_actualizar(p_company text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol   text := public.v2_autorizar_config(p_company);
    v_patch jsonb := p_patch;
    v_sin   text[] := '{}';
    v_hechos text[];
    v_error text;
begin
    if v_rol <> 'dueno' then
        select coalesce(array_agg(k), '{}') into v_sin
          from unnest(array['payment_methods', 'owner_phone', 'admin_phone', 'whatsapp_phone']) k where v_patch ? k;
        v_patch := v_patch - 'payment_methods' - 'owner_phone' - 'admin_phone' - 'whatsapp_phone';
    end if;
    if v_patch ? 'schedule' then
        v_error := public.horario_error(v_patch->>'schedule');
        if v_error is not null then raise exception 'horario inválido: %', v_error; end if;
    end if;
    if v_patch ? 'qualifying_questions' and v_patch->'qualifying_questions' <> 'null'::jsonb then
        v_patch := v_patch || jsonb_build_object('qualifying_questions',
            public.v2_con_claves(case jsonb_typeof(v_patch->'qualifying_questions')
                                      when 'string' then v_patch->>'qualifying_questions'
                                      else (v_patch->'qualifying_questions')::text end));
    end if;
    v_hechos := public.v2_parchear('companies', p_company, v_patch, array[
        'name', 'bot_name', 'bot_tone', 'hook_question', 'custom_rules', 'return_policy',
        'delivery_type', 'business_mode', 'schedule', 'payment_methods',
        'whatsapp_phone', 'owner_phone', 'admin_phone', 'delivery_fee', 'delivery_days_ahead', 'request_location', 'is_active',
        'slot_minutes', 'express_fee', 'express_cutoff_hour', 'normal_fee', 'normal_cutoff_hour', 'location', 'proactive_venue',
        'qualifying_questions', 'google_calendar_id', 'owner_email', 'reminder_config',
        'appointment_grace_minutes', 'recurring_grace_days', 'business_description',
        'welcome_note', 'closing_note', 'ask_employee', 'employee_question', 'delivery_options', 'require_payment_to_confirm',
        'verify_vouchers', 'asumir_asistencia'
    ]);
    return jsonb_build_object(
        'updated', to_jsonb(v_hechos),
        'ignored', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_patch) k where k <> all(v_hechos)), '[]'::jsonb),
        'sin_permiso', to_jsonb(v_sin));
end $$;

-- ── 3 · Limpieza de sync_borrados ─────────────────────────────────────────────

-- Un rastro de borrado solo sirve hasta que todo bot lo ha bajado. Con un cursor por bot
-- que avanza cada pocos segundos, 90 días es de sobra: un bot apagado más tiempo que eso
-- no puede ponerse al día por cursor y necesita una carga completa de todos modos.
create or replace function public.sync_borrados_limpiar(p_dias integer default 90)
returns integer language plpgsql security definer set search_path = public as $$
declare
    n integer;
begin
    if (select auth.role()) <> 'service_role' and not public.es_admin_plataforma() then
        raise exception 'solo el equipo de Vendemia' using errcode = '42501';
    end if;
    delete from public.sync_borrados where borrado_at < now() - make_interval(days => greatest(p_dias, 7));
    get diagnostics n = row_count;
    return n;
end $$;

-- ── 4 · Permisos de ejecución ─────────────────────────────────────────────────

revoke execute on function public.v2_sincronizar_stock(text, text)                 from public, anon, authenticated;
revoke execute on function public.ajustar_stock_variante(text, text, integer)      from public, anon, authenticated;
revoke execute on function public.ajustar_stock(text, text, integer)               from public, anon, authenticated;
revoke execute on function public.sync_borrados_limpiar(integer)                   from public, anon;
grant  execute on function public.sync_borrados_limpiar(integer)                   to authenticated;
revoke execute on function public.cfg_variante_guardar(text, text, text, integer, jsonb) from public, anon;
revoke execute on function public.cfg_variante_borrar(text, text, text)            from public, anon;
grant  execute on function public.cfg_variante_guardar(text, text, text, integer, jsonb) to authenticated;
grant  execute on function public.cfg_variante_borrar(text, text, text)            to authenticated;
revoke execute on function public.cfg_empresa_actualizar(text, jsonb)              from public, anon;
grant  execute on function public.cfg_empresa_actualizar(text, jsonb)              to authenticated;

-- El bot (clave de servicio) llama a las mismas cfg_* que el panel.
do $$
declare
    f text;
begin
    foreach f in array array[
        'cfg_producto_guardar(text, jsonb)', 'cfg_producto_borrar(text, text)',
        'cfg_media_guardar(text, jsonb)', 'cfg_media_principal(text, text)', 'cfg_media_borrar(text, text)',
        'cfg_trabajador_guardar(text, jsonb)', 'cfg_trabajador_borrar(text, text)',
        'cfg_bloqueo_guardar(text, jsonb)', 'cfg_bloqueo_borrar(text, text)',
        'cfg_empresa_actualizar(text, jsonb)', 'cfg_variante_guardar(text, text, text, integer, jsonb)',
        'cfg_variante_borrar(text, text, text)'
    ] loop
        execute format('grant execute on function public.%s to service_role', f);
    end loop;
end $$;
grant execute on function public.ajustar_stock(text, text, integer)          to service_role;
grant execute on function public.ajustar_stock_variante(text, text, integer) to service_role;
grant execute on function public.sync_borrados_limpiar(integer)              to service_role;

commit;
