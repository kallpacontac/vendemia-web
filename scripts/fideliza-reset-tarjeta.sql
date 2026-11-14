-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · Borrar UNA tarjeta de cliente, para volver a probar · 13-nov-2026
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Borra la tarjeta (o tarjetas) que tengan ese CORREO como contacto, o ese CÓDIGO,
-- con todo lo suyo: sus líneas (Asistencia, Compra…), visitas, sellos, premios,
-- canjes, el pase de Wallet, push, contactos y consentimientos.
--
-- No toca: la cuenta de acceso al panel, el negocio, el club, la página ni a los
-- demás clientes.
--
-- Después, en el celular: abre otra vez la página del negocio y únete. Si el
-- navegador aún enseña la tarjeta vieja («no encontrada»), borra los datos del
-- sitio fideliza.vendemias.com. El pase viejo de Google Wallet hay que quitarlo
-- a mano (Google no se limpia desde aquí).
--
-- Se ejecuta en el SQL editor de Supabase (rol postgres): apaga un momento el
-- trigger que hace inmutable el libro. Todo en una transacción.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.loyalty_ledger disable trigger tr_loyalty_ledger_inmutable;

do $$
declare
    v_correo  text := 'alvarofranco2020@gmail.com';  -- ← correo del cliente ('' para no usarlo)
    v_codigo  text := 'VDM-3NBEX2';                  -- ← código de su tarjeta ('' para no usarlo)
    v_negocio text := 'kallpa';                      -- ← solo en este negocio ('' = en todos)
    v_personas uuid[];
    v_ids      uuid[];
    v_quien    text;
    v_linea    boolean := exists (select 1 from information_schema.columns
                                   where table_schema = 'public' and table_name = 'loyalty_members'
                                     and column_name = 'parent_member_id');
begin
    -- Las personas: por su correo o por su código (el de una línea lleva a su persona).
    execute format($q$
        select coalesce(array_agg(distinct %s), '{}')
          from public.loyalty_members m
         where ($1 = '' or m.company_id = $1)
           and (m.public_code = upper(btrim($2))
                or exists (select 1 from public.loyalty_contacts c
                            where c.member_id = m.id and c.kind = 'email' and c.value = lower(btrim($3))))$q$,
        case when v_linea then 'coalesce(m.parent_member_id, m.id)' else 'm.id' end)
      into v_personas using coalesce(v_negocio, ''), coalesce(nullif(v_codigo, ''), '-'), coalesce(nullif(v_correo, ''), '-');

    if cardinality(v_personas) = 0 then
        raise exception 'No hay ninguna tarjeta con el correo «%» ni el código «%»%.', v_correo, v_codigo,
            case when v_negocio <> '' then ' en «' || v_negocio || '»' else '' end;
    end if;

    -- Cada persona y sus miembros de línea.
    if v_linea then
        execute 'select array_agg(id) from public.loyalty_members where id = any ($1) or parent_member_id = any ($1)'
           into v_ids using v_personas;
    else
        v_ids := v_personas;
    end if;
    select string_agg(coalesce(alias, 'Sin nombre') || ' (' || public_code || ', ' || company_id || ')', ' · ')
      into v_quien from public.loyalty_members where id = any (v_personas);

    delete from public.loyalty_ledger             where member_id = any (v_ids);
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
       and (payload ->> 'member_id')::text = any (select x::text from unnest(v_ids) x);
    -- Primero las líneas (cuelgan de la persona), luego la persona.
    delete from public.loyalty_members where id = any (v_ids) and not (id = any (v_personas));
    delete from public.loyalty_members where id = any (v_personas);

    raise notice 'Borrada(s): %. Ya puede unirse de nuevo.', v_quien;
end $$;

alter table public.loyalty_ledger enable trigger tr_loyalty_ledger_inmutable;

commit;

-- Comprobación: debe salir 0.
select count(*) as tarjetas_que_quedan
  from public.loyalty_members m
 where m.public_code = 'VDM-3NBEX2'
    or exists (select 1 from public.loyalty_contacts c
                where c.member_id = m.id and c.kind = 'email' and c.value = 'alvarofranco2020@gmail.com');
