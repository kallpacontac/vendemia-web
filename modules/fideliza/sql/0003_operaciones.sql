-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0003 · Las escrituras del panel
--
-- Todas son SECURITY DEFINER (las tablas no tienen grants de escritura) y todas
-- empiezan con loyalty_require(): el permiso se comprueba AQUÍ, con el auth.uid()
-- de quien llama, no en el panel.
--
-- Errores: `loyalty:<código>` en el mensaje. El servidor de Next los traduce a
-- castellano (modules/fideliza/dominio/errores.ts). 42501 = sin permiso.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Utilidades ────────────────────────────────────────────────────────────────

-- Como loyalty_require, pero la sucursal SIEMPRE cuenta: un cajero acotado a
-- una sucursal no puede operar «sin sucursal» para saltarse el límite.
create or replace function public.loyalty_require_at(p_company text, p_location uuid, p_perm text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, p_perm);
    if not public.loyalty_can_at(p_company, p_location, p_perm) then
        raise exception 'loyalty:forbidden_location' using errcode = '42501', detail = p_perm;
    end if;
end $$;

-- Bytes aleatorios fuertes sin pgcrypto: gen_random_uuid() usa pg_strong_random.
-- De cada uuid se toman los 12 bytes que no llevan bits de versión/variante.
create or replace function public.loyalty_random_bytes(p_n integer)
returns bytea language plpgsql volatile as $$
declare
    v bytea := ''::bytea;
    u bytea;
begin
    while length(v) < p_n loop
        u := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
        v := v || substring(u from 1 for 6) || substring(u from 11 for 6);
    end loop;
    return substring(v from 1 for p_n);
end $$;

create or replace function public.loyalty_b64url(p bytea)
returns text language sql immutable as $$
    select translate(rtrim(replace(encode(p, 'base64'), E'\n', ''), '='), '+/', '-_');
$$;

create or replace function public.loyalty_hash(p text)
returns bytea language sql immutable as $$ select sha256(convert_to(p, 'UTF8')) $$;

-- Sin 0/O/1/I/L: se dicta en voz alta en la caja.
create or replace function public.loyalty_code_chars(p_n integer)
returns text language plpgsql volatile as $$
declare
    alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    b bytea := public.loyalty_random_bytes(p_n);
    s text := '';
begin
    for i in 0 .. p_n - 1 loop
        s := s || substr(alfabeto, (get_byte(b, i) % 31) + 1, 1);
    end loop;
    return s;
end $$;

create or replace function public.loyalty_err(p_code text, p_detail text default null)
returns void language plpgsql as $$
begin
    raise exception 'loyalty:%', p_code using errcode = 'P0001', detail = coalesce(p_detail, '');
end $$;

-- Teléfono peruano: 9 dígitos que empiezan por 9 → +51. Lo demás tal cual, con +.
create or replace function public.loyalty_norm_phone(p text)
returns text language plpgsql immutable as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
    if d = '' then return null; end if;
    if char_length(d) = 9 and left(d, 1) = '9' then return '+51' || d; end if;
    if char_length(d) between 8 and 15 then return '+' || d; end if;
    perform public.loyalty_err('invalid_phone');
end $$;

create or replace function public.loyalty_norm_email(p text)
returns text language plpgsql immutable as $$
declare e text := lower(btrim(coalesce(p, '')));
begin
    if e = '' then return null; end if;
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 120 then
        perform public.loyalty_err('invalid_email');
    end if;
    return e;
end $$;

-- Un destino publicable: https, sin espacios, y nunca el propio resolutor
-- (/t/…), que crearía un bucle placa → placa.
create or replace function public.loyalty_url_ok(p text)
returns boolean language sql immutable as $$
    select p ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[^\s]*)?$'
       and char_length(p) <= 600
       and p !~* '^https://([a-z0-9-]+\.)*vendemias\.com(:[0-9]+)?/t/';
$$;

-- La versión de regla vigente AHORA para un programa.
-- ⚠️ clock_timestamp() y no now(): publicar fija valid_from con la hora REAL,
-- y now() es la hora de inicio de la transacción. En una misma transacción
-- (publicar y registrar seguidos, como en tests/pruebas.sql) la versión recién
-- publicada parecía «del futuro» y saltaba program_expired.
create or replace function public.loyalty_current_version(p_program uuid)
returns public.loyalty_program_versions language sql volatile as $$
    select v.* from public.loyalty_program_versions v
     where v.program_id = p_program and v.valid_from <= clock_timestamp()
       and (v.valid_to is null or v.valid_to > clock_timestamp())
     order by v.version desc limit 1;
$$;

-- Unidades (sellos, puntos o visitas) que da una operación con UNA versión.
-- La fórmula es esta y solo esta; el panel la enseña pero no la recalcula.
create or replace function public.loyalty_units_for(v public.loyalty_program_versions, p_kind text, p_amount bigint)
returns integer language plpgsql immutable as $$
declare x numeric;
begin
    if v.rule_type = 'visits' then
        if p_kind <> 'visit' then perform public.loyalty_err('kind_mismatch', 'visits'); end if;
        return 1;
    end if;
    if p_kind <> 'purchase' then perform public.loyalty_err('kind_mismatch', v.rule_type); end if;
    if p_amount < v.min_purchase_cents then return 0; end if;
    if v.rule_type = 'stamps' then return v.stamps_per_purchase; end if;
    -- points
    x := (p_amount::numeric * v.points_per_unit) / v.unit_cents;
    return case v.rounding when 'floor' then floor(x) when 'ceil' then ceil(x) else round(x) end;
end $$;

-- Mueve el saldo y deja la línea del libro. Quien llama YA tiene el miembro
-- bloqueado (FOR UPDATE): por eso dos operaciones a la vez no pisan el saldo.
create or replace function public.loyalty_move(
    p_member public.loyalty_members, p_units integer, p_kind text,
    p_tx uuid default null, p_reward uuid default null)
returns integer language plpgsql as $$
declare v_bal integer;
begin
    update public.loyalty_members
       set balance = balance + p_units,
           lifetime_units = lifetime_units + case when p_kind = 'earn' then p_units
                                                  when p_kind = 'reverse' then p_units else 0 end,
           updated_at = now()
     where id = p_member.id
     returning balance into v_bal;
    insert into public.loyalty_ledger (company_id, member_id, program_id, transaction_id, reward_id,
                                       kind, units, balance_after, created_by)
    values (p_member.company_id, p_member.id, p_member.program_id, p_tx, p_reward,
            p_kind, p_units, v_bal, (select auth.uid())::text);
    return v_bal;
end $$;

-- Encola la actualización del pase de Wallet, SI el miembro tiene uno. Va en la
-- misma transacción que el cambio: o existen los dos o ninguno.
create or replace function public.loyalty_enqueue_wallet(p_member uuid)
returns void language plpgsql as $$
declare v_company text;
begin
    update public.loyalty_wallet_passes
       set desired_rev = desired_rev + 1, updated_at = now()
     where member_id = p_member
     returning company_id into v_company;
    if v_company is null then return; end if;
    insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
    values (v_company, 'wallet.object.sync', jsonb_build_object('member_id', p_member),
            'wallet.object:' || p_member)
    on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
end $$;

-- ¿Consiente HOY este canal? Cuenta la última fila, no la primera.
create or replace function public.loyalty_consents_now(p_member uuid, p_channel text)
returns boolean language sql stable as $$
    select coalesce((select c.granted from public.loyalty_consents c
                      where c.member_id = p_member and c.channel = p_channel
                      order by c.id desc limit 1), false);
$$;

-- Próxima hora permitida para escribirle a alguien: 09:00–20:00 de Lima.
create or replace function public.loyalty_next_send_slot(p_from timestamptz default now())
returns timestamptz language plpgsql stable as $$
declare
    l timestamp := p_from at time zone 'America/Lima';
begin
    if l::time >= '09:00' and l::time < '20:00' then return p_from; end if;
    if l::time < '09:00' then return (date_trunc('day', l) + interval '9 hours') at time zone 'America/Lima'; end if;
    return (date_trunc('day', l) + interval '1 day 9 hours') at time zone 'America/Lima';
end $$;

-- Encola un push de plantilla (premio disponible, bienvenida) si hay campaña
-- activa, consentimiento y suscripción. Las comprobaciones se REPITEN al enviar.
create or replace function public.loyalty_enqueue_template_push(p_member public.loyalty_members, p_template text)
returns void language plpgsql as $$
declare v_campaign uuid;
begin
    select c.id into v_campaign from public.loyalty_campaigns c
     where c.company_id = p_member.company_id and c.template = p_template and c.status = 'active';
    if v_campaign is null or not public.loyalty_consents_now(p_member.id, 'push') then return; end if;
    if not exists (select 1 from public.loyalty_push_subscriptions s
                    where s.member_id = p_member.id and s.revoked_at is null) then return; end if;
    insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
    values (p_member.company_id, v_campaign, p_member.id, 'eligible');
    insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key, next_attempt_at)
    values (p_member.company_id, 'push.send',
            jsonb_build_object('member_id', p_member.id, 'campaign_id', v_campaign,
                               'template', p_template, 'eligible_at', now()),
            'push:' || v_campaign || ':' || p_member.id || ':' || to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'),
            public.loyalty_next_send_slot())
    on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
end $$;

-- Crea la fila del miembro con códigos aleatorios y reintenta si chocan.
-- Devuelve el token de la tarjeta EN CLARO: es la única vez que existe.
create or replace function public.loyalty_insert_member(
    p_company text, p_program uuid, p_alias text, p_via text, p_device uuid, p_creation_key text)
returns jsonb language plpgsql as $$
declare
    v_token text;
    v_id uuid;
    v_code text;
begin
    for intento in 1 .. 6 loop
        v_token := public.loyalty_b64url(public.loyalty_random_bytes(24));
        v_code := 'VDM-' || public.loyalty_code_chars(6);
        begin
            insert into public.loyalty_members (company_id, program_id, public_code, qr_token, card_token_hash,
                                                alias, joined_via, joined_device_id, creation_key, created_by)
            values (p_company, p_program, v_code,
                    'vq' || public.loyalty_b64url(public.loyalty_random_bytes(18)),
                    public.loyalty_hash(v_token), nullif(btrim(p_alias), ''), p_via, p_device,
                    p_creation_key, (select auth.uid())::text)
            returning id into v_id;
            return jsonb_build_object('member_id', v_id, 'public_code', v_code, 'card_token', v_token);
        exception when unique_violation then
            -- La clave de creación repetida NO es una colisión: es un reintento.
            if p_creation_key is not null and exists (
                select 1 from public.loyalty_members m
                 where m.company_id = p_company and m.creation_key = p_creation_key) then
                perform public.loyalty_err('member_create_replayed');
            end if;
        end;
    end loop;
    perform public.loyalty_err('code_generation_failed');
end $$;

create or replace function public.loyalty_live_program(p_company text)
returns public.loyalty_programs language sql stable as $$
    select p.* from public.loyalty_programs p
     where p.company_id = p_company and p.status in ('active', 'paused') limit 1;
$$;

create or replace function public.loyalty_set_contact(
    p_company text, p_member uuid, p_kind text, p_value text, p_verified boolean, p_method text)
returns void language plpgsql as $$
begin
    if p_value is null then
        delete from public.loyalty_contacts where member_id = p_member and kind = p_kind;
        return;
    end if;
    insert into public.loyalty_contacts (company_id, member_id, kind, value, verified_at, verified_method, verified_by)
    values (p_company, p_member, p_kind, p_value,
            case when p_verified then now() end, case when p_verified then p_method end,
            case when p_verified then (select auth.uid())::text end)
    on conflict (member_id, kind) do update set
        value = excluded.value,
        -- Cambiar el dato le quita la verificación; repetir el mismo, no.
        verified_at = case when loyalty_contacts.value = excluded.value and not p_verified
                           then loyalty_contacts.verified_at else excluded.verified_at end,
        verified_method = case when loyalty_contacts.value = excluded.value and not p_verified
                               then loyalty_contacts.verified_method else excluded.verified_method end,
        verified_by = case when loyalty_contacts.value = excluded.value and not p_verified
                           then loyalty_contacts.verified_by else excluded.verified_by end,
        updated_at = now();
end $$;

-- Lo que la caja necesita ver de un miembro, y nada más (sin contactos).
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

-- ═══ AJUSTES, SUCURSALES Y EQUIPO ═══════════════════════════════════════════

create or replace function public.loyalty_settings_save(p_company text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_old public.loyalty_settings;
    v_new public.loyalty_settings;
    v_role text := public.loyalty_require(p_company, 'program.edit');
begin
    select * into v_old from public.loyalty_settings where company_id = p_company for update;
    if (p_data ? 'wallet_use_demo_class') and v_role <> 'platform_admin'
       and (p_data ->> 'wallet_use_demo_class')::boolean is distinct from coalesce(v_old.wallet_use_demo_class, false) then
        perform public.loyalty_err('forbidden_demo_class');
    end if;
    if (p_data ->> 'logo_url') is not null and not public.loyalty_url_ok(p_data ->> 'logo_url') then
        perform public.loyalty_err('invalid_url', 'logo_url');
    end if;
    if (p_data ->> 'support_url') is not null and not public.loyalty_url_ok(p_data ->> 'support_url') then
        perform public.loyalty_err('invalid_url', 'support_url');
    end if;
    begin
        insert into public.loyalty_settings as s (company_id, slug, display_name, tagline, logo_url, bg_color,
                                                  support_url, require_external_ref, wallet_use_demo_class)
        values (p_company,
                lower(coalesce(p_data ->> 'slug', v_old.slug)),
                coalesce(p_data ->> 'display_name', v_old.display_name),
                coalesce(p_data ->> 'tagline', v_old.tagline, ''),
                case when p_data ? 'logo_url' then nullif(p_data ->> 'logo_url', '') else v_old.logo_url end,
                coalesce(p_data ->> 'bg_color', v_old.bg_color, '#FF4900'),
                case when p_data ? 'support_url' then nullif(p_data ->> 'support_url', '') else v_old.support_url end,
                coalesce((p_data ->> 'require_external_ref')::boolean, v_old.require_external_ref, false),
                coalesce((p_data ->> 'wallet_use_demo_class')::boolean, v_old.wallet_use_demo_class, false))
        on conflict (company_id) do update set
            slug = excluded.slug, display_name = excluded.display_name, tagline = excluded.tagline,
            logo_url = excluded.logo_url, bg_color = excluded.bg_color, support_url = excluded.support_url,
            require_external_ref = excluded.require_external_ref,
            wallet_use_demo_class = excluded.wallet_use_demo_class,
            -- El chequeo de 660×660 era del logo anterior.
            logo_checked = case when s.logo_url is distinct from excluded.logo_url then null else s.logo_checked end,
            updated_at = now()
        returning * into v_new;
    exception
        when unique_violation then perform public.loyalty_err('slug_taken');
        when check_violation or not_null_violation then perform public.loyalty_err('invalid_settings', sqlerrm);
    end;

    -- La marca va en la clase de Wallet: si cambia, hay que volver a contársela a Google.
    if v_old.company_id is not null and (v_old.logo_url, v_old.bg_color, v_old.display_name, v_old.wallet_use_demo_class)
        is distinct from (v_new.logo_url, v_new.bg_color, v_new.display_name, v_new.wallet_use_demo_class) then
        insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
        select p.company_id, 'wallet.class.sync', jsonb_build_object('program_id', p.id), 'wallet.class:' || p.id
          from public.loyalty_programs p
         where p.company_id = p_company and p.status in ('active', 'paused')
        on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
    end if;

    perform public.loyalty_audit(p_company, 'settings.save', 'loyalty_settings', p_company,
                                 p_data - 'logo_checked');
    return to_jsonb(v_new);
end $$;

create or replace function public.loyalty_location_save(p_company text, p_id uuid, p_name text, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    begin
        if p_id is null then
            insert into public.loyalty_locations (company_id, name, is_active)
            values (p_company, btrim(p_name), coalesce(p_active, true)) returning id into v_id;
        else
            update public.loyalty_locations set name = coalesce(btrim(p_name), name), is_active = coalesce(p_active, is_active)
             where company_id = p_company and id = p_id returning id into v_id;
            if v_id is null then perform public.loyalty_err('not_found'); end if;
        end if;
    exception
        when unique_violation then perform public.loyalty_err('location_name_taken');
        when check_violation then perform public.loyalty_err('invalid_location');
    end;
    perform public.loyalty_audit(p_company, 'location.save', 'loyalty_locations', v_id::text,
                                 jsonb_build_object('name', p_name, 'active', p_active));
    return v_id;
end $$;

-- El equipo: memberships de la compañía + su rol en Fideliza. Solo el
-- propietario lo ve (es el único que puede cambiarlo).
create or replace function public.loyalty_team_list(p_company text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'team.manage');
    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'auth_user_id', m.auth_user_id,
                   'email', u.email,
                   'membership_role', m.role,
                   'role', case when m.role = 'owner' then 'owner' else coalesce(s.role, 'cashier') end,
                   'location_ids', s.location_ids) order by m.role desc, u.email)
          from public.memberships m
          left join auth.users u on u.id::text = m.auth_user_id
          left join public.loyalty_staff s on s.company_id = m.company_id and s.auth_user_id = m.auth_user_id
         where m.company_id = p_company), '[]'::jsonb);
end $$;

create or replace function public.loyalty_staff_set(p_company text, p_user text, p_role text, p_locations uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'team.manage');
    if not exists (select 1 from public.memberships m
                    where m.company_id = p_company and m.auth_user_id = p_user and m.role <> 'owner') then
        perform public.loyalty_err('not_a_member');
    end if;
    if p_locations is not null and exists (
        select 1 from unnest(p_locations) l
         where not exists (select 1 from public.loyalty_locations x where x.company_id = p_company and x.id = l)) then
        perform public.loyalty_err('invalid_location');
    end if;
    if p_role is null or p_role = 'cashier' and p_locations is null then
        delete from public.loyalty_staff where company_id = p_company and auth_user_id = p_user;
    else
        insert into public.loyalty_staff (company_id, auth_user_id, role, location_ids, updated_by)
        values (p_company, p_user, p_role, p_locations, (select auth.uid())::text)
        on conflict (company_id, auth_user_id) do update
           set role = excluded.role, location_ids = excluded.location_ids,
               updated_by = excluded.updated_by, updated_at = now();
    end if;
    perform public.loyalty_audit(p_company, 'staff.set', 'loyalty_staff', p_user,
                                 jsonb_build_object('role', p_role, 'locations', p_locations));
end $$;

-- ═══ PROGRAMA ═══════════════════════════════════════════════════════════════

create or replace function public.loyalty_program_save(
    p_company text, p_program uuid, p_name text, p_description text, p_objective text, p_draft jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    begin
        if p_program is null then
            insert into public.loyalty_programs (company_id, name, short_description, objective, draft)
            values (p_company, btrim(p_name), coalesce(btrim(p_description), ''), p_objective, coalesce(p_draft, '{}'))
            returning id into v_id;
        else
            update public.loyalty_programs
               set name = coalesce(btrim(p_name), name),
                   short_description = coalesce(btrim(p_description), short_description),
                   objective = coalesce(p_objective, objective),
                   draft = coalesce(p_draft, draft),
                   updated_at = now()
             where company_id = p_company and id = p_program
             returning id into v_id;
            if v_id is null then perform public.loyalty_err('not_found'); end if;
        end if;
    exception when check_violation then perform public.loyalty_err('invalid_program', sqlerrm);
    end;
    perform public.loyalty_audit(p_company, 'program.save', 'loyalty_programs', v_id::text,
                                 jsonb_build_object('name', p_name, 'draft', p_draft));
    return v_id;
end $$;

-- Publicar = crear una versión NUEVA con vigencia desde ahora y cerrar la
-- anterior. Las operaciones viejas apuntan a su versión y no se recalculan.
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

create or replace function public.loyalty_program_set_status(p_company text, p_program uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.loyalty_programs;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    if p_status not in ('active', 'paused') then perform public.loyalty_err('invalid_status'); end if;
    select * into p from public.loyalty_programs where company_id = p_company and id = p_program for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    if p.current_version_id is null then perform public.loyalty_err('program_not_published'); end if;
    begin
        update public.loyalty_programs set status = p_status, updated_at = now() where id = p_program;
    exception when unique_violation then perform public.loyalty_err('another_program_live');
    end;
    perform public.loyalty_audit(p_company, 'program.status', 'loyalty_programs', p_program::text,
                                 jsonb_build_object('from', p.status, 'to', p_status));
end $$;

-- ═══ MIEMBROS ═══════════════════════════════════════════════════════════════

create or replace function public.loyalty_member_create(
    p_company text, p_alias text, p_phone text, p_email text, p_verified_in_person boolean,
    p_creation_key text, p_via text default 'panel')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.loyalty_programs := public.loyalty_live_program(p_company);
    r jsonb;
    v_phone text := public.loyalty_norm_phone(p_phone);
    v_email text := public.loyalty_norm_email(p_email);
begin
    perform public.loyalty_require(p_company, 'members.create');
    if p.id is null then perform public.loyalty_err('program_not_active'); end if;
    if p_via not in ('panel', 'caja') then perform public.loyalty_err('invalid_source'); end if;
    begin
        r := public.loyalty_insert_member(p_company, p.id, p_alias, p_via, null, p_creation_key);
    exception when others then
        if sqlerrm = 'loyalty:member_create_replayed' then
            -- Mismo intento repetido: se devuelve el miembro, pero el token de la
            -- tarjeta ya no existe en claro. Se puede rotar desde la ficha.
            return (select jsonb_build_object('member_id', m.id, 'public_code', m.public_code,
                                              'card_token', null, 'replayed', true)
                      from public.loyalty_members m
                     where m.company_id = p_company and m.creation_key = p_creation_key);
        end if;
        raise;
    end;
    perform public.loyalty_set_contact(p_company, (r ->> 'member_id')::uuid, 'phone', v_phone,
                                       coalesce(p_verified_in_person, false), 'in_person');
    perform public.loyalty_set_contact(p_company, (r ->> 'member_id')::uuid, 'email', v_email,
                                       coalesce(p_verified_in_person, false), 'in_person');
    perform public.loyalty_audit(p_company, 'member.create', 'loyalty_members', r ->> 'member_id',
                                 jsonb_build_object('via', p_via, 'code', r ->> 'public_code'));
    return r || jsonb_build_object('replayed', false);
end $$;

-- Lo que la caja busca: código (con o sin VDM-), token del QR o teléfono
-- EXACTO. Devuelve lo mínimo para cobrar; nunca el contacto.
create or replace function public.loyalty_lookup(p_company text, p_query text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    q text := upper(regexp_replace(btrim(coalesce(p_query, '')), '\s', '', 'g'));
    v_phone text;
    v_ids uuid[];
begin
    perform public.loyalty_require(p_company, 'members.read');
    if q = '' then return '[]'::jsonb; end if;
    if btrim(p_query) ~ '^vq[A-Za-z0-9_-]{20,}$' then
        select array_agg(id) into v_ids from public.loyalty_members
         where company_id = p_company and qr_token = btrim(p_query);
    elsif q ~ '^(VDM-?)?[A-HJKMNP-Z2-9]{6}$' then
        select array_agg(id) into v_ids from public.loyalty_members
         where company_id = p_company and public_code = 'VDM-' || right(q, 6);
    elsif q ~ '^\+?[0-9]{8,15}$' then
        begin
            v_phone := public.loyalty_norm_phone(q);
        exception when others then v_phone := null;
        end;
        select array_agg(c.member_id) into v_ids from public.loyalty_contacts c
         where c.company_id = p_company and c.kind = 'phone' and c.value = v_phone;
    end if;
    return coalesce((select jsonb_agg(public.loyalty_member_card(m.id) order by m.last_op_at desc nulls last)
                       from public.loyalty_members m
                      where m.id = any (coalesce(v_ids, '{}')) and m.status <> 'deleted'
                      limit 8), '[]'::jsonb);
end $$;

-- La lista del panel, paginada en la base: crece con el uso (regla del
-- proyecto, 11-sep-2026). Los contactos solo salen a quien puede verlos.
create or replace function public.loyalty_member_search(
    p_company text, p_q text, p_status text, p_filter text, p_limit integer, p_offset integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_contacts boolean;
    q text := lower(btrim(coalesce(p_q, '')));
    v_phone text;
    v_total integer;
    v_rows jsonb;
begin
    perform public.loyalty_require(p_company, 'members.read');
    v_contacts := public.loyalty_can(p_company, 'contacts.read');
    if q ~ '^\+?[0-9 ]{8,18}$' then
        begin v_phone := public.loyalty_norm_phone(q); exception when others then v_phone := null; end;
    end if;

    with base as (
        select m.* from public.loyalty_members m
         where m.company_id = p_company
           and (p_status is null and m.status <> 'deleted' or m.status = p_status)
           and (q = ''
                or m.public_code = 'VDM-' || upper(right(regexp_replace(q, '[^a-z0-9]', '', 'g'), 6))
                   and upper(regexp_replace(q, '[^a-z0-9]', '', 'g')) ~ '^(VDM)?[A-Z0-9]{6}$'
                or lower(m.alias) like q || '%'
                or (v_contacts and exists (
                        select 1 from public.loyalty_contacts c
                         where c.member_id = m.id
                           and (c.value = v_phone or (c.kind = 'email' and c.value like q || '%')))))
           and case p_filter
                   when 'reward' then m.rewards_available > 0
                   when 'wallet' then exists (select 1 from public.loyalty_wallet_passes w where w.member_id = m.id)
                   when 'wallet_error' then exists (select 1 from public.loyalty_wallet_passes w
                                                     where w.member_id = m.id and w.state = 'error')
                   when 'inactive30' then m.last_op_at is null or m.last_op_at < now() - interval '30 days'
                   when 'active30' then m.last_op_at >= now() - interval '30 days'
                   when 'never' then m.ops_count = 0
                   else true end
    )
    select (select count(*) from base),
           coalesce((select jsonb_agg(x order by x.ord) from (
               select row_number() over (order by b.last_op_at desc nulls last, b.created_at desc) as ord,
                      b.id, b.public_code, b.alias, b.status, b.balance, b.rewards_available,
                      b.ops_count, b.last_op_at, b.created_at,
                      (select w.state from public.loyalty_wallet_passes w where w.member_id = b.id) as wallet_state,
                      exists (select 1 from public.loyalty_contacts c
                               where c.member_id = b.id and c.verified_at is not null) as verified_contact,
                      case when v_contacts then (select c.value from public.loyalty_contacts c
                                                  where c.member_id = b.id and c.kind = 'phone') end as phone
                 from base b
                order by b.last_op_at desc nulls last, b.created_at desc
                limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x),
               '[]'::jsonb)
      into v_total, v_rows;
    return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.loyalty_member_detail(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v_contacts boolean;
begin
    perform public.loyalty_require(p_company, 'members.read');
    select * into m from public.loyalty_members where company_id = p_company and id = p_member;
    if not found or m.status = 'deleted' and not public.loyalty_can(p_company, 'members.manage') then
        perform public.loyalty_err('not_found');
    end if;
    v_contacts := public.loyalty_can(p_company, 'contacts.read');
    return public.loyalty_member_card(m.id) || jsonb_build_object(
        'created_at', m.created_at, 'joined_via', m.joined_via, 'lifetime_units', m.lifetime_units,
        'first_op_at', m.first_op_at, 'suspended_at', m.suspended_at, 'deleted_at', m.deleted_at,
        'can_see_contacts', v_contacts,
        'contacts', case when v_contacts then coalesce((
            select jsonb_agg(jsonb_build_object('kind', c.kind, 'value', c.value, 'verified_at', c.verified_at,
                                                'verified_method', c.verified_method))
              from public.loyalty_contacts c where c.member_id = m.id), '[]'::jsonb)
            else (select jsonb_agg(jsonb_build_object('kind', c.kind, 'verified_at', c.verified_at))
                    from public.loyalty_contacts c where c.member_id = m.id) end,
        'consents', coalesce((
            select jsonb_object_agg(ch, jsonb_build_object('granted', public.loyalty_consents_now(m.id, ch),
                       'at', (select max(c.created_at) from public.loyalty_consents c where c.member_id = m.id and c.channel = ch)))
              from unnest(array['push', 'whatsapp', 'email', 'sms']) ch
             where exists (select 1 from public.loyalty_consents c where c.member_id = m.id and c.channel = ch)),
            '{}'::jsonb),
        'push_devices', (select count(*) from public.loyalty_push_subscriptions s
                          where s.member_id = m.id and s.revoked_at is null),
        'transactions', coalesce((
            select jsonb_agg(to_jsonb(t) - 'request_hash' - 'idempotency_key' order by t.created_at desc)
              from (select t.*, l.name as location_name
                      from public.loyalty_transactions t
                      left join public.loyalty_locations l on l.id = t.location_id
                     where t.member_id = m.id order by t.created_at desc limit 60) t), '[]'::jsonb),
        'ledger', coalesce((
            select jsonb_agg(to_jsonb(l) order by l.id desc)
              from (select * from public.loyalty_ledger where member_id = m.id order by id desc limit 60) l), '[]'::jsonb),
        'all_rewards', coalesce((
            select jsonb_agg(to_jsonb(r) order by r.issued_at desc)
              from (select * from public.loyalty_rewards where member_id = m.id order by issued_at desc limit 40) r), '[]'::jsonb),
        'wallet', (select to_jsonb(w) - 'object_id' from public.loyalty_wallet_passes w where w.member_id = m.id));
end $$;

create or replace function public.loyalty_member_update(
    p_company text, p_member uuid, p_alias text, p_phone text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'members.manage');
    update public.loyalty_members set alias = nullif(btrim(p_alias), ''), updated_at = now()
     where company_id = p_company and id = p_member and status <> 'deleted';
    if not found then perform public.loyalty_err('not_found'); end if;
    perform public.loyalty_set_contact(p_company, p_member, 'phone', public.loyalty_norm_phone(p_phone), false, null);
    perform public.loyalty_set_contact(p_company, p_member, 'email', public.loyalty_norm_email(p_email), false, null);
    perform public.loyalty_enqueue_wallet(p_member);
    perform public.loyalty_audit(p_company, 'member.update', 'loyalty_members', p_member::text, null);
end $$;

-- Verificación EN PERSONA: el empleado tiene delante a la persona y su teléfono.
create or replace function public.loyalty_member_verify(p_company text, p_member uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'members.create');
    update public.loyalty_contacts
       set verified_at = now(), verified_method = 'in_person', verified_by = (select auth.uid())::text, updated_at = now()
     where company_id = p_company and member_id = p_member and kind = p_kind;
    if not found then perform public.loyalty_err('contact_missing'); end if;
    perform public.loyalty_audit(p_company, 'member.verify', 'loyalty_members', p_member::text,
                                 jsonb_build_object('kind', p_kind));
end $$;

create or replace function public.loyalty_member_set_status(p_company text, p_member uuid, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'members.manage');
    if p_status not in ('active', 'suspended') then perform public.loyalty_err('invalid_status'); end if;
    update public.loyalty_members
       set status = p_status, updated_at = now(),
           suspended_at = case when p_status = 'suspended' then now() end
     where company_id = p_company and id = p_member and status <> 'deleted';
    if not found then perform public.loyalty_err('not_found'); end if;
    perform public.loyalty_enqueue_wallet(p_member);
    perform public.loyalty_audit(p_company, 'member.status', 'loyalty_members', p_member::text,
                                 jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

-- Recuperación en el local: se emite un enlace nuevo y el viejo deja de valer.
create or replace function public.loyalty_member_rotate_card(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_token text := public.loyalty_b64url(public.loyalty_random_bytes(24));
begin
    perform public.loyalty_require(p_company, 'members.create');
    update public.loyalty_members set card_token_hash = public.loyalty_hash(v_token), updated_at = now()
     where company_id = p_company and id = p_member and status = 'active';
    if not found then perform public.loyalty_err('member_inactive'); end if;
    perform public.loyalty_audit(p_company, 'member.rotate_card', 'loyalty_members', p_member::text, null);
    return jsonb_build_object('card_token', v_token);
end $$;

create or replace function public.loyalty_consent_set(
    p_company text, p_member uuid, p_channel text, p_granted boolean, p_source text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'members.manage');
    if p_source not in ('panel', 'caja') then perform public.loyalty_err('invalid_source'); end if;
    if not exists (select 1 from public.loyalty_members where company_id = p_company and id = p_member and status <> 'deleted') then
        perform public.loyalty_err('not_found');
    end if;
    insert into public.loyalty_consents (company_id, member_id, channel, granted, source, actor)
    values (p_company, p_member, p_channel, p_granted, p_source, (select auth.uid())::text);
    if not p_granted then perform public.loyalty_cancel_member_pushes(p_member, 'unsubscribed'); end if;
end $$;

-- La baja o una compra nueva vacían la cola de ese miembro ANTES de enviar.
create or replace function public.loyalty_cancel_member_pushes(p_member uuid, p_motivo text, p_only_reengage boolean default false)
returns void language plpgsql as $$
begin
    update public.loyalty_outbox
       set status = 'done', done_at = now(), updated_at = now(), result = jsonb_build_object('skipped', p_motivo)
     where kind = 'push.send' and status in ('pending', 'retry')
       and payload ->> 'member_id' = p_member::text
       and (not p_only_reengage or payload ->> 'template' in ('return_reminder', 'winback'));
end $$;

create or replace function public.loyalty_member_export(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
    perform public.loyalty_require(p_company, 'members.export');
    select jsonb_build_object(
        'exported_at', now(),
        'member', to_jsonb(m) - 'card_token_hash' - 'qr_token' - 'creation_key',
        'contacts', (select jsonb_agg(to_jsonb(c)) from public.loyalty_contacts c where c.member_id = m.id),
        'consents', (select jsonb_agg(to_jsonb(c) order by c.id) from public.loyalty_consents c where c.member_id = m.id),
        'transactions', (select jsonb_agg(to_jsonb(t) - 'request_hash' order by t.created_at) from public.loyalty_transactions t where t.member_id = m.id),
        'ledger', (select jsonb_agg(to_jsonb(l) order by l.id) from public.loyalty_ledger l where l.member_id = m.id),
        'rewards', (select jsonb_agg(to_jsonb(x) order by x.issued_at) from public.loyalty_rewards x where x.member_id = m.id),
        'redemptions', (select jsonb_agg(to_jsonb(x) order by x.created_at) from public.loyalty_redemptions x where x.member_id = m.id))
      into r
      from public.loyalty_members m where m.company_id = p_company and m.id = p_member;
    if r is null then perform public.loyalty_err('not_found'); end if;
    perform public.loyalty_audit(p_company, 'member.export', 'loyalty_members', p_member::text, null);
    return r;
end $$;

-- Borrado: se van los datos personales y los accesos. El historial de puntos
-- se queda (seudónimo, sin nombre ni contacto): es contabilidad del negocio.
create or replace function public.loyalty_erase_member(p_member uuid, p_actor_kind text, p_reason text)
returns void language plpgsql as $$
declare m public.loyalty_members;
begin
    select * into m from public.loyalty_members where id = p_member for update;
    if not found or m.status = 'deleted' then return; end if;
    delete from public.loyalty_contacts where member_id = p_member;
    delete from public.loyalty_push_subscriptions where member_id = p_member;
    insert into public.loyalty_consents (company_id, member_id, channel, granted, source)
    select m.company_id, m.id, ch, false, 'erase' from unnest(array['push', 'whatsapp', 'email', 'sms']) ch;
    perform public.loyalty_cancel_member_pushes(p_member, 'erased');
    update public.loyalty_members
       set alias = null, status = 'deleted', deleted_at = now(), updated_at = now(),
           card_token_hash = public.loyalty_hash(public.loyalty_b64url(public.loyalty_random_bytes(24))),
           qr_token = 'vq' || public.loyalty_b64url(public.loyalty_random_bytes(18))
     where id = p_member;
    perform public.loyalty_enqueue_wallet(p_member);
    perform public.loyalty_audit(m.company_id, 'member.erase', 'loyalty_members', p_member::text,
                                 jsonb_build_object('reason', p_reason), p_actor_kind);
end $$;

create or replace function public.loyalty_member_erase(p_company text, p_member uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'members.delete');
    if not exists (select 1 from public.loyalty_members where company_id = p_company and id = p_member) then
        perform public.loyalty_err('not_found');
    end if;
    perform public.loyalty_erase_member(p_member, null, p_reason);
end $$;

-- ═══ OPERACIONES ════════════════════════════════════════════════════════════

-- El resultado que ve la caja. Mismo formato para una operación nueva y para
-- un reintento: la caja no tiene que distinguir.
create or replace function public.loyalty_tx_result(p_tx uuid, p_status text, p_issued integer default 0)
returns jsonb language sql stable as $$
    select jsonb_build_object(
        'status', p_status, 'transaction_id', t.id, 'kind', t.kind, 'units', t.units,
        'amount_cents', t.amount_cents, 'created_at', t.created_at, 'rewards_issued', p_issued,
        'member', public.loyalty_member_card(t.member_id))
      from public.loyalty_transactions t where t.id = p_tx;
$$;

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

create or replace function public.loyalty_record(
    p_company text, p_member uuid, p_kind text, p_amount_cents bigint, p_location uuid,
    p_external_ref text, p_idempotency_key text, p_source text default 'caja')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ref text := nullif(btrim(p_external_ref), '');
    v_amount bigint := coalesce(p_amount_cents, 0);
    v_hash text;
    v_tx public.loyalty_transactions;
    m public.loyalty_members;
    p public.loyalty_programs;
    v public.loyalty_program_versions;
    v_units integer;
    v_issued integer;
begin
    perform public.loyalty_require_at(p_company, p_location, 'ops.record');
    if p_kind not in ('purchase', 'visit') then perform public.loyalty_err('invalid_kind'); end if;
    if v_amount < 0 or v_amount > 10000000000 then perform public.loyalty_err('invalid_amount'); end if;
    v_hash := md5(concat_ws('|', p_member, p_kind, v_amount, p_location, v_ref, p_source));

    -- 1 · ¿Reintento? Mismo resultado, sin tocar nada.
    select * into v_tx from public.loyalty_transactions
     where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        if v_tx.request_hash <> v_hash then perform public.loyalty_err('idempotency_conflict'); end if;
        return public.loyalty_tx_result(v_tx.id, 'replayed');
    end if;

    -- 2 · El miembro, BLOQUEADO hasta el commit: dos cajas a la vez se ponen en fila.
    select * into m from public.loyalty_members where company_id = p_company and id = p_member for update;
    if not found then perform public.loyalty_err('member_not_found'); end if;
    if m.status <> 'active' then perform public.loyalty_err('member_inactive'); end if;

    -- Pudo entrar el mismo reintento mientras esperábamos el bloqueo.
    select * into v_tx from public.loyalty_transactions
     where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        if v_tx.request_hash <> v_hash then perform public.loyalty_err('idempotency_conflict'); end if;
        return public.loyalty_tx_result(v_tx.id, 'replayed');
    end if;

    if v_ref is null and (select s.require_external_ref from public.loyalty_settings s where s.company_id = p_company) then
        perform public.loyalty_err('external_ref_required');
    end if;
    if v_ref is not null and exists (
        select 1 from public.loyalty_transactions t
         where t.company_id = p_company and t.source = p_source and t.external_ref = v_ref
           and t.kind in ('purchase', 'visit')) then
        perform public.loyalty_err('duplicate_reference');
    end if;

    select * into p from public.loyalty_programs where id = m.program_id;
    if p.status <> 'active' then perform public.loyalty_err('program_not_active'); end if;
    v := public.loyalty_current_version(p.id);
    if v.id is null then perform public.loyalty_err('program_expired'); end if;
    if p_location is not null and not exists (
        select 1 from public.loyalty_locations l where l.company_id = p_company and l.id = p_location and l.is_active) then
        perform public.loyalty_err('invalid_location');
    end if;
    if v.location_ids is not null and (p_location is null or not p_location = any (v.location_ids)) then
        perform public.loyalty_err('location_not_participating');
    end if;
    if v.rule_type = 'points' and v_amount = 0 then perform public.loyalty_err('amount_required'); end if;

    v_units := public.loyalty_units_for(v, p_kind, v_amount);

    begin
        insert into public.loyalty_transactions (company_id, program_id, version_id, member_id, location_id, kind,
                                                 source, external_ref, idempotency_key, request_hash,
                                                 amount_cents, units, staff_user_id)
        values (p_company, p.id, v.id, m.id, p_location, p_kind, p_source, v_ref, p_idempotency_key, v_hash,
                v_amount, v_units, (select auth.uid())::text)
        returning * into v_tx;
    exception when unique_violation then
        -- La red de seguridad final: el índice único, no la comprobación de arriba.
        select * into v_tx from public.loyalty_transactions
         where company_id = p_company and idempotency_key = p_idempotency_key;
        if found and v_tx.request_hash = v_hash then return public.loyalty_tx_result(v_tx.id, 'replayed'); end if;
        if found then perform public.loyalty_err('idempotency_conflict'); end if;
        perform public.loyalty_err('duplicate_reference');
    end;

    if v_units <> 0 then perform public.loyalty_move(m, v_units, 'earn', v_tx.id); end if;
    update public.loyalty_members
       set ops_count = ops_count + 1, first_op_at = coalesce(first_op_at, v_tx.created_at),
           last_op_at = v_tx.created_at, updated_at = now()
     where id = m.id;
    v_issued := public.loyalty_issue_rewards(m.id, v, v_tx.id);
    perform public.loyalty_enqueue_wallet(m.id);

    -- Campañas: esta compra cuenta como «compra validada después» de un envío
    -- reciente, y para lo que estuviera en cola para recuperarle.
    insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage, detail)
    select distinct on (e.campaign_id) e.company_id, e.campaign_id, e.member_id, 'validated_purchase_after', v_tx.id::text
      from public.loyalty_campaign_events e
     where e.member_id = m.id and e.stage = 'provider_accepted' and e.created_at > now() - interval '14 days'
       and not exists (select 1 from public.loyalty_campaign_events x
                        where x.member_id = m.id and x.campaign_id = e.campaign_id
                          and x.stage = 'validated_purchase_after' and x.created_at > e.created_at)
     order by e.campaign_id, e.created_at desc;
    perform public.loyalty_cancel_member_pushes(m.id, 'purchase', true);

    return public.loyalty_tx_result(v_tx.id, 'created', v_issued);
end $$;

-- Canje: un premio concreto (o el más antiguo). El bloqueo del miembro pone en
-- fila los canjes simultáneos y el unique de redemptions.reward_id es la red
-- final: un premio no se canjea dos veces ni con dos cajas a la vez.
create or replace function public.loyalty_redeem(
    p_company text, p_member uuid, p_reward uuid, p_location uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    r public.loyalty_rewards;
    v_red public.loyalty_redemptions;
begin
    perform public.loyalty_require_at(p_company, p_location, 'ops.redeem');
    select * into v_red from public.loyalty_redemptions where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        return jsonb_build_object('status', 'replayed', 'redemption_id', v_red.id, 'reward_id', v_red.reward_id,
                                  'member', public.loyalty_member_card(v_red.member_id));
    end if;

    select * into m from public.loyalty_members where company_id = p_company and id = p_member for update;
    if not found then perform public.loyalty_err('member_not_found'); end if;
    if m.status <> 'active' then perform public.loyalty_err('member_inactive'); end if;
    if not exists (select 1 from public.loyalty_programs p where p.id = m.program_id and p.status in ('active', 'paused')) then
        perform public.loyalty_err('program_not_active');
    end if;
    select * into v_red from public.loyalty_redemptions where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        return jsonb_build_object('status', 'replayed', 'redemption_id', v_red.id, 'reward_id', v_red.reward_id,
                                  'member', public.loyalty_member_card(v_red.member_id));
    end if;

    select * into r from public.loyalty_rewards
     where member_id = m.id and status = 'available' and (p_reward is null or id = p_reward)
     order by expires_at nulls last, issued_at
     limit 1 for update;
    if not found then perform public.loyalty_err('no_reward_available'); end if;
    if r.expires_at is not null and r.expires_at <= now() then
        update public.loyalty_rewards set status = 'expired' where id = r.id;
        update public.loyalty_members set rewards_available = greatest(rewards_available - 1, 0) where id = m.id;
        perform public.loyalty_enqueue_wallet(m.id);
        perform public.loyalty_err('reward_expired');
    end if;
    if p_location is not null and not exists (
        select 1 from public.loyalty_locations l where l.company_id = p_company and l.id = p_location and l.is_active) then
        perform public.loyalty_err('invalid_location');
    end if;

    update public.loyalty_rewards set status = 'redeemed', redeemed_at = now() where id = r.id;
    insert into public.loyalty_redemptions (company_id, member_id, reward_id, location_id, idempotency_key, staff_user_id)
    values (p_company, m.id, r.id, p_location, p_idempotency_key, (select auth.uid())::text)
    returning * into v_red;
    update public.loyalty_members set rewards_available = rewards_available - 1, updated_at = now() where id = m.id;
    perform public.loyalty_enqueue_wallet(m.id);
    return jsonb_build_object('status', 'created', 'redemption_id', v_red.id, 'reward_id', r.id,
                              'description', r.description, 'member', public.loyalty_member_card(m.id));
end $$;

-- Devolución: una operación NUEVA que compensa a otra. Si deja el saldo en
-- negativo y la compra original había generado un premio aún sin canjear, ese
-- premio se revoca y sus unidades vuelven (neto: como si no hubiera existido).
-- Si ya se canjeó, el saldo queda negativo y lo cubren las compras siguientes.
create or replace function public.loyalty_refund(
    p_company text, p_transaction uuid, p_amount_cents bigint, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    o public.loyalty_transactions;
    m public.loyalty_members;
    v public.loyalty_program_versions;
    v_tx public.loyalty_transactions;
    v_done_amount bigint;
    v_done_units integer;
    v_amount bigint;
    v_units integer;
    v_hash text;
    v_bal integer;
    r public.loyalty_rewards;
begin
    perform public.loyalty_require(p_company, 'ops.refund');
    select * into o from public.loyalty_transactions
     where company_id = p_company and id = p_transaction and kind in ('purchase', 'visit') for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    perform public.loyalty_require_at(p_company, o.location_id, 'ops.refund');
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform public.loyalty_err('reason_required'); end if;
    v_hash := md5(concat_ws('|', 'refund', p_transaction, p_amount_cents));

    select * into v_tx from public.loyalty_transactions where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        if v_tx.request_hash <> v_hash then perform public.loyalty_err('idempotency_conflict'); end if;
        return public.loyalty_tx_result(v_tx.id, 'replayed');
    end if;

    select * into m from public.loyalty_members where id = o.member_id for update;
    select * into v from public.loyalty_program_versions where id = o.version_id;
    select coalesce(sum(t.amount_cents), 0), coalesce(sum(-t.units), 0) into v_done_amount, v_done_units
      from public.loyalty_transactions t where t.reverses_id = o.id and t.kind = 'refund';
    if v_done_units >= o.units and v_done_amount >= o.amount_cents then perform public.loyalty_err('already_refunded'); end if;

    if p_amount_cents is null or p_amount_cents >= o.amount_cents - v_done_amount then
        v_amount := o.amount_cents - v_done_amount;
        v_units := o.units - v_done_units;
    else
        -- Parcial: solo tiene sentido con puntos por gasto. Mismos números de
        -- la versión ORIGINAL, no de la vigente.
        if v.rule_type <> 'points' then perform public.loyalty_err('partial_refund_not_supported'); end if;
        if p_amount_cents <= 0 then perform public.loyalty_err('invalid_amount'); end if;
        v_amount := p_amount_cents;
        v_units := least(o.units - v_done_units, public.loyalty_units_for(v, 'purchase', greatest(p_amount_cents, v.min_purchase_cents)));
    end if;

    insert into public.loyalty_transactions (company_id, program_id, version_id, member_id, location_id, kind, source,
                                             idempotency_key, request_hash, amount_cents, units, reverses_id,
                                             reason, staff_user_id)
    values (p_company, o.program_id, o.version_id, o.member_id, o.location_id, 'refund', o.source,
            p_idempotency_key, v_hash, v_amount, -v_units, o.id, btrim(p_reason), (select auth.uid())::text)
    returning * into v_tx;
    v_bal := m.balance;
    if v_units <> 0 then v_bal := public.loyalty_move(m, -v_units, 'reverse', v_tx.id); end if;

    while v_bal < 0 loop
        select * into r from public.loyalty_rewards
         where source_transaction_id = o.id and status = 'available' order by issued_at desc limit 1 for update;
        exit when not found;
        update public.loyalty_rewards set status = 'revoked', revoked_at = now() where id = r.id;
        update public.loyalty_members set rewards_available = rewards_available - 1 where id = m.id;
        select * into m from public.loyalty_members where id = m.id;
        v_bal := public.loyalty_move(m, r.threshold, 'reward_revoke', v_tx.id, r.id);
    end loop;

    perform public.loyalty_enqueue_wallet(m.id);
    perform public.loyalty_audit(p_company, 'tx.refund', 'loyalty_transactions', v_tx.id::text,
                                 jsonb_build_object('reverses', o.id, 'amount', v_amount, 'units', v_units, 'reason', p_reason));
    return public.loyalty_tx_result(v_tx.id, 'created');
end $$;

-- Corrección manual de unidades (no de dinero). Para errores de caja.
create or replace function public.loyalty_adjust(
    p_company text, p_member uuid, p_units integer, p_reason text, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v_tx public.loyalty_transactions;
    v public.loyalty_program_versions;
    v_hash text := md5(concat_ws('|', 'adjust', p_member, p_units));
    v_issued integer := 0;
begin
    perform public.loyalty_require(p_company, 'ops.refund');
    if coalesce(p_units, 0) = 0 or abs(p_units) > 100000 then perform public.loyalty_err('invalid_units'); end if;
    if char_length(btrim(coalesce(p_reason, ''))) < 3 then perform public.loyalty_err('reason_required'); end if;
    select * into v_tx from public.loyalty_transactions where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        if v_tx.request_hash <> v_hash then perform public.loyalty_err('idempotency_conflict'); end if;
        return public.loyalty_tx_result(v_tx.id, 'replayed');
    end if;
    select * into m from public.loyalty_members where company_id = p_company and id = p_member for update;
    if not found or m.status = 'deleted' then perform public.loyalty_err('member_not_found'); end if;
    if m.balance + p_units < 0 then perform public.loyalty_err('insufficient_balance'); end if;
    insert into public.loyalty_transactions (company_id, program_id, member_id, kind, source, idempotency_key,
                                             request_hash, units, reason, staff_user_id)
    values (p_company, m.program_id, m.id, 'adjustment', 'panel', p_idempotency_key, v_hash, p_units,
            btrim(p_reason), (select auth.uid())::text)
    returning * into v_tx;
    perform public.loyalty_move(m, p_units, 'adjust', v_tx.id);
    if p_units > 0 then
        v := public.loyalty_current_version(m.program_id);
        if v.id is not null then v_issued := public.loyalty_issue_rewards(m.id, v, v_tx.id); end if;
    end if;
    perform public.loyalty_enqueue_wallet(m.id);
    perform public.loyalty_audit(p_company, 'tx.adjust', 'loyalty_transactions', v_tx.id::text,
                                 jsonb_build_object('units', p_units, 'reason', p_reason));
    return public.loyalty_tx_result(v_tx.id, 'created', v_issued);
end $$;

-- Proyección contra libro. Con p_fix la proyección pasa a valer lo del libro.
create or replace function public.loyalty_reconcile(p_company text, p_fix boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
    perform public.loyalty_require(p_company, case when p_fix then 'team.manage' else 'wallet.manage' end);
    with calc as (
        select m.id, m.public_code, m.balance, m.rewards_available,
               coalesce((select sum(l.units) from public.loyalty_ledger l where l.member_id = m.id), 0)::int as ledger_balance,
               (select count(*) from public.loyalty_rewards x where x.member_id = m.id and x.status = 'available')::int as ledger_rewards
          from public.loyalty_members m where m.company_id = p_company)
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into r
      from calc c where c.balance <> c.ledger_balance or c.rewards_available <> c.ledger_rewards;
    if p_fix and jsonb_array_length(r) > 0 then
        update public.loyalty_members m
           set balance = (x ->> 'ledger_balance')::int, rewards_available = (x ->> 'ledger_rewards')::int, updated_at = now()
          from jsonb_array_elements(r) x where m.id = (x ->> 'id')::uuid;
        perform public.loyalty_enqueue_wallet((x ->> 'id')::uuid) from jsonb_array_elements(r) x;
        perform public.loyalty_audit(p_company, 'reconcile.fix', 'loyalty_members', null, jsonb_build_object('rows', r));
    end if;
    return jsonb_build_object('mismatches', r, 'fixed', p_fix and jsonb_array_length(r) > 0);
end $$;

-- ═══ PLACAS Y ENLACES ═══════════════════════════════════════════════════════

-- Los enlaces que se ven AHORA de una versión publicada: activos y dentro de
-- fechas. Los de tipo «join» solo si hay programa activo.
create or replace function public.loyalty_effective_links(p_links jsonb, p_company text)
returns jsonb language sql stable as $$
    select coalesce(jsonb_agg(l order by (l ->> 'position')::int), '[]'::jsonb)
      from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) l
     where coalesce((l ->> 'is_active')::boolean, true)
       and (l ->> 'starts_at' is null or (l ->> 'starts_at')::timestamptz <= now())
       and (l ->> 'ends_at' is null or (l ->> 'ends_at')::timestamptz > now())
       and (l ->> 'kind' <> 'join' or exists (select 1 from public.loyalty_programs p
                                               where p.company_id = p_company and p.status = 'active'));
$$;

create or replace function public.loyalty_profile_effective_count(p_profile uuid)
returns integer language sql stable as $$
    select coalesce((select jsonb_array_length(public.loyalty_effective_links(v.links, v.company_id))
                       from public.loyalty_link_profiles p
                       join public.loyalty_published_link_versions v on v.id = p.published_version_id
                      where p.id = p_profile), 0);
$$;

create or replace function public.loyalty_profile_save(
    p_company text, p_profile uuid, p_name text, p_title text, p_tagline text, p_links jsonb, p_make_default boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    l jsonb;
    i integer := 0;
begin
    perform public.loyalty_require(p_company, 'links.manage');
    if jsonb_typeof(coalesce(p_links, '[]')) <> 'array' or jsonb_array_length(coalesce(p_links, '[]')) > 30 then
        perform public.loyalty_err('invalid_links');
    end if;
    begin
        if p_profile is null then
            insert into public.loyalty_link_profiles (company_id, name, title, tagline)
            values (p_company, btrim(p_name), coalesce(btrim(p_title), ''), coalesce(btrim(p_tagline), ''))
            returning id into v_id;
        else
            update public.loyalty_link_profiles
               set name = coalesce(btrim(p_name), name), title = coalesce(btrim(p_title), title),
                   tagline = coalesce(btrim(p_tagline), tagline), updated_at = now()
             where company_id = p_company and id = p_profile returning id into v_id;
            if v_id is null then perform public.loyalty_err('not_found'); end if;
        end if;

        delete from public.loyalty_links where profile_id = v_id;
        for l in select * from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) loop
            if coalesce(l ->> 'kind', 'url') = 'url' and not public.loyalty_url_ok(l ->> 'url') then
                perform public.loyalty_err('invalid_url', l ->> 'url');
            end if;
            insert into public.loyalty_links (company_id, profile_id, label, kind, url, position, is_active,
                                              is_primary, starts_at, ends_at)
            values (p_company, v_id, btrim(l ->> 'label'), coalesce(l ->> 'kind', 'url'),
                    case when coalesce(l ->> 'kind', 'url') = 'url' then l ->> 'url' end, i,
                    coalesce((l ->> 'is_active')::boolean, true), coalesce((l ->> 'is_primary')::boolean, false),
                    nullif(l ->> 'starts_at', '')::timestamptz, nullif(l ->> 'ends_at', '')::timestamptz);
            i := i + 1;
        end loop;
    exception
        when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow then
            perform public.loyalty_err('invalid_links', sqlerrm);
    end;

    if coalesce(p_make_default, false) or not exists (
        select 1 from public.loyalty_settings s where s.company_id = p_company and s.default_profile_id is not null) then
        update public.loyalty_settings set default_profile_id = v_id, updated_at = now() where company_id = p_company;
    end if;
    perform public.loyalty_audit(p_company, 'profile.save', 'loyalty_link_profiles', v_id::text,
                                 jsonb_build_object('links', p_links));
    return v_id;
end $$;

-- Publicar es atómico: una fila nueva con la foto completa y el puntero movido
-- en la misma transacción.
create or replace function public.loyalty_profile_publish(p_company text, p_profile uuid, p_allow_empty boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    pr public.loyalty_link_profiles;
    v_links jsonb;
    v_version integer;
    v_id uuid;
begin
    perform public.loyalty_require(p_company, 'links.manage');
    select * into pr from public.loyalty_link_profiles where company_id = p_company and id = p_profile for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', l.label, 'kind', l.kind, 'url', l.url, 'position', l.position, 'is_active', l.is_active,
               'is_primary', l.is_primary, 'starts_at', l.starts_at, 'ends_at', l.ends_at) order by l.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links l where l.profile_id = p_profile;
    if jsonb_array_length(public.loyalty_effective_links(v_links, p_company)) = 0
       and not coalesce(p_allow_empty, false)
       and exists (select 1 from public.loyalty_devices d where d.profile_id = p_profile and d.status = 'active') then
        perform public.loyalty_err('empty_profile_in_use');
    end if;
    select coalesce(max(version), 0) + 1 into v_version from public.loyalty_published_link_versions where profile_id = p_profile;
    insert into public.loyalty_published_link_versions (company_id, profile_id, version, title, tagline, links, published_by)
    values (p_company, p_profile, v_version, pr.title, pr.tagline, v_links, (select auth.uid())::text)
    returning id into v_id;
    update public.loyalty_link_profiles set published_version_id = v_id, updated_at = now() where id = p_profile;
    perform public.loyalty_audit(p_company, 'profile.publish', 'loyalty_link_profiles', p_profile::text,
                                 jsonb_build_object('version', v_version, 'links', v_links));
    return jsonb_build_object('version', v_version, 'effective',
                              jsonb_array_length(public.loyalty_effective_links(v_links, p_company)));
end $$;

create or replace function public.loyalty_device_create(
    p_company text, p_label text, p_kind text, p_location uuid, p_profile uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_id uuid;
    v_token text := public.loyalty_b64url(public.loyalty_random_bytes(18));  -- 144 bits
begin
    perform public.loyalty_require(p_company, 'devices.manage');
    begin
        insert into public.loyalty_devices (company_id, location_id, profile_id, public_token, label, kind, status, created_by)
        values (p_company, p_location, p_profile, v_token, coalesce(btrim(p_label), ''), coalesce(p_kind, 'qr'),
                'assigned', (select auth.uid())::text)
        returning id into v_id;
    exception when foreign_key_violation or check_violation then perform public.loyalty_err('invalid_device', sqlerrm);
    end;
    insert into public.loyalty_device_claims (device_id, company_id, method, claimed_by)
    values (v_id, p_company, 'created_in_panel', (select auth.uid())::text);
    perform public.loyalty_audit(p_company, 'device.create', 'loyalty_devices', v_id::text,
                                 jsonb_build_object('label', p_label));
    return jsonb_build_object('id', v_id, 'public_token', v_token);
end $$;

-- El inventario de fábrica: solo el admin de plataforma. Devuelve los códigos
-- de activación EN CLARO una única vez; en la base solo queda su hash.
create or replace function public.loyalty_admin_device_batch(p_count integer, p_batch text, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_out jsonb := '[]'::jsonb;
    v_token text;
    v_code text;
    v_id uuid;
begin
    if not public.loyalty_es_admin() then raise exception 'loyalty:forbidden' using errcode = '42501'; end if;
    if p_count not between 1 and 500 then perform public.loyalty_err('invalid_count'); end if;
    for i in 1 .. p_count loop
        v_token := public.loyalty_b64url(public.loyalty_random_bytes(18));
        v_code := public.loyalty_code_chars(5) || '-' || public.loyalty_code_chars(5);
        insert into public.loyalty_devices (public_token, activation_code_hash, kind, status, batch, created_by)
        values (v_token, public.loyalty_hash(replace(v_code, '-', '')), coalesce(p_kind, 'nfc_qr'), 'manufactured', p_batch,
                (select auth.uid())::text)
        returning id into v_id;
        v_out := v_out || jsonb_build_object('id', v_id, 'public_token', v_token, 'activation_code', v_code);
    end loop;
    perform public.loyalty_audit(null, 'device.batch', 'loyalty_devices', p_batch,
                                 jsonb_build_object('count', p_count), 'platform_admin');
    return v_out;
end $$;

create or replace function public.loyalty_device_claim(p_company text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.loyalty_devices;
begin
    perform public.loyalty_require(p_company, 'devices.manage');
    select * into d from public.loyalty_devices
     where activation_code_hash = public.loyalty_hash(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')))
     for update;
    if not found or d.activation_used_at is not null or d.company_id is not null
       or d.status not in ('manufactured', 'tested') then
        perform public.loyalty_audit(p_company, 'device.claim_failed', 'loyalty_devices', null, null);
        perform public.loyalty_err('invalid_activation_code');
    end if;
    update public.loyalty_devices
       set company_id = p_company, status = 'assigned', activation_used_at = now(), updated_at = now()
     where id = d.id;
    insert into public.loyalty_device_claims (device_id, company_id, method, claimed_by)
    values (d.id, p_company, 'activation_code', (select auth.uid())::text);
    perform public.loyalty_audit(p_company, 'device.claim', 'loyalty_devices', d.id::text, null);
    return jsonb_build_object('id', d.id);
end $$;

create or replace function public.loyalty_device_update(
    p_company text, p_device uuid, p_label text, p_location uuid, p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.loyalty_devices;
begin
    perform public.loyalty_require(p_company, 'devices.manage');
    select * into d from public.loyalty_devices where company_id = p_company and id = p_device for update;
    if not found or d.status = 'retired' then perform public.loyalty_err('not_found'); end if;
    -- Una placa activa no puede quedarse sin destino por un cambio de perfil.
    if d.status = 'active' and (p_profile is null or public.loyalty_profile_effective_count(p_profile) = 0) then
        perform public.loyalty_err('device_no_destination');
    end if;
    begin
        update public.loyalty_devices
           set label = coalesce(btrim(p_label), label), location_id = p_location, profile_id = p_profile, updated_at = now()
         where id = p_device;
    exception when foreign_key_violation then perform public.loyalty_err('invalid_device');
    end;
    perform public.loyalty_audit(p_company, 'device.update', 'loyalty_devices', p_device::text,
                                 jsonb_build_object('label', p_label, 'location', p_location, 'profile', p_profile,
                                                    'previous_profile', d.profile_id));
end $$;

create or replace function public.loyalty_device_set_status(p_company text, p_device uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.loyalty_devices;
begin
    perform public.loyalty_require(p_company, 'devices.manage');
    select * into d from public.loyalty_devices where company_id = p_company and id = p_device for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    if d.status = 'retired' then perform public.loyalty_err('device_retired'); end if;
    if p_status = 'active' then
        -- Cero enlaces publicados: no se activa. Es la regla 0 del resolutor.
        if d.profile_id is null or public.loyalty_profile_effective_count(d.profile_id) = 0 then
            perform public.loyalty_err('device_no_destination');
        end if;
    elsif p_status not in ('suspended', 'retired', 'assigned') then
        perform public.loyalty_err('invalid_status');
    end if;
    update public.loyalty_devices
       set status = p_status, updated_at = now(),
           activated_at = case when p_status = 'active' then coalesce(activated_at, now()) else activated_at end
     where id = p_device;
    perform public.loyalty_audit(p_company, 'device.status', 'loyalty_devices', p_device::text,
                                 jsonb_build_object('from', d.status, 'to', p_status));
end $$;

-- ═══ CAMPAÑAS ═══════════════════════════════════════════════════════════════

create or replace function public.loyalty_campaign_config(p_template text, p_config jsonb)
returns jsonb language plpgsql immutable as $$
declare
    v_inactive int := coalesce((p_config ->> 'inactive_days')::int, 60);
    v_cycle int := coalesce((p_config ->> 'cycle_days')::int, 30);
    v_max int := coalesce((p_config ->> 'max_per_30d')::int, 2);
begin
    if v_inactive not between 14 and 365 or v_cycle not between 7 and 180 or v_max not between 1 and 4 then
        perform public.loyalty_err('invalid_campaign_config');
    end if;
    return jsonb_build_object('inactive_days', v_inactive, 'cycle_days', v_cycle, 'max_per_30d', v_max);
end $$;

create or replace function public.loyalty_campaign_save(
    p_company text, p_template text, p_status text, p_title text, p_body text, p_config jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    begin
        insert into public.loyalty_campaigns (company_id, template, status, title, body, config)
        values (p_company, p_template, p_status, btrim(p_title), btrim(p_body),
                public.loyalty_campaign_config(p_template, p_config))
        on conflict (company_id, template) do update
           set status = excluded.status, title = excluded.title, body = excluded.body,
               config = excluded.config, updated_at = now()
        returning id into v_id;
    exception when check_violation or not_null_violation then perform public.loyalty_err('invalid_campaign', sqlerrm);
    end;
    perform public.loyalty_audit(p_company, 'campaign.save', 'loyalty_campaigns', v_id::text,
                                 jsonb_build_object('template', p_template, 'status', p_status));
    return v_id;
end $$;

-- Audiencia estimada: cuántos cumplirían el criterio y cuántos de ellos se
-- pueden contactar de verdad (consentimiento vigente + navegador suscrito).
create or replace function public.loyalty_campaign_members(p_company text, p_template text, p_config jsonb)
returns setof uuid language sql stable as $$
    select m.id from public.loyalty_members m
     where m.company_id = p_company and m.status = 'active'
       and case p_template
           when 'reward_available' then m.rewards_available > 0
           when 'welcome' then m.created_at > now() - interval '7 days'
           when 'return_reminder' then m.last_op_at between now() - make_interval(days => (p_config ->> 'cycle_days')::int + 7)
                                                     and now() - make_interval(days => (p_config ->> 'cycle_days')::int)
           when 'winback' then m.last_op_at < now() - make_interval(days => (p_config ->> 'inactive_days')::int)
           else false end;
$$;

create or replace function public.loyalty_campaign_audience(p_company text, p_template text, p_config jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    c jsonb := public.loyalty_campaign_config(p_template, p_config);
    v_total int;
    v_reach int;
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    select count(*), count(*) filter (where public.loyalty_consents_now(x.id, 'push') and exists (
               select 1 from public.loyalty_push_subscriptions s where s.member_id = x.id and s.revoked_at is null))
      into v_total, v_reach
      from public.loyalty_campaign_members(p_company, p_template, c) as x(id);
    return jsonb_build_object('matching', v_total, 'reachable', v_reach);
end $$;

create or replace function public.loyalty_wallet_resync(p_company text, p_member uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
    perform public.loyalty_require(p_company, 'wallet.manage');
    if p_member is not null then
        perform public.loyalty_enqueue_wallet(p_member);
        return 1;
    end if;
    insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
    select company_id, 'wallet.class.sync', jsonb_build_object('program_id', program_id), 'wallet.class:' || program_id
      from public.loyalty_wallet_classes where company_id = p_company and state <> 'synced'
    on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
    for p_member in select member_id from public.loyalty_wallet_passes
                     where company_id = p_company and (state <> 'synced' or synced_rev < desired_rev) loop
        perform public.loyalty_enqueue_wallet(p_member);
        n := n + 1;
    end loop;
    perform public.loyalty_audit(p_company, 'wallet.resync', null, null, jsonb_build_object('passes', n));
    return n;
end $$;

create or replace function public.loyalty_outbox_retry(p_company text, p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_require(p_company, 'wallet.manage');
    begin
        update public.loyalty_outbox
           set status = 'pending', next_attempt_at = now(), max_attempts = attempts + 3, updated_at = now()
         where company_id = p_company and id = p_id and status in ('dead', 'retry');
    exception when unique_violation then
        -- Ya hay otro trabajo pendiente para lo mismo: ese hará el trabajo.
        update public.loyalty_outbox set status = 'done', done_at = now(), result = '{"merged":true}'
         where company_id = p_company and id = p_id;
    end;
    perform public.loyalty_audit(p_company, 'outbox.retry', 'loyalty_outbox', p_id::text, null);
end $$;
