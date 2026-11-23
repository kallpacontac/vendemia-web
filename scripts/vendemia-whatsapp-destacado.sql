-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA · «Escríbenos por WhatsApp» vuelve a ser el primer botón, en naranja · 22-nov-2026
--
-- En la página publicada (fideliza.vendemias.com/n/vendemia) ya no estaba ese botón. El
-- naranja es la marca «Destacado» (is_primary); desde el 22-nov, si ningún botón la tiene,
-- sale el primero (paginaPublica.ts). Aquí se marca WhatsApp explícitamente.
--
-- Solo toca ese botón: si existe (aunque esté oculto) lo muestra, lo destaca y lo sube
-- al primer lugar; si no existe, lo crea. Los demás botones siguen como están, ya sin
-- destacar (uno solo en naranja). El portafolio se corre uno para seguir detrás de los
-- mismos botones. Luego publica, como Guardar + Publicar en el panel: si había cambios
-- sin publicar en Mis enlaces, también salen.
-- Se puede correr dos veces.
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
    v_company text;
    v_profile uuid;
    v_wa      uuid;
    v_nuevo   boolean := false;
    v_delante boolean := false;
    v_links   jsonb;
    v_version integer;
    v_id      uuid;
begin
    select company_id, default_profile_id into v_company, v_profile
      from public.loyalty_settings where slug = 'vendemia';
    if v_company is null or v_profile is null then raise exception 'No encuentro la página de enlaces de vendemia'; end if;

    -- El botón de WhatsApp (no el icono de la fila de redes).
    select id into v_wa from public.loyalty_links
     where profile_id = v_profile and coalesce(placement, 'button') <> 'social'
       and (icon = 'whatsapp' or url ilike '%wa.me/%')
     order by is_active desc, position limit 1;

    -- ¿Ya iba delante del portafolio? (posicion = cuántos botones visibles van antes de él)
    if v_wa is not null then
        select l.is_active and (select count(*) from public.loyalty_links o
                                 where o.profile_id = v_profile and coalesce(o.placement, 'button') <> 'social'
                                   and o.is_active and o.position < l.position)
                               < coalesce((s.page_style #>> '{portafolio,posicion}')::int, 0)
          into v_delante
          from public.loyalty_links l, public.loyalty_settings s
         where l.id = v_wa and s.company_id = v_company
           and jsonb_typeof(s.page_style #> '{portafolio,posicion}') = 'number';
    end if;

    -- Uno solo en naranja.
    update public.loyalty_links set is_primary = false where profile_id = v_profile and is_primary;

    if v_wa is null then
        v_nuevo := true;
        update public.loyalty_links set position = position + 1 where profile_id = v_profile;
        insert into public.loyalty_links (company_id, profile_id, label, kind, url, position, is_active,
                                          is_primary, icon, subtitle, placement)
        values (v_company, v_profile, 'Escríbenos por WhatsApp', 'url', 'https://wa.me/51947144701', 0, true,
                true, 'whatsapp', 'Te respondemos hoy', 'button');
    else
        update public.loyalty_links set position = position + 1 where profile_id = v_profile and id <> v_wa;
        update public.loyalty_links set position = 0, is_active = true, is_primary = true where id = v_wa;
    end if;
    update public.loyalty_link_profiles set updated_at = now() where id = v_profile;

    -- El portafolio va detrás de N botones visibles: si WhatsApp no estaba ya delante, uno más.
    if not coalesce(v_delante, false) then
        update public.loyalty_settings
           set page_style = jsonb_set(page_style, '{portafolio,posicion}',
                                      to_jsonb((page_style #>> '{portafolio,posicion}')::int + 1)),
               updated_at = now()
         where company_id = v_company and jsonb_typeof(page_style #> '{portafolio,posicion}') = 'number';
    end if;

    -- Publicar (igual que loyalty_profile_publish y scripts/vendemia-pagina-enlaces.sql).
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', x.label, 'kind', x.kind, 'url', x.url, 'position', x.position, 'is_active', x.is_active,
               'is_primary', x.is_primary, 'starts_at', x.starts_at, 'ends_at', x.ends_at,
               'icon', x.icon, 'subtitle', x.subtitle, 'placement', x.placement) order by x.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links x where x.profile_id = v_profile;
    select coalesce(max(version), 0) + 1 into v_version
      from public.loyalty_published_link_versions where profile_id = v_profile;
    insert into public.loyalty_published_link_versions (company_id, profile_id, version, title, tagline, links, published_by)
    select v_company, v_profile, v_version, p.title, p.tagline, v_links, 'script vendemia-whatsapp-destacado'
      from public.loyalty_link_profiles p where p.id = v_profile
    returning id into v_id;
    update public.loyalty_link_profiles set published_version_id = v_id, updated_at = now() where id = v_profile;

    raise notice 'Vendemia: WhatsApp % y destacado; versión % publicada',
        case when v_nuevo then 'creado' else 'mostrado' end, v_version;
end $$;

commit;

-- Comprobación: la primera fila debe ser «Escríbenos por WhatsApp» con is_primary = true.
select l.position, l.label, l.is_active, l.is_primary
  from public.loyalty_links l join public.loyalty_settings s on s.default_profile_id = l.profile_id
 where s.slug = 'vendemia' and coalesce(l.placement, 'button') <> 'social'
 order by l.position;
