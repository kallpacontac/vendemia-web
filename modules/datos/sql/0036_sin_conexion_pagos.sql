-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0036: sin conexión, también «Registrar pago» (la seña o lo que faltaba)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 26-nov-2026, Alvaro: «cerrar la sincronización offline que falta». Con la 0025, sin internet ya
-- se cobraban tickets y citas y se apuntaban gastos e ingresos. Faltaba el pago CON IMPORTE:
-- la seña en efectivo o el resto de una cita (Caja › A cuenta, Agenda, Alumnos).
--
--   · sin_conexion_aplicar acepta el tipo `pago` { lead_id, monto, metodo_pago, appointment_id?, foto? }
--     → agenda_registrar_pago, con el id del celular como operación (ya era idempotente por él).
--   · El pago entra el día y a la hora en que se cobró: su created_at (epoch, lo que lee la Caja)
--     pasa a ser la hora del celular.
--   · Lo demás, igual que la 0025: solo dueño y administrador, 72 h como mucho, no en el futuro.
--
-- Necesita la 0025 y la 0010. Idempotente. Deshacer: volver a correr la 0025.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.sin_conexion_aplicar(p_company text, p_op uuid, p_tipo text, p_datos jsonb, p_ocurrio_en timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol    text := public.rol_en(p_company);
    v_previa public.sin_conexion_ops;
    v_datos  jsonb := coalesce(p_datos, '{}'::jsonb);
    v_hora   text;
    v_r      jsonb;
    v_cobro  jsonb;
    v_min    integer;
    v_antes  text[];   -- 0036: los pagos que ya tenía el cliente
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Sin conexión solo anotan el dueño y el administrador.' using errcode = '42501';
    end if;
    if p_op is null then raise exception 'Falta el id de la operación.' using errcode = '22023'; end if;
    if p_tipo not in ('ticket', 'cobro', 'gasto', 'ingreso', 'pago') then
        raise exception 'Esa operación no se puede anotar sin conexión: %.', p_tipo using errcode = '22023';
    end if;

    -- Dos subidas a la vez del mismo id (dos pestañas): la segunda espera y ve la primera.
    perform pg_advisory_xact_lock(hashtext('sin_conexion:' || p_op::text));
    select * into v_previa from public.sin_conexion_ops where op_id = p_op;
    if found then
        if v_previa.company_id <> p_company then raise exception 'Esa operación es de otro negocio.' using errcode = '42501'; end if;
        return v_previa.resultado || jsonb_build_object('duplicado', true);
    end if;

    if p_ocurrio_en is null then raise exception 'Falta la hora de la operación.' using errcode = '22023'; end if;
    if p_ocurrio_en > now() + interval '10 minutes' then
        raise exception 'La hora de este celular está adelantada: corrígela y vuelve a subirlo.' using errcode = '22023';
    end if;
    if p_ocurrio_en < now() - interval '72 hours' then
        raise exception 'Pasaron más de 3 días: anótalo a mano en la Caja de ese día.' using errcode = '22023';
    end if;
    v_hora := to_char(p_ocurrio_en at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');

    if p_tipo = 'ticket' then
        if coalesce(v_datos->>'metodo_pago', '') = '' then raise exception '¿Con qué pagó?' using errcode = '22023'; end if;
        v_r := public.caja_ticket(p_company, v_datos - 'metodo_pago' - 'foto');
        -- caja_ticket lo deja terminando AHORA; pasó a la hora que dice el celular.
        select slot_minutes into v_min from public.appointments where id = v_r->>'id';
        update public.appointments
           set slot_start = to_char(v_hora::timestamp - make_interval(mins => coalesce(v_min, 15)), 'YYYY-MM-DD HH24:MI'),
               slot_end = v_hora
         where id = v_r->>'id';
        v_cobro := public.agenda_marcar_pagado(p_company,
            jsonb_build_object('tipo', 'appointment', 'id', v_r->>'id', 'metodo_pago', v_datos->>'metodo_pago')
            || case when jsonb_typeof(v_datos->'foto') = 'object' then jsonb_build_object('foto', v_datos->'foto') else '{}'::jsonb end);
        v_r := v_r || jsonb_build_object('cobro', v_cobro, 'hora', v_hora);
    elsif p_tipo = 'cobro' then
        v_r := public.agenda_marcar_pagado(p_company,
            jsonb_build_object('tipo', 'appointment', 'id', v_datos->>'id', 'metodo_pago', coalesce(v_datos->>'metodo_pago', ''))
            || case when jsonb_typeof(v_datos->'foto') = 'object' then jsonb_build_object('foto', v_datos->'foto') else '{}'::jsonb end);
    elsif p_tipo = 'gasto' then
        if coalesce(btrim(v_datos #>> '{gasto,id}'), '') = '' then raise exception 'Falta el id del gasto.' using errcode = '22023'; end if;
        v_r := public.agenda_gasto_guardar(p_company, v_datos->'gasto');
    elsif p_tipo = 'pago' then
        -- 0036: «Registrar pago» (la seña o lo que faltaba, con importe). agenda_registrar_pago ya
        -- reconoce el mismo id (operation_id 'panel:<op>'); aquí solo se le pone la hora real al
        -- pago nuevo: es su created_at el que dice en qué día de caja entra.
        v_antes := array(select id from public.pending_payments
                          where company_id = p_company and lead_id = coalesce(v_datos->>'lead_id', ''));
        v_r := public.agenda_registrar_pago(p_company, v_datos - 'foto'
                   || case when jsonb_typeof(v_datos->'foto') = 'object' then jsonb_build_object('foto', v_datos->'foto') else '{}'::jsonb end,
                   p_op::text);
        if not coalesce((v_r->>'duplicado')::boolean, false) then
            update public.pending_payments set created_at = extract(epoch from p_ocurrio_en)::bigint
             where company_id = p_company and lead_id = coalesce(v_datos->>'lead_id', '') and not (id = any(v_antes));
        end if;
    else
        v_r := public.caja_ingreso_guardar(p_company, v_datos);
    end if;

    insert into public.sin_conexion_ops (op_id, company_id, tipo, resultado, ocurrio_en, creado_por)
    values (p_op, p_company, p_tipo, coalesce(v_r, '{}'::jsonb), p_ocurrio_en, (select auth.uid()));
    return coalesce(v_r, '{}'::jsonb);
end $$;

revoke execute on function public.sin_conexion_aplicar(text, uuid, text, jsonb, timestamptz) from public, anon;
grant  execute on function public.sin_conexion_aplicar(text, uuid, text, jsonb, timestamptz) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Comprobación: «sí».
select position('''pago''' in pg_get_functiondef('public.sin_conexion_aplicar(text, uuid, text, jsonb, timestamptz)'::regprocedure)) > 0 as acepta_pagos;
