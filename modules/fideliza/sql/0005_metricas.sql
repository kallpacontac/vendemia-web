-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0005 · Métricas
--
-- Todas las cifras salen de aquí; el panel no calcula ni redondea porcentajes
-- por su cuenta. Cada una tiene su definición escrita en modules/fideliza/dominio/metricas.ts
-- (lo que mide, de dónde sale y qué no dice).
--
-- Repetición a N días: solo cuenta la COHORTE MADURA — miembros cuya primera
-- operación fue hace al menos N días. Un miembro de hace una semana no puede
-- haber «vuelto a los 30 días» todavía, y meterlo bajaría la cifra a mentira.
-- ═══════════════════════════════════════════════════════════════════════════════

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
    mem as (select * from public.loyalty_members where company_id = p_company and status <> 'deleted'),
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
