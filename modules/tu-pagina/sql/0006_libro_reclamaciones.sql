-- ═══════════════════════════════════════════════════════════════════════════════
-- MI PÁGINA · 0006 · Libro de Reclamaciones Virtual
--
-- Apartado OPCIONAL de Mi página (Alvaro, 20-oct-2026): el negocio lo enciende,
-- pone su razón social, RUC y dirección, y en su página sale el enlace al libro.
-- Ley 29571 (Código de Protección y Defensa del Consumidor, mod. Ley 31435) y su
-- Reglamento del Libro de Reclamaciones (D.S. 011-2011-PCM, mod. D.S. 101-2022-PCM):
--   · Hoja con número correlativo y fecha, datos del proveedor, del consumidor,
--     del bien contratado, el detalle y el pedido; reclamo o queja.
--   · Respuesta en 15 días hábiles improrrogables (`vence`: sin contar sábados ni
--     domingos; los feriados NO se descuentan, así que la fecha sale antes o igual
--     que la legal: nunca después).
--   · Sin casillas de aceptación obligatoria en la hoja.
--   · Conservar las hojas: aquí no se borran (ni el dueño puede).
--
-- Dónde vive lo que se configura: tu_pagina.secciones
--   reclamos  boolean                              el apartado encendido
--   proveedor {razon_social, ruc, direccion}       lo que encabeza cada hoja
-- Cada hoja guarda una COPIA del proveedor: si cambia de dirección mañana, las
-- hojas de ayer siguen diciendo lo que decían.
--
-- Correos (Resend, lib/correo.ts): la web manda la copia al consumidor y el aviso
-- al dueño al crear la hoja, y la respuesta desde el panel. Aquí solo se anota
-- CUÁNDO salieron (copia_enviada_at, respuesta_enviada_at): es la constancia.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create table if not exists public.reclamos (
    id             uuid primary key default gen_random_uuid(),
    company_id     text not null references public.companies(id) on delete restrict,
    -- Correlativo por negocio: 1, 2, 3… Se enseña «N.º 000012-2026».
    numero         integer not null,
    creado_at      timestamptz not null default now(),
    tipo           text not null check (tipo in ('reclamo', 'queja')),
    proveedor      jsonb not null,
    consumidor     jsonb not null,
    bien           jsonb not null,
    detalle        text not null check (char_length(detalle) between 10 and 3000),
    pedido         text not null check (char_length(pedido) between 3 and 1500),
    vence          date not null,
    estado         text not null default 'pendiente' check (estado in ('pendiente', 'respondido')),
    respuesta      text check (respuesta is null or char_length(respuesta) <= 3000),
    respondido_at  timestamptz,
    copia_enviada_at      timestamptz,
    respuesta_enviada_at  timestamptz,
    idem           text not null,
    unique (company_id, numero),
    unique (company_id, idem)
);
create index if not exists reclamos_company_creado on public.reclamos (company_id, creado_at desc);

alter table public.reclamos enable row level security;
revoke all on public.reclamos from anon, authenticated;
grant select on public.reclamos to authenticated;

drop policy if exists reclamos_leer on public.reclamos;
create policy reclamos_leer on public.reclamos
    for select to authenticated using ((select public.puede(company_id, 'clientes.ver')));

-- La fecha + 15 días hábiles (lunes a viernes).
create or replace function public.reclamo_vence(p_desde date)
returns date language plpgsql immutable as $$
declare
    d date := p_desde;
    n integer := 0;
begin
    while n < 15 loop
        d := d + 1;
        if extract(isodow from d) < 6 then n := n + 1; end if;
    end loop;
    return d;
end $$;

-- El consumidor presenta su hoja desde la página. Devuelve el número, la fecha y hasta cuándo.
create or replace function public.reclamo_srv_crear(p_slug text, p_datos jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_pag   public.tu_pagina;
    v_fila  public.reclamos;
    v_prov  jsonb;
    v_cons  jsonb := coalesce(p_datos->'consumidor', '{}'::jsonb);
    v_bien  jsonb := coalesce(p_datos->'bien', '{}'::jsonb);
    v_hoy   date  := (now() at time zone 'America/Lima')::date;
    v_tel   text;
    v_doc   text;
begin
    perform public.loyalty_srv_check();
    select * into v_pag from public.tu_pagina where slug = lower(p_slug) and publicada;
    if not found or coalesce((v_pag.secciones->>'reclamos')::boolean, false) is not true then
        return jsonb_build_object('status', 'not_found');
    end if;
    v_prov := coalesce(v_pag.secciones->'proveedor', '{}'::jsonb);
    if coalesce(v_prov->>'razon_social', '') = '' or coalesce(v_prov->>'ruc', '') = '' then
        return jsonb_build_object('status', 'not_found');
    end if;

    select * into v_fila from public.reclamos where company_id = v_pag.company_id and idem = p_idem;
    if found then
        return jsonb_build_object('status', 'ok', 'numero', v_fila.numero, 'fecha', v_fila.creado_at, 'vence', v_fila.vence, 'repetido', true);
    end if;

    if p_datos->>'tipo' not in ('reclamo', 'queja') then return jsonb_build_object('status', 'datos_invalidos'); end if;
    if char_length(btrim(coalesce(v_cons->>'nombre', ''))) not between 3 and 120 then return jsonb_build_object('status', 'datos_invalidos'); end if;
    v_doc := upper(regexp_replace(coalesce(v_cons->>'num_doc', ''), '\s', '', 'g'));
    if v_cons->>'tipo_doc' not in ('DNI', 'CE', 'Pasaporte', 'RUC') or char_length(v_doc) not between 8 and 15 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if char_length(btrim(coalesce(v_cons->>'domicilio', ''))) not between 5 and 200 then return jsonb_build_object('status', 'datos_invalidos'); end if;
    v_tel := regexp_replace(coalesce(v_cons->>'telefono', ''), '\D', '', 'g');
    if char_length(v_tel) = 9 and v_tel like '9%' then v_tel := '51' || v_tel; end if;
    if v_tel !~ '^\d{8,15}$' then return jsonb_build_object('status', 'datos_invalidos'); end if;
    if coalesce(v_cons->>'email', '') <> '' and v_cons->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;
    if v_bien->>'tipo' not in ('producto', 'servicio') or char_length(btrim(coalesce(v_bien->>'descripcion', ''))) not between 2 and 300 then
        return jsonb_build_object('status', 'datos_invalidos');
    end if;

    -- Un mismo documento no llena el libro: 5 hojas al día como mucho.
    if (select count(*) from public.reclamos where company_id = v_pag.company_id
          and consumidor->>'num_doc' = v_doc and creado_at > now() - interval '1 day') >= 5 then
        return jsonb_build_object('status', 'demasiados');
    end if;

    -- El correlativo, de uno en uno por negocio.
    perform pg_advisory_xact_lock(hashtext('reclamos:' || v_pag.company_id));
    insert into public.reclamos (company_id, numero, tipo, proveedor, consumidor, bien, detalle, pedido, vence, idem)
    values (
        v_pag.company_id,
        coalesce((select max(numero) from public.reclamos where company_id = v_pag.company_id), 0) + 1,
        p_datos->>'tipo',
        jsonb_build_object('razon_social', v_prov->>'razon_social', 'ruc', v_prov->>'ruc',
                           'direccion', coalesce(v_prov->>'direccion', ''), 'nombre_comercial', v_pag.titulo),
        jsonb_build_object(
            'nombre', btrim(v_cons->>'nombre'), 'tipo_doc', v_cons->>'tipo_doc', 'num_doc', v_doc,
            'domicilio', btrim(v_cons->>'domicilio'), 'telefono', v_tel, 'email', btrim(coalesce(v_cons->>'email', '')),
            'menor', coalesce((v_cons->>'menor')::boolean, false), 'apoderado', btrim(coalesce(v_cons->>'apoderado', ''))),
        jsonb_build_object(
            'tipo', v_bien->>'tipo', 'descripcion', btrim(v_bien->>'descripcion'),
            'monto', nullif(v_bien->>'monto', '')::numeric),
        btrim(p_datos->>'detalle'),
        btrim(p_datos->>'pedido'),
        public.reclamo_vence(v_hoy),
        p_idem)
    returning * into v_fila;

    -- A quién avisar: dueños y administradores del negocio. Solo lo ve el servidor (clave srv).
    return jsonb_build_object('status', 'ok', 'numero', v_fila.numero, 'fecha', v_fila.creado_at, 'vence', v_fila.vence,
        'avisar', coalesce((
            select jsonb_agg(distinct u.email)
              from public.memberships m join auth.users u on u.id::text = m.auth_user_id
             where m.company_id = v_pag.company_id and m.role in ('owner', 'admin') and coalesce(u.email, '') <> ''), '[]'::jsonb));
exception
    when invalid_text_representation or numeric_value_out_of_range or check_violation then
        return jsonb_build_object('status', 'datos_invalidos');
end $$;

-- El negocio deja constancia de su respuesta (la comunica él por correo o WhatsApp).
create or replace function public.reclamos_responder(p_company text, p_id uuid, p_respuesta text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    if char_length(btrim(coalesce(p_respuesta, ''))) < 5 then raise exception 'tu_pagina:respuesta_corta'; end if;
    update public.reclamos
       set respuesta = btrim(p_respuesta), estado = 'respondido', respondido_at = coalesce(respondido_at, now())
     where id = p_id and company_id = p_company;
    if not found then raise exception 'tu_pagina:no_existe'; end if;
    return jsonb_build_object('status', 'ok');
end $$;

-- La copia al consumidor salió (la anota el servidor tras enviarla).
create or replace function public.reclamo_srv_copia_enviada(p_slug text, p_idem text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    update public.reclamos r set copia_enviada_at = coalesce(r.copia_enviada_at, now())
      from public.tu_pagina p
     where p.slug = lower(p_slug) and r.company_id = p.company_id and r.idem = p_idem;
end $$;

-- La respuesta salió por correo desde el panel: constancia de la comunicación.
create or replace function public.reclamos_respuesta_enviada(p_company text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.tu_pagina_autorizar(p_company);
    update public.reclamos set respuesta_enviada_at = now()
     where id = p_id and company_id = p_company and estado = 'respondido';
end $$;

revoke execute on function public.reclamo_vence(date) from public, anon, authenticated;
revoke execute on function public.reclamo_srv_copia_enviada(text, text) from public, authenticated;
grant  execute on function public.reclamo_srv_copia_enviada(text, text) to anon;
revoke execute on function public.reclamos_respuesta_enviada(text, uuid) from public, anon;
grant  execute on function public.reclamos_respuesta_enviada(text, uuid) to authenticated;
revoke execute on function public.reclamos_responder(text, uuid, text) from public, anon;
grant  execute on function public.reclamos_responder(text, uuid, text) to authenticated;
revoke execute on function public.reclamo_srv_crear(text, jsonb, text) from public, authenticated;
grant  execute on function public.reclamo_srv_crear(text, jsonb, text) to anon;

commit;
