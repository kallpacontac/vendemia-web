-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA FACTURACIÓN · 0001 · Boletas y facturas electrónicas (11-nov-2026)
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Pedido de Alvaro (11-nov-2026): emitir boletas y facturas a SUNAT desde el panel, poder
-- imprimirlas y cambiar de proveedor sin rehacer nada. Se prueban dos: Lucode (APISUNAT,
-- PSE) y APIsPerú (firma con el certificado del local). El código está en modules/facturacion.
--
-- Tres tablas:
--   · factura_ajustes        Lo del local: RUC, razón social, series, régimen de IGV, proveedor
--                            y ambiente elegidos, ancho de ticketera. Una fila por negocio.
--   · factura_credenciales   El token de cada proveedor, CIFRADO por el servidor (AES-GCM,
--                            servidor/cifrado.ts). Postgres nunca ve el token en claro y el
--                            navegador nunca recibe ni el cifrado. Una fila por proveedor: cambiar
--                            de uno a otro no borra el token del anterior (hace falta para
--                            consultar o anular lo que se emitió con él).
--   · comprobantes_electronicos  Cada boleta y factura, con copia del emisor y del régimen del
--                            momento (reimprimir no cambia si luego se tocan los Ajustes).
--   · factura_series         El último número de cada serie. El número lo da Postgres, nunca el
--                            proveedor ni el navegador: dos cajas a la vez no repiten número.
--
-- Quién:
--   · Ajustes y token: SOLO el dueño.
--   · Emitir, ver, consultar y anular: dueño y administrador.
--   · Guardar lo que respondió SUNAT y leer el token cifrado: solo el servidor (x-fideliza-key,
--     funciones factura_srv_*). Así nadie marca «aceptado» un comprobante desde el navegador.
--
-- Los comprobantes NO se borran (SUNAT pide conservarlos). DNI y RUC del cliente quedan
-- guardados aquí por eso, a diferencia de la cuenta en mesa (tu-pagina 0015), que los borra.
--
-- Requiere: rol_en (datos 0001) y loyalty_srv_check (fideliza 0002).
-- Idempotente. Deshacer: scripts/facturacion-0001-deshacer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

do $$
begin
    if to_regprocedure('public.rol_en(text)') is null then
        raise exception 'Falta rol_en: aplica antes modules/datos/sql/0001_cimientos_v2.sql.';
    end if;
    if to_regprocedure('public.loyalty_srv_check()') is null then
        raise exception 'Falta loyalty_srv_check: aplica antes modules/fideliza/sql/0002_permisos_rls.sql.';
    end if;
end $$;

-- ── 1 · Tablas ────────────────────────────────────────────────────────────────

create table if not exists public.factura_ajustes (
    company_id        text primary key,
    activo            boolean not null default false,
    proveedor         text not null default 'simulado' check (proveedor in ('lucode', 'apisperu', 'simulado')),
    ambiente          text not null default 'pruebas' check (ambiente in ('pruebas', 'produccion')),
    ruc               text not null default '' check (ruc = '' or ruc ~ '^\d{11}$'),
    razon_social      text not null default '' check (char_length(razon_social) <= 200),
    nombre_comercial  text not null default '' check (char_length(nombre_comercial) <= 200),
    direccion         text not null default '' check (char_length(direccion) <= 250),
    ubigeo            text not null default '' check (ubigeo = '' or ubigeo ~ '^\d{6}$'),
    departamento      text not null default '' check (char_length(departamento) <= 60),
    provincia         text not null default '' check (char_length(provincia) <= 60),
    distrito          text not null default '' check (char_length(distrito) <= 60),
    serie_boleta      text not null default 'B001' check (serie_boleta ~ '^B[A-Z0-9]{3}$'),
    serie_factura     text not null default 'F001' check (serie_factura ~ '^F[A-Z0-9]{3}$'),
    -- gravado: la tasa de igv_porcentaje (18, u otra que diga el contador).
    -- mype: restaurante u hotel MYPE; la tasa sale de la FECHA (factura_tasa_mype), no de aquí.
    -- exonerado: Amazonía, con su leyenda.
    igv_tipo          text not null default 'gravado',
    igv_porcentaje    numeric(5,2) not null default 18 check (igv_porcentaje > 0 and igv_porcentaje <= 30),
    leyenda_amazonia  text check (leyenda_amazonia in ('2001', '2002')),
    ticket_ancho      integer not null default 80 check (ticket_ancho in (58, 80)),
    actualizado_por   uuid,
    actualizado_at    timestamptz not null default now()
);

create table if not exists public.factura_credenciales (
    company_id     text not null,
    proveedor      text not null check (proveedor in ('lucode', 'apisperu', 'simulado')),
    token_cifrado  text not null check (char_length(token_cifrado) between 20 and 4000),
    -- Los 4 últimos caracteres, para que el dueño reconozca cuál puso.
    token_pista    text not null default '' check (char_length(token_pista) <= 4),
    actualizado_por uuid,
    actualizado_at timestamptz not null default now(),
    primary key (company_id, proveedor)
);

create table if not exists public.factura_series (
    company_id  text not null,
    -- B001, F001… y las de las bajas del día: RA20261111 (facturas), RC20261111 (boletas).
    serie       text not null check (serie ~ '^([BF][A-Z0-9]{3}|R[AC]\d{8})$'),
    ultimo      integer not null default 0 check (ultimo >= 0),
    primary key (company_id, serie)
);

create table if not exists public.comprobantes_electronicos (
    id              uuid primary key default gen_random_uuid(),
    company_id      text not null,
    -- Lo genera el navegador al abrir el formulario: un doble clic no emite dos veces.
    clave           text not null check (char_length(clave) between 8 and 64),
    tipo            text not null check (tipo in ('boleta', 'factura')),
    serie           text not null,
    numero          integer not null check (numero > 0),
    fecha           date not null,
    hora            text not null,
    cliente         jsonb not null,
    lineas          jsonb not null,
    op_gravadas     numeric(12,2) not null default 0,
    op_exoneradas   numeric(12,2) not null default 0,
    igv             numeric(12,2) not null default 0,
    total           numeric(12,2) not null check (total > 0),
    igv_tipo        text not null check (igv_tipo in ('gravado', 'exonerado')),
    igv_porcentaje  numeric(5,2) not null,
    leyenda_amazonia text,
    leyendas        jsonb not null default '[]'::jsonb,
    emisor          jsonb not null,
    proveedor       text not null,
    ambiente        text not null,
    estado          text not null default 'por_enviar'
                    check (estado in ('por_enviar', 'pendiente', 'aceptado', 'rechazado', 'error', 'anulando', 'anulado')),
    mensaje         text not null default '',
    observaciones   jsonb not null default '[]'::jsonb,
    hash            text not null default '',
    xml_url         text not null default '',
    cdr_url         text not null default '',
    pdf_url         text not null default '',
    ticket_baja     text not null default '',
    motivo_baja     text not null default '',
    baja_por        uuid,
    -- De dónde salió: 'cita', 'pedido', 'mesa'… o '' si se hizo a mano.
    ref_tipo        text not null default '',
    ref_id          text not null default '',
    emitido_por     uuid,
    creado_at       timestamptz not null default now(),
    actualizado_at  timestamptz not null default now(),
    unique (company_id, serie, numero),
    unique (company_id, clave)
);
create index if not exists ix_comprobantes_e_fecha on public.comprobantes_electronicos (company_id, fecha desc, numero desc);
create index if not exists ix_comprobantes_e_ref on public.comprobantes_electronicos (company_id, ref_tipo, ref_id) where ref_id <> '';

-- Aparte de la tabla para que volver a correr el script la ponga al día.
alter table public.factura_ajustes drop constraint if exists factura_ajustes_igv_tipo_check;
alter table public.factura_ajustes add constraint factura_ajustes_igv_tipo_check
    check (igv_tipo in ('gravado', 'mype', 'exonerado'));

alter table public.factura_ajustes enable row level security;
alter table public.factura_credenciales enable row level security;
alter table public.factura_series enable row level security;
alter table public.comprobantes_electronicos enable row level security;
revoke all on public.factura_ajustes, public.factura_credenciales, public.factura_series,
              public.comprobantes_electronicos from anon, authenticated;

-- ── 2 · Quién ─────────────────────────────────────────────────────────────────

create or replace function public.factura_rol(p_company text, p_solo_dueno boolean default false)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if p_solo_dueno and v_rol <> 'dueno' then
        raise exception 'Esto solo lo cambia el dueño del negocio.' using errcode = '42501';
    end if;
    if v_rol not in ('dueno', 'admin') then
        raise exception 'Las boletas y facturas las emite el dueño o el administrador.' using errcode = '42501';
    end if;
    return v_rol;
end $$;

-- Hoy y ahora en Lima.
create or replace function public.factura_hoy() returns date language sql stable as $$
    select (now() at time zone 'America/Lima')::date;
$$;

-- ── Tasa de restaurantes, hoteles y alojamientos turísticos MYPE ──────────────
-- Ley 31556 (2022), prorrogada por la Ley 32219 (dic-2024), más el Impuesto de Promoción
-- Municipal que sube 0,5 al año desde 2026 (Ley 32387, jun-2025). En el comprobante va la
-- suma IGV + IPM, como el 18 % de siempre (que ahora es 15,5 + 2,5):
--     2026:  8 % + 2,5 % = 10,5 %
--     2027: 12 % + 3 %   = 15 %
--     2028 en adelante: se acaba el régimen → la general, 18 %.
-- Fuente: SUNAT, orientacion.sunat.gob.pe/reduccion-del-igv-para-restaurantes-hoteles-y-alojamiento-turisticos-1
-- (leído el 13-nov-2026). Si el Congreso lo vuelve a prorrogar, se cambia SOLO aquí y en
-- factura_mype_proximo_cambio (y sus pruebas en pruebas/sql_pglite.mjs).
create or replace function public.factura_tasa_mype(p_fecha date) returns numeric language sql immutable as $$
    select (case
        when p_fecha < date '2026-01-01' then 10
        when p_fecha < date '2027-01-01' then 10.5
        when p_fecha < date '2028-01-01' then 15
        else 18 end)::numeric;
$$;

-- El siguiente día en que cambia la tasa MYPE (null si ya no cambia).
create or replace function public.factura_mype_proximo_cambio(p_fecha date) returns date language sql immutable as $$
    select case
        when p_fecha < date '2026-01-01' then date '2026-01-01'
        when p_fecha < date '2027-01-01' then date '2027-01-01'
        when p_fecha < date '2028-01-01' then date '2028-01-01'
        end;
$$;

-- La tasa que lleva un comprobante de este local emitido en esa fecha (0 si exonerado).
create or replace function public.factura_tasa(p_tipo text, p_porcentaje numeric, p_fecha date)
returns numeric language sql immutable as $$
    select case p_tipo
        when 'exonerado' then 0::numeric
        when 'mype' then public.factura_tasa_mype(p_fecha)
        else p_porcentaje end;
$$;

-- ── 3 · Ajustes (panel) ───────────────────────────────────────────────────────

create or replace function public.factura_ajustes_leer(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text := public.factura_rol(p_company);
    a public.factura_ajustes;
    v jsonb;
    v_hoy date;
    v_cambio date;
begin
    select * into a from public.factura_ajustes where company_id = p_company;
    if a.company_id is null then
        -- Sin guardar todavía: los valores por defecto de la tabla.
        v := jsonb_build_object('company_id', p_company, 'activo', false, 'proveedor', 'simulado',
            'ambiente', 'pruebas', 'ruc', '', 'razon_social', '', 'nombre_comercial', '', 'direccion', '',
            'ubigeo', '', 'departamento', '', 'provincia', '', 'distrito', '', 'serie_boleta', 'B001',
            'serie_factura', 'F001', 'igv_tipo', 'gravado', 'igv_porcentaje', 18, 'leyenda_amazonia', null,
            'ticket_ancho', 80);
    else
        v := to_jsonb(a) - 'actualizado_por';
    end if;
    v_hoy := public.factura_hoy();
    v_cambio := case when v->>'igv_tipo' = 'mype' then public.factura_mype_proximo_cambio(v_hoy) end;
    return v || jsonb_build_object(
        -- La tasa con la que saldría un comprobante emitido ahora. El formulario calcula con esta.
        'igv_tasa_hoy', public.factura_tasa(v->>'igv_tipo', (v->>'igv_porcentaje')::numeric, v_hoy),
        -- Solo MYPE: cuándo cambia y a cuánto, para avisarlo en Ajustes.
        'igv_tasa_cambio', case when v_cambio is not null then
            jsonb_build_object('desde', v_cambio, 'tasa', public.factura_tasa_mype(v_cambio)) end,
        'rol', v_rol,
        'configurado', a.company_id is not null,
        'tokens', coalesce((select jsonb_object_agg(c.proveedor, c.token_pista)
                              from public.factura_credenciales c where c.company_id = p_company), '{}'::jsonb),
        'ultimo_boleta', coalesce((select s.ultimo from public.factura_series s
                                    where s.company_id = p_company and s.serie = coalesce(a.serie_boleta, 'B001')), 0),
        'ultimo_factura', coalesce((select s.ultimo from public.factura_series s
                                     where s.company_id = p_company and s.serie = coalesce(a.serie_factura, 'F001')), 0));
end $$;

-- p_token_cifrado: null = no tocar el token; '' = borrarlo. Lo cifra la ruta del servidor.
-- p_datos.ultimo_boleta / ultimo_factura: el último número que el local YA emitió con esa serie
-- en otro sistema. Solo puede subir, nunca bajar por debajo de lo emitido aquí.
create or replace function public.factura_ajustes_guardar(p_company text, p_datos jsonb, p_token_cifrado text, p_token_pista text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.factura_rol(p_company, true);
    d jsonb := coalesce(p_datos, '{}'::jsonb);
    v_proveedor text := coalesce(d->>'proveedor', 'simulado');
    v_serie text;
    v_ultimo integer;
    v_max integer;
    k text;
begin
    if v_proveedor = 'simulado' and coalesce(d->>'ambiente', 'pruebas') = 'produccion' then
        raise exception 'La prueba local no envía a SUNAT: no se puede usar en producción.' using errcode = '22023';
    end if;

    insert into public.factura_ajustes as a (
        company_id, activo, proveedor, ambiente, ruc, razon_social, nombre_comercial, direccion, ubigeo,
        departamento, provincia, distrito, serie_boleta, serie_factura, igv_tipo, igv_porcentaje,
        leyenda_amazonia, ticket_ancho, actualizado_por, actualizado_at)
    values (
        p_company,
        coalesce((d->>'activo')::boolean, false),
        v_proveedor,
        coalesce(d->>'ambiente', 'pruebas'),
        coalesce(d->>'ruc', ''),
        btrim(coalesce(d->>'razon_social', '')),
        btrim(coalesce(d->>'nombre_comercial', '')),
        btrim(coalesce(d->>'direccion', '')),
        coalesce(d->>'ubigeo', ''),
        btrim(coalesce(d->>'departamento', '')),
        btrim(coalesce(d->>'provincia', '')),
        btrim(coalesce(d->>'distrito', '')),
        upper(coalesce(d->>'serie_boleta', 'B001')),
        upper(coalesce(d->>'serie_factura', 'F001')),
        coalesce(d->>'igv_tipo', 'gravado'),
        coalesce((d->>'igv_porcentaje')::numeric, 18),
        case when d->>'igv_tipo' = 'exonerado' then nullif(d->>'leyenda_amazonia', '') end,
        coalesce((d->>'ticket_ancho')::integer, 80),
        auth.uid(), now())
    on conflict (company_id) do update set
        activo = excluded.activo, proveedor = excluded.proveedor, ambiente = excluded.ambiente,
        ruc = excluded.ruc, razon_social = excluded.razon_social, nombre_comercial = excluded.nombre_comercial,
        direccion = excluded.direccion, ubigeo = excluded.ubigeo, departamento = excluded.departamento,
        provincia = excluded.provincia, distrito = excluded.distrito, serie_boleta = excluded.serie_boleta,
        serie_factura = excluded.serie_factura, igv_tipo = excluded.igv_tipo,
        igv_porcentaje = excluded.igv_porcentaje, leyenda_amazonia = excluded.leyenda_amazonia,
        ticket_ancho = excluded.ticket_ancho, actualizado_por = excluded.actualizado_por, actualizado_at = now();

    -- Desde qué número seguir.
    foreach k in array array['boleta', 'factura'] loop
        if d ? ('ultimo_' || k) then
            v_ultimo := (d->>('ultimo_' || k))::integer;
            v_serie := upper(coalesce(d->>('serie_' || k), case k when 'boleta' then 'B001' else 'F001' end));
            select coalesce(max(numero), 0) into v_max from public.comprobantes_electronicos
             where company_id = p_company and serie = v_serie;
            if v_ultimo < v_max then
                raise exception 'La serie % ya va en el %: no puede volver atrás.', v_serie, v_max using errcode = '22023';
            end if;
            insert into public.factura_series (company_id, serie, ultimo) values (p_company, v_serie, v_ultimo)
            on conflict (company_id, serie) do update set ultimo = excluded.ultimo;
        end if;
    end loop;

    if p_token_cifrado = '' then
        delete from public.factura_credenciales where company_id = p_company and proveedor = v_proveedor;
    elsif p_token_cifrado is not null then
        insert into public.factura_credenciales (company_id, proveedor, token_cifrado, token_pista, actualizado_por)
        values (p_company, v_proveedor, p_token_cifrado, left(coalesce(p_token_pista, ''), 4), auth.uid())
        on conflict (company_id, proveedor) do update set token_cifrado = excluded.token_cifrado,
            token_pista = excluded.token_pista, actualizado_por = excluded.actualizado_por, actualizado_at = now();
    end if;

    return public.factura_ajustes_leer(p_company);
end $$;

-- ── 4 · Emitir: reservar el número (panel, vía la ruta del servidor) ──────────
-- Los montos los calcula el servidor (modules/facturacion/dominio/montos.ts) y los vuelve a
-- comprobar antes de mandar. Aquí se asigna el número, se copia el emisor y el régimen, y se
-- guarda la fila en 'por_enviar'.
create or replace function public.factura_reservar(p_company text, p_doc jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_rol text := public.factura_rol(p_company);
    a public.factura_ajustes;
    v_tipo text := p_doc->>'tipo';
    v_serie text;
    v_numero integer;
    v_ya public.comprobantes_electronicos;
    v_id uuid;
    v_ahora timestamp := now() at time zone 'America/Lima';
    v_tasa numeric;
begin
    select * into a from public.factura_ajustes where company_id = p_company;
    if a.company_id is null or not a.activo then
        raise exception 'Las boletas y facturas no están activas. Actívalas en Ajustes.' using errcode = '55000';
    end if;
    if v_tipo not in ('boleta', 'factura') then
        raise exception 'Tipo de comprobante no válido.' using errcode = '22023';
    end if;

    -- El mismo formulario enviado dos veces: devolver el que ya existe.
    select * into v_ya from public.comprobantes_electronicos
     where company_id = p_company and clave = p_doc->>'clave';
    if v_ya.id is not null then
        return jsonb_build_object('id', v_ya.id, 'serie', v_ya.serie, 'numero', v_ya.numero, 'repetido', true);
    end if;

    -- Los montos se calcularon con una tasa; tiene que ser la que toca HOY. Si no (cambió el año
    -- con la pantalla abierta, o alguien tocó los Ajustes a la vez), se para antes de gastar número.
    v_tasa := public.factura_tasa(a.igv_tipo, a.igv_porcentaje, v_ahora::date);
    if (p_doc->>'igv_porcentaje') is null or (p_doc->>'igv_porcentaje')::numeric <> v_tasa then
        raise exception 'La tasa del IGV cambió (ahora es % %%). Recarga la página y vuelve a emitir.',
            replace(trim_scale(v_tasa)::text, '.', ',') using errcode = '22023';
    end if;

    v_serie := case v_tipo when 'boleta' then a.serie_boleta else a.serie_factura end;
    insert into public.factura_series as s (company_id, serie, ultimo) values (p_company, v_serie, 1)
    on conflict (company_id, serie) do update set ultimo = s.ultimo + 1
    returning ultimo into v_numero;

    insert into public.comprobantes_electronicos (
        company_id, clave, tipo, serie, numero, fecha, hora, cliente, lineas, op_gravadas, op_exoneradas,
        igv, total, igv_tipo, igv_porcentaje, leyenda_amazonia, leyendas, emisor, proveedor, ambiente,
        ref_tipo, ref_id, emitido_por)
    values (
        p_company, p_doc->>'clave', v_tipo, v_serie, v_numero, v_ahora::date, to_char(v_ahora, 'HH24:MI:SS'),
        p_doc->'cliente', p_doc->'lineas',
        coalesce((p_doc->>'op_gravadas')::numeric, 0), coalesce((p_doc->>'op_exoneradas')::numeric, 0),
        coalesce((p_doc->>'igv')::numeric, 0), (p_doc->>'total')::numeric,
        -- En el comprobante «mype» es gravado: lo que cuenta es la tasa con la que salió.
        case when a.igv_tipo = 'exonerado' then 'exonerado' else 'gravado' end, v_tasa, a.leyenda_amazonia,
        case when a.igv_tipo = 'exonerado' and a.leyenda_amazonia is not null
             then jsonb_build_array(a.leyenda_amazonia) else '[]'::jsonb end,
        jsonb_build_object('ruc', a.ruc, 'razon_social', a.razon_social, 'nombre_comercial', a.nombre_comercial,
            'direccion', a.direccion, 'ubigeo', a.ubigeo, 'departamento', a.departamento,
            'provincia', a.provincia, 'distrito', a.distrito),
        a.proveedor, a.ambiente,
        left(coalesce(p_doc->>'ref_tipo', ''), 20), left(coalesce(p_doc->>'ref_id', ''), 80), auth.uid())
    returning id into v_id;

    return jsonb_build_object('id', v_id, 'serie', v_serie, 'numero', v_numero, 'repetido', false);
end $$;

-- ── 5 · Ver (panel) ───────────────────────────────────────────────────────────

create or replace function public.factura_lista(p_company text, p_desde date, p_hasta date)
returns setof jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.factura_rol(p_company);
    return query
        select to_jsonb(c) - 'emitido_por' - 'baja_por' - 'clave'
          from public.comprobantes_electronicos c
         where c.company_id = p_company and c.fecha between p_desde and p_hasta
         order by c.fecha desc, c.creado_at desc
         limit 500;
end $$;

-- La puerta de las acciones sobre UN comprobante (consultar, reintentar): devuelve la fila.
create or replace function public.factura_uno(p_company text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
    perform public.factura_rol(p_company);
    select to_jsonb(c) - 'emitido_por' - 'baja_por' - 'clave' into v
      from public.comprobantes_electronicos c where c.company_id = p_company and c.id = p_id;
    if v is null then raise exception 'Ese comprobante no es de este negocio.' using errcode = 'P0002'; end if;
    return v;
end $$;

-- Pedir la baja: deja el motivo y quién, y da el correlativo de la comunicación del día.
-- El plazo lo comprueba el servidor (depende del proveedor).
create or replace function public.factura_pedir_baja(p_company text, p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    c public.comprobantes_electronicos;
    v_hoy date := public.factura_hoy();
    v_serie text;
    v_corr integer;
begin
    perform public.factura_rol(p_company);
    select * into c from public.comprobantes_electronicos where company_id = p_company and id = p_id for update;
    if c.id is null then raise exception 'Ese comprobante no es de este negocio.' using errcode = 'P0002'; end if;
    if c.estado <> 'aceptado' then
        raise exception 'Solo se anula un comprobante aceptado por SUNAT.' using errcode = '55000';
    end if;
    if char_length(btrim(coalesce(p_motivo, ''))) < 3 then
        raise exception 'Escribe el motivo de la anulación.' using errcode = '22023';
    end if;
    v_serie := case c.tipo when 'factura' then 'RA' else 'RC' end || to_char(v_hoy, 'YYYYMMDD');
    insert into public.factura_series as s (company_id, serie, ultimo) values (p_company, v_serie, 1)
    on conflict (company_id, serie) do update set ultimo = s.ultimo + 1
    returning ultimo into v_corr;
    update public.comprobantes_electronicos
       set motivo_baja = left(btrim(p_motivo), 100), baja_por = auth.uid(), actualizado_at = now()
     where id = p_id;
    return jsonb_build_object('correlativo', v_corr, 'hoy', v_hoy);
end $$;

-- ── 6 · Servidor (x-fideliza-key) ─────────────────────────────────────────────

-- La fila y el token cifrado del proveedor CON EL QUE SE EMITIÓ (no el elegido hoy).
create or replace function public.factura_srv_cargar(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
    perform public.loyalty_srv_check();
    select to_jsonb(c) - 'emitido_por' - 'baja_por' || jsonb_build_object('token_cifrado',
             (select k.token_cifrado from public.factura_credenciales k
               where k.company_id = c.company_id and k.proveedor = c.proveedor))
      into v
      from public.comprobantes_electronicos c where c.id = p_id;
    return v;
end $$;

create or replace function public.factura_srv_resultado(p_id uuid, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    d jsonb := coalesce(p_datos, '{}'::jsonb);
    v jsonb;
begin
    perform public.loyalty_srv_check();
    if d->>'estado' not in ('pendiente', 'aceptado', 'rechazado', 'error', 'anulando', 'anulado') then
        raise exception 'Estado no válido.' using errcode = '22023';
    end if;
    update public.comprobantes_electronicos c set
        estado = d->>'estado',
        mensaje = left(coalesce(d->>'mensaje', ''), 1000),
        observaciones = coalesce(d->'observaciones', c.observaciones),
        hash = coalesce(nullif(d->>'hash', ''), c.hash),
        xml_url = coalesce(nullif(d->>'xml_url', ''), c.xml_url),
        cdr_url = coalesce(nullif(d->>'cdr_url', ''), c.cdr_url),
        pdf_url = coalesce(nullif(d->>'pdf_url', ''), c.pdf_url),
        ticket_baja = coalesce(nullif(d->>'ticket', ''), c.ticket_baja),
        actualizado_at = now()
     where c.id = p_id
    returning to_jsonb(c) - 'emitido_por' - 'baja_por' - 'clave' into v;
    return v;
end $$;

-- ── 7 · Permisos ──────────────────────────────────────────────────────────────

revoke execute on function public.factura_rol(text, boolean) from public, anon, authenticated;
revoke execute on function public.factura_hoy() from public, anon;
revoke execute on function public.factura_tasa_mype(date) from public, anon;
revoke execute on function public.factura_mype_proximo_cambio(date) from public, anon;
revoke execute on function public.factura_tasa(text, numeric, date) from public, anon;
do $$
declare f text;
begin
    foreach f in array array[
        'factura_ajustes_leer(text)', 'factura_ajustes_guardar(text, jsonb, text, text)',
        'factura_reservar(text, jsonb)', 'factura_lista(text, date, date)', 'factura_uno(text, uuid)',
        'factura_pedir_baja(text, uuid, text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
    foreach f in array array['factura_srv_cargar(uuid)', 'factura_srv_resultado(uuid, jsonb)'] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
        execute format('grant execute on function public.%s to anon', f);
    end loop;
end $$;

commit;

notify pgrst, 'reload schema';
