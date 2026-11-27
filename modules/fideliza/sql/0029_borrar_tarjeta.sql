-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0029: «Borrar tarjeta» desde el panel (de verdad, con todo lo suyo)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 26-nov-2026 (Alvaro): el dueño quiere borrar tarjetas para probar, con un botón.
-- «Borrar datos personales» (loyalty_member_erase) deja la tarjeta como «Borrado» y
-- conserva el historial; esto la quita entera, igual que scripts/fideliza-reset-tarjeta.sql:
-- la persona, sus líneas (Asistencia, Compra…), visitas, sellos, premios, canjes, el pase
-- de Wallet (el de Google hay que quitarlo a mano del celular), push, contactos,
-- consentimientos, cumpleaños, nota, amigos y Google. El teléfono, al abrir el enlace
-- viejo, ve «no encontrada» y olvida la tarjeta; puede volver a unirse con el mismo celular.
--
-- Permiso: members.delete (dueño). Queda en loyalty_audit_log quién la borró y cuál era.
--
-- El libro (loyalty_ledger) sigue sin poder editarse: el trigger deja pasar el DELETE
-- solo dentro de esta función (marca loyalty.purga, local a la transacción).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.loyalty_ledger_inmutable()
returns trigger language plpgsql as $$
begin
    if tg_op = 'DELETE' and current_setting('loyalty.purga', true) = 'on' then
        return old;
    end if;
    raise exception 'loyalty:ledger_inmutable' using
        errcode = '42501',
        hint = 'El ledger no se edita: registra un movimiento compensatorio.';
end $$;

create or replace function public.loyalty_member_purge(p_company text, p_member uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_persona uuid;
    v_ids     uuid[];
    v_quien   text;
begin
    perform public.loyalty_require(p_company, 'members.delete');

    -- Si llega una línea, se borra su persona (y con ella todas sus líneas).
    select coalesce(m.parent_member_id, m.id) into v_persona
      from public.loyalty_members m where m.company_id = p_company and m.id = p_member;
    if v_persona is null then perform public.loyalty_err('not_found'); end if;

    select array_agg(id) into v_ids from public.loyalty_members
     where company_id = p_company and (id = v_persona or parent_member_id = v_persona);
    select coalesce(alias, 'Sin nombre') || ' (' || public_code || ')' into v_quien
      from public.loyalty_members where id = v_persona;

    perform set_config('loyalty.purga', 'on', true);
    delete from public.loyalty_ledger             where member_id = any (v_ids);
    perform set_config('loyalty.purga', 'off', true);
    delete from public.loyalty_redemptions        where member_id = any (v_ids);
    delete from public.loyalty_rewards            where member_id = any (v_ids);
    delete from public.loyalty_transactions       where member_id = any (v_ids);
    delete from public.loyalty_wallet_passes      where member_id = any (v_ids);
    delete from public.loyalty_push_subscriptions where member_id = any (v_ids);
    delete from public.loyalty_campaign_events    where member_id = any (v_ids);
    delete from public.loyalty_contacts           where member_id = any (v_ids);
    delete from public.loyalty_consents           where member_id = any (v_ids);
    delete from public.loyalty_public_events      where member_id = any (v_ids);
    delete from public.loyalty_outbox
     where status in ('pending', 'retry', 'processing', 'dead')
       and (payload ->> 'member_id') = any (select x::text from unnest(v_ids) x);
    -- Tablas sin llave hacia la tarjeta (las de 0019 y 0026), si existen.
    if to_regclass('public.loyalty_birthday_sent') is not null then
        execute 'delete from public.loyalty_birthday_sent where member_id = any ($1)' using v_ids;
    end if;
    if to_regclass('public.loyalty_resena_pedidos') is not null then
        execute 'delete from public.loyalty_resena_pedidos where member_id = any ($1)' using v_ids;
    end if;
    -- Primero las líneas (cuelgan de la persona), luego la persona. Cumpleaños, nota,
    -- amigos y Google caen en cascada.
    delete from public.loyalty_members where id = any (v_ids) and id <> v_persona;
    delete from public.loyalty_members where id = v_persona;

    perform public.loyalty_audit(p_company, 'member.purge', 'loyalty_members', v_persona::text,
                                 jsonb_build_object('quien', v_quien, 'lineas', cardinality(v_ids)));
    return jsonb_build_object('borrada', v_quien);
end $$;

revoke execute on function public.loyalty_member_purge(text, uuid) from public, anon;
grant execute on function public.loyalty_member_purge(text, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
