-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · 0008: Mia Gerente — mensajes por aprobar y avisos de stock (21-oct-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Diseño: docs/prompt-bot-mia-gerente-contactar.md (parte 10) y
-- docs/prompt-bot-mia-gerente-consejos.md (parte 4). Resumen: docs/mia-gerente-consolidado.md.
--
-- 1 · `borradores`: un mensaje a un cliente que Mia redactó y que NO sale hasta que el dueño
--     o el administrador lo aprueba. Lo crea el bot (`borrador_srv_crear`, clave de servicio);
--     el panel lo pinta como tarjeta en el chat de ese cliente y lo aprueba o descarta con
--     las RPC de aquí. Aprobar NO envía: apunta `enviar_borrador` en la cola de comandos con
--     el aprobador como autor, y el bot envía lo GUARDADO y devuelve el resultado.
--
--     Por qué la aprobación vive en la base y no en un botón que mande `send_message`: así
--     se sabe quién aprobó, con qué rol, que no se aprueba dos veces, y que el texto corregido
--     no baja del tope de descuento. El empleado no la ve ni la aprueba.
--
-- 2 · `avisos_stock`: «avísame cuando queden 5». Solo existen los que alguien pidió, y cada
--     uno es DE una persona. El aviso al celular lo apunta un trigger de
--     modules/avisos/sql/0003 cuando el stock cruza el mínimo.
--
-- APLICAR: después de la 0041 del bot (rol_en) y de modules/avisos/sql/0001 (pg_cron).
-- Luego modules/avisos/sql/0002 (si no está) y 0003. Prueba: tests/pruebas_0008.sql.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if to_regprocedure('public.rol_en(text)') is null then
        raise exception 'Falta public.rol_en: aplica antes la 0041 del bot (roles).';
    end if;
    if not exists (select 1 from pg_extension where extname = 'pg_cron') then
        raise exception 'Falta pg_cron: aplica antes modules/avisos/sql/0001_avisos_panel.sql.';
    end if;
end $$;

-- ── 1 · Borradores ────────────────────────────────────────────────────────────

create table if not exists public.borradores (
    id               uuid primary key default gen_random_uuid(),
    company_id       text not null references public.companies(id) on delete cascade,
    lead_id          text not null,
    objetivo         text not null check (objetivo in ('ofrecer', 'recuperar', 'avisar', 'cobrar', 'coordinar_entrega')),
    -- Puede llevar {firma}: al aprobar se cambia por el nombre de quien aprueba.
    texto            text not null check (char_length(texto) between 1 and 1500),
    -- {url, type: image|video|document, name}. Uno como mucho; sale con el texto de pie.
    adjunto          jsonb,
    -- {guion, segundos, url?}. Sin url: el guion para que quien aprueba lo grabe.
    audio            jsonb,
    -- {producto, catalog_id?, precio_lista, entrada, escalon, tope, regalo?, vence}. Lo que sabe
    -- Mia de ventas si el cliente contesta. Importes en soles: lo que se REBAJA, no el precio.
    encargo          jsonb,
    pedido_id        text,
    -- null = lo propuso Mia sola; si no, quien se lo pidió.
    creado_por       uuid,
    estado           text not null default 'por_aprobar'
                     check (estado in ('por_aprobar', 'aprobado', 'enviado', 'descartado', 'caducado', 'rechazado')),
    motivo           text not null default '',
    texto_final      text,
    aprobado_por     uuid,
    aprobado_at      timestamptz,
    -- De noche no sale: se programa para las 9 (hora de Lima).
    programado_para  timestamptz,
    comando_at       timestamptz,
    enviado_at       timestamptz,
    descartado_por   uuid,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists ix_borradores_company on public.borradores (company_id, created_at desc);
-- Uno por aprobar por cliente: el nuevo reemplaza al viejo (borrador_srv_crear).
create unique index if not exists ux_borradores_uno_por_lead
    on public.borradores (company_id, lead_id) where estado = 'por_aprobar';

alter table public.borradores enable row level security;
revoke all on public.borradores from anon, authenticated;
grant select on public.borradores to authenticated;

-- Lleva el tope de la negociación: solo dueño y administrador. Se escribe solo por las RPC.
drop policy if exists p_borradores_leer on public.borradores;
create policy p_borradores_leer on public.borradores
    for select to authenticated using ((select public.rol_en(company_id)) in ('dueno', 'admin'));

-- Un adjunto de Cloudinary: el bot lo DESCARGA para reenviarlo, así que el host es exacto.
create or replace function public.v2_adjunto_valido(p jsonb, p_tipos text[])
returns boolean language sql immutable as $$
    select p is not null and jsonb_typeof(p) = 'object'
       and coalesce(p->>'url', '') ~ '^https://res\.cloudinary\.com/'
       and coalesce(p->>'type', '') = any(p_tipos)
$$;

-- Los importes «S/ N» del texto que parecen un PRECIO (más de la mitad del de lista) y
-- quedan por debajo del mínimo. «S/ 10 menos» es la rebaja, no un precio: no cuenta.
-- Devuelve el primero que falla, o null.
create or replace function public.v2_precio_bajo_minimo(p_texto text, p_lista numeric, p_minimo numeric)
returns numeric language sql immutable as $$
    select min(x.v) from (
        select replace(m[1], ',', '.')::numeric as v
          from regexp_matches(coalesce(p_texto, ''), 'S/\.?\s*([0-9]+(?:[.,][0-9]{1,2})?)', 'g') as m
    ) x
     where x.v > p_lista / 2 and x.v < p_minimo
$$;

-- El bot crea el borrador. Solo con la clave de servicio.
create or replace function public.borrador_srv_crear(p_company text, p_lead text, p_datos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
    v_id      uuid;
    v_obj     text := coalesce(p_datos->>'objetivo', '');
    v_texto   text := btrim(coalesce(p_datos->>'texto', ''));
    v_adj     jsonb := nullif(p_datos->'adjunto', 'null'::jsonb);
    v_audio   jsonb := nullif(p_datos->'audio', 'null'::jsonb);
    v_enc     jsonb := nullif(p_datos->'encargo', 'null'::jsonb);
    v_lista   numeric;
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    if not exists (select 1 from public.leads where id = p_lead and company_id = p_company) then
        raise exception 'borrador: ese cliente no es de este negocio';
    end if;
    if v_obj not in ('ofrecer', 'recuperar', 'avisar', 'cobrar', 'coordinar_entrega') then
        raise exception 'borrador: objetivo no válido: %', v_obj;
    end if;
    if v_texto = '' or char_length(v_texto) > 1500 then
        raise exception 'borrador: el texto va de 1 a 1500 caracteres';
    end if;
    if v_adj is not null and not public.v2_adjunto_valido(v_adj, array['image', 'video', 'document']) then
        raise exception 'borrador: adjunto no válido (https://res.cloudinary.com/, image, video o document)';
    end if;
    if v_audio is not null then
        if char_length(coalesce(v_audio->>'guion', '')) not between 1 and 400
           or coalesce((v_audio->>'segundos')::int, 0) not between 1 and 30 then
            raise exception 'borrador: el audio lleva guion (hasta 400 caracteres) y de 1 a 30 segundos';
        end if;
        if v_audio ? 'url' and not public.v2_adjunto_valido(v_audio || '{"type":"audio"}'::jsonb, array['audio']) then
            raise exception 'borrador: la url del audio no es de Cloudinary';
        end if;
    end if;
    if v_enc is not null then
        v_lista := (v_enc->>'precio_lista')::numeric;
        if v_lista is null or v_lista <= 0
           or coalesce((v_enc->>'tope')::numeric, -1) < 0 or (v_enc->>'tope')::numeric >= v_lista
           or coalesce((v_enc->>'entrada')::numeric, -1) < 0
           or (v_enc->>'entrada')::numeric > coalesce((v_enc->>'escalon')::numeric, (v_enc->>'tope')::numeric)
           or coalesce((v_enc->>'escalon')::numeric, 0) > (v_enc->>'tope')::numeric
           or (v_enc->>'vence') is null then
            raise exception 'borrador: encargo no válido (0 <= entrada <= escalon <= tope < precio_lista, y vence)';
        end if;
    end if;

    update public.borradores set estado = 'descartado', motivo = 'Lo reemplazó uno nuevo.', updated_at = now()
     where company_id = p_company and lead_id = p_lead and estado = 'por_aprobar';

    insert into public.borradores (company_id, lead_id, objetivo, texto, adjunto, audio, encargo, pedido_id, creado_por)
    values (p_company, p_lead, v_obj, v_texto, v_adj, v_audio, v_enc,
            nullif(p_datos->>'pedido_id', ''), nullif(p_datos->>'creado_por', '')::uuid)
    returning id into v_id;
    return v_id;
end $$;

-- Apunta el envío en la cola, con el aprobador como autor (el bot comprueba su rol).
create or replace function public.v2_borrador_a_la_cola(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.borradores;
begin
    select * into b from public.borradores where id = p_id;
    insert into public.commands (company_id, type, payload, created_by)
    values (b.company_id, 'enviar_borrador', jsonb_build_object('borrador_id', b.id), b.aprobado_por);
    update public.borradores set comando_at = now(), updated_at = now() where id = p_id;
end $$;

-- Aprobar desde el panel. `p_texto`: el texto corregido, o null para el de Mia.
create or replace function public.borrador_aprobar(p_id uuid, p_texto text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    b        public.borradores;
    v_texto  text;
    v_nombre text;
    v_lista  numeric;
    v_min    numeric;
    v_malo   numeric;
    v_lima   timestamp := now() at time zone 'America/Lima';
    v_prog   timestamptz;
begin
    select * into b from public.borradores where id = p_id for update;
    if not found then raise exception 'Ese mensaje ya no existe.'; end if;
    if coalesce(public.rol_en(b.company_id), '') not in ('dueno', 'admin') then
        raise exception 'Este mensaje lo aprueba el dueño o el administrador.' using errcode = '42501';
    end if;
    if b.estado <> 'por_aprobar' then
        raise exception '%', case b.estado
            when 'aprobado'   then 'Este mensaje ya está aprobado.'
            when 'enviado'    then 'Este mensaje ya se envió.'
            when 'descartado' then 'Este mensaje se descartó.'
            else 'Este mensaje ya no se puede aprobar.' end;
    end if;
    if b.created_at < now() - interval '24 hours' then
        raise exception 'Este mensaje tiene más de un día y los datos pueden haber cambiado. Pídele a Mia uno nuevo.';
    end if;

    v_texto := coalesce(nullif(btrim(p_texto), ''), b.texto);
    if char_length(v_texto) > 1500 then raise exception 'El mensaje es demasiado largo (más de 1500 caracteres).'; end if;

    if position('{firma}' in v_texto) > 0 then
        select nullif(btrim(split_part(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''), ' ', 1)), '')
          into v_nombre from auth.users u where u.id = auth.uid();
        if v_nombre is null then
            raise exception 'Pon tu nombre donde dice «tu nombre» antes de aprobarlo.';
        end if;
        v_texto := replace(v_texto, '{firma}', v_nombre);
    end if;

    if b.encargo is not null then
        v_lista := (b.encargo->>'precio_lista')::numeric;
        v_min   := v_lista - (b.encargo->>'tope')::numeric;
        v_malo  := public.v2_precio_bajo_minimo(v_texto, v_lista, v_min);
        if v_malo is not null then
            raise exception 'En el mensaje pusiste S/ % y lo mínimo para esta oferta es S/ %.',
                trim(to_char(v_malo, 'FM999999990.##'), '.'), trim(to_char(v_min, 'FM999999990.##'), '.');
        end if;
    end if;

    -- De 21:00 a 08:00 (Lima) no sale: a las 9.
    if extract(hour from v_lima) >= 21 then
        v_prog := (v_lima::date + 1 + time '09:00') at time zone 'America/Lima';
    elsif extract(hour from v_lima) < 8 then
        v_prog := (v_lima::date + time '09:00') at time zone 'America/Lima';
    end if;

    update public.borradores
       set estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(),
           texto_final = v_texto, programado_para = v_prog, updated_at = now()
     where id = p_id;
    if v_prog is null then perform public.v2_borrador_a_la_cola(p_id); end if;

    return jsonb_build_object('estado', 'aprobado', 'programado_para', v_prog);
end $$;

create or replace function public.borrador_descartar(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b public.borradores;
begin
    select * into b from public.borradores where id = p_id for update;
    if not found then return; end if;
    if coalesce(public.rol_en(b.company_id), '') not in ('dueno', 'admin') then
        raise exception 'Este mensaje lo descarta el dueño o el administrador.' using errcode = '42501';
    end if;
    if b.estado not in ('por_aprobar', 'rechazado', 'caducado') then
        raise exception 'Este mensaje ya está aprobado: no se puede descartar.';
    end if;
    update public.borradores set estado = 'descartado', descartado_por = auth.uid(), updated_at = now() where id = p_id;
end $$;

-- El bot cuenta cómo fue el envío.
create or replace function public.borrador_srv_resultado(p_id uuid, p_enviado boolean, p_motivo text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    update public.borradores
       set estado = case when p_enviado then 'enviado' else 'rechazado' end,
           enviado_at = case when p_enviado then now() end,
           motivo = case when p_enviado then '' else left(coalesce(p_motivo, ''), 300) end,
           updated_at = now()
     where id = p_id and estado = 'aprobado';
end $$;

-- El reloj, cada minuto: lo programado sale; lo viejo caduca; lo que el bot no mandó se dice.
create or replace function public.borradores_reloj()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
    for r in select id from public.borradores
              where estado = 'aprobado' and comando_at is null and programado_para <= now()
              for update skip locked loop
        perform public.v2_borrador_a_la_cola(r.id);
    end loop;
    update public.borradores set estado = 'caducado', updated_at = now()
     where estado = 'por_aprobar' and created_at < now() - interval '24 hours';
    update public.borradores
       set estado = 'rechazado', motivo = 'Mia no lo pudo enviar: puede que su WhatsApp estuviera apagado. Vuelve a pedírselo.',
           updated_at = now()
     where estado = 'aprobado' and comando_at < now() - interval '30 minutes';
    delete from public.borradores where created_at < now() - interval '30 days';
end $$;

-- ── 2 · Avisos de stock ───────────────────────────────────────────────────────

create table if not exists public.avisos_stock (
    id            uuid primary key default gen_random_uuid(),
    company_id    text not null references public.companies(id) on delete cascade,
    auth_user_id  uuid not null,
    catalog_id    text not null,
    -- null = el producto entero; si no, una talla/color de catalog_variantes.
    variante_id   text,
    minimo        integer not null check (minimo between 0 and 100000),
    activo        boolean not null default true,
    -- Ya avisó en esta vuelta. Se rearma (vuelta + 1) cuando reponen por encima del mínimo.
    avisado       boolean not null default false,
    vuelta        integer not null default 0,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);
create unique index if not exists ux_avisos_stock_uno
    on public.avisos_stock (company_id, auth_user_id, catalog_id, coalesce(variante_id, ''));
create index if not exists ix_avisos_stock_item on public.avisos_stock (company_id, catalog_id) where activo;

alter table public.avisos_stock enable row level security;
revoke all on public.avisos_stock from anon, authenticated;
grant select on public.avisos_stock to authenticated;
drop policy if exists p_avisos_stock_mios on public.avisos_stock;
create policy p_avisos_stock_mios on public.avisos_stock
    for select to authenticated
    using (auth_user_id = (select auth.uid()) and (select public.rol_en(company_id)) in ('dueno', 'admin'));

-- Poner o cambiar un aviso. Lo usan las dos de abajo: la del panel y la del bot.
create or replace function public.v2_aviso_stock_poner(p_company text, p_user uuid, p_catalog text, p_variante text, p_minimo integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_nombre   text;
    v_etiqueta text;
    v_stock    integer;
    v_id       uuid;
begin
    if p_minimo is null or p_minimo < 0 or p_minimo > 100000 then
        raise exception 'El mínimo tiene que ser un número de 0 en adelante.';
    end if;
    select name, stock into v_nombre, v_stock from public.catalog where id = p_catalog and company_id = p_company;
    if v_nombre is null then raise exception 'Ese producto no está en tu catálogo.'; end if;
    if nullif(p_variante, '') is not null then
        select etiqueta, stock into v_etiqueta, v_stock
          from public.catalog_variantes where id = p_variante and company_id = p_company and catalog_id = p_catalog;
        if v_etiqueta is null then raise exception 'Esa opción no es de ese producto.'; end if;
    elsif v_stock is null then
        raise exception 'De ese producto no llevas control de stock: no hay cuándo avisar.';
    end if;
    if (select count(*) from public.avisos_stock
         where company_id = p_company and auth_user_id = p_user and activo) >= 50 then
        raise exception 'Ya tienes 50 avisos puestos: quita alguno antes de poner otro.';
    end if;

    insert into public.avisos_stock (company_id, auth_user_id, catalog_id, variante_id, minimo, avisado)
    values (p_company, p_user, p_catalog, nullif(p_variante, ''), p_minimo, v_stock <= p_minimo)
    on conflict (company_id, auth_user_id, catalog_id, coalesce(variante_id, ''))
    do update set minimo = excluded.minimo, activo = true, avisado = excluded.avisado, updated_at = now()
    returning id into v_id;

    -- Si ya está por debajo no avisa ahora (ya lo sabe por Mia): avisará en la próxima vuelta.
    return jsonb_build_object('id', v_id, 'producto', v_nombre, 'opcion', v_etiqueta, 'minimo', p_minimo,
                              'stock', v_stock, 'ya_por_debajo', v_stock <= p_minimo);
end $$;

create or replace function public.v2_aviso_stock_quitar(p_company text, p_user uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    delete from public.avisos_stock where id = p_id and company_id = p_company and auth_user_id = p_user;
    return found;
end $$;

create or replace function public.v2_avisos_stock_de(p_company text, p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
    select coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id, 'producto', c.name, 'opcion', v.etiqueta, 'minimo', a.minimo,
               'stock', coalesce(v.stock, c.stock)) order by c.name, v.etiqueta), '[]'::jsonb)
      from public.avisos_stock a
      join public.catalog c on c.id = a.catalog_id and c.company_id = a.company_id
      left join public.catalog_variantes v on v.id = a.variante_id and v.company_id = a.company_id
     where a.company_id = p_company and a.auth_user_id = p_user and a.activo
$$;

-- Desde el panel: siempre para quien llama.
create or replace function public.aviso_stock_poner(p_company text, p_catalog text, p_variante text, p_minimo integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'Los avisos de stock son del dueño y del administrador.' using errcode = '42501';
    end if;
    return public.v2_aviso_stock_poner(p_company, auth.uid(), p_catalog, p_variante, p_minimo);
end $$;

create or replace function public.aviso_stock_quitar(p_company text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    return public.v2_aviso_stock_quitar(p_company, auth.uid(), p_id);
end $$;

-- Desde el bot (Mia Gerente), en nombre de quien preguntó (`commands.created_by`). Revalida
-- el rol aquí también: una herramienta del bot no basta para dar un aviso a un empleado.
create or replace function public.aviso_stock_srv_poner(p_company text, p_user uuid, p_catalog text, p_variante text, p_minimo integer)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    if not exists (select 1 from public.memberships
                    where company_id = p_company and auth_user_id = p_user::text and role in ('owner', 'admin')) then
        raise exception 'Los avisos de stock son del dueño y del administrador.' using errcode = '42501';
    end if;
    return public.v2_aviso_stock_poner(p_company, p_user, p_catalog, p_variante, p_minimo);
end $$;

create or replace function public.aviso_stock_srv_quitar(p_company text, p_user uuid, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    return public.v2_aviso_stock_quitar(p_company, p_user, p_id);
end $$;

create or replace function public.avisos_stock_srv_de(p_company text, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if (select auth.role()) <> 'service_role' then raise exception 'solo el bot' using errcode = '42501'; end if;
    return public.v2_avisos_stock_de(p_company, p_user);
end $$;

-- ── 3 · Permisos y reloj ──────────────────────────────────────────────────────

revoke execute on function public.v2_adjunto_valido(jsonb, text[])                       from public, anon, authenticated;
revoke execute on function public.v2_precio_bajo_minimo(text, numeric, numeric)          from public, anon, authenticated;
revoke execute on function public.borrador_srv_crear(text, text, jsonb)                  from public, anon, authenticated;
revoke execute on function public.v2_borrador_a_la_cola(uuid)                            from public, anon, authenticated;
revoke execute on function public.borrador_srv_resultado(uuid, boolean, text)            from public, anon, authenticated;
revoke execute on function public.borradores_reloj()                                     from public, anon, authenticated;
revoke execute on function public.v2_aviso_stock_poner(text, uuid, text, text, integer)  from public, anon, authenticated;
revoke execute on function public.v2_aviso_stock_quitar(text, uuid, uuid)                from public, anon, authenticated;
revoke execute on function public.v2_avisos_stock_de(text, uuid)                         from public, anon, authenticated;
revoke execute on function public.aviso_stock_srv_poner(text, uuid, text, text, integer) from public, anon, authenticated;
revoke execute on function public.aviso_stock_srv_quitar(text, uuid, uuid)               from public, anon, authenticated;
revoke execute on function public.avisos_stock_srv_de(text, uuid)                        from public, anon, authenticated;
revoke execute on function public.borrador_aprobar(uuid, text)                           from public, anon;
revoke execute on function public.borrador_descartar(uuid)                               from public, anon;
revoke execute on function public.aviso_stock_poner(text, text, text, integer)           from public, anon;
revoke execute on function public.aviso_stock_quitar(text, uuid)                         from public, anon;
grant  execute on function public.borrador_aprobar(uuid, text)                 to authenticated;
grant  execute on function public.borrador_descartar(uuid)                     to authenticated;
grant  execute on function public.aviso_stock_poner(text, text, text, integer) to authenticated;
grant  execute on function public.aviso_stock_quitar(text, uuid)               to authenticated;
grant  execute on function public.borrador_srv_crear(text, text, jsonb)                  to service_role;
grant  execute on function public.borrador_srv_resultado(uuid, boolean, text)            to service_role;
grant  execute on function public.aviso_stock_srv_poner(text, uuid, text, text, integer) to service_role;
grant  execute on function public.aviso_stock_srv_quitar(text, uuid, uuid)               to service_role;
grant  execute on function public.avisos_stock_srv_de(text, uuid)                        to service_role;
grant  select, update on public.borradores to service_role;
grant  select on public.avisos_stock to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'vendemia-borradores';
select cron.schedule('vendemia-borradores', '* * * * *', $$select public.borradores_reloj()$$);

commit;
