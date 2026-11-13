-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0018 · La ficha del cliente con TODAS sus líneas
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 13-nov-2026, Kallpa. Con la 0017 la ficha enseñaba los contadores de las dos
-- líneas, pero las operaciones, el libro y los premios eran solo los de la
-- principal (Asistencia): las compras de la cafetería no salían.
--
-- loyalty_member_detail ahora:
--   · resuelve a la PERSONA aunque se pida con el miembro de una línea;
--   · trae operaciones, libro y premios de la persona y de sus líneas, cada fila
--     con `line_label` («Asistencia», «Compra») y `line_main`.
-- Sin líneas, todo sale igual que antes (más esos dos campos).
--
-- Requiere 0017. Solo redefine loyalty_member_detail (copia de 0003 con estos cambios).
-- Deshacer: scripts/fideliza-0018-deshacer.sql (también lo repone el deshacer de la 0017).
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
