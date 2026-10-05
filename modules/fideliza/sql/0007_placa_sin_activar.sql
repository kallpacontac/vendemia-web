-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0007 · Placa nueva: «actívala» al acercar el móvil
--
-- Como las tarjetas NFC del mercado: el dueño acerca SU móvil a la placa recién
-- recibida y ve «Esta placa aún no está activada», con el camino al panel. Ahí
-- la vincula con el código impreso (loyalty_device_claim, sin cambios).
--
-- Solo cambia una respuesta del resolutor: una placa de inventario sin dueño
-- (company_id null, fabricada o probada) devuelve 'unclaimed' en vez de
-- 'not_found'. No dice nada más: ni lote, ni id, ni a quién va destinada. El
-- código de activación sigue siendo lo único que la vincula, así que acercar el
-- móvil a una placa ajena no da ningún poder sobre ella.
--
-- `create or replace` conserva los permisos de 0006: no hace falta repetirlos.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.loyalty_srv_resolve(p_token text, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d public.loyalty_devices;
    v public.loyalty_published_link_versions;
    v_links jsonb;
begin
    perform public.loyalty_srv_check();
    if p_token !~ '^[A-Za-z0-9_-]{22,64}$' then return jsonb_build_object('status', 'not_found'); end if;
    select * into d from public.loyalty_devices where public_token = p_token;
    if not found or d.status = 'retired' then
        return jsonb_build_object('status', 'not_found');
    end if;
    if d.company_id is null then
        -- Inventario de fábrica todavía sin dueño.
        return jsonb_build_object('status', case when d.status in ('manufactured', 'tested') then 'unclaimed' else 'not_found' end);
    end if;
    if d.status <> 'active' then
        perform public.loyalty_log_event(d.company_id, 'device_unavailable', p_source, d.id, d.profile_id, null, null);
        return jsonb_build_object('status', 'unavailable', 'brand', public.loyalty_brand(d.company_id));
    end if;
    select pv.* into v from public.loyalty_link_profiles pr
      join public.loyalty_published_link_versions pv on pv.id = pr.published_version_id
     where pr.id = d.profile_id;
    v_links := public.loyalty_effective_links(v.links, d.company_id);
    if jsonb_array_length(coalesce(v_links, '[]')) = 0 then
        perform public.loyalty_log_event(d.company_id, 'device_unavailable', p_source, d.id, d.profile_id, null, null);
        return jsonb_build_object('status', 'unavailable', 'brand', public.loyalty_brand(d.company_id));
    end if;
    perform public.loyalty_log_event(d.company_id, 'device_open', p_source, d.id, d.profile_id, null,
                                     jsonb_build_object('links', jsonb_array_length(v_links)));
    return jsonb_build_object('status', 'ok', 'device_id', d.id, 'profile_id', d.profile_id,
                              'title', v.title, 'tagline', v.tagline, 'links', v_links,
                              'brand', public.loyalty_brand(d.company_id));
end $$;
