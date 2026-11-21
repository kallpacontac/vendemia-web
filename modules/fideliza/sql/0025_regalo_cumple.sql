-- ═══════════════════════════════════════════════════════════════════════════════
-- FIDELIZA · 0025: el dueño pone su regalo de cumpleaños desde Avisos
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 20-nov-2026 (maqueta de Avisos aprobada por Alvaro). La 0019 creó
-- loyalty_settings.cumple_regalo ('' = sin regalo ni aviso), pero no había cómo ponerlo desde el
-- panel: solo por SQL (scripts/the247-catalogo.sql). Ahora es un interruptor en Avisos.
--
--   · loyalty_cumple_regalo_guardar(company, regalo): '' lo apaga; hasta 120 letras.
--     Permiso campaigns.manage (el mismo que los demás avisos). Queda en la auditoría.
--
-- Necesita la 0019. Idempotente.
-- Deshacer: drop function public.loyalty_cumple_regalo_guardar(text, text);
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.loyalty_cumple_regalo_guardar(p_company text, p_regalo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_regalo text := btrim(coalesce(p_regalo, ''));
begin
    perform public.loyalty_require(p_company, 'campaigns.manage');
    if char_length(v_regalo) > 120 then perform public.loyalty_err('invalid_settings'); end if;
    update public.loyalty_settings set cumple_regalo = v_regalo where company_id = p_company;
    if not found then perform public.loyalty_err('not_found'); end if;
    perform public.loyalty_audit(p_company, 'settings.cumple_regalo', 'loyalty_settings', p_company,
                                 jsonb_build_object('regalo', v_regalo));
    return jsonb_build_object('status', 'ok', 'regalo', v_regalo);
end $$;

revoke execute on function public.loyalty_cumple_regalo_guardar(text, text) from public, anon;
grant execute on function public.loyalty_cumple_regalo_guardar(text, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.loyalty_cumple_regalo_guardar(text,text)') is not null as regalo_cumple;
