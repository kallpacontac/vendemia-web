-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0034: cómo atiende Mia (24-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido del bot (24-nov-2026). Ajustes → Asistente → «Cómo atiende Mia» guarda tres campos
-- con `update_company`:
--
--   modo_atencion    'cierra' (por defecto) · 'hibrido' · 'dueno'
--   canal_cierre     'llamada' · 'meet'
--   servicio_cierre  id del servicio del catálogo que se agenda como llamada ('' = ninguno)
--
-- El bot ya los acepta; aquí, que `cfg_empresa_actualizar` los guarde también en los negocios
-- con la configuración en la nube. Sin esto volvían en `ignored`.
--
-- Columnas: las crea la migración del BOT supabase/migrations/0049_modo_atencion.sql, que va
-- ANTES que esta (si falta, esta se para con un aviso). Esa también pone los CHECK.
--
-- Reglas, LAS MISMAS que el bot (commands.service.ts, update_company): un valor fuera de la
-- lista rechaza el cambio ENTERO con su motivo, sin tildes ni mayúsculas («'híbrido'», «'Meet'»).
-- `servicio_cierre` no se valida: si el servicio no está, el bot atiende como 'cierra'.
-- Que el híbrido solo valga en un negocio de citas lo decide el bot al atender, no al guardar.
--
-- Idempotente (create or replace). Es la función de la 0006 con un bloque más y tres campos
-- más en la lista blanca: nada de lo anterior cambia.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'companies'
           and column_name in ('modo_atencion', 'canal_cierre', 'servicio_cierre')) < 3 then
        raise exception 'Faltan companies.modo_atencion / canal_cierre / servicio_cierre: aplica primero la 0049 del bot (supabase/migrations/0049_modo_atencion.sql).';
    end if;
end $$;

create or replace function public.cfg_empresa_actualizar(p_company text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol   text := public.v2_autorizar_config(p_company);
    v_patch jsonb := p_patch;
    v_sin   text[] := '{}';
    v_hechos text[];
    v_error text;
    v_campo text;
begin
    if v_rol <> 'dueno' then
        select coalesce(array_agg(k), '{}') into v_sin
          from unnest(array['payment_methods', 'owner_phone', 'admin_phone', 'whatsapp_phone']) k where v_patch ? k;
        v_patch := v_patch - 'payment_methods' - 'owner_phone' - 'admin_phone' - 'whatsapp_phone';
    end if;
    if v_patch ? 'schedule' then
        v_error := public.horario_error(v_patch->>'schedule');
        if v_error is not null then raise exception 'horario inválido: %', v_error; end if;
    end if;
    if v_patch ? 'qualifying_questions' and v_patch->'qualifying_questions' <> 'null'::jsonb then
        v_patch := v_patch || jsonb_build_object('qualifying_questions',
            public.v2_con_claves(case jsonb_typeof(v_patch->'qualifying_questions')
                                      when 'string' then v_patch->>'qualifying_questions'
                                      else (v_patch->'qualifying_questions')::text end));
    end if;
    -- 0006: valida y deja el texto JSON (un null aquí es «quitar todos», no «no tocar»).
    foreach v_campo in array array['welcome_media', 'closing_media'] loop
        if v_patch ? v_campo then
            v_patch := v_patch || jsonb_build_object(v_campo, public.v2_notas_media(v_campo, v_patch->v_campo));
        end if;
    end loop;
    -- 0034: cerrados a propósito, con el mismo texto que el bot. `->>` da null con un null JSON,
    -- y null tampoco vale: la columna es not null.
    if v_patch ? 'modo_atencion' and coalesce(v_patch->>'modo_atencion', '') not in ('cierra', 'hibrido', 'dueno') then
        raise exception 'modo_atencion debe ser ''cierra'', ''hibrido'' o ''dueno'', no "%"', v_patch->>'modo_atencion';
    end if;
    if v_patch ? 'canal_cierre' and coalesce(v_patch->>'canal_cierre', '') not in ('llamada', 'meet') then
        raise exception 'canal_cierre debe ser ''llamada'' o ''meet'', no "%"', v_patch->>'canal_cierre';
    end if;
    if v_patch ? 'servicio_cierre' then
        v_patch := v_patch || jsonb_build_object('servicio_cierre', btrim(coalesce(v_patch->>'servicio_cierre', '')));
    end if;
    v_hechos := public.v2_parchear('companies', p_company, v_patch, array[
        'name', 'bot_name', 'bot_tone', 'hook_question', 'custom_rules', 'return_policy',
        'delivery_type', 'business_mode', 'schedule', 'payment_methods',
        'whatsapp_phone', 'owner_phone', 'admin_phone', 'delivery_fee', 'delivery_days_ahead', 'request_location', 'is_active',
        'slot_minutes', 'express_fee', 'express_cutoff_hour', 'normal_fee', 'normal_cutoff_hour', 'location', 'proactive_venue',
        'qualifying_questions', 'google_calendar_id', 'owner_email', 'reminder_config',
        'appointment_grace_minutes', 'recurring_grace_days', 'business_description',
        'welcome_note', 'closing_note', 'ask_employee', 'employee_question', 'delivery_options', 'require_payment_to_confirm',
        'verify_vouchers', 'asumir_asistencia', 'welcome_media', 'closing_media',
        'modo_atencion', 'canal_cierre', 'servicio_cierre'
    ]);
    return jsonb_build_object(
        'updated', to_jsonb(v_hechos),
        'ignored', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_patch) k where k <> all(v_hechos)), '[]'::jsonb),
        'sin_permiso', to_jsonb(v_sin));
end $$;

revoke execute on function public.cfg_empresa_actualizar(text, jsonb) from public, anon;
grant  execute on function public.cfg_empresa_actualizar(text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
