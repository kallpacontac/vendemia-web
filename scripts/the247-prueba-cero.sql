-- ═══════════════════════════════════════════════════════════════════════════════
-- The 24/7 · TODO A CERO (18-nov-2026). Para empezar de verdad después de las pruebas.
-- ═══════════════════════════════════════════════════════════════════════════════
--
--   ⚠️ BORRA TODO LO QUE SE MUEVE del negocio, no solo lo de prueba:
--      citas y tickets, cobros, capturas de pago, gastos y adelantos, pagos de comisión,
--      boletas (y la numeración vuelve a B001-1), pedidos, CLIENTES y sus conversaciones,
--      tarjetas de fidelidad con sus sellos, avisos y reclamos.
--
--   SE QUEDA: catálogo y productos, barberos y sus horarios, Mi página y sedes, cuentas y
--   accesos, el diseño del Club 24/7 y sus premios, los ajustes de boletas, Google Calendar,
--   los celulares con avisos activados y el saldo de mensajes.
--
--   Cómo se usa:
--     1 · Córrelo tal cual: NO borra nada, solo lista cuántas filas hay en cada tabla.
--     2 · Si es lo que quieres, cambia v_confirmo a 'SI' (abajo) y córrelo otra vez.
--   Se puede repetir. Si una tabla no existe en esta base, se salta.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
declare
    v_id       constant text := 'the247barbershop';
    -- ▼▼▼ 'SI' para borrar de verdad. Con cualquier otra cosa, solo cuenta. ▼▼▼
    v_confirmo constant text := 'NO';
    -- Lo que se mueve, de lo que cuelga a lo que sostiene (si una tabla depende de otra, se
    -- reintenta en la siguiente vuelta).
    v_tablas constant text[] := array[
        -- Citas, cobros y caja
        'comisiones_congeladas', 'costos_congelados', 'cita_consumos', 'comprobantes_cobro', 'comprobantes_web',
        'pending_payments', 'appointment_services', 'canchas_fijas_citas', 'canchas_fijas', 'appointments',
        'comision_cierres', 'gastos', 'cobro_ajustes',
        -- Boletas y facturas (la numeración también: vuelve a empezar)
        'comprobantes_electronicos', 'factura_series',
        -- Pedidos y página
        'pedido_costos', 'envios', 'pedidos_web', 'reservas_web', 'mesa_llamados', 'mesa_carrito', 'orders',
        'pagina_avisame', 'pagina_idem', 'reclamos', 'avisos_stock',
        -- Clientes y conversaciones
        'borradores', 'escalations', 'conversation_events', 'messages', 'seguimientos', 'retargeting',
        -- Club 24/7: las tarjetas y sus sellos (el programa y los premios se quedan)
        'loyalty_ledger', 'loyalty_redemptions', 'loyalty_transactions', 'loyalty_wallet_passes',
        'loyalty_push_subscriptions', 'loyalty_device_claims', 'loyalty_devices', 'loyalty_birthday_sent',
        'loyalty_birthdays', 'loyalty_consents', 'loyalty_campaign_events', 'loyalty_outbox', 'loyalty_public_events',
        'loyalty_rate_limits', 'loyalty_webhook_receipts', 'loyalty_audit_log', 'loyalty_members', 'loyalty_contacts',
        -- Registros del panel
        'panel_push_events', 'commands', 'sync_borrados',
        -- Al final: los clientes
        'leads'
    ];
    v_hay     text[] := '{}';
    v_resto   text[];
    t         text;
    n         bigint;
    v_total   bigint := 0;
    v_vuelta  integer := 0;
    v_avance  boolean;
    v_ledger  boolean := false;
begin
    -- Solo las tablas que existen aquí y son por negocio (tienen company_id).
    foreach t in array v_tablas loop
        if to_regclass('public.' || t) is not null and exists (
            select 1 from information_schema.columns
             where table_schema = 'public' and table_name = t and column_name = 'company_id') then
            v_hay := v_hay || t;
        end if;
    end loop;

    if v_confirmo <> 'SI' then
        raise notice '── VISTA PREVIA: no se borra nada. Esto es lo que hay de %: ──', v_id;
        foreach t in array v_hay loop
            execute format('select count(*) from public.%I where company_id = $1', t) into n using v_id;
            if n > 0 then raise notice '  % · %', rpad(t, 30), n; v_total := v_total + n; end if;
        end loop;
        raise notice '── % filas en total. Para borrarlas: v_confirmo = ''SI'' y correr otra vez. ──', v_total;
        return;
    end if;

    -- Los sellos no se editan ni se borran (es la auditoría del club): se suelta ese candado
    -- solo mientras dura este borrado y se vuelve a poner al final.
    if 'loyalty_ledger' = any (v_hay) and exists (select 1 from pg_trigger where tgname = 'tr_loyalty_ledger_inmutable') then
        alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;
        v_ledger := true;
    end if;

    loop
        v_vuelta := v_vuelta + 1;
        v_avance := false;
        v_resto := '{}';
        foreach t in array v_hay loop
            begin
                execute format('delete from public.%I where company_id = $1', t) using v_id;
                get diagnostics n = row_count;
                if n > 0 then raise notice '  borrado % · %', rpad(t, 30), n; v_total := v_total + n; end if;
                v_avance := true;
            exception when foreign_key_violation then
                v_resto := v_resto || t;   -- otra tabla aún la usa: en la siguiente vuelta
            end;
        end loop;
        v_hay := v_resto;
        exit when coalesce(array_length(v_hay, 1), 0) = 0 or not v_avance or v_vuelta >= 8;
    end loop;

    if v_ledger then
        alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;
    end if;

    if coalesce(array_length(v_hay, 1), 0) > 0 then
        raise exception 'No se pudo vaciar: % (otra tabla las usa). No se borró nada.', v_hay;
    end if;
    raise notice '── Listo: % filas borradas. El negocio queda en cero. ──', v_total;
end $$;

commit;

-- Comprobación (después de borrar, todo en 0):
select (select count(*) from public.appointments where company_id = 'the247barbershop') as citas,
       (select count(*) from public.pending_payments where company_id = 'the247barbershop') as pagos,
       (select count(*) from public.gastos where company_id = 'the247barbershop') as gastos,
       (select count(*) from public.leads where company_id = 'the247barbershop') as clientes;
