-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0004: LA AGENDA EN LA NUBE (etapa 4, lado web)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Decidido por Alvaro el 19-oct-2026: la agenda (citas, inscripciones, pedidos,
-- pagos, gastos) pasa a la nube para TODOS los negocios, con los bots APAGADOS
-- (feriado). En un negocio con `datos_v2_empresas.agenda_en_nube`:
--
--   · El panel ya no encola los comandos de agenda: llama a estas agenda_* , que
--     aplican las MISMAS reglas que los handlers del bot (commands.service.ts:
--     crear_cita, modificar_cita, marcar_pagado, registrar_pago, marcar_cumplido,
--     actualizar_lead, upsert_gasto, delete_gasto) y devuelven el mismo `result`.
--   · Mi página reserva y pide DIRECTO en appointments / orders (agenda_srv_*):
--     una sola agenda, la que ve el panel. Crea el cliente (lead) si no existe.
--   · El hueco lo decide v2_hueco: la regla de aforo del bot (capAt) en SQL, con
--     candado por negocio en las altas.
--
-- ⚠️ LOS BOTS NO SE ENCIENDEN hasta que hagan su parte (docs/prompt-bot-agenda-en-nube.md):
-- bajar la agenda en vez de subirla y reservar llamando a la nube. Encendidos como
-- hoy, su espejo subiría la agenda vieja de SQLite encima de esta.
--
-- Diferencias con el bot, aceptadas y escritas:
--   · Sin Google Calendar (el bot creaba y borraba eventos).
--   · registrar_pago no abre una escalación si el grupo se llenó: lo dice en `detalle`.
--   · actualizar_lead no valida el correo con el normalizador del bot (solo forma básica)
--     ni fija el nombre frente al bot (_fijado_por_panel).
--
-- La cita APARTADA (bot, 19-oct-2026): con «Requerir pago para confirmar» y precio > 0, la cita
-- puntual nace `pending_payment` y ocupa su hora 24 h (v2_ocupa_hora); marcar_pagado la confirma
-- revalidando el hueco y, si ya no está libre, falla sin tocar nada.
--
-- Roles: lo que el corte del 21-oct dejará así. Dueño y administrador, todo; el
-- empleado solo «vino / no vino». Un `member` de hoy ya es empleado aquí.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── Quién manda y quién puede ─────────────────────────────────────────────────

create or replace function public.agenda_en_nube(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select agenda_en_nube from public.datos_v2_empresas where company_id = p_company), false);
$$;

create or replace function public.v2_autorizar_agenda(p_company text, p_empleado_vale boolean default false)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null and (select auth.role()) = 'service_role' then v_rol := 'dueno'; end if;
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol = 'empleado' and not p_empleado_vale then
        raise exception 'Eso lo hace el dueño o el administrador del negocio.' using errcode = '42501';
    end if;
    if not public.agenda_en_nube(p_company) then
        raise exception 'La agenda de este negocio todavía la lleva su bot.' using errcode = '55000';
    end if;
    return v_rol;
end $$;

-- ── Utilidades de texto y hora (todo en texto local de Lima, como el bot) ─────

create or replace function public.v2_ahora() returns text language sql stable as $$
    select to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
$$;

create or replace function public.v2_min(p text) returns integer language sql immutable as $$
    select split_part(p, ':', 1)::integer * 60 + coalesce(nullif(split_part(p, ':', 2), ''), '0')::integer;
$$;

create or replace function public.v2_clave_dia(p_fecha text) returns text language sql immutable as $$
    select (array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'])[extract(dow from p_fecha::date)::integer + 1];
$$;

create or replace function public.v2_json(p text) returns jsonb language plpgsql immutable as $$
begin
    return coalesce(nullif(btrim(coalesce(p, '')), '')::jsonb, '{}'::jsonb);
exception when others then
    return '{}'::jsonb;
end $$;

create or replace function public.v2_urlencode(p text) returns text language plpgsql immutable as $$
declare
    b bytea := convert_to(coalesce(p, ''), 'UTF8');
    r text := '';
    c integer;
begin
    for i in 0 .. length(b) - 1 loop
        c := get_byte(b, i);
        if (c between 48 and 57) or (c between 65 and 90) or (c between 97 and 122) or c in (45, 46, 95, 126) then
            r := r || chr(c);
        else
            r := r || '%' || upper(lpad(to_hex(c), 2, '0'));
        end if;
    end loop;
    return r;
end $$;

-- Los grupos de un ítem (catalog.schedule_slots) como array; vacío o roto = [].
create or replace function public.v2_franjas(p text) returns jsonb language sql immutable as $$
    select case when jsonb_typeof(public.v2_json(p)) = 'array' then public.v2_json(p) else '[]'::jsonb end;
$$;

-- 9 dígitos con 9 delante → 51…; lo demás, solo dígitos.
create or replace function public.v2_telefono(p text) returns text language sql immutable as $$
    select case when d ~ '^9\d{8}$' then '51' || d else d end
      from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.v2_wa(p_tel text, p_texto text) returns text language sql immutable as $$
    select 'https://wa.me/' || public.v2_telefono(p_tel) || '?text=' || public.v2_urlencode(p_texto);
$$;

-- «el jueves 23 de octubre»
create or replace function public.v2_fecha_legible(p_slot text) returns text language sql immutable as $$
    select 'el ' || (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from d)::integer + 1]
           || ' ' || extract(day from d)::integer || ' de '
           || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from d)::integer]
      from (select left(p_slot, 10)::date as d) x;
$$;

create or replace function public.v2_primer_nombre(p text) returns text language sql immutable as $$
    select case when btrim(coalesce(p, '')) = '' then '' else ' ' || split_part(btrim(p), ' ', 1) end;
$$;

-- El periodo de una inscripción: copia de periodoDeInscripcion (utils/periodo.ts del bot).
create or replace function public.v2_periodo(p_hoy text, p_arranque text, p_meses integer, out desde text, out hasta text)
language plpgsql immutable as $$
declare
    d date := p_hoy::date;
    inicio date := date_trunc('month', p_hoy::date)::date;
    arranque integer;
    n integer := greatest(coalesce(p_meses, 1), 1);
begin
    begin
        arranque := nullif(btrim(coalesce(p_arranque, '')), '')::integer;
    exception when others then
        arranque := null;
    end;
    if arranque between 1 and 31 and extract(day from d) > arranque then
        inicio := (inicio + interval '1 month')::date;
    end if;
    desde := to_char(inicio, 'YYYY-MM-DD');
    hasta := to_char((inicio + make_interval(months => n) - interval '1 day')::date, 'YYYY-MM-DD');
end $$;

-- ── El aforo: la regla del bot (capAt), igual que modules/tu-pagina/dominio/agenda.ts ──

-- ¿Trabaja este profesional a esa hora? Su horario ∩ el del negocio; sin horario propio, el del negocio.
create or replace function public.v2_en_turno(p_emp_horario text, p_negocio jsonb, p_clave text, p_min integer)
returns boolean language plpgsql immutable as $$
declare
    n jsonb := p_negocio -> p_clave;
    e jsonb := public.v2_json(p_emp_horario);
    p jsonb;
begin
    if n is null or coalesce((n->>'closed')::boolean, false) or n->>'open' is null or n->>'close' is null then return false; end if;
    if p_min < public.v2_min(n->>'open') or p_min >= public.v2_min(n->>'close') then return false; end if;
    if e = '{}'::jsonb then return true; end if;
    p := e -> p_clave;
    if p is null or coalesce((p->>'closed')::boolean, false) or p->>'open' is null or p->>'close' is null then return false; end if;
    return p_min >= greatest(public.v2_min(n->>'open'), public.v2_min(p->>'open'))
       and p_min <  least(public.v2_min(n->>'close'), public.v2_min(p->>'close'));
end $$;

create or replace function public.v2_aforo(p_company text, p_momento text, p_paso integer, p_empleado text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
    v_h     jsonb;
    v_clave text := public.v2_clave_dia(left(p_momento, 10));
    v_min   integer := public.v2_min(substr(p_momento, 12, 5));
    v_fin   text := public.tu_pagina_sumar_min(p_momento, p_paso);
    v_dia   jsonb;
    n       integer;
begin
    select public.v2_json(schedule) into v_h from public.companies where id = p_company;
    if coalesce(p_empleado, '') <> '' then
        select count(*) into n from public.employees e
         where e.company_id = p_company and e.id = p_empleado and coalesce(e.is_active, 1) = 1
           and public.v2_en_turno(e.schedule, v_h, v_clave, v_min)
           and not exists (select 1 from public.employee_blocks b
                            where b.company_id = p_company and b.employee_id = e.id and b.start < v_fin and b."end" > p_momento);
        return least(n, 1);
    end if;
    if exists (select 1 from public.employees e where e.company_id = p_company and coalesce(e.is_active, 1) = 1) then
        select count(*) into n from public.employees e
         where e.company_id = p_company and coalesce(e.is_active, 1) = 1
           and public.v2_en_turno(e.schedule, v_h, v_clave, v_min)
           and not exists (select 1 from public.employee_blocks b
                            where b.company_id = p_company and b.employee_id = e.id and b.start < v_fin and b."end" > p_momento);
        return n;
    end if;
    -- Sin equipo, manda la silla del día.
    v_dia := v_h -> v_clave;
    if not public.v2_en_turno('', v_h, v_clave, v_min) then return 0; end if;
    return coalesce((v_dia->>'capacity')::integer, 1);
end $$;

-- ¿Ocupa su hora esta cita? La apartada que espera el pago (`pending_payment`, «Requerir pago para
-- confirmar») la ocupa 24 h desde que se creó —PAGO_CADUCA_HORAS del bot, 19-oct-2026— y después deja
-- de ocupar; la fila no se toca. Si el bot cambia el plazo, se cambia aquí y en lib/panel/adelantos.ts.
create or replace function public.v2_ocupa_hora(p_status text, p_creada bigint)
returns boolean language sql stable as $$
    select p_status in ('confirmed', 'completed')
        or (p_status = 'pending_payment' and coalesce(p_creada, 0) > extract(epoch from now() - interval '24 hours'));
$$;

-- ¿Cabe? null = sí; si no, el motivo en palabras del panel. Lo ocupado: citas puntuales vivas
-- (v2_ocupa_hora) y reservas de la página (0002) que sigan apartadas.
create or replace function public.v2_hueco(p_company text, p_inicio text, p_minutos integer, p_empleado text, p_excepto text default '')
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_h      jsonb;
    v_paso   integer;
    v_fin    text := public.tu_pagina_sumar_min(p_inicio, p_minutos);
    t        text;
    t1       text;
    v_cap    integer;
    v_min    integer := 2147483647;
    v_max    integer := 0;
    n        integer;
    v_nombre text;
begin
    if v_fin is null then return 'la hora no es válida'; end if;
    select public.v2_json(schedule), coalesce(nullif(slot_minutes, 0), 60) into v_h, v_paso from public.companies where id = p_company;
    v_paso := coalesce(nullif((v_h -> public.v2_clave_dia(left(p_inicio, 10)) ->> 'slot_minutes'), '')::integer, v_paso);
    if coalesce(p_empleado, '') <> '' then select name into v_nombre from public.employees where company_id = p_company and id = p_empleado; end if;

    t := p_inicio;
    while t < v_fin loop
        t1 := public.tu_pagina_sumar_min(t, v_paso);
        v_cap := public.v2_aforo(p_company, t, v_paso, null);
        if v_cap = 0 then return 'a esa hora el local está cerrado o no hay nadie de turno'; end if;
        v_min := least(v_min, v_cap);
        if coalesce(p_empleado, '') <> '' and public.v2_aforo(p_company, t, v_paso, p_empleado) = 0 then
            return coalesce(v_nombre, 'ese profesional') || ' no atiende a esa hora';
        end if;
        select count(*) into n from (
            select 1 from public.appointments a
             where a.company_id = p_company and a.id <> coalesce(p_excepto, '')
               and public.v2_ocupa_hora(a.status, a.created_at)
               and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and a.slot_start < t1
               and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > t
            union all
            select 1 from public.reservas_web r
             where r.company_id = p_company and r.tipo = 'cita' and r.estado in ('apartada', 'confirmada')
               and r.slot_start < t1 and r.slot_end > t) x;
        v_max := greatest(v_max, n);
        t := t1;
    end loop;
    if v_max >= v_min then return 'ese horario ya está lleno'; end if;

    if coalesce(p_empleado, '') <> '' and exists (
        select 1 from public.appointments a
         where a.company_id = p_company and a.id <> coalesce(p_excepto, '') and a.employee_id = p_empleado
           and public.v2_ocupa_hora(a.status, a.created_at)
           and a.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' and a.slot_start < v_fin
           and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > p_inicio) then
        return coalesce(v_nombre, 'ese profesional') || ' ya tiene una cita a esa hora';
    end if;
    return null;
end $$;

-- El cliente por teléfono; si no existe, se crea (sin nombre no: saldría un «Hola» a secas).
create or replace function public.v2_lead(p_company text, p_tel text, p_nombre text, p_origen text, out lead_id text, out nuevo boolean)
language plpgsql security definer set search_path = public as $$
declare
    v_tel text := public.v2_telefono(p_tel);
    lead  public.leads;
begin
    nuevo := false;
    if v_tel !~ '^\d{8,15}$' then raise exception 'El teléfono no es válido.' using errcode = '22023'; end if;
    select * into lead from public.leads where company_id = p_company and phone = v_tel order by created_at limit 1;
    if not found then
        if btrim(coalesce(p_nombre, '')) = '' then raise exception 'Falta el nombre del cliente nuevo.' using errcode = '22023'; end if;
        insert into public.leads (id, company_id, phone, name, source)
        values (gen_random_uuid()::text, p_company, v_tel, left(btrim(p_nombre), 120), p_origen)
        returning * into lead;
        nuevo := true;
    elsif lead.name = '' and btrim(coalesce(p_nombre, '')) <> '' then
        update public.leads set name = left(btrim(p_nombre), 120) where id = lead.id returning * into lead;
    end if;
    lead_id := lead.id;
end $$;

-- ── El panel: las acciones de la agenda ───────────────────────────────────────

-- crear_cita: la cita de mostrador. Nace 'confirmed' y con su línea de servicio (es la facturación).
create or replace function public.agenda_crear_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_slot   text := coalesce(p_datos->>'slot_start', '');
    v_item   public.catalog;
    v_emp    public.employees;
    v_lead   public.leads;
    v_lead_id text;
    v_nuevo  boolean := false;
    v_span   integer;
    v_fin    text;
    v_motivo text;
    v_cita   public.appointments;
    v_dup    boolean := false;
    v_msg    text;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    if v_slot <= public.v2_ahora() then raise exception '% ya pasó: elige un horario futuro', v_slot; end if;
    select * into v_item from public.catalog where company_id = p_company and id = p_datos->>'catalog_item_id';
    if not found then raise exception 'Elige un servicio: una cita sin servicio entra en los ingresos como S/ 0'; end if;
    if jsonb_array_length(public.v2_franjas(v_item.schedule_slots)) > 0 then
        raise exception '% es un grupo con horarios fijos: se inscribe, no se agenda por hora', v_item.name;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    if coalesce(p_datos->>'lead_id', '') <> '' then
        select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
        if not found then raise exception 'Ese cliente no es de este negocio.'; end if;
        if v_lead.name = '' and btrim(coalesce(p_datos->>'nombre', '')) <> '' then
            update public.leads set name = left(btrim(p_datos->>'nombre'), 120) where id = v_lead.id returning * into v_lead;
        end if;
    else
        select l.lead_id, l.nuevo into v_lead_id, v_nuevo from public.v2_lead(p_company, p_datos->>'telefono', p_datos->>'nombre', 'panel') l;
        select * into v_lead from public.leads where id = v_lead_id;
    end if;

    if coalesce(p_datos->>'employee_id', '') <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    end if;

    v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_fin  := public.tu_pagina_sumar_min(v_slot, v_span);

    select * into v_cita from public.appointments a
     where a.company_id = p_company and a.lead_id = v_lead.id and a.status <> 'completed' and public.v2_ocupa_hora(a.status, a.created_at)
       and a.slot_start < v_fin and coalesce(nullif(a.slot_end, ''), public.tu_pagina_sumar_min(a.slot_start, a.slot_minutes)) > v_slot
     limit 1;
    if found then
        v_dup := true;
    else
        v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''));
        if v_motivo is not null then raise exception '%', v_motivo; end if;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, beneficiario_edad)
        values (gen_random_uuid()::text, p_company, v_lead.id, v_item.name, v_slot, v_fin, v_span, coalesce(v_emp.id, ''), 'confirmed',
                btrim(coalesce(p_datos->>'beneficiario', '')), btrim(coalesce(p_datos->>'beneficiario_edad', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, p_company, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);
    end if;

    v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Te dejé agendada tu cita de ' || v_item.name || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?';
    return jsonb_build_object(
        'id', v_cita.id, 'lead_id', v_lead.id, 'cliente_nuevo', v_nuevo, 'duplicada', v_dup,
        'slot_start', v_cita.slot_start, 'slot_minutes', v_cita.slot_minutes, 'employee_id', v_cita.employee_id,
        'service', v_cita.service, 'precio', coalesce(v_item.price, 0), 'estado', v_cita.status,
        'mensaje', v_msg, 'wa_link', public.v2_wa(v_lead.phone, v_msg));
end $$;

-- modificar_cita: cancelar, mover o reasignar.
create or replace function public.agenda_modificar_cita(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_acc    text := coalesce(p_datos->>'accion', '');
    v_cita   public.appointments;
    v_lead   public.leads;
    v_emp    public.employees;
    v_slot   text;
    v_span   integer;
    v_motivo text;
    v_msg    text;
    v_rec    boolean;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_acc not in ('cancelar', 'mover', 'reasignar') then raise exception 'accion debe ser cancelar, mover o reasignar'; end if;
    select * into v_cita from public.appointments where company_id = p_company and id = p_datos->>'id';
    if not found then raise exception 'Esa cita no existe en este negocio.'; end if;
    if v_cita.status = 'cancelled' then raise exception 'esa cita ya estaba cancelada'; end if;
    select * into v_lead from public.leads where id = v_cita.lead_id;
    v_rec := v_cita.slot_start like 'sched:%';
    if v_rec and v_acc <> 'cancelar' then
        raise exception 'una inscripción a un grupo no se mueve ni se reasigna: cancélala y vuelve a inscribir';
    end if;

    if v_acc = 'cancelar' then
        update public.appointments set status = 'cancelled' where id = v_cita.id;
        update public.leads set pending_slot = '', booking_draft = '' where id = v_cita.lead_id;
        v_msg := 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Tuvimos que cancelar tu reserva de ' || v_cita.service
                 || case when v_rec then '' else ' del ' || substr(public.v2_fecha_legible(v_cita.slot_start), 4) end || '. ¿Te busco otro horario?';
        return jsonb_build_object('id', v_cita.id, 'accion', 'cancelar', 'antes', v_cita.status, 'ahora', 'cancelled',
            'libera', case when v_rec then 'una plaza del grupo' else 'el horario' end,
            'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
    end if;

    if coalesce(nullif(v_cita.slot_end, ''), public.tu_pagina_sumar_min(v_cita.slot_start, v_cita.slot_minutes)) <= public.v2_ahora() then
        raise exception 'esa cita ya pasó: es historial. Si el cliente vuelve, se le agenda una nueva';
    end if;
    v_slot := coalesce(nullif(p_datos->>'slot_start', ''), v_cita.slot_start);
    if v_slot !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then raise exception 'slot_start debe ser "YYYY-MM-DD HH:MM"'; end if;
    if v_slot <= public.v2_ahora() then raise exception '% ya pasó: elige un horario futuro', v_slot; end if;

    if v_acc = 'reasignar' then
        select * into v_emp from public.employees where company_id = p_company and id = p_datos->>'employee_id';
        if not found then raise exception 'Ese profesional no es de este negocio.'; end if;
        if coalesce(v_emp.is_active, 1) = 0 then raise exception '% está dado de baja', v_emp.name; end if;
    elsif v_cita.employee_id <> '' then
        select * into v_emp from public.employees where company_id = p_company and id = v_cita.employee_id;
    end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    v_span := coalesce(nullif(v_cita.slot_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = p_company), 60);
    v_motivo := public.v2_hueco(p_company, v_slot, v_span, coalesce(v_emp.id, ''), v_cita.id);
    if v_motivo is not null then raise exception '%', v_motivo; end if;

    update public.appointments
       set slot_start = v_slot, slot_end = public.tu_pagina_sumar_min(v_slot, v_span), slot_minutes = v_span, employee_id = coalesce(v_emp.id, '')
     where id = v_cita.id;

    v_msg := case when v_acc = 'mover'
        then 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Movimos tu cita de ' || v_cita.service || ' a '
             || substr(public.v2_fecha_legible(v_slot), 4) || ' a las ' || substr(v_slot, 12, 5)
             || case when v_emp.id is not null then ' con ' || v_emp.name else '' end || '. ¿Te queda bien?'
        else 'Hola' || public.v2_primer_nombre(v_lead.name) || '! Tu cita de ' || v_cita.service || ' '
             || public.v2_fecha_legible(v_slot) || ' a las ' || substr(v_slot, 12, 5) || ' la atenderá ' || v_emp.name || '. ¿Te parece bien?'
        end;
    return jsonb_build_object('id', v_cita.id, 'accion', v_acc,
        'antes', jsonb_build_object('slot_start', v_cita.slot_start, 'employee_id', v_cita.employee_id),
        'ahora', jsonb_build_object('slot_start', v_slot, 'employee_id', coalesce(v_emp.id, '')),
        'mensaje', v_msg, 'wa_link', public.v2_wa(coalesce(v_lead.phone, ''), v_msg));
end $$;

-- marcar_pagado: «ya cobré esto». Lo cancelado no se cobra; el estado solo avanza desde «falta el dinero».
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
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_tipo not in ('order', 'appointment') then raise exception 'tipo debe ser order o appointment'; end if;
    if v_metodo <> '' and v_metodo not in ('yape', 'plin', 'bank_transfer', 'cash', 'cod') then
        raise exception 'metodo_pago inválido: "%". Valores: yape · plin · bank_transfer · cash · cod', v_metodo;
    end if;
    if v_tipo = 'order' then
        select status into v_antes from public.orders where company_id = p_company and id = v_id;
    else
        select status, slot_start, slot_minutes, employee_id into v_antes, v_slot, v_min, v_emp
          from public.appointments where company_id = p_company and id = v_id;
    end if;
    if v_antes is null then raise exception 'Eso no existe en este negocio.'; end if;
    if v_antes = 'cancelled' then
        raise exception '%: no se puede marcar como pagada. Si el cliente pagó y lo quiere igual, se crea de nuevo',
            case when v_tipo = 'order' then 'ese pedido está cancelado' else 'esa cita está cancelada' end;
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
    end if;
    return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'cambio', v_falta, 'antes', v_antes, 'pagado_por', 'panel')
           || case when v_metodo <> '' then jsonb_build_object('metodo_pago', v_metodo) else '{}'::jsonb end;
end $$;

-- marcar_cumplido: «vino» o «no vino». El empleado también puede.
create or replace function public.agenda_marcar_cumplido(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_tipo  text := coalesce(p_datos->>'tipo', 'appointment');
    v_id    text := p_datos->>'id';
    v_vino  boolean := (p_datos->>'vino')::boolean;
    v_antes text;
begin
    perform public.v2_autorizar_agenda(p_company, true);
    if v_vino is null then raise exception 'vino requerido (true/false)'; end if;
    if v_tipo = 'order' then
        select status into v_antes from public.orders where company_id = p_company and id = v_id;
        if v_antes is null then raise exception 'Ese pedido no existe en este negocio.'; end if;
        if v_vino and v_antes <> 'delivered' then update public.orders set status = 'delivered' where id = v_id; end if;
        update public.orders set cumplido_por = 'panel' where id = v_id;
    else
        select status into v_antes from public.appointments where company_id = p_company and id = v_id;
        if v_antes is null then raise exception 'Esa cita no existe en este negocio.'; end if;
        update public.appointments set status = case when v_vino then 'completed' else 'no_show' end, cumplido_por = 'panel' where id = v_id;
    end if;
    return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'vino', v_vino, 'antes', v_antes, 'cumplido_por', 'panel');
end $$;

-- registrar_pago: un pago con IMPORTE de una inscripción (la seña en caja). La seña reserva el cupo.
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

    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, verified, order_id, appointment_id)
    values (gen_random_uuid()::text, v_lead.id, p_company, v_monto, v_op, 1, '', v_dest.id);
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
        'detalle', 'S/ ' || v_pagado || ' de S/ ' || v_total
                   || case when v_total > v_pagado then ' (faltan S/ ' || (v_total - v_pagado) || ')' else ' (pagado completo)' end
                   || case when v_conf > 0 then ' · ' || v_conf || ' cupo(s) confirmado(s)' else '' end
                   || case when cardinality(v_llenos) > 0 then ' · GRUPO LLENO, lo resuelve una persona: ' || array_to_string(v_llenos, ', ') else '' end);
end $$;

-- actualizar_lead: la ficha editada a mano. Un patch: lo ausente no se toca, '' vacía.
create or replace function public.agenda_lead_actualizar(p_company text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_lead   public.leads;
    v_act    text[] := '{}';
    v_custom jsonb;
    v_claves text[] := '{}';
    k        text;
    v        text;
begin
    perform public.v2_autorizar_agenda(p_company);
    select * into v_lead from public.leads where company_id = p_company and id = p_datos->>'lead_id';
    if not found then raise exception 'Ese cliente no es de este negocio.'; end if;

    if p_datos ? 'name' then
        update public.leads set name = left(btrim(coalesce(p_datos->>'name', '')), 120) where id = v_lead.id;
        v_act := v_act || 'name';
    end if;
    if p_datos ? 'customer_email' then
        v := lower(btrim(coalesce(p_datos->>'customer_email', '')));
        if v <> '' and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido.'; end if;
        update public.leads set customer_email = left(v, 200) where id = v_lead.id;
        v_act := v_act || 'customer_email';
    end if;
    if p_datos ? 'customer_address' then
        update public.leads set customer_address = left(btrim(coalesce(p_datos->>'customer_address', '')), 300) where id = v_lead.id;
        v_act := v_act || 'customer_address';
    end if;
    if p_datos ? 'notas_salon' then
        update public.leads set notas_salon = left(btrim(coalesce(p_datos->>'notas_salon', '')), 4000) where id = v_lead.id;
        v_act := v_act || 'notas_salon';
    end if;
    if jsonb_typeof(p_datos->'custom_data') = 'object' then
        v_custom := public.v2_json(v_lead.custom_data);
        for k, v in select key, value from jsonb_each_text(p_datos->'custom_data') loop
            if left(k, 1) = '_' then continue; end if;   -- claves del sistema: no llegan de fuera
            v_custom := v_custom || jsonb_build_object(k, left(btrim(coalesce(v, '')), 500));
            v_claves := v_claves || k;
        end loop;
        if cardinality(v_claves) > 0 then
            update public.leads set custom_data = v_custom::text where id = v_lead.id;
            v_act := v_act || 'custom_data';
        end if;
    end if;
    return jsonb_build_object('lead_id', v_lead.id, 'actualizados', to_jsonb(v_act))
           || case when cardinality(v_claves) > 0 then jsonb_build_object('claves_custom', to_jsonb(v_claves)) else '{}'::jsonb end;
end $$;

-- Gastos de la caja.
create or replace function public.agenda_gasto_guardar(p_company text, p_gasto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_id      text := coalesce(nullif(btrim(p_gasto->>'id'), ''), gen_random_uuid()::text);
    v_fecha   text := btrim(coalesce(p_gasto->>'fecha', ''));
    v_concepto text := btrim(coalesce(p_gasto->>'concepto', ''));
    v_importe numeric;
    v_previo  public.gastos;
begin
    perform public.v2_autorizar_agenda(p_company);
    if v_concepto = '' then raise exception 'Falta el concepto del gasto.'; end if;
    if v_fecha !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'La fecha del gasto tiene que ser YYYY-MM-DD.'; end if;
    begin
        v_importe := (p_gasto->>'importe')::numeric;
    exception when others then
        v_importe := null;
    end;
    if v_importe is null or v_importe < 0 then raise exception 'El importe tiene que ser un número mayor o igual que 0.'; end if;
    select * into v_previo from public.gastos where id = v_id;
    if found and v_previo.company_id <> p_company then raise exception 'Ese gasto no es de este negocio.'; end if;
    insert into public.gastos (id, company_id, fecha, concepto, categoria, importe, creado_por, created_at)
    values (v_id, p_company, v_fecha, v_concepto, btrim(coalesce(p_gasto->>'categoria', '')), v_importe,
            coalesce(v_previo.creado_por, (select auth.uid())::text, ''), coalesce(v_previo.created_at, extract(epoch from now())::bigint))
    on conflict (id) do update
       set fecha = excluded.fecha, concepto = excluded.concepto, categoria = excluded.categoria, importe = excluded.importe;
    return jsonb_build_object('id', v_id, 'fecha', v_fecha, 'importe', v_importe, 'nuevo', v_previo.id is null);
end $$;

create or replace function public.agenda_gasto_borrar(p_company text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_autorizar_agenda(p_company);
    delete from public.gastos where company_id = p_company and id = p_id;
    if not found then raise exception 'Ese gasto no existe en este negocio.'; end if;
    return jsonb_build_object('id', p_id, 'borrado', true);
end $$;

-- ── Mi página: reservar y pedir DIRECTO en la agenda (clave del servidor) ─────
-- Mismo contrato que reserva_srv_crear / pedido_srv_crear (0002 de Mi página), pero
-- escribe appointments / orders. Un negocio que no tiene la agenda en la nube recibe
-- 'no_es_nube' y la web sigue por las de la 0002.

create table if not exists public.pagina_idem (
    company_id text not null,
    idem       text not null,
    codigo     text not null,
    ref_id     text not null,
    datos      jsonb not null default '{}'::jsonb,
    creado_at  timestamptz not null default now(),
    primary key (company_id, idem)
);
alter table public.pagina_idem enable row level security;
revoke all on public.pagina_idem from anon, authenticated;

create or replace function public.agenda_srv_reservar(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag    public.tu_pagina;
    v_item   public.catalog;
    v_lead   public.leads;
    v_cita   public.appointments;
    v_lead_id text;
    v_tipo   text := p_datos->>'tipo';
    v_ini    text := p_datos->>'slot_start';
    v_emp    text := coalesce(p_datos->>'employee_id', '');
    v_hoy    text := left(public.v2_ahora(), 10);
    v_span   integer;
    v_motivo text;
    v_franja jsonb;
    v_cap    integer;
    v_n      integer;
    v_per    record;
    v_estado text;
    v_cod    text;
    v_ya     public.pagina_idem;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'reservar')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.agenda_en_nube(v_pag.company_id) then return jsonb_build_object('status', 'no_es_nube'); end if;

    select * into v_ya from public.pagina_idem where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_ya.codigo, 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    select * into v_item from public.catalog
     where company_id = v_pag.company_id and id = p_datos->>'catalog_id' and coalesce(is_active, 1) = 1;
    if not found then return jsonb_build_object('status', 'no_existe'); end if;

    begin
        select l.lead_id into v_lead_id from public.v2_lead(v_pag.company_id, p_datos->>'telefono', p_datos->>'nombre', 'web') l;
        select * into v_lead from public.leads where id = v_lead_id;
    exception when sqlstate '22023' then
        return jsonb_build_object('status', 'datos_invalidos');
    end;

    if (select count(*) from public.appointments where company_id = v_pag.company_id and lead_id = v_lead.id
          and status in ('confirmed', 'pending_payment') and created_at > extract(epoch from now() - interval '1 day')) >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    if v_tipo = 'cita' then
        if v_ini !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        if v_ini <= public.v2_ahora() then return jsonb_build_object('status', 'pasada'); end if;
        v_span := coalesce(nullif(v_item.duration_minutes, 0), (select nullif(slot_minutes, 0) from public.companies where id = v_pag.company_id), 60);
        v_motivo := public.v2_hueco(v_pag.company_id, v_ini, v_span, v_emp);
        if v_motivo is not null then return jsonb_build_object('status', 'lleno', 'motivo', v_motivo); end if;
        -- «Requerir pago para confirmar» y un servicio con precio: la cita queda APARTADA, ocupando su
        -- hora 24 h (v2_ocupa_hora) hasta que llegue el comprobante. Igual que book_appointment del bot.
        v_estado := case when coalesce(v_item.price, 0) > 0
                          and (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, beneficiario)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, public.tu_pagina_sumar_min(v_ini, v_span), v_span,
                v_emp, v_estado, btrim(coalesce(p_datos->>'beneficiario', '')))
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, coalesce(v_item.price, 0), v_span, 0);

    elsif v_tipo = 'grupo' then
        if v_ini not like 'sched:' || v_item.id || ':%' then return jsonb_build_object('status', 'datos_invalidos'); end if;
        select f into v_franja from jsonb_array_elements(public.v2_franjas(v_item.schedule_slots)) f
         where f->>'id' = split_part(v_ini, ':', 3) limit 1;
        if v_franja is null then return jsonb_build_object('status', 'no_existe'); end if;
        select * into v_per from public.v2_periodo(v_hoy, v_franja->>'start_date', coalesce(v_item.vigencia_meses, 1));
        v_cap := coalesce((v_franja->>'capacity')::integer, -1);
        if v_cap <> -1 then
            -- Ocupan su plaza los confirmados de ese periodo y, desde la página, también los que la
            -- apartaron sin pagar aún (ante la duda, lleno).
            select count(*) into v_n from public.appointments o
             where o.company_id = v_pag.company_id and o.slot_start = v_ini
               and (o.status = 'confirmed' or (o.status = 'pending_payment' and (coalesce(o.periodo_hasta, '') = '' or o.periodo_hasta >= v_hoy)))
               and (coalesce(o.periodo_desde, '') = '' or (o.periodo_desde <= v_per.hasta and o.periodo_hasta >= v_per.desde));
            if v_n >= v_cap then return jsonb_build_object('status', 'lleno'); end if;
        end if;
        v_estado := case when (select coalesce(require_payment_to_confirm, 0) from public.companies where id = v_pag.company_id) = 1
                         then 'pending_payment' else 'confirmed' end;
        insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                         beneficiario, periodo_desde, periodo_hasta)
        values (gen_random_uuid()::text, v_pag.company_id, v_lead.id, v_item.name, v_ini, '', 60, '', v_estado,
                btrim(coalesce(p_datos->>'beneficiario', '')), v_per.desde, v_per.hasta)
        returning * into v_cita;
        insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
        values (gen_random_uuid()::text, v_cita.id, v_pag.company_id, v_item.id, v_item.name, coalesce(v_item.price, 0), 0, 0);
    else
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    loop
        v_cod := public.envio_codigo('R');
        exit when not exists (select 1 from public.pagina_idem where company_id = v_pag.company_id and codigo = v_cod);
    end loop;
    insert into public.pagina_idem (company_id, idem, codigo, ref_id) values (v_pag.company_id, p_idem, v_cod, v_cita.id);
    return jsonb_build_object('status', 'ok', 'codigo', v_cod, 'servicio', v_item.name, 'precio', v_item.price,
                              'estado', v_cita.status, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation or invalid_datetime_format then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

create or replace function public.agenda_srv_pedir(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag     public.tu_pagina;
    v_lead    public.leads;
    v_lead_id text;
    v_item    public.catalog;
    v_var     public.catalog_variantes;
    l         jsonb;
    v_lineas  jsonb := '[]'::jsonb;
    v_items   jsonb := '[]'::jsonb;
    v_cant    integer;
    v_total   numeric := 0;
    v_entrega text := p_datos->>'entrega';
    v_dir     text;
    v_order   text := gen_random_uuid()::text;
    v_cod     text;
    v_ya      public.pagina_idem;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'catalogo')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    if not public.agenda_en_nube(v_pag.company_id) then return jsonb_build_object('status', 'no_es_nube'); end if;

    select * into v_ya from public.pagina_idem where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_ya.codigo, 'total', v_ya.datos->'total', 'lineas', v_ya.datos->'lineas', 'repetido', true); end if;

    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || v_pag.company_id));

    if jsonb_typeof(p_datos->'lineas') is distinct from 'array' or jsonb_array_length(p_datos->'lineas') not between 1 and 30 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if v_entrega not in ('recojo', 'delivery') then return jsonb_build_object('status', 'datos_invalidos'); end if;
    v_dir := btrim(coalesce(p_datos->>'direccion', ''));
    if v_entrega = 'delivery' and char_length(v_dir) < 5 then return jsonb_build_object('status', 'datos_invalidos'); end if;

    begin
        select l.lead_id into v_lead_id from public.v2_lead(v_pag.company_id, p_datos->>'telefono', p_datos->>'nombre', 'web') l;
        select * into v_lead from public.leads where id = v_lead_id;
    exception when sqlstate '22023' then
        return jsonb_build_object('status', 'datos_invalidos');
    end;
    if (select count(*) from public.orders where company_id = v_pag.company_id and lead_id = v_lead.id and status = 'pending'
          and created_at > extract(epoch from now() - interval '1 day')) >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    -- El stock es de la nube desde la etapa 2: se descuenta aquí, como create_order en el bot.
    for l in select * from jsonb_array_elements(p_datos->'lineas') loop
        v_cant := (l->>'cantidad')::integer;
        if v_cant is null or v_cant not between 1 and 99 then return jsonb_build_object('status', 'datos_invalidos'); end if;
        select * into v_item from public.catalog
         where company_id = v_pag.company_id and id = l->>'catalog_id' and coalesce(is_active, 1) = 1 for update;
        if not found then return jsonb_build_object('status', 'no_existe'); end if;
        v_var := null;
        if coalesce(l->>'variante_id', '') <> '' then
            select * into v_var from public.catalog_variantes
             where company_id = v_pag.company_id and catalog_id = v_item.id and id = l->>'variante_id' for update;
            if not found then return jsonb_build_object('status', 'no_existe'); end if;
            if v_var.stock < v_cant then
                return jsonb_build_object('status', 'sin_stock', 'producto', v_item.name || ' · ' || v_var.etiqueta, 'quedan', greatest(v_var.stock, 0));
            end if;
            update public.catalog_variantes set stock = stock - v_cant where id = v_var.id;
            perform public.v2_sincronizar_stock(v_pag.company_id, v_item.id);
        elsif exists (select 1 from public.catalog_variantes where company_id = v_pag.company_id and catalog_id = v_item.id) then
            return jsonb_build_object('status', 'falta_opcion', 'producto', v_item.name);
        elsif v_item.stock is not null then
            if v_item.stock < v_cant then
                return jsonb_build_object('status', 'sin_stock', 'producto', v_item.name, 'quedan', greatest(v_item.stock, 0));
            end if;
            update public.catalog set stock = stock - v_cant where company_id = v_pag.company_id and id = v_item.id;
        end if;
        v_lineas := v_lineas || jsonb_build_array(jsonb_build_object(
            'catalog_id', v_item.id, 'variante_id', coalesce(v_var.id, ''), 'nombre', v_item.name, 'opcion', coalesce(v_var.etiqueta, ''),
            'precio', coalesce(v_item.price, 0), 'cantidad', v_cant));
        v_items := v_items || jsonb_build_array(jsonb_build_object(
            'name', v_item.name || coalesce(' · ' || v_var.etiqueta, ''), 'price', coalesce(v_item.price, 0),
            'quantity', v_cant, 'catalog_item_id', v_item.id));
        v_total := v_total + coalesce(v_item.price, 0) * v_cant;
    end loop;

    insert into public.orders (id, company_id, lead_id, items, total, status, delivery_address, delivery_option)
    values (v_order, v_pag.company_id, v_lead.id, v_items::text, v_total, 'pending',
            case when v_entrega = 'delivery' then v_dir || case when btrim(coalesce(p_datos->>'referencia', '')) <> ''
                                                              then ' (' || btrim(p_datos->>'referencia') || ')' else '' end else '' end,
            case when v_entrega = 'delivery' then 'delivery' else 'pickup' end);

    loop
        v_cod := public.envio_codigo('P');
        exit when not exists (select 1 from public.pagina_idem where company_id = v_pag.company_id and codigo = v_cod);
    end loop;
    insert into public.pagina_idem (company_id, idem, codigo, ref_id, datos)
    values (v_pag.company_id, p_idem, v_cod, v_order, jsonb_build_object('total', v_total, 'lineas', v_lineas));
    return jsonb_build_object('status', 'ok', 'codigo', v_cod, 'total', v_total, 'lineas', v_lineas, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- ── Permisos ──────────────────────────────────────────────────────────────────

do $$
declare
    f text;
begin
    foreach f in array array[
        'agenda_en_nube(text)',
        'agenda_crear_cita(text, jsonb)', 'agenda_modificar_cita(text, jsonb)',
        'agenda_marcar_pagado(text, jsonb)', 'agenda_marcar_cumplido(text, jsonb)',
        'agenda_registrar_pago(text, jsonb, text)', 'agenda_lead_actualizar(text, jsonb)',
        'agenda_gasto_guardar(text, jsonb)', 'agenda_gasto_borrar(text, text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
    foreach f in array array['agenda_srv_reservar(text, jsonb, text)', 'agenda_srv_pedir(text, jsonb, text)'] loop
        execute format('revoke execute on function public.%s from public', f);
        execute format('grant execute on function public.%s to anon', f);
    end loop;
    foreach f in array array[
        'v2_autorizar_agenda(text, boolean)', 'v2_aforo(text, text, integer, text)',
        'v2_hueco(text, text, integer, text, text)', 'v2_lead(text, text, text, text)', 'v2_ocupa_hora(text, bigint)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
end $$;

commit;
