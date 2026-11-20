-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS · 0025: lo que la Caja anotó SIN INTERNET, subido después
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Alvaro el 19-nov-2026: «ante apagones y cortes, que la app guarde las operaciones y
-- luego se comunique con el servidor». Decisiones de ese día:
--   · Solo el DUEÑO y el ADMINISTRADOR (la caja). El empleado necesita internet.
--   · Citas: solo el cliente que está ahí, con la hora de ese momento (el ticket). Nada de agendar
--     a futuro sin conexión: el hueco lo puede vender Mia o la página mientras tanto.
--
-- El celular guarda cada operación con un id suyo (uuid) y la hora en que pasó, y al volver la
-- conexión llama aquí UNA vez por operación. Esta función:
--
--   1 · NO CUENTA DOS VECES. Si el celular reintenta (se cortó justo al subir, dos pestañas), el
--       mismo id devuelve lo mismo que la primera vez, con `duplicado: true`. sin_conexion_ops
--       guarda cada id aplicado.
--   2 · USA LA HORA REAL. Un ticket cobrado a las 8 pm y subido a las 7 am del día siguiente va
--       en la caja de ayer, a las 8 pm. Con límites: no en el futuro (reloj adelantado) ni de hace
--       más de 72 h.
--   3 · NO INVENTA REGLAS. Llama a las funciones de siempre (caja_ticket, agenda_marcar_pagado,
--       agenda_gasto_guardar, caja_ingreso_guardar), que vuelven a comprobar todo: permisos,
--       catálogo, stock, foto obligatoria. Lo que rechacen vuelve al celular con su mensaje y se
--       enseña en «No se pudo subir».
--   4 · EL TICKET Y SU COBRO VAN JUNTOS. Sin conexión no hay «Listos para cobrar» a la vista:
--       o entran los dos o ninguno (la función entera es una transacción).
--
-- Tipos:
--   ticket   { items[], employee_id, sede, telefono, nombre, metodo_pago, foto? }
--   cobro    { id (cita), metodo_pago, foto? }                       → agenda_marcar_pagado
--   gasto    { gasto: { id, fecha, concepto, categoria, importe, tipo, employee_id } }
--   ingreso  { dia, concepto, importe, metodo }                     → solo el dueño (0023)
--
-- En un negocio cuya agenda aún lleva el bot, las de agenda contestan 55000 y el panel las manda
-- por la cola de comandos (marcar_pagado y upsert_gasto con id ya son idempotentes allí).
--
-- Necesita la 0004, 0010, 0013 y 0023 de datos, y la 0031 de tu-pagina. Idempotente.
-- Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.sin_conexion_ops (
    op_id       uuid primary key,
    company_id  text not null,
    tipo        text not null,
    resultado   jsonb not null default '{}'::jsonb,
    ocurrio_en  timestamptz not null,
    creado_por  uuid,
    aplicado_en timestamptz not null default now()
);
create index if not exists sin_conexion_ops_company on public.sin_conexion_ops (company_id, aplicado_en desc);

-- Nadie la lee ni la escribe directamente: solo a través de la función.
alter table public.sin_conexion_ops enable row level security;
revoke all on public.sin_conexion_ops from public, anon, authenticated;

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
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Sin conexión solo anotan el dueño y el administrador.' using errcode = '42501';
    end if;
    if p_op is null then raise exception 'Falta el id de la operación.' using errcode = '22023'; end if;
    if p_tipo not in ('ticket', 'cobro', 'gasto', 'ingreso') then
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

-- Comprobación: «sí» y «sí».
select to_regclass('public.sin_conexion_ops') is not null as tabla,
       to_regprocedure('public.sin_conexion_aplicar(text, uuid, text, jsonb, timestamptz)') is not null as funcion;

-- Deshacer:
--   drop function if exists public.sin_conexion_aplicar(text, uuid, text, jsonb, timestamptz);
--   drop table if exists public.sin_conexion_ops;
