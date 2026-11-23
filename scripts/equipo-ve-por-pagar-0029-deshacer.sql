-- Deshace modules/datos/sql/0029_equipo_ve_por_pagar.sql: vuelven cobro_foto_modo (datos 0012) y el
-- trigger del equipo (avisos 0004) como estaban; se van mi_adelantos, el guardar y la columna.
-- Ojo: el panel esconde las apartadas en Mi agenda mientras cobro_foto_modo no diga
-- equipo_ve_por_pagar = true. Deshecho esto, siguen escondidas hasta tocar el código.

begin;

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

create or replace function public.avisos_tg_agenda_equipo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_ahora   text := to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI');
    v_puntual boolean := new.slot_start ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$';
    v_viva    boolean := new.status in ('confirmed', 'pending_payment');
    v_antes   boolean;
    v_base    jsonb;
    v_t       text := floor(extract(epoch from clock_timestamp()))::text;
    v_emp     text := coalesce(new.employee_id, '');
    v_old_emp text;
begin
    begin
        -- Lo que ya pasó no es noticia (el espejo poniéndose al día, una corrección).
        if v_puntual and new.slot_start < v_ahora then return null; end if;

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
        v_antes   := old.status in ('confirmed', 'pending_payment');
        v_old_emp := coalesce(old.employee_id, '');

        if v_antes and new.status = 'cancelled' then
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

drop function if exists public.mi_adelantos(text, text[]);
drop function if exists public.equipo_ve_por_pagar_guardar(text, boolean);
drop function if exists public.v2_equipo_ve_por_pagar(text);
alter table public.cobro_ajustes drop column if exists equipo_ve_por_pagar;

commit;

notify pgrst, 'reload schema';
