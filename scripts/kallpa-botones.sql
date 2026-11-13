-- ═══════════════════════════════════════════════════════════════════════════════
-- KALLPA · Botones de su página de MiaTap · 13-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro. Añade a la página pública de Kallpa (la de su QR y su placa):
--   · Mira nuestros planes      → https://info.comunidadfortaleza.com/#bunker
--   · Reserva tus kekitos       → https://reserva.comunidadfortaleza.com/reservar
--   · Nuestra tienda virtual    → https://kallpita.store/
--   · Paga con Yape o Plin      → página con el +51 955 882 306 y «Copiar número»
--
-- No borra nada: conserva los botones que ya tenga y solo añade los que falten
-- (por su enlace). Si la página no tiene «Únete al club», lo pone el primero.
-- Guarda y PUBLICA con las mismas funciones que el panel (Fideliza → Mi página),
-- así que después se pueden reordenar o cambiar desde ahí.
--
-- ANTES: kallpa con MiaTap (scripts/kallpa-clubes-alta.sql). Se puede volver a correr.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_negocio constant text := 'kallpa';
    -- El orden en que salen, debajo de lo que ya haya.
    v_nuevos constant jsonb := jsonb_build_array(
        jsonb_build_object('label', 'Mira nuestros planes', 'kind', 'url', 'icon', 'web',
                           'url', 'https://info.comunidadfortaleza.com/#bunker'),
        jsonb_build_object('label', 'Reserva tus kekitos', 'kind', 'url', 'icon', 'carta',
                           'url', 'https://reserva.comunidadfortaleza.com/reservar'),
        jsonb_build_object('label', 'Nuestra tienda virtual', 'kind', 'url', 'icon', 'enlace',
                           'url', 'https://kallpita.store/'),
        jsonb_build_object('label', 'Paga con Yape o Plin', 'kind', 'url', 'icon', 'yape',
                           'subtitle', '+51 955 882 306',
                           'url', 'https://fideliza.vendemias.com/pagar/955882306'));
    v_actor   text;
    v_perfil  uuid;
    v_nombre  text;
    v_links   jsonb;
    n         jsonb;
    v_pub     jsonb;
begin
    if not exists (select 1 from public.loyalty_settings where company_id = v_negocio) then
        raise exception 'kallpa aún no tiene MiaTap. Corre antes scripts/kallpa-clubes-alta.sql.';
    end if;

    -- Actúa el dueño de kallpa, como si lo hiciera desde el panel.
    select auth_user_id into v_actor from public.memberships where company_id = v_negocio and role = 'owner';
    if v_actor is null then raise exception 'kallpa no tiene dueño en memberships.'; end if;
    perform set_config('request.jwt.claim.sub', v_actor, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

    -- La página que se ve (la de por defecto) y sus botones actuales, en su orden.
    select s.default_profile_id, coalesce(s.display_name, 'Kallpa') into v_perfil, v_nombre
      from public.loyalty_settings s where s.company_id = v_negocio;
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', l.label, 'kind', l.kind, 'url', l.url, 'is_active', l.is_active, 'is_primary', l.is_primary,
               'starts_at', l.starts_at, 'ends_at', l.ends_at, 'icon', l.icon, 'subtitle', l.subtitle,
               'placement', l.placement) order by l.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links l where l.profile_id = v_perfil;

    if not exists (select 1 from jsonb_array_elements(v_links) x where x ->> 'kind' = 'join') then
        v_links := jsonb_build_array(jsonb_build_object(
            'label', 'Únete al Club Kallpa', 'kind', 'join', 'icon', 'tarjeta', 'is_primary', true)) || v_links;
    end if;
    for n in select * from jsonb_array_elements(v_nuevos) loop
        if exists (select 1 from jsonb_array_elements(v_links) x where x ->> 'url' = n ->> 'url') then
            raise notice 'Ya estaba: %', n ->> 'label';
        else
            v_links := v_links || jsonb_build_array(n);
        end if;
    end loop;

    v_perfil := public.loyalty_profile_save(
        v_negocio, v_perfil,
        case when v_perfil is null then 'Página principal' end,
        case when v_perfil is null then v_nombre end,
        null, v_links, true);
    v_pub := public.loyalty_profile_publish(v_negocio, v_perfil, false);
    raise notice 'Publicada la versión % de la página de kallpa con % botones.', v_pub ->> 'version', jsonb_array_length(v_links);
end $$;

commit;

-- Comprobación: los botones tal como quedaron, en orden.
select l.position + 1 as orden, l.label, l.kind, l.icon, l.subtitle, l.url
  from public.loyalty_settings s
  join public.loyalty_links l on l.profile_id = s.default_profile_id
 where s.company_id = 'kallpa'
 order by l.position;
