-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0008 · Plantillas de la página y redes con su logo
--
--   · loyalty_settings.page_style: plantilla, foto de fondo, botones, forma,
--     posición de las redes, categoría y el negocio elegido en Google. El color
--     principal sigue siendo bg_color (también lo usa Google Wallet).
--   · loyalty_links: icon (whatsapp, instagram, resenas…), subtitle (la línea
--     pequeña bajo el texto del botón) y placement ('button' o 'social': las
--     redes van como fila de iconos, no como botones).
--
-- Las versiones publicadas ya existentes siguen valiendo: si un enlace no
-- trae icono, la página lo deduce de su URL.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.loyalty_settings
    add column if not exists page_style jsonb not null default '{}'::jsonb;
alter table public.loyalty_settings drop constraint if exists ck_loyalty_settings_page_style;
alter table public.loyalty_settings
    add constraint ck_loyalty_settings_page_style
    check (jsonb_typeof(page_style) = 'object' and length(page_style::text) <= 2000);

alter table public.loyalty_links add column if not exists icon text;
alter table public.loyalty_links add column if not exists subtitle text;
alter table public.loyalty_links add column if not exists placement text not null default 'button';
alter table public.loyalty_links drop constraint if exists ck_loyalty_links_extra;
alter table public.loyalty_links
    add constraint ck_loyalty_links_extra
    check ((icon is null or icon ~ '^[a-z_]{1,20}$')
       and (subtitle is null or char_length(subtitle) <= 60)
       and placement in ('button', 'social'));

-- La marca que reciben las páginas públicas: ahora con el estilo.
create or replace function public.loyalty_brand(p_company text)
returns jsonb language sql stable as $$
    select jsonb_build_object('slug', s.slug, 'display_name', s.display_name, 'tagline', s.tagline,
                              'logo_url', s.logo_url, 'bg_color', s.bg_color, 'support_url', s.support_url,
                              'style', s.page_style)
      from public.loyalty_settings s where s.company_id = p_company;
$$;

-- Guardar solo el estilo (los datos del negocio siguen en loyalty_settings_save).
-- Las claves las valida el servidor; aquí, que sea un objeto y del tamaño justo.
create or replace function public.loyalty_page_style_save(p_company text, p_style jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'program.edit');
    if jsonb_typeof(p_style) <> 'object' or length(p_style::text) > 2000 then
        perform public.loyalty_err('invalid_settings', 'page_style');
    end if;
    if p_style ? 'fondo' and coalesce(p_style ->> 'fondo', '') <> '' and not public.loyalty_url_ok(p_style ->> 'fondo') then
        perform public.loyalty_err('invalid_url', 'fondo');
    end if;
    update public.loyalty_settings set page_style = p_style, updated_at = now() where company_id = p_company;
    if not found then perform public.loyalty_err('settings_missing'); end if;
    perform public.loyalty_audit(p_company, 'settings.page_style', 'loyalty_settings', p_company, p_style);
end $$;

-- El borrador de enlaces: igual que antes, más icono, subtítulo y posición.
create or replace function public.loyalty_profile_save(
    p_company text, p_profile uuid, p_name text, p_title text, p_tagline text, p_links jsonb, p_make_default boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    l jsonb;
    i integer := 0;
begin
    perform public.loyalty_require(p_company, 'links.manage');
    if jsonb_typeof(coalesce(p_links, '[]')) <> 'array' or jsonb_array_length(coalesce(p_links, '[]')) > 40 then
        perform public.loyalty_err('invalid_links');
    end if;
    begin
        if p_profile is null then
            insert into public.loyalty_link_profiles (company_id, name, title, tagline)
            values (p_company, btrim(p_name), coalesce(btrim(p_title), ''), coalesce(btrim(p_tagline), ''))
            returning id into v_id;
        else
            update public.loyalty_link_profiles
               set name = coalesce(btrim(p_name), name), title = coalesce(btrim(p_title), title),
                   tagline = coalesce(btrim(p_tagline), tagline), updated_at = now()
             where company_id = p_company and id = p_profile returning id into v_id;
            if v_id is null then perform public.loyalty_err('not_found'); end if;
        end if;

        delete from public.loyalty_links where profile_id = v_id;
        for l in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
            if coalesce(l ->> 'kind', 'url') = 'url' and not public.loyalty_url_ok(l ->> 'url') then
                perform public.loyalty_err('invalid_url', l ->> 'url');
            end if;
            insert into public.loyalty_links (company_id, profile_id, label, kind, url, position, is_active,
                                              is_primary, starts_at, ends_at, icon, subtitle, placement)
            values (p_company, v_id, btrim(l ->> 'label'), coalesce(l ->> 'kind', 'url'),
                    case when coalesce(l ->> 'kind', 'url') = 'url' then l ->> 'url' end, i,
                    coalesce((l ->> 'is_active')::boolean, true), coalesce((l ->> 'is_primary')::boolean, false),
                    nullif(l ->> 'starts_at', '')::timestamptz, nullif(l ->> 'ends_at', '')::timestamptz,
                    nullif(l ->> 'icon', ''), nullif(btrim(l ->> 'subtitle'), ''),
                    coalesce(nullif(l ->> 'placement', ''), 'button'));
            i := i + 1;
        end loop;
    exception
        when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow then
            perform public.loyalty_err('invalid_links', sqlerrm);
    end;

    if coalesce(p_make_default, false) or not exists (
        select 1 from public.loyalty_settings s where s.company_id = p_company and s.default_profile_id is not null) then
        update public.loyalty_settings set default_profile_id = v_id, updated_at = now() where company_id = p_company;
    end if;
    perform public.loyalty_audit(p_company, 'profile.save', 'loyalty_link_profiles', v_id::text,
                                 jsonb_build_object('links', p_links));
    return v_id;
end $$;

-- Publicar: la foto inmutable lleva ahora también icono, subtítulo y posición.
create or replace function public.loyalty_profile_publish(p_company text, p_profile uuid, p_allow_empty boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    pr public.loyalty_link_profiles;
    v_links jsonb;
    v_version integer;
    v_id uuid;
begin
    perform public.loyalty_require(p_company, 'links.manage');
    select * into pr from public.loyalty_link_profiles where company_id = p_company and id = p_profile for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', l.label, 'kind', l.kind, 'url', l.url, 'position', l.position, 'is_active', l.is_active,
               'is_primary', l.is_primary, 'starts_at', l.starts_at, 'ends_at', l.ends_at,
               'icon', l.icon, 'subtitle', l.subtitle, 'placement', l.placement) order by l.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links l where l.profile_id = p_profile;
    if jsonb_array_length(public.loyalty_effective_links(v_links, p_company)) = 0
       and not coalesce(p_allow_empty, false)
       and exists (select 1 from public.loyalty_devices d where d.profile_id = p_profile and d.status = 'active') then
        perform public.loyalty_err('empty_profile_in_use');
    end if;
    select coalesce(max(version), 0) + 1 into v_version from public.loyalty_published_link_versions where profile_id = p_profile;
    insert into public.loyalty_published_link_versions (company_id, profile_id, version, title, tagline, links, published_by)
    values (p_company, p_profile, v_version, pr.title, pr.tagline, v_links, (select auth.uid())::text)
    returning id into v_id;
    update public.loyalty_link_profiles set published_version_id = v_id, updated_at = now() where id = p_profile;
    perform public.loyalty_audit(p_company, 'profile.publish', 'loyalty_link_profiles', p_profile::text,
                                 jsonb_build_object('version', v_version, 'links', v_links));
    return jsonb_build_object('version', v_version, 'effective',
                              jsonb_array_length(public.loyalty_effective_links(v_links, p_company)));
end $$;

-- Permisos: la función nueva (las reemplazadas conservan los suyos).
revoke execute on function public.loyalty_page_style_save(text, jsonb) from public, anon;
grant execute on function public.loyalty_page_style_save(text, jsonb) to authenticated;
revoke execute on function public.loyalty_brand(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
