-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0019: el cumpleaños del cliente y su regalo
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7: «cumpleañero tiene cortesía gratis en cualquier
-- corte más mascarilla… el cajero debería preguntar y agregar ese dato para enviar recordatorios»).
--
--   · loyalty_birthdays: día y mes (sin año: no hace falta y es menos dato personal) de la
--     PERSONA (el miembro principal; una línea de la 0017 usa el de su persona). Aparte de
--     loyalty_members, como los contactos: un cajero ve la tarjeta, el cumpleaños solo por RPC.
--   · loyalty_settings.cumple_regalo: el regalo del negocio ('' = sin regalo ni aviso).
--   · loyalty_birthday_set / _get: la Caja lo pregunta y lo guarda (permiso members.create, el
--     del cajero) y lo lee (members.read), con «hoy cumple» y el regalo.
--   · loyalty_srv_cumple_hoy: el cron (9:00 Lima) recoge a quienes cumplen HOY en negocios con
--     regalo, una vez por año y persona (loyalty_birthday_sent). El 29-feb, en años no
--     bisiestos, se celebra el 28. El aviso (push + Wallet) lo manda servidor/avisos.ts.
--
-- Idempotente. Deshacer: scripts/fideliza-0019-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.loyalty_birthdays (
    member_id   uuid primary key,
    company_id  text not null,
    mes_dia     text not null check (mes_dia ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
    set_by      text,
    updated_at  timestamptz not null default now(),
    foreign key (company_id, member_id) references public.loyalty_members (company_id, id) on delete cascade
);
create index if not exists ix_loyalty_birthdays_dia on public.loyalty_birthdays (mes_dia);
alter table public.loyalty_birthdays enable row level security;
revoke all on public.loyalty_birthdays from anon, authenticated;

create table if not exists public.loyalty_birthday_sent (
    member_id  uuid not null,
    anio       integer not null,
    sent_at    timestamptz not null default now(),
    primary key (member_id, anio)
);
alter table public.loyalty_birthday_sent enable row level security;
revoke all on public.loyalty_birthday_sent from anon, authenticated;

alter table public.loyalty_settings add column if not exists cumple_regalo text not null default ''
    check (char_length(cumple_regalo) <= 120);

-- La persona: una línea (0017) apunta a su miembro principal.
create or replace function public.loyalty_persona(p_company text, p_member uuid)
returns uuid language sql stable security definer set search_path = public as $$
    select coalesce(m.parent_member_id, m.id) from public.loyalty_members m where m.company_id = p_company and m.id = p_member;
$$;

create or replace function public.loyalty_birthday_get(p_company text, p_member uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_persona uuid;
    v_dia     text;
    v_hoy     text := to_char(now() at time zone 'America/Lima', 'MM-DD');
begin
    perform public.loyalty_require(p_company, 'members.read');
    v_persona := public.loyalty_persona(p_company, p_member);
    if v_persona is null then perform public.loyalty_err('not_found'); end if;
    select mes_dia into v_dia from public.loyalty_birthdays where member_id = v_persona;
    return jsonb_build_object(
        'mes_dia', v_dia,
        'hoy', v_dia is not null and (v_dia = v_hoy or (v_dia = '02-29' and v_hoy = '02-28'
                                       and extract(day from (date_trunc('year', now()) + interval '2 months' - interval '1 day')) = 28)),
        'regalo', (select nullif(cumple_regalo, '') from public.loyalty_settings where company_id = p_company));
end $$;

-- '' o null borra el dato. Valida que la fecha exista (no 31-04, sí 29-02).
create or replace function public.loyalty_birthday_set(p_company text, p_member uuid, p_mes_dia text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_persona uuid;
    v_dia     text := btrim(coalesce(p_mes_dia, ''));
begin
    perform public.loyalty_require(p_company, 'members.create');
    v_persona := public.loyalty_persona(p_company, p_member);
    if v_persona is null then perform public.loyalty_err('not_found'); end if;
    if v_dia = '' then
        delete from public.loyalty_birthdays where member_id = v_persona;
        return jsonb_build_object('status', 'ok', 'mes_dia', null);
    end if;
    if v_dia !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then perform public.loyalty_err('invalid_birthday'); end if;
    begin
        perform ('2000-' || v_dia)::date;   -- 2000 es bisiesto: el 29-02 vale
    exception when others then
        perform public.loyalty_err('invalid_birthday');
    end;
    insert into public.loyalty_birthdays (member_id, company_id, mes_dia, set_by)
    values (v_persona, p_company, v_dia, (select auth.uid())::text)
    on conflict (member_id) do update set mes_dia = excluded.mes_dia, set_by = excluded.set_by, updated_at = now();
    perform public.loyalty_audit(p_company, 'member.birthday', 'loyalty_members', v_persona::text, jsonb_build_object('mes_dia', v_dia));
    return jsonb_build_object('status', 'ok', 'mes_dia', v_dia);
end $$;

-- Quiénes cumplen hoy (Lima) en negocios con regalo, una sola vez al año por persona.
create or replace function public.loyalty_srv_cumple_hoy()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_hoy   text := to_char(now() at time zone 'America/Lima', 'MM-DD');
    v_anio  integer := extract(year from now() at time zone 'America/Lima')::integer;
    v_bis   boolean := extract(day from make_date(extract(year from now() at time zone 'America/Lima')::int, 3, 1) - 1) = 29;
    v_lista jsonb;
begin
    perform public.loyalty_srv_check();
    with hoy as (
        select b.member_id, b.company_id, s.cumple_regalo
          from public.loyalty_birthdays b
          join public.loyalty_members m on m.id = b.member_id and m.status = 'active'
          join public.loyalty_settings s on s.company_id = b.company_id and s.cumple_regalo <> ''
         where (b.mes_dia = v_hoy or (b.mes_dia = '02-29' and v_hoy = '02-28' and not v_bis))
           and not exists (select 1 from public.loyalty_birthday_sent x where x.member_id = b.member_id and x.anio = v_anio)
         limit 500
    ), marcados as (
        insert into public.loyalty_birthday_sent (member_id, anio)
        select member_id, v_anio from hoy
        on conflict do nothing
        returning member_id
    )
    select coalesce(jsonb_agg(jsonb_build_object('company_id', h.company_id, 'member_id', h.member_id, 'regalo', h.cumple_regalo)), '[]'::jsonb)
      into v_lista
      from hoy h join marcados k on k.member_id = h.member_id;
    return v_lista;
end $$;

revoke execute on function public.loyalty_persona(text, uuid) from public, anon, authenticated;
revoke execute on function public.loyalty_birthday_get(text, uuid) from public, anon;
grant execute on function public.loyalty_birthday_get(text, uuid) to authenticated;
revoke execute on function public.loyalty_birthday_set(text, uuid, text) from public, anon;
grant execute on function public.loyalty_birthday_set(text, uuid, text) to authenticated;
revoke execute on function public.loyalty_srv_cumple_hoy() from public, authenticated;
-- El cron, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
grant execute on function public.loyalty_srv_cumple_hoy() to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: tres «sí».
select to_regclass('public.loyalty_birthdays') is not null as tabla,
       to_regprocedure('public.loyalty_birthday_set(text, uuid, text)') is not null as caja,
       to_regprocedure('public.loyalty_srv_cumple_hoy()') is not null as cron;
