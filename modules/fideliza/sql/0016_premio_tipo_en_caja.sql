-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0016 · La caja sabe de qué tipo es cada premio
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 12-nov-2026, Kallpa: el batido se gana en la ACADEMIA (`kallpa`) y se recoge en la
-- CAFETERÍA (`kallpa-tienda`), que es otro negocio. La caja de la tienda ya puede leer
-- la tarjeta de la academia (el panel busca en los otros negocios de quien atiende),
-- pero NO debe entregar desde allí el descuento de membresía: ese se usa en la academia.
--
-- Para distinguirlos, loyalty_member_card añade `part` a cada premio:
--   'level' → el beneficio de un nivel del mes (p. ej. el % de la membresía)
--   'gift'  → el regalo de un nivel (el batido)
--   null    → el premio de siempre (programas sin niveles)
--
-- Solo redefine loyalty_member_card (igual que en 0015 + `part`). Requiere 0015.
-- Deshacer: volver a correr la definición de loyalty_member_card de 0015.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

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

commit;

notify pgrst, 'reload schema';
