-- ═══════════════════════════════════════════════════════════════════════════════
-- TU PÁGINA · 0001: la página del negocio y los envíos
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Ver docs/PLAN-TU-PAGINA.md. Tablas que NACEN en la nube (arquitectura v2): no pasan por el
-- bot y funcionan igual en un negocio sin bot.
--
--   tu_pagina  una por negocio: dirección (slug), WhatsApp, secciones, aspecto.
--   envios        lo que un cliente pide enviar, para rotular e imprimir.
--
-- Lectura y alta públicas: solo por las tu_pagina_srv / envio_srv_crear, con la clave del servidor (la misma
-- infraestructura que Fideliza: loyalty_srv_check y loyalty_srv_rate_hit). Nunca anon
-- directo a las tablas.
--
-- Quién ve los envíos en el panel: dueño y administrador (`clientes.ver`), porque llevan
-- nombres, teléfonos y direcciones. Mismo criterio que los clientes del bot.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── La página ─────────────────────────────────────────────────────────────────

create table if not exists public.tu_pagina (
    company_id  text primary key references public.companies(id) on delete cascade,
    slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
    titulo      text not null default '' check (char_length(titulo) <= 60),
    frase       text not null default '' check (char_length(frase) <= 120),
    -- Solo dígitos, con el 51 delante (lo arma el panel). Es a donde se manda TODO.
    whatsapp    text not null default '' check (whatsapp ~ '^(\d{8,15})?$'),
    secciones   jsonb not null default '{"catalogo": true, "reservar": false, "envios": false}'::jsonb,
    plantilla   text not null default 'vitrina'
                check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios')),
    color       text not null default '#FF4900' check (color ~ '^#[0-9A-Fa-f]{6}$'),
    logo_url    text check (logo_url is null or logo_url ~ '^https://[^\s]+$'),
    portada_url text check (portada_url is null or portada_url ~ '^https://[^\s]+$'),
    -- Distritos que el negocio atiende en envíos. Vacío = escribe el cliente.
    distritos   text[] not null default '{}',
    publicada   boolean not null default false,
    version     integer not null default 0,
    creada_at   timestamptz not null default now(),
    cambiada_at timestamptz not null default now()
);

-- Direcciones que no se le pueden dar a un negocio: son o serán rutas nuestras, o se
-- confunden con nosotros.
create or replace function public.tu_pagina_slug_reservado(p text)
returns boolean language sql immutable as $$
    select p = any(array['panel', 'api', 'admin', 'login', 'acceso', 'ayuda', 'soporte', 'pide', 'tienda', 'agenda', 'tu-pagina', 'vendemia',
                         'vendemias', 'mia', 'fideliza', 'www', 'app', 'static', 'assets', 'cuenta', 'precios',
                         'legal', 'privacidad', 'terminos', 'blog', 'guias', 'nuevo', 'demo', 'test']);
$$;

-- ── Los envíos ────────────────────────────────────────────────────────────────

create table if not exists public.envios (
    id                    uuid primary key default gen_random_uuid(),
    company_id            text not null references public.companies(id) on delete cascade,
    -- E-XXXX: lo que se dicta por teléfono y va en la etiqueta. Único por negocio.
    codigo                text not null,
    remitente_nombre      text not null check (char_length(remitente_nombre) between 2 and 80),
    remitente_telefono    text not null check (remitente_telefono ~ '^\d{8,15}$'),
    destinatario_nombre   text not null check (char_length(destinatario_nombre) between 2 and 80),
    destinatario_telefono text not null check (destinatario_telefono ~ '^\d{8,15}$'),
    direccion             text not null check (char_length(direccion) between 5 and 200),
    distrito              text not null check (char_length(distrito) between 2 and 60),
    referencia            text not null default '' check (char_length(referencia) <= 200),
    contenido             text not null default '' check (char_length(contenido) <= 200),
    bultos                integer not null default 1 check (bultos between 1 and 50),
    peso_kg               numeric(6,2) check (peso_kg is null or peso_kg > 0),
    -- null = no se cobra nada al entregar.
    contra_entrega        numeric(10,2) check (contra_entrega is null or contra_entrega > 0),
    recojo_fecha          date not null,
    recojo_franja         text not null check (recojo_franja in ('manana', 'tarde')),
    estado                text not null default 'por_recoger'
                          check (estado in ('por_recoger', 'impreso', 'recogido', 'entregado', 'cancelado')),
    origen                text not null default 'web' check (origen in ('web', 'panel')),
    -- Un doble toque en «Enviar» no crea dos envíos.
    idem                  text not null check (char_length(idem) between 8 and 64),
    impreso_at            timestamptz,
    creado_at             timestamptz not null default now(),
    cambiado_at           timestamptz not null default now(),
    unique (company_id, codigo),
    unique (company_id, idem)
);
create index if not exists idx_envios_lista on public.envios(company_id, estado, creado_at desc);

-- Sin 0/O ni 1/I: se dicta por teléfono.
create or replace function public.envio_codigo(p_prefijo text)
returns text language sql volatile as $$
    select p_prefijo || '-' || string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 4);
$$;

-- ── RLS y grants ──────────────────────────────────────────────────────────────

alter table public.tu_pagina enable row level security;
alter table public.envios       enable row level security;

revoke all on public.tu_pagina, public.envios from anon, authenticated;
grant select on public.tu_pagina, public.envios to authenticated;

drop policy if exists tu_pagina_leer on public.tu_pagina;
create policy tu_pagina_leer on public.tu_pagina
    for select to authenticated using ((select public.is_member(company_id)));

drop policy if exists envios_leer on public.envios;
create policy envios_leer on public.envios
    for select to authenticated using ((select public.puede(company_id, 'clientes.ver')));

-- ── Escrituras del panel ──────────────────────────────────────────────────────

create or replace function public.tu_pagina_autorizar(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol not in ('admin', 'dueno') then
        raise exception 'Eso lo hace el dueño o el administrador del negocio.' using errcode = '42501';
    end if;
    return v_rol;
end $$;

-- Guarda la página (PATCH: lo que no viene se conserva) y, si `publicar`, sube la versión.
create or replace function public.tu_pagina_guardar(p_company text, p_datos jsonb, p_publicar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_slug text;
    v_fila public.tu_pagina;
begin
    perform public.tu_pagina_autorizar(p_company);
    v_slug := lower(btrim(coalesce(p_datos->>'slug', '')));

    select * into v_fila from public.tu_pagina where company_id = p_company;
    if not found then
        if v_slug = '' then v_slug := p_company; end if;
        insert into public.tu_pagina (company_id, slug) values (p_company, 'zz-tmp-' || substr(md5(p_company), 1, 12))
        returning * into v_fila;
    end if;

    if v_slug <> '' and v_slug <> v_fila.slug then
        if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
            raise exception 'tu_pagina:slug_invalido' using hint = '3 a 40 letras minúsculas, números o guiones';
        end if;
        if public.tu_pagina_slug_reservado(v_slug) then raise exception 'tu_pagina:slug_reservado'; end if;
        if exists (select 1 from public.tu_pagina where slug = v_slug and company_id <> p_company) then
            raise exception 'tu_pagina:slug_ocupado';
        end if;
        update public.tu_pagina set slug = v_slug where company_id = p_company;
    end if;

    update public.tu_pagina p set
        titulo      = coalesce(p_datos->>'titulo', p.titulo),
        frase       = coalesce(p_datos->>'frase', p.frase),
        whatsapp    = coalesce(regexp_replace(p_datos->>'whatsapp', '\D', '', 'g'), p.whatsapp),
        secciones   = case when p_datos ? 'secciones' then p.secciones || (p_datos->'secciones') else p.secciones end,
        plantilla   = coalesce(p_datos->>'plantilla', p.plantilla),
        color       = coalesce(p_datos->>'color', p.color),
        logo_url    = case when p_datos ? 'logo_url' then nullif(p_datos->>'logo_url', '') else p.logo_url end,
        portada_url = case when p_datos ? 'portada_url' then nullif(p_datos->>'portada_url', '') else p.portada_url end,
        distritos   = case when p_datos ? 'distritos'
                           then array(select btrim(d) from jsonb_array_elements_text(p_datos->'distritos') d where btrim(d) <> '')
                           else p.distritos end,
        publicada   = p.publicada or p_publicar,
        version     = p.version + case when p_publicar then 1 else 0 end,
        cambiada_at = now()
     where p.company_id = p_company
    returning * into v_fila;

    if v_fila.publicada and v_fila.whatsapp = '' then
        raise exception 'tu_pagina:falta_whatsapp' using hint = 'Sin WhatsApp no hay a dónde mandar los pedidos';
    end if;
    return to_jsonb(v_fila);
end $$;

-- ¿Está libre esa dirección? Para el editor, mientras se escribe.
create or replace function public.tu_pagina_slug_libre(p_company text, p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
    select p_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
       and not public.tu_pagina_slug_reservado(p_slug)
       and not exists (select 1 from public.tu_pagina where slug = p_slug and company_id <> p_company);
$$;

-- Marcar varios envíos de golpe (imprimir, recogidos, entregados, cancelar).
create or replace function public.envios_estado(p_company text, p_ids uuid[], p_estado text)
returns integer language plpgsql security definer set search_path = public as $$
declare
    n integer;
begin
    perform public.tu_pagina_autorizar(p_company);
    if p_estado not in ('por_recoger', 'impreso', 'recogido', 'entregado', 'cancelado') then
        raise exception 'tu_pagina:estado_invalido';
    end if;
    update public.envios
       set estado = p_estado, cambiado_at = now(),
           impreso_at = case when p_estado = 'impreso' then coalesce(impreso_at, now()) else impreso_at end
     where company_id = p_company and id = any(p_ids);
    get diagnostics n = row_count;
    return n;
end $$;

-- ── Lo público (clave del servidor) ───────────────────────────────────────────

-- La página publicada de un negocio, con SOLO lo que se enseña al público.
create or replace function public.tu_pagina_srv(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v public.tu_pagina;
    v_nombre text;
begin
    perform public.loyalty_srv_check();
    select * into v from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    select name into v_nombre from public.companies where id = v.company_id;
    return jsonb_build_object(
        'status', 'ok', 'slug', v.slug, 'version', v.version,
        'titulo', coalesce(nullif(v.titulo, ''), v_nombre), 'frase', v.frase,
        'whatsapp', v.whatsapp, 'secciones', v.secciones, 'plantilla', v.plantilla, 'color', v.color,
        'logo_url', v.logo_url, 'portada_url', v.portada_url, 'distritos', to_jsonb(v.distritos));
end $$;

-- El alta de un envío desde la página. Valida, limita y devuelve el código. Mismo idem
-- = mismo envío (el segundo toque recibe el código del primero).
create or replace function public.envio_srv_crear(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag   public.tu_pagina;
    v_fila  public.envios;
    v_tel   text;
    v_dest  text;
    v_fecha date;
    i integer := 0;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'envios')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_fila from public.envios where company_id = v_pag.company_id and idem = p_idem;
    if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'repetido', true); end if;

    v_tel  := regexp_replace(coalesce(p_datos->>'remitente_telefono', ''), '\D', '', 'g');
    v_dest := regexp_replace(coalesce(p_datos->>'destinatario_telefono', ''), '\D', '', 'g');
    if char_length(v_tel) = 9 and v_tel like '9%' then v_tel := '51' || v_tel; end if;
    if char_length(v_dest) = 9 and v_dest like '9%' then v_dest := '51' || v_dest; end if;

    -- Un mismo teléfono no llena la lista de un negocio: 20 envíos abiertos como mucho.
    if (select count(*) from public.envios
         where company_id = v_pag.company_id and remitente_telefono = v_tel and estado = 'por_recoger') >= 20 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    v_fecha := (p_datos->>'recojo_fecha')::date;
    if v_fecha < (now() at time zone 'America/Lima')::date or v_fecha > (now() at time zone 'America/Lima')::date + 60 then
        return jsonb_build_object('status', 'fecha_invalida');
    end if;
    if cardinality(v_pag.distritos) > 0 and not (p_datos->>'distrito' = any(v_pag.distritos)) then
        return jsonb_build_object('status', 'distrito_invalido');
    end if;

    loop
        begin
            insert into public.envios (
                company_id, codigo, remitente_nombre, remitente_telefono, destinatario_nombre, destinatario_telefono,
                direccion, distrito, referencia, contenido, bultos, peso_kg, contra_entrega,
                recojo_fecha, recojo_franja, origen, idem)
            values (
                v_pag.company_id, public.envio_codigo('E'),
                btrim(p_datos->>'remitente_nombre'), v_tel, btrim(p_datos->>'destinatario_nombre'), v_dest,
                btrim(p_datos->>'direccion'), btrim(p_datos->>'distrito'), btrim(coalesce(p_datos->>'referencia', '')),
                btrim(coalesce(p_datos->>'contenido', '')), coalesce((p_datos->>'bultos')::integer, 1),
                nullif(p_datos->>'peso_kg', '')::numeric, nullif(p_datos->>'contra_entrega', '')::numeric,
                v_fecha, p_datos->>'recojo_franja', 'web', p_idem)
            returning * into v_fila;
            exit;
        exception when unique_violation then
            -- Mismo idem por una carrera: devolver ese. Mismo código: otro intento.
            select * into v_fila from public.envios where company_id = v_pag.company_id and idem = p_idem;
            if found then return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'repetido', true); end if;
            i := i + 1;
            if i > 5 then raise; end if;
        end;
    end loop;
    return jsonb_build_object('status', 'ok', 'codigo', v_fila.codigo, 'repetido', false);
exception when check_violation or invalid_text_representation or not_null_violation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- ── Permisos de ejecución ─────────────────────────────────────────────────────

revoke execute on function public.tu_pagina_autorizar(text) from public, anon, authenticated;
revoke execute on function public.tu_pagina_guardar(text, jsonb, boolean) from public, anon;
revoke execute on function public.tu_pagina_slug_libre(text, text) from public, anon;
revoke execute on function public.envios_estado(text, uuid[], text) from public, anon;
grant  execute on function public.tu_pagina_guardar(text, jsonb, boolean) to authenticated;
grant  execute on function public.tu_pagina_slug_libre(text, text) to authenticated;
grant  execute on function public.envios_estado(text, uuid[], text) to authenticated;
-- Las srv_ las llama el servidor con la clave anon + x-fideliza-key; loyalty_srv_check filtra.
revoke execute on function public.tu_pagina_srv(text) from public;
revoke execute on function public.envio_srv_crear(text, jsonb, text) from public;
grant  execute on function public.tu_pagina_srv(text) to anon;
grant  execute on function public.envio_srv_crear(text, jsonb, text) to anon;

commit;
