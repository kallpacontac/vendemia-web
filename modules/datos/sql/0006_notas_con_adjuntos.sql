-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0006: fotos, vídeos y audios en el saludo y el cierre (21-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido del bot (21-oct-2026). Ajustes → Saludo y Cierre llevan debajo de cada nota hasta
-- 3 adjuntos. El bot ya los manda; aquí, que `cfg_empresa_actualizar` los guarde en los
-- negocios con la configuración en la nube. Hasta hoy volvían en `ignored`.
--
-- Columnas `companies.welcome_media` y `closing_media`: texto JSON, '[]' por defecto.
-- Las crea la migración del BOT supabase/migrations/0046_notas_con_adjuntos.sql, que va
-- ANTES que esta (si falta, esta se para con un aviso).
--
--   [{ "url": "https://res.cloudinary.com/…", "type": "image" | "video" | "audio", "name": "sede.mp4" }]
--
-- Reglas, LAS MISMAS que el bot (un adjunto malo rechaza el cambio entero con su motivo;
-- no se descarta en silencio):
--   · como mucho 3; '[]' (o null, o '') = quitar todos
--   · url https y host exacto res.cloudinary.com
--   · type solo image, video o audio (documentos no)
--   · sin urls repetidas
-- Se acepta la lista JSON o su texto; se guarda SIEMPRE el texto.
--
-- Idempotente (create or replace); los permisos de la 0002 se conservan y se repiten.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'companies'
           and column_name in ('welcome_media', 'closing_media')) < 2 then
        raise exception 'Faltan companies.welcome_media / closing_media: aplica primero la 0046 del bot (supabase/migrations/0046_notas_con_adjuntos.sql).';
    end if;
end $$;

-- ── 1 · Validar una lista de adjuntos ─────────────────────────────────────────

-- Devuelve el texto JSON a guardar ({url, type, name} y nada más) o lanza el motivo,
-- con el nombre del campo delante como el bot: «welcome_media: url que no es de Cloudinary: …».
create or replace function public.v2_notas_media(p_campo text, p_valor jsonb)
returns text language plpgsql immutable set search_path = public as $$
declare
    v_lista  jsonb;
    v_salida jsonb := '[]'::jsonb;
    v_urls   text[] := '{}';
    a        jsonb;
    v_url    text;
    v_tipo   text;
begin
    if p_valor is null or p_valor = 'null'::jsonb then return '[]'; end if;
    if jsonb_typeof(p_valor) = 'string' then
        if btrim(p_valor #>> '{}') = '' then return '[]'; end if;
        begin
            v_lista := (p_valor #>> '{}')::jsonb;
        exception when others then
            raise exception '%: no es una lista JSON', p_campo;
        end;
    else
        v_lista := p_valor;
    end if;
    if jsonb_typeof(v_lista) <> 'array' then
        raise exception '%: tiene que ser una lista de adjuntos', p_campo;
    end if;
    if jsonb_array_length(v_lista) > 3 then
        raise exception '%: como mucho 3 adjuntos por nota (llegaron %)', p_campo, jsonb_array_length(v_lista);
    end if;

    for a in select value from jsonb_array_elements(v_lista) loop
        if jsonb_typeof(a) <> 'object' then
            raise exception '%: cada adjunto es un objeto {url, type, name}', p_campo;
        end if;
        v_url  := btrim(coalesce(a->>'url', ''));
        v_tipo := coalesce(a->>'type', '');
        -- La barra tras el host es lo que lo hace EXACTO: corta res.cloudinary.com.otro.com,
        -- res.cloudinary.com@otro.com y el puerto.
        if v_url !~ '^https://res\.cloudinary\.com/' then
            raise exception '%: url que no es de Cloudinary: %', p_campo, v_url;
        end if;
        if v_tipo not in ('image', 'video', 'audio') then
            raise exception '%: tipo "%" no válido (solo image, video o audio): %', p_campo, v_tipo, v_url;
        end if;
        if v_url = any(v_urls) then
            raise exception '%: adjunto repetido: %', p_campo, v_url;
        end if;
        v_urls := v_urls || v_url;
        v_salida := v_salida || jsonb_build_array(jsonb_build_object(
            'url', v_url, 'type', v_tipo, 'name', coalesce(a->>'name', '')));
    end loop;
    return v_salida::text;
end $$;

-- ── 2 · cfg_empresa_actualizar: la de la 0002 + los dos campos ──────────────

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
    v_hechos := public.v2_parchear('companies', p_company, v_patch, array[
        'name', 'bot_name', 'bot_tone', 'hook_question', 'custom_rules', 'return_policy',
        'delivery_type', 'business_mode', 'schedule', 'payment_methods',
        'whatsapp_phone', 'owner_phone', 'admin_phone', 'delivery_fee', 'delivery_days_ahead', 'request_location', 'is_active',
        'slot_minutes', 'express_fee', 'express_cutoff_hour', 'normal_fee', 'normal_cutoff_hour', 'location', 'proactive_venue',
        'qualifying_questions', 'google_calendar_id', 'owner_email', 'reminder_config',
        'appointment_grace_minutes', 'recurring_grace_days', 'business_description',
        'welcome_note', 'closing_note', 'ask_employee', 'employee_question', 'delivery_options', 'require_payment_to_confirm',
        'verify_vouchers', 'asumir_asistencia', 'welcome_media', 'closing_media'
    ]);
    return jsonb_build_object(
        'updated', to_jsonb(v_hechos),
        'ignored', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_patch) k where k <> all(v_hechos)), '[]'::jsonb),
        'sin_permiso', to_jsonb(v_sin));
end $$;

-- ── 3 · Permisos ──────────────────────────────────────────────────────────────

revoke execute on function public.v2_notas_media(text, jsonb)         from public, anon, authenticated;
revoke execute on function public.cfg_empresa_actualizar(text, jsonb) from public, anon;
grant  execute on function public.cfg_empresa_actualizar(text, jsonb) to authenticated, service_role;

commit;
