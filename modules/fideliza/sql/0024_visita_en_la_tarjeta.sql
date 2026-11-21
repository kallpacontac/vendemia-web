-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0024: la tarjeta dice qué se hizo, cuándo y con quién en cada visita
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 20-nov-2026 (The 24/7): «para que el mismo cliente vaya fidelizando con su barbero · cuando
-- viene el cliente a veces muestra su tarjeta: se presionaría en su último servicio y que salga
-- la hora, la fecha y el nombre del barbero».
--
-- Cada fila de «Últimos movimientos» de la tarjeta pública puede traer `visit`:
--   { servicio, barbero, barbero_id, sede }
-- y la tarjeta trae `reservar_slug` (la agenda de Mi página, si está publicada y reserva) para
-- el botón «Reservar otra vez con <barbero>».
--
-- De dónde sale: el sello que suma la Caja al cobrar una atención (components/panel/selloDeCita.ts)
-- lleva la clave de idempotencia `cita-<id de la cita>`. Con ella se llega a la cita
-- (appointments), a sus servicios (appointment_services, sin los productos) y al barbero
-- (employees). Por eso también salen los sellos que ya se dieron así antes de esta migración.
-- Los sellos dados a mano en «Escanear tarjeta» no vienen de una cita: salen como siempre.
--
-- Solo cambia `movements` dentro de loyalty_srv_card (copiada de 0017 tal cual, salvo eso).
-- Nada nuevo es ejecutable desde fuera: los ayudantes solo los llama loyalty_srv_card.
-- Necesita 0017. Idempotente. Prueba: tests/pruebas_0024_pglite.mjs.
-- Deshacer: volver a correr el bloque loyalty_srv_card de 0017 y
--   drop function if exists public.loyalty_visita_de_tx(text, uuid);
--   drop function if exists public.loyalty_reservar_slug(text);
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- La visita detrás de una operación de la tarjeta, o null si no vino de una cita.
-- Lee las tablas de la agenda con to_jsonb para no depender de columnas que añadió otro módulo
-- (sede, tipo): si faltan, salen vacías.
create or replace function public.loyalty_visita_de_tx(p_company text, p_tx uuid)
returns jsonb language plpgsql stable set search_path = public as $$
declare
    v_key  text;
    v_cita jsonb;
    v_serv text;
    v_emp  text;
begin
    if p_tx is null or to_regclass('public.appointments') is null then return null; end if;
    select t.idempotency_key into v_key
      from public.loyalty_transactions t
     where t.company_id = p_company and t.id = p_tx and t.kind in ('purchase', 'visit');
    if v_key is null or v_key !~ '^cita-.+' then return null; end if;

    select to_jsonb(a) into v_cita
      from public.appointments a
     where a.company_id = p_company and a.id = substr(v_key, 6);
    if v_cita is null then return null; end if;

    -- Los servicios, en su orden; los productos (bebidas, ceras…) no son «lo que te hicieron».
    if to_regclass('public.appointment_services') is not null then
        select string_agg(s.name, ' + ' order by s.sort_order, s.name) into v_serv
          from public.appointment_services s
          left join public.catalog c on c.company_id = p_company and c.id = s.catalog_item_id
         where s.appointment_id = v_cita ->> 'id'
           and coalesce(to_jsonb(c) ->> 'tipo', '') <> 'producto'
           and btrim(s.name) <> '';
    end if;
    v_serv := coalesce(nullif(btrim(v_serv), ''), nullif(btrim(v_cita ->> 'service'), ''));

    if coalesce(v_cita ->> 'employee_id', '') <> '' and to_regclass('public.employees') is not null then
        select nullif(btrim(e.name), '') into v_emp
          from public.employees e
         where e.company_id = p_company and e.id = v_cita ->> 'employee_id';
    end if;

    if v_serv is null and v_emp is null then return null; end if;
    return jsonb_build_object(
        'servicio',   left(v_serv, 120),
        'barbero',    left(v_emp, 60),
        'barbero_id', case when v_emp is null then null else v_cita ->> 'employee_id' end,
        'sede',       nullif(btrim(coalesce(v_cita ->> 'sede', '')), ''));
end $$;

-- La dirección de la agenda del negocio (agenda.vendemias.com/<slug>/reservar), si su página
-- está publicada y reserva. null si no tiene.
create or replace function public.loyalty_reservar_slug(p_company text)
returns text language plpgsql stable set search_path = public as $$
declare v text;
begin
    if to_regclass('public.tu_pagina') is null then return null; end if;
    select tp.slug into v
      from public.tu_pagina tp
     where tp.company_id = p_company and tp.publicada
       and coalesce(tp.secciones -> 'reservar', 'false'::jsonb) not in ('false'::jsonb, 'null'::jsonb);
    return v;
end $$;

revoke execute on function public.loyalty_visita_de_tx(text, uuid) from public, anon, authenticated;
revoke execute on function public.loyalty_reservar_slug(text) from public, anon, authenticated;

-- loyalty_srv_card · de 0017_una_tarjeta_varias_lineas.sql; solo cambian `movements` y `reservar_slug`
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
        'movements', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'units', l.units, 'at', l.created_at,
                                                                   'visit', case when l.kind = 'earn'
                                                                                 then public.loyalty_visita_de_tx(m.company_id, l.transaction_id) end)
                                                order by l.id desc)
                                 from (select * from public.loyalty_ledger where member_id = m.id
                                        order by id desc limit 10) l), '[]'::jsonb),
        'reservar_slug', public.loyalty_reservar_slug(m.company_id),
        'wallet', (select jsonb_build_object('state', w.state, 'pending', w.synced_rev < w.desired_rev,
                                             'links_issued', w.save_links_issued)
                     from public.loyalty_wallet_passes w where w.member_id = m.id),
        'push', jsonb_build_object('consent', public.loyalty_consents_now(m.id, 'push'),
                                   'devices', (select count(*) from public.loyalty_push_subscriptions s
                                                where s.member_id = m.id and s.revoked_at is null)),
        'contacts', coalesce((select jsonb_agg(jsonb_build_object('kind', c.kind, 'verified', c.verified_at is not null))
                                from public.loyalty_contacts c where c.member_id = m.id), '[]'::jsonb));
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.loyalty_visita_de_tx(text,uuid)') is not null as visita_en_la_tarjeta;
