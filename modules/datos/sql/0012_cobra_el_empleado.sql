-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0012: el empleado cobra, solo si el negocio lo pidió y con foto
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 12-nov-2026: «déjamelo configurable; por defecto que no cobren los empleados. Si el
-- dueño me dice que se le permite, pero con evidencias, lo activamos».
--
--   · `cobro_ajustes.empleado_cobra`, APAGADO de serie. Lo enciende SOLO el equipo de Vendemia
--     (es_admin_plataforma), a pedido del dueño: ni el dueño ni el administrador lo tocan.
--   · Encendido, el empleado cobra desde Mi agenda con UNA función, empleado_cobrar_saldo, y nada
--     más (las tres puertas de la 0010 siguen siendo de dueño y administrador):
--       - solo citas o reservas suyas o sin asignar (las que ya ve);
--       - el importe EXACTO de lo que falta: ni más, ni menos, ni descuento;
--       - efectivo, Yape o Plin;
--       - SIEMPRE con foto, también en efectivo (la del dinero o el recibo), aunque el negocio
--         tenga la «Foto del pago» apagada u opcional. Es la evidencia que pidió Alvaro;
--       - la foto pasa la misma regla de la 0010: no repetida, ni la imagen ni la operación.
--   · Queda registrado quién cobró: `comprobantes_cobro` con via = 'empleado' y su usuario, y la
--     Caja lo enseña con su nombre (cobro_fotos_del_dia → `quien`).
--
-- Cancha apartada sin adelanto: el empleado puede cobrarla entera (la confirma, como «Validar
-- pago»). Una cita apartada que NO es de cancha no: esa la confirma la caja.
--
-- Necesita: datos 0010 (cobro_ajustes, comprobantes_cobro, v2_foto_pago_validar), tu-pagina 0011,
-- 0017 y 0018 (v2_es_cancha, v2_comprobante_aplicar), y del bot 0041 (mi_empleado) y 0020
-- (es_admin_plataforma).
--
-- Encenderlo desde el editor SQL de Supabase (allí no hay sesión, así que sin la función):
--   insert into public.cobro_ajustes (company_id, empleado_cobra, empleado_cobra_at)
--   values ('<company_id>', true, now())
--   on conflict (company_id) do update set empleado_cobra = true, empleado_cobra_at = now();
--
-- Idempotente. Pruebas: tests/pruebas_0012_pglite.mjs. Deshacer: scripts/cobra-el-empleado-0012-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · El interruptor ────────────────────────────────────────────────────────

alter table public.cobro_ajustes add column if not exists empleado_cobra     boolean not null default false;
alter table public.cobro_ajustes add column if not exists empleado_cobra_por uuid;
alter table public.cobro_ajustes add column if not exists empleado_cobra_at  timestamptz;

create or replace function public.v2_empleado_cobra(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select empleado_cobra from public.cobro_ajustes where company_id = p_company), false);
$$;

-- Cada foto ya dice por qué puerta entró; ahora también la del empleado.
alter table public.comprobantes_cobro drop constraint if exists comprobantes_cobro_via_check;
alter table public.comprobantes_cobro add constraint comprobantes_cobro_via_check
    check (via in ('registrar_pago', 'cobrada', 'cancha', 'empleado'));

-- ── 2 · Lo que lee el panel ───────────────────────────────────────────────────

-- La de la 0010, con `empleado_cobra`. Cualquiera del negocio: el empleado la necesita para
-- saber si ofrece «Cobrar».
create or replace function public.cobro_foto_modo(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null and coalesce((select auth.role()), '') <> 'service_role'
       and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object('modo', public.v2_foto_pago(p_company), 'nube', public.agenda_en_nube(p_company),
                              'empleado_cobra', public.v2_empleado_cobra(p_company));
end $$;

-- Encender o apagar: solo el equipo de Vendemia.
create or replace function public.cobro_empleado_guardar(p_company text, p_activo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.es_admin_plataforma() then
        raise exception 'Que los empleados cobren lo activa el equipo de Vendemia, a pedido del dueño.' using errcode = '42501';
    end if;
    if p_activo is null then raise exception 'Di si se activa o no.'; end if;
    if not exists (select 1 from public.companies where id = p_company) then
        raise exception 'Ese negocio no existe.';
    end if;
    insert into public.cobro_ajustes (company_id, empleado_cobra, empleado_cobra_por, empleado_cobra_at)
    values (p_company, p_activo, (select auth.uid()), now())
    on conflict (company_id) do update
       set empleado_cobra = excluded.empleado_cobra, empleado_cobra_por = excluded.empleado_cobra_por,
           empleado_cobra_at = excluded.empleado_cobra_at;
    return jsonb_build_object('empleado_cobra', p_activo);
end $$;

-- La puerta de /api/cobros/foto. La de la 0010 para dueño y administrador; el empleado pasa
-- solo con el interruptor encendido, y para él la foto es siempre obligatoria.
create or replace function public.cobro_foto_permiso(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_modo text;
begin
    if public.rol_en(p_company) = 'empleado' then
        if not public.v2_empleado_cobra(p_company) then
            raise exception 'En este negocio los empleados no cobran: el cobro lo apunta la caja.' using errcode = '42501';
        end if;
        if not public.agenda_en_nube(p_company) then
            raise exception 'La agenda de este negocio todavía la lleva su bot.' using errcode = '55000';
        end if;
        return 'obligatoria';
    end if;
    perform public.v2_autorizar_agenda(p_company);
    v_modo := public.v2_foto_pago(p_company);
    if v_modo = 'apagada' then
        raise exception 'La foto del comprobante está apagada en Configuración › Negocio.' using errcode = '42501';
    end if;
    return v_modo;
end $$;

-- La puerta del empleado, en un sitio: con el interruptor, en la nube. Devuelve su ficha ('' si
-- no tiene: entonces solo cobra las sin asignar).
create or replace function public.v2_empleado_puede_cobrar(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if public.rol_en(p_company) <> 'empleado' then
        raise exception 'Esto es para el empleado. Tú cobras desde la Caja o la Agenda.' using errcode = '42501';
    end if;
    if not public.v2_empleado_cobra(p_company) then
        raise exception 'En este negocio los empleados no cobran: el cobro lo apunta la caja.' using errcode = '42501';
    end if;
    if not public.agenda_en_nube(p_company) then
        raise exception 'La agenda de este negocio todavía la lleva su bot.' using errcode = '55000';
    end if;
    return coalesce(public.mi_empleado(p_company), '');
end $$;

-- Cuánto falta en cada una de esas citas, para pintar «Cobrar S/ X». Solo las que puede cobrar
-- y con algo pendiente. { "<id>": falta, … }
create or replace function public.empleado_saldos(p_company text, p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_ficha text := public.v2_empleado_puede_cobrar(p_company);
begin
    return coalesce((
        select jsonb_object_agg(x.id, x.falta)
          from (select a.id,
                       coalesce((select sum(s.price) from public.appointment_services s where s.appointment_id = a.id), 0)
                     - coalesce((select sum(p.amount) from public.pending_payments p
                                  where p.company_id = a.company_id and p.appointment_id = a.id), 0) as falta
                  from public.appointments a
                 where a.company_id = p_company
                   and a.id = any (coalesce(p_ids, '{}'::text[]))
                   and a.status in ('pending_payment', 'confirmed', 'completed')
                   and coalesce(a.pagado_por, '') = ''
                   and (coalesce(a.employee_id, '') = '' or a.employee_id = v_ficha)) x
         where x.falta > 0), '{}'::jsonb);
end $$;

-- ── 3 · Cobrar ────────────────────────────────────────────────────────────────

create or replace function public.empleado_cobrar_saldo(p_company text, p_appointment text, p_metodo text, p_foto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ficha   text := public.v2_empleado_puede_cobrar(p_company);
    v_metodo  text := btrim(coalesce(p_metodo, ''));
    v_cita    public.appointments;
    v_item    text;
    v_total   numeric;
    v_pagado  numeric;
    v_falta   numeric;
    v_foto    jsonb;
    v_pago_id text;
    v_r       jsonb;
begin
    if v_metodo not in ('cash', 'yape', 'plin') then raise exception 'Elige cómo te pagaron: efectivo, Yape o Plin.'; end if;
    -- La evidencia, siempre: también en efectivo.
    if p_foto is null or jsonb_typeof(p_foto) <> 'object'
       or (btrim(coalesce(p_foto->>'url', '')) = '' and btrim(coalesce(p_foto->>'hash', '')) = '') then
        raise exception 'Para cobrar necesitas la foto: la del Yape o Plin, o la del dinero que recibiste.';
    end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    select * into v_cita from public.appointments where id = p_appointment and company_id = p_company;
    if not found then raise exception 'Eso no existe en este negocio.'; end if;
    if coalesce(v_cita.employee_id, '') <> '' and v_cita.employee_id is distinct from nullif(v_ficha, '') then
        raise exception 'Esa no es tuya: la cobra quien la atiende o la caja.' using errcode = '42501';
    end if;
    if v_cita.status not in ('pending_payment', 'confirmed', 'completed') then
        raise exception 'Está cancelada: no se le cobra nada.';
    end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Ya está cobrada completa.'; end if;
    if v_cita.status = 'pending_payment' then
        select s.catalog_item_id into v_item from public.appointment_services s
         where s.appointment_id = v_cita.id order by s.sort_order limit 1;
        if not public.v2_es_cancha(p_company, coalesce(v_item, '')) then
            raise exception 'Está apartada, todavía sin confirmar: la confirma la caja.';
        end if;
    end if;

    -- Misma regla de la 0010: foto subida por el servidor, no repetida, operación no repetida.
    v_foto := public.v2_foto_pago_validar(p_company, v_metodo, p_foto);

    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
     where p.company_id = p_company and p.appointment_id = v_cita.id;
    v_falta := v_total - v_pagado;
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;

    -- El importe no lo escribe nadie: es lo que falta.
    v_r := public.v2_comprobante_aplicar(v_cita, v_falta, v_metodo,
                                         coalesce(nullif(v_foto->>'op', ''), 'empleado:' || gen_random_uuid()),
                                         v_foto->>'hash', v_foto->>'url', 'panel');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Que la caja la mueva a otra hora.', v_r->>'motivo';
    end if;
    select id into v_pago_id from public.pending_payments
     where company_id = p_company and appointment_id = v_cita.id and image_hash = v_foto->>'hash' limit 1;
    perform public.v2_foto_pago_guardar(p_company, 'appointment', v_cita.id, v_pago_id, 'empleado', v_foto, v_metodo, v_falta);

    return v_r || jsonb_build_object('cobrado', v_falta, 'metodo', v_metodo);
end $$;

-- ── 4 · La Caja dice quién cobró ──────────────────────────────────────────────
-- La de la 0010, con `quien`: el nombre de la ficha de quien subió la foto, si cobró un empleado.

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
                           'slot', coalesce(a.slot_start, ''),
                           'quien', case when c.via = 'empleado' then coalesce(
                               (select nullif(e.name, '') from public.memberships m
                                  join public.employees e on e.id = m.employee_id and e.company_id = m.company_id
                                 where m.company_id = c.company_id and m.auth_user_id = c.subido_por::text limit 1),
                               'Un empleado') else '' end) as fila
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
                           'slot', coalesce(a.slot_start, ''), 'quien', '')
                  from public.comprobantes_web w
                  left join public.appointments a on a.id = w.appointment_id and a.company_id = w.company_id
                  left join public.leads l on l.id = w.lead_id and l.company_id = w.company_id
                 where w.company_id = p_company and w.estado = 'aprobado' and w.url <> ''
                   and (w.revisado_at at time zone 'America/Lima')::date = p_dia::date
                 limit 300) f), '[]'::jsonb);
end $$;

-- ── 5 · Permisos ──────────────────────────────────────────────────────────────

revoke execute on function public.v2_empleado_cobra(text) from public, anon, authenticated;
revoke execute on function public.v2_empleado_puede_cobrar(text) from public, anon, authenticated;
do $$
declare f text;
begin
    foreach f in array array[
        'cobro_foto_modo(text)', 'cobro_empleado_guardar(text, boolean)', 'cobro_foto_permiso(text)',
        'empleado_saldos(text, text[])', 'empleado_cobrar_saldo(text, text, text, jsonb)', 'cobro_fotos_del_dia(text, text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';
