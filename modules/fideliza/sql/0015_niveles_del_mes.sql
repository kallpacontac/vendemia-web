-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0015 · Niveles del mes, espera entre sesiones y bono
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Alvaro el 12-nov-2026 para Kallpa (gimnasio y natación). Las reglas del
-- dueño:
--   · 12 sesiones en el mes → 5 % en la próxima membresía + 1 batido proteico
--   · 16 → 10 % + 2 batidos        · 20 → 15 % + 3 batidos
--   · Superar un reto del BOX suma 4.
--   · Entre una sesión y la siguiente, al menos 12 horas.
--
-- Tres piezas, las tres OPCIONALES por versión del programa (lo de antes no cambia):
--
-- 1 · NIVELES DEL MES (period = 'month', tiers = [...]).
--     El saldo cuenta las unidades DEL MES (hora de Lima) y vuelve a 0 el día 1.
--     Los niveles NO consumen el saldo (a diferencia del premio de siempre):
--       · «level»: el beneficio del nivel (p. ej. «10 % en tu próxima membresía»).
--         Solo vale el nivel MÁS ALTO del mes: al subir, el de abajo sin canjear se
--         revoca y se emite el nuevo.
--       · «gift»: regalos que se SUMAN al cruzar cada nivel (gift_count). Con
--         1 + 1 + 1 el que llega a 20 tiene 3 batidos, como pidió el dueño.
--     Si el saldo baja («Deshacer»), lo que estaba por encima y sin canjear se
--     revoca. Lo ya canjeado no se toca.
--     El reinicio del mes deja una línea `period_reset` en el libro: el saldo sigue
--     siendo la suma del libro y loyalty_reconcile no ve diferencias.
--
-- 2 · ESPERA (cooldown_hours). Una compra/visita no suma si la anterior que NO
--     se deshizo fue hace menos de esas horas. Error `cooldown` con la hora en que
--     vuelve a poder. Los ajustes y el bono no cuentan ni esperan.
--
-- 3 · BONO (bonus_label + bonus_units): un botón en la caja («Reto del BOX +4»)
--     que puede dar el cajero. Es un `adjustment` con ese motivo.
--
-- Se hace con un trigger en loyalty_transactions (reinicio del mes, espera y no
-- deshacer meses cerrados) para no reescribir loyalty_record ni loyalty_refund.
-- Se redefinen: loyalty_issue_rewards (rama de niveles), loyalty_member_card,
-- loyalty_srv_card y loyalty_srv_wallet_object_data (meta y premio del SIGUIENTE
-- nivel, saldo del mes) y loyalty_program_publish (lee los campos nuevos).
--
-- Idempotente. Deshacer: scripts/fideliza-0015-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── Niveles bien formados ─────────────────────────────────────────────────────
-- [{at, level, gift?, gift_count?}], de 1 a 6, con «at» estrictamente creciente.
create or replace function public.loyalty_tiers_ok(p jsonb)
returns boolean language plpgsql immutable as $$
declare
    t jsonb;
    v_prev integer := 0;
    v_at integer;
begin
    if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) not between 1 and 6 then return false; end if;
    for t in select * from jsonb_array_elements(p) loop
        if jsonb_typeof(t) <> 'object' or jsonb_typeof(t -> 'at') <> 'number' then return false; end if;
        v_at := (t ->> 'at')::numeric;
        if v_at::numeric <> (t ->> 'at')::numeric or v_at <= v_prev or v_at > 1000 then return false; end if;
        if char_length(btrim(coalesce(t ->> 'level', ''))) not between 1 and 80 then return false; end if;
        if char_length(coalesce(t ->> 'gift', '')) > 60 then return false; end if;
        if coalesce((t ->> 'gift_count')::numeric, 0) not between 0 and 10 then return false; end if;
        if coalesce((t ->> 'gift_count')::numeric, 0) > 0 and btrim(coalesce(t ->> 'gift', '')) = '' then return false; end if;
        v_prev := v_at;
    end loop;
    return true;
exception when others then
    return false;
end $$;

-- ── Columnas ─────────────────────────────────────────────────────────────────
alter table public.loyalty_program_versions
    add column if not exists period          text not null default 'none',
    add column if not exists tiers           jsonb,
    add column if not exists cooldown_hours  integer,
    add column if not exists bonus_label     text,
    add column if not exists bonus_units     integer;

alter table public.loyalty_program_versions drop constraint if exists loyalty_versions_period_ck;
alter table public.loyalty_program_versions add constraint loyalty_versions_period_ck check (
    (period = 'none' and tiers is null)
    or (period = 'month' and rule_type in ('visits', 'stamps') and public.loyalty_tiers_ok(tiers)));
alter table public.loyalty_program_versions drop constraint if exists loyalty_versions_cooldown_ck;
alter table public.loyalty_program_versions add constraint loyalty_versions_cooldown_ck check (
    cooldown_hours is null or cooldown_hours between 1 and 168);
alter table public.loyalty_program_versions drop constraint if exists loyalty_versions_bonus_ck;
alter table public.loyalty_program_versions add constraint loyalty_versions_bonus_ck check (
    (bonus_label is null and bonus_units is null)
    or (char_length(btrim(bonus_label)) between 2 and 40 and bonus_units between 1 and 100));

-- Desde qué mes cuenta el saldo del miembro (programas por mes).
alter table public.loyalty_members add column if not exists period_start date;

-- De qué mes y nivel salió cada premio (null en los de siempre).
alter table public.loyalty_rewards
    add column if not exists period_start date,
    add column if not exists tier_at      integer,
    add column if not exists tier_part    text;
alter table public.loyalty_rewards drop constraint if exists loyalty_rewards_tier_part_ck;
alter table public.loyalty_rewards add constraint loyalty_rewards_tier_part_ck check (
    tier_part is null or tier_part in ('level', 'gift'));
create index if not exists ix_loyalty_rewards_period
    on public.loyalty_rewards (member_id, period_start, tier_at) where period_start is not null;

-- El libro admite la línea de reinicio del mes.
alter table public.loyalty_ledger drop constraint if exists loyalty_ledger_kind_check;
alter table public.loyalty_ledger add constraint loyalty_ledger_kind_check check (
    kind in ('earn', 'reverse', 'reward_issue', 'reward_revoke', 'adjust', 'period_reset'));

-- ── Ayudantes ────────────────────────────────────────────────────────────────
-- Primer día del mes en Lima, y ese instante como timestamptz.
create or replace function public.loyalty_month_start(p timestamptz default now())
returns date language sql stable as $$
    select date_trunc('month', p at time zone 'America/Lima')::date;
$$;
create or replace function public.loyalty_month_start_ts(p timestamptz default now())
returns timestamptz language sql stable as $$
    select public.loyalty_month_start(p)::timestamp at time zone 'America/Lima';
$$;

-- Saldo que se ENSEÑA: en un programa por mes, si el miembro no ha venido aún
-- este mes, 0 (el cron lo pone a 0 en el libro; esto cubre las horas de antes).
create or replace function public.loyalty_shown_balance(m public.loyalty_members, v public.loyalty_program_versions)
returns integer language sql stable as $$
    select case when v.period = 'month' and (m.period_start is null or m.period_start < public.loyalty_month_start())
                then 0 else m.balance end;
$$;

-- Meta y premio que se enseñan: el SIGUIENTE nivel (o el último, si ya llegó).
create or replace function public.loyalty_goal(v public.loyalty_program_versions, p_balance integer)
returns jsonb language sql stable as $$
    select case
        when v.id is null then jsonb_build_object('threshold', null, 'reward', null)
        when v.period = 'month' then coalesce(
            (select jsonb_build_object('threshold', (t ->> 'at')::int, 'reward', t ->> 'level')
               from jsonb_array_elements(v.tiers) with ordinality x(t, i)
              where (t ->> 'at')::int > p_balance order by i limit 1),
            (select jsonb_build_object('threshold', (t ->> 'at')::int, 'reward', t ->> 'level')
               from jsonb_array_elements(v.tiers) with ordinality x(t, i) order by i desc limit 1))
        else jsonb_build_object('threshold', v.reward_threshold, 'reward', v.reward_description)
    end;
$$;

-- Reinicia el saldo si cambió el mes. Quien llama tiene el miembro bloqueado.
create or replace function public.loyalty_period_roll(p_member uuid, v public.loyalty_program_versions)
returns void language plpgsql as $$
declare
    m public.loyalty_members;
    v_inicio date := public.loyalty_month_start();
begin
    if v.id is null or v.period <> 'month' then return; end if;
    select * into m from public.loyalty_members where id = p_member;
    if m.id is null or m.period_start is not distinct from v_inicio then return; end if;
    if m.balance <> 0 then
        perform public.loyalty_move(m, -m.balance, 'period_reset');
        perform public.loyalty_enqueue_wallet(m.id);
    end if;
    update public.loyalty_members set period_start = v_inicio, updated_at = now() where id = m.id;
end $$;

-- Deja los premios del mes en línea con el saldo. Idempotente: se puede llamar
-- las veces que haga falta. Devuelve cuántos premios NUEVOS emitió.
create or replace function public.loyalty_tiers_sync(p_member uuid, v public.loyalty_program_versions, p_tx uuid)
returns integer language plpgsql as $$
declare
    m public.loyalty_members;
    t jsonb;
    r record;
    v_at integer;
    v_gifts integer;
    v_have integer;
    v_top integer;
    v_top_level text;
    v_inicio date := public.loyalty_month_start();
    v_exp timestamptz := case when v.reward_valid_days is not null then now() + make_interval(days => v.reward_valid_days) end;
    n integer := 0;
begin
    if v.id is null or v.period <> 'month' then return 0; end if;
    select * into m from public.loyalty_members where id = p_member;

    -- 1 · El saldo bajó: fuera lo de los niveles que ya no alcanza (si no se canjeó).
    for r in select x.id from public.loyalty_rewards x
              where x.member_id = m.id and x.period_start = v_inicio and x.status = 'available'
                and x.tier_at > m.balance for update loop
        update public.loyalty_rewards set status = 'revoked', revoked_at = now() where id = r.id;
        update public.loyalty_members set rewards_available = greatest(rewards_available - 1, 0) where id = m.id;
    end loop;

    -- 2 · Los regalos de cada nivel alcanzado (se suman).
    for t in select x.t from jsonb_array_elements(v.tiers) with ordinality x(t, i) order by x.i loop
        v_at := (t ->> 'at')::int;
        exit when v_at > m.balance;
        v_top := v_at;
        v_top_level := btrim(t ->> 'level');
        v_gifts := coalesce((t ->> 'gift_count')::int, 0);
        if v_gifts > 0 then
            select count(*) into v_have from public.loyalty_rewards x
             where x.member_id = m.id and x.period_start = v_inicio and x.tier_at = v_at
               and x.tier_part = 'gift' and x.status <> 'revoked';
            while v_have < v_gifts loop
                insert into public.loyalty_rewards (company_id, member_id, program_id, version_id, description, threshold,
                                                    expires_at, source_transaction_id, period_start, tier_at, tier_part)
                values (m.company_id, m.id, m.program_id, v.id, btrim(t ->> 'gift'), v_at,
                        v_exp, p_tx, v_inicio, v_at, 'gift');
                update public.loyalty_members set rewards_available = rewards_available + 1 where id = m.id;
                v_have := v_have + 1;
                n := n + 1;
            end loop;
        end if;
    end loop;

    -- 3 · El beneficio: solo el del nivel más alto del mes.
    if v_top is not null then
        for r in select x.id from public.loyalty_rewards x
                  where x.member_id = m.id and x.period_start = v_inicio and x.tier_part = 'level'
                    and x.status = 'available' and x.tier_at <> v_top for update loop
            update public.loyalty_rewards set status = 'revoked', revoked_at = now() where id = r.id;
            update public.loyalty_members set rewards_available = greatest(rewards_available - 1, 0) where id = m.id;
        end loop;
        if not exists (select 1 from public.loyalty_rewards x
                        where x.member_id = m.id and x.period_start = v_inicio and x.tier_part = 'level'
                          and x.tier_at = v_top and x.status <> 'revoked') then
            insert into public.loyalty_rewards (company_id, member_id, program_id, version_id, description, threshold,
                                                expires_at, source_transaction_id, period_start, tier_at, tier_part)
            values (m.company_id, m.id, m.program_id, v.id, v_top_level, v_top,
                    v_exp, p_tx, v_inicio, v_top, 'level');
            update public.loyalty_members set rewards_available = rewards_available + 1 where id = m.id;
            n := n + 1;
        end if;
    end if;

    if n > 0 then perform public.loyalty_enqueue_template_push(m, 'reward_available'); end if;
    return n;
end $$;

-- ── El premio de siempre, o los niveles ──────────────────────────────────────
create or replace function public.loyalty_issue_rewards(p_member uuid, v public.loyalty_program_versions, p_tx uuid)
returns integer language plpgsql as $$
declare
    m public.loyalty_members;
    v_reward uuid;
    n integer := 0;
begin
    if v.period = 'month' then return public.loyalty_tiers_sync(p_member, v, p_tx); end if;
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

-- ── El trigger: mes, espera y meses cerrados ─────────────────────────────────
-- Corre DENTRO de loyalty_record / loyalty_refund / loyalty_adjust, con el miembro
-- ya bloqueado por ellas, antes de que muevan el saldo.
create or replace function public.loyalty_tx_reglas()
returns trigger language plpgsql as $$
declare
    v public.loyalty_program_versions;
    o public.loyalty_transactions;
    v_last timestamptz;
begin
    if new.version_id is not null then
        select * into v from public.loyalty_program_versions where id = new.version_id;
    else
        v := public.loyalty_current_version(new.program_id);
    end if;
    if v.id is null then return new; end if;

    if v.period = 'month' then
        -- Una sesión de un mes ya cerrado no se deshace: su saldo ya volvió a 0.
        if new.kind = 'refund' and new.reverses_id is not null then
            select * into o from public.loyalty_transactions where id = new.reverses_id;
            if o.created_at < public.loyalty_month_start_ts() then
                perform public.loyalty_err('period_closed');
            end if;
        end if;
        perform public.loyalty_period_roll(new.member_id, v);
    end if;

    if v.cooldown_hours is not null and new.kind in ('purchase', 'visit') then
        select t.created_at into v_last from public.loyalty_transactions t
         where t.member_id = new.member_id and t.kind in ('purchase', 'visit')
           and t.created_at > now() - make_interval(hours => v.cooldown_hours)
           and not exists (select 1 from public.loyalty_transactions x
                            where x.reverses_id = t.id and x.kind = 'refund')
         order by t.created_at desc limit 1;
        if v_last is not null then
            perform public.loyalty_err('cooldown',
                to_char((v_last + make_interval(hours => v.cooldown_hours)) at time zone 'America/Lima', 'DD/MM HH24:MI'));
        end if;
    end if;
    return new;
end $$;

drop trigger if exists tr_loyalty_tx_reglas on public.loyalty_transactions;
create trigger tr_loyalty_tx_reglas
    before insert on public.loyalty_transactions
    for each row execute function public.loyalty_tx_reglas();

-- Tras una devolución el saldo baja: los niveles se recolocan. (La compra y el
-- ajuste ya lo hacen por loyalty_issue_rewards, que además cuenta lo emitido.)
create or replace function public.loyalty_ledger_niveles()
returns trigger language plpgsql as $$
declare
    p public.loyalty_programs;
    v public.loyalty_program_versions;
begin
    select * into p from public.loyalty_programs where id = new.program_id;
    if p.current_version_id is null then return null; end if;
    select * into v from public.loyalty_program_versions where id = p.current_version_id;
    if v.period = 'month' then perform public.loyalty_tiers_sync(new.member_id, v, new.transaction_id); end if;
    return null;
end $$;

drop trigger if exists tr_loyalty_ledger_niveles on public.loyalty_ledger;
create trigger tr_loyalty_ledger_niveles
    after insert on public.loyalty_ledger
    for each row when (new.kind in ('reverse', 'adjust') and new.units < 0)
    execute function public.loyalty_ledger_niveles();

-- ── El bono («Reto del BOX +4») ──────────────────────────────────────────────
-- Lo puede dar quien registra operaciones (el cajero también). Sin bono en la
-- regla vigente → no_bonus.
create or replace function public.loyalty_bonus(p_company text, p_member uuid, p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
    p public.loyalty_programs;
    v public.loyalty_program_versions;
    v_tx public.loyalty_transactions;
    v_hash text := md5(concat_ws('|', 'bonus', p_member));
    v_issued integer;
begin
    perform public.loyalty_require(p_company, 'ops.record');
    select * into v_tx from public.loyalty_transactions where company_id = p_company and idempotency_key = p_idempotency_key;
    if found then
        if v_tx.request_hash <> v_hash then perform public.loyalty_err('idempotency_conflict'); end if;
        return public.loyalty_tx_result(v_tx.id, 'replayed');
    end if;
    select * into m from public.loyalty_members where company_id = p_company and id = p_member for update;
    if not found then perform public.loyalty_err('member_not_found'); end if;
    if m.status <> 'active' then perform public.loyalty_err('member_inactive'); end if;
    select * into p from public.loyalty_programs where id = m.program_id;
    if p.status <> 'active' then perform public.loyalty_err('program_not_active'); end if;
    v := public.loyalty_current_version(p.id);
    if v.id is null then perform public.loyalty_err('program_expired'); end if;
    if v.bonus_units is null then perform public.loyalty_err('no_bonus'); end if;

    insert into public.loyalty_transactions (company_id, program_id, version_id, member_id, kind, source,
                                             idempotency_key, request_hash, units, reason, staff_user_id)
    values (p_company, p.id, v.id, m.id, 'adjustment', 'caja', p_idempotency_key, v_hash, v.bonus_units,
            btrim(v.bonus_label), (select auth.uid())::text)
    returning * into v_tx;
    perform public.loyalty_move(m, v.bonus_units, 'adjust', v_tx.id);
    update public.loyalty_members set last_op_at = v_tx.created_at, updated_at = now() where id = m.id;
    v_issued := public.loyalty_issue_rewards(m.id, v, v_tx.id);
    perform public.loyalty_enqueue_wallet(m.id);
    perform public.loyalty_audit(p_company, 'tx.bonus', 'loyalty_transactions', v_tx.id::text,
                                 jsonb_build_object('units', v.bonus_units, 'label', v.bonus_label));
    return public.loyalty_tx_result(v_tx.id, 'created', v_issued);
end $$;

-- ── El cron: pone a 0 el saldo de quien no ha venido este mes ────────────────
create or replace function public.loyalty_srv_period_roll()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    r record;
    n integer := 0;
begin
    perform public.loyalty_srv_check();
    for r in
        select m.id, v as ver
          from public.loyalty_members m
          join public.loyalty_programs p on p.id = m.program_id and p.status in ('active', 'paused')
          join public.loyalty_program_versions v on v.id = p.current_version_id and v.period = 'month'
         where m.status <> 'deleted'
           and (m.period_start is null or m.period_start < public.loyalty_month_start())
         limit 5000
    loop
        perform 1 from public.loyalty_members where id = r.id for update;
        perform public.loyalty_period_roll(r.id, r.ver);
        n := n + 1;
    end loop;
    return jsonb_build_object('rolled', n);
end $$;

-- ── Lo que se enseña: saldo del mes y el siguiente nivel ─────────────────────
create or replace function public.loyalty_member_card(p_member uuid)
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
        -- `part` (también en 0016): 'level' | 'gift' | null. Volver a correr 0015 no lo quita.
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
        'pass', to_jsonb(w), 'class', to_jsonb(c),
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

-- ── Publicar lee los campos nuevos ───────────────────────────────────────────
-- Igual que en 0003, más period / tiers / cooldown_hours / bonus_*. Con niveles,
-- reward_threshold y reward_description (obligatorias) se toman del PRIMER nivel.
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
                  and o.status in ('active', 'paused')) then
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

-- ── Quién puede llamar a qué ─────────────────────────────────────────────────
revoke execute on function
    public.loyalty_tiers_ok(jsonb),
    public.loyalty_month_start(timestamptz),
    public.loyalty_month_start_ts(timestamptz),
    public.loyalty_shown_balance(public.loyalty_members, public.loyalty_program_versions),
    public.loyalty_goal(public.loyalty_program_versions, integer),
    public.loyalty_period_roll(uuid, public.loyalty_program_versions),
    public.loyalty_tiers_sync(uuid, public.loyalty_program_versions, uuid),
    public.loyalty_tx_reglas(),
    public.loyalty_ledger_niveles(),
    public.loyalty_bonus(text, uuid, text),
    public.loyalty_srv_period_roll()
from public, anon, authenticated;
grant execute on function public.loyalty_bonus(text, uuid, text) to authenticated;
grant execute on function public.loyalty_srv_period_roll() to anon;

commit;

notify pgrst, 'reload schema';
