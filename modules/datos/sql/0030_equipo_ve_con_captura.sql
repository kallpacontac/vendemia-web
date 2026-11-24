-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0030: el equipo ve la apartada si el cliente ya mandó la captura
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 24-nov-2026 (The 24/7: Victor reservó con Alexander y él no la veía; estaba
-- «Esperando pago»): «si separó con el 50 % sí lo debería ver», y luego «déjalo configurable,
-- porque no es lo ideal». Así que la 0029 pasa de dos a TRES posturas, en Configuración › Pagos:
--
--   · 'nunca'        (de serie) el barbero ve la cita al confirmarse (pago aprobado). Como la 0029.
--   · 'con_captura'  también la apartada cuyo cliente ya mandó la captura del adelanto, aunque
--                    nadie la haya aprobado aún (comprobantes_web 'revisar' o 'aprobado'), o con
--                    algún pago apuntado (pending_payments). Sin nada pagado, sigue oculta.
--   · 'todas'        todas las apartadas (= equipo_ve_por_pagar de la 0029 encendido).
--
--   · Columna nueva cobro_ajustes.equipo_ve_con_captura; 'todas' sigue siendo
--     equipo_ve_por_pagar = true, así la 0029 y su pantalla siguen valiendo.
--   · mi_adelantos: con 'con_captura' devuelve al empleado SOLO las apartadas con captura o pago,
--     y Mi agenda enseña las que vengan. Cada una dice además `por_revisar` (captura sin aprobar).
--   · El aviso push al barbero (avisos_tg_agenda_equipo) sigue la misma regla: con 'con_captura'
--     la «nueva» le llega cuando el cliente sube la captura (trigger en comprobantes_web).
--     La ref es la de siempre (eq:nueva:<id>): no avisa dos veces.
--
-- Necesita la 0029. Idempotente. Pruebas: tests/pruebas_0030_pglite.mjs.
-- Deshacer: al final.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · La postura ────────────────────────────────────────────────────────────

alter table public.cobro_ajustes add column if not exists equipo_ve_con_captura boolean not null default false;

create or replace function public.v2_equipo_ve_con_captura(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select equipo_ve_con_captura from public.cobro_ajustes where company_id = p_company), false);
$$;
revoke execute on function public.v2_equipo_ve_con_captura(text) from public, anon, authenticated;

-- 'nunca' | 'con_captura' | 'todas'
create or replace function public.v2_equipo_ve_apartadas(p_company text)
returns text language sql stable security definer set search_path = public as $$
    select case when public.v2_equipo_ve_por_pagar(p_company) then 'todas'
                when public.v2_equipo_ve_con_captura(p_company) then 'con_captura'
                else 'nunca' end;
$$;
revoke execute on function public.v2_equipo_ve_apartadas(text) from public, anon, authenticated;

-- ¿El cliente de esta apartada ya mandó su captura o hay algo pagado?
-- p_antes_de: solo lo apuntado ANTES de ese momento (el trigger mira cómo estaba antes del cambio).
create or replace function public.v2_apartada_con_captura(p_company text, p_cita text, p_antes_de timestamptz default null)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.comprobantes_web c
                    where c.company_id = p_company and c.appointment_id = p_cita
                      and c.estado in ('revisar', 'aprobado')
                      and (p_antes_de is null or c.creado_at < p_antes_de))
        or exists (select 1 from public.pending_payments p
                    where p.company_id = p_company and p.appointment_id = p_cita and coalesce(p.amount, 0) > 0
                      and (p_antes_de is null or p.created_at < extract(epoch from p_antes_de)::bigint));
$$;
revoke execute on function public.v2_apartada_con_captura(text, text, timestamptz) from public, anon, authenticated;

-- Lo que lee el panel: la 0029 + la postura entera.
create or replace function public.cobro_foto_modo(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null and coalesce((select auth.role()), '') <> 'service_role'
       and not public.es_admin_plataforma() then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object('modo', public.v2_foto_pago(p_company), 'nube', public.agenda_en_nube(p_company),
                              'empleado_cobra', public.v2_empleado_cobra(p_company),
                              'equipo_ve_por_pagar', public.v2_equipo_ve_por_pagar(p_company),
                              'equipo_ve_apartadas', public.v2_equipo_ve_apartadas(p_company));
end $$;

-- Cambiarla: el dueño o el administrador.
create or replace function public.equipo_ve_apartadas_guardar(p_company text, p_modo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Esto lo cambia el dueño o el administrador del negocio.' using errcode = '42501';
    end if;
    if p_modo is null or p_modo not in ('nunca', 'con_captura', 'todas') then
        raise exception 'Elige: nunca, con captura o todas.' using errcode = '22023';
    end if;
    insert into public.cobro_ajustes (company_id, equipo_ve_por_pagar, equipo_ve_con_captura, actualizado_por, actualizado_at)
    values (p_company, p_modo = 'todas', p_modo = 'con_captura', (select auth.uid()), now())
    on conflict (company_id) do update
       set equipo_ve_por_pagar = excluded.equipo_ve_por_pagar,
           equipo_ve_con_captura = excluded.equipo_ve_con_captura,
           actualizado_por = excluded.actualizado_por, actualizado_at = excluded.actualizado_at;
    return jsonb_build_object('equipo_ve_apartadas', p_modo);
end $$;

-- ── 2 · Lo que falta del adelanto, con la postura ─────────────────────────────

create or replace function public.mi_adelantos(p_company text, p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_rol   text := public.rol_en(p_company);
    v_modo  text := 'todas';
    v_ficha text;
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('dueno', 'admin') then
        v_modo := public.v2_equipo_ve_apartadas(p_company);
        if v_modo = 'nunca' then return '{}'::jsonb; end if;
        v_ficha := coalesce(public.mi_empleado(p_company), '');
    end if;
    return coalesce((
        select jsonb_object_agg(x.id, jsonb_build_object(
                   'total', x.total, 'pagado', x.pagado, 'adelanto', public.v2_adelanto_minimo(p_company, x.total),
                   'por_revisar', x.por_revisar))
          from (select a.id,
                       coalesce((select sum(s.price) from public.appointment_services s where s.appointment_id = a.id), 0) as total,
                       coalesce((select sum(p.amount) from public.pending_payments p
                                  where p.company_id = a.company_id and p.appointment_id = a.id), 0) as pagado,
                       exists (select 1 from public.comprobantes_web c
                                where c.company_id = a.company_id and c.appointment_id = a.id and c.estado = 'revisar') as por_revisar
                  from public.appointments a
                 where a.company_id = p_company
                   and a.id = any (coalesce(p_ids, '{}'::text[]))
                   and a.status = 'pending_payment'
                   and (v_ficha is null or coalesce(a.employee_id, '') = '' or a.employee_id = v_ficha)
                   and (v_modo <> 'con_captura' or public.v2_apartada_con_captura(p_company, a.id))) x),
        '{}'::jsonb);
end $$;

-- ── 3 · Permisos ──────────────────────────────────────────────────────────────

revoke execute on function public.equipo_ve_apartadas_guardar(text, text) from public, anon;
grant execute on function public.equipo_ve_apartadas_guardar(text, text) to authenticated;
grant execute on function public.mi_adelantos(text, text[]) to authenticated;
grant execute on function public.cobro_foto_modo(text) to authenticated;

-- ── 4 · Los avisos al equipo, con la misma regla ──────────────────────────────
-- La de la 0029 tal cual, salvo cuándo «existe» una apartada para el equipo.
create or replace function public.avisos_tg_agenda_equipo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_ahora   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_puntual boolean := new.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$';
    v_modo    text;
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

        v_modo := public.v2_equipo_ve_apartadas(new.company_id);
        v_viva := new.status = 'confirmed'
               or (new.status = 'pending_payment'
                   and (v_modo = 'todas' or (v_modo = 'con_captura' and public.v2_apartada_con_captura(new.company_id, new.id))));

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
        -- Cómo la veía el equipo ANTES de este cambio: una captura de esta misma transacción no cuenta.
        v_antes := old.status = 'confirmed'
                or (old.status = 'pending_payment'
                    and (v_modo = 'todas' or (v_modo = 'con_captura' and public.v2_apartada_con_captura(new.company_id, new.id, now()))));
        v_old_emp := coalesce(old.employee_id, '');

        -- Para el equipo, la cita aparece ahora: se confirmó (o mandó su captura) una que no veía.
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

-- La captura llega sin tocar la cita (o la toca antes): el aviso «nueva» sale de aquí.
create or replace function public.avisos_tg_captura_equipo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_cita public.appointments;
    v_ahora text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
begin
    begin
        if new.estado not in ('revisar', 'aprobado') then return null; end if;
        if public.v2_equipo_ve_apartadas(new.company_id) <> 'con_captura' then return null; end if;
        select * into v_cita from public.appointments where company_id = new.company_id and id = new.appointment_id;
        if not found or v_cita.status <> 'pending_payment' then return null; end if;
        if v_cita.slot_start !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' or v_cita.slot_start < v_ahora then return null; end if;
        perform public.avisos_apuntar(v_cita.company_id, 'mi_agenda', 'eq:nueva:' || v_cita.id,
            jsonb_build_object('cita', v_cita.id, 'lead_id', v_cita.lead_id, 'servicio', coalesce(v_cita.service, ''),
                               'slot', v_cita.slot_start, 'recurrente', false,
                               'beneficiario', nullif(btrim(coalesce(to_jsonb(v_cita) ->> 'beneficiario', '')), ''),
                               'que', 'nueva', 'empleado', coalesce(v_cita.employee_id, '')));
    exception when others then
        raise warning 'avisos_tg_captura_equipo: %', sqlerrm;
    end;
    return null;
end $$;
revoke execute on function public.avisos_tg_captura_equipo() from public, anon, authenticated;

drop trigger if exists avisos_captura_equipo on public.comprobantes_web;
create trigger avisos_captura_equipo after insert on public.comprobantes_web
    for each row execute function public.avisos_tg_captura_equipo();

commit;

notify pgrst, 'reload schema';

-- Comprobación: la postura de The 24/7 ('nunca' hasta que la cambien en Configuración › Pagos).
select public.v2_equipo_ve_apartadas('the247barbershop') as the247;

-- Deshacer (vuelve a la 0029):
--   drop trigger if exists avisos_captura_equipo on public.comprobantes_web;
--   drop function if exists public.avisos_tg_captura_equipo();
--   drop function if exists public.equipo_ve_apartadas_guardar(text, text);
--   y volver a correr modules/datos/sql/0029_equipo_ve_por_pagar.sql (mi_adelantos, cobro_foto_modo
--   y el trigger del equipo vuelven a los suyos). La columna equipo_ve_con_captura puede quedarse.
