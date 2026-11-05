-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0014 · Enviar un aviso ahora
--
-- El dueño escribe un mensaje y elige a quién: todos, los que hace tiempo no
-- vienen o a los que les falta poco para el premio. `{faltan}` se cambia por lo
-- que le falta a cada cliente («2 sellos»), con el saldo del momento de enviar.
--
-- Pasa por la misma cola que las campañas, con sus mismas reglas: solo a quien
-- aceptó los avisos, de 09:00 a 20:00 (Lima) y con tope por persona. Cada envío
-- lleva su texto en el trabajo de la cola: si hay dos en espera, no se pisan.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.loyalty_campaigns drop constraint if exists loyalty_campaigns_template_check;
alter table public.loyalty_campaigns add constraint loyalty_campaigns_template_check
    check (template in ('welcome', 'reward_available', 'return_reminder', 'winback', 'manual'));

create or replace function public.loyalty_aviso_validar(p_audience text, p_valor integer)
returns void language plpgsql immutable as $$
begin
    if p_audience = 'todos'
       or (p_audience = 'inactivos' and p_valor between 7 and 365)
       or (p_audience = 'cerca' and p_valor between 1 and 1000000) then
        return;
    end if;
    perform public.loyalty_err('invalid_audience');
end $$;

create or replace function public.loyalty_aviso_miembros(p_company text, p_audience text, p_valor integer)
returns setof uuid language sql stable as $$
    select m.id from public.loyalty_members m
     where m.company_id = p_company and m.status = 'active'
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

-- Consentimiento vigente, celular suscrito y sin pasar el tope (se repite al enviar).
create or replace function public.loyalty_aviso_alcanzable(p_member uuid)
returns boolean language sql stable as $$
    select public.loyalty_consents_now(p_member, 'push')
       and exists (select 1 from public.loyalty_push_subscriptions s
                    where s.member_id = p_member and s.revoked_at is null)
       and (select count(*) from public.loyalty_campaign_events e
             where e.member_id = p_member and e.stage = 'attempted'
               and e.created_at > now() - interval '30 days') < 4;
$$;

create or replace function public.loyalty_faltan_texto(p_faltan integer, p_rule text)
returns text language sql immutable as $$
    select p_faltan::text || ' ' || case coalesce(p_rule, 'stamps')
        when 'points' then case when p_faltan = 1 then 'punto' else 'puntos' end
        when 'visits' then case when p_faltan = 1 then 'visita' else 'visitas' end
        else case when p_faltan = 1 then 'sello' else 'sellos' end end;
$$;

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
     where p.company_id = p_company and p.status in ('active', 'paused');
    return jsonb_build_object('matching', v_total, 'reachable', v_reach,
                              'ejemplo', public.loyalty_faltan_texto(greatest(p_valor, 1), v_rule));
end $$;

create or replace function public.loyalty_aviso_enviar(
    p_company text, p_audience text, p_valor integer, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_campaign uuid;
    v_title text := btrim(coalesce(p_title, ''));
    v_body text := btrim(coalesce(p_body, ''));
    v_slot timestamptz := public.loyalty_next_send_slot();
    v_clave text;
    n integer;
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    perform public.loyalty_aviso_validar(p_audience, p_valor);
    if p_audience <> 'cerca' and position('{faltan}' in v_title || v_body) > 0 then
        perform public.loyalty_err('faltan_sin_audiencia');
    end if;
    begin
        -- La fila agrupa las métricas; el texto de cada envío viaja en la cola.
        insert into public.loyalty_campaigns (company_id, template, status, title, body, config)
        values (p_company, 'manual', 'active', v_title, v_body,
                public.loyalty_campaign_config('manual', '{"max_per_30d":4}'::jsonb))
        on conflict (company_id, template) do update
           set status = 'active', title = excluded.title, body = excluded.body,
               config = excluded.config, updated_at = now()
        returning id into v_campaign;
    exception when check_violation or not_null_violation then perform public.loyalty_err('invalid_campaign', sqlerrm);
    end;

    -- Si la conexión falla y lo reenvía, el mismo aviso no sale dos veces.
    v_clave := 'push:manual:' || md5(concat_ws('|', p_audience, p_valor, v_title, v_body)) || ':';
    with nuevos as (
        insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key, next_attempt_at)
        select p_company, 'push.send',
               jsonb_build_object('member_id', x.id, 'campaign_id', v_campaign, 'template', 'manual',
                                  'audience', p_audience, 'eligible_at', now(),
                                  'title', v_title, 'body', v_body),
               v_clave || x.id, v_slot
          from public.loyalty_aviso_miembros(p_company, p_audience, p_valor) as x(id)
         where public.loyalty_aviso_alcanzable(x.id)
           and not exists (select 1 from public.loyalty_outbox o
                            where o.company_id = p_company and o.kind = 'push.send'
                              and o.dedupe_key = v_clave || x.id
                              and o.created_at > now() - interval '2 minutes')
        on conflict (dedupe_key) where status in ('pending', 'retry') do nothing
        returning (payload ->> 'member_id')::uuid as member_id
    ), eventos as (
        insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage)
        select p_company, v_campaign, member_id, 'eligible' from nuevos
        returning 1
    )
    select count(*) into n from nuevos;

    perform public.loyalty_audit(p_company, 'campaign.send', 'loyalty_campaigns', v_campaign::text,
                                 jsonb_build_object('audience', p_audience, 'value', p_valor, 'queued', n));
    return jsonb_build_object('queued', n, 'scheduled_at', v_slot, 'immediate', v_slot <= now());
end $$;

-- La de 0004, más: el texto propio de cada envío, `{faltan}`, y no decirle
-- «no te vemos» a quien volvió mientras el aviso esperaba las 09:00.
create or replace function public.loyalty_srv_push_prepare(p_outbox bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    o public.loyalty_outbox;
    m public.loyalty_members;
    c public.loyalty_campaigns;
    v_slot timestamptz;
    v_sent integer;
    v_title text;
    v_body text;
    v_rule text;
    v_faltan integer;
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
    if (c.template in ('return_reminder', 'winback') or (c.template = 'manual' and o.payload ->> 'audience' = 'inactivos'))
       and m.last_op_at > (o.payload ->> 'eligible_at')::timestamptz then
        insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage, detail)
        values (m.company_id, c.id, m.id, 'skipped', 'compra después de ser elegible');
        return jsonb_build_object('send', false, 'reason', 'purchased');
    end if;
    if c.template = 'reward_available' and m.rewards_available = 0 then
        return jsonb_build_object('send', false, 'reason', 'no_reward');
    end if;

    v_title := coalesce(o.payload ->> 'title', c.title);
    v_body := coalesce(o.payload ->> 'body', c.body);
    if c.template = 'manual' and position('{faltan}' in v_title || v_body) > 0 then
        select v.rule_type, v.reward_threshold - m.balance into v_rule, v_faltan
          from public.loyalty_programs p
          join public.loyalty_program_versions v on v.id = p.current_version_id
         where p.id = m.program_id;
        if coalesce(v_faltan, 0) < 1 then
            insert into public.loyalty_campaign_events (company_id, campaign_id, member_id, stage, detail)
            values (m.company_id, c.id, m.id, 'skipped', 'ya no le falta nada');
            return jsonb_build_object('send', false, 'reason', 'no_faltan');
        end if;
        v_title := replace(v_title, '{faltan}', public.loyalty_faltan_texto(v_faltan, v_rule));
        v_body := replace(v_body, '{faltan}', public.loyalty_faltan_texto(v_faltan, v_rule));
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
        'send', true, 'campaign_id', c.id, 'member_id', m.id, 'title', v_title, 'body', v_body,
        'brand', public.loyalty_brand(m.company_id),
        'subscriptions', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                            from public.loyalty_push_subscriptions s where s.member_id = m.id and s.revoked_at is null));
end $$;

revoke execute on function
    public.loyalty_aviso_validar(text, integer),
    public.loyalty_aviso_miembros(text, text, integer),
    public.loyalty_aviso_alcanzable(uuid),
    public.loyalty_faltan_texto(integer, text),
    public.loyalty_aviso_audiencia(text, text, integer),
    public.loyalty_aviso_enviar(text, text, integer, text, text)
from public, anon, authenticated;
grant execute on function
    public.loyalty_aviso_audiencia(text, text, integer),
    public.loyalty_aviso_enviar(text, text, integer, text, text)
to authenticated;

notify pgrst, 'reload schema';
