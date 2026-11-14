-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · botones de «Mis enlaces» (fideliza.vendemias.com/n/the247barbershop), 14-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
-- Pedido por Alvaro: sus redes y la página de reservas con «Reserva ahora».
--   1. Reserva ahora            → https://agenda.vendemias.com/the247        (destacado, icono de calendario)
--   2. Síguenos en Instagram    → https://www.instagram.com/the247barbershop
--   3. Síguenos en Facebook     → https://www.facebook.com/profile.php?id=61594858627958
-- Van arriba; los botones que el dueño ya tuviera se quedan debajo (sin repetir estos tres).
-- El alta a la tarjeta del Club 24/7 la pone la página sola (hay programa).
-- Con las mismas funciones que el panel, actuando como el dueño, y publicado al terminar.
-- Se puede repetir. El icono «reservar» necesita el código de 14-nov desplegado; sin él, el
-- botón sale con el icono de enlace genérico.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_id     constant text := 'the247barbershop';
    v_dueno  text;
    v_prof   uuid;
    v_nuevos jsonb := jsonb_build_array(
        jsonb_build_object('label', 'Reserva ahora', 'kind', 'url', 'url', 'https://agenda.vendemias.com/the247',
                           'icon', 'reservar', 'subtitle', 'Elige sede, servicio y hora', 'is_primary', true, 'placement', 'button'),
        jsonb_build_object('label', 'Síguenos en Instagram', 'kind', 'url', 'url', 'https://www.instagram.com/the247barbershop',
                           'icon', 'instagram', 'subtitle', '@the247barbershop', 'placement', 'button'),
        jsonb_build_object('label', 'Síguenos en Facebook', 'kind', 'url', 'url', 'https://www.facebook.com/profile.php?id=61594858627958',
                           'icon', 'facebook', 'placement', 'button'));
    v_viejos jsonb;
begin
    select auth_user_id into v_dueno from public.memberships where company_id = v_id and role = 'owner' limit 1;
    if v_dueno is null then raise exception 'El negocio no tiene dueño en memberships.'; end if;
    perform set_config('request.jwt.claim.sub', v_dueno, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_dueno, 'role', 'authenticated')::text, true);

    select default_profile_id into v_prof from public.loyalty_settings where company_id = v_id;
    if not found then raise exception 'The 24/7 no tiene Fideliza configurado.'; end if;

    -- Lo que ya hubiera (sin estos tres ni otro destacado), en su orden, debajo de los nuevos.
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', l.label, 'kind', l.kind, 'url', l.url, 'is_active', l.is_active, 'is_primary', false,
               'starts_at', l.starts_at, 'ends_at', l.ends_at, 'icon', l.icon, 'subtitle', l.subtitle, 'placement', l.placement)
               order by l.position), '[]'::jsonb)
      into v_viejos
      from public.loyalty_links l
     where v_prof is not null and l.profile_id = v_prof
       and coalesce(l.url, '') !~* '(agenda\.vendemias\.com/the247|instagram\.com/the247barbershop|facebook\.com/profile\.php\?id=61594858627958)';

    v_prof := public.loyalty_profile_save(v_id, v_prof,
        case when v_prof is null then 'Principal' end,
        case when v_prof is null then 'The 24/7 Barber Shop' end,
        case when v_prof is null then 'Dos sedes en Jr. Huallaga, Iquitos' end,
        v_nuevos || v_viejos, true);
    perform public.loyalty_profile_publish(v_id, v_prof, true);
    raise notice 'Listo: fideliza.vendemias.com/n/% (perfil %)', (select slug from public.loyalty_settings where company_id = v_id), v_prof;
end $$;

commit;

-- Comprobación: los tres arriba, «Reserva ahora» destacado.
select l.position, l.label, l.icon, l.is_primary, l.url
  from public.loyalty_links l
  join public.loyalty_settings s on s.default_profile_id = l.profile_id
 where s.company_id = 'the247barbershop'
 order by l.position;
