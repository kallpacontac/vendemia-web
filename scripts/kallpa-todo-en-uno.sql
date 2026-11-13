-- ═══════════════════════════════════════════════════════════════════════════════
-- KALLPA · TODO EN UNO · 13-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Copia TODO esto en el editor SQL de Supabase y dale a Run. Deja a Kallpa así:
--   · UN solo negocio (kallpa, página fideliza.vendemias.com/n/kallpa-triatlon)
--   · UNA tarjeta con dos líneas: «Asistencia» (niveles del mes) y «Compra» (12 sellos)
--   · Sin el negocio suelto «kallpa-tienda»
--   · Botones: planes, kekitos, tienda virtual y Yape/Plin
--   · La ficha del cliente con el historial de las dos líneas
--
-- Junta, en este orden (cada paso es su propia transacción):
--   1. modules/fideliza/sql/0017_una_tarjeta_varias_lineas.sql
--   2. scripts/kallpa-clubes-alta.sql
--   3. scripts/kallpa-tienda-quitar.sql
--   4. scripts/kallpa-botones.sql
--   5. modules/fideliza/sql/0018_ficha_con_lineas.sql
--
-- No hay que rellenar nada: la cuenta de tu papá ya existe, así que v_clave se
-- queda vacía. Se puede volver a correr entero sin duplicar nada.
-- Si un paso falla, se para ahí: los anteriores quedan hechos y el resto no corre.
-- El caso esperable: «kallpa-tienda ya tiene N tarjeta(s)» en el paso 3. Avísame.
--
-- Requiere la 0015 (niveles del mes), que ya se corrió para crear el Club Kallpa.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASO 1 DE 5 · Una tarjeta, varias líneas (0017)
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_program_versions' and column_name = 'period') then
        raise exception 'Falta la 0015 (niveles del mes): córrela antes que esta.';
    end if;
end $$;

-- ── Programas: la línea cuelga del principal ─────────────────────────────────
alter table public.loyalty_programs
    add column if not exists parent_program_id uuid,
    add column if not exists line_label text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'loyalty_programs_line_label_ck') then
        alter table public.loyalty_programs add constraint loyalty_programs_line_label_ck
            check (line_label is null or char_length(btrim(line_label)) between 1 and 24);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'loyalty_programs_parent_ck') then
        alter table public.loyalty_programs add constraint loyalty_programs_parent_ck
            check (parent_program_id is null or parent_program_id <> id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'loyalty_programs_parent_fk') then
        alter table public.loyalty_programs add constraint loyalty_programs_parent_fk
            foreign key (company_id, parent_program_id) references public.loyalty_programs (company_id, id);
    end if;
end $$;

-- Sigue habiendo UN programa principal vivo por negocio (el alta pública apunta
-- a él). Las líneas no cuentan para ese límite.
drop index if exists public.ux_loyalty_programs_vivo;
create unique index ux_loyalty_programs_vivo
    on public.loyalty_programs (company_id) where status in ('active', 'paused') and parent_program_id is null;
create unique index if not exists ux_loyalty_programs_linea
    on public.loyalty_programs (parent_program_id, lower(line_label)) where parent_program_id is not null;

-- ── Miembros: el de cada línea cuelga de la persona ──────────────────────────
alter table public.loyalty_members add column if not exists parent_member_id uuid;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'loyalty_members_parent_fk') then
        alter table public.loyalty_members add constraint loyalty_members_parent_fk
            foreign key (company_id, parent_member_id) references public.loyalty_members (company_id, id);
    end if;
end $$;
create unique index if not exists ux_loyalty_members_linea
    on public.loyalty_members (parent_member_id, program_id) where parent_member_id is not null;

-- ── Una línea, tal como la ve la caja ────────────────────────────────────────
-- s es el miembro de esa línea (null si aún no se le ha sumado nada allí).
create or replace function public.loyalty_line_json(
    p public.loyalty_programs, v public.loyalty_program_versions, s public.loyalty_members)
returns jsonb language plpgsql stable as $$
declare
    b integer := case when s.id is null then 0 else public.loyalty_shown_balance(s, v) end;
    g jsonb := public.loyalty_goal(v, b);
begin
    return jsonb_build_object(
        'program_id', p.id, 'label', coalesce(p.line_label, p.name), 'main', p.parent_program_id is null,
        'status', p.status, 'member_id', s.id, 'rule_type', v.rule_type, 'balance', b,
        'threshold', (g ->> 'threshold')::int, 'reward', g ->> 'reward',
        'rewards_available', coalesce(s.rewards_available, 0), 'period', coalesce(v.period, 'none'),
        'cooldown_hours', v.cooldown_hours, 'bonus_label', v.bonus_label, 'bonus_units', v.bonus_units,
        'rewards', case when s.id is null then '[]'::jsonb else coalesce((
            select jsonb_agg(jsonb_build_object('id', r.id, 'description', r.description,
                                                'expires_at', r.expires_at, 'part', r.tier_part) order by r.issued_at)
              from public.loyalty_rewards r
             where r.member_id = s.id and r.status = 'available'
               and (r.expires_at is null or r.expires_at > now())), '[]'::jsonb) end);
end $$;

-- Todas las líneas de una persona: la principal primero, luego las vivas por antigüedad.
create or replace function public.loyalty_lines_of(p_root uuid)
returns jsonb language sql stable as $$
    select coalesce(jsonb_agg(x.j order by x.ord, x.creado), '[]'::jsonb) from (
        select 0 as ord, p.created_at as creado, public.loyalty_line_json(p, v, r) as j
          from public.loyalty_members r
          join public.loyalty_programs p on p.id = r.program_id
          left join public.loyalty_program_versions v on v.id = p.current_version_id
         where r.id = p_root
        union all
        select 1, p.created_at, public.loyalty_line_json(p, v, s)
          from public.loyalty_members r
          join public.loyalty_programs p on p.parent_program_id = r.program_id and p.status in ('active', 'paused')
          join public.loyalty_program_versions v on v.id = p.current_version_id
          left join public.loyalty_members s on s.parent_member_id = r.id and s.program_id = p.id
         where r.id = p_root) x;
$$;

-- Para la tarjeta pública y el Wallet: sin los identificadores internos.
create or replace function public.loyalty_lines_public(p_root uuid)
returns jsonb language sql stable as $$
    select coalesce(jsonb_agg((l - 'member_id' - 'program_id')
                              || jsonb_build_object('rewards', coalesce((
                                     select jsonb_agg(r - 'id') from jsonb_array_elements(l -> 'rewards') r), '[]'::jsonb))
                              order by i), '[]'::jsonb)
      from jsonb_array_elements(public.loyalty_lines_of(p_root)) with ordinality x(l, i);
$$;

-- ═══ Funciones vigentes, copiadas y retocadas para las líneas ═══════════════════

-- loyalty_member_search · de 0003_operaciones.sql, con su retoque de líneas
create or replace function public.loyalty_member_search(
    p_company text, p_q text, p_status text, p_filter text, p_limit integer, p_offset integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_contacts boolean;
    q text := lower(btrim(coalesce(p_q, '')));
    v_phone text;
    v_total integer;
    v_rows jsonb;
    v_lines boolean;
begin
    perform public.loyalty_require(p_company, 'members.read');
    v_contacts := public.loyalty_can(p_company, 'contacts.read');
    v_lines := exists (select 1 from public.loyalty_programs p where p.company_id = p_company
                         and p.parent_program_id is not null and p.status in ('active', 'paused'));
    if q ~ '^\+?[0-9 ]{8,18}$' then
        begin v_phone := public.loyalty_norm_phone(q); exception when others then v_phone := null; end;
    end if;

    with base as (
        select m.* from public.loyalty_members m
         where m.company_id = p_company and m.parent_member_id is null
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
                   when 'reward' then m.rewards_available > 0 or exists (
                       select 1 from public.loyalty_members s where s.parent_member_id = m.id and s.rewards_available > 0)
                   when 'wallet' then exists (select 1 from public.loyalty_wallet_passes w where w.member_id = m.id)
                   when 'wallet_error' then exists (select 1 from public.loyalty_wallet_passes w
                                                     where w.member_id = m.id and w.state = 'error')
                   when 'inactive30' then m.last_op_at is null or m.last_op_at < now() - interval '30 days'
                   when 'active30' then m.last_op_at >= now() - interval '30 days'
                   when 'never' then m.first_op_at is null
                   else true end
    )
    select (select count(*) from base),
           coalesce((select jsonb_agg(x order by x.ord) from (
               select row_number() over (order by b.last_op_at desc nulls last, b.created_at desc) as ord,
                      b.id, b.public_code, b.alias, b.status, b.balance, b.rewards_available,
                      b.ops_count, b.last_op_at, b.created_at,
                      case when v_lines then public.loyalty_lines_of(b.id) end as lines,
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

-- loyalty_live_program · de 0003_operaciones.sql, con su retoque de líneas
create or replace function public.loyalty_live_program(p_company text)
returns public.loyalty_programs language sql stable as $$
    select p.* from public.loyalty_programs p
     where p.company_id = p_company and p.status in ('active', 'paused') and p.parent_program_id is null limit 1;
$$;

-- loyalty_program_public · de 0004_servidor.sql, con su retoque de líneas
create or replace function public.loyalty_program_public(p_company text)
returns jsonb language sql stable as $$
    select jsonb_build_object('name', p.name, 'description', p.short_description, 'status', p.status,
                              'rule_type', v.rule_type, 'threshold', v.reward_threshold,
                              'reward', v.reward_description, 'stamps_per_purchase', v.stamps_per_purchase,
                              'points_per_unit', v.points_per_unit, 'unit_cents', v.unit_cents,
                              'min_purchase_cents', v.min_purchase_cents, 'valid_to', v.valid_to)
      from public.loyalty_programs p
      join public.loyalty_program_versions v on v.id = p.current_version_id
     where p.company_id = p_company and p.status = 'active' and p.parent_program_id is null;
$$;

-- loyalty_srv_join · de 0004_servidor.sql, con su retoque de líneas
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
    select * into p from public.loyalty_programs where company_id = s.company_id and status = 'active' and parent_program_id is null;
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

-- loyalty_aviso_audiencia · de 0014_aviso_rapido.sql, con su retoque de líneas
create or replace function public.loyalty_aviso_audiencia(p_company text, p_audience text, p_valor integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_total int;
    v_reach int;
    v_rule text;
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    perform public.loyalty_aviso_validar(p_audience, p_valor);
    select count(*), count(*) filter (where public.loyalty_aviso_alcanzable(x.id))
      into v_total, v_reach
      from public.loyalty_aviso_miembros(p_company, p_audience, p_valor) as x(id);
    select v.rule_type into v_rule
      from public.loyalty_programs p
      join public.loyalty_program_versions v on v.id = p.current_version_id
     where p.company_id = p_company and p.status in ('active', 'paused') and p.parent_program_id is null;
    return jsonb_build_object('matching', v_total, 'reachable', v_reach,
                              'ejemplo', public.loyalty_faltan_texto(greatest(p_valor, 1), v_rule));
end $$;

-- loyalty_aviso_miembros · de 0014_aviso_rapido.sql, con su retoque de líneas
create or replace function public.loyalty_aviso_miembros(p_company text, p_audience text, p_valor integer)
returns setof uuid language sql stable as $$
    select m.id from public.loyalty_members m
     where m.company_id = p_company and m.status = 'active' and m.parent_member_id is null
       and case p_audience
           when 'todos' then true
           -- Quien se apuntó y nunca compró también «hace tiempo que no viene».
           when 'inactivos' then coalesce(m.last_op_at, m.created_at) < now() - make_interval(days => p_valor)
           when 'cerca' then exists (
               select 1 from public.loyalty_programs p
                 join public.loyalty_program_versions v on v.id = p.current_version_id
                where p.id = m.program_id and v.reward_threshold - m.balance between 1 and p_valor)
           else false end;
$$;

-- loyalty_campaign_members · de 0003_operaciones.sql, con su retoque de líneas
create or replace function public.loyalty_campaign_members(p_company text, p_template text, p_config jsonb)
returns setof uuid language sql stable as $$
    select m.id from public.loyalty_members m
     where m.company_id = p_company and m.status = 'active' and m.parent_member_id is null
       and case p_template
           when 'reward_available' then m.rewards_available > 0
           when 'welcome' then m.created_at > now() - interval '7 days'
           when 'return_reminder' then m.last_op_at between now() - make_interval(days => (p_config ->> 'cycle_days')::int + 7)
                                                     and now() - make_interval(days => (p_config ->> 'cycle_days')::int)
           when 'winback' then m.last_op_at < now() - make_interval(days => (p_config ->> 'inactive_days')::int)
           else false end;
$$;

-- loyalty_metrics · de 0005_metricas.sql, con su retoque de líneas
create or replace function public.loyalty_metrics(p_company text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    t0 timestamptz := (p_from::timestamp at time zone 'America/Lima');
    t1 timestamptz := ((p_to + 1)::timestamp at time zone 'America/Lima');
    r jsonb;
begin
    perform public.loyalty_require(p_company, 'metrics.read');
    if p_to < p_from or p_to - p_from > 400 then perform public.loyalty_err('invalid_range'); end if;

    with
    mem as (select * from public.loyalty_members where company_id = p_company and status <> 'deleted' and parent_member_id is null),
    tx as (select * from public.loyalty_transactions where company_id = p_company),
    txp as (select * from tx where created_at >= t0 and created_at < t1),
    rep as (
        select n,
               count(*) filter (where m.first_op_at <= now() - make_interval(days => n)) as cohort,
               count(*) filter (where m.first_op_at <= now() - make_interval(days => n) and exists (
                   select 1 from tx t where t.member_id = m.id and t.kind in ('purchase', 'visit')
                      and t.created_at > m.first_op_at
                      and t.created_at <= m.first_op_at + make_interval(days => n))) as repeated
          from mem m cross join (values (30), (60), (90)) d(n)
         where m.first_op_at is not null
         group by n),
    recov as (
        -- Volvió en el periodo después de 60 días o más sin operar.
        select count(distinct t.member_id) as n from txp t
         where t.kind in ('purchase', 'visit') and exists (
               select 1 from tx p where p.member_id = t.member_id and p.kind in ('purchase', 'visit')
                  and p.created_at < t.created_at
               having max(p.created_at) <= t.created_at - interval '60 days'))
    select jsonb_build_object(
        'range', jsonb_build_object('from', p_from, 'to', p_to),
        'members', jsonb_build_object(
            'total', (select count(*) from mem),
            'new', (select count(*) from mem where created_at >= t0 and created_at < t1),
            'new_activated', (select count(*) from mem where created_at >= t0 and created_at < t1 and first_op_at is not null),
            'with_operation', (select count(*) from mem where ops_count > 0),
            'suspended', (select count(*) from mem where status = 'suspended')),
        'repeat', coalesce((select jsonb_object_agg(n, jsonb_build_object('cohort', cohort, 'repeated', repeated)) from rep), '{}'::jsonb),
        'operations', jsonb_build_object(
            'purchases', (select count(*) from txp where kind = 'purchase'),
            'visits', (select count(*) from txp where kind = 'visit'),
            'refunds', (select count(*) from txp where kind = 'refund'),
            'adjustments', (select count(*) from txp where kind = 'adjustment'),
            'purchase_members', (select count(distinct member_id) from txp where kind = 'purchase'),
            'visit_members', (select count(distinct member_id) from txp where kind = 'visit'),
            'gross_cents', (select coalesce(sum(amount_cents), 0) from txp where kind = 'purchase'),
            'refund_cents', (select coalesce(sum(amount_cents), 0) from txp where kind = 'refund'),
            'units_granted', (select coalesce(sum(l.units), 0) from public.loyalty_ledger l
                               where l.company_id = p_company and l.kind = 'earn' and l.created_at >= t0 and l.created_at < t1)),
        'rewards', jsonb_build_object(
            'issued', (select count(*) from public.loyalty_rewards where company_id = p_company and issued_at >= t0 and issued_at < t1),
            'issued_redeemed', (select count(*) from public.loyalty_rewards where company_id = p_company
                                 and issued_at >= t0 and issued_at < t1 and status = 'redeemed'),
            'redeemed', (select count(*) from public.loyalty_redemptions where company_id = p_company and created_at >= t0 and created_at < t1),
            'available_now', (select count(*) from public.loyalty_rewards where company_id = p_company and status = 'available'
                               and (expires_at is null or expires_at > now())),
            'expired', (select count(*) from public.loyalty_rewards where company_id = p_company and status = 'expired'
                         and expires_at >= t0 and expires_at < t1)),
        'recovered', (select n from recov),
        'funnel', jsonb_build_object(
            'join_views', (select count(*) from public.loyalty_public_events where company_id = p_company and kind = 'join_view' and created_at >= t0 and created_at < t1),
            'joins', (select count(*) from public.loyalty_public_events where company_id = p_company and kind = 'join' and created_at >= t0 and created_at < t1),
            'card_views', (select count(*) from public.loyalty_public_events where company_id = p_company and kind = 'card_view' and created_at >= t0 and created_at < t1)),
        'devices', jsonb_build_object(
            'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.loyalty_devices
                                    where company_id = p_company group by status) x), '{}'::jsonb),
            'opens_by_source', coalesce((select jsonb_object_agg(coalesce(source, 'direct'), n) from (
                                    select source, count(*) n from public.loyalty_public_events
                                     where company_id = p_company and kind = 'device_open' and created_at >= t0 and created_at < t1
                                     group by source) x), '{}'::jsonb),
            'unavailable_opens', (select count(*) from public.loyalty_public_events where company_id = p_company
                                   and kind = 'device_unavailable' and created_at >= t0 and created_at < t1)),
        'wallet', jsonb_build_object(
            'classes', coalesce((select jsonb_agg(jsonb_build_object('program_id', program_id, 'state', state, 'review_status', review_status,
                                     'last_error', last_error, 'last_synced_at', last_synced_at, 'is_demo', is_demo))
                                   from public.loyalty_wallet_classes where company_id = p_company), '[]'::jsonb),
            'passes', (select count(*) from public.loyalty_wallet_passes where company_id = p_company),
            'passes_by_state', coalesce((select jsonb_object_agg(state, n) from (select state, count(*) n from public.loyalty_wallet_passes
                                          where company_id = p_company group by state) x), '{}'::jsonb),
            'pending_updates', (select count(*) from public.loyalty_wallet_passes where company_id = p_company and synced_rev < desired_rev),
            'save_links_issued', (select coalesce(sum(save_links_issued), 0) from public.loyalty_wallet_passes where company_id = p_company),
            'last_sync', (select max(last_synced_at) from public.loyalty_wallet_passes where company_id = p_company)),
        'outbox', jsonb_build_object(
            'pending', (select count(*) from public.loyalty_outbox where company_id = p_company and status in ('pending', 'retry')),
            'overdue', (select count(*) from public.loyalty_outbox where company_id = p_company and status in ('pending', 'retry')
                         and next_attempt_at < now() - interval '15 minutes'),
            'dead', (select count(*) from public.loyalty_outbox where company_id = p_company and status = 'dead'),
            'oldest_pending', (select min(created_at) from public.loyalty_outbox where company_id = p_company and status in ('pending', 'retry'))),
        'campaigns', coalesce((select jsonb_object_agg(c.template, (
                select jsonb_object_agg(stage, n) from (select stage, count(*) n from public.loyalty_campaign_events e
                 where e.campaign_id = c.id and e.created_at >= t0 and e.created_at < t1 group by stage) x))
              from public.loyalty_campaigns c where c.company_id = p_company), '{}'::jsonb))
      into r;
    return r;
end $$;

-- loyalty_srv_card · de 0015_niveles_del_mes.sql, con su retoque de líneas
create or replace function public.loyalty_srv_card(p_card_token text, p_log boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v public.loyalty_program_versions;
    v_bal integer;
begin
    perform public.loyalty_srv_check();
    m := public.loyalty_member_by_card(p_card_token);
    if m.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if p_log then perform public.loyalty_log_event(m.company_id, 'card_view', null, null, null, m.id, null); end if;
    select x.* into v from public.loyalty_programs p join public.loyalty_program_versions x on x.id = p.current_version_id
     where p.id = m.program_id;
    v_bal := public.loyalty_shown_balance(m, v);
    return jsonb_build_object(
        'status', 'ok',
        'lines', public.loyalty_lines_public(m.id),
        'member', jsonb_build_object('public_code', m.public_code, 'alias', m.alias, 'status', m.status,
                                     'balance', v_bal, 'rewards_available', m.rewards_available,
                                     'qr_token', m.qr_token, 'created_at', m.created_at),
        'brand', public.loyalty_brand(m.company_id),
        'program', (select jsonb_build_object('name', p.name, 'description', p.short_description, 'status', p.status,
                                              'rule_type', v.rule_type,
                                              'threshold', (public.loyalty_goal(v, v_bal) ->> 'threshold')::int,
                                              'reward', public.loyalty_goal(v, v_bal) ->> 'reward',
                                              'period', coalesce(v.period, 'none'), 'tiers', v.tiers)
                      from public.loyalty_programs p
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

-- loyalty_srv_wallet_object_data · de 0015_niveles_del_mes.sql, con su retoque de líneas
create or replace function public.loyalty_srv_wallet_object_data(p_member uuid, p_card_token text, p_issuer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    c public.loyalty_wallet_classes;
    w public.loyalty_wallet_passes;
    v public.loyalty_program_versions;
    v_bal integer;
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
    select x.* into v from public.loyalty_programs p join public.loyalty_program_versions x on x.id = p.current_version_id
     where p.id = m.program_id;
    v_bal := public.loyalty_shown_balance(m, v);
    return jsonb_build_object(
        'pass', to_jsonb(w), 'class', to_jsonb(c), 'lines', public.loyalty_lines_public(m.id),
        'member', jsonb_build_object('id', m.id, 'company_id', m.company_id, 'public_code', m.public_code,
                                     'alias', m.alias, 'status', m.status, 'balance', v_bal,
                                     'rewards_available', m.rewards_available, 'qr_token', m.qr_token),
        'program', (select jsonb_build_object('name', p.name, 'status', p.status, 'rule_type', v.rule_type,
                                              'threshold', (public.loyalty_goal(v, v_bal) ->> 'threshold')::int,
                                              'reward', public.loyalty_goal(v, v_bal) ->> 'reward',
                                              'period', coalesce(v.period, 'none'))
                      from public.loyalty_programs p
                     where p.id = m.program_id),
        'brand', public.loyalty_brand(m.company_id));
end $$;

-- loyalty_program_publish · de 0015_niveles_del_mes.sql, con su retoque de líneas
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
    v_period text;
    v_tiers jsonb;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    select * into p from public.loyalty_programs where company_id = p_company and id = p_program for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    select * into v_settings from public.loyalty_settings where company_id = p_company;
    if not found then perform public.loyalty_err('settings_missing'); end if;
    if exists (select 1 from public.loyalty_programs o where o.company_id = p_company and o.id <> p_program
                  and o.status in ('active', 'paused')
                  and o.parent_program_id is null and p.parent_program_id is null) then
        perform public.loyalty_err('another_program_live');
    end if;

    d := p.draft;
    if coalesce(d ->> 'rule_type', '') not in ('stamps', 'points', 'visits') then
        perform public.loyalty_err('invalid_rule', 'rule_type');
    end if;
    v_period := coalesce(nullif(d ->> 'period', ''), 'none');
    v_tiers := case when v_period = 'month' then d -> 'tiers' end;
    if v_period not in ('none', 'month') then perform public.loyalty_err('invalid_rule', 'period'); end if;
    if v_period = 'month' and not public.loyalty_tiers_ok(v_tiers) then perform public.loyalty_err('invalid_rule', 'tiers'); end if;

    select * into v_prev from public.loyalty_program_versions
     where program_id = p_program order by version desc limit 1;
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
            valid_from, valid_to, location_ids, created_by,
            period, tiers, cooldown_hours, bonus_label, bonus_units)
        values (
            p_company, p_program, coalesce(v_prev.version, 0) + 1, d ->> 'rule_type',
            coalesce((d ->> 'stamps_per_purchase')::int, 1),
            coalesce((d ->> 'points_per_unit')::int, 1),
            coalesce((d ->> 'unit_cents')::int, 100),
            coalesce(d ->> 'rounding', 'floor'),
            coalesce((d ->> 'min_purchase_cents')::bigint, 0),
            case when v_period = 'month' then (v_tiers -> 0 ->> 'at')::int else (d ->> 'reward_threshold')::int end,
            case when v_period = 'month' then btrim(v_tiers -> 0 ->> 'level') else btrim(d ->> 'reward_description') end,
            nullif(d ->> 'reward_valid_days', '')::int,
            v_now,
            nullif(d ->> 'valid_to', '')::timestamptz,
            v_locs,
            (select auth.uid())::text,
            v_period, v_tiers,
            nullif(d ->> 'cooldown_hours', '')::int,
            nullif(btrim(coalesce(d ->> 'bonus_label', '')), ''),
            case when nullif(btrim(coalesce(d ->> 'bonus_label', '')), '') is not null
                 then nullif(d ->> 'bonus_units', '')::int end)
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

    insert into public.loyalty_wallet_classes (company_id, program_id, is_demo)
    values (p_company, p_program, v_settings.wallet_use_demo_class)
    on conflict (program_id) do update set state = 'pending', is_demo = excluded.is_demo, updated_at = now();
    insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
    values (p_company, 'wallet.class.sync', jsonb_build_object('program_id', p_program), 'wallet.class:' || p_program)
    on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
    perform public.loyalty_enqueue_wallet(m.id)
       from public.loyalty_members m where m.program_id = p_program and m.status <> 'deleted';

    perform public.loyalty_audit(p_company, 'program.publish', 'loyalty_programs', p_program::text,
                                 jsonb_build_object('version', v_ver.version, 'rule', to_jsonb(v_ver)));
    return to_jsonb(v_ver);
end $$;

-- loyalty_tx_result · de 0003_operaciones.sql, con su retoque de líneas
create or replace function public.loyalty_tx_result(p_tx uuid, p_status text, p_issued integer default 0)
returns jsonb language sql stable as $$
    select jsonb_build_object(
        'status', p_status, 'transaction_id', t.id, 'kind', t.kind, 'units', t.units,
        'amount_cents', t.amount_cents, 'created_at', t.created_at, 'rewards_issued', p_issued,
        'program_id', t.program_id, 'line_member_id', t.member_id,
        'member', public.loyalty_member_card(t.member_id))
      from public.loyalty_transactions t where t.id = p_tx;
$$;

-- loyalty_srv_aviso_datos · de 0013_aviso_premio.sql, con su retoque de líneas
create or replace function public.loyalty_srv_aviso_datos(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
begin
    perform public.loyalty_srv_check();
    select * into m from public.loyalty_members where company_id = p_company and id = p_member;
    -- 0017: una línea (la tienda) avisa en la tarjeta de la persona.
    if found and m.parent_member_id is not null then
        select * into m from public.loyalty_members where id = m.parent_member_id;
    end if;
    if not found or m.status <> 'active' then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object(
        'status', 'ok',
        'negocio', (select s.display_name from public.loyalty_settings s where s.company_id = m.company_id),
        'logo', (select s.logo_url from public.loyalty_settings s where s.company_id = m.company_id),
        'subscriptions', case when public.loyalty_consents_now(m.id, 'push') then
            coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                        from public.loyalty_push_subscriptions s where s.member_id = m.id and s.revoked_at is null), '[]'::jsonb)
            else '[]'::jsonb end,
        'wallet_object_id', (select w.object_id from public.loyalty_wallet_passes w
                              where w.member_id = m.id and w.state <> 'inactive' limit 1));
end $$;

-- La tarjeta de 0016_premio_tipo_en_caja.sql, renombrada: la base de una línea (sin las demás)
create or replace function public.loyalty_member_card_base(p_member uuid)
returns jsonb language sql stable as $$
    select jsonb_build_object(
        'id', m.id, 'public_code', m.public_code, 'alias', m.alias, 'status', m.status,
        'balance', public.loyalty_shown_balance(m, v), 'rewards_available', m.rewards_available,
        'last_op_at', m.last_op_at, 'ops_count', m.ops_count,
        'rule_type', v.rule_type,
        'threshold', (public.loyalty_goal(v, public.loyalty_shown_balance(m, v)) ->> 'threshold')::int,
        'reward_description', public.loyalty_goal(v, public.loyalty_shown_balance(m, v)) ->> 'reward',
        'period', coalesce(v.period, 'none'), 'tiers', v.tiers, 'cooldown_hours', v.cooldown_hours,
        'bonus_label', v.bonus_label, 'bonus_units', v.bonus_units,
        'verified_contact', exists (select 1 from public.loyalty_contacts c
                                     where c.member_id = m.id and c.verified_at is not null),
        'rewards', coalesce((select jsonb_agg(jsonb_build_object(
                        'id', r.id, 'description', r.description, 'expires_at', r.expires_at, 'part', r.tier_part)
                        order by r.issued_at)
                     from public.loyalty_rewards r
                    where r.member_id = m.id and r.status = 'available'
                      and (r.expires_at is null or r.expires_at > now())), '[]'::jsonb))
      from public.loyalty_members m
      left join public.loyalty_programs p on p.id = m.program_id
      left join public.loyalty_program_versions v on v.id = p.current_version_id
     where m.id = p_member;
$$;

-- ── La tarjeta es siempre la de la persona ───────────────────────────────────
-- Pedida con el miembro de una línea, devuelve la de la persona: lo que la caja
-- enseña después de «+ Compra» es la tarjeta entera, con sus dos contadores.
create or replace function public.loyalty_member_card(p_member uuid)
returns jsonb language plpgsql stable as $$
declare v_root uuid;
begin
    select coalesce(m.parent_member_id, m.id) into v_root from public.loyalty_members m where m.id = p_member;
    if v_root is null then return null; end if;
    return public.loyalty_member_card_base(v_root) || jsonb_build_object('lines', public.loyalty_lines_of(v_root));
end $$;

-- ── El miembro de la persona en una línea (se crea la primera vez) ──────────
-- La caja llama aquí antes de registrar en una línea que no es la principal.
-- Con la persona bloqueada: dos cajas a la vez no crean dos miembros de línea.
create or replace function public.loyalty_line_member(p_company text, p_member uuid, p_program uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
    r public.loyalty_members;
    p public.loyalty_programs;
    v_id uuid;
    x jsonb;
begin
    perform public.loyalty_require(p_company, 'ops.record');
    select * into r from public.loyalty_members where company_id = p_company and id = p_member;
    if not found then perform public.loyalty_err('member_not_found'); end if;
    if r.parent_member_id is not null then
        p_member := r.parent_member_id;
    end if;
    select * into r from public.loyalty_members where company_id = p_company and id = p_member for update;
    if r.status <> 'active' then perform public.loyalty_err('member_inactive'); end if;
    if p_program is null or p_program = r.program_id then return r.id; end if;

    select * into p from public.loyalty_programs
     where company_id = p_company and id = p_program and parent_program_id = r.program_id;
    if not found then perform public.loyalty_err('line_not_found'); end if;
    if p.status <> 'active' then perform public.loyalty_err('program_not_active'); end if;

    select id into v_id from public.loyalty_members where parent_member_id = r.id and program_id = p.id;
    if v_id is not null then return v_id; end if;

    -- Sin alias ni contacto: los datos personales se quedan en la persona.
    x := public.loyalty_insert_member(p_company, p.id, null, 'caja', null, null);
    v_id := (x ->> 'member_id')::uuid;
    update public.loyalty_members set parent_member_id = r.id where id = v_id;
    perform public.loyalty_audit(p_company, 'member.line', 'loyalty_members', v_id::text,
                                 jsonb_build_object('person', r.id, 'program', p.id));
    return v_id;
end $$;

-- ── Convertir un programa en línea de otro (o devolverlo a principal) ────────
-- Solo si aún no tiene clientes: cambiar de dueño una cartilla a medias no.
create or replace function public.loyalty_program_line(p_company text, p_program uuid, p_parent uuid, p_label text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    p public.loyalty_programs;
    pa public.loyalty_programs;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    select * into p from public.loyalty_programs where company_id = p_company and id = p_program for update;
    if not found then perform public.loyalty_err('not_found'); end if;
    if p_parent is not null then
        select * into pa from public.loyalty_programs where company_id = p_company and id = p_parent;
        if not found or pa.parent_program_id is not null or pa.id = p.id then
            perform public.loyalty_err('invalid_line', 'parent');
        end if;
        if exists (select 1 from public.loyalty_programs c where c.parent_program_id = p.id) then
            perform public.loyalty_err('invalid_line', 'has_lines');
        end if;
    end if;
    if p.parent_program_id is distinct from p_parent
       and exists (select 1 from public.loyalty_members m where m.program_id = p.id) then
        perform public.loyalty_err('line_has_members');
    end if;
    begin
        update public.loyalty_programs
           set parent_program_id = p_parent, line_label = nullif(btrim(coalesce(p_label, '')), ''), updated_at = now()
         where id = p.id
         returning * into p;
    exception
        when unique_violation then
            if sqlerrm like '%ux_loyalty_programs_linea%' then perform public.loyalty_err('line_label_taken'); end if;
            perform public.loyalty_err('another_program_live');
        when check_violation then perform public.loyalty_err('invalid_line', sqlerrm);
    end;
    perform public.loyalty_audit(p_company, 'program.line', 'loyalty_programs', p.id::text,
                                 jsonb_build_object('parent', p_parent, 'label', p.line_label));
    return to_jsonb(p);
end $$;

-- ── La persona y sus líneas van juntas ───────────────────────────────────────
--   · Lo que pasa en una línea mueve la «última vez» de la persona (campañas de
--     «hace tiempo que no vienes», filtros de Clientes) y actualiza su Wallet.
--   · Suspender o borrar a la persona suspende o borra sus líneas.
create or replace function public.loyalty_members_lineas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.parent_member_id is not null then
        if new.last_op_at is not null and new.last_op_at is distinct from old.last_op_at then
            update public.loyalty_members r
               set last_op_at = greatest(coalesce(r.last_op_at, new.last_op_at), new.last_op_at),
                   first_op_at = coalesce(r.first_op_at, new.first_op_at, new.last_op_at)
             where r.id = new.parent_member_id;
        end if;
        if (new.balance, new.rewards_available) is distinct from (old.balance, old.rewards_available) then
            perform public.loyalty_enqueue_wallet(new.parent_member_id);
        end if;
    elsif new.status is distinct from old.status then
        update public.loyalty_members s
           set status = new.status, suspended_at = new.suspended_at, deleted_at = new.deleted_at, updated_at = now()
         where s.parent_member_id = new.id and s.status is distinct from new.status;
    end if;
    return null;
end $$;

drop trigger if exists tr_loyalty_members_lineas on public.loyalty_members;
create trigger tr_loyalty_members_lineas
    after update on public.loyalty_members
    for each row execute function public.loyalty_members_lineas();

-- ── Quién puede llamar a qué ─────────────────────────────────────────────────
revoke execute on function
    public.loyalty_line_json(public.loyalty_programs, public.loyalty_program_versions, public.loyalty_members),
    public.loyalty_lines_of(uuid),
    public.loyalty_lines_public(uuid),
    public.loyalty_member_card_base(uuid),
    public.loyalty_member_card(uuid),
    public.loyalty_members_lineas(),
    public.loyalty_line_member(text, uuid, uuid),
    public.loyalty_program_line(text, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function
    public.loyalty_line_member(text, uuid, uuid),
    public.loyalty_program_line(text, uuid, uuid, text)
to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASO 2 DE 5 · Añadir la línea «Compra» al Club Kallpa
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
    -- ▼▼▼ RELLENA LO QUE FALTA ▼▼▼
    v_email        text := 'luispelaez42a@gmail.com';
    v_clave        text := '';   -- SOLO si la cuenta no existe: 8 caracteres o más. Pásasela tú.
    v_modo         text := 'vincular';   -- 'vincular' o 'traspasar' (ver arriba)
    v_dias_premio  integer := 45;
    -- ▲▲▲ RELLENA LO QUE FALTA ▲▲▲

    v_negocio constant text := 'kallpa';
    v_user     uuid;
    v_slug     text;
    v_prog     uuid;
    v_linea    uuid;
    v_rol      text;
    v_dueno    text;
    v_vivo     public.loyalty_programs;
begin
    if v_modo not in ('vincular', 'traspasar') then
        raise exception 'v_modo tiene que ser ''vincular'' o ''traspasar''.';
    end if;
    -- ── Comprobaciones ───────────────────────────────────────────────────────
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_program_versions' and column_name = 'tiers') then
        raise exception 'Falta la migración 0015 (modules/fideliza/sql/0015_niveles_del_mes.sql). Córrela antes.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_programs' and column_name = 'parent_program_id') then
        raise exception 'Falta la migración 0017 (modules/fideliza/sql/0017_una_tarjeta_varias_lineas.sql). Córrela antes.';
    end if;
    if not exists (select 1 from public.companies where id = v_negocio) then
        raise exception 'No existe el negocio «kallpa».';
    end if;
    select * into v_vivo from public.loyalty_programs
     where company_id = v_negocio and status in ('active', 'paused') and parent_program_id is null;
    if v_vivo.id is not null and v_vivo.name <> 'Club Kallpa' then
        raise exception 'kallpa ya tiene otro club vivo («%»). No se pisa: revísalo en el panel (Fideliza → Programa).', v_vivo.name;
    end if;

    -- ── 1 · La cuenta ────────────────────────────────────────────────────────
    select id into v_user from auth.users where lower(email) = lower(btrim(v_email));
    if v_user is null then
        if length(v_clave) < 8 then
            raise exception 'No hay cuenta con «%». Pon una contraseña de 8+ caracteres en v_clave (o que entre una vez con Google y vuelve a correr esto).', v_email;
        end if;
        v_user := gen_random_uuid();
        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            -- Vacíos y no null: con null, GoTrue falla al iniciar sesión.
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (
            '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', lower(btrim(v_email)),
            extensions.crypt(v_clave, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
            '', '', '', '', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text,
                jsonb_build_object('sub', v_user::text, 'email', lower(btrim(v_email)), 'email_verified', true),
                'email', now(), now(), now());
        raise notice 'Cuenta creada: % (con la contraseña de v_clave).', v_email;
    end if;

    -- ── 2 · Acceso a kallpa (el negocio del bot, ya con dueño) ──────────────
    select auth_user_id into v_dueno from public.memberships where company_id = v_negocio and role = 'owner';
    select role into v_rol from public.memberships where company_id = v_negocio and auth_user_id = v_user::text;

    if v_rol = 'owner' then
        raise notice '% ya es el dueño de kallpa: no se cambia nada.', v_email;
    elsif v_modo = 'traspasar' then
        -- Primero el anterior deja de ser dueño (el índice no admite dos ni un instante).
        if v_dueno is not null then
            update public.memberships set role = 'admin' where company_id = v_negocio and auth_user_id = v_dueno;
            insert into public.loyalty_staff (company_id, auth_user_id, role)
            values (v_negocio, v_dueno, 'manager')
            on conflict (company_id, auth_user_id) do update set role = 'manager', updated_at = now();
        end if;
        if v_rol is null then
            insert into public.memberships (id, auth_user_id, company_id, role)
            values ('m-' || gen_random_uuid(), v_user::text, v_negocio, 'owner');
        else
            update public.memberships set role = 'owner' where company_id = v_negocio and auth_user_id = v_user::text;
        end if;
        delete from public.loyalty_staff where company_id = v_negocio and auth_user_id = v_user::text;
        raise notice 'kallpa traspasada a %. El dueño anterior queda como administrador.', v_email;
    else
        if v_rol is null then
            insert into public.memberships (id, auth_user_id, company_id, role)
            values ('m-' || gen_random_uuid(), v_user::text, v_negocio, 'admin');
        end if;
        -- Sin esta fila un administrador entra en MiaTap como cajero.
        insert into public.loyalty_staff (company_id, auth_user_id, role)
        values (v_negocio, v_user::text, 'manager')
        on conflict (company_id, auth_user_id) do update set role = 'manager', updated_at = now();
        raise notice '% vinculado a kallpa como administrador (gerente en MiaTap).', v_email;
    end if;

    -- ── 3 · El club y sus dos líneas, con las funciones del panel ────────────
    -- Actúa tu papá (dueño o gerente: los dos pueden editar el club).
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

    if not exists (select 1 from public.loyalty_settings where company_id = v_negocio) then
        v_slug := case when exists (select 1 from public.loyalty_settings where slug = 'kallpa') then 'kallpa-club' else 'kallpa' end;
        perform public.loyalty_settings_save(v_negocio, jsonb_build_object(
            'slug', v_slug, 'display_name', 'Kallpa', 'tagline', 'Entrena, suma y gana', 'bg_color', '#0B6E99'));
        perform public.loyalty_page_style_save(v_negocio, jsonb_build_object('plantilla', 'clasica', 'sello', 'pesa', 'tarjeta', 'organica'));
    end if;

    -- Asistencia (principal)
    if v_vivo.id is null then
        v_prog := public.loyalty_program_save(v_negocio, null, 'Club Kallpa',
            'Cada sesión del mes suma; cada compra en la cafetería, también. Una sola tarjeta.', 'frequency',
            jsonb_build_object(
                'rule_type', 'visits', 'period', 'month', 'cooldown_hours', 12,
                'bonus_label', 'Reto del BOX', 'bonus_units', 4,
                'reward_valid_days', v_dias_premio,
                'tiers', jsonb_build_array(
                    jsonb_build_object('at', 12, 'level', '5% de dscto en tu próxima membresía', 'gift', 'Batido proteico', 'gift_count', 1),
                    jsonb_build_object('at', 16, 'level', '10% de dscto en tu próxima membresía', 'gift', 'Batido proteico', 'gift_count', 1),
                    jsonb_build_object('at', 20, 'level', '15% de dscto en tu próxima membresía', 'gift', 'Batido proteico', 'gift_count', 1))));
        perform public.loyalty_program_publish(v_negocio, v_prog);
    else
        v_prog := v_vivo.id;
        raise notice 'kallpa ya tenía el «Club Kallpa»: se reutiliza tal cual.';
    end if;
    perform public.loyalty_program_line(v_negocio, v_prog, null, 'Asistencia');

    -- Compra (línea)
    select id into v_linea from public.loyalty_programs where company_id = v_negocio and parent_program_id = v_prog;
    if v_linea is null then
        v_linea := public.loyalty_program_save(v_negocio, null, 'Club Kallpa · Compra',
            'Cada compra en la cafetería suma un sello. Con 12, un kekito o un batido.', 'repeat',
            jsonb_build_object('rule_type', 'stamps', 'stamps_per_purchase', 1, 'reward_threshold', 12,
                               'reward_description', 'Un kekito o un batido', 'reward_valid_days', v_dias_premio));
        perform public.loyalty_program_line(v_negocio, v_linea, v_prog, 'Compra');
        perform public.loyalty_program_publish(v_negocio, v_linea);
    else
        raise notice 'El club ya tenía una línea: no se añade otra.';
    end if;

    if exists (select 1 from public.companies where id = 'kallpa-tienda') then
        raise notice 'Queda el negocio «kallpa-tienda» de la versión anterior de este script. Ya no hace falta: bórralo con el deshacer del final (si no tiene clientes).';
    end if;

    raise notice 'Listo: kallpa con una tarjeta y dos líneas (Asistencia + Compra). % entra como %.',
        v_email, case when v_modo = 'traspasar' or v_rol = 'owner' then 'dueño' else 'administrador/gerente' end;
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASO 3 DE 5 · Quitar el negocio suelto «kallpa-tienda»
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
    v_tienda constant text := 'kallpa-tienda';
    v_n integer;
begin
    if not exists (select 1 from public.companies where id = v_tienda) then
        raise notice 'No existe «kallpa-tienda»: no hay nada que quitar.';
        return;
    end if;
    select count(*) into v_n from public.loyalty_members where company_id = v_tienda;
    if v_n > 0 then
        raise exception '«kallpa-tienda» ya tiene % tarjeta(s) de clientes. No se borra: avisa para pasar sus sellos a la línea «Compra» de kallpa.', v_n;
    end if;
    -- Que kallpa ya tenga su línea «Compra»: si no, la cafetería se quedaría sin club.
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_programs' and column_name = 'parent_program_id')
       or not exists (select 1 from public.loyalty_programs
                       where company_id = 'kallpa' and parent_program_id is not null and status in ('active', 'paused')) then
        raise exception 'kallpa aún no tiene la línea «Compra». Corre antes la 0017 y scripts/kallpa-clubes-alta.sql.';
    end if;

    -- Lo de MiaTap sin borrado en cascada desde el negocio.
    delete from public.loyalty_wallet_classes where company_id = v_tienda;
    delete from public.loyalty_outbox where company_id = v_tienda;
    delete from public.loyalty_public_events where company_id = v_tienda;
    update public.loyalty_settings set default_profile_id = null where company_id = v_tienda;
    update public.loyalty_programs set current_version_id = null where company_id = v_tienda;
    -- Accesos y el negocio (lo demás de MiaTap cae en cascada: ajustes, club, página, equipo).
    delete from public.memberships where company_id = v_tienda;
    delete from public.companies where id = v_tienda;
    raise notice 'Quitado «kallpa-tienda». La cafetería sigue como la línea «Compra» de kallpa.';
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASO 4 DE 5 · Botones de la página
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
declare
    v_negocio constant text := 'kallpa';
    -- El orden en que salen, debajo de lo que ya haya.
    v_nuevos constant jsonb := jsonb_build_array(
        jsonb_build_object('label', 'Mira nuestros planes', 'kind', 'url', 'icon', 'web',
                           'url', 'https://info.comunidadfortaleza.com/#bunker'),
        jsonb_build_object('label', 'Reserva tus kekitos', 'kind', 'url', 'icon', 'carta',
                           'url', 'https://reserva.comunidadfortaleza.com/reservar'),
        jsonb_build_object('label', 'Nuestra tienda virtual', 'kind', 'url', 'icon', 'enlace',
                           'url', 'https://kallpita.store/'),
        jsonb_build_object('label', 'Paga con Yape o Plin', 'kind', 'url', 'icon', 'yape',
                           'subtitle', '+51 955 882 306',
                           'url', 'https://fideliza.vendemias.com/pagar/955882306'));
    v_actor   text;
    v_perfil  uuid;
    v_nombre  text;
    v_links   jsonb;
    n         jsonb;
    v_pub     jsonb;
begin
    if not exists (select 1 from public.loyalty_settings where company_id = v_negocio) then
        raise exception 'kallpa aún no tiene MiaTap. Corre antes scripts/kallpa-clubes-alta.sql.';
    end if;

    -- Actúa el dueño de kallpa, como si lo hiciera desde el panel.
    select auth_user_id into v_actor from public.memberships where company_id = v_negocio and role = 'owner';
    if v_actor is null then raise exception 'kallpa no tiene dueño en memberships.'; end if;
    perform set_config('request.jwt.claim.sub', v_actor, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

    -- La página que se ve (la de por defecto) y sus botones actuales, en su orden.
    select s.default_profile_id, coalesce(s.display_name, 'Kallpa') into v_perfil, v_nombre
      from public.loyalty_settings s where s.company_id = v_negocio;
    select coalesce(jsonb_agg(jsonb_build_object(
               'label', l.label, 'kind', l.kind, 'url', l.url, 'is_active', l.is_active, 'is_primary', l.is_primary,
               'starts_at', l.starts_at, 'ends_at', l.ends_at, 'icon', l.icon, 'subtitle', l.subtitle,
               'placement', l.placement) order by l.position), '[]'::jsonb)
      into v_links
      from public.loyalty_links l where l.profile_id = v_perfil;

    if not exists (select 1 from jsonb_array_elements(v_links) x where x ->> 'kind' = 'join') then
        v_links := jsonb_build_array(jsonb_build_object(
            'label', 'Únete al Club Kallpa', 'kind', 'join', 'icon', 'tarjeta', 'is_primary', true)) || v_links;
    end if;
    for n in select * from jsonb_array_elements(v_nuevos) loop
        if exists (select 1 from jsonb_array_elements(v_links) x where x ->> 'url' = n ->> 'url') then
            raise notice 'Ya estaba: %', n ->> 'label';
        else
            v_links := v_links || jsonb_build_array(n);
        end if;
    end loop;

    v_perfil := public.loyalty_profile_save(
        v_negocio, v_perfil,
        case when v_perfil is null then 'Página principal' end,
        case when v_perfil is null then v_nombre end,
        null, v_links, true);
    v_pub := public.loyalty_profile_publish(v_negocio, v_perfil, false);
    raise notice 'Publicada la versión % de la página de kallpa con % botones.', v_pub ->> 'version', jsonb_array_length(v_links);
end $$;

commit;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PASO 5 DE 5 · La ficha del cliente con todas sus líneas (0018)
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

do $$
begin
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_members' and column_name = 'parent_member_id') then
        raise exception 'Falta la 0017 (una tarjeta, varias líneas): córrela antes que esta.';
    end if;
end $$;

create or replace function public.loyalty_member_detail(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    v_contacts boolean;
    v_ids uuid[];
begin
    perform public.loyalty_require(p_company, 'members.read');
    select * into m from public.loyalty_members where company_id = p_company and id = p_member;
    -- 0018: la ficha es la de la persona aunque se pida con el miembro de una línea.
    if found and m.parent_member_id is not null then
        select * into m from public.loyalty_members where id = m.parent_member_id;
    end if;
    if not found or m.status = 'deleted' and not public.loyalty_can(p_company, 'members.manage') then
        perform public.loyalty_err('not_found');
    end if;
    v_contacts := public.loyalty_can(p_company, 'contacts.read');
    -- La persona y sus miembros de línea: el historial es el de toda la tarjeta.
    v_ids := array_prepend(m.id, array(select s.id from public.loyalty_members s where s.parent_member_id = m.id));
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
              from (select t.*, l.name as location_name,
                           coalesce(p.line_label, p.name) as line_label, p.parent_program_id is null as line_main
                      from public.loyalty_transactions t
                      join public.loyalty_programs p on p.id = t.program_id
                      left join public.loyalty_locations l on l.id = t.location_id
                     where t.member_id = any (v_ids) order by t.created_at desc limit 60) t), '[]'::jsonb),
        'ledger', coalesce((
            select jsonb_agg(to_jsonb(l) order by l.id desc)
              from (select x.*, coalesce(p.line_label, p.name) as line_label, p.parent_program_id is null as line_main
                      from public.loyalty_ledger x join public.loyalty_programs p on p.id = x.program_id
                     where x.member_id = any (v_ids) order by x.id desc limit 60) l), '[]'::jsonb),
        'all_rewards', coalesce((
            select jsonb_agg(to_jsonb(r) order by r.issued_at desc)
              from (select x.*, coalesce(p.line_label, p.name) as line_label, p.parent_program_id is null as line_main
                      from public.loyalty_rewards x join public.loyalty_programs p on p.id = x.program_id
                     where x.member_id = any (v_ids) order by x.issued_at desc limit 40) r), '[]'::jsonb),
        'wallet', (select to_jsonb(w) - 'object_id' from public.loyalty_wallet_passes w where w.member_id = m.id));
end $$;

commit;

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPROBACIÓN: debe salir kallpa con sus dos líneas y los 5 botones.
-- ═══════════════════════════════════════════════════════════════════════════════
select que, nombre, detalle from (
select 1 as o1, (p.parent_program_id is not null)::int as o2, 'línea' as que, coalesce(p.line_label, p.name) as nombre,
       v.rule_type || ' · meta ' || coalesce(v.reward_threshold::text, '-') as detalle
  from public.loyalty_programs p
  join public.loyalty_program_versions v on v.id = p.current_version_id
 where p.company_id = 'kallpa' and p.status in ('active', 'paused')
union all
select 2, l.position, 'botón', l.label, l.url
  from public.loyalty_settings s
  join public.loyalty_links l on l.profile_id = s.default_profile_id
 where s.company_id = 'kallpa'
union all
select 3, 0, '¿sigue kallpa-tienda?', case when exists (select 1 from public.companies where id = 'kallpa-tienda') then 'SÍ (algo falló)' else 'no, bien' end, null
) x order by o1, o2;
