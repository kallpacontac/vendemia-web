-- FUNDEXA · botón «Nuestros proyectos» que abre su Instagram.
--
-- Ejecutar una vez en el SQL editor de Supabase. Se puede repetir: si el botón ya
-- existe, no hace nada. Después se edita con normalidad desde Mi página.
--
-- No usa loyalty_profile_publish porque exige la sesión de alguien del negocio.
-- Hace lo mismo que ella: /n/<slug> lee la versión publicada, no loyalty_links.
-- Para deshacerlo: scripts/fundexa-boton-proyectos-deshacer.sql
begin;

do $$
declare
    v_company text;
    v_profile uuid;
    v_url text;
    v_primero integer;
    v_links jsonb;
    v_version integer;
    v_id uuid;
    pr public.loyalty_link_profiles;
begin
    select company_id, default_profile_id into v_company, v_profile
      from public.loyalty_settings where slug = 'fundexa';
    if v_profile is null then
        raise exception 'No hay página publicada para el slug fundexa.';
    end if;

    if exists (select 1 from public.loyalty_links
                where profile_id = v_profile and label = 'Nuestros proyectos') then
        raise notice 'El botón ya existe: no se cambia nada.';
        return;
    end if;

    -- El mismo Instagram que ya usa su icono de redes.
    select url into v_url from public.loyalty_links
     where profile_id = v_profile and placement = 'social' and icon = 'instagram' and url is not null
     limit 1;
    if v_url is null then
        raise exception 'Fundexa no tiene Instagram en sus redes.';
    end if;

    -- Va el primero de los botones, debajo de los iconos de redes.
    select min(position) into v_primero from public.loyalty_links
     where profile_id = v_profile and placement = 'button';
    if v_primero is null then
        select coalesce(max(position), -1) + 1 into v_primero from public.loyalty_links where profile_id = v_profile;
    end if;
    update public.loyalty_links set position = position + 1
     where profile_id = v_profile and placement = 'button';

    insert into public.loyalty_links (company_id, profile_id, label, kind, url, position, is_active,
                                      is_primary, icon, placement)
    values (v_company, v_profile, 'Nuestros proyectos', 'url', v_url, v_primero, true, false, 'instagram', 'button');

    -- Publicar, igual que loyalty_profile_publish (sql/0008).
    select * into pr from public.loyalty_link_profiles where id = v_profile for update;
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', l.label, 'kind', l.kind, 'url', l.url, 'position', l.position, 'is_active', l.is_active,
               'is_primary', l.is_primary, 'starts_at', l.starts_at, 'ends_at', l.ends_at,
               'icon', l.icon, 'subtitle', l.subtitle, 'placement', l.placement) order by l.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links l where l.profile_id = v_profile;
    select coalesce(max(version), 0) + 1 into v_version
      from public.loyalty_published_link_versions where profile_id = v_profile;
    insert into public.loyalty_published_link_versions (company_id, profile_id, version, title, tagline, links, published_by)
    values (v_company, v_profile, v_version, pr.title, pr.tagline, v_links, null)
    returning id into v_id;
    update public.loyalty_link_profiles set published_version_id = v_id, updated_at = now() where id = v_profile;
    perform public.loyalty_audit(v_company, 'profile.publish', 'loyalty_link_profiles', v_profile::text,
                                 jsonb_build_object('version', v_version, 'links', v_links, 'origen', 'scripts/fundexa-boton-proyectos.sql'));
end $$;

commit;

-- Lo que queda publicado: «Nuestros proyectos» debe salir el primero de los botones.
select e ->> 'position' as posicion, e ->> 'placement' as lugar, e ->> 'label' as texto, e ->> 'url' as enlace
  from public.loyalty_settings s
  join public.loyalty_link_profiles p on p.id = s.default_profile_id
  join public.loyalty_published_link_versions v on v.id = p.published_version_id
 cross join lateral jsonb_array_elements(v.links) e
 where s.slug = 'fundexa'
 order by (e ->> 'position')::int;
