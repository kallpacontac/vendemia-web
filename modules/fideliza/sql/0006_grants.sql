    -- ═══════════════════════════════════════════════════════════════════════════════
    -- VENDEMIA FIDELIZA · 0006 · Quién puede LLAMAR a cada función
    --
    -- ⚠️ Postgres da EXECUTE a PUBLIC por defecto en toda función nueva, y Supabase
    -- además a anon. Se quita a todas las loyalty_* y se da explícitamente:
    --
    --   · authenticated → las del panel (comprueban el permiso por dentro).
    --   · anon          → solo las loyalty_srv_* (exigen la clave del servidor).
    --   · nadie         → los ayudantes internos.
    -- ═══════════════════════════════════════════════════════════════════════════════

    do $$
    declare f record;
    begin
        for f in select p.oid::regprocedure as sig
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname like 'loyalty\_%'
        loop
            execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
        end loop;
    end $$;

    -- Panel (sesión del usuario).
    grant execute on function
        public.loyalty_role(text), public.loyalty_can(text, text), public.loyalty_can_at(text, uuid, text),
        public.loyalty_role_can(text, text), public.loyalty_es_admin(), public.loyalty_uid(),
        public.loyalty_settings_save(text, jsonb),
        public.loyalty_location_save(text, uuid, text, boolean),
        public.loyalty_team_list(text),
        public.loyalty_staff_set(text, text, text, uuid[]),
        public.loyalty_program_save(text, uuid, text, text, text, jsonb),
        public.loyalty_program_publish(text, uuid),
        public.loyalty_program_set_status(text, uuid, text),
        public.loyalty_member_create(text, text, text, text, boolean, text, text),
        public.loyalty_lookup(text, text),
        public.loyalty_member_search(text, text, text, text, integer, integer),
        public.loyalty_member_detail(text, uuid),
        public.loyalty_member_update(text, uuid, text, text, text),
        public.loyalty_member_verify(text, uuid, text),
        public.loyalty_member_set_status(text, uuid, text, text),
        public.loyalty_member_rotate_card(text, uuid),
        public.loyalty_consent_set(text, uuid, text, boolean, text),
        public.loyalty_member_export(text, uuid),
        public.loyalty_member_erase(text, uuid, text),
        public.loyalty_record(text, uuid, text, bigint, uuid, text, text, text),
        public.loyalty_redeem(text, uuid, uuid, uuid, text),
        public.loyalty_refund(text, uuid, bigint, text, text),
        public.loyalty_adjust(text, uuid, integer, text, text),
        public.loyalty_reconcile(text, boolean),
        public.loyalty_profile_save(text, uuid, text, text, text, jsonb, boolean),
        public.loyalty_profile_publish(text, uuid, boolean),
        public.loyalty_device_create(text, text, text, uuid, uuid),
        public.loyalty_admin_device_batch(integer, text, text),
        public.loyalty_device_claim(text, text),
        public.loyalty_device_update(text, uuid, text, uuid, uuid),
        public.loyalty_device_set_status(text, uuid, text),
        public.loyalty_campaign_save(text, text, text, text, text, jsonb),
        public.loyalty_campaign_audience(text, text, jsonb),
        public.loyalty_wallet_resync(text, uuid),
        public.loyalty_outbox_retry(text, bigint),
        public.loyalty_metrics(text, date, date)
    to authenticated;

    -- Servidor (clave anon + cabecera x-fideliza-key).
    grant execute on function
        public.loyalty_srv_rate_hit(text, integer, integer),
        public.loyalty_srv_resolve(text, text),
        public.loyalty_srv_business(text, text),
        public.loyalty_srv_join(text, text, text, text),
        public.loyalty_srv_card(text, boolean),
        public.loyalty_srv_card_action(text, text, jsonb),
        public.loyalty_srv_wallet_class_data(uuid),
        public.loyalty_srv_wallet_class_mark(uuid, boolean, text, text, text, text, text),
        public.loyalty_srv_wallet_object_data(uuid, text, text),
        public.loyalty_srv_wallet_pass_mark(uuid, boolean, integer, text, boolean, boolean, text),
        public.loyalty_srv_outbox_claim(text, integer, text),
        public.loyalty_srv_outbox_finish(bigint, boolean, text, boolean, timestamptz, jsonb),
        public.loyalty_srv_push_prepare(bigint),
        public.loyalty_srv_push_result(uuid, uuid, integer, text[], text),
        public.loyalty_srv_campaign_scan(),
        public.loyalty_srv_housekeeping(),
        public.loyalty_srv_logo_checked(text, text, jsonb),
        public.loyalty_srv_pending(text)
    to anon, authenticated;

    notify pgrst, 'reload schema';

    -- ═══════════════════════════════════════════════════════════════════════════════
    -- ⚠️ PASO MANUAL · la clave del servidor (una vez, y al rotarla)
    --
    -- 1 · Genera una clave larga en tu máquina, por ejemplo:
    --       node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
    -- 2 · Ponla en Vercel como FIDELIZA_SERVER_KEY (Production y Preview). NO
    --     NEXT_PUBLIC_. NO en el repo.
    -- 3 · Aquí, en el SQL Editor, guarda SOLO su hash:
    --
    --       insert into public.loyalty_server_keys (key_hash, label)
    --       values (sha256(convert_to('<PEGA-LA-CLAVE>', 'UTF8')), 'vercel 2026-10');
    --
    --     El editor de Supabase guarda el historial de consultas: si no quieres que
    --     la clave quede ahí, calcula el hash en tu máquina y pega solo el hex:
    --       node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" '<clave>'
    --       insert into public.loyalty_server_keys (key_hash, label) values ('\x<hex>', 'vercel 2026-10');
    --
    -- Rotar: insertar la nueva, desplegar, y después
    --       update public.loyalty_server_keys set active = false where label = '<la vieja>';
    -- ═══════════════════════════════════════════════════════════════════════════════
