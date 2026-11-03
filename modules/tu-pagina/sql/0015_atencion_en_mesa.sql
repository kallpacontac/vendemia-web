-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0015: plantilla «Atención en mesa»
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Alvaro, 3-nov-2026: un QR por mesa para llamar al mozo, pedir la cuenta, armar el
-- pedido entre todos y dejar sugerencias o felicitaciones, sin tocar el sistema de
-- comandas ni el de comprobantes que el restaurante ya usa.
--
-- 1. NO ES UNA COMANDA. Lo que piden desde la mesa es un aviso para que el mozo llegue
--    sabiendo qué quieren; él lo sigue comandando en su POS. Por eso no toca orders, ni
--    stock, ni la Caja, y aquí no se emite ninguna boleta ni factura.
--
-- 2. pagina_mesas: el token del QR es la prueba de que están sentados ahí. El número
--    solo no alcanza: la 41 puede existir en dos salones.
--
-- 3. mesa_llamados: lo que entra desde la mesa. Guarda salón y número, no solo mesa_id:
--    borrar una mesa no puede dejar el historial sin saber de dónde vino.
--
-- 4. mesa_carrito: el carrito es de la MESA, no de cada celular. `disp` identifica al
--    teléfono para que cada uno toque solo sus líneas, y nunca sale de Postgres. Las
--    líneas de más de 3 horas no se ven: serían del grupo que ya se fue.
--
-- 5. DNI y RUC son datos personales que solo sirven para llevar la cuenta: se borran
--    24 horas después de atendida.
--
-- 6. AVISOS: cada llamado apunta dos eventos: 'reserva' (dueño y administrador) y
--    'mi_agenda' con empleado '' (el resto del equipo). `clase` 'web_mesa' lo redacta sin
--    importes ni teléfonos y lo abre en /panel/mesas. panel_push_srv_pendientes es la de
--    avisos 0004 salvo dos líneas: el silencio por defecto es de 22:00 a 07:00, justo la
--    cena, así que estos avisos lo ignoran y no cuentan en el resumen de la mañana.
--
-- Requiere 0001 y 0002 de Mi página, avisos 0004 y rol_en (bot 0041). Idempotente.
-- No se ejecuta sola: se corre entera en el editor SQL de Supabase. Sin esta migración
-- no hay mesas ni se puede publicar la plantilla. Deshacer: scripts/atencion-mesa-0015-deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

alter table public.tu_pagina drop constraint if exists tu_pagina_plantilla_check;
alter table public.tu_pagina add constraint tu_pagina_plantilla_check
  check (plantilla in ('vitrina', 'lista', 'carta', 'agenda', 'clases', 'envios', 'impulso', 'luxury', 'restaurante', 'canchas', 'mesa'));

-- ── Las tablas ────────────────────────────────────────────────────────────────

create table if not exists public.pagina_mesas (
    id         uuid primary key default gen_random_uuid(),
    company_id text not null,
    salon      text not null default '' check (char_length(salon) <= 40),
    numero     text not null check (char_length(numero) between 1 and 12),
    token      text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
    activa     boolean not null default true,
    creado_at  timestamptz not null default now(),
    unique (company_id, salon, numero)
);

create table if not exists public.mesa_llamados (
    id           uuid primary key default gen_random_uuid(),
    company_id   text not null,
    mesa_id      uuid references public.pagina_mesas (id) on delete set null,
    salon        text not null default '',
    numero       text not null default '',
    tipo         text not null check (tipo in ('mozo', 'cuenta', 'requerimiento', 'pedido', 'sugerencia', 'felicitacion')),
    detalle      text not null default '' check (char_length(detalle) <= 1000),
    comprobante  text not null default '' check (comprobante in ('', 'boleta', 'factura')),
    documento    text not null default '' check (documento ~ '^(\d{8}|\d{11})?$'),
    dividir      boolean not null default false,
    lineas       jsonb not null default '[]'::jsonb,
    total        numeric not null default 0,
    nombre       text not null default '' check (char_length(nombre) <= 120),
    telefono     text not null default '' check (char_length(telefono) <= 30),
    employee_id  text,
    repeticiones integer not null default 0,
    avisado_at   timestamptz not null default now(),
    creado_at    timestamptz not null default now(),
    atendido_at  timestamptz,
    atendido_por text not null default '',
    verificada   boolean not null default false
);
create index if not exists mesa_llamados_vivos on public.mesa_llamados (company_id, creado_at)
    where atendido_at is null and tipo in ('mozo', 'cuenta', 'requerimiento', 'pedido');
create index if not exists mesa_llamados_historial on public.mesa_llamados (company_id, creado_at desc);

create table if not exists public.mesa_carrito (
    id          uuid primary key default gen_random_uuid(),
    company_id  text not null,
    mesa_id     uuid not null references public.pagina_mesas (id) on delete cascade,
    disp        text not null,
    catalog_id  text not null,
    variante_id text not null default '',
    nombre      text not null,
    opcion      text not null default '',
    precio      numeric not null default 0,
    cantidad    integer not null check (cantidad between 1 and 20),
    creado_at   timestamptz not null default now(),
    unique (mesa_id, disp, catalog_id, variante_id)
);

alter table public.pagina_mesas enable row level security;
alter table public.mesa_llamados enable row level security;
alter table public.mesa_carrito enable row level security;
revoke all on public.pagina_mesas, public.mesa_llamados, public.mesa_carrito from anon, authenticated;

-- ── Por dentro ────────────────────────────────────────────────────────────────

create or replace function public.mesa_de_token(p_token text)
returns public.pagina_mesas language sql stable security definer set search_path = public as $$
    select m.* from public.pagina_mesas m
      join public.tu_pagina p on p.company_id = m.company_id and p.publicada
     where m.token = p_token and m.activa;
$$;

create or replace function public.mesa_avisar(p_id uuid, p_mesa public.pagina_mesas, p_tipo text, p_detalle text, p_repeticion integer)
returns void language plpgsql security definer set search_path = public as $$
declare
    v_ref   text := 'mesa:' || p_id || ':' || p_repeticion;
    v_datos jsonb := jsonb_build_object(
        'clase', 'web_mesa', 'empleado', '', 'que', p_tipo, 'mesa', p_mesa.numero, 'salon', p_mesa.salon,
        'detalle', left(p_detalle, 80), 'repeticion', p_repeticion);
begin
    perform public.avisos_apuntar(p_mesa.company_id, 'reserva', v_ref, v_datos);
    -- Una sugerencia la lee la gerencia, no el salón.
    if p_tipo <> 'sugerencia' then
        perform public.avisos_apuntar(p_mesa.company_id, 'mi_agenda', v_ref, v_datos);
    end if;
exception when others then
    -- Un aviso nunca tumba el llamado: en el panel se sigue viendo.
    raise warning 'mesa_avisar: %', sqlerrm;
end $$;

create or replace function public.mesa_carrito_json(p_mesa uuid, p_disp text)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'status', 'ok',
        'lineas', coalesce(jsonb_agg(jsonb_build_object(
            'id', c.id, 'catalog_id', c.catalog_id, 'nombre', c.nombre, 'opcion', c.opcion,
            'precio', c.precio, 'cantidad', c.cantidad, 'mia', c.disp = p_disp) order by c.creado_at), '[]'::jsonb),
        'unidades', coalesce(sum(c.cantidad), 0),
        'total', coalesce(sum(c.precio * c.cantidad), 0),
        'personas', count(distinct c.disp))
      from public.mesa_carrito c
     where c.mesa_id = p_mesa and c.creado_at > now() - interval '3 hours';
$$;

-- ── La mesa, con la clave de servidor (loyalty_srv_check), como las demás _srv_ ──

-- `equipo`: solo el nombre, para «¿Quién te atendió?». Ya es público en la página.
create or replace function public.mesa_srv_leer(p_slug text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_mesa public.pagina_mesas := public.mesa_de_token(p_token);
begin
    perform public.loyalty_srv_check();
    if v_mesa.id is null or not exists (
        select 1 from public.tu_pagina where company_id = v_mesa.company_id and slug = lower(p_slug)
    ) then
        return jsonb_build_object('status', 'not_found');
    end if;
    return jsonb_build_object(
        'status', 'ok', 'salon', v_mesa.salon, 'numero', v_mesa.numero,
        'equipo', coalesce((
            select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.name) order by e.name)
              from public.employees e
             where e.company_id = v_mesa.company_id and coalesce(e.is_active, 1) = 1), '[]'::jsonb));
end $$;

create or replace function public.mesa_srv_llamar(p_token text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_mesa    public.pagina_mesas := public.mesa_de_token(p_token);
    v_tipo    text := p_datos->>'tipo';
    v_detalle text := left(btrim(coalesce(p_datos->>'detalle', '')), 1000);
    v_comp    text := coalesce(p_datos->>'comprobante', '');
    v_doc     text := regexp_replace(coalesce(p_datos->>'documento', ''), '\D', '', 'g');
    v_dividir boolean := coalesce((p_datos->>'dividir')::boolean, false);
    v_emp     text := nullif(p_datos->>'employee_id', '');
    v_previo  public.mesa_llamados;
    v_id      uuid;
begin
    perform public.loyalty_srv_check();
    if v_mesa.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if v_tipo is null or v_tipo not in ('mozo', 'cuenta', 'requerimiento', 'sugerencia', 'felicitacion') then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if v_tipo = 'cuenta' and not v_dividir then
        if v_comp not in ('boleta', 'factura')
           or (v_comp = 'factura' and v_doc !~ '^\d{11}$')
           or (v_comp = 'boleta' and v_doc !~ '^(\d{8})?$') then
            return jsonb_build_object('status', 'datos_invalidos');
        end if;
    end if;
    if v_tipo <> 'cuenta' or v_dividir then v_comp := ''; v_doc := ''; end if;
    if v_tipo in ('sugerencia', 'felicitacion') and v_detalle = '' then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if v_emp is not null and not exists (
        select 1 from public.employees where company_id = v_mesa.company_id and id = v_emp
    ) then
        v_emp := null;
    end if;

    perform pg_advisory_xact_lock(hashtext('mesa:' || v_mesa.id));

    -- DNI y RUC de cuentas ya atendidas: lo que no hace falta, no se guarda.
    update public.mesa_llamados set documento = ''
     where company_id = v_mesa.company_id and documento <> '' and atendido_at < now() - interval '1 day';

    -- Insistir no abre otro llamado: suma al que ya espera, y avisa como mucho una vez por minuto.
    if v_tipo in ('mozo', 'cuenta', 'requerimiento') then
        select * into v_previo from public.mesa_llamados
         where mesa_id = v_mesa.id and tipo = v_tipo and atendido_at is null
           and (v_tipo <> 'requerimiento' or detalle = v_detalle)
         order by creado_at limit 1;
        if found then
            update public.mesa_llamados set
                repeticiones = repeticiones + 1,
                comprobante = case when v_tipo = 'cuenta' then v_comp else comprobante end,
                documento = case when v_tipo = 'cuenta' then v_doc else documento end,
                dividir = case when v_tipo = 'cuenta' then v_dividir else dividir end,
                avisado_at = case when avisado_at < now() - interval '1 minute' then now() else avisado_at end
             where id = v_previo.id;
            if v_previo.avisado_at < now() - interval '1 minute' then
                perform public.mesa_avisar(v_previo.id, v_mesa, v_tipo, v_detalle, v_previo.repeticiones + 1);
            end if;
            return jsonb_build_object('status', 'ok', 'repetida', true);
        end if;
    end if;

    insert into public.mesa_llamados (company_id, mesa_id, salon, numero, tipo, detalle, comprobante, documento, dividir,
                                      nombre, telefono, employee_id, atendido_at)
    values (v_mesa.company_id, v_mesa.id, v_mesa.salon, v_mesa.numero, v_tipo, v_detalle, v_comp, v_doc, v_dividir,
            left(btrim(coalesce(p_datos->>'nombre', '')), 120), left(btrim(coalesce(p_datos->>'telefono', '')), 30), v_emp,
            -- Nadie tiene que ir a la mesa por esto: nace atendido.
            case when v_tipo in ('sugerencia', 'felicitacion') then now() end)
    returning id into v_id;

    -- La felicitación va al seguimiento del equipo: no suena en ningún celular.
    if v_tipo <> 'felicitacion' then
        perform public.mesa_avisar(v_id, v_mesa, v_tipo, v_detalle, 0);
    end if;
    return jsonb_build_object('status', 'ok', 'repetida', false);
exception when check_violation or invalid_text_representation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

create or replace function public.mesa_srv_carrito(p_token text, p_disp text, p_accion text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_mesa public.pagina_mesas := public.mesa_de_token(p_token);
    v_item public.catalog;
    v_var  public.catalog_variantes;
    v_cant integer;
begin
    perform public.loyalty_srv_check();
    if v_mesa.id is null then return jsonb_build_object('status', 'not_found'); end if;

    if p_accion = 'leer' then
        return public.mesa_carrito_json(v_mesa.id, p_disp);
    end if;

    perform pg_advisory_xact_lock(hashtext('mesa:' || v_mesa.id));
    delete from public.mesa_carrito where mesa_id = v_mesa.id and creado_at <= now() - interval '3 hours';

    if p_accion = 'agregar' then
        v_cant := (p_datos->>'cantidad')::integer;
        if v_cant is null or v_cant not between 1 and 20 then return jsonb_build_object('status', 'datos_invalidos'); end if;
        select * into v_item from public.catalog
         where company_id = v_mesa.company_id and id = p_datos->>'catalog_id' and coalesce(is_active, 1) = 1;
        if not found then return jsonb_build_object('status', 'no_existe'); end if;
        if coalesce(p_datos->>'variante_id', '') <> '' then
            select * into v_var from public.catalog_variantes
             where company_id = v_mesa.company_id and catalog_id = v_item.id and id = p_datos->>'variante_id';
            if not found then return jsonb_build_object('status', 'no_existe'); end if;
        elsif exists (select 1 from public.catalog_variantes where company_id = v_mesa.company_id and catalog_id = v_item.id) then
            return jsonb_build_object('status', 'falta_opcion', 'producto', v_item.name);
        end if;
        if (select count(*) from public.mesa_carrito where mesa_id = v_mesa.id) >= 60 then
            return jsonb_build_object('status', 'demasiados');
        end if;
        insert into public.mesa_carrito (company_id, mesa_id, disp, catalog_id, variante_id, nombre, opcion, precio, cantidad)
        values (v_mesa.company_id, v_mesa.id, p_disp, v_item.id, coalesce(v_var.id, ''), v_item.name, coalesce(v_var.etiqueta, ''),
                coalesce(v_item.price, 0), v_cant)
        on conflict (mesa_id, disp, catalog_id, variante_id)
        do update set cantidad = least(public.mesa_carrito.cantidad + excluded.cantidad, 20);
    elsif p_accion = 'cantidad' then
        v_cant := (p_datos->>'cantidad')::integer;
        if v_cant is null or v_cant not between 0 and 20 then return jsonb_build_object('status', 'datos_invalidos'); end if;
        -- Lo que puso otro se ve, pero no se toca: están sentados en la misma mesa.
        if v_cant = 0 then
            delete from public.mesa_carrito where id = (p_datos->>'id')::uuid and mesa_id = v_mesa.id and disp = p_disp;
        else
            update public.mesa_carrito set cantidad = v_cant
             where id = (p_datos->>'id')::uuid and mesa_id = v_mesa.id and disp = p_disp;
        end if;
    else
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    return public.mesa_carrito_json(v_mesa.id, p_disp);
exception when check_violation or invalid_text_representation then
    return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- La lista la arma Postgres con el carrito de la mesa: el aviso lleva lo que pusieron todos.
create or replace function public.mesa_srv_pedir(p_token text, p_nota text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_mesa   public.pagina_mesas := public.mesa_de_token(p_token);
    v_lineas jsonb;
    v_total  numeric;
    v_id     uuid;
    v_nota   text := left(btrim(coalesce(p_nota, '')), 1000);
begin
    perform public.loyalty_srv_check();
    if v_mesa.id is null then return jsonb_build_object('status', 'not_found'); end if;
    perform pg_advisory_xact_lock(hashtext('mesa:' || v_mesa.id));
    select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'opcion', x.opcion, 'precio', x.precio, 'cantidad', x.cantidad) order by x.primera),
           sum(x.precio * x.cantidad)
      into v_lineas, v_total
      from (
        -- Dos celulares que pidieron lo mismo son una sola línea para el mozo.
        select c.nombre, c.opcion, c.precio, sum(c.cantidad)::integer as cantidad, min(c.creado_at) as primera
          from public.mesa_carrito c
         where c.mesa_id = v_mesa.id and c.creado_at > now() - interval '3 hours'
         group by c.nombre, c.opcion, c.precio
      ) x;
    -- Dos personas tocando «Enviar» a la vez: el segundo ya encuentra el carrito vacío.
    if v_lineas is null then return jsonb_build_object('status', 'vacio'); end if;
    insert into public.mesa_llamados (company_id, mesa_id, salon, numero, tipo, detalle, lineas, total)
    values (v_mesa.company_id, v_mesa.id, v_mesa.salon, v_mesa.numero, 'pedido', v_nota, v_lineas, coalesce(v_total, 0))
    returning id into v_id;
    delete from public.mesa_carrito where mesa_id = v_mesa.id;
    perform public.mesa_avisar(v_id, v_mesa, 'pedido', '', 0);
    return jsonb_build_object('status', 'ok');
end $$;

-- ── El panel, con la sesión de quien entra ────────────────────────────────────

-- Todo el equipo atiende mesas; lo demás lo hace quien pasa tu_pagina_autorizar.
create or replace function public.mesa_autorizar_equipo(p_company text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null then
        raise exception 'No tienes acceso a este negocio.' using errcode = '42501';
    end if;
end $$;

create or replace function public.mesa_quien(p_company text)
returns text language sql stable security definer set search_path = public as $$
    select coalesce(
        (select nullif(e.name, '') from public.memberships m
           join public.employees e on e.company_id = m.company_id and e.id = m.employee_id
          where m.company_id = p_company and m.auth_user_id = (select auth.uid())::text limit 1),
        nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
        'Equipo');
$$;

-- Para el menú. El empleado no puede leer tu_pagina, pero a él también le toca ver Mesas.
create or replace function public.mesa_panel_usa(p_company text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
    perform public.mesa_autorizar_equipo(p_company);
    return exists (select 1 from public.tu_pagina where company_id = p_company and publicada and plantilla = 'mesa');
end $$;

create or replace function public.mesa_panel_vivo(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_hoy timestamptz := date_trunc('day', now() at time zone 'America/Lima') at time zone 'America/Lima';
begin
    perform public.mesa_autorizar_equipo(p_company);
    return jsonb_build_object(
        'pendientes', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', l.id, 'tipo', l.tipo, 'salon', l.salon, 'numero', l.numero, 'detalle', l.detalle,
                'comprobante', l.comprobante, 'documento', l.documento, 'dividir', l.dividir, 'lineas', l.lineas,
                'total', l.total, 'repeticiones', l.repeticiones,
                'espera', floor(extract(epoch from now() - l.creado_at))::integer) order by l.creado_at)
              from public.mesa_llamados l
             where l.company_id = p_company and l.atendido_at is null
               and l.tipo in ('mozo', 'cuenta', 'requerimiento', 'pedido')), '[]'::jsonb),
        'hoy', (select jsonb_build_object(
                    'atendidos', count(*),
                    'promedio', coalesce(round(avg(extract(epoch from l.atendido_at - l.creado_at))), 0)::integer)
                  from public.mesa_llamados l
                 where l.company_id = p_company and l.creado_at >= v_hoy and l.atendido_at is not null
                   and l.tipo in ('mozo', 'cuenta', 'requerimiento', 'pedido')));
end $$;

create or replace function public.mesa_panel_llegue(p_company text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.mesa_autorizar_equipo(p_company);
    update public.mesa_llamados set atendido_at = now(), atendido_por = public.mesa_quien(p_company)
     where company_id = p_company and id = p_id and atendido_at is null;
    return jsonb_build_object('status', 'ok');
end $$;

-- Escanear el QR de la mesa: la llegada queda comprobada, y cierra todo lo que esa mesa esperaba.
create or replace function public.mesa_panel_llegue_qr(p_company text, p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_mesa public.pagina_mesas;
    v_n    integer;
begin
    perform public.mesa_autorizar_equipo(p_company);
    select * into v_mesa from public.pagina_mesas where company_id = p_company and token = p_token;
    if not found then return jsonb_build_object('status', 'not_found'); end if;
    update public.mesa_llamados
       set atendido_at = now(), atendido_por = public.mesa_quien(p_company), verificada = true
     where mesa_id = v_mesa.id and atendido_at is null;
    get diagnostics v_n = row_count;
    return jsonb_build_object('status', 'ok', 'cerrados', v_n, 'salon', v_mesa.salon, 'numero', v_mesa.numero);
end $$;

create or replace function public.mesa_panel_mesas(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', m.id, 'salon', m.salon, 'numero', m.numero, 'token', m.token, 'activa', m.activa)
                         order by m.salon, length(m.numero), m.numero)
          from public.pagina_mesas m where m.company_id = p_company), '[]'::jsonb);
end $$;

-- De una vez, del 1 al 20: es como se prepara un salón. Las que ya existen se dejan como están.
create or replace function public.mesa_panel_crear(p_company text, p_salon text, p_desde integer, p_hasta integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
    v_n integer;
begin
    perform public.tu_pagina_autorizar(p_company);
    if p_desde is null or p_hasta is null or p_desde < 1 or p_hasta < p_desde or p_hasta - p_desde >= 200 or p_hasta > 99999 then
        raise exception 'Revisa los números: de 1 a 200 mesas por vez.' using errcode = '22023';
    end if;
    insert into public.pagina_mesas (company_id, salon, numero)
    select p_company, left(btrim(coalesce(p_salon, '')), 40), n::text from generate_series(p_desde, p_hasta) n
    on conflict (company_id, salon, numero) do nothing;
    get diagnostics v_n = row_count;
    return v_n;
end $$;

create or replace function public.mesa_panel_activa(p_company text, p_id uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.pagina_mesas set activa = p_activa where company_id = p_company and id = p_id;
end $$;

-- Si circula una foto del QR: el impreso deja de valer y hay que reimprimir ese.
create or replace function public.mesa_panel_nuevo_qr(p_company text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.pagina_mesas set token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)
     where company_id = p_company and id = p_id;
    delete from public.mesa_carrito where company_id = p_company and mesa_id = p_id;
end $$;

create or replace function public.mesa_panel_borrar(p_company text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    delete from public.pagina_mesas where company_id = p_company and id = p_id;
end $$;

-- `p_clase`: 'comentarios' (sugerencias y felicitaciones) o 'atendidos' (el historial).
create or replace function public.mesa_panel_historial(p_company text, p_clase text, p_limite integer, p_saltar integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_tipos text[] := case when p_clase = 'comentarios' then array['sugerencia', 'felicitacion']
                           else array['mozo', 'cuenta', 'requerimiento', 'pedido'] end;
begin
    perform public.tu_pagina_autorizar(p_company);
    return jsonb_build_object(
        'filas', coalesce((
            select jsonb_agg(to_jsonb(x) order by x.creado desc) from (
                select l.id, l.tipo, l.salon, l.numero, l.detalle, l.nombre, l.telefono, l.lineas, l.total, l.repeticiones, l.verificada,
                       l.atendido_por, l.creado_at as creado, l.atendido_at as atendido,
                       floor(extract(epoch from l.atendido_at - l.creado_at))::integer as espera,
                       (select e.name from public.employees e where e.company_id = l.company_id and e.id = l.employee_id) as empleado
                  from public.mesa_llamados l
                 where l.company_id = p_company and l.tipo = any (v_tipos) and l.atendido_at is not null
                 order by l.creado_at desc
                 limit least(greatest(coalesce(p_limite, 30), 1), 100) offset greatest(coalesce(p_saltar, 0), 0)) x), '[]'::jsonb),
        -- Los últimos 7 días, por quien llegó o por quien felicitaron.
        'equipo', coalesce((
            select jsonb_agg(to_jsonb(r) order by r.cantidad desc) from (
                select coalesce(e.name, nullif(l.atendido_por, ''), 'Sin nombre') as quien, count(*) as cantidad,
                       case when p_clase = 'comentarios' then 0
                            else round(avg(extract(epoch from l.atendido_at - l.creado_at)))::integer end as promedio
                  from public.mesa_llamados l
                  left join public.employees e on p_clase = 'comentarios' and e.company_id = l.company_id and e.id = l.employee_id
                 where l.company_id = p_company and l.creado_at > now() - interval '7 days' and l.atendido_at is not null
                   and l.tipo = any (case when p_clase = 'comentarios' then array['felicitacion'] else v_tipos end)
                   and (p_clase <> 'comentarios' or l.employee_id is not null)
                 group by 1 limit 50) r), '[]'::jsonb));
end $$;

-- ── El despachador de avisos (avisos 0004), sin silencio para las mesas ─────────

create or replace function public.panel_push_srv_pendientes()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_eventos jsonb;
    v_resumenes jsonb;
begin
    perform public.loyalty_srv_check();

    with vencidos as (
        update public.panel_push_events e set estado = 'enviado', enviado_at = now()
         where e.id in (select id from public.panel_push_events
                         where estado = 'pendiente' and not_before <= now()
                         order by id limit 300 for update skip locked)
        returning e.*
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'company_id', v.company_id, 'tipo', v.tipo, 'datos', v.datos, 'creado', v.creado,
        'negocio', c.name, 'modo', c.business_mode,
        -- Al equipo, el nombre y nunca el teléfono.
        'cliente', case when v.tipo in ('mi_agenda', 'recordatorio') then nullif(l.name, '')
                        else coalesce(nullif(l.name, ''), l.phone) end,
        'destinos', coalesce((
            select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
              from public.panel_push_subscriptions s
             where s.company_id = v.company_id and s.revoked_at is null
               and case when v.tipo in ('mi_agenda', 'recordatorio')
                        then public.avisos_para_equipo(s.auth_user_id, s.company_id, v.tipo, v.datos)
                        else public.avisos_recibe(s.auth_user_id, s.company_id)
                             and (v.datos ->> 'para' is null or s.auth_user_id::text = v.datos ->> 'para')
                   end
               and coalesce((s.prefs ->> v.tipo)::boolean, v.tipo <> 'persona')
               -- Una mesa esperando no respeta el silencio: es el horario de la cena.
               and (v.datos ->> 'clase' = 'web_mesa' or not public.avisos_en_silencio(s.silencio_desde, s.silencio_hasta))
        ), '[]'::jsonb)
    ) order by v.id), '[]'::jsonb)
      into v_eventos
      from vencidos v
      join public.companies c on c.id = v.company_id
      left join public.leads l on l.id = v.datos ->> 'lead_id';

    with listas as (
        select s.*,
               ((now() at time zone 'America/Lima')::date + s.silencio_hasta) at time zone 'America/Lima' as fin
          from public.panel_push_subscriptions s
         where s.revoked_at is null and s.silencio_desde is not null and s.silencio_hasta is not null
           and s.silencio_desde <> s.silencio_hasta
           and (s.ultimo_resumen is null or s.ultimo_resumen < (now() at time zone 'America/Lima')::date)
           and public.avisos_recibe(s.auth_user_id, s.company_id)
    ), tocan as (
        select l.*,
               (case when l.silencio_desde > l.silencio_hasta
                     then ((now() at time zone 'America/Lima')::date - 1 + l.silencio_desde)
                     else ((now() at time zone 'America/Lima')::date + l.silencio_desde) end) at time zone 'America/Lima' as inicio
          from listas l
         where now() >= l.fin and now() < l.fin + interval '15 minutes'
    ), marcadas as (
        update public.panel_push_subscriptions s set ultimo_resumen = (now() at time zone 'America/Lima')::date
          from tocan t where s.id = t.id
        returning s.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id, 'endpoint', t.endpoint, 'p256dh', t.p256dh, 'auth', t.auth,
        'negocio', c.name, 'modo', c.business_mode,
        'conteos', (select coalesce(jsonb_object_agg(x.tipo, x.n), '{}'::jsonb) from (
            select e.tipo, count(*) as n from public.panel_push_events e
             where e.company_id = t.company_id and e.estado in ('enviado', 'pendiente')
               and e.creado >= t.inicio and e.creado < t.fin
               and e.tipo not in ('mi_agenda', 'recordatorio')
               and coalesce(e.datos ->> 'clase', '') <> 'web_mesa'
               and (e.datos ->> 'para' is null or t.auth_user_id::text = e.datos ->> 'para')
               and coalesce((t.prefs ->> e.tipo)::boolean, e.tipo <> 'persona')
             group by e.tipo) x)
    )), '[]'::jsonb)
      into v_resumenes
      from tocan t join public.companies c on c.id = t.company_id
     where t.id in (select id from marcadas);

    return jsonb_build_object('eventos', v_eventos, 'resumenes', v_resumenes);
end $$;
revoke execute on function public.panel_push_srv_pendientes() from public, anon, authenticated;

-- ── Permisos ──────────────────────────────────────────────────────────────────

do $$
declare
    f text;
begin
    -- Por dentro: solo las llaman otras funciones (security definer).
    foreach f in array array[
        'mesa_de_token(text)', 'mesa_avisar(uuid, public.pagina_mesas, text, text, integer)', 'mesa_carrito_json(uuid, text)',
        'mesa_autorizar_equipo(text)', 'mesa_quien(text)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    end loop;
    -- La página, con la clave de servidor.
    foreach f in array array[
        'mesa_srv_leer(text, text)', 'mesa_srv_llamar(text, jsonb)',
        'mesa_srv_carrito(text, text, text, jsonb)', 'mesa_srv_pedir(text, text)'
    ] loop
        execute format('revoke execute on function public.%s from public', f);
        execute format('grant execute on function public.%s to anon', f);
    end loop;
    -- El panel, con la sesión.
    foreach f in array array[
        'mesa_panel_usa(text)', 'mesa_panel_vivo(text)', 'mesa_panel_llegue(text, uuid)', 'mesa_panel_llegue_qr(text, text)',
        'mesa_panel_mesas(text)', 'mesa_panel_crear(text, text, integer, integer)', 'mesa_panel_activa(text, uuid, boolean)',
        'mesa_panel_nuevo_qr(text, uuid)', 'mesa_panel_borrar(text, uuid)', 'mesa_panel_historial(text, text, integer, integer)'
    ] loop
        execute format('revoke execute on function public.%s from public, anon', f);
        execute format('grant execute on function public.%s to authenticated', f);
    end loop;
end $$;

commit;
