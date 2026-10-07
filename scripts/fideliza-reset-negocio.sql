-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · Dejar un negocio como recién creado, para volver a probar
--
-- Borra: página (enlaces, borrador y versiones publicadas), programa y sus
-- versiones, clientes, sellos/puntos, premios, canjes, pases y clase de Wallet,
-- campañas, suscripciones push, eventos, outbox y auditoría del negocio.
--
-- Conserva: la fila de `companies`, la membresía, `loyalty_settings` (slug y
-- nombre; el estilo de la página vuelve a '{}'), sucursales y equipo.
--
-- Placas: con v_liberar_placas = true vuelven al inventario sin dueño y el
-- MISMO código de la tarjeta (individual o de pedido) las vuelve a activar.
-- Con false siguen siendo del negocio, pero sin página asignada.
--
-- Google Wallet: los objetos viejos siguen en Google (no se borran desde aquí).
-- Quita el pase del móvil a mano; el nuevo programa crea clase y pase nuevos.
--
-- Se ejecuta en el SQL editor de Supabase (rol postgres): desactiva un momento
-- el trigger que hace inmutable el ledger. Todo va en una transacción.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 0 · Mira primero qué negocio es (y copia su slug abajo):
-- select company_id, slug, display_name from public.loyalty_settings order by created_at;

begin;

set constraints all deferred;
alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;

do $$
declare
    v_slug            text    := 'kallpa';   -- ← slug del negocio
    v_liberar_placas  boolean := true;
    c                 text;
begin
    select company_id into c from public.loyalty_settings where slug = v_slug;
    if c is null then raise exception 'No hay negocio con slug %', v_slug; end if;

    -- Clientes y todo lo que cuelga de ellos
    delete from public.loyalty_ledger             where company_id = c;
    delete from public.loyalty_redemptions        where company_id = c;
    delete from public.loyalty_rewards            where company_id = c;
    delete from public.loyalty_transactions       where company_id = c;
    delete from public.loyalty_wallet_passes      where company_id = c;
    delete from public.loyalty_push_subscriptions where company_id = c;
    delete from public.loyalty_campaign_events    where company_id = c;
    delete from public.loyalty_campaigns          where company_id = c;
    delete from public.loyalty_contacts           where company_id = c;
    delete from public.loyalty_consents           where company_id = c;
    delete from public.loyalty_members            where company_id = c;

    -- Programa y Wallet
    delete from public.loyalty_wallet_classes     where company_id = c;
    update public.loyalty_programs set current_version_id = null where company_id = c;
    delete from public.loyalty_program_versions   where company_id = c;
    delete from public.loyalty_programs           where company_id = c;

    -- Placas
    if v_liberar_placas then
        delete from public.loyalty_device_claims where company_id = c;
        update public.loyalty_devices
           set company_id = null, location_id = null, profile_id = null,
               status = 'tested', activation_used_at = null, activated_at = null,
               updated_at = now()
         where company_id = c;
    else
        update public.loyalty_devices
           set profile_id = null, status = 'assigned', activated_at = null, updated_at = now()
         where company_id = c;
    end if;

    -- Página
    update public.loyalty_settings
       set default_profile_id = null, page_style = '{}'::jsonb, updated_at = now()
     where company_id = c;
    update public.loyalty_link_profiles set published_version_id = null where company_id = c;
    delete from public.loyalty_links                   where company_id = c;
    delete from public.loyalty_published_link_versions where company_id = c;
    delete from public.loyalty_link_profiles           where company_id = c;

    -- Rastro
    delete from public.loyalty_public_events where company_id = c;
    delete from public.loyalty_outbox        where company_id = c;
    delete from public.loyalty_audit_log     where company_id = c;

    raise notice 'Negocio % (%) reiniciado', v_slug, c;
end $$;

alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;

commit;
