-- ═══════════════════════════════════════════════════════════════════════════════
-- KALLPA · Avisos automáticos (Fideliza → Campañas) · 13-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Deja configuradas las 4 tarjetas de Campañas, con las mismas funciones que el
-- panel (después se cambian desde ahí):
--
--   · Bienvenida            ACTIVA  · una vez, al activar los avisos en su tarjeta.
--   · Recordatorio de regreso ACTIVA · a los 7 días sin venir (gimnasio: se entrena
--                                      varias veces por semana). Cada 7 días como mucho.
--   · Recuperar inactivos   ACTIVA  · a los 30 días sin venir. Una vez cada 90 días.
--   · Premio disponible     PAUSADA · ya sale solo y al instante «¡Ganaste un premio!»
--                                      (también por los de la cafetería). Activarla
--                                      mandaría el mismo aviso dos veces.
--
-- Los avisos de cada sello o visita («+1 visita en Asistencia · Llevas 7 de 12…»)
-- no son una campaña: van solos desde la caja, sin configurar nada.
--
-- Solo llegan a quien activó los avisos en su tarjeta. Desde el 13-nov se piden al
-- crear la tarjeta; quien ya la tenía los activa con el aviso de abajo de su tarjeta.
-- Se puede volver a correr: pisa los textos con estos.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_negocio constant text := 'kallpa';
    v_actor text;
begin
    if not exists (select 1 from public.loyalty_settings where company_id = v_negocio) then
        raise exception 'kallpa aún no tiene MiaTap.';
    end if;
    -- Actúa el dueño de kallpa, como si lo hiciera desde el panel.
    select auth_user_id into v_actor from public.memberships where company_id = v_negocio and role = 'owner';
    if v_actor is null then raise exception 'kallpa no tiene dueño en memberships.'; end if;
    perform set_config('request.jwt.claim.sub', v_actor, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

    perform public.loyalty_campaign_save(v_negocio, 'welcome', 'active',
        '¡Bienvenido al Club Kallpa!',
        'Cada sesión del mes suma y cada compra en la cafetería también. A las 12 sesiones: 5% de dscto y un batido.',
        '{}'::jsonb);
    perform public.loyalty_campaign_save(v_negocio, 'return_reminder', 'active',
        '¡Te extrañamos en Kallpa!',
        'Hace una semana que no vienes. Cada sesión te acerca a tu descuento del mes: te esperamos.',
        jsonb_build_object('cycle_days', 7, 'max_per_30d', 2));
    perform public.loyalty_campaign_save(v_negocio, 'winback', 'active',
        'Vuelve a entrenar con nosotros',
        'Hace un mes que no te vemos. Vuelve a Kallpa y retoma tu racha: cada sesión suma para tu descuento.',
        jsonb_build_object('inactive_days', 30, 'max_per_30d', 2));
    perform public.loyalty_campaign_save(v_negocio, 'reward_available', 'paused',
        'Tienes un premio esperándote',
        'Enséñalo en Kallpa para canjearlo: tu descuento o tu batido te espera.',
        '{}'::jsonb);
    raise notice 'Campañas de kallpa configuradas.';
end $$;

commit;

-- Comprobación: las 4, con su estado.
select template, status, title, config
  from public.loyalty_campaigns
 where company_id = 'kallpa' and template <> 'manual'
 order by array_position(array['welcome', 'reward_available', 'return_reminder', 'winback'], template);
