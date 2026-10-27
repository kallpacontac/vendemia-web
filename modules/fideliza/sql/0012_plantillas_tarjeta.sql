-- Al cambiar el diseño o icono de la tarjeta, actualizar también los pases
-- que Postgres ya marcaba «al día». page_style es JSONB desde 0008.
create or replace function public.loyalty_page_style_save(p_company text, p_style jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
    v_anterior jsonb;
    v_member uuid;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    if jsonb_typeof(p_style) <> 'object' or length(p_style::text) > 2000 then
        perform public.loyalty_err('invalid_settings', 'page_style');
    end if;
    if p_style ? 'fondo' and coalesce(p_style ->> 'fondo', '') <> ''
       and not public.loyalty_url_ok(p_style ->> 'fondo') then
        perform public.loyalty_err('invalid_url', 'fondo');
    end if;
    select page_style into v_anterior from public.loyalty_settings
     where company_id = p_company for update;
    if not found then perform public.loyalty_err('settings_missing'); end if;
    update public.loyalty_settings set page_style = p_style, updated_at = now()
     where company_id = p_company;

    if v_anterior is distinct from p_style then
        insert into public.loyalty_outbox (company_id, kind, payload, dedupe_key)
        select company_id, 'wallet.class.sync', jsonb_build_object('program_id', program_id),
               'wallet.class:' || program_id
          from public.loyalty_wallet_classes where company_id = p_company
        on conflict (dedupe_key) where status in ('pending', 'retry') do nothing;
        for v_member in select member_id from public.loyalty_wallet_passes
                         where company_id = p_company loop
            perform public.loyalty_enqueue_wallet(v_member);
        end loop;
    end if;
    perform public.loyalty_audit(p_company, 'settings.page_style',
                                 'loyalty_settings', p_company, p_style);
end $$;
