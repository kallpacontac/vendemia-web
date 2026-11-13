-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0010: el comprobante del pago al cobrar desde el panel
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Alvaro (10-nov-2026): la foto del comprobante solo existía en el tablero de canchas.
-- Ahora es una opción de cada negocio, en Configuración › Negocio, con tres valores:
--
--   · apagada      El panel no ofrece la foto. Lo de siempre.
--   · opcional     «Foto del pago» al cobrar: se lee, rellena monto y método, y se guarda.
--   · obligatoria  Igual, y además Postgres NO registra un cobro por Yape, Plin o transferencia
--                  sin su foto. Efectivo y contra entrega no la piden nunca.
--
-- Cubre TODOS los cobros de una cita o reserva desde el panel, que son tres puertas:
--   · agenda_registrar_pago   «Registrar pago» (Caja, Agenda, Alumnos): con importe.
--   · agenda_marcar_pagado    «Cobrada» (Caja, Agenda): sin importe, «cobré lo que faltaba».
--   · cancha_validar_pago     «Validar pago» del tablero de canchas.
-- Las tres comparten la misma regla (v2_foto_pago_validar), así que «obligatoria» no se puede
-- saltar eligiendo otro botón. Lo que hace el bot con la clave de servidor no se toca: el bot
-- ya trae su propia captura.
--
-- Fuera: los pedidos (Pedidos › «Cobrado»), que no eligen método. La tabla ya admite
-- ref_tipo = 'order' para cuando se haga.
--
-- Cada foto queda en `comprobantes_cobro` (de quién, de qué cita, qué operación, quién la subió),
-- y también en pending_payments cuando el cobro lleva importe, como hacía el tablero. La misma
-- foto o el mismo n.º de operación no entran dos veces, sumando los tres caminos: el panel, la
-- página (comprobantes_web) y lo que verificó el bot (pending_payments).
--
-- Quién: elegir la opción, SOLO el dueño (protege su dinero de un cobro apuntado sin pruebas).
-- Subir la foto y cobrar, el dueño y el administrador (v2_autorizar_agenda), como hasta ahora.
--
-- Necesita: datos 0004 y 0005, tu-pagina 0011 y 0017. Trae su propia v2_valida_operacion (la de la 0018).
-- Los negocios con canchas encendidas arrancan en «opcional»: no pierden la foto que ya tenían.
--
-- Idempotente. Pruebas: tests/pruebas_0010.sql. Deshacer: scripts/comprobante-al-cobrar-0010-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · La opción del negocio ─────────────────────────────────────────────────

create table if not exists public.cobro_ajustes (
    company_id      text primary key,
    foto_pago       text not null default 'apagada' check (foto_pago in ('apagada', 'opcional', 'obligatoria')),
    actualizado_por uuid,
    actualizado_at  timestamptz not null default now()
);
alter table public.cobro_ajustes enable row level security;
revoke all on public.cobro_ajustes from anon, authenticated;

-- Canchas: ya tenían la foto en «Validar pago». Que sigan igual. Se compara el texto y no se
-- convierte a boolean: una página con un valor raro en `reservar` no puede tumbar la migración.
insert into public.cobro_ajustes (company_id, foto_pago)
select distinct p.company_id, 'opcional' from public.tu_pagina p
 where p.company_id is not null
   and lower(coalesce(p.secciones->>'reservar', '')) = 'true'
   and lower(coalesce(p.secciones#>>'{canchas,activo}', '')) = 'true'
on conflict (company_id) do nothing;

create or replace function public.v2_foto_pago(p_company text)
returns text language sql stable security definer set search_path = public as $$
    select coalesce((select foto_pago from public.cobro_ajustes where company_id = p_company), 'apagada');
$$;

-- ── 2 · Cada foto, con su cobro ───────────────────────────────────────────────

create table if not exists public.comprobantes_cobro (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null,
    ref_tipo    text not null check (ref_tipo in ('appointment', 'order')),
    ref_id      text not null,
    -- pending_payments.id cuando el cobro llevaba importe; '' en «Cobrada».
    pago_id     text not null default '',
    via         text not null check (via in ('registrar_pago', 'cobrada', 'cancha')),
    url         text not null,
    image_hash  text not null,
    operacion   text not null default '',
    metodo      text not null default '',
    monto       numeric(12,2),
    subido_por  uuid,
    creado_at   timestamptz not null default now(),
    unique (company_id, image_hash)
);
create index if not exists comprobantes_cobro_ref on public.comprobantes_cobro (company_id, ref_tipo, ref_id);
create index if not exists comprobantes_cobro_dia on public.comprobantes_cobro (company_id, creado_at);
create index if not exists comprobantes_cobro_op on public.comprobantes_cobro (company_id, operacion) where operacion <> '';
alter table public.comprobantes_cobro enable row level security;
revoke all on public.comprobantes_cobro from anon, authenticated;

-- ¿Se rechaza una operación repetida en este negocio? Sí, salvo secciones.canchas.validarOperacion
-- = false. Es la de tu-pagina 0018, repetida aquí tal cual: en producción se corrió una 0018
-- anterior a este interruptor y la función no existía (12-nov-2026).
create or replace function public.v2_valida_operacion(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce(public.v2_canchas_cfg(p_company) ->> 'validarOperacion', 'true') <> 'false';
$$;
revoke execute on function public.v2_valida_operacion(text) from public, anon, authenticated;

-- La regla, en un solo sitio. Devuelve la foto limpia ({url, hash, op}) o null si no hay foto.
-- Falla si el negocio la exige y no viene, si no es una foto subida por el servidor, o si esa
-- foto o esa operación ya están registradas por cualquiera de los tres caminos.
-- Se llama con el candado del negocio puesto (tu_pagina:<company>), como el resto del dinero.
create or replace function public.v2_foto_pago_validar(p_company text, p_metodo text, p_foto jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_hay  boolean := p_foto is not null and jsonb_typeof(p_foto) = 'object';
    v_url  text := case when v_hay then btrim(coalesce(p_foto->>'url', '')) else '' end;
    v_hash text := case when v_hay then lower(btrim(coalesce(p_foto->>'hash', ''))) else '' end;
    v_op   text := case when v_hay then regexp_replace(coalesce(p_foto->>'operacion', ''), '\D', '', 'g') else '' end;
begin
    if v_url = '' and v_hash = '' then
        if public.v2_foto_pago(p_company) = 'obligatoria'
           and coalesce(p_metodo, '') not in ('cash', 'cod')
           and coalesce((select auth.role()), '') <> 'service_role' then
            raise exception 'Este negocio pide la foto del comprobante para cobrar por %. Súbela y vuelve a intentarlo.',
                case p_metodo when 'yape' then 'Yape' when 'plin' then 'Plin' when 'bank_transfer' then 'transferencia'
                              else 'Yape, Plin o transferencia' end;
        end if;
        return null;
    end if;
    -- Solo fotos que subió el propio servidor a Cloudinary, con su huella: nada de enlaces cualquiera.
    if v_url !~ '^https://res\.cloudinary\.com/' or v_hash !~ '^[0-9a-f]{64}$' then
        raise exception 'La foto del pago no es válida. Vuelve a tomarla.';
    end if;
    if exists (select 1 from public.pending_payments where company_id = p_company and image_hash = v_hash)
       or exists (select 1 from public.comprobantes_cobro where company_id = p_company and image_hash = v_hash)
       or exists (select 1 from public.comprobantes_web where company_id = p_company and image_hash = v_hash and estado <> 'rechazado') then
        raise exception 'Esta misma foto ya se usó para registrar otro pago.';
    end if;
    if v_op <> '' and public.v2_valida_operacion(p_company)
       and (exists (select 1 from public.pending_payments where company_id = p_company and operation_id = v_op)
            or exists (select 1 from public.comprobantes_cobro where company_id = p_company and operacion = v_op)
            or exists (select 1 from public.comprobantes_web where company_id = p_company and operacion = v_op and estado <> 'rechazado')) then
        raise exception 'La operación #% ya fue registrada antes.', v_op;
    end if;
    return jsonb_build_object('url', v_url, 'hash', v_hash, 'op', v_op);
end $$;

create or replace function public.v2_foto_pago_guardar(p_company text, p_tipo text, p_ref text, p_pago text, p_via text,
                                                      p_foto jsonb, p_metodo text, p_monto numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
    if p_foto is null then return; end if;
    insert into public.comprobantes_cobro (company_id, ref_tipo, ref_id, pago_id, via, url, image_hash, operacion, metodo, monto, subido_por)
    values (p_company, p_tipo, p_ref, coalesce(p_pago, ''), p_via, p_foto->>'url', p_foto->>'hash', coalesce(p_foto->>'op', ''),
            coalesce(p_metodo, ''), p_monto, (select auth.uid()));
end $$;

-- ── 3 · Lo que llama el panel ─────────────────────────────────────────────────

-- Cómo está la opción. Cualquiera del negocio (el empleado también ve la Agenda).
-- `nube` = la agenda la lleva Postgres: con el bot, la foto no tiene dónde guardarse.
create or replace function public.cobro_foto_modo(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null and coalesce((select auth.role()), '') <> 'service_role' then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object('modo', public.v2_foto_pago(p_company), 'nube', public.agenda_en_nube(p_company));
end $$;

-- Cambiarla: solo el dueño.
create or replace function public.cobro_foto_guardar(p_company text, p_modo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol <> 'dueno' then raise exception 'Esto solo lo cambia el dueño del negocio.' using errcode = '42501'; end if;
    if p_modo is null or p_modo not in ('apagada', 'opcional', 'obligatoria') then
        raise exception 'Opción no válida: elige apagada, opcional u obligatoria.';
    end if;
    insert into public.cobro_ajustes (company_id, foto_pago, actualizado_por, actualizado_at)
    values (p_company, p_modo, (select auth.uid()), now())
    on conflict (company_id) do update
       set foto_pago = excluded.foto_pago, actualizado_por = excluded.actualizado_por, actualizado_at = excluded.actualizado_at;
    return jsonb_build_object('modo', p_modo);
end $$;

-- La puerta de la ruta que sube y lee la foto (/api/cobros/foto): dueño o administrador, agenda
-- en la nube, y la opción encendida. Devuelve la opción.
create or replace function public.cobro_foto_permiso(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_modo text;
begin
    perform public.v2_autorizar_agenda(p_company);
    v_modo := public.v2_foto_pago(p_company);
    if v_modo = 'apagada' then
        raise exception 'La foto del comprobante está apagada en Configuración › Negocio.' using errcode = '42501';
    end if;
    return v_modo;
end $$;

-- Las fotos de un día (hora de Lima), para la Caja: las del panel y las que el cliente subió en la
-- página y quedaron aprobadas. Dueño o administrador.
create or replace function public.cobro_fotos_del_dia(p_company text, p_dia text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    if coalesce(p_dia, '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Día no válido: %', p_dia; end if;
    return coalesce((
        select jsonb_agg(f.fila order by f.cuando desc)
          from (select c.creado_at as cuando,
                       jsonb_build_object('id', c.id, 'url', c.url, 'operacion', c.operacion, 'metodo', c.metodo,
                           'monto', c.monto, 'via', c.via, 'creado_at', c.creado_at,
                           'cliente', coalesce(nullif(l.name, ''), l.phone, ''), 'servicio', coalesce(a.service, ''),
                           'slot', coalesce(a.slot_start, '')) as fila
                  from public.comprobantes_cobro c
                  left join public.appointments a on c.ref_tipo = 'appointment' and a.id = c.ref_id and a.company_id = c.company_id
                  left join public.leads l on l.id = a.lead_id and l.company_id = c.company_id
                 where c.company_id = p_company
                   and (c.creado_at at time zone 'America/Lima')::date = p_dia::date
                union all
                select w.revisado_at,
                       jsonb_build_object('id', w.id, 'url', w.url, 'operacion', w.operacion, 'metodo', w.metodo,
                           'monto', w.monto, 'via', 'pagina', 'creado_at', w.revisado_at,
                           'cliente', coalesce(nullif(l.name, ''), l.phone, ''), 'servicio', coalesce(a.service, ''),
                           'slot', coalesce(a.slot_start, ''))
                  from public.comprobantes_web w
                  left join public.appointments a on a.id = w.appointment_id and a.company_id = w.company_id
                  left join public.leads l on l.id = w.lead_id and l.company_id = w.company_id
                 where w.company_id = p_company and w.estado = 'aprobado' and w.url <> ''
                   and (w.revisado_at at time zone 'America/Lima')::date = p_dia::date
                 limit 300) f), '[]'::jsonb);
end $$;

-- ── 4 · «Registrar pago»: la de la 0005 con la foto ───────────────────────────
-- Cambios marcados con «0010». El resto, igual que la 0005.

create or replace function public.agenda_registrar_pago(p_company text, p_datos jsonb, p_op text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_lead     public.leads;
    v_monto    numeric;
    v_metodo   text := btrim(coalesce(nullif(p_datos->>'metodo_pago', ''), 'cash'));
    v_op       text := 'panel:' || coalesce(nullif(p_op, ''), gen_random_uuid()::text);
    v_hoy      text := left(public.v2_ahora(), 10);
    v_dest     public.appointments;
    v_total    numeric := 0;
    v_pagado   numeric := 0;
    v_desde    bigint;
    a          public.appointments;
    v_item     public.catalog;
    v_franja   jsonb;
    v_cap      integer;
    v_n        integer;
    v_conf     integer := 0;
    v_llenos   text[] := '{}';
    v_ids      text[];
    v_motivo   text;
    v_confirma boolean := false;
    v_foto     jsonb;                                -- 0010
    v_pago_id  text := gen_random_uuid()::text;      -- 0010
    v_op_pago  text;                                 -- 0010
begin
    perform public.v2_autorizar_agenda(p_company);
    select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
    if not found then raise exception 'Ese cliente no es de este negocio.'; end if;
    begin
        v_monto := (p_datos->>'monto')::numeric;
    exception when others then
        v_monto := null;
    end;
    if v_monto is null or v_monto <= 0 then raise exception 'monto inválido: es el importe cobrado, un número mayor que 0'; end if;
    if v_metodo not in ('yape', 'plin', 'bank_transfer', 'cash', 'cod') then
        raise exception 'metodo_pago inválido: "%". Valores: yape · plin · bank_transfer · cash · cod', v_metodo;
    end if;
    if exists (select 1 from public.pending_payments where operation_id = v_op) then
        return jsonb_build_object('lead_id', v_lead.id, 'monto', v_monto, 'metodo_pago', v_metodo, 'duplicado', true);
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    -- 0010: la foto, con el candado puesto. La operación leída de la captura sustituye al id del
    -- panel: así el bot también reconoce ese Yape si luego llega por WhatsApp.
    v_foto := public.v2_foto_pago_validar(p_company, v_metodo, p_datos->'foto');
    v_op_pago := coalesce(nullif(v_foto->>'op', ''), v_op);

    -- ── Una CITA PUNTUAL (19-oct-2026): la seña o el resto, en efectivo o como sea ──────────
    if coalesce(p_datos->>'appointment_id', '') <> '' then
        select * into v_dest from public.appointments
         where company_id = p_company and id = p_datos->>'appointment_id' and lead_id = v_lead.id;
        if not found then raise exception 'esa cita no es de este cliente'; end if;
        if v_dest.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
            if v_dest.status not in ('confirmed', 'pending_payment', 'completed') then
                raise exception 'esa cita está cancelada o no vino: no se le registra un pago';
            end if;
            if coalesce(v_dest.pagado_por, '') <> '' then
                raise exception 'esa cita ya consta cobrada entera';
            end if;
            if v_dest.status = 'pending_payment' then
                v_motivo := public.v2_hueco(p_company, v_dest.slot_start, v_dest.slot_minutes, v_dest.employee_id, v_dest.id);
                if v_motivo is not null then
                    raise exception 'no se puede confirmar: %. Muévela a otra hora y registra el pago', v_motivo;
                end if;
                v_confirma := true;
            end if;

            insert into public.pending_payments (id, lead_id, company_id, amount, voucher_path, operation_id, image_hash, verified, order_id, appointment_id)
            values (v_pago_id, v_lead.id, p_company, v_monto, coalesce(v_foto->>'url', ''), v_op_pago, coalesce(v_foto->>'hash', ''), 1, '', v_dest.id);
            perform public.v2_foto_pago_guardar(p_company, 'appointment', v_dest.id, v_pago_id, 'registrar_pago', v_foto, v_metodo, v_monto);
            select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_dest.id;
            select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
             where p.company_id = p_company and p.appointment_id = v_dest.id;
            update public.appointments
               set metodo_pago = v_metodo,
                   status      = case when v_confirma then 'confirmed' else status end,
                   pagado_por  = case when v_total > 0 and v_pagado >= v_total then 'panel' else pagado_por end
             where id = v_dest.id;

            return jsonb_build_object('lead_id', v_lead.id, 'monto', v_monto, 'metodo_pago', v_metodo, 'appointment_id', v_dest.id,
                'cobrada', v_total > 0 and v_pagado >= v_total, 'foto', v_foto is not null,
                'detalle', 'S/ ' || v_pagado || ' de S/ ' || v_total
                           || case when v_total > v_pagado then ' (faltan S/ ' || (v_total - v_pagado) || ')' else ' (cobrada)' end
                           || case when v_confirma then ' · cita confirmada' else '' end);
        end if;
    end if;

    -- La venta viva: sus inscripciones que siguen en pie.
    v_ids := array(select id from public.appointments
                    where company_id = p_company and lead_id = v_lead.id and slot_start like 'sched:%'
                      and status in ('pending_payment', 'confirmed') and (coalesce(periodo_hasta, '') = '' or periodo_hasta >= v_hoy));
    if cardinality(v_ids) = 0 then
        raise exception 'este cliente no tiene ninguna inscripción viva a la que atribuir el pago. Para cobrar un PEDIDO usa «Cobrada»';
    end if;

    if coalesce(p_datos->>'appointment_id', '') <> '' then
        select * into v_dest from public.appointments where id = p_datos->>'appointment_id' and id = any(v_ids);
        if not found then raise exception 'esa inscripción no es una viva de este cliente'; end if;
    else
        select * into v_dest from public.appointments where id = any(v_ids) order by (status = 'pending_payment') desc, created_at desc limit 1;
    end if;

    insert into public.pending_payments (id, lead_id, company_id, amount, voucher_path, operation_id, image_hash, verified, order_id, appointment_id)
    values (v_pago_id, v_lead.id, p_company, v_monto, coalesce(v_foto->>'url', ''), v_op_pago, coalesce(v_foto->>'hash', ''), 1, '', v_dest.id);
    perform public.v2_foto_pago_guardar(p_company, 'appointment', v_dest.id, v_pago_id, 'registrar_pago', v_foto, v_metodo, v_monto);
    update public.appointments set metodo_pago = v_metodo where id = v_dest.id;

    -- El saldo es de la VENTA (settlePendingEnrolment): líneas de todas sus inscripciones vivas…
    select coalesce(sum(coalesce(nullif((select sum(s.price) from public.appointment_services s where s.appointment_id = x.id), 0),
                                 (select k.price from public.catalog k where k.company_id = p_company and k.id = split_part(x.slot_start, ':', 2)), 0)), 0),
           min(x.created_at)
      into v_total, v_desde from public.appointments x where x.id = any(v_ids);
    -- …contra sus pagos: los enganchados a ellas y los sueltos que llegaron después.
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
     where p.lead_id = v_lead.id and p.company_id = p_company
       and ((p.appointment_id <> '' and p.appointment_id = any(v_ids))
         or (p.appointment_id = '' and p.order_id = '' and p.created_at >= v_desde));

    for a in select * from public.appointments where id = any(v_ids) and status = 'pending_payment' loop
        select * into v_item from public.catalog where company_id = p_company and id = split_part(a.slot_start, ':', 2);
        select f into v_franja from jsonb_array_elements(public.v2_franjas(v_item.schedule_slots)) f
         where f->>'id' = split_part(a.slot_start, ':', 3) limit 1;
        v_cap := coalesce((v_franja->>'capacity')::integer, -1);
        if v_cap <> -1 then
            select count(*) into v_n from public.appointments o
             where o.company_id = p_company and o.slot_start = a.slot_start and o.status = 'confirmed'
               and (coalesce(o.periodo_desde, '') = '' or coalesce(a.periodo_desde, '') = ''
                    or (o.periodo_desde <= a.periodo_hasta and o.periodo_hasta >= a.periodo_desde));
            if v_n >= v_cap then
                v_llenos := v_llenos || (coalesce(nullif(btrim(a.beneficiario), ''), 'el cliente') || ' en «' || coalesce(v_franja->>'label', a.service) || '»');
                continue;
            end if;
        end if;
        update public.appointments set status = 'confirmed', pagado_por = 'panel' where id = a.id;
        v_conf := v_conf + 1;
    end loop;

    return jsonb_build_object('lead_id', v_lead.id, 'monto', v_monto, 'metodo_pago', v_metodo, 'appointment_id', v_dest.id,
        'foto', v_foto is not null,
        'detalle', 'S/ ' || v_pagado || ' de S/ ' || v_total
                   || case when v_total > v_pagado then ' (faltan S/ ' || (v_total - v_pagado) || ')' else ' (pagado completo)' end
                   || case when v_conf > 0 then ' · ' || v_conf || ' cupo(s) confirmado(s)' else '' end
                   || case when cardinality(v_llenos) > 0 then ' · GRUPO LLENO, lo resuelve una persona: ' || array_to_string(v_llenos, ', ') else '' end);
end $$;

-- ── 5 · «Cobrada»: la de la 0004 con la foto (solo citas) ─────────────────────

create or replace function public.agenda_marcar_pagado(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tipo   text := p_datos->>'tipo';
    v_id     text := p_datos->>'id';
    v_metodo text := btrim(coalesce(p_datos->>'metodo_pago', ''));
    v_antes  text;
    v_slot   text;
    v_min    integer;
    v_emp    text;
    v_falta  boolean;
    v_motivo text;
    v_ya     text;      -- 0010: pagado_por antes de tocarla
    v_foto   jsonb;     -- 0010
    v_total  numeric;   -- 0010
    v_pagado numeric;   -- 0010
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_tipo not in ('order', 'appointment') then raise exception 'tipo debe ser order o appointment'; end if;
    if v_metodo <> '' and v_metodo not in ('yape', 'plin', 'bank_transfer', 'cash', 'cod') then
        raise exception 'metodo_pago inválido: "%". Valores: yape · plin · bank_transfer · cash · cod', v_metodo;
    end if;
    if v_tipo = 'order' then
        select status into v_antes from public.orders where company_id = p_company and id = v_id;
    else
        select status, slot_start, slot_minutes, employee_id, coalesce(pagado_por, '') into v_antes, v_slot, v_min, v_emp, v_ya
          from public.appointments where company_id = p_company and id = v_id;
    end if;
    if v_antes is null then raise exception 'Eso no existe en este negocio.'; end if;
    if v_antes = 'cancelled' then
        raise exception '%: no se puede marcar como pagada. Si el cliente pagó y lo quiere igual, se crea de nuevo',
            case when v_tipo = 'order' then 'ese pedido está cancelado' else 'esa cita está cancelada' end;
    end if;

    -- 0010: la foto de una cita que todavía no consta cobrada (re-marcar una ya cobrada no la pide).
    if v_tipo = 'appointment' and v_ya = '' then
        perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
        v_foto := public.v2_foto_pago_validar(p_company, v_metodo, p_datos->'foto');
    end if;

    v_falta := (v_tipo = 'order' and v_antes = 'pending') or (v_tipo = 'appointment' and v_antes = 'pending_payment');
    if v_falta then
        if v_tipo = 'order' then
            update public.orders set status = 'paid' where id = v_id;
        else
            if v_slot not like 'sched:%' then
                perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
                v_motivo := public.v2_hueco(p_company, v_slot, v_min, v_emp, v_id);
                if v_motivo is not null then
                    raise exception 'no se puede confirmar: %. Muévela a otra hora y márcala pagada', v_motivo;
                end if;
            end if;
            update public.appointments set status = 'confirmed' where id = v_id;
        end if;
    end if;
    if v_tipo = 'order' then
        update public.orders set pagado_por = 'panel' where id = v_id;
    else
        update public.appointments set pagado_por = 'panel',
               metodo_pago = case when v_metodo <> '' then v_metodo else metodo_pago end where id = v_id;
        -- 0010: «Cobrada» no lleva importe; la foto se guarda con lo que faltaba, que es lo que cubrió.
        if v_foto is not null then
            select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_id;
            select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
             where p.company_id = p_company and p.appointment_id = v_id;
            perform public.v2_foto_pago_guardar(p_company, 'appointment', v_id, '', 'cobrada', v_foto, v_metodo,
                                                nullif(greatest(v_total - v_pagado, 0), 0));
        end if;
    end if;
    return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'cambio', v_falta, 'antes', v_antes, 'pagado_por', 'panel',
                              'foto', v_foto is not null)
           || case when v_metodo <> '' then jsonb_build_object('metodo_pago', v_metodo) else '{}'::jsonb end;
end $$;

-- ── 6 · «Validar pago» de canchas: la de la 0018 con la regla común ──────────

create or replace function public.cancha_validar_pago(p_company text, p_appointment text, p_monto numeric, p_metodo text,
                                                      p_url text default '', p_hash text default '', p_op text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cita    public.appointments;
    v_total   numeric;
    v_pagado  numeric;
    v_foto    jsonb;
    v_pago_id text;
    v_r       jsonb;
begin
    -- Sin el segundo argumento, el empleado no pasa: el dinero es del dueño y del administrador.
    perform public.v2_autorizar_agenda(p_company);
    if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto que recibiste.'; end if;
    if p_metodo not in ('yape', 'plin', 'cash', 'bank_transfer') then raise exception 'Elige cómo te pagaron.'; end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    select * into v_cita from public.appointments where id = p_appointment and company_id = p_company;
    if not found then raise exception 'Esa reserva no es de este negocio.'; end if;
    if v_cita.status not in ('pending_payment', 'confirmed', 'completed') then
        raise exception 'Esta reserva está cancelada: no se le registra un pago.';
    end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Esta reserva ya está cobrada completa.'; end if;

    -- 0010: foto válida, no repetida y, si el negocio la exige, presente.
    v_foto := public.v2_foto_pago_validar(p_company, p_metodo,
        case when btrim(coalesce(p_url, '')) = '' and btrim(coalesce(p_hash, '')) = '' then null
             else jsonb_build_object('url', p_url, 'hash', p_hash, 'operacion', p_op) end);

    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id;
    if p_monto > v_total - v_pagado then
        raise exception 'Le faltan S/ %: no se puede registrar más que eso.', greatest(v_total - v_pagado, 0);
    end if;

    v_r := public.v2_comprobante_aplicar(v_cita, p_monto, p_metodo,
                                         coalesce(nullif(v_foto->>'op', ''), 'panel:' || gen_random_uuid()),
                                         coalesce(v_foto->>'hash', ''), coalesce(v_foto->>'url', ''), 'panel');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Mueve la reserva a otra hora y vuelve a validar.', v_r->>'motivo';
    end if;
    if v_foto is not null then
        select id into v_pago_id from public.pending_payments
         where company_id = p_company and appointment_id = v_cita.id and image_hash = v_foto->>'hash' limit 1;
        perform public.v2_foto_pago_guardar(p_company, 'appointment', v_cita.id, v_pago_id, 'cancha', v_foto, p_metodo, p_monto);
    end if;
    return v_r || jsonb_build_object('foto', v_foto is not null, 'detalle', case v_r->>'resultado'
        when 'parcial' then 'Pago apuntado, pero no alcanza el adelanto: sigue apartada. Faltan S/ '
                            || ((v_r->>'minimo')::numeric - (v_r->>'pagado')::numeric) || ' para confirmarla.'
        when 'cobrada' then 'Pago validado. Reserva cobrada completa.'
        when 'confirmada' then 'Pago validado. Reserva confirmada. Faltan S/ ' || (v_r->>'falta') || '.'
        else 'Pago validado. Faltan S/ ' || (v_r->>'falta') || '.' end);
end $$;

-- ── 7 · Permisos ──────────────────────────────────────────────────────────────

do $$
declare f text;
begin
    foreach f in array array[
        'v2_foto_pago(text)',
        'v2_foto_pago_validar(text, text, jsonb)',
        'v2_foto_pago_guardar(text, text, text, text, text, jsonb, text, numeric)',
        'cobro_foto_modo(text)',
        'cobro_foto_guardar(text, text)',
        'cobro_foto_permiso(text)',
        'cobro_fotos_del_dia(text, text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
    -- El panel, con la sesión de quien entra. Las v2_ quedan solo para las demás funciones.
    foreach f in array array['cobro_foto_modo(text)', 'cobro_foto_guardar(text, text)', 'cobro_foto_permiso(text)', 'cobro_fotos_del_dia(text, text)'] loop
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

-- Las tres de cobro conservan sus permisos (create or replace no los toca), pero se repiten por si acaso.
revoke execute on function public.agenda_registrar_pago(text, jsonb, text) from public, anon;
grant  execute on function public.agenda_registrar_pago(text, jsonb, text) to authenticated;
revoke execute on function public.agenda_marcar_pagado(text, jsonb) from public, anon;
grant  execute on function public.agenda_marcar_pagado(text, jsonb) to authenticated;
revoke execute on function public.cancha_validar_pago(text, text, numeric, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.cancha_validar_pago(text, text, numeric, text, text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
