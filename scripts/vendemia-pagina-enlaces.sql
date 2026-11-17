-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA · su página de enlaces (fideliza.vendemias.com/n/vendemia) · 17-nov-2026
--
-- Lo que pidió Alvaro, en este orden:
--   1. Escríbenos por WhatsApp (947144701), destacado
--   2. Agenda tu demostración → se abre en la misma página (agenda.vendemias.com/vendemia)
--   3. Sus enlaces: Nuestra web, Yape / Plin, su tarjeta de puntos
--   4. «Mira lo que hicimos»: Mancha, Kallpa, Fundexa y Brew Bliss (portadas en
--      vendemias.com/portafolio/vendemia/)
--
-- Y quita «Déjanos tu reseña» y «Cómo llegar», que apuntaban al local de Kallpa
-- Triatlón (el lugar de Google guardado en el estilo también era el de Kallpa).
-- Instagram y WhatsApp siguen en la fila de iconos.
--
-- Hace lo mismo que Guardar + Publicar en el panel: reescribe el borrador, publica
-- una versión nueva (la anterior queda en el historial) y guarda el portafolio.
-- Necesita fideliza/0020_portafolio.sql. Se puede correr dos veces.
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
    v_company text;
    v_profile uuid;
    v_links   jsonb;
    v_version integer;
    v_id      uuid;
    l         jsonb;
    i         integer := 0;
begin
    select company_id, default_profile_id into v_company, v_profile
      from public.loyalty_settings where slug = 'vendemia';
    if v_company is null then raise exception 'No encuentro el negocio con slug vendemia'; end if;
    if v_profile is null then raise exception 'Vendemia no tiene página de enlaces por defecto'; end if;

    -- ── Botones (borrador) ─────────────────────────────────────────────────────
    delete from public.loyalty_links where profile_id = v_profile;
    for l in select * from jsonb_array_elements(jsonb_build_array(
        jsonb_build_object('label', 'Instagram', 'kind', 'url', 'url', 'https://instagram.com/bruno.vendemas',
                           'icon', 'instagram', 'placement', 'social'),
        jsonb_build_object('label', 'WhatsApp', 'kind', 'url', 'url', 'https://wa.me/51947144701',
                           'icon', 'whatsapp', 'placement', 'social'),
        jsonb_build_object('label', 'Escríbenos por WhatsApp', 'kind', 'url', 'url', 'https://wa.me/51947144701',
                           'icon', 'whatsapp', 'subtitle', 'Te respondemos hoy', 'is_primary', true),
        jsonb_build_object('label', 'Agenda tu demostración', 'kind', 'url', 'url', 'https://agenda.vendemias.com/vendemia',
                           'icon', 'reservar', 'subtitle', 'Gratis · 30 min · elige día y hora'),
        jsonb_build_object('label', 'Nuestra web', 'kind', 'url', 'url', 'https://vendemias.com/mi-pagina',
                           'icon', 'web'),
        jsonb_build_object('label', 'Paga con Yape o Plin', 'kind', 'url', 'url', 'https://fideliza.vendemias.com/pagar/947144701',
                           'icon', 'yape'),
        jsonb_build_object('label', 'Crear mi tarjeta de puntos', 'kind', 'join', 'icon', 'tarjeta')
    )) loop
        insert into public.loyalty_links (company_id, profile_id, label, kind, url, position, is_active,
                                          is_primary, icon, subtitle, placement)
        values (v_company, v_profile, l ->> 'label', l ->> 'kind', l ->> 'url', i, true,
                coalesce((l ->> 'is_primary')::boolean, false), l ->> 'icon', l ->> 'subtitle',
                coalesce(l ->> 'placement', 'button'));
        i := i + 1;
    end loop;
    update public.loyalty_link_profiles set updated_at = now() where id = v_profile;

    -- ── Publicar (igual que loyalty_profile_publish) ──────────────────────────
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', x.label, 'kind', x.kind, 'url', x.url, 'position', x.position, 'is_active', x.is_active,
               'is_primary', x.is_primary, 'starts_at', x.starts_at, 'ends_at', x.ends_at,
               'icon', x.icon, 'subtitle', x.subtitle, 'placement', x.placement) order by x.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links x where x.profile_id = v_profile;
    select coalesce(max(version), 0) + 1 into v_version
      from public.loyalty_published_link_versions where profile_id = v_profile;
    insert into public.loyalty_published_link_versions (company_id, profile_id, version, title, tagline, links, published_by)
    select v_company, v_profile, v_version, p.title, p.tagline, v_links, 'script vendemia-pagina-enlaces'
      from public.loyalty_link_profiles p where p.id = v_profile
    returning id into v_id;
    update public.loyalty_link_profiles set published_version_id = v_id, updated_at = now() where id = v_profile;

    -- ── Estilo: sin el lugar de Kallpa, con el portafolio ──────────────────────
    update public.loyalty_settings
       set page_style = (coalesce(page_style, '{}'::jsonb) - 'place_id' - 'place_nombre')
                        || jsonb_build_object('portafolio', jsonb_build_object(
                               'titulo', 'Mira lo que hicimos',
                               'posicion', 'abajo',
                               'trabajos', jsonb_build_array(
                                   jsonb_build_object('titulo', 'Mancha Burger Studio', 'etiqueta', 'Hamburguesería',
                                       'url', 'https://mancha-burger-studio-motion.bloomy-ray-5046.chatgpt.site/',
                                       'imagen', 'https://vendemias.com/portafolio/vendemia/mancha-burger-studio.jpg'),
                                   jsonb_build_object('titulo', 'Kallpa', 'etiqueta', 'Academia de natación',
                                       'url', 'https://kallpa-editorial-2026.bloomy-ray-5046.chatgpt.site/#catalog',
                                       'imagen', 'https://vendemias.com/portafolio/vendemia/kallpa-editorial.jpg'),
                                   jsonb_build_object('titulo', 'Fundexa', 'etiqueta', 'Acabados',
                                       'url', 'https://fundexa-acabados-concepto.tejuegobonito.chatgpt.site/',
                                       'imagen', 'https://vendemias.com/portafolio/vendemia/fundexa-acabados.jpg'),
                                   jsonb_build_object('titulo', 'Brew Bliss Café', 'etiqueta', 'Cafetería',
                                       'url', 'https://brew-bliss-cafe-20261027.bloomy-ray-5046.chatgpt.site/',
                                       'imagen', 'https://vendemias.com/portafolio/vendemia/brew-bliss-cafe.jpg')))),
           updated_at = now()
     where company_id = v_company;

    raise notice 'Vendemia: versión % publicada con % enlaces', v_version, jsonb_array_length(v_links);
end $$;

commit;
