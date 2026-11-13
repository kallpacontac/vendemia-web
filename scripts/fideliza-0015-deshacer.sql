-- ═══════════════════════════════════════════════════════════════════════════════
-- DESHACER · Fideliza 0015 (niveles del mes, espera entre sesiones y bono)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Vuelve todo a como estaba con 0014: quita los triggers, las funciones nuevas y las
-- columnas, y repone las 5 funciones que 0015 redefinió con su texto de 0003/0004.
--
-- ⚠️ Se niega si algún programa publicado usa niveles, espera o bono, o si el libro
-- ya tiene líneas de reinicio de mes: borrar eso cambiaría saldos de clientes reales.
-- En ese caso, primero publica en ese programa una regla sin esas opciones.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if exists (select 1 from public.loyalty_program_versions
                where period <> 'none' or cooldown_hours is not null or bonus_units is not null) then
        raise exception 'Hay versiones de programa con niveles, espera o bono. No se deshace: cambiaría lo que ya ganaron sus clientes.';
    end if;
    if exists (select 1 from public.loyalty_ledger where kind = 'period_reset') then
        raise exception 'El libro ya tiene reinicios de mes. No se deshace.';
    end if;
end $$;

drop trigger if exists tr_loyalty_tx_reglas on public.loyalty_transactions;
drop trigger if exists tr_loyalty_ledger_niveles on public.loyalty_ledger;
drop function if exists public.loyalty_tx_reglas();
drop function if exists public.loyalty_ledger_niveles();
drop function if exists public.loyalty_bonus(text, uuid, text);
drop function if exists public.loyalty_srv_period_roll();

-- Las 5 funciones, tal como las dejaron 0003 y 0004.
create or replace function public.loyalty_issue_rewards(p_member uuid, v public.loyalty_program_versions, p_tx uuid)
returns integer language plpgsql as $$
declare
    m public.loyalty_members;
    v_reward uuid;
    n integer := 0;
begin
    loop
        select * into m from public.loyalty_members where id = p_member;
        exit when m.balance < v.reward_threshold or n >= 50;
        insert into public.loyalty_rewards (company_id, member_id, program_id, version_id, description,
                                            threshold, expires_at, source_transaction_id)
        values (m.company_id, m.id, m.program_id, v.id, v.reward_description, v.reward_threshold,
                case when v.reward_valid_days is not null then now() + make_interval(days => v.reward_valid_days) end,
                p_tx)
        returning id into v_reward;
        perform public.loyalty_move(m, -v.reward_threshold, 'reward_issue', p_tx, v_reward);
        update public.loyalty_members set rewards_available = rewards_available + 1 where id = m.id;
        n := n + 1;
    end loop;
    if n > 0 then perform public.loyalty_enqueue_template_push(m, 'reward_available'); end if;
    return n;
end $$;


create or replace function public.loyalty_member_card(p_member uuid)
returns jsonb language sql stable as $$
    select jsonb_build_object(
        'id', m.id, 'public_code', m.public_code, 'alias', m.alias, 'status', m.status,
        'balance', m.balance, 'rewards_available', m.rewards_available,
        'last_op_at', m.last_op_at, 'ops_count', m.ops_count,
        'rule_type', v.rule_type, 'threshold', v.reward_threshold, 'reward_description', v.reward_description,
        'verified_contact', exists (select 1 from public.loyalty_contacts c
                                     where c.member_id = m.id and c.verified_at is not null),
        'rewards', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', r.id, 'description', r.description, 'expires_at', r.expires_at) order by r.issued_at)
                     from public.loyalty_rewards r
                    where r.member_id = m.id and r.status = 'available'
                      and (r.expires_at is null or r.expires_at > now())), '[]'::jsonb))
      from public.loyalty_members m
      left join public.loyalty_programs p on p.id = m.program_id
      left join public.loyalty_program_versions v on v.id = p.current_version_id
     where m.id = p_member;
$$;


create or replace function public.loyalty_program_publish(p_company text, p_program uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.loyalty_programs;
    d jsonb;
    v_prev public.loyalty_program_versions;
    v_ver public.loyalty_program_versions;
    v_settings public.loyalty_settings;
    v_now timestamptz := clock_timestamp();
    v_locs uuid[];
begin
    perform public.loyalty_require(p_company, 'program.edit');
    select * into p from public.loyalty_programs where company_id = p_company and id = p_program for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    select * into v_settings from public.loyalty_settings where company_id = p_company;
    if not found then perform public.loyalty_err('settings_missing'); end if;
    if exists (select 1 from public.loyalty_programs o where o.company_id = p_company and o.id <> p_program
                  and o.status in ('active', 'paused')) then
        perform public.loyalty_err('another_program_live');
    end if;

    d := p.draft;
    if coalesce(d ->> 'rule_type', '') not in ('stamps', 'points', 'visits') then
        perform public.loyalty_err('invalid_rule', 'rule_type');
    end if;
    select * into v_prev from public.loyalty_program_versions
     where program_id = p_program order by version desc limit 1;
    -- Cambiar sellos por puntos convertiría 8 sellos en 8 puntos: los saldos
    -- dejarían de significar lo que significaban. Eso es un programa nuevo.
    if v_prev.id is not null and v_prev.rule_type <> d ->> 'rule_type' then
        perform public.loyalty_err('rule_type_locked');
    end if;

    if jsonb_typeof(d -> 'location_ids') = 'array' and jsonb_array_length(d -> 'location_ids') > 0 then
        select array_agg(x::uuid) into v_locs from jsonb_array_elements_text(d -> 'location_ids') x;
        if exists (select 1 from unnest(v_locs) l where not exists (
            select 1 from public.loyalty_locations x where x.company_id = p_company and x.id = l)) then
            perform public.loyalty_err('invalid_location');
        end if;
    end if;

    if v_prev.id is not null then
        update public.loyalty_program_versions set valid_to = v_now
         where program_id = p_program and (valid_to is null or valid_to > v_now) and valid_from < v_now;
    end if;

    begin
        insert into public.loyalty_program_versions (
            company_id, program_id, version, rule_type, stamps_per_purchase, points_per_unit, unit_cents,
            rounding, min_purchase_cents, reward_threshold, reward_description, reward_valid_days,
            valid_from, valid_to, location_ids, created_by)
        values (
            p_company, p_program, coalesce(v_prev.version, 0) + 1, d ->> 'rule_type',
            coalesce((d ->> 'stamps_per_purchase')::int, 1),
            coalesce((d ->> 'points_per_unit')::int, 1),
            coalesce((d ->> 'unit_cents')::int, 100),
            coalesce(d ->> 'rounding', 'floor'),
            coalesce((d ->> 'min_purchase_cents')::bigint, 0),
            (d ->> 'reward_threshold')::int,
            btrim(d ->> 'reward_description'),
            nullif(d ->> 'reward_valid_days', '')::int,
            v_now,
            nullif(d ->> 'valid_to', '')::timestamptz,
            v_locs,
            (select auth.uid())::text)
        returning * into v_ver;
    exception
        when check_violation or not_null_violation or invalid_text_representation
             or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then
            perform public.loyalty_err('invalid_rule', sqlerrm);
    end;

    update public.loyalty_programs
       set status = 'active', current_version_id = v_ver.id, published_at = v_now,
           last_error = null, updated_at = now()
     where id = p_program;

    -- Wallet: una clase POR PROGRAMA. Se crea/actualiza fuera de la transacción.
    -- issuer_id y class_id los pone el worker: el emisor es configuración del servidor.
    insert into public.loyalty_wallet_classes (company_id, program_id, is_demo)
    values (p_company, p_program, v_settings.wallet_use_demo_class)
    on conflict (program_id) do update set state = 'pending', is_demo = excluded.is_demo, updated_at = now();
    insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
    values (p_company, 'wallet.class.sync', jsonb_build_object('program_id', p_program), 'wallet.class:' || p_program)
    on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
    -- Los pases ya emitidos enseñan el premio: si cambió, se actualizan.
    perform public.loyalty_enqueue_wallet(m.id)
       from public.loyalty_members m where m.program_id = p_program and m.status <> 'deleted';

    perform public.loyalty_audit(p_company, 'program.publish', 'loyalty_programs', p_program::text,
                                 jsonb_build_object('version', v_ver.version, 'rule', to_jsonb(v_ver)));
    return to_jsonb(v_ver);
end $$;


create or replace function public.loyalty_srv_card(p_card_token text, p_log boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.loyalty_members;
begin
    perform public.loyalty_srv_check();
    m := public.loyalty_member_by_card(p_card_token);
    if m.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if p_log then perform public.loyalty_log_event(m.company_id, 'card_view', null, null, null, m.id, null); end if;
    return jsonb_build_object(
        'status', 'ok',
        'member', jsonb_build_object('public_code', m.public_code, 'alias', m.alias, 'status', m.status,
                                     'balance', m.balance, 'rewards_available', m.rewards_available,
                                     'qr_token', m.qr_token, 'created_at', m.created_at),
        'brand', public.loyalty_brand(m.company_id),
        'program', (select jsonb_build_object('name', p.name, 'description', p.short_description, 'status', p.status,
                                              'rule_type', v.rule_type, 'threshold', v.reward_threshold,
                                              'reward', v.reward_description)
                      from public.loyalty_programs p
                      left join public.loyalty_program_versions v on v.id = p.current_version_id
                     where p.id = m.program_id),
        'rewards', coalesce((select jsonb_agg(jsonb_build_object('description', r.description, 'expires_at', r.expires_at)
                                              order by r.issued_at)
                               from public.loyalty_rewards r
                              where r.member_id = m.id and r.status = 'available'
                                and (r.expires_at is null or r.expires_at > now())), '[]'::jsonb),
        'movements', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'units', l.units, 'at', l.created_at)
                                                order by l.id desc)
                                 from (select * from public.loyalty_ledger where member_id = m.id
                                        order by id desc limit 10) l), '[]'::jsonb),
        'wallet', (select jsonb_build_object('state', w.state, 'pending', w.synced_rev < w.desired_rev,
                                             'links_issued', w.save_links_issued)
                     from public.loyalty_wallet_passes w where w.member_id = m.id),
        'push', jsonb_build_object('consent', public.loyalty_consents_now(m.id, 'push'),
                                   'devices', (select count(*) from public.loyalty_push_subscriptions s
                                                where s.member_id = m.id and s.revoked_at is null)),
        'contacts', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'verified', c.verified_at is not null))
                                from public.loyalty_contacts c where c.member_id = m.id), '[]'::jsonb));
end $$;


create or replace function public.loyalty_srv_wallet_object_data(p_member uuid, p_card_token text, p_issuer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    c public.loyalty_wallet_classes;
    w public.loyalty_wallet_passes;
    v_new_id uuid := gen_random_uuid();
begin
    perform public.loyalty_srv_check();
    if p_card_token is not null then
        m := public.loyalty_member_by_card(p_card_token);
    else
        select * into m from public.loyalty_members where id = p_member;
    end if;
    if m.id is null then perform public.loyalty_err('not_found'); end if;
    select * into c from public.loyalty_wallet_classes where program_id = m.program_id;
    if c.id is null then perform public.loyalty_err('wallet_class_missing'); end if;

    if p_card_token is not null then
        if m.status <> 'active' then perform public.loyalty_err('member_inactive'); end if;
        if p_issuer !~ '^[0-9]{5,25}$' then perform public.loyalty_err('wallet_not_configured'); end if;
        insert into public.loyalty_wallet_passes (id, company_id, member_id, program_id, object_id, class_id)
        values (v_new_id, m.company_id, m.id, m.program_id,
                p_issuer || '.vf_' || replace(v_new_id::text, '-', ''), coalesce(c.class_id, ''))
        on conflict (member_id, provider) do nothing;
    end if;
    select * into w from public.loyalty_wallet_passes where member_id = m.id;
    if w.id is null then return null; end if;
    return jsonb_build_object(
        'pass', to_jsonb(w), 'class', to_jsonb(c),
        'member', jsonb_build_object('id', m.id, 'company_id', m.company_id, 'public_code', m.public_code,
                                     'alias', m.alias, 'status', m.status, 'balance', m.balance,
                                     'rewards_available', m.rewards_available, 'qr_token', m.qr_token),
        'program', (select jsonb_build_object('name', p.name, 'status', p.status, 'rule_type', v.rule_type,
                                              'threshold', v.reward_threshold, 'reward', v.reward_description)
                      from public.loyalty_programs p
                      left join public.loyalty_program_versions v on v.id = p.current_version_id
                     where p.id = m.program_id),
        'brand', public.loyalty_brand(m.company_id));
end $$;


drop function if exists public.loyalty_tiers_sync(uuid, public.loyalty_program_versions, uuid);
drop function if exists public.loyalty_period_roll(uuid, public.loyalty_program_versions);
drop function if exists public.loyalty_goal(public.loyalty_program_versions, integer);
drop function if exists public.loyalty_shown_balance(public.loyalty_members, public.loyalty_program_versions);
drop function if exists public.loyalty_month_start_ts(timestamptz);
drop function if exists public.loyalty_month_start(timestamptz);

alter table public.loyalty_ledger drop constraint if exists loyalty_ledger_kind_check;
alter table public.loyalty_ledger add constraint loyalty_ledger_kind_check check (
    kind in ('earn', 'reverse', 'reward_issue', 'reward_revoke', 'adjust'));
drop index if exists public.ix_loyalty_rewards_period;
alter table public.loyalty_rewards drop constraint if exists loyalty_rewards_tier_part_ck;
alter table public.loyalty_rewards drop column if exists period_start, drop column if exists tier_at, drop column if exists tier_part;
alter table public.loyalty_members drop column if exists period_start;
alter table public.loyalty_program_versions
    drop constraint if exists loyalty_versions_period_ck,
    drop constraint if exists loyalty_versions_cooldown_ck,
    drop constraint if exists loyalty_versions_bonus_ck,
    drop column if exists period, drop column if exists tiers, drop column if exists cooldown_hours,
    drop column if exists bonus_label, drop column if exists bonus_units;
drop function if exists public.loyalty_tiers_ok(jsonb);

commit;

notify pgrst, 'reload schema';
