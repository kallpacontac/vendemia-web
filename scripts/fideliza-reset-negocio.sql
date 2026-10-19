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
-- v_alcance elige cuánto se borra:
--   'clientes' · solo los suscritos y lo suyo (saldos, premios, canjes, pases
--                de Wallet, push, envíos pendientes). Página, programa, clase
--                de Wallet y placas quedan intactos.
--   'programa' · lo anterior + programas, versiones y clase de Wallet. Página
--                y placas quedan intactas; el panel vuelve al modo «enlaces»
--                hasta que publiques otro programa.
--   'todo'     · lo anterior + página y placas (lo descrito arriba).
-- En los tres se borran las campañas y sus eventos.
--
-- Placas (solo con 'todo'): con v_liberar_placas = true vuelven al inventario sin dueño y el
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
    v_alcance         text    := 'programa'; -- 'clientes' · 'programa' · 'todo'
    v_liberar_placas  boolean := true;
    c                 text;
begin
    if v_alcance not in ('clientes', 'programa', 'todo') then
        raise exception 'v_alcance debe ser clientes, programa o todo (no «%»)', v_alcance;
    end if;
    select company_id into c from public.loyalty_settings where slug = v_slug;
    if c is null then
        -- Sin slug exacto: vale si UN solo negocio lo contiene en slug o nombre
        select min(company_id) into c from public.loyalty_settings
         where slug ilike '%' || v_slug || '%' or display_name ilike '%' || v_slug || '%'
        having count(*) = 1;
    end if;
    if c is null then
        raise exception 'No hay un negocio claro para «%». Hay: %', v_slug,
            (select string_agg(slug || ' = ' || display_name, ' · ' order by created_at) from public.loyalty_settings);
    end if;
    select slug into v_slug from public.loyalty_settings where company_id = c;

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

    if v_alcance = 'clientes' then
        -- Lo que el worker intentaría enviar a clientes que ya no existen
        delete from public.loyalty_outbox
         where company_id = c and kind in ('wallet.object.sync', 'push.send');
        delete from public.loyalty_public_events where company_id = c and member_id is not null;
        raise notice 'Clientes de % (%) borrados; página y programa intactos', v_slug, c;
        return;
    end if;

    -- Programa y Wallet
    delete from public.loyalty_wallet_classes     where company_id = c;
    update public.loyalty_programs set current_version_id = null where company_id = c;
    delete from public.loyalty_program_versions   where company_id = c;
    delete from public.loyalty_programs           where company_id = c;

    if v_alcance = 'programa' then
        -- Todo el outbox es de Wallet o push: sin programa ni clientes, sobra
        delete from public.loyalty_outbox        where company_id = c;
        delete from public.loyalty_public_events where company_id = c and member_id is not null;
        raise notice 'Programa y clientes de % (%) borrados; página y placas intactas', v_slug, c;
        return;
    end if;

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
