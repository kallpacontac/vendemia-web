-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0013 · A quién avisar cuando gana o canjea un premio
--
-- Aviso de servicio, no campaña: sale en el momento (el cliente está en el local),
-- sin horario ni tope de campañas. El push exige el mismo consentimiento de siempre;
-- sin él, la lista de suscripciones viene vacía. El mensaje en Google Wallet solo
-- llega si el cliente guardó la tarjeta ahí, y Google limita a 3 avisos cada 24 h.
--
-- Sin esta función el canje y el registro funcionan igual: el aviso se omite.
-- ═══════════════════════════════════════════════════════════════════════════════

create or replace function public.loyalty_srv_aviso_datos(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    m public.loyalty_members;
begin
    perform public.loyalty_srv_check();
    select * into m from public.loyalty_members where company_id = p_company and id = p_member;
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

revoke execute on function public.loyalty_srv_aviso_datos(text, uuid) from public, authenticated;
grant execute on function public.loyalty_srv_aviso_datos(text, uuid) to anon;
