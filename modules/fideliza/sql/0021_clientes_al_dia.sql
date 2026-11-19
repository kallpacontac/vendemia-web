-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0021: los clientes nuevos arriba, con su ficha de datos
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (Kallpa): «en Clientes deben aparecer estos nuevos clientes, como ficha de datos:
-- nombre, celular, fecha de cumpleaños». Y en la Caja, buscar por nombre tiene que ser fácil.
--
-- loyalty_member_search (la de la 0017) con cuatro cambios:
--   1 · Orden: lo último que pasó con el cliente, su alta o su última compra/visita. Antes iba
--       por la última operación con las altas sin operaciones AL FINAL: quien se unía desde la
--       página no salía nunca arriba.
--   2 · Nombre: también por el apellido o cualquier palabra («pérez» encuentra a «Juan Pérez»).
--       Antes, solo por el principio.
--   3 · Celular: también por sus últimas cifras (4 a 7), con permiso para ver contactos.
--   4 · Devuelve la ficha: alta (created_at, joined_via), correo y cumpleaños (0019, «03-12»).
--       El cumpleaños con members.read, como loyalty_birthday_get.
--
-- Necesita la 0017 (líneas) y la 0019 (cumpleaños). Idempotente. Deshacer: correr otra vez la
-- loyalty_member_search de la 0017.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$ begin
    if to_regclass('public.loyalty_birthdays') is null then
        raise exception 'Corre antes modules/fideliza/sql/0019_cumpleanos.sql.';
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'loyalty_members' and column_name = 'parent_member_id') then
        raise exception 'Corre antes modules/fideliza/sql/0017_una_tarjeta_varias_lineas.sql.';
    end if;
end $$;

begin;

create or replace function public.loyalty_member_search(
    p_company text, p_q text, p_status text, p_filter text, p_limit integer, p_offset integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_contacts boolean;
    q text := lower(btrim(coalesce(p_q, '')));
    v_phone text;
    v_cola text;
    v_total integer;
    v_rows jsonb;
    v_lines boolean;
begin
    perform public.loyalty_require(p_company, 'members.read');
    v_contacts := public.loyalty_can(p_company, 'contacts.read');
    v_lines := exists (select 1 from public.loyalty_programs p where p.company_id = p_company
                         and p.parent_program_id is not null and p.status in ('active', 'paused'));
    if q ~ '^\+?[0-9 ]{8,18}$' then
        begin v_phone := public.loyalty_norm_phone(q); exception when others then v_phone := null; end;
    end if;
    -- 0021: las últimas cifras del celular («8306» encuentra +51 955 882 306… si acaba así).
    if v_contacts and q ~ '^[0-9 ]{4,7}$' then
        v_cola := regexp_replace(q, '[^0-9]', '', 'g');
    end if;

    with base as (
        select m.*, greatest(m.created_at, coalesce(m.last_op_at, m.created_at)) as reciente
          from public.loyalty_members m
         where m.company_id = p_company and m.parent_member_id is null
           and (p_status is null and m.status <> 'deleted' or m.status = p_status)
           and (q = ''
                or m.public_code = 'VDM-' || upper(right(regexp_replace(q, '[^a-z0-9]', '', 'g'), 6))
                   and upper(regexp_replace(q, '[^a-z0-9]', '', 'g')) ~ '^(VDM)?[A-Z0-9]{6}$'
                or lower(m.alias) like q || '%'
                -- 0021: cualquier palabra del nombre.
                or lower(m.alias) like '% ' || q || '%'
                or (v_contacts and exists (
                        select 1 from public.loyalty_contacts c
                         where c.member_id = m.id
                           and (c.value = v_phone
                                or (c.kind = 'email' and c.value like q || '%')
                                or (v_cola is not null and c.kind = 'phone' and c.value like '%' || v_cola)))))
           and case p_filter
                   when 'reward' then m.rewards_available > 0 or exists (
                       select 1 from public.loyalty_members s where s.parent_member_id = m.id and s.rewards_available > 0)
                   when 'wallet' then exists (select 1 from public.loyalty_wallet_passes w where w.member_id = m.id)
                   when 'wallet_error' then exists (select 1 from public.loyalty_wallet_passes w
                                                     where w.member_id = m.id and w.state = 'error')
                   when 'inactive30' then m.last_op_at is null or m.last_op_at < now() - interval '30 days'
                   when 'active30' then m.last_op_at >= now() - interval '30 days'
                   when 'never' then m.first_op_at is null
                   else true end
    )
    select (select count(*) from base),
           coalesce((select jsonb_agg(x order by x.ord) from (
               select row_number() over (order by b.reciente desc, b.created_at desc) as ord,
                      b.id, b.public_code, b.alias, b.status, b.balance, b.rewards_available,
                      b.ops_count, b.last_op_at, b.created_at, b.joined_via,
                      case when v_lines then public.loyalty_lines_of(b.id) end as lines,
                      (select w.state from public.loyalty_wallet_passes w where w.member_id = b.id) as wallet_state,
                      exists (select 1 from public.loyalty_contacts c
                               where c.member_id = b.id and c.verified_at is not null) as verified_contact,
                      case when v_contacts then (select c.value from public.loyalty_contacts c
                                                  where c.member_id = b.id and c.kind = 'phone') end as phone,
                      case when v_contacts then (select c.value from public.loyalty_contacts c
                                                  where c.member_id = b.id and c.kind = 'email') end as email,
                      (select d.mes_dia from public.loyalty_birthdays d where d.member_id = b.id) as cumple
                 from base b
                order by b.reciente desc, b.created_at desc
                limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0)) x),
               '[]'::jsonb)
      into v_total, v_rows;
    return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» si quedó la versión nueva.
select position('reciente' in pg_get_functiondef('public.loyalty_member_search(text, text, text, text, integer, integer)'::regprocedure)) > 0 as clientes_al_dia;
