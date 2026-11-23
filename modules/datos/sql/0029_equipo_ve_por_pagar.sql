-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0029: el equipo ve, o no, las citas que esperan pago
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 23-nov-2026 (The 24/7, Mi agenda de un barbero con dos «Esperando pago»): «los
-- barberos no deberían ver las citas pendientes de pago, los confunde; que sea configurable,
-- hay negocios a los que sí les puede servir». Y: «¿debería haber un detalle para saber cuánto
-- le falta de adelanto?».
--
--   · `cobro_ajustes.equipo_ve_por_pagar`, APAGADO de serie: Mi agenda no enseña las citas en
--     `pending_payment` (apartadas a la espera del adelanto). Al confirmarse, aparecen.
--     Lo cambian el dueño o el administrador (Configuración › Pagos).
--   · Encendido, se ven con lo que falta del adelanto: mi_adelantos devuelve, de las que ve el
--     empleado (suyas o sin asignar), el total, lo pagado y el adelanto que la confirma.
--   · Los avisos al equipo (avisos 0004) siguen la misma regla: apagado, la cita «nueva» le
--     llega al barbero cuando se CONFIRMA, no cuando se aparta; y de una apartada que se mueve,
--     se reasigna o se cae, no se le dice nada (nunca la vio). La ref de «nueva» es la misma
--     (eq:nueva:<id>): una cita no avisa dos veces aunque se encienda a mitad.
--
-- Ocultarlas en Mi agenda es de pantalla, no de permisos: el empleado sigue pudiendo leer la
-- fila (la necesita la caja del empleado que cobra, datos 0012). No es un secreto, es ruido.
--
-- Necesita: datos 0010 (cobro_ajustes) y 0012 (cobro_foto_modo con empleado_cobra), tu-pagina
-- 0021 (v2_adelanto_minimo), avisos 0001 (avisos_apuntar) y 0004 (el trigger del equipo), y del
-- bot rol_en y mi_empleado. Sin la avisos 0004, el paso 4 deja la función lista y sin trigger.
--
-- Idempotente. Pruebas: tests/pruebas_0029_pglite.mjs. Deshacer: scripts/equipo-ve-por-pagar-0029-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · El interruptor ────────────────────────────────────────────────────────

alter table public.cobro_ajustes add column if not exists equipo_ve_por_pagar boolean not null default false;

create or replace function public.v2_equipo_ve_por_pagar(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select equipo_ve_por_pagar from public.cobro_ajustes where company_id = p_company), false);
$$;
revoke execute on function public.v2_equipo_ve_por_pagar(text) from public, anon, authenticated;

-- La de la 0012, con `equipo_ve_por_pagar`. Cualquiera del negocio: Mi agenda la lee.
create or replace function public.cobro_foto_modo(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null and coalesce((select auth.role()), '') <> 'service_role'
       and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object('modo', public.v2_foto_pago(p_company), 'nube', public.agenda_en_nube(p_company),
                              'empleado_cobra', public.v2_empleado_cobra(p_company),
                              'equipo_ve_por_pagar', public.v2_equipo_ve_por_pagar(p_company));
end $$;

-- Encender o apagar: el dueño o el administrador.
create or replace function public.equipo_ve_por_pagar_guardar(p_company text, p_activo boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Esto lo cambia el dueño o el administrador del negocio.' using errcode = '42501';
    end if;
    if p_activo is null then raise exception 'Di si se activa o no.'; end if;
    insert into public.cobro_ajustes (company_id, equipo_ve_por_pagar, actualizado_por, actualizado_at)
    values (p_company, p_activo, (select auth.uid()), now())
    on conflict (company_id) do update
       set equipo_ve_por_pagar = excluded.equipo_ve_por_pagar, actualizado_por = excluded.actualizado_por,
           actualizado_at = excluded.actualizado_at;
    return jsonb_build_object('equipo_ve_por_pagar', p_activo);
end $$;

-- ── 2 · Cuánto falta del adelanto ─────────────────────────────────────────────
-- { "<id>": { "total": 30, "pagado": 0, "adelanto": 15 }, … } de las citas apartadas que ve quien
-- pregunta: el empleado, las suyas y las sin asignar; el dueño y el administrador, todas. Con el
-- interruptor apagado, el empleado no recibe nada (no las ve).
create or replace function public.mi_adelantos(p_company text, p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_rol   text := public.rol_en(p_company);
    v_ficha text;
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        if not public.v2_equipo_ve_por_pagar(p_company) then return '{}'::jsonb; end if;
        v_ficha := coalesce(public.mi_empleado(p_company), '');
    end if;
    return coalesce((
        select jsonb_object_agg(x.id, jsonb_build_object(
                   'total', x.total, 'pagado', x.pagado, 'adelanto', public.v2_adelanto_minimo(p_company, x.total)))
          from (select a.id,
                       coalesce((select sum(s.price) from public.appointment_services s where s.appointment_id = a.id), 0) as total,
                       coalesce((select sum(p.amount) from public.pending_payments p
                                  where p.company_id = a.company_id and p.appointment_id = a.id), 0) as pagado
                  from public.appointments a
                 where a.company_id = p_company
                   and a.id = any (coalesce(p_ids, '{}'::text[]))
                   and a.status = 'pending_payment'
                   and (v_ficha is null or coalesce(a.employee_id, '') = '' or a.employee_id = v_ficha)) x),
        '{}'::jsonb);
end $$;

-- ── 3 · Permisos ──────────────────────────────────────────────────────────────

revoke execute on function public.equipo_ve_por_pagar_guardar(text, boolean) from public, anon;
revoke execute on function public.mi_adelantos(text, text[]) from public, anon;
grant execute on function public.equipo_ve_por_pagar_guardar(text, boolean) to authenticated;
grant execute on function public.mi_adelantos(text, text[]) to authenticated;
grant execute on function public.cobro_foto_modo(text) to authenticated;

-- ── 4 · Los avisos al equipo (avisos 0004), con la misma regla ────────────────
-- La de la 0004 tal cual, salvo que una apartada solo «existe» para el equipo si el negocio lo
-- encendió. Apagado: la «nueva» sale al pasar de apartada a confirmada.
create or replace function public.avisos_tg_agenda_equipo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_ahora   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_puntual boolean := new.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$';
    v_ve_pend boolean;
    v_viva    boolean;
    v_antes   boolean;
    v_base    jsonb;
    v_t       text := floor(extract(epoch from clock_timestamp()))::text;
    v_emp     text := coalesce(new.employee_id, '');
    v_old_emp text;
begin
    begin
        -- Lo que ya pasó no es noticia (el espejo poniéndose al día, una corrección).
        if v_puntual and new.slot_start < v_ahora then return null; end if;

        v_ve_pend := public.v2_equipo_ve_por_pagar(new.company_id);
        v_viva    := new.status = 'confirmed' or (new.status = 'pending_payment' and v_ve_pend);

        v_base := jsonb_build_object(
            'cita', new.id, 'lead_id', new.lead_id, 'servicio', coalesce(new.service, ''),
            'slot', new.slot_start, 'recurrente', not v_puntual,
            -- to_jsonb: si la columna no existe en este negocio, sale null y no falla.
            'beneficiario', nullif(btrim(coalesce(to_jsonb(new) ->> 'beneficiario', '')), ''));

        if tg_op = 'INSERT' then
            if not v_viva then return null; end if;
            -- Academia: una renovación del mismo grupo no es un alumno nuevo.
            if not v_puntual and exists (
                select 1 from public.appointments a
                 where a.company_id = new.company_id and a.lead_id = new.lead_id and a.id <> new.id
                   and a.slot_start = new.slot_start and a.status <> 'cancelled') then
                return null;
            end if;
            perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:nueva:' || new.id,
                v_base || jsonb_build_object('que', 'nueva', 'empleado', v_emp),
                coalesce(to_timestamp(new.created_at), now()));
            return null;
        end if;

        -- UPDATE. Las academias solo avisan del alumno nuevo: el resto es de cobro.
        if not v_puntual then return null; end if;
        v_antes   := old.status = 'confirmed' or (old.status = 'pending_payment' and v_ve_pend);
        v_old_emp := coalesce(old.employee_id, '');

        -- Para el equipo, la cita aparece ahora: se confirmó una apartada que no veía.
        if v_viva and not v_antes then
            perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:nueva:' || new.id,
                v_base || jsonb_build_object('que', 'nueva', 'empleado', v_emp));
        elsif v_antes and new.status = 'cancelled' then
            if v_old_emp <> '' then
                perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:cancelada:' || new.id || ':' || v_t,
                    v_base || jsonb_build_object('que', 'cancelada', 'empleado', v_old_emp));
            end if;
        elsif v_viva and v_emp is distinct from v_old_emp then
            if v_emp <> '' then
                perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:asignada:' || new.id || ':' || v_t,
                    v_base || jsonb_build_object('que', 'asignada', 'empleado', v_emp));
            end if;
            if v_old_emp <> '' then
                perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:quitada:' || new.id || ':' || v_t,
                    v_base || jsonb_build_object('que', 'quitada', 'empleado', v_old_emp));
            end if;
        elsif v_viva and new.slot_start is distinct from old.slot_start and v_emp <> '' then
            perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:movida:' || new.id || ':' || v_t,
                v_base || jsonb_build_object('que', 'movida', 'empleado', v_emp, 'antes', old.slot_start));
        end if;
    exception when others then
        -- Un aviso nunca tumba el cambio de la cita.
        raise warning 'avisos_tg_agenda_equipo: %', sqlerrm;
    end;
    return null;
end $$;
revoke execute on function public.avisos_tg_agenda_equipo() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
