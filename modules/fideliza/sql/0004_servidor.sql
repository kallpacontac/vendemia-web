-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0004 · Lo que llama el servidor de Next
--
-- Dos familias, las dos con loyalty_srv_check() como primera línea:
--
--   · Público (fideliza.vendemias.com): resolver una placa, la página de un
--     negocio, el alta, la tarjeta. Nunca cambian saldos. El token de tarjeta
--     solo da acceso a SU tarjeta, y solo a leerla y a gestionar sus datos.
--   · Worker: reclamar trabajos del outbox, leer lo que Google necesita,
--     apuntar resultados, campañas y mantenimiento.
--
-- Nadie más puede llamarlas: sin la clave del servidor fallan con 42501.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Ventana fija por cubo. El servidor arma el cubo con un hash de la IP, nunca
-- la IP en claro.
create or replace function public.loyalty_srv_rate_hit(p_bucket text, p_limit integer, p_window_s integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v integer;
begin
    perform public.loyalty_srv_check();
    insert into public.loyalty_rate_limits as r (bucket, window_start, hits) values (left(p_bucket, 200), now(), 1)
    on conflict (bucket) do update set
        hits = case when r.window_start < now() - make_interval(secs => p_window_s) then 1 else r.hits + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_s) then now() else r.window_start end
    returning hits into v;
    return v <= p_limit;
end $$;

create or replace function public.loyalty_brand(p_company text)
returns jsonb language sql stable as $$
    select jsonb_build_object('slug', s.slug, 'display_name', s.display_name, 'tagline', s.tagline,
                              'logo_url', s.logo_url, 'bg_color', s.bg_color, 'support_url', s.support_url)
      from public.loyalty_settings s where s.company_id = p_company;
$$;

create or replace function public.loyalty_program_public(p_company text)
returns jsonb language sql stable as $$
    select jsonb_build_object('name', p.name, 'description', p.short_description, 'status', p.status,
                              'rule_type', v.rule_type, 'threshold', v.reward_threshold,
                              'reward', v.reward_description, 'stamps_per_purchase', v.stamps_per_purchase,
                              'points_per_unit', v.points_per_unit, 'unit_cents', v.unit_cents,
                              'min_purchase_cents', v.min_purchase_cents, 'valid_to', v.valid_to)
      from public.loyalty_programs p
      join public.loyalty_program_versions v on v.id = p.current_version_id
     where p.company_id = p_company and p.status = 'active';
$$;

create or replace function public.loyalty_log_event(
    p_company text, p_kind text, p_source text, p_device uuid, p_profile uuid, p_member uuid, p_detail jsonb)
returns void language sql as $$
    insert into public.loyalty_public_events (company_id, kind, source, device_id, profile_id, member_id, detail)
    values (p_company, p_kind, p_source, p_device, p_profile, p_member, p_detail);
$$;

-- ── /t/<token> ────────────────────────────────────────────────────────────────
-- Devuelve qué hacer y apunta la apertura en la misma llamada (una ida a la
-- base, nada pendiente después de responder). El 0/1/N lo decide el servidor
-- con `links`.
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
    if not found or d.company_id is null or d.status in ('retired', 'manufactured', 'tested') then
        return jsonb_build_object('status', 'not_found');
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

-- ── /n/<slug> y /n/<slug>/unirse ──────────────────────────────────────────────
create or replace function public.loyalty_srv_business(p_slug text, p_event text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    s public.loyalty_settings;
    v public.loyalty_published_link_versions;
begin
    perform public.loyalty_srv_check();
    select * into s from public.loyalty_settings where slug = lower(p_slug);
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select pv.* into v from public.loyalty_link_profiles pr
      join public.loyalty_published_link_versions pv on pv.id = pr.published_version_id
     where pr.id = s.default_profile_id;
    if p_event in ('links_view', 'join_view') then
        perform public.loyalty_log_event(s.company_id, p_event, null, null, s.default_profile_id, null, null);
    end if;
    return jsonb_build_object('status', 'ok', 'brand', public.loyalty_brand(s.company_id),
                              'title', v.title, 'tagline', v.tagline,
                              'links', public.loyalty_effective_links(v.links, s.company_id),
                              'program', public.loyalty_program_public(s.company_id));
end $$;

create or replace function public.loyalty_srv_join(p_slug text, p_alias text, p_device_token text, p_creation_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    s public.loyalty_settings;
    p public.loyalty_programs;
    v_device uuid;
    r jsonb;
begin
    perform public.loyalty_srv_check();
    select * into s from public.loyalty_settings where slug = lower(p_slug);
    if not found then perform public.loyalty_err('not_found'); end if;
    select * into p from public.loyalty_programs where company_id = s.company_id and status = 'active';
    if not found then perform public.loyalty_err('program_not_active'); end if;
    if p_device_token is not null then
        select id into v_device from public.loyalty_devices
         where public_token = p_device_token and company_id = s.company_id;
    end if;
    begin
        r := public.loyalty_insert_member(s.company_id, p.id, left(p_alias, 40), 'public', v_device, p_creation_key);
    exception when others then
        -- El mismo navegador reenviando el formulario: no hay segunda tarjeta.
        if sqlerrm = 'loyalty:member_create_replayed' then perform public.loyalty_err('join_replayed'); end if;
        raise;
    end;
    perform public.loyalty_log_event(s.company_id, 'join', case when v_device is not null then 'link' end,
                                     v_device, null, (r ->> 'member_id')::uuid, null);
    perform public.loyalty_audit(s.company_id, 'member.join', 'loyalty_members', r ->> 'member_id', null, 'public');
    return r - 'member_id';
end $$;

-- ── /m/<token> · la tarjeta ───────────────────────────────────────────────────
create or replace function public.loyalty_member_by_card(p_card_token text)
returns public.loyalty_members language sql stable as $$
    select m.* from public.loyalty_members m
     where p_card_token ~ '^[A-Za-z0-9_-]{30,64}$'
       and m.card_token_hash = public.loyalty_hash(p_card_token) and m.status <> 'deleted';
$$;

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

-- Lo que el titular de la tarjeta puede hacer con ella. Nada toca el saldo.
create or replace function public.loyalty_srv_card_action(p_card_token text, p_action text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members := public.loyalty_member_by_card(p_card_token);
    v_campaign uuid;
begin
    perform public.loyalty_srv_check();
    if m.id is null then perform public.loyalty_err('not_found'); end if;

    if p_action = 'alias' then
        update public.loyalty_members set alias = nullif(left(btrim(p_args ->> 'alias'), 40), ''), updated_at = now()
         where id = m.id;
        perform public.loyalty_enqueue_wallet(m.id);

    elsif p_action = 'contact' then
        -- Sin verificar: sirve para que el negocio le reconozca; NO une tarjetas.
        perform public.loyalty_set_contact(m.company_id, m.id, 'phone',
                                           public.loyalty_norm_phone(p_args ->> 'phone'), false, null);
        perform public.loyalty_set_contact(m.company_id, m.id, 'email',
                                           public.loyalty_norm_email(p_args ->> 'email'), false, null);

    elsif p_action = 'consent' then
        if p_args ->> 'channel' not in ('push') then perform public.loyalty_err('invalid_channel'); end if;
        insert into public.loyalty_consents (company_id, member_id, channel, granted, source, text_version)
        values (m.company_id, m.id, 'push', (p_args ->> 'granted')::boolean,
                case when (p_args ->> 'granted')::boolean then 'card' else 'unsubscribe' end,
                coalesce(p_args ->> 'text_version', 'v1'));
        if not (p_args ->> 'granted')::boolean then
            perform public.loyalty_cancel_member_pushes(m.id, 'unsubscribed');
            update public.loyalty_push_subscriptions set revoked_at = now() where member_id = m.id and revoked_at is null;
            insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
            select distinct m.company_id, e.campaign_id, m.id, 'unsubscribed'
              from public.loyalty_campaign_events e
             where e.member_id = m.id and e.stage = 'provider_accepted' and e.created_at > now() - interval '30 days';
        end if;

    elsif p_action = 'push_subscribe' then
        if not public.loyalty_consents_now(m.id, 'push') then perform public.loyalty_err('consent_required'); end if;
        insert into public.loyalty_push_subscriptions (company_id, member_id, endpoint, p256dh, auth, installation_id)
        values (m.company_id, m.id, p_args ->> 'endpoint', p_args ->> 'p256dh', p_args ->> 'auth',
                left(p_args ->> 'installation_id', 64))
        on conflict (member_id, endpoint) do update
           set p256dh = excluded.p256dh, auth = excluded.auth, revoked_at = null, last_error = null;
        perform public.loyalty_log_event(m.company_id, 'push_subscribed', null, null, null, m.id, null);
        -- Bienvenida: una sola vez por miembro.
        if not exists (select 1 from public.loyalty_campaign_events e
                         join public.loyalty_campaigns c on c.id = e.campaign_id
                        where e.member_id = m.id and c.template = 'welcome') then
            perform public.loyalty_enqueue_template_push(m, 'welcome');
        end if;

    elsif p_action = 'push_unsubscribe' then
        update public.loyalty_push_subscriptions set revoked_at = now()
         where member_id = m.id and endpoint = p_args ->> 'endpoint';

    elsif p_action = 'campaign_click' then
        v_campaign := nullif(p_args ->> 'campaign_id', '')::uuid;
        if exists (select 1 from public.loyalty_campaign_events e
                    where e.member_id = m.id and e.campaign_id = v_campaign and e.stage = 'provider_accepted') then
            insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
            values (m.company_id, v_campaign, m.id, 'observed_click');
            perform public.loyalty_log_event(m.company_id, 'campaign_click', null, null, null, m.id,
                                             jsonb_build_object('campaign_id', v_campaign));
        end if;

    elsif p_action = 'erase' then
        perform public.loyalty_erase_member(m.id, 'public', 'solicitado por el titular desde su tarjeta');
        return jsonb_build_object('status', 'erased');

    else
        perform public.loyalty_err('invalid_action');
    end if;
    return jsonb_build_object('status', 'ok');
end $$;

-- ── Google Wallet ─────────────────────────────────────────────────────────────

-- Lo que hace falta para construir la clase de un programa.
create or replace function public.loyalty_srv_wallet_class_data(p_program uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    return (select jsonb_build_object(
                'program_id', p.id, 'company_id', p.company_id, 'program_name', p.name, 'status', p.status,
                'description', p.short_description, 'reward', v.reward_description,
                'threshold', v.reward_threshold, 'rule_type', v.rule_type,
                'brand', public.loyalty_brand(p.company_id),
                'class', to_jsonb(c))
              from public.loyalty_programs p
              left join public.loyalty_program_versions v on v.id = p.current_version_id
              left join public.loyalty_wallet_classes c on c.program_id = p.id
             where p.id = p_program);
end $$;

create or replace function public.loyalty_srv_wallet_class_mark(
    p_program uuid, p_ok boolean, p_issuer text, p_class_id text, p_review_status text, p_config_hash text, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.loyalty_wallet_classes
       set issuer_id = coalesce(p_issuer, issuer_id), class_id = coalesce(p_class_id, class_id),
           review_status = coalesce(p_review_status, review_status),
           config_hash = case when p_ok then p_config_hash else config_hash end,
           state = case when p_ok then 'synced' else 'error' end,
           last_error = case when p_ok then null else left(p_error, 500) end,
           last_synced_at = case when p_ok then now() else last_synced_at end,
           updated_at = now()
     where program_id = p_program;
end $$;

-- El pase de UN miembro. Si no existía la fila, se crea aquí (unique por
-- miembro): llamar dos veces devuelve el mismo object_id.
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

create or replace function public.loyalty_srv_wallet_pass_mark(
    p_member uuid, p_ok boolean, p_rev integer, p_class_id text, p_inactive boolean, p_link_issued boolean, p_error text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.loyalty_wallet_passes
       set state = case when not p_ok then 'error' when p_inactive then 'inactive' else 'synced' end,
           synced_rev = case when p_ok then greatest(synced_rev, coalesce(p_rev, synced_rev)) else synced_rev end,
           class_id = coalesce(p_class_id, class_id),
           last_error = case when p_ok then null else left(p_error, 500) end,
           last_synced_at = case when p_ok then now() else last_synced_at end,
           save_links_issued = save_links_issued + case when p_link_issued then 1 else 0 end,
           last_save_link_at = case when p_link_issued then now() else last_save_link_at end,
           updated_at = now()
     where member_id = p_member;
    if p_link_issued then
        perform public.loyalty_log_event(m.company_id, 'wallet_link', null, null, null, m.id, null)
           from public.loyalty_members m where m.id = p_member;
    end if;
end $$;

-- ── Outbox ────────────────────────────────────────────────────────────────────
-- SKIP LOCKED: dos workers a la vez no cogen el mismo trabajo. Los que llevan
-- más de 10 minutos «processing» se dan por abandonados y vuelven a la cola.
create or replace function public.loyalty_srv_outbox_claim(p_worker text, p_limit integer, p_company text)
returns setof public.loyalty_outbox language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.loyalty_outbox
       set status = 'retry', locked_at = null, locked_by = null, last_error = 'abandonado: se reintenta',
           next_attempt_at = now(), updated_at = now()
     where status = 'processing' and locked_at < now() - interval '10 minutes'
       and not exists (select 1 from public.loyalty_outbox o2
                        where o2.dedupe_key = loyalty_outbox.dedupe_key and o2.status in ('pending', 'retry'));
    return query
    with c as (
        select o.id from public.loyalty_outbox o
         where o.status in ('pending', 'retry') and o.next_attempt_at <= now()
           and (p_company is null or o.company_id = p_company)
         order by o.next_attempt_at
         limit least(greatest(coalesce(p_limit, 10), 1), 50)
         for update skip locked)
    update public.loyalty_outbox o
       set status = 'processing', locked_at = now(), locked_by = left(p_worker, 60),
           attempts = o.attempts + 1, updated_at = now()
      from c where o.id = c.id
    returning o.*;
end $$;

-- Backoff: 30 s · 1 min · 2 · 4 · 8 … con tope de 6 h. Un error permanente
-- (credenciales, datos inválidos) va directo a `dead`: reintentarlo no lo arregla.
create or replace function public.loyalty_srv_outbox_finish(
    p_id bigint, p_ok boolean, p_error text, p_permanent boolean, p_retry_at timestamptz, p_result jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o public.loyalty_outbox;
begin
    perform public.loyalty_srv_check();
    select * into o from public.loyalty_outbox where id = p_id for update;
    if not found then return; end if;
    if p_ok then
        update public.loyalty_outbox
           set status = 'done', done_at = now(), last_error = null, result = p_result, locked_at = null, updated_at = now()
         where id = p_id;
    elsif p_retry_at is not null then
        -- Reprogramado sin contar como intento (p. ej. fuera de 09:00–20:00).
        update public.loyalty_outbox
           set status = 'retry', attempts = greatest(attempts - 1, 0), next_attempt_at = p_retry_at,
               last_error = left(p_error, 500), locked_at = null, updated_at = now()
         where id = p_id;
    else
        update public.loyalty_outbox
           set status = case when p_permanent or o.attempts >= o.max_attempts then 'dead' else 'retry' end,
               next_attempt_at = now() + least(interval '30 seconds' * power(2, greatest(o.attempts - 1, 0)), interval '6 hours'),
               last_error = left(p_error, 500), result = p_result, locked_at = null, updated_at = now()
         where id = p_id;
    end if;
exception when unique_violation then
    -- Mientras corría, entró otro trabajo pendiente para lo mismo: ese hará el trabajo.
    update public.loyalty_outbox set status = 'done', done_at = now(), result = '{"merged":true}', locked_at = null
     where id = p_id;
end $$;

-- ── Push ──────────────────────────────────────────────────────────────────────
-- Se comprueba TODO otra vez justo antes de enviar: la baja o la compra pueden
-- haber llegado después de encolar.
create or replace function public.loyalty_srv_push_prepare(p_outbox bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    o public.loyalty_outbox;
    m public.loyalty_members;
    c public.loyalty_campaigns;
    v_slot timestamptz;
    v_sent integer;
begin
    perform public.loyalty_srv_check();
    select * into o from public.loyalty_outbox where id = p_outbox;
    select * into m from public.loyalty_members where id = (o.payload ->> 'member_id')::uuid;
    select * into c from public.loyalty_campaigns where id = (o.payload ->> 'campaign_id')::uuid;
    if m.id is null or m.status <> 'active' then return jsonb_build_object('send', false, 'reason', 'member_inactive'); end if;
    if c.id is null or c.status <> 'active' then return jsonb_build_object('send', false, 'reason', 'campaign_inactive'); end if;
    if not public.loyalty_consents_now(m.id, 'push') then
        return jsonb_build_object('send', false, 'reason', 'no_consent');
    end if;
    if c.template in ('return_reminder', 'winback') and m.last_op_at > (o.payload ->> 'eligible_at')::timestamptz then
        insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage, detail)
        values (m.company_id, c.id, m.id, 'skipped', 'compra después de ser elegible');
        return jsonb_build_object('send', false, 'reason', 'purchased');
    end if;
    if c.template = 'reward_available' and m.rewards_available = 0 then
        return jsonb_build_object('send', false, 'reason', 'no_reward');
    end if;
    v_slot := public.loyalty_next_send_slot();
    if v_slot > now() then return jsonb_build_object('send', false, 'reschedule_at', v_slot); end if;
    select count(*) into v_sent from public.loyalty_campaign_events
     where member_id = m.id and stage = 'attempted' and created_at > now() - interval '30 days';
    if v_sent >= coalesce((c.config ->> 'max_per_30d')::int, 2) then
        insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage, detail)
        values (m.company_id, c.id, m.id, 'skipped', 'tope de mensajes por 30 días');
        return jsonb_build_object('send', false, 'reason', 'frequency_cap');
    end if;
    if not exists (select 1 from public.loyalty_push_subscriptions s where s.member_id = m.id and s.revoked_at is null) then
        return jsonb_build_object('send', false, 'reason', 'no_subscription');
    end if;
    insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
    values (m.company_id, c.id, m.id, 'attempted');
    return jsonb_build_object(
        'send', true, 'campaign_id', c.id, 'member_id', m.id, 'title', c.title, 'body', c.body,
        'brand', public.loyalty_brand(m.company_id),
        'subscriptions', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                            from public.loyalty_push_subscriptions s where s.member_id = m.id and s.revoked_at is null));
end $$;

-- `provider_accepted` = el servicio de push del navegador aceptó el mensaje.
-- NO es «entregado» ni «leído», y el panel no lo llama así.
create or replace function public.loyalty_srv_push_result(
    p_member uuid, p_campaign uuid, p_accepted integer, p_gone text[], p_error text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company text;
begin
    perform public.loyalty_srv_check();
    select company_id into v_company from public.loyalty_members where id = p_member;
    if p_accepted > 0 then
        insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage, detail)
        values (v_company, p_campaign, p_member, 'provider_accepted', p_accepted::text);
    end if;
    if p_gone is not null then
        update public.loyalty_push_subscriptions set revoked_at = now(), last_error = 'expirada'
         where member_id = p_member and endpoint = any (p_gone);
    end if;
    if p_error is not null then
        update public.loyalty_push_subscriptions set last_error = left(p_error, 300)
         where member_id = p_member and revoked_at is null;
    end if;
end $$;

-- Busca a quién toca recordarle que vuelva y a quién recuperar. Lo llama el cron.
create or replace function public.loyalty_srv_campaign_scan()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    c public.loyalty_campaigns;
    n integer := 0;
    v_member uuid;
begin
    perform public.loyalty_srv_check();
    for c in select * from public.loyalty_campaigns where status = 'active' and template in ('return_reminder', 'winback') loop
        for v_member in
            select x.id from public.loyalty_campaign_members(c.company_id, c.template, c.config) as x(id)
             where public.loyalty_consents_now(x.id, 'push')
               and exists (select 1 from public.loyalty_push_subscriptions s where s.member_id = x.id and s.revoked_at is null)
               and not exists (select 1 from public.loyalty_campaign_events e
                                where e.member_id = x.id and e.campaign_id = c.id and e.stage = 'eligible'
                                  and e.created_at > now() - make_interval(days => case when c.template = 'winback'
                                        then 90 else (c.config ->> 'cycle_days')::int end))
             limit 500
        loop
            insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
            values (c.company_id, c.id, v_member, 'eligible');
            insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key, next_attempt_at)
            values (c.company_id, 'push.send',
                    jsonb_build_object('member_id', v_member, 'campaign_id', c.id, 'template', c.template, 'eligible_at', now()),
                    'push:' || c.id || ':' || v_member || ':' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'),
                    public.loyalty_next_send_slot())
            on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
            n := n + 1;
        end loop;
    end loop;
    return jsonb_build_object('eligible', n);
end $$;

-- Mantenimiento: premios vencidos, límites viejos.
create or replace function public.loyalty_srv_housekeeping()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    r record;
    n integer := 0;
begin
    perform public.loyalty_srv_check();
    for r in select x.id, x.member_id from public.loyalty_rewards x
              where x.status = 'available' and x.expires_at <= now()
              order by x.member_id limit 2000 for update skip locked loop
        update public.loyalty_rewards set status = 'expired' where id = r.id;
        update public.loyalty_members set rewards_available = greatest(rewards_available - 1, 0) where id = r.member_id;
        perform public.loyalty_enqueue_wallet(r.member_id);
        n := n + 1;
    end loop;
    delete from public.loyalty_rate_limits where window_start < now() - interval '1 day';
    return jsonb_build_object('rewards_expired', n);
end $$;

-- El servidor comprobó el logo (descarga + medidas) y deja el resultado.
create or replace function public.loyalty_srv_logo_checked(p_company text, p_url text, p_result jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.loyalty_settings set logo_checked = p_result || jsonb_build_object('url', p_url, 'at', now())
     where company_id = p_company and logo_url = p_url;
end $$;

-- Para los botones de "Sincronizar ahora" del panel: el servidor comprueba con
-- la sesión del usuario que puede, y solo entonces drena SU compañía.
create or replace function public.loyalty_srv_pending(p_company text)
returns integer language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    return (select count(*) from public.loyalty_outbox
             where company_id = p_company and status in ('pending', 'retry') and next_attempt_at <= now());
end $$;
