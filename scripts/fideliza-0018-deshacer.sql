-- Deshacer la 0018: la ficha vuelve a enseñar solo la línea principal.
-- Repone loyalty_member_detail tal como estaba en 0003.
begin;

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

commit;

notify pgrst, 'reload schema';
