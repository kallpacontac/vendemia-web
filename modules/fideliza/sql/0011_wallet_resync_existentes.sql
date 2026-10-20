-- Una actualización del código del pase no cambia su estado en Postgres.
-- El botón de resincronización debe volver a enviar también clases y objetos
-- que figuran «al día», para que Google reciba el diseño vigente.
create or replace function public.loyalty_wallet_resync(p_company text, p_member uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
    perform public.loyalty_require(p_company, 'wallet.manage');
    if p_member is not null then
        if not exists (select 1 from public.loyalty_members
                       where id = p_member and company_id = p_company) then
            perform public.loyalty_err('member_not_found');
        end if;
        perform public.loyalty_enqueue_wallet(p_member);
        return 1;
    end if;

    insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
    select company_id, 'wallet.class.sync', jsonb_build_object('program_id', program_id), 'wallet.class:' || program_id
      from public.loyalty_wallet_classes
     where company_id = p_company
    on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;

    for p_member in select member_id from public.loyalty_wallet_passes
                     where company_id = p_company loop
        perform public.loyalty_enqueue_wallet(p_member);
        n := n + 1;
    end loop;
    perform public.loyalty_audit(p_company, 'wallet.resync', null, null,
                                 jsonb_build_object('passes', n, 'include_synced', true));
    return n;
end $$;
