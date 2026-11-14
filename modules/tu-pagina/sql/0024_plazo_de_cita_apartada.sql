-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0024: plazo para pagar una cita apartada desde la página (no 24 h)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7): «¿cuánto es el tiempo de espera hasta liberarla?
-- Si la hora de la reserva es muy cercana a la actual, debería ser menor».
--
-- Hasta hoy una cita apartada (pending_payment) ocupaba su hora 24 h desde created_at
-- (v2_ocupa_hora, lib/panel/adelantos.ts, tu_pagina_srv_datos). En una barbería eso bloquea la
-- hora de alguien que nunca paga. Ahora, al apartarla desde la página:
--
--     plazo = entre 10 y P minutos, y como mucho un tercio de lo que falta para la cita
--     P = secciones.citas.plazo (10–1440), por defecto 60
--     → cita en 30 min: 10 · en 1 h: 20 · en 2 h: 40 · en 3 h o más: 60
--
-- CÓMO: created_at ya es el ancla del plazo en todas partes (la 0018 la mueve al llegar un
-- pago parcial). Aquí se pone en «ahora + plazo − 24 h»: así la cita deja de ocupar justo al
-- vencer el plazo en la agenda, en la página y en el panel, sin tocar v2_ocupa_hora ni al bot.
-- Si el cliente sube la captura, comprobante_srv_registrar vuelve a poner created_at = ahora
-- (24 h mientras el dueño la revisa), como antes.
--
-- Solo citas de la página, del negocio de esa página, con el código y el celular de la reserva,
-- y solo si siguen apartadas. Las canchas tienen su propio plazo y no pasan por aquí.
-- Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.cita_srv_apartar(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag    public.tu_pagina;
    v_cita   public.appointments;
    v_base   integer := 60;
    v_falta  numeric;
    v_plazo  integer;
    v_vence  timestamptz;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    if public.v2_canchas_cfg(v_pag.company_id) is not null then return jsonb_build_object('status', 'canchas'); end if;

    select a.* into v_cita
      from public.pagina_idem i
      join public.appointments a on a.id = i.ref_id and a.company_id = i.company_id
      join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo))
       and l.phone = public.v2_telefono(p_telefono);
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if v_cita.status <> 'pending_payment' or v_cita.slot_start !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
        return jsonb_build_object('status', 'no_apartada');
    end if;

    if coalesce(v_pag.secciones #>> '{citas,plazo}', '') ~ '^\d+$' then
        v_base := least(greatest((v_pag.secciones #>> '{citas,plazo}')::integer, 10), 1440);
    end if;
    v_falta := extract(epoch from ((v_cita.slot_start || ':00')::timestamp at time zone 'America/Lima') - now()) / 60;
    v_plazo := greatest(10, least(v_base, floor(v_falta / 3)::integer));
    v_vence := now() + make_interval(mins => v_plazo);

    update public.appointments
       set created_at = extract(epoch from v_vence - interval '24 hours')::bigint
     where id = v_cita.id and status = 'pending_payment';

    return jsonb_build_object('status', 'ok', 'plazo', v_plazo,
        'vence', to_char(v_vence at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI'),
        'vence_ms', floor(extract(epoch from v_vence) * 1000)::bigint);
end $$;

revoke execute on function public.cita_srv_apartar(text, text, text) from public, authenticated;
-- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
grant execute on function public.cita_srv_apartar(text, text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select to_regprocedure('public.cita_srv_apartar(text, text, text)') is not null as existe;

-- Deshacer (las citas vuelven a ocupar 24 h desde que se aparten):
--   drop function if exists public.cita_srv_apartar(text, text, text);
--   notify pgrst, 'reload schema';
