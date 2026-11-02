-- FUNDEXA · quita el botón «Nuestros proyectos» y vuelve a publicar sin él.
-- Deshace scripts/fundexa-boton-proyectos.sql sin tocar los demás cambios del negocio.
begin;

do $$
declare
    v_company text;
    v_profile uuid;
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

    delete from public.loyalty_links where profile_id = v_profile and label = 'Nuestros proyectos';
    if not found then
        raise notice 'El botón no existe: no se cambia nada.';
        return;
    end if;

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
                                 jsonb_build_object('version', v_version, 'links', v_links, 'origen', 'scripts/fundexa-boton-proyectos-deshacer.sql'));
end $$;

commit;
