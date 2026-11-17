-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FIDELIZA · 0020 · Espacio para el portafolio en la página de enlaces
--
--   · El portafolio (trabajos con foto, nombre, etiqueta y enlace) vive dentro de
--     loyalty_settings.page_style como `portafolio` (dominio/portafolio.ts).
--     Con el tope de 0008 (2 000 caracteres) caben unos 3 trabajos con foto;
--     aquí se sube a 12 000 (12 trabajos con URL de Cloudinary sobran).
--   · loyalty_page_style_save es la de 0012 con dos cambios: el tope nuevo y que
--     tocar SOLO el portafolio no vuelve a mandar a Google Wallet la clase y
--     todos los pases (el portafolio no sale en la tarjeta).
--   · Las claves las sigue validando el servidor (acciones.ts, zod estricto).
--
-- Idempotente: se puede correr dos veces.
-- ═══════════════════════════════════════════════════════════════════════════════

alter table public.loyalty_settings drop constraint if exists ck_loyalty_settings_page_style;
alter table public.loyalty_settings
    add constraint ck_loyalty_settings_page_style
    check (jsonb_typeof(page_style) = 'object' and length(page_style::text) <= 12000);

create or replace function public.loyalty_page_style_save(p_company text, p_style jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
    v_anterior jsonb;
    v_member uuid;
begin
    perform public.loyalty_require(p_company, 'program.edit');
    if jsonb_typeof(p_style) <> 'object' or length(p_style::text) > 12000 then
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

    -- El portafolio no sale en Google Wallet: cambiarlo no resincroniza pases.
    if (v_anterior - 'portafolio') is distinct from (p_style - 'portafolio') then
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
