-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0038: descuento por reservar en la página, una vez por cliente
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 25-nov-2026 (The 24/7, Alvaro): «promoción 20 % de descuento configurable si agenda por la
-- página», «precio solo por la web y una vez». Con secciones.descuentoWeb = {activo, pct}:
--
--   · Solo citas reservadas en la página (no el bot, no el panel, no grupos ni canchas).
--   · Una vez por celular y negocio. Si esa cita se cancela o la apartada vence sin pagar, el
--     descuento vuelve a estar disponible; si vino, no vino o sigue en pie, ya se usó.
--   · El precio rebajado queda en la cita (appointment_services.price): la Caja propone ese
--     total y el adelanto se calcula sobre él (v2_adelanto_minimo recibe el total de la cita).
--
-- cita_srv_descuento_web la llama el servidor de la página justo después de crear la cita
-- (POST /api/tu-pagina/publico/reserva), con la clave del servidor, como cita_srv_sede.
--
-- Necesita 0011 (pagina_idem), 0021, 0023. Idempotente. Deshacer: 0038_descuento_web_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.descuentos_web (
    company_id     text not null,
    telefono       text not null,
    appointment_id text not null,
    pct            integer not null check (pct between 1 and 90),
    precio_antes   numeric not null default 0,
    precio         numeric not null default 0,
    created_at     timestamptz not null default now(),
    primary key (company_id, telefono)
);
alter table public.descuentos_web enable row level security;
drop policy if exists descuentos_web_leer on public.descuentos_web;
create policy descuentos_web_leer on public.descuentos_web
    for select to authenticated using ((select public.rol_en(company_id)) is not null);
revoke all on public.descuentos_web from anon;
grant select on public.descuentos_web to authenticated;

-- El % vigente (1–90) o null: apagado, mal escrito o fuera de rango.
create or replace function public.v2_descuento_web_pct(p_secciones jsonb)
returns integer language sql immutable as $$
    select case
        when coalesce((p_secciones #>> '{descuentoWeb,activo}')::boolean, false)
         and coalesce(p_secciones #>> '{descuentoWeb,pct}', '') ~ '^\d{1,2}$'
         and (p_secciones #>> '{descuentoWeb,pct}')::integer between 1 and 90
        then (p_secciones #>> '{descuentoWeb,pct}')::integer
    end
$$;

create or replace function public.cita_srv_descuento_web(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag   public.tu_pagina;
    v_pct   integer;
    v_tel   text := public.v2_telefono(p_telefono);
    v_cita  public.appointments;
    v_prev  public.descuentos_web;
    v_viva  boolean;
    v_antes numeric;
    v_total numeric;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    v_pct := public.v2_descuento_web_pct(v_pag.secciones);
    if v_pct is null then return jsonb_build_object('status', 'sin_descuento'); end if;
    if coalesce(v_tel, '') = '' then return jsonb_build_object('status', 'not_found'); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));
    -- La cita recién hecha en la página, de ESE celular, sin grupo (las de grupo no tienen fin).
    select a.* into v_cita
      from public.pagina_idem i
      join public.appointments a on a.id = i.ref_id and a.company_id = i.company_id
      join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
     where i.company_id = v_pag.company_id and i.codigo = upper(btrim(p_codigo))
       and l.phone = v_tel and coalesce(a.slot_end, '') <> '' and a.status in ('confirmed', 'pending_payment');
    if v_cita.id is null then return jsonb_build_object('status', 'not_found'); end if;

    select * into v_prev from public.descuentos_web where company_id = v_pag.company_id and telefono = v_tel;
    if found then
        if v_prev.appointment_id = v_cita.id then
            return jsonb_build_object('status', 'ok', 'pct', v_prev.pct, 'precio_antes', v_prev.precio_antes, 'precio', v_prev.precio, 'repetido', true);
        end if;
        -- ¿Sigue en pie la cita del descuento anterior? Cancelada o apartada vencida = no se usó.
        select exists (select 1 from public.appointments a where a.id = v_prev.appointment_id
                         and (a.status in ('confirmed', 'completed', 'no_show')
                              or (a.status = 'pending_payment' and public.v2_ocupa_hora(a.status, a.created_at))))
          into v_viva;
        if v_viva then return jsonb_build_object('status', 'usado'); end if;
    end if;

    select coalesce(sum(price), 0) into v_antes from public.appointment_services where appointment_id = v_cita.id;
    if v_antes <= 0 then return jsonb_build_object('status', 'sin_precio'); end if;
    update public.appointment_services set price = round(price * (100 - v_pct) / 100.0, 2) where appointment_id = v_cita.id;
    select coalesce(sum(price), 0) into v_total from public.appointment_services where appointment_id = v_cita.id;

    insert into public.descuentos_web (company_id, telefono, appointment_id, pct, precio_antes, precio)
    values (v_pag.company_id, v_tel, v_cita.id, v_pct, v_antes, v_total)
    on conflict (company_id, telefono) do update
        set appointment_id = excluded.appointment_id, pct = excluded.pct, precio_antes = excluded.precio_antes,
            precio = excluded.precio, created_at = now();
    return jsonb_build_object('status', 'ok', 'pct', v_pct, 'precio_antes', v_antes, 'precio', v_total, 'repetido', false);
end $$;

revoke execute on function public.v2_descuento_web_pct(jsonb) from public, anon, authenticated;
revoke execute on function public.cita_srv_descuento_web(text, text, text) from public, authenticated;
grant execute on function public.cita_srv_descuento_web(text, text, text) to anon;

commit;

notify pgrst, 'reload schema';

-- Comprobación: dos «sí».
select to_regprocedure('public.cita_srv_descuento_web(text, text, text)') is not null as descuento_web,
       to_regclass('public.descuentos_web') is not null as tabla;
