-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA DE DATOS v2 · ETAPA 1: los cimientos en Postgres
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Ver docs/ARQUITECTURA-DATOS-V2.md. Esta migración NO cambia nada visible:
--
--   1. Quién manda en cada negocio: `datos_v2_empresas`. Sin fila = el bot, como siempre.
--   2. La bajada: cada fila de las tablas que pasan a la nube lleva `sync_version`
--      (secuencia global) y cada borrado deja rastro en `sync_borrados`. Con eso el bot
--      se trae «lo que cambió desde mi cursor» sin depender de que le llegue un evento.
--   3. Las escrituras de configuración (cfg_*) con las MISMAS reglas que hoy aplican los
--      handlers del bot (src/services/commands.service.ts y src/utils/roles.ts):
--        · el administrador y el dueño editan; el empleado no;
--        · comisiones y campos de cobro solo los cambia el dueño (al administrador se le
--          quitan y se le dice cuáles, igual que quitarCamposSinPermiso);
--        · editar es un PATCH: lo que no viene se conserva, un null explícito sí se aplica;
--        · un id de otra empresa se rechaza;
--        · el horario se valida (utils/horario.ts) y la comisión va de 0 a 100.
--
-- Las cfg_* SOLO actúan en negocios con config_en_nube = true. En uno que todavía es del
-- bot, escribir aquí sería un lost update: el espejo reimprime la fila entera en cuanto el
-- bot la toca. Por eso se niegan, con un mensaje que lo dice.
--
-- Desde esta migración, el esquema de las tablas que pasan a la nube se versiona en ESTE
-- repo (modules/datos/sql). Las de conversación siguen en supabase/migrations del bot.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1 · Quién manda ───────────────────────────────────────────────────────────

create table if not exists public.datos_v2_empresas (
    company_id     text primary key references public.companies(id) on delete cascade,
    config_en_nube boolean not null default false,
    agenda_en_nube boolean not null default false,
    cambiado_at    timestamptz not null default now()
);
alter table public.datos_v2_empresas enable row level security;
drop policy if exists datos_v2_empresas_leer on public.datos_v2_empresas;
create policy datos_v2_empresas_leer on public.datos_v2_empresas
    for select to authenticated using ((select public.is_member(company_id)));

create or replace function public.config_en_nube(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce((select config_en_nube from public.datos_v2_empresas where company_id = p_company), false);
$$;

-- Un negocio que crea una PERSONA desde la web (alta de Fideliza o de Tu página) no tiene bot:
-- nace en la nube. El espejo del bot sube con la clave de servicio, sin auth.uid(), así
-- que sus altas no entran aquí.
create or replace function public.v2_alta_en_nube()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    if (select auth.uid()) is not null then
        insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube)
        values (new.id, true, true)
        on conflict (company_id) do nothing;
    end if;
    return new;
end $$;
drop trigger if exists v2_alta_en_nube on public.companies;
create trigger v2_alta_en_nube after insert on public.companies
    for each row execute function public.v2_alta_en_nube();

-- El corte de la etapa 2 (y el de la 4) se hace con esto, negocio a negocio. Solo el
-- equipo de Vendemia.
create or replace function public.datos_v2_marcar(p_company text, p_config boolean, p_agenda boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.es_admin_plataforma() and (select auth.role()) <> 'service_role' then
        raise exception 'solo el equipo de Vendemia' using errcode = '42501';
    end if;
    insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube, cambiado_at)
    values (p_company, p_config, p_agenda, now())
    on conflict (company_id) do update
       set config_en_nube = excluded.config_en_nube,
           agenda_en_nube = excluded.agenda_en_nube,
           cambiado_at    = now();
end $$;

-- ── 2 · La bajada ─────────────────────────────────────────────────────────────

create sequence if not exists public.sync_seq;

create or replace function public.v2_sellar()
returns trigger language plpgsql as $$
begin
    new.sync_version := nextval('public.sync_seq');
    return new;
end $$;

-- `appointment_services` no tiene company_id, y la bajada filtra por negocio. Se rellena
-- desde su cita (el espejo sube padres antes que hijos, así que la cita ya está).
alter table public.appointment_services add column if not exists company_id text;
create or replace function public.v2_linea_con_empresa()
returns trigger language plpgsql as $$
begin
    if new.company_id is null then
        select a.company_id into new.company_id from public.appointments a where a.id = new.appointment_id;
    end if;
    return new;
end $$;
drop trigger if exists v2_linea_con_empresa on public.appointment_services;
create trigger v2_linea_con_empresa before insert or update on public.appointment_services
    for each row execute function public.v2_linea_con_empresa();
update public.appointment_services s set company_id = a.company_id
  from public.appointments a where a.id = s.appointment_id and s.company_id is null;

create table if not exists public.sync_borrados (
    sync_version bigint primary key default nextval('public.sync_seq'),
    tabla        text not null,
    pk           text not null,
    company_id   text not null,
    borrado_at   timestamptz not null default now()
);
create index if not exists idx_sync_borrados on public.sync_borrados(company_id, sync_version);
-- Solo la clave de servicio (el bot) la lee: sin políticas.
alter table public.sync_borrados enable row level security;

create or replace function public.v2_anotar_borrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.sync_borrados (tabla, pk, company_id)
    values (tg_table_name, old.id,
            case when tg_table_name = 'companies' then old.id else old.company_id end);
    return old;
end $$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'companies', 'catalog', 'catalog_media', 'employees', 'employee_blocks', 'form_templates',
        'appointments', 'appointment_services', 'orders', 'pending_payments', 'gastos'
    ] loop
        execute format('alter table public.%I add column if not exists sync_version bigint', t);
        execute format('drop trigger if exists v2_sellar on public.%I', t);
        execute format('create trigger v2_sellar before insert or update on public.%I
                        for each row execute function public.v2_sellar()', t);
        execute format('drop trigger if exists v2_anotar_borrado on public.%I', t);
        execute format('create trigger v2_anotar_borrado after delete on public.%I
                        for each row execute function public.v2_anotar_borrado()', t);
        execute format('update public.%I set sync_version = nextval(''public.sync_seq'') where sync_version is null', t);
        if t = 'companies' then
            execute 'create index if not exists idx_sync_companies on public.companies(sync_version)';
        else
            execute format('create index if not exists %I on public.%I(company_id, sync_version)', 'idx_sync_' || t, t);
        end if;
    end loop;
end $$;

-- ── 3 · Ayudantes de escritura ────────────────────────────────────────────────

-- Copia de errorDeHorario (bot: src/utils/horario.ts). null = vale. '' vale: hereda.
create or replace function public.horario_error(p text)
returns text language plpgsql immutable as $$
declare
    h jsonb;
    k text;
    v jsonb;
    abiertos integer := 0;
begin
    if btrim(coalesce(p, '')) = '' then return null; end if;
    begin
        h := p::jsonb;
    exception when others then
        return 'no es JSON válido';
    end;
    if jsonb_typeof(h) <> 'object' then
        return 'tiene que ser un objeto con los días de la semana (monday…sunday)';
    end if;
    for k, v in select * from jsonb_each(h) loop
        if k not in ('monday','tuesday','wednesday','thursday','friday','saturday','sunday') then
            return format('"%s" no es un día: se espera monday, tuesday… sunday', k);
        end if;
        if jsonb_typeof(v) <> 'object' then return format('%s: tiene que ser un objeto', k); end if;
        if v->'closed' = 'true'::jsonb then continue; end if;
        if coalesce(v->>'open', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then return format('%s: "open" tiene que ser HH:MM', k); end if;
        if coalesce(v->>'close', '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then return format('%s: "close" tiene que ser HH:MM', k); end if;
        if v->>'open' >= v->>'close' then
            return format('%s: abre (%s) a la misma hora o después de cerrar (%s)', k, v->>'open', v->>'close');
        end if;
        abiertos := abiertos + 1;
    end loop;
    if abiertos = 0 then
        return 'no tiene ningún día abierto: si ese trabajador no trabaja, desactívalo en vez de dejarlo sin horario';
    end if;
    return null;
end $$;

-- Como comisionValida del bot, que hace Number(v): un «45» en texto también vale.
create or replace function public.v2_comision_valida(p jsonb, p_donde text)
returns void language plpgsql immutable as $$
declare
    n numeric;
begin
    if p is null or p = 'null'::jsonb then return; end if;
    begin
        n := (p #>> '{}')::numeric;
    exception when others then
        n := null;
    end;
    if n is null or n < 0 or n > 100 then
        raise exception '% inválida: "%". Va de 0 a 100 (45 = 45 %%)', p_donde, p #>> '{}';
    end if;
end $$;

-- Quién llama, y si puede escribir configuración en ese negocio. Devuelve 'dueno' o 'admin'.
-- Mismos mínimos que MINIMO_POR_COMANDO del bot: catálogo, equipo y ajustes = administrador.
create or replace function public.v2_autorizar_config(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('admin', 'dueno') then
        raise exception 'Eso lo hace el dueño o el administrador del negocio.' using errcode = '42501';
    end if;
    if not public.config_en_nube(p_company) then
        raise exception 'La configuración de este negocio todavía la guarda su bot (arquitectura v2, etapa 2 sin cortar).'
            using errcode = '55000';
    end if;
    return v_rol;
end $$;

-- El PATCH genérico: aplica a la fila `p_id` las claves de `p_patch` que estén en
-- `p_cols` y existan de verdad en la tabla (sin las generadas). Un null explícito se
-- aplica; una clave ausente no se toca. Devuelve las columnas aplicadas.
create or replace function public.v2_parchear(p_tabla text, p_id text, p_patch jsonb, p_cols text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
    v_cols text[];
    v_lista text;
begin
    select coalesce(array_agg(a.attname::text order by a.attnum), '{}') into v_cols
      from pg_attribute a
     where a.attrelid = ('public.' || p_tabla)::regclass
       and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
       and a.attname::text = any(p_cols)
       and p_patch ? a.attname::text;
    if cardinality(v_cols) = 0 then return v_cols; end if;
    select string_agg(quote_ident(c), ', ') into v_lista from unnest(v_cols) c;
    if cardinality(v_cols) = 1 then
        execute format('update public.%I t set %s = (select r.%s from jsonb_populate_record(t, $1) r) where t.id = $2',
                       p_tabla, v_lista, v_lista) using p_patch, p_id;
    else
        execute format('update public.%I t set (%s) = (select %s from jsonb_populate_record(t, $1) r) where t.id = $2',
                       p_tabla, v_lista, (select string_agg('r.' || quote_ident(c), ', ') from unnest(v_cols) c))
            using p_patch, p_id;
    end if;
    return v_cols;
end $$;

-- ── 4 · Catálogo ──────────────────────────────────────────────────────────────

-- upsert_catalog_item. Devuelve { id, fusionado, sin_permiso[] }.
create or replace function public.cfg_producto_guardar(p_company text, p_item jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol  text := public.v2_autorizar_config(p_company);
    v_id   text := nullif(btrim(coalesce(p_item->>'id', '')), '');
    v_prev public.catalog;
    v_item jsonb := p_item - 'id' - 'company_id';
    v_sin  text[] := '{}';
    v_nombre text;
begin
    if v_id is not null then
        select * into v_prev from public.catalog where id = v_id;
        if found and v_prev.company_id <> p_company then
            raise exception 'el producto % no es de %', v_id, p_company;
        end if;
    end if;
    -- Comisiones: el administrador las ve, no las cambia.
    if v_rol <> 'dueno' then
        select coalesce(array_agg(k), '{}') into v_sin from unnest(array['comision_pct', 'comision_monto']) k where v_item ? k;
        v_item := v_item - 'comision_pct' - 'comision_monto';
    end if;
    perform public.v2_comision_valida(v_item->'comision_pct', 'comision_pct del servicio');
    if v_item ? 'comision_monto' and v_item->'comision_monto' <> 'null'::jsonb
       and coalesce(v_item->>'comision_monto', '') !~ '^\d+(\.\d+)?$' then
        raise exception 'comision_monto debe ser un número >= 0';
    end if;

    v_nombre := btrim(coalesce(v_item->>'name', v_prev.name, ''));
    if v_nombre = '' then raise exception 'payload.item.name requerido'; end if;
    v_item := v_item || jsonb_build_object('name', v_nombre, 'updated_at', extract(epoch from now())::bigint);

    if v_prev.id is null then
        v_id := coalesce(v_id, gen_random_uuid()::text);
        insert into public.catalog (id, company_id, name) values (v_id, p_company, v_nombre);
    end if;
    perform public.v2_parchear('catalog', v_id, v_item, array[
        'name', 'description', 'price', 'currency', 'duration_minutes', 'is_active', 'sort_order', 'stock',
        'capacity', 'max_discount', 'package_services', 'schedule_slots', 'start_date', 'vigencia_meses',
        'comision_pct', 'comision_monto', 'promo_vigencia', 'familia', 'discovery_questions', 'linked_service',
        'updated_at'
    ]);
    return jsonb_build_object('id', v_id, 'fusionado', v_prev.id is not null, 'sin_permiso', to_jsonb(v_sin));
end $$;

-- delete_catalog_item: borrado LÓGICO, como el bot (is_active = 0).
create or replace function public.cfg_producto_borrar(p_company text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_autorizar_config(p_company);
    update public.catalog set is_active = 0, updated_at = extract(epoch from now())::bigint
     where id = p_id and company_id = p_company;
    return jsonb_build_object('id', p_id);
end $$;

-- upsert_catalog_media: solo la URL; sin sort_order va al final (MAX+1).
create or replace function public.cfg_media_guardar(p_company text, p_media jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_item public.catalog;
    v_id   text := coalesce(nullif(p_media->>'id', ''), gen_random_uuid()::text);
    v_orden integer;
begin
    perform public.v2_autorizar_config(p_company);
    select * into v_item from public.catalog where id = p_media->>'catalog_id' and company_id = p_company;
    if not found then raise exception 'el producto % no existe en %', p_media->>'catalog_id', p_company; end if;
    if coalesce(p_media->>'url', '') !~* '^https?://' then raise exception 'payload.url debe ser http(s)'; end if;
    v_orden := coalesce((p_media->>'sort_order')::integer,
                        (select coalesce(max(sort_order), -1) + 1 from public.catalog_media
                          where company_id = p_company and catalog_id = v_item.id));
    insert into public.catalog_media (id, company_id, catalog_id, product_name, url, media_type, sort_order)
    values (v_id, p_company, v_item.id, v_item.name, p_media->>'url',
            case when p_media->>'media_type' = 'video' then 'video' else 'image' end, v_orden)
    on conflict (id) do update
       set url = excluded.url, media_type = excluded.media_type, sort_order = excluded.sort_order,
           product_name = excluded.product_name
     where public.catalog_media.company_id = p_company;
    return jsonb_build_object('id', v_id, 'catalog_id', v_item.id, 'sort_order', v_orden);
end $$;

create or replace function public.cfg_media_principal(p_company text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_catalogo text;
begin
    perform public.v2_autorizar_config(p_company);
    select catalog_id into v_catalogo from public.catalog_media where id = p_id and company_id = p_company;
    if not found then raise exception 'el adjunto % no existe en %', p_id, p_company; end if;
    update public.catalog_media set is_primary = case when id = p_id then 1 else 0 end
     where company_id = p_company and catalog_id = v_catalogo;
    return jsonb_build_object('id', p_id, 'catalog_id', v_catalogo);
end $$;

create or replace function public.cfg_media_borrar(p_company text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_autorizar_config(p_company);
    delete from public.catalog_media where id = p_id and company_id = p_company;
    return jsonb_build_object('id', p_id);
end $$;

-- ── 5 · Equipo ────────────────────────────────────────────────────────────────

create or replace function public.cfg_trabajador_guardar(p_company text, p_emp jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol  text := public.v2_autorizar_config(p_company);
    v_id   text := nullif(btrim(coalesce(p_emp->>'id', '')), '');
    v_prev public.employees;
    v_emp  jsonb := p_emp - 'id' - 'company_id';
    v_sin  text[] := '{}';
    v_nombre text;
    v_error text;
begin
    if v_id is not null then
        select * into v_prev from public.employees where id = v_id;
        if found and v_prev.company_id <> p_company then
            raise exception 'el trabajador % no es de %', v_id, p_company;
        end if;
    end if;
    if v_rol <> 'dueno' and v_emp ? 'comision_pct' then
        v_sin := array['comision_pct'];
        v_emp := v_emp - 'comision_pct';
    end if;
    perform public.v2_comision_valida(v_emp->'comision_pct', 'comision_pct del trabajador');
    -- null = «que herede el del negocio», que en la base es ''.
    if v_emp ? 'schedule' and v_emp->'schedule' = 'null'::jsonb then
        v_emp := v_emp || jsonb_build_object('schedule', '');
    end if;
    if v_emp ? 'schedule' then
        v_error := public.horario_error(v_emp->>'schedule');
        if v_error is not null then raise exception 'horario inválido: %', v_error; end if;
    end if;
    v_nombre := btrim(coalesce(v_emp->>'name', v_prev.name, ''));
    if v_nombre = '' then raise exception 'payload.employee.name requerido'; end if;
    v_emp := v_emp || jsonb_build_object('name', v_nombre);

    if v_prev.id is null then
        v_id := coalesce(v_id, gen_random_uuid()::text);
        insert into public.employees (id, company_id, name) values (v_id, p_company, v_nombre);
    end if;
    perform public.v2_parchear('employees', v_id, v_emp, array['name', 'schedule', 'is_active', 'comision_pct']);
    return jsonb_build_object('id', v_id, 'fusionado', v_prev.id is not null, 'sin_permiso', to_jsonb(v_sin));
end $$;

-- delete_employee: lógico, y suelta la ficha de quien la tuviera enlazada. En un negocio
-- con bot, `memberships` sigue siendo suya: el bot hace lo mismo en local al bajar el
-- trabajador inactivo, así que las dos copias acaban iguales.
create or replace function public.cfg_trabajador_borrar(p_company text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_autorizar_config(p_company);
    update public.employees set is_active = 0 where id = p_id and company_id = p_company;
    update public.memberships set employee_id = null where company_id = p_company and employee_id = p_id;
    return jsonb_build_object('id', p_id);
end $$;

-- upsert_employee_block. Con id es una edición (se sustituye). Devuelve las citas de ese
-- trabajador que caen dentro: bloquear no mueve ni avisa a nadie.
create or replace function public.cfg_bloqueo_guardar(p_company text, p_block jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_id     text := coalesce(nullif(p_block->>'id', ''), gen_random_uuid()::text);
    v_emp    text := p_block->>'employee_id';
    v_inicio text := p_block->>'start';
    v_fin    text := p_block->>'end';
begin
    perform public.v2_autorizar_config(p_company);
    if v_emp is null or v_inicio is null or v_fin is null then
        raise exception 'payload.block.employee_id, start y end requeridos';
    end if;
    if not exists (select 1 from public.employees where id = v_emp and company_id = p_company) then
        raise exception 'el trabajador % no es de %', v_emp, p_company;
    end if;
    if v_inicio !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' or v_fin !~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$' then
        raise exception 'start y end van como ''YYYY-MM-DD HH:MM''';
    end if;
    if v_inicio >= v_fin then raise exception 'el bloqueo acaba (%) antes de empezar (%)', v_fin, v_inicio; end if;

    delete from public.employee_blocks where id = v_id and company_id = p_company;
    insert into public.employee_blocks (id, company_id, employee_id, "start", "end", reason)
    values (v_id, p_company, v_emp, v_inicio, v_fin, coalesce(p_block->>'reason', ''));

    return jsonb_build_object('id', v_id, 'citas_afectadas', coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'slot_start', a.slot_start, 'service', a.service, 'lead_id', a.lead_id))
          from public.appointments a
         where a.company_id = p_company and a.employee_id = v_emp
           and a.status in ('confirmed', 'pending_payment')
           and a.slot_start < v_fin and coalesce(nullif(a.slot_end, ''), a.slot_start) > v_inicio
    ), '[]'::jsonb));
end $$;

create or replace function public.cfg_bloqueo_borrar(p_company text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.v2_autorizar_config(p_company);
    delete from public.employee_blocks where id = p_id and company_id = p_company;
    return jsonb_build_object('id', p_id);
end $$;

-- ── 6 · Ajustes del negocio ───────────────────────────────────────────────────

-- update_company: solo los campos de EDITABLE_COMPANY_FIELDS del bot; los de cobro, solo
-- el dueño. Devuelve { updated, ignored, sin_permiso }: el panel tiene que poder ver que
-- un cambio no se aplicó, en vez de darlo por bueno.
create or replace function public.cfg_empresa_actualizar(p_company text, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol   text := public.v2_autorizar_config(p_company);
    v_patch jsonb := p_patch;
    v_sin   text[] := '{}';
    v_hechos text[];
    v_error text;
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
    v_hechos := public.v2_parchear('companies', p_company, v_patch, array[
        'name', 'bot_name', 'bot_tone', 'hook_question', 'custom_rules', 'return_policy',
        'delivery_type', 'business_mode', 'schedule', 'payment_methods',
        'whatsapp_phone', 'owner_phone', 'admin_phone', 'delivery_fee', 'delivery_days_ahead', 'request_location', 'is_active',
        'slot_minutes', 'express_fee', 'express_cutoff_hour', 'normal_fee', 'normal_cutoff_hour', 'location', 'proactive_venue',
        'qualifying_questions', 'google_calendar_id', 'owner_email', 'reminder_config',
        'appointment_grace_minutes', 'recurring_grace_days', 'business_description',
        'welcome_note', 'closing_note', 'ask_employee', 'employee_question', 'delivery_options', 'require_payment_to_confirm',
        'verify_vouchers', 'asumir_asistencia'
    ]);
    return jsonb_build_object(
        'updated', to_jsonb(v_hechos),
        'ignored', coalesce((select jsonb_agg(k) from jsonb_object_keys(v_patch) k where k <> all(v_hechos)), '[]'::jsonb),
        'sin_permiso', to_jsonb(v_sin));
end $$;

-- ── 7 · Stock (para el bot) ───────────────────────────────────────────────────

-- Atómico: dos ventas a la vez no dejan el stock en negativo ni pierden una resta.
-- Solo la clave de servicio: el bot, al vender o al devolver.
create or replace function public.ajustar_stock(p_company text, p_id text, p_delta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
    v_stock integer;
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    update public.catalog
       set stock = greatest(0, stock + p_delta), updated_at = extract(epoch from now())::bigint
     where id = p_id and company_id = p_company and stock is not null
    returning stock into v_stock;
    return v_stock;   -- null = ese producto no controla stock
end $$;

-- ── 8 · Permisos de ejecución ─────────────────────────────────────────────────

revoke execute on function public.v2_parchear(text, text, jsonb, text[])  from public, anon, authenticated;
revoke execute on function public.v2_autorizar_config(text)              from public, anon, authenticated;
revoke execute on function public.v2_alta_en_nube()                      from public, anon, authenticated;
revoke execute on function public.v2_anotar_borrado()                    from public, anon, authenticated;
revoke execute on function public.ajustar_stock(text, text, integer)     from public, anon, authenticated;
revoke execute on function public.datos_v2_marcar(text, boolean, boolean) from public, anon;
grant  execute on function public.datos_v2_marcar(text, boolean, boolean) to authenticated;

do $$
declare
    f text;
begin
    foreach f in array array[
        'cfg_producto_guardar(text, jsonb)', 'cfg_producto_borrar(text, text)',
        'cfg_media_guardar(text, jsonb)', 'cfg_media_principal(text, text)', 'cfg_media_borrar(text, text)',
        'cfg_trabajador_guardar(text, jsonb)', 'cfg_trabajador_borrar(text, text)',
        'cfg_bloqueo_guardar(text, jsonb)', 'cfg_bloqueo_borrar(text, text)',
        'cfg_empresa_actualizar(text, jsonb)', 'config_en_nube(text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

commit;

-- ── Después de aplicar ────────────────────────────────────────────────────────
-- Negocios SIN bot que ya existían (nacieron en la web antes de este trigger). Se miran a
-- mano y se marcan con datos_v2_marcar(id, true, true): un negocio con bot marcado por
-- error dejaría de poder guardar su catálogo desde el bot... y el panel le escribiría
-- encima de lo que sube el espejo.
--
--   select c.id, c.name from public.companies c
--    where not exists (select 1 from public.instances i where i.company_id = c.id)
--      and not exists (select 1 from public.datos_v2_empresas d where d.company_id = c.id);
