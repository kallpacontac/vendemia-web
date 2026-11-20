-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0023: quien saca su tarjeta ya es CLIENTE del negocio
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 19-nov-2026 (The 24/7): «Alex creó su tarjeta y no lo veo en Caja al buscar su nombre ni en
-- el módulo de Clientes». La tarjeta guarda a la persona en loyalty_members (alias) y su celular
-- en loyalty_contacts; Caja y Clientes buscan en public.leads. No se tocaban.
--
--   · Al guardar el celular de una tarjeta (alta pública, panel o caja), se crea su cliente en
--     leads con ese celular y su nombre, o se enlaza al que ya existe (v2_lead, la misma regla
--     que la Nueva cita y el Cobrar de Caja). Un cliente que ya existía sin nombre lo recibe.
--   · Si cambia el nombre de la tarjeta y el cliente no tenía nombre, también.
--   · Nunca bloquea la tarjeta: si algo falla al crear el cliente, la tarjeta se guarda igual.
--   · Y las tarjetas que ya existen: se crean sus clientes ahora (al correr esto).
--
-- Necesita datos 0004 (v2_lead, v2_telefono). Idempotente.
-- Deshacer: drop trigger tr_loyalty_contacto_cliente on public.loyalty_contacts;
--           drop trigger tr_loyalty_alias_cliente on public.loyalty_members;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- El cliente de una tarjeta: su celular + su nombre. null si no tiene celular.
create or replace function public.loyalty_cliente_de(p_company text, p_member uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
    v_tel    text;
    v_nombre text;
    v_lead   text;
begin
    select c.value into v_tel from public.loyalty_contacts c
     where c.company_id = p_company and c.member_id = p_member and c.kind = 'phone';
    if v_tel is null or public.v2_telefono(v_tel) !~ '^\d{8,15}$' then return null; end if;
    select nullif(btrim(coalesce(m.alias, '')), '') into v_nombre
      from public.loyalty_members m where m.company_id = p_company and m.id = p_member;
    select l.lead_id into v_lead
      from public.v2_lead(p_company, v_tel, coalesce(v_nombre, 'Cliente del club'), 'fideliza') l;
    return v_lead;
exception when others then
    return null;   -- la tarjeta manda: si el cliente no se pudo crear, no se pierde la tarjeta
end $$;
revoke execute on function public.loyalty_cliente_de(text, uuid) from public, anon, authenticated;

create or replace function public.loyalty_tg_contacto_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.kind = 'phone' then
        perform public.loyalty_cliente_de(new.company_id, new.member_id);
    end if;
    return null;
end $$;

drop trigger if exists tr_loyalty_contacto_cliente on public.loyalty_contacts;
create trigger tr_loyalty_contacto_cliente
    after insert or update of value on public.loyalty_contacts
    for each row execute function public.loyalty_tg_contacto_cliente();

create or replace function public.loyalty_tg_alias_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if new.alias is distinct from old.alias and nullif(btrim(coalesce(new.alias, '')), '') is not null then
        perform public.loyalty_cliente_de(new.company_id, new.id);
    end if;
    return null;
end $$;

drop trigger if exists tr_loyalty_alias_cliente on public.loyalty_members;
create trigger tr_loyalty_alias_cliente
    after update of alias on public.loyalty_members
    for each row execute function public.loyalty_tg_alias_cliente();

-- Las tarjetas que ya existen: sus clientes, ahora.
select count(public.loyalty_cliente_de(c.company_id, c.member_id)) as clientes_enlazados
  from public.loyalty_contacts c
  join public.loyalty_members m on m.company_id = c.company_id and m.id = c.member_id and m.status <> 'deleted'
 where c.kind = 'phone';

commit;

notify pgrst, 'reload schema';

-- Comprobación: las tarjetas de The 24/7 con celular y su cliente (debe salir «sí» en todas).
select m.alias as nombre, c.value as celular,
       case when exists (select 1 from public.leads l
                          where l.company_id = c.company_id and l.phone = public.v2_telefono(c.value)) then 'sí' else 'NO' end as en_clientes
  from public.loyalty_contacts c
  join public.loyalty_members m on m.company_id = c.company_id and m.id = c.member_id
 where c.company_id = 'the247barbershop' and c.kind = 'phone' and m.status <> 'deleted'
 order by m.created_at desc;
