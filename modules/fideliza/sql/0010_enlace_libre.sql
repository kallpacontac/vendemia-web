-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0010 · Guarda de duplicados en el alta: el dueño ve su
--                          enlace ANTES de crear el negocio
--
-- En 0009, si «barberia-lucas» ya existía, loyalty_business_create le daba
-- «barberia-lucas-2» en silencio. Eso esconde los dos casos que importan:
--
--   · Es el MISMO negocio: el dueño ya lo creó con otra cuenta (otro Gmail), o
--     es un colaborador que entró antes de que lo invitaran. Un segundo negocio
--     con sus placas repartidas entre los dos es un lío de soporte.
--   · Es OTRO negocio con el mismo nombre: mejor que lo distinga (el distrito)
--     que quedarse con un «-2» que no sabe de dónde salió.
--
-- loyalty_business_slug_check(nombre) devuelve el enlace que le tocaría y si el
-- natural está ocupado. Solo dice «ocupado sí/no»: nada de quién lo tiene. Las
-- páginas públicas ya están en /n/<slug>, así que no revela nada nuevo.
--
-- loyalty_business_create se rehace con los mismos ayudantes, para que lo que
-- la pantalla promete y lo que se crea salgan del mismo cálculo, y con un
-- candado por enlace: dos altas a la vez con el mismo nombre ya no chocan en
-- la clave de `companies`.
--
-- Aplicar después de 0009. `create or replace` conserva el grant de 0009.
-- ═══════════════════════════════════════════════════════════════════════════════

-- El enlace «natural» de un nombre, antes de mirar si está libre.
create or replace function public.loyalty_business_slug_base(p_name text)
returns text language sql immutable set search_path = public as $$
    select case when char_length(s) < 3 then s || '-negocio' else s end
      from (select public.loyalty_slugify(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')) s) x;
$$;

-- El primero libre a partir de ese: base, base-2 … base-99, base-xxxxx.
-- Libre a la vez como id de compañía y como slug público.
create or replace function public.loyalty_business_free_id(p_base text)
returns text language plpgsql security definer set search_path = public as $$
declare
    v_id text := p_base;
    n integer := 1;
begin
    while exists (select 1 from public.companies c where c.id = v_id)
       or exists (select 1 from public.loyalty_settings s where s.slug = v_id) loop
        n := n + 1;
        v_id := case when n <= 99 then p_base || '-' || n
                     else p_base || '-' || lower(public.loyalty_code_chars(5)) end;
    end loop;
    return v_id;
end $$;

create or replace function public.loyalty_business_slug_check(p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
    v_base text;
    v_id text;
begin
    if (select auth.uid()) is null then perform public.loyalty_err('not_authenticated'); end if;
    if char_length(v_name) not between 2 and 60 then perform public.loyalty_err('invalid_name'); end if;
    v_base := public.loyalty_business_slug_base(v_name);
    v_id := public.loyalty_business_free_id(v_base);
    return jsonb_build_object('base', v_base, 'slug', v_id, 'ocupado', v_id <> v_base);
end $$;

create or replace function public.loyalty_business_create(p_name text, p_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_uid text := (select auth.uid())::text;
    v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
    v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    v_base text;
    v_id text;
begin
    if v_uid is null then perform public.loyalty_err('not_authenticated'); end if;
    if char_length(v_name) not between 2 and 60 then perform public.loyalty_err('invalid_name'); end if;
    if v_phone <> '' and char_length(v_phone) not between 8 and 15 then perform public.loyalty_err('invalid_phone'); end if;

    -- Doble clic, dos pestañas: la segunda espera aquí y luego ve la membresía.
    perform pg_advisory_xact_lock(hashtext('loyalty_business_create:' || v_uid));
    if exists (select 1 from public.memberships m where m.auth_user_id = v_uid) then
        perform public.loyalty_err('already_has_business');
    end if;

    -- Dos personas a la vez con el mismo nombre: la segunda espera y toma el -2.
    v_base := public.loyalty_business_slug_base(v_name);
    perform pg_advisory_xact_lock(hashtext('loyalty_business_slug:' || v_base));
    v_id := public.loyalty_business_free_id(v_base);

    insert into public.companies (id, name, owner_phone) values (v_id, v_name, v_phone);
    insert into public.memberships (id, auth_user_id, company_id, role)
    values (gen_random_uuid()::text, v_uid, v_id, 'owner');

    -- Ya es owner: los ajustes pasan por la función normal, con sus validaciones.
    perform public.loyalty_settings_save(v_id, jsonb_build_object('slug', v_id, 'display_name', v_name));
    perform public.loyalty_audit(v_id, 'business.create', 'companies', v_id,
                                 jsonb_build_object('via', 'panel_self_service', 'slug_ocupado', v_id <> v_base));
    return jsonb_build_object('company_id', v_id, 'slug', v_id);
end $$;

-- ── Permisos ─────────────────────────────────────────────────────────────────
revoke execute on function public.loyalty_business_slug_base(text) from public, anon, authenticated;
revoke execute on function public.loyalty_business_free_id(text) from public, anon, authenticated;
revoke execute on function public.loyalty_business_slug_check(text) from public, anon;
grant execute on function public.loyalty_business_slug_check(text) to authenticated;
