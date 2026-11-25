-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0035: en el CRM, mover a un contacto de columna a mano (25-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Las columnas del CRM (lib/panel/prospectos.ts) salen de hechos: cita, escalaciones, quién
-- escribió el último… Alvaro (25-nov): arrastrar depende de cómo atiende el negocio.
--
--   regla 'auto'     Mia cierra la venta sola (modo_atencion 'cierra', o un híbrido que el bot
--                    no puede aplicar). Las columnas las mueve Mia: no se arrastra.
--   regla 'hibrido'  Mia atiende y te deja la llamada agendada. A mano, solo a las columnas que
--                    son de la persona: «Demo agendada» y «Cliente» (la llamada y la venta).
--   regla 'manual'   No hay bot que mueva nada: modo «Lo contestas tú», o el negocio no tiene
--                    bot (sin fila en `instances`). La mano manda siempre, a cualquier columna.
--
-- La regla del híbrido es la del bot (services/modo-atencion.ts): business_mode 'appointment'
-- y el servicio de cierre en el catálogo y activo. Si no, el bot atiende como 'cierra'.
--
--   crm_etapas_a_mano(company)            → { regla, etapas: [{ lead_id, etapa, puesta_at }] }
--   crm_etapa_poner(company, lead, etapa) → la pone; con etapa null, «que lo decida Mia»
--
-- Quien ve el CRM (permiso clientes.ver) puede moverlo. Lo que se puso a mano se guarda aunque
-- luego cambie el modo: con 'auto' simplemente no se aplica, y vuelve si el modo vuelve.
--
-- Necesita la 0049 del bot (modo_atencion) y la 0041 (rol_en, puede). Idempotente.
-- Deshacer: drop function public.crm_etapa_poner(text, text, text);
--           drop function public.crm_etapas_a_mano(text); drop function public.crm_regla(text);
--           drop table public.crm_etapas;
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.crm_etapas (
    company_id text not null references public.companies(id) on delete cascade,
    lead_id    text not null,
    etapa      text not null check (etapa in ('te_toca', 'contactado', 'respondio', 'interesado', 'demo', 'cliente', 'bot')),
    puesta_por uuid,
    puesta_at  timestamptz not null default now(),
    primary key (company_id, lead_id)
);
-- Sin políticas: solo se toca a través de las dos funciones de abajo.
alter table public.crm_etapas enable row level security;
revoke all on table public.crm_etapas from public, anon, authenticated;

create or replace function public.crm_regla(p_company text)
returns text language sql stable security definer set search_path = public as $$
    select case
        when c.modo_atencion = 'dueno'
          or not exists (select 1 from public.instances i where i.company_id = c.id) then 'manual'
        when c.modo_atencion = 'hibrido'
          and c.business_mode = 'appointment'
          and exists (select 1 from public.catalog k
                       where k.company_id = c.id and k.id = c.servicio_cierre and coalesce(k.is_active, 1) <> 0) then 'hibrido'
        else 'auto'
    end
      from public.companies c
     where c.id = p_company;
$$;

create or replace function public.crm_etapas_a_mano(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if not coalesce(public.puede(p_company, 'clientes.ver'), false) and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a los clientes de este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'regla', coalesce(public.crm_regla(p_company), 'auto'),
        'etapas', coalesce((select jsonb_agg(jsonb_build_object('lead_id', e.lead_id, 'etapa', e.etapa, 'puesta_at', e.puesta_at))
                              from public.crm_etapas e where e.company_id = p_company), '[]'::jsonb));
end $$;

create or replace function public.crm_etapa_poner(p_company text, p_lead text, p_etapa text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_regla text;
begin
    if not coalesce(public.puede(p_company, 'clientes.ver'), false) and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a los clientes de este negocio.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.leads l where l.id = p_lead and l.company_id = p_company) then
        raise exception 'Ese contacto no es de este negocio.';
    end if;

    -- «Que lo decida Mia»: siempre se puede, con cualquier regla.
    if p_etapa is null then
        delete from public.crm_etapas where company_id = p_company and lead_id = p_lead;
        return jsonb_build_object('lead_id', p_lead, 'etapa', null);
    end if;

    v_regla := coalesce(public.crm_regla(p_company), 'auto');
    if v_regla = 'auto' then
        raise exception 'Con «Cierra la venta», las columnas las mueve Mia según la conversación.';
    end if;
    if v_regla = 'hibrido' and p_etapa not in ('demo', 'cliente') then
        raise exception 'En el modo híbrido solo mueves tú a «Demo agendada» y a «Cliente»: lo demás lo lleva Mia.';
    end if;
    if p_etapa not in ('te_toca', 'contactado', 'respondio', 'interesado', 'demo', 'cliente', 'bot') then
        raise exception 'Esa columna no existe: %', p_etapa;
    end if;

    insert into public.crm_etapas (company_id, lead_id, etapa, puesta_por, puesta_at)
    values (p_company, p_lead, p_etapa, (select auth.uid()), now())
    on conflict (company_id, lead_id) do update
       set etapa = excluded.etapa, puesta_por = excluded.puesta_por, puesta_at = excluded.puesta_at;
    return jsonb_build_object('lead_id', p_lead, 'etapa', p_etapa);
end $$;

revoke all on function public.crm_regla(text) from public, anon, authenticated;
revoke all on function public.crm_etapas_a_mano(text) from public, anon;
revoke all on function public.crm_etapa_poner(text, text, text) from public, anon;
grant execute on function public.crm_etapas_a_mano(text) to authenticated;
grant execute on function public.crm_etapa_poner(text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
