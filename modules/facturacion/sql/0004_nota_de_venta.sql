-- ═══════════════════════════════════════════════════════════════════════════════
-- Boletas y facturas · 0004: NOTA DE VENTA (comprobante interno, sin SUNAT)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 18-nov-2026 (The 24/7): «que al cobrar se pueda escoger nota de venta o boleta electrónica, y
-- enviar el comprobante por WhatsApp: la imagen del ticket y un texto».
--
-- La nota de venta es el ticket del negocio: lo cobrado, numerado (NV-000001…), sin SUNAT. No
-- necesita las boletas activadas.
--
--   · notas_venta: una por cobro (ref_tipo/ref_id: la cita). Volver a pedirla devuelve la misma.
--   · nota_emitir(company, datos): la apunta con el siguiente número del negocio. Cualquiera del
--     equipo que cobre (v2_autorizar_agenda con empleado).
--   · nota_publica(id): para el enlace que va por WhatsApp (/nota/<id>), sin sesión: el id es un
--     uuid al azar, como factura_publica. Trae los datos del negocio para pintar el ticket.
--
-- Los datos del negocio salen de Ajustes › Boletas (si están) o de Mi página › Libro de
-- Reclamaciones; el nombre, del comercial o del negocio.
-- Necesita v2_autorizar_agenda. Idempotente. Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.notas_venta (
    id           uuid primary key default gen_random_uuid(),
    company_id   text not null,
    numero       integer not null check (numero > 0),
    ref_tipo     text not null default '' check (char_length(ref_tipo) <= 20),
    ref_id       text not null default '' check (char_length(ref_id) <= 80),
    lineas       jsonb not null default '[]'::jsonb,
    total        numeric(12,2) not null check (total >= 0),
    cliente      text not null default '' check (char_length(cliente) <= 120),
    telefono     text not null default '' check (telefono ~ '^\d{0,15}$'),
    atendio      text not null default '' check (char_length(atendio) <= 80),
    emitida_por  uuid,
    emitida_at   timestamptz not null default now(),
    unique (company_id, numero)
);
create unique index if not exists notas_venta_por_cobro on public.notas_venta (company_id, ref_tipo, ref_id) where ref_id <> '';
alter table public.notas_venta enable row level security;
revoke all on public.notas_venta from anon, authenticated;

-- La nota con lo que hace falta para pintarla (los datos del negocio incluidos).
create or replace function public.nota_json(n public.notas_venta)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'id', n.id, 'numero', n.numero, 'lineas', n.lineas, 'total', n.total, 'cliente', n.cliente,
        'telefono', n.telefono, 'atendio', n.atendio, 'emitida_at', n.emitida_at,
        'negocio', jsonb_build_object(
            'nombre', coalesce(nullif(btrim(a.nombre_comercial), ''), nullif(btrim(c.name), ''), ''),
            'razon_social', coalesce(nullif(btrim(a.razon_social), ''), btrim(coalesce(p.secciones #>> '{proveedor,razon_social}', ''))),
            'ruc', coalesce(nullif(a.ruc, ''), regexp_replace(coalesce(p.secciones #>> '{proveedor,ruc}', ''), '\D', '', 'g')),
            'direccion', coalesce(nullif(btrim(a.direccion), ''), btrim(coalesce(p.secciones #>> '{proveedor,direccion}', ''))),
            'ticket_ancho', coalesce(a.ticket_ancho, 80)))
      from (select 1) x
      left join public.companies c on c.id = n.company_id
      left join public.factura_ajustes a on a.company_id = n.company_id
      left join public.tu_pagina p on p.company_id = n.company_id;
$$;

create or replace function public.nota_emitir(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d        jsonb := coalesce(p_datos, '{}'::jsonb);
    v_ref_t  text := left(btrim(coalesce(d->>'ref_tipo', '')), 20);
    v_ref_i  text := left(btrim(coalesce(d->>'ref_id', '')), 80);
    v_lineas jsonb;
    v_total  numeric;
    v_fila   public.notas_venta;
begin
    perform public.v2_autorizar_agenda(p_company, true);

    -- El mismo cobro, la misma nota (dos toques, otra pestaña).
    if v_ref_i <> '' then
        select * into v_fila from public.notas_venta where company_id = p_company and ref_tipo = v_ref_t and ref_id = v_ref_i;
        if found then return public.nota_json(v_fila); end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
               'descripcion', left(btrim(l->>'descripcion'), 250),
               'cantidad', round((l->>'cantidad')::numeric, 3),
               'precio', round((l->>'precio')::numeric, 2))), '[]'::jsonb),
           coalesce(sum(round((l->>'cantidad')::numeric * (l->>'precio')::numeric, 2)), 0)
      into v_lineas, v_total
      from jsonb_array_elements(case when jsonb_typeof(d->'lineas') = 'array' then d->'lineas' else '[]' end) l
     where btrim(coalesce(l->>'descripcion', '')) <> ''
       and coalesce((l->>'cantidad')::numeric, 0) > 0 and coalesce((l->>'precio')::numeric, -1) >= 0;
    if jsonb_array_length(v_lineas) = 0 then
        raise exception 'La nota no tiene nada cobrado.' using errcode = '22023';
    end if;

    -- El siguiente número del negocio, sin carreras entre dos cajas.
    perform pg_advisory_xact_lock(hashtext('nota_venta:' || p_company));
    insert into public.notas_venta (company_id, numero, ref_tipo, ref_id, lineas, total, cliente, telefono, atendio, emitida_por)
    values (p_company,
            coalesce((select max(numero) from public.notas_venta where company_id = p_company), 0) + 1,
            v_ref_t, v_ref_i, v_lineas, round(v_total, 2),
            left(btrim(coalesce(d->>'cliente', '')), 120),
            right(regexp_replace(coalesce(d->>'telefono', ''), '\D', '', 'g'), 15),
            left(btrim(coalesce(d->>'atendio', '')), 80),
            auth.uid())
    returning * into v_fila;
    return public.nota_json(v_fila);
end $$;

create or replace function public.nota_publica(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select public.nota_json(n) from public.notas_venta n where n.id = p_id;
$$;

revoke execute on function public.nota_json(public.notas_venta) from public, anon, authenticated;
revoke execute on function public.nota_emitir(text, jsonb) from public, anon;
grant execute on function public.nota_emitir(text, jsonb) to authenticated;
revoke execute on function public.nota_publica(uuid) from public;
grant execute on function public.nota_publica(uuid) to anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí» y «sí».
select to_regprocedure('public.nota_emitir(text,jsonb)') is not null as emitir,
       to_regprocedure('public.nota_publica(uuid)') is not null as publica;

-- Deshacer:
-- begin;
-- drop function if exists public.nota_publica(uuid);
-- drop function if exists public.nota_emitir(text, jsonb);
-- drop function if exists public.nota_json(public.notas_venta);
-- drop table if exists public.notas_venta;
-- commit;
