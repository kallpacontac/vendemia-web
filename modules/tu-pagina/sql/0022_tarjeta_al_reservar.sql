-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0022: ¿quien acaba de reservar ya tiene la tarjeta de puntos?
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7): después de subir el comprobante, si el cliente
-- no tiene tarjeta, invitarlo con una ventana («¿Quieres un corte gratis?»).
--
-- La página (agenda.vendemias.com) y la tarjeta (fideliza.vendemias.com) son orígenes distintos:
-- el navegador no puede saberlo. Se mira en la base por el celular de la reserva:
-- loyalty_contacts (kind = 'phone', normalizado con loyalty_norm_phone) de una tarjeta activa
-- del club que enseña la página (secciones.fideliza.slug).
--
-- Privacidad: solo contesta a quien tiene el código de la reserva Y el celular con que se hizo
-- (v2_comprobante_cita, como el comprobante). Con otro celular, «not_found»: no sirve para
-- averiguar si un número cualquiera es socio. Solo devuelve sí/no, ningún dato de la tarjeta.
--
-- Necesita la 0021 (v2_comprobante_cita con citas). Deshacer: drop de la función (al final).
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.tu_pagina_srv_tiene_tarjeta(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_cita public.appointments;
    v_club text;
    v_emp  text;
    v_tel  text;
begin
    perform public.loyalty_srv_check();
    v_cita := public.v2_comprobante_cita(p_slug, p_codigo, p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;

    select p.secciones #>> '{fideliza,slug}' into v_club
      from public.tu_pagina p
     where p.slug = lower(p_slug) and p.publicada and coalesce(p.secciones #>> '{fideliza,activo}', '') = 'true';
    if v_club is null then return jsonb_build_object('status', 'ok', 'club', false); end if;
    select company_id into v_emp from public.loyalty_settings where slug = v_club;
    if v_emp is null then return jsonb_build_object('status', 'ok', 'club', false); end if;

    begin
        v_tel := public.loyalty_norm_phone(p_telefono);
    exception when others then
        v_tel := null;
    end;
    return jsonb_build_object('status', 'ok', 'club', true, 'tiene', v_tel is not null and exists (
        select 1
          from public.loyalty_contacts c
          join public.loyalty_members m on m.company_id = c.company_id and m.id = c.member_id
         where c.company_id = v_emp and c.kind = 'phone' and c.value = v_tel and m.status = 'active'));
end $$;

revoke execute on function public.tu_pagina_srv_tiene_tarjeta(text, text, text) from public, authenticated;
-- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
grant execute on function public.tu_pagina_srv_tiene_tarjeta(text, text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.tu_pagina_srv_tiene_tarjeta(text, text, text)') is not null as existe;

-- Deshacer:
--   drop function if exists public.tu_pagina_srv_tiene_tarjeta(text, text, text);
--   notify pgrst, 'reload schema';
