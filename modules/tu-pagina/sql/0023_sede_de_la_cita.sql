-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0023: en qué sede es la cita
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido por Alvaro el 14-nov-2026 (The 24/7, dos locales en Jr. Huallaga): «debe estar claro
-- para qué sede está escogiendo la reserva».
--
--   · appointments.sede: el nombre de la sede (secciones.citas.sedes[].nombre). '' = sin sede
--     (negocios de un solo local y todas las citas anteriores). La Agenda del panel la lee con
--     select('*'): sin esta columna simplemente no sale.
--   · cita_srv_sede: la página la llama justo después de crear la cita. Igual que el
--     comprobante, solo con el código de la reserva Y el celular con que se hizo; y la sede tiene
--     que ser una de las configuradas. Solo rellena una sede vacía: no cambia la de nadie.
--
-- No toca agenda_srv_reservar. Aforo: sigue siendo uno para todo el negocio (no por sede).
-- Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.appointments add column if not exists sede text not null default '';

create or replace function public.cita_srv_sede(p_slug text, p_codigo text, p_telefono text, p_sede text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag   public.tu_pagina;
    v_sedes jsonb;
    v_id    text;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;

    v_sedes := v_pag.secciones #> '{citas,sedes}';
    if v_sedes is null or jsonb_typeof(v_sedes) <> 'array'
       or not exists (select 1 from jsonb_array_elements(v_sedes) s where btrim(s->>'nombre') = btrim(coalesce(p_sede, ''))) then
        return jsonb_build_object('status', 'sede_invalida');
    end if;

    update public.appointments a
       set sede = btrim(p_sede)
      from public.pagina_idem i, public.leads l
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo)) and a.id = i.ref_id
       and a.company_id = v_pag.company_id and l.id = a.lead_id and l.company_id = a.company_id
       and l.phone = public.v2_telefono(p_telefono) and coalesce(a.sede, '') = ''
    returning a.id into v_id;
    if v_id is null then return jsonb_build_object('status', 'not_found'); end if;
    return jsonb_build_object('status', 'ok');
end $$;

revoke execute on function public.cita_srv_sede(text, text, text, text) from public, authenticated;
-- La página, con la clave de servidor (loyalty_srv_check), como las demás _srv_.
grant execute on function public.cita_srv_sede(text, text, text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y «sí».
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'appointments' and column_name = 'sede') as columna,
       to_regprocedure('public.cita_srv_sede(text, text, text, text)') is not null as funcion;

-- Deshacer (la columna se queda: borrarla perdería las sedes ya guardadas):
--   drop function if exists public.cita_srv_sede(text, text, text, text);
--   notify pgrst, 'reload schema';
