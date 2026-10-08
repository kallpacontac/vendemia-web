-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0009 · Alta rápida: el negocio se crea solo y un código
--                          activa todas las placas de su pedido
--
-- Dos cosas, las dos para que un dueño que recibe placas sin configurar llegue
-- de «acerco el móvil» a «mi placa ya abre mi página» sin escribirle a nadie:
--
-- 1 · loyalty_business_create(nombre, teléfono)
--     Una cuenta recién creada (correo o Google) no tiene negocio. Hasta ahora
--     lo daba de alta Alvaro con `npm run onboard`. Esto lo crea desde el panel:
--     fila en `companies`, membresía de OWNER y los ajustes de Fideliza (slug y
--     nombre), en una transacción.
--
--     ⚠️ Inserta FILAS en `companies` y `memberships` (tablas del bot). No toca
--     su esquema. Un negocio creado aquí vive solo en Postgres: no tiene fila en
--     `instances`, así que el instance-manager NO le levanta un bot de WhatsApp
--     (eso sigue exigiendo tu aprobación). El espejo SQLite → Supabase solo sube
--     filas que cambian en SQLite: no borra las que nacieron aquí.
--
--     Límite: una cuenta sin ningún negocio puede crear UNO. Quien ya tiene
--     membresía recibe 'already_has_business': para un segundo negocio, lo das
--     de alta tú. Evita que un formulario abierto llene `companies` de basura.
--
-- 2 · Código de PEDIDO
--     Cada placa conserva su código de activación individual. Además, un lote
--     fabricado con loyalty_admin_device_order lleva UN código común: el dueño
--     lo escribe una vez y se queda con todas las placas de ese pedido que sigan
--     sin dueño. loyalty_device_claim acepta los dos.
--
--     El código de pedido es tan secreto como el individual: va en la tarjeta
--     dentro de la caja, nunca en el frente de la placa.
--
-- Aplicar después de 0008. `create or replace` conserva los permisos de 0006
-- para loyalty_device_claim; las funciones nuevas llevan sus grants al final.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.loyalty_devices add column if not exists order_code_hash bytea;
create index if not exists ix_loyalty_devices_order_code
    on public.loyalty_devices (order_code_hash) where order_code_hash is not null;

-- ── 1 · Alta del negocio ─────────────────────────────────────────────────────

-- Mismo criterio que slugify() del bot (src/api/routes/index.ts): sin tildes,
-- minúsculas, a-z0-9 con guiones. Acotado a 36 para dejar sitio al sufijo -99.
create or replace function public.loyalty_slugify(p text)
returns text language sql immutable as $$
    select coalesce(nullif(trim(both '-' from left(trim(both '-' from regexp_replace(
               lower(translate(coalesce(p, ''), 'áéíóúüñàèìòùâêîôûäëïöÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛÄËÏÖ',
                                                'aeiouunaeiouaeiouaeioAEIOUUNAEIOUAEIOUAEIO')),
               '[^a-z0-9]+', '-', 'g')), 36)), ''), 'negocio');
$$;

create or replace function public.loyalty_business_create(p_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_uid text := (select auth.uid())::text;
    v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
    v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    v_base text;
    v_id text;
    n integer := 1;
begin
    if v_uid is null then perform public.loyalty_err('not_authenticated'); end if;
    if char_length(v_name) not between 2 and 60 then perform public.loyalty_err('invalid_name'); end if;
    if v_phone <> '' and char_length(v_phone) not between 8 and 15 then perform public.loyalty_err('invalid_phone'); end if;

    -- Doble clic, dos pestañas: la segunda espera aquí y luego ve la membresía.
    perform pg_advisory_xact_lock(hashtext('loyalty_business_create:' || v_uid));
    if exists (select 1 from public.memberships m where m.auth_user_id = v_uid) then
        perform public.loyalty_err('already_has_business');
    end if;

    -- Un id libre a la vez como compañía y como slug público.
    v_base := public.loyalty_slugify(v_name);
    if char_length(v_base) < 3 then v_base := v_base || '-negocio'; end if;
    v_id := v_base;
    while exists (select 1 from public.companies c where c.id = v_id)
       or exists (select 1 from public.loyalty_settings s where s.slug = v_id) loop
        n := n + 1;
        v_id := case when n <= 99 then v_base || '-' || n
                     else v_base || '-' || lower(public.loyalty_code_chars(5)) end;
    end loop;

    insert into public.companies (id, name, owner_phone) values (v_id, v_name, v_phone);
    insert into public.memberships (id, auth_user_id, company_id, role)
    values (gen_random_uuid()::text, v_uid, v_id, 'owner');

    -- Ya es owner: los ajustes pasan por la función normal, con sus validaciones.
    perform public.loyalty_settings_save(v_id, jsonb_build_object('slug', v_id, 'display_name', v_name));
    perform public.loyalty_audit(v_id, 'business.create', 'companies', v_id,
                                 jsonb_build_object('via', 'panel_self_service'));
    return jsonb_build_object('company_id', v_id, 'slug', v_id);
end $$;

-- ── 2 · Lote de un pedido: un código para todas sus placas ───────────────────

create or replace function public.loyalty_admin_device_order(p_count integer, p_batch text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_devices jsonb;
    v_order text;
begin
    if not public.loyalty_es_admin() then raise exception 'loyalty:forbidden' using errcode = '42501'; end if;
    if p_count not between 1 and 200 then perform public.loyalty_err('invalid_count'); end if;
    -- Las placas, con sus códigos individuales, salen de la función de siempre.
    v_devices := public.loyalty_admin_device_batch(p_count, p_batch, p_kind);
    -- 'P' delante: se distingue a ojo de un código de placa en soporte.
    v_order := 'P' || public.loyalty_code_chars(4) || '-' || public.loyalty_code_chars(5);
    update public.loyalty_devices
       set order_code_hash = public.loyalty_hash(replace(v_order, '-', ''))
     where id in (select (e ->> 'id')::uuid from jsonb_array_elements(v_devices) e);
    perform public.loyalty_audit(null, 'device.order', 'loyalty_devices', p_batch,
                                 jsonb_build_object('count', p_count), 'platform_admin');
    return jsonb_build_object('order_code', v_order, 'devices', v_devices);
end $$;

-- Acepta el código de UNA placa o el de su PEDIDO. Devuelve `id` (la primera,
-- como antes, para no romper el panel) y además `ids` y `count`.
create or replace function public.loyalty_device_claim(p_company text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_hash bytea := public.loyalty_hash(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')));
    v_uid text;
    d public.loyalty_devices;
    v_ids uuid[];
begin
    perform public.loyalty_require(p_company, 'devices.manage');
    v_uid := (select auth.uid())::text;

    select * into d from public.loyalty_devices where activation_code_hash = v_hash for update;
    if found then
        if d.activation_used_at is not null or d.company_id is not null or d.status not in ('manufactured', 'tested') then
            perform public.loyalty_audit(p_company, 'device.claim_failed', 'loyalty_devices', null, null);
            perform public.loyalty_err('invalid_activation_code');
        end if;
        v_ids := array[d.id];
    else
        -- Código de pedido: todas las placas de ese pedido que sigan sin dueño.
        select array_agg(id order by created_at, id) into v_ids from (
            select id, created_at from public.loyalty_devices
             where order_code_hash = v_hash and company_id is null and activation_used_at is null
               and status in ('manufactured', 'tested')
             for update) x;
        if v_ids is null then
            perform public.loyalty_audit(p_company, 'device.claim_failed', 'loyalty_devices', null, null);
            perform public.loyalty_err('invalid_activation_code');
        end if;
    end if;

    update public.loyalty_devices
       set company_id = p_company, status = 'assigned', activation_used_at = now(), updated_at = now()
     where id = any (v_ids);
    insert into public.loyalty_device_claims (device_id, company_id, method, claimed_by)
    select x, p_company, 'activation_code', v_uid from unnest(v_ids) x;
    perform public.loyalty_audit(p_company, 'device.claim', 'loyalty_devices', v_ids[1]::text,
                                 jsonb_build_object('count', cardinality(v_ids)));
    return jsonb_build_object('id', v_ids[1], 'ids', to_jsonb(v_ids), 'count', cardinality(v_ids));
end $$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
revoke execute on function public.loyalty_slugify(text) from public, anon, authenticated;
revoke execute on function public.loyalty_business_create(text, text) from public, anon;
revoke execute on function public.loyalty_admin_device_order(integer, text, text) from public, anon;
grant execute on function public.loyalty_business_create(text, text) to authenticated;
grant execute on function public.loyalty_admin_device_order(integer, text, text) to authenticated;
