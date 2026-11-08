-- ═══════════════════════════════════════════════════════════════════════════════
-- DESHACER · scripts/fideliza-demo-metricas.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Quita SOLO lo sembrado (tarjetas `seed-fzm-…`, sus compras, sellos, premios y canjes, y
-- las aperturas con detail.seed = 'fzm'). No toca las 10 clientas de antes del Club Mara
-- ni lo que hayan hecho personas reales. El «Club Burger» de vendemia SE QUEDA (es
-- configuración: se pausa o se cambia en Fideliza → Tarjeta de puntos).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create temp table fzm_miembros on commit drop as
    select id from public.loyalty_members where creation_key like 'seed-fzm-%';

alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;

delete from public.loyalty_redemptions where member_id in (select id from fzm_miembros);
delete from public.loyalty_ledger where member_id in (select id from fzm_miembros);
delete from public.loyalty_rewards where member_id in (select id from fzm_miembros);
delete from public.loyalty_transactions where member_id in (select id from fzm_miembros);
delete from public.loyalty_campaign_events where member_id in (select id from fzm_miembros);
delete from public.loyalty_wallet_passes where member_id in (select id from fzm_miembros);
delete from public.loyalty_outbox where payload ->> 'member_id' in (select id::text from fzm_miembros);
delete from public.loyalty_public_events where detail ->> 'seed' = 'fzm';
delete from public.loyalty_members where id in (select id from fzm_miembros);   -- contactos y consentimientos caen en cascada

alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;

commit;

-- Comprobación: todo a cero.
select (select count(*) from public.loyalty_members where creation_key like 'seed-fzm-%') as tarjetas,
       (select count(*) from public.loyalty_transactions where idempotency_key like 'seed-fzm-%') as compras,
       (select count(*) from public.loyalty_public_events where detail ->> 'seed' = 'fzm') as aperturas;
