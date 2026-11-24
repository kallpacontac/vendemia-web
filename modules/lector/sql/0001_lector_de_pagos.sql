-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA LECTOR · 0001 · Los pagos que lee Vendemia Caja, en el panel
--
-- Vendemia Caja (app Android aparte, vendemia-root/vendemia-caja) lee el aviso de Yape, Plin o del
-- banco en el celular del negocio. Esto es lo que lo une al panel:
--
--   1. Vincular: el dueño o el administrador pide un CÓDIGO en el panel (Configuración › Cobros), lo escribe
--      en la app (o escanea el QR) y la web le da al celular su clave propia. El código vale 15 min
--      y una sola vez; la clave no sale nunca en un QR.
--   2. Recibir: cada aviso llega firmado (HMAC con esa clave) a /api/caja/aviso, que lo guarda aquí
--      una sola vez (dispositivo + huella) y apunta un aviso push de tipo 'pago', clase 'lector':
--      lo reciben el dueño y el administrador (avisos 0002), con su silencio y sus preferencias.
--   3. Ver: «Celular de cobros» en Configuración › Cobros, con el estado del celular (último contacto).
--
-- Lo que NO hace todavía: marcar solo una reserva o un pedido como pagado. Un aviso dice «llegó
-- S/ 30 de ALVARO F…», no a qué cita corresponde; casarlo es la fase siguiente.
--
-- Datos personales (Ley 29733): el nombre de quien paga. Se guarda lo que muestra el aviso, solo lo
-- ven dueño y administrador, y se borra a los 90 días (lector_limpiar, cada noche).
--
-- APLICAR en el SQL editor de Supabase, entero. Requiere: companies, rol_en (bot), avisos 0001
-- (avisos_apuntar) y fideliza 0002 (loyalty_srv_check). Probar: modules/lector/sql/tests/.
-- Deshacer: 0001_lector_de_pagos_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · Celulares vinculados ────────────────────────────────────────────────
-- El id es el que genera la app (uuid); si el mismo celular se vincula otra vez, se reemplaza.
create table if not exists public.lector_dispositivos (
    id             uuid primary key,
    company_id     text not null references public.companies(id) on delete cascade,
    -- Para firmar: la web la necesita en claro para comprobar el HMAC. Nadie la lee por la API.
    clave          text not null check (char_length(clave) between 32 and 128),
    modelo         text not null default '' check (char_length(modelo) <= 80),
    version        text not null default '' check (char_length(version) <= 20),
    vinculado_por  uuid,
    vinculado_at   timestamptz not null default now(),
    ultimo_latido  timestamptz,
    ultimo_aviso   timestamptz,
    por_enviar     int not null default 0,
    sin_leer       int not null default 0,
    revocado_at    timestamptz
);
create index if not exists ix_lector_disp_company on public.lector_dispositivos (company_id) where revocado_at is null;

-- ── 2 · Códigos para vincular ───────────────────────────────────────────────
create table if not exists public.lector_codigos (
    codigo       text primary key check (codigo ~ '^[A-Z2-9]{6}$'),
    company_id   text not null references public.companies(id) on delete cascade,
    creado_por   uuid,
    expira       timestamptz not null default now() + interval '15 minutes',
    usado_at     timestamptz
);

-- ── 3 · Los avisos leídos ───────────────────────────────────────────────────
create table if not exists public.lector_avisos (
    id             bigserial primary key,
    company_id     text not null references public.companies(id) on delete cascade,
    dispositivo_id uuid not null references public.lector_dispositivos(id) on delete cascade,
    huella         text not null check (char_length(huella) between 8 and 128),
    -- null = el aviso llegó pero no se pudo leer el monto («sin leer»).
    centimos       bigint check (centimos is null or centimos between 1 and 10000000000),
    nombre         text not null default '' check (char_length(nombre) <= 120),
    codigo         text check (codigo is null or codigo ~ '^\d{3}$'),
    origen         text not null default 'Yape' check (char_length(origen) <= 60),
    generico       boolean not null default false,
    recuperado     boolean not null default false,
    cuando         timestamptz not null,
    recibido_at    timestamptz not null default now(),
    unique (dispositivo_id, huella)
);
create index if not exists ix_lector_avisos_company on public.lector_avisos (company_id, cuando desc);

-- Ninguna de las tres se lee desde la API: solo por las funciones de abajo.
alter table public.lector_dispositivos enable row level security;
alter table public.lector_codigos enable row level security;
alter table public.lector_avisos enable row level security;
revoke all on public.lector_dispositivos, public.lector_codigos, public.lector_avisos from anon, authenticated;

-- El permiso: dueño o administrador. El empleado no ve el dinero que entra (corte de roles).
create or replace function public.lector_puede(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select coalesce(public.rol_en(p_company), '') in ('dueno', 'admin');
$$;
revoke execute on function public.lector_puede(text) from public, anon;

-- ── 4 · Panel: pedir un código ──────────────────────────────────────────────
create or replace function public.lector_codigo_nuevo(p_company text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    -- Sin 0/O ni 1/I/L: se dicta por teléfono sin confusiones.
    v_letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    v_codigo text;
    v_expira timestamptz;
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador conectan el celular de la caja.' using errcode = '42501';
    end if;
    -- Los de este negocio que no se usaron dejan de valer: hay uno vivo a la vez.
    delete from public.lector_codigos where company_id = p_company and usado_at is null;
    delete from public.lector_codigos where expira < now() - interval '1 day';
    loop
        v_codigo := '';
        for i in 1..6 loop
            v_codigo := v_codigo || substr(v_letras, 1 + floor(random() * length(v_letras))::int, 1);
        end loop;
        begin
            insert into public.lector_codigos (codigo, company_id, creado_por)
            values (v_codigo, p_company, (select auth.uid()))
            returning expira into v_expira;
            exit;
        exception when unique_violation then
            -- Rarísimo: otro negocio tiene ese código ahora mismo. Se prueba otro.
        end;
    end loop;
    return jsonb_build_object('codigo', v_codigo, 'expira', v_expira);
end $$;
revoke execute on function public.lector_codigo_nuevo(text) from public, anon;
grant execute on function public.lector_codigo_nuevo(text) to authenticated;

-- ── 5 · Panel: estado y lo que llegó ────────────────────────────────────────
create or replace function public.lector_estado(p_company text, p_desde timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    -- Por defecto, desde la medianoche de Lima.
    v_desde timestamptz := coalesce(p_desde, date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima');
begin
    if not public.lector_puede(p_company) then
        raise exception 'No tienes acceso a los pagos de este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object(
        'dispositivos', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', d.id, 'modelo', d.modelo, 'version', d.version, 'vinculado_at', d.vinculado_at,
                'ultimo_latido', d.ultimo_latido, 'ultimo_aviso', d.ultimo_aviso,
                'por_enviar', d.por_enviar, 'sin_leer', d.sin_leer
            ) order by d.vinculado_at)
              from public.lector_dispositivos d
             where d.company_id = p_company and d.revocado_at is null), '[]'::jsonb),
        'avisos', coalesce((
            select jsonb_agg(x order by x->>'cuando' desc) from (
                select jsonb_build_object(
                    'id', a.id, 'centimos', a.centimos, 'nombre', a.nombre, 'codigo', a.codigo,
                    'origen', a.origen, 'generico', a.generico, 'recuperado', a.recuperado, 'cuando', a.cuando
                ) as x
                  from public.lector_avisos a
                 where a.company_id = p_company and a.cuando >= v_desde
                 order by a.cuando desc
                 limit 200
            ) t), '[]'::jsonb)
    );
end $$;
revoke execute on function public.lector_estado(text, timestamptz) from public, anon;
grant execute on function public.lector_estado(text, timestamptz) to authenticated;

create or replace function public.lector_desvincular(p_company text, p_dispositivo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador desconectan el celular de la caja.' using errcode = '42501';
    end if;
    update public.lector_dispositivos set revocado_at = now()
     where id = p_dispositivo and company_id = p_company and revocado_at is null;
end $$;
revoke execute on function public.lector_desvincular(text, uuid) from public, anon;
grant execute on function public.lector_desvincular(text, uuid) to authenticated;

-- ── 6 · Servidor (la web con la clave del servidor) ─────────────────────────

-- Canjea un código por el alta del celular. La clave la genera la web. Devuelve el negocio, o
-- lanza P0001 con un texto para el celular. Adivinar no sale a cuenta: 31^6 ≈ 887 millones de
-- códigos, uno vivo por negocio y 15 minutos.
create or replace function public.lector_srv_vincular(p_codigo text, p_dispositivo uuid, p_clave text, p_modelo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cod public.lector_codigos%rowtype;
    v_nombre text;
begin
    perform public.loyalty_srv_check();
    select * into v_cod from public.lector_codigos
     where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'))
     for update;
    if not found or v_cod.usado_at is not null or v_cod.expira < now() then
        raise exception 'Ese código no vale o ya caducó. Pide uno nuevo en el panel: Configuración › Cobros.';
    end if;
    update public.lector_codigos set usado_at = now() where codigo = v_cod.codigo;
    insert into public.lector_dispositivos (id, company_id, clave, modelo, vinculado_por)
    values (p_dispositivo, v_cod.company_id, p_clave, left(coalesce(p_modelo, ''), 80), v_cod.creado_por)
    on conflict (id) do update
       set company_id = excluded.company_id, clave = excluded.clave, modelo = excluded.modelo,
           vinculado_por = excluded.vinculado_por, vinculado_at = now(), revocado_at = null,
           ultimo_latido = null, ultimo_aviso = null;
    select name into v_nombre from public.companies where id = v_cod.company_id;
    return jsonb_build_object('negocio', coalesce(v_nombre, ''), 'company_id', v_cod.company_id);
end $$;
revoke execute on function public.lector_srv_vincular(text, uuid, text, text) from public, authenticated;
grant execute on function public.lector_srv_vincular(text, uuid, text, text) to anon;

-- La clave para comprobar la firma. null si el celular no existe o se desvinculó.
create or replace function public.lector_srv_clave(p_dispositivo uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v public.lector_dispositivos%rowtype;
begin
    perform public.loyalty_srv_check();
    select * into v from public.lector_dispositivos where id = p_dispositivo;
    if not found then return null; end if;
    return jsonb_build_object('clave', v.clave, 'revocado', v.revocado_at is not null);
end $$;
revoke execute on function public.lector_srv_clave(uuid) from public, authenticated;
grant execute on function public.lector_srv_clave(uuid) to anon;

-- Lo que manda el celular, ya con la firma comprobada. Devuelve {nuevo: bool}.
--   latido: {version, por_enviar, sin_leer}
--   aviso:  {huella, centimos|null, nombre, codigo|null, origen, generico, recuperado, cuando (ms)}
-- Los avisos de PRUEBA no llegan aquí: la web los descarta antes.
create or replace function public.lector_srv_recibir(p_dispositivo uuid, p_tipo text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_disp public.lector_dispositivos%rowtype;
    v_id bigint;
    v_cuando timestamptz;
    v_centimos bigint;
    v_codigo text;
begin
    perform public.loyalty_srv_check();
    select * into v_disp from public.lector_dispositivos where id = p_dispositivo and revocado_at is null;
    if not found then raise exception 'Celular no vinculado.' using errcode = '42501'; end if;

    update public.lector_dispositivos
       set ultimo_latido = now(),
           version = left(coalesce(p_datos->>'version', version), 20),
           por_enviar = case when p_tipo = 'latido' then greatest(0, coalesce((p_datos->>'por_enviar')::int, 0)) else por_enviar end,
           sin_leer = case when p_tipo = 'latido' then greatest(0, coalesce((p_datos->>'sin_leer')::int, 0)) else sin_leer end
     where id = p_dispositivo;
    if p_tipo = 'latido' then return jsonb_build_object('nuevo', false); end if;
    if p_tipo <> 'aviso' then raise exception 'Tipo desconocido: %', p_tipo; end if;

    -- La hora del aviso la pone el celular: si viene del futuro (reloj mal puesto), cuenta ahora.
    v_cuando := least(to_timestamp(coalesce((p_datos->>'cuando')::bigint, 0) / 1000.0), now());
    if v_cuando < now() - interval '30 days' then v_cuando := now(); end if;
    v_centimos := nullif(p_datos->>'centimos', '')::bigint;
    if v_centimos is not null and (v_centimos < 1 or v_centimos > 10000000000) then v_centimos := null; end if;
    v_codigo := p_datos->>'codigo';
    if v_codigo is not null and v_codigo !~ '^\d{3}$' then v_codigo := null; end if;

    insert into public.lector_avisos (company_id, dispositivo_id, huella, centimos, nombre, codigo, origen,
                                      generico, recuperado, cuando)
    values (v_disp.company_id, p_dispositivo, left(p_datos->>'huella', 128), v_centimos,
            left(coalesce(p_datos->>'nombre', ''), 120), v_codigo, left(coalesce(nullif(p_datos->>'origen', ''), 'Yape'), 60),
            coalesce((p_datos->>'generico')::boolean, false), coalesce((p_datos->>'recuperado')::boolean, false), v_cuando)
    on conflict (dispositivo_id, huella) do nothing
    returning id into v_id;
    if v_id is null then return jsonb_build_object('nuevo', false); end if;

    update public.lector_dispositivos set ultimo_aviso = greatest(coalesce(ultimo_aviso, v_cuando), v_cuando)
     where id = p_dispositivo;
    -- Aviso al dueño y al administrador. Solo lo leído (con monto): un «sin leer» se ve en el panel.
    -- avisos_apuntar descarta solo lo que tiene más de 30 min (un celular que vuelve de estar sin señal).
    if v_centimos is not null then
        perform public.avisos_apuntar(v_disp.company_id, 'pago', 'lector:' || v_id,
            jsonb_build_object('clase', 'lector', 'monto', v_centimos / 100.0, 'nombre', left(coalesce(p_datos->>'nombre', ''), 60),
                               'origen', left(coalesce(nullif(p_datos->>'origen', ''), 'Yape'), 60), 'cuando', v_cuando),
            v_cuando);
    end if;
    return jsonb_build_object('nuevo', true);
end $$;
revoke execute on function public.lector_srv_recibir(uuid, text, jsonb) from public, authenticated;
grant execute on function public.lector_srv_recibir(uuid, text, jsonb) to anon;

-- ── 7 · 90 días y fuera ─────────────────────────────────────────────────────
create or replace function public.lector_limpiar() returns void
language sql security definer set search_path = public as $$
    delete from public.lector_avisos where cuando < now() - interval '90 days';
    delete from public.lector_codigos where expira < now() - interval '1 day';
$$;
revoke execute on function public.lector_limpiar() from public, anon, authenticated;

do $$
begin
    perform cron.unschedule('lector_limpiar') where exists (select 1 from cron.job where jobname = 'lector_limpiar');
    perform cron.schedule('lector_limpiar', '17 8 * * *', 'select public.lector_limpiar()');  -- 03:17 Lima
exception when others then
    raise warning 'lector_limpiar sin pg_cron: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
