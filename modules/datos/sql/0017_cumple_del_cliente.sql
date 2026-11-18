-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0017: el cumpleaños del cliente al registrarlo
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7): «fecha de cumpleaños al registrar un nuevo cliente». Se pregunta en
-- Caja › Cobrar ticket y en Nueva cita, al dar de alta a un cliente nuevo (opcional).
--
--   · leads.cumple: 'MM-DD' (día y mes, sin año: no hace falta y es menos dato personal).
--   · cliente_cumple_guardar(company, telefono, 'MM-DD'): lo pone en el cliente de ese celular.
--     Cualquiera del equipo que cobre o agende. '' lo borra.
--   · Si el cliente ya tiene tarjeta del Club (Fideliza 0019), también va a su tarjeta, para el
--     regalo y el aviso del día.
--
-- Necesita v2_autorizar_agenda. Idempotente.
-- Deshacer: drop function public.cliente_cumple_guardar(text, text, text); alter table public.leads drop column cumple;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.leads add column if not exists cumple text;
do $$ begin
    alter table public.leads add constraint leads_cumple_valido
        check (cumple is null or cumple ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
exception when duplicate_object then null; end $$;

create or replace function public.cliente_cumple_guardar(p_company text, p_telefono text, p_mes_dia text)
returns integer language plpgsql security definer set search_path = public as $$
declare
    v_tel  text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 9);
    v_dia  text := nullif(btrim(coalesce(p_mes_dia, '')), '');
    v_n    integer;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    if length(v_tel) < 9 then
        raise exception 'Hace falta el celular del cliente.' using errcode = '22023';
    end if;
    if v_dia is not null and v_dia !~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
        raise exception 'El cumpleaños no es válido.' using errcode = '22023';
    end if;
    update public.leads set cumple = v_dia
     where company_id = p_company and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = v_tel;
    get diagnostics v_n = row_count;

    -- Con tarjeta del Club: también ahí (Fideliza 0019), si esa parte está instalada.
    if v_dia is not null and to_regclass('public.loyalty_birthdays') is not null
       and to_regclass('public.loyalty_contacts') is not null then
        begin
            execute $q$
                insert into public.loyalty_birthdays (member_id, company_id, mes_dia, set_by)
                select m.id, m.company_id, $1, 'caja'
                  from public.loyalty_members m
                  join public.loyalty_contacts k on k.company_id = m.company_id and k.member_id = m.id and k.kind = 'phone'
                 where m.company_id = $2 and right(regexp_replace(coalesce(k.value, ''), '\D', '', 'g'), 9) = $3
                on conflict (member_id) do update set mes_dia = excluded.mes_dia, updated_at = now()
            $q$ using v_dia, p_company, v_tel;
        exception when others then
            null;  -- la tarjeta es un extra: si su esquema no encaja, el cumpleaños igual quedó en el cliente
        end;
    end if;
    return v_n;
end $$;

revoke execute on function public.cliente_cumple_guardar(text, text, text) from public, anon;
grant execute on function public.cliente_cumple_guardar(text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.cliente_cumple_guardar(text,text,text)') is not null as cumple;
