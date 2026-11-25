-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA LECTOR · 0002 · Cada Yape a su cita, solo
--
-- 24-nov-2026, Alvaro: «tenemos que hacer que lo relacione», en automático si es seguro, para la
-- reserva online y para las citas que suben los barberos («se confirma automático, es lo que le dije
-- al dueño»). Nunca contra lo que se cobra en la Caja.
--
-- Contra qué se compara (solo lo pendiente de cobro):
--   · ESPERA   el cliente tocó «Ya yapeé» en la página (lector_srv_ya_pague). Cuenta lo que llegó
--              desde 10 min ANTES de tocarlo (pudo pagar primero) hasta 30 min después.
--   · COTEJO   comprobante que la IA dio por bueno y nadie ha cotejado: el Yape lo confirma
--              («Llegó») sin sumar otro pago.
--   · REVISAR  comprobante por revisar a mano: el Yape lo aprueba.
--   · APARTADA reserva online esperando el adelanto, sin «Ya yapeé» ni captura.
--   · BARBERO  cita de hoy, confirmada o atendida, sin cobrar: desde 1 h antes de su hora hasta 4 h
--              después de terminar.
--
-- Cómo decide (investigación del 24-nov: el nombre ordena, no decide; lo ambiguo nunca se acepta
-- en silencio; los pagos en partes solo si cuadran sin dudas):
--   · Monto EXACTO = lo que falta, lo que falta del adelanto o lo del comprobante.
--   · Un solo candidato exacto → se aplica. Varios → gana el que el NOMBRE (o un familiar aprendido)
--     señala con ventaja clara (75 %+ y 40 puntos sobre el segundo); quien tocó «Ya yapeé» o subió su
--     captura va antes que quien no dijo nada. Si no, queda «por asignar» y el dueño elige con un toque.
--   · Tantos Yape de ese monto (en la misma hora) como citas lo esperan → todas cobradas, en orden.
--   · Monto MENOR (pago en partes) → solo si el nombre señala a un único candidato: «a cuenta».
--   · Aplicar = v2_comprobante_aplicar, lo mismo que aprobar un comprobante: confirma la reserva si
--     llega al adelanto, la cobra si llega al total (pagado_por = 'lector') o la deja a cuenta.
--   · «No era de esta cita» (lector_desasignar) lo deshace y esa cita ya no se le vuelve a proponer.
--   · Si el dueño elige a mano, aprende: ese pagador cuenta como ese cliente la próxima vez.
--
-- APLICAR después de la 0001. Requiere tu-pagina 0021 (v2_comprobante_aplicar, v2_comprobante_cita),
-- 0029 (appointments.beneficiario) y 0032 (cotejo). Pruebas: tests/pruebas_0002_pglite.mjs.
-- Deshacer: 0002_emparejar_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · Lo que se guarda ────────────────────────────────────────────────────
alter table public.lector_avisos add column if not exists cita_id     text;
alter table public.lector_avisos add column if not exists asignado    text not null default '';
alter table public.lector_avisos add column if not exists asignado_at timestamptz;
alter table public.lector_avisos add column if not exists como        text not null default '';
alter table public.lector_avisos add column if not exists antes       jsonb;
alter table public.lector_avisos add column if not exists dudoso      jsonb;
alter table public.lector_avisos add column if not exists descartes   text[] not null default '{}';
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'lector_avisos_asignado_chk') then
        alter table public.lector_avisos add constraint lector_avisos_asignado_chk check (asignado in ('', 'auto', 'panel'));
    end if;
end $$;
create index if not exists ix_lector_avisos_libres on public.lector_avisos (company_id, cuando) where asignado = '' and centimos is not null;

-- «Ya yapeé» en la página.
create table if not exists public.lector_esperas (
    id             uuid primary key default gen_random_uuid(),
    company_id     text not null references public.companies(id) on delete cascade,
    appointment_id text not null,
    desde          timestamptz not null default now() - interval '10 minutes',
    hasta          timestamptz not null default now() + interval '30 minutes',
    aviso_id       bigint,
    creado_at      timestamptz not null default now()
);
create index if not exists ix_lector_esperas on public.lector_esperas (company_id, hasta) where aviso_id is null;

-- Familiares que pagan por otro: «MARIA TORRES» paga lo de Diego Ramos.
create table if not exists public.lector_alias (
    company_id text not null references public.companies(id) on delete cascade,
    pagador    text not null,
    lead_id    text not null,
    veces      int not null default 1,
    ultimo_at  timestamptz not null default now(),
    primary key (company_id, pagador, lead_id)
);

alter table public.lector_esperas enable row level security;
alter table public.lector_alias enable row level security;
revoke all on public.lector_esperas, public.lector_alias from anon, authenticated;

-- ── 2 · Nombres ─────────────────────────────────────────────────────────────
-- Una palabra en su forma «como suena»: sin tildes, b=v, s=z=c(e/i), y=ll, k=qu=c(a/o/u), sin h.
create or replace function public.lector_suena(p text)
returns text language sql immutable as $$
    -- «ch» se guarda como x antes de quitar las h; al final vuelve a ser ch.
    select replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'),
           'ch', 'x', 'g'), 'h', '', 'g'), 'll', 'y', 'g'), 'v', 'b', 'g'), 'z', 's', 'g'), 'c([ei])', 's\1', 'g'), 'qu', 'k', 'g'), 'c', 'k', 'g'),
           'x', 'ch');
$$;

-- Las palabras de un nombre, sin partículas.
create or replace function public.lector_palabras(p text)
returns text[] language sql immutable as $$
    select coalesce(array_agg(public.lector_suena(w)) filter (where w <> '' and w not in ('de', 'del', 'la', 'las', 'los', 'y', 'san', 'e')), '{}')
      from regexp_split_to_table(regexp_replace(translate(lower(coalesce(p, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z ]', ' ', 'g'), '\s+') w;
$$;

-- ¿Cuánto del nombre del cliente aparece en el del que pagó? 0..1, sin importar el orden.
-- Igual = 1; una empieza con la otra (Yape recorta: «Alv», «Pel») = 1 si tiene 3+ letras;
-- una inicial («F.») = 0,5. null si el cliente no tiene nombre.
create or replace function public.lector_parecido(p_pagador text, p_cliente text)
returns numeric language plpgsql immutable as $$
declare
    v_pag text[] := public.lector_palabras(p_pagador);
    v_cli text[] := public.lector_palabras(p_cliente);
    w text; x text; v_mejor numeric; v_suma numeric := 0;
begin
    if coalesce(array_length(v_cli, 1), 0) = 0 or coalesce(array_length(v_pag, 1), 0) = 0 then return null; end if;
    foreach w in array v_cli loop
        v_mejor := 0;
        foreach x in array v_pag loop
            if x = w then v_mejor := 1;
            elsif least(length(x), length(w)) >= 3 and (x like w || '%' or w like x || '%') then v_mejor := greatest(v_mejor, 1);
            elsif least(length(x), length(w)) = 1 and left(x, 1) = left(w, 1) then v_mejor := greatest(v_mejor, 0.5);
            end if;
        end loop;
        v_suma := v_suma + v_mejor;
    end loop;
    return round(v_suma / array_length(v_cli, 1), 2);
end $$;

-- La clave del pagador para recordar familiares: sus palabras, en orden.
create or replace function public.lector_clave_pagador(p text)
returns text language sql immutable as $$
    select array_to_string(array(select unnest(public.lector_palabras(p)) order by 1), ' ');
$$;

-- ── 3 · Candidatos de un aviso ──────────────────────────────────────────────
-- Una fila por cita posible. `exacto`: el monto cuadra; `nombre`: 0..1 (1 si es un familiar aprendido).
create or replace function public.lector_candidatos(p_aviso public.lector_avisos)
returns table (cita_id text, como text, exacto boolean, nombre numeric, cerca numeric, falta numeric,
               comprobante uuid, espera uuid, cliente text, servicio text, slot text)
language plpgsql stable security definer set search_path = public as $$
declare
    v_monto numeric := p_aviso.centimos / 100.0;
    v_dia   text := to_char(p_aviso.cuando at time zone 'America/Lima', 'YYYY-MM-DD');
    v_clave text := public.lector_clave_pagador(p_aviso.nombre);
begin
    return query
    with base as (
        select a.*, l.name as lead_nombre,
               (select coalesce(sum(s.price), 0)::numeric from public.appointment_services s where s.appointment_id = a.id) as total,
               (select coalesce(sum(p.amount), 0)::numeric from public.pending_payments p where p.company_id = a.company_id and p.appointment_id = a.id) as pagado
          from public.appointments a
          left join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
         where a.company_id = p_aviso.company_id
           and a.status in ('pending_payment', 'confirmed', 'completed')
           and a.slot_start not like 'sched:%'
           and not (a.id = any (p_aviso.descartes))
    ),
    pos as (
        -- ESPERA: tocó «Ya yapeé».
        select b.id, 'espera'::text as como, b.total - b.pagado as falta,
               greatest(public.v2_adelanto_minimo(b.company_id, b.total) - b.pagado, 0) as falta_adelanto,
               null::numeric as monto_comprobante, null::uuid as comprobante, e.id as espera, 1.0::numeric as cerca, b.lead_id,
               b.lead_nombre, coalesce(b.beneficiario, '') as beneficiario, b.service, b.slot_start
          from public.lector_esperas e join base b on b.id = e.appointment_id
         where e.company_id = p_aviso.company_id and e.aviso_id is null
           and p_aviso.cuando between e.desde and e.hasta and coalesce(b.pagado_por, '') = ''
        union all
        -- COTEJO: comprobante validado por la IA sin cotejar. El pago ya está: el Yape solo lo confirma.
        select b.id, 'cotejo', c.monto, null, c.monto, c.id, null, 1.0, b.lead_id, b.lead_nombre, coalesce(b.beneficiario, ''), b.service, b.slot_start
          from public.comprobantes_web c join base b on b.id = c.appointment_id
         where c.company_id = p_aviso.company_id and c.estado = 'aprobado' and c.revisado_por = 'automatico' and c.cotejo = ''
           and c.monto is not null and p_aviso.cuando between c.creado_at - interval '3 hours' and c.creado_at + interval '30 minutes'
        union all
        -- REVISAR: comprobante esperando a una persona.
        select b.id, 'revisar', b.total - b.pagado, greatest(public.v2_adelanto_minimo(b.company_id, b.total) - b.pagado, 0),
               c.monto, c.id, null, 1.0, b.lead_id, b.lead_nombre, coalesce(b.beneficiario, ''), b.service, b.slot_start
          from public.comprobantes_web c join base b on b.id = c.appointment_id
         where c.company_id = p_aviso.company_id and c.estado = 'revisar'
           and p_aviso.cuando between c.creado_at - interval '3 hours' and c.creado_at + interval '30 minutes'
        union all
        -- APARTADA: reserva online esperando el adelanto, sin espera ni captura.
        select b.id, 'apartada', b.total - b.pagado, greatest(public.v2_adelanto_minimo(b.company_id, b.total) - b.pagado, 0),
               null, null, null, 0.5, b.lead_id, b.lead_nombre, coalesce(b.beneficiario, ''), b.service, b.slot_start
          from base b
         where b.status = 'pending_payment'
           and b.slot_start >= to_char((p_aviso.cuando - interval '2 hours') at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI')
           and not exists (select 1 from public.comprobantes_web c where c.appointment_id = b.id and c.company_id = b.company_id and c.estado in ('revisar', 'aprobado'))
           and not exists (select 1 from public.lector_esperas e where e.appointment_id = b.id and e.company_id = b.company_id and e.aviso_id is null)
        union all
        -- BARBERO: cita de ese día, confirmada o atendida, sin cobrar. Más cerca cuanto más cerca del final.
        select b.id, 'barbero', b.total - b.pagado, null, null, null, null,
               case when p_aviso.cuando between f.fin - interval '30 minutes' and f.fin + interval '90 minutes' then 1.0 else 0.6 end,
               b.lead_id, b.lead_nombre, coalesce(b.beneficiario, ''), b.service, b.slot_start
          from base b
         cross join lateral (select (to_timestamp(b.slot_start, 'YYYY-MM-DD HH24:MI')::timestamp at time zone 'America/Lima') as ini,
                                    (to_timestamp(coalesce(nullif(b.slot_end, ''), b.slot_start), 'YYYY-MM-DD HH24:MI')::timestamp at time zone 'America/Lima') as fin) f
         where b.status in ('confirmed', 'completed') and coalesce(b.pagado_por, '') = '' and b.total > b.pagado
           and left(b.slot_start, 10) = v_dia
           and p_aviso.cuando between f.ini - interval '1 hour' and f.fin + interval '4 hours'
           and not exists (select 1 from public.lector_esperas e where e.appointment_id = b.id and e.company_id = b.company_id and e.aviso_id is null)
           and not exists (select 1 from public.comprobantes_web c where c.appointment_id = b.id and c.company_id = b.company_id
                            and (c.estado = 'revisar' or (c.estado = 'aprobado' and c.cotejo = '')))
    )
    select distinct on (p.id)
           p.id, p.como,
           (v_monto = p.monto_comprobante or v_monto = p.falta or (p.falta_adelanto > 0 and v_monto = p.falta_adelanto)),
           case when exists (select 1 from public.lector_alias al where al.company_id = p_aviso.company_id
                              and al.pagador = v_clave and al.lead_id = p.lead_id) then 1.0
                else coalesce(greatest(public.lector_parecido(p_aviso.nombre, p.lead_nombre),
                                       public.lector_parecido(p_aviso.nombre, p.beneficiario)), 0) end,
           p.cerca, p.falta, p.comprobante, p.espera,
           coalesce(nullif(p.beneficiario, ''), p.lead_nombre, ''), p.service, p.slot_start
      from pos p
     where p.falta > 0 or p.como = 'cotejo'
     -- Si una cita sale por varias vías, gana la más concreta.
     order by p.id, array_position(array['cotejo', 'revisar', 'espera', 'apartada', 'barbero'], p.como);
end $$;
revoke execute on function public.lector_candidatos(public.lector_avisos) from public, anon, authenticated;

-- ── 4 · Aplicar un aviso a una cita ─────────────────────────────────────────
create or replace function public.lector_aplicar(p_aviso_id bigint, p_cita text, p_como text, p_comprobante uuid,
                                                 p_espera uuid, p_quien text)
returns text language plpgsql security definer set search_path = public as $$
declare
    v_av    public.lector_avisos;
    v_cita  public.appointments;
    v_comp  public.comprobantes_web;
    v_monto numeric;
    v_met   text;
    v_r     jsonb;
begin
    select * into v_av from public.lector_avisos where id = p_aviso_id for update;
    if not found or v_av.asignado <> '' or v_av.centimos is null then return 'ya'; end if;
    select * into v_cita from public.appointments where id = p_cita and company_id = v_av.company_id for update;
    if not found then return 'sin_cita'; end if;
    v_monto := v_av.centimos / 100.0;
    v_met := case when lower(v_av.origen) = 'yape' then 'yape' when lower(v_av.origen) like '%plin%' then 'plin' else 'bank_transfer' end;

    if p_como = 'cotejo' then
        update public.comprobantes_web set cotejo = 'llego', cotejado_at = now()
         where id = p_comprobante and company_id = v_av.company_id and cotejo = '';
        v_r := jsonb_build_object('resultado', 'cotejado');
    else
        if p_comprobante is not null then select * into v_comp from public.comprobantes_web where id = p_comprobante; end if;
        v_r := public.v2_comprobante_aplicar(v_cita, v_monto, v_met, 'lector:' || v_av.id,
                                            coalesce(v_comp.image_hash, ''), coalesce(v_comp.url, ''), 'lector');
        if v_r->>'resultado' = 'sin_sitio' then return 'sin_sitio'; end if;
        if p_comprobante is not null then
            update public.comprobantes_web
               set estado = 'aprobado', revisado_por = 'lector', revisado_at = now(), cotejo = 'llego', cotejado_at = now(),
                   monto = coalesce(monto, v_monto), motivo = 'Confirmado con el aviso de pago del celular de cobros.'
             where id = p_comprobante and estado = 'revisar';
        end if;
    end if;

    update public.lector_avisos
       set cita_id = p_cita, asignado = p_quien, asignado_at = now(), como = p_como, dudoso = null,
           antes = jsonb_build_object('status', v_cita.status, 'pagado_por', coalesce(v_cita.pagado_por, ''),
                                      'created_at', v_cita.created_at, 'metodo_pago', v_cita.metodo_pago,
                                      'comprobante', p_comprobante, 'resultado', v_r->>'resultado')
     where id = v_av.id;
    if p_espera is not null then update public.lector_esperas set aviso_id = v_av.id where id = p_espera; end if;
    update public.lector_esperas set aviso_id = v_av.id where appointment_id = p_cita and company_id = v_av.company_id and aviso_id is null;
    return coalesce(v_r->>'resultado', 'ok');
end $$;
revoke execute on function public.lector_aplicar(bigint, text, text, uuid, uuid, text) from public, anon, authenticated;

-- ── 5 · Emparejar lo libre de un negocio ────────────────────────────────────
-- Recorre por orden de llegada los avisos con monto, sin asignar, de las últimas 36 h. Devuelve
-- cuántos asignó. Lo llaman: lector_srv_recibir (al llegar un aviso), «Ya yapeé» y el disparador de
-- citas (cuando el barbero marca o cambia una cita).
create or replace function public.lector_emparejar(p_company text)
returns int language plpgsql security definer set search_path = public as $$
declare
    v_av    public.lector_avisos;
    v_cands record;
    v_n     int := 0;
    v_exac  int;
    v_res   text;
    -- La cita elegida (texto: una variable record vacía no se puede leer).
    e_cita  text; e_como text; e_comp uuid; e_esp uuid;
    b_nom numeric; s_nom numeric;
begin
    -- Un negocio a la vez: dos avisos casi juntos no se pisan.
    perform pg_advisory_xact_lock(hashtext('lector:' || p_company));
    perform set_config('lector.emparejando', '1', true);
    for v_av in
        select * from public.lector_avisos
         where company_id = p_company and asignado = '' and centimos is not null
           and cuando > now() - interval '36 hours'
         order by cuando, id
    loop
        e_cita := null; e_como := null; e_comp := null; e_esp := null;
        create temp table if not exists lector_tmp_c (cita_id text, como text, exacto boolean, nombre numeric, cerca numeric,
            falta numeric, comprobante uuid, espera uuid, cliente text, servicio text, slot text) on commit drop;
        truncate lector_tmp_c;
        insert into lector_tmp_c select * from public.lector_candidatos(v_av);

        select count(*) into v_exac from lector_tmp_c where exacto;
        -- Quien DIJO que pagó («Ya yapeé» o subió su captura) va primero que quien no dijo nada.
        if (select count(*) from lector_tmp_c where exacto and como in ('espera', 'cotejo', 'revisar')) = 1 then
            select t.cita_id, t.como, t.comprobante, t.espera into e_cita, e_como, e_comp, e_esp
              from lector_tmp_c t where t.exacto and t.como in ('espera', 'cotejo', 'revisar');
        elsif v_exac = 1 then
            select t.cita_id, t.como, t.comprobante, t.espera into e_cita, e_como, e_comp, e_esp from lector_tmp_c t where t.exacto;
        elsif v_exac > 1 then
            -- Varios con el mismo monto: el nombre tiene que señalar a UNO sin dudas.
            select t.nombre into b_nom from lector_tmp_c t where t.exacto order by t.nombre desc, t.cerca desc limit 1;
            select t.nombre into s_nom from lector_tmp_c t where t.exacto order by t.nombre desc, t.cerca desc offset 1 limit 1;
            -- Ventaja clara: «DIEGO PAREDES QUISPE» es Diego Paredes (1) aunque Luis Quispe comparta apellido (0,5).
            if b_nom >= 0.75 and b_nom - s_nom >= 0.4 then
                select t.cita_id, t.como, t.comprobante, t.espera into e_cita, e_como, e_comp, e_esp
                  from lector_tmp_c t where t.exacto order by t.nombre desc, t.cerca desc limit 1;
            -- Alvaro (24-nov): «si hay dos citas de 1 y me llegan dos Yape de 1, cuadran». Si llegaron
            -- (en la misma hora) tantos Yape de ese monto como citas lo esperan, todas quedan cobradas y da
            -- igual cuál va con cuál: se asigna por nombre y, sin nombre, por orden.
            elsif (select count(*) from public.lector_avisos x
                    where x.company_id = p_company and x.asignado = '' and x.centimos = v_av.centimos
                      and x.cuando between v_av.cuando - interval '1 hour' and v_av.cuando + interval '1 hour') >= v_exac then
                select t.cita_id, t.como, t.comprobante, t.espera into e_cita, e_como, e_comp, e_esp
                  from lector_tmp_c t where t.exacto order by t.nombre desc, t.cerca desc, t.slot, t.cita_id limit 1;
            end if;
        else
            -- Pago en partes: solo si el nombre señala a un único candidato.
            if (select count(*) from lector_tmp_c where nombre >= 0.75) = 1 then
                select t.cita_id, t.como, t.comprobante, t.espera into e_cita, e_como, e_comp, e_esp
                  from lector_tmp_c t where t.nombre >= 0.75;
            end if;
        end if;

        if e_cita is not null then
            v_res := public.lector_aplicar(v_av.id, e_cita, e_como, e_comp, e_esp, 'auto');
            if v_res not in ('ya', 'sin_cita', 'sin_sitio') then v_n := v_n + 1; continue; end if;
        end if;

        -- Sin asignar: se guardan las opciones para el dueño (exactas, o con algo de nombre).
        update public.lector_avisos
           set dudoso = (select jsonb_agg(jsonb_build_object('cita_id', t.cita_id, 'cliente', t.cliente, 'servicio', t.servicio,
                                                             'slot', t.slot, 'falta', t.falta, 'exacto', t.exacto, 'nombre', t.nombre)
                                          order by t.exacto desc, t.nombre desc, t.cerca desc)
                           from lector_tmp_c t where t.exacto or t.nombre >= 0.5)
         where id = v_av.id;
    end loop;
    -- Fuera la marca: la siguiente línea o cita de esta misma transacción vuelve a mirar.
    perform set_config('lector.emparejando', '', true);
    return v_n;
end $$;
revoke execute on function public.lector_emparejar(text) from public, anon, authenticated;

-- ── 6 · Al llegar un aviso: primero se empareja, luego el push dice a qué cita fue ─
create or replace function public.lector_srv_recibir(p_dispositivo uuid, p_tipo text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_disp public.lector_dispositivos%rowtype;
    v_id bigint;
    v_cuando timestamptz;
    v_centimos bigint;
    v_codigo text;
    v_av public.lector_avisos;
    v_cliente text;
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
    if v_centimos is not null then
        -- Un fallo al emparejar no puede perder el aviso: queda libre y se ve en el panel.
        begin
            perform public.lector_emparejar(v_disp.company_id);
        exception when others then
            raise warning 'lector_emparejar: %', sqlerrm;
        end;
        select * into v_av from public.lector_avisos where id = v_id;
        if v_av.cita_id is not null then
            select coalesce(nullif(a.beneficiario, ''), l.name, '') into v_cliente
              from public.appointments a left join public.leads l on l.id = a.lead_id and l.company_id = a.company_id
             where a.id = v_av.cita_id and a.company_id = v_av.company_id;
        end if;
        perform public.avisos_apuntar(v_disp.company_id, 'pago', 'lector:' || v_id,
            jsonb_build_object('clase', 'lector', 'monto', v_centimos / 100.0, 'nombre', left(coalesce(p_datos->>'nombre', ''), 60),
                               'origen', left(coalesce(nullif(p_datos->>'origen', ''), 'Yape'), 60), 'cuando', v_cuando,
                               'cita', v_av.cita_id, 'cliente_cita', v_cliente, 'resultado', v_av.antes->>'resultado',
                               -- Sin «¿de qué cita es?»: una duda suele resolverse sola en un minuto (otro Yape igual).
                               'dudoso', false),
            v_cuando);
    end if;
    return jsonb_build_object('nuevo', true);
end $$;
revoke execute on function public.lector_srv_recibir(uuid, text, jsonb) from public, authenticated;
grant execute on function public.lector_srv_recibir(uuid, text, jsonb) to anon;

-- ── 7 · Cuando el barbero marca una cita, se vuelve a mirar lo libre ─────────
-- El cliente pudo yapear ANTES de que el barbero apuntara «Ya lo atendí».
create or replace function public.lector_tg_cita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if coalesce(current_setting('lector.emparejando', true), '') = '1' then return null; end if;
    if new.status in ('confirmed', 'completed', 'pending_payment') and coalesce(new.pagado_por, '') = ''
       and exists (select 1 from public.lector_dispositivos d where d.company_id = new.company_id and d.revocado_at is null)
       and exists (select 1 from public.lector_avisos a where a.company_id = new.company_id and a.asignado = ''
                    and a.centimos is not null and a.cuando > now() - interval '36 hours') then
        begin
            perform public.lector_emparejar(new.company_id);
        exception when others then
            raise warning 'lector_tg_cita: %', sqlerrm;   -- nunca tumba el guardado de la cita
        end;
    end if;
    return null;
end $$;
drop trigger if exists lector_cita on public.appointments;
create trigger lector_cita after insert or update of status, pagado_por, slot_start, slot_end on public.appointments
    for each row execute function public.lector_tg_cita();
-- Las líneas (precio) se guardan después de la cita: también disparan.
create or replace function public.lector_tg_lineas() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_co text;
begin
    if coalesce(current_setting('lector.emparejando', true), '') = '1' then return null; end if;
    select company_id into v_co from public.appointments where id = new.appointment_id;
    if v_co is not null
       and exists (select 1 from public.lector_dispositivos d where d.company_id = v_co and d.revocado_at is null)
       and exists (select 1 from public.lector_avisos a where a.company_id = v_co and a.asignado = ''
                    and a.centimos is not null and a.cuando > now() - interval '36 hours') then
        begin
            perform public.lector_emparejar(v_co);
        exception when others then
            raise warning 'lector_tg_lineas: %', sqlerrm;
        end;
    end if;
    return null;
end $$;
drop trigger if exists lector_lineas on public.appointment_services;
create trigger lector_lineas after insert on public.appointment_services
    for each row execute function public.lector_tg_lineas();

-- ── 8 · La página: «Ya yapeé» ───────────────────────────────────────────────
-- ¿Este negocio tiene el celular de cobros conectado? Si no, la página pide la captura como siempre.
create or replace function public.lector_srv_activo(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.tu_pagina t join public.lector_dispositivos d on d.company_id = t.company_id
                    where t.slug = lower(p_slug) and t.publicada and d.revocado_at is null);
$$;
revoke execute on function public.lector_srv_activo(text) from public, authenticated;
grant execute on function public.lector_srv_activo(text) to anon;

-- Idempotente: la página lo llama al tocar «Ya yapeé» y luego cada pocos segundos.
-- {estado: 'confirmada' | 'cobrada' | 'esperando' | 'sin_lector' | 'no_encontrada', pagado, total}
create or replace function public.lector_srv_ya_pague(p_slug text, p_codigo text, p_telefono text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cita  public.appointments;
    v_total numeric;
    v_pag   numeric;
begin
    perform public.loyalty_srv_check();
    v_cita := public.v2_comprobante_cita(p_slug, p_codigo, p_telefono);
    if v_cita.id is null then return jsonb_build_object('estado', 'no_encontrada'); end if;
    if not public.lector_srv_activo(p_slug) then return jsonb_build_object('estado', 'sin_lector'); end if;
    if v_cita.status = 'pending_payment' or coalesce(v_cita.pagado_por, '') = '' then
        if not exists (select 1 from public.lector_esperas where appointment_id = v_cita.id and company_id = v_cita.company_id
                        and (aviso_id is not null or hasta > now())) then
            insert into public.lector_esperas (company_id, appointment_id) values (v_cita.company_id, v_cita.id);
        end if;
        perform public.lector_emparejar(v_cita.company_id);
        select * into v_cita from public.appointments where id = v_cita.id;
    end if;
    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pag from public.pending_payments p where p.company_id = v_cita.company_id and p.appointment_id = v_cita.id;
    return jsonb_build_object(
        'estado', case when coalesce(v_cita.pagado_por, '') <> '' then 'cobrada'
                       when v_cita.status = 'pending_payment' then 'esperando'
                       when exists (select 1 from public.lector_avisos a where a.cita_id = v_cita.id and a.company_id = v_cita.company_id) then 'confirmada'
                       else 'esperando' end,
        'pagado', v_pag, 'total', v_total);
end $$;
revoke execute on function public.lector_srv_ya_pague(text, text, text) from public, authenticated;
grant execute on function public.lector_srv_ya_pague(text, text, text) to anon;

-- ── 9 · Panel: lo que quedó por asignar, elegir y deshacer ──────────────────
create or replace function public.lector_por_asignar(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if not public.lector_puede(p_company) then
        raise exception 'No tienes acceso a los pagos de este negocio.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object('id', a.id, 'centimos', a.centimos, 'nombre', a.nombre, 'origen', a.origen,
                                            'cuando', a.cuando, 'opciones', a.dudoso) order by a.cuando desc)
          from public.lector_avisos a
         where a.company_id = p_company and a.asignado = '' and a.dudoso is not null
           and jsonb_array_length(a.dudoso) > 0 and a.cuando > now() - interval '36 hours'
           -- 3 min de gracia: el segundo Yape del mismo monto suele llegar enseguida y lo resuelve solo.
           and a.recibido_at < now() - interval '3 minutes'), '[]'::jsonb);
end $$;
revoke execute on function public.lector_por_asignar(text) from public, anon;
grant execute on function public.lector_por_asignar(text) to authenticated;

-- El dueño elige la cita. Aprende: ese pagador cuenta como ese cliente la próxima vez.
create or replace function public.lector_asignar(p_company text, p_aviso bigint, p_cita text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_av  public.lector_avisos;
    v_c   record;
    v_res text;
    v_lead text;
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador asignan pagos.' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtext('lector:' || p_company));
    perform set_config('lector.emparejando', '1', true);
    select * into v_av from public.lector_avisos where id = p_aviso and company_id = p_company;
    if not found then raise exception 'Ese pago no es de este negocio.'; end if;
    if v_av.asignado <> '' then raise exception 'Ese pago ya está asignado.'; end if;
    select * into v_c from public.lector_candidatos(v_av) c where c.cita_id = p_cita;
    if v_c.cita_id is null then
        -- Fuera de la lista (otra hora, otro día): se aplica como un pago a la cita.
        v_res := public.lector_aplicar(p_aviso, p_cita, 'barbero', null, null, 'panel');
    else
        v_res := public.lector_aplicar(p_aviso, p_cita, v_c.como, v_c.comprobante, v_c.espera, 'panel');
    end if;
    if v_res = 'sin_cita' then raise exception 'Esa cita no es de este negocio.'; end if;
    if v_res = 'sin_sitio' then raise exception 'Esa reserva ya no tiene sitio a esa hora: muévela y vuelve a asignar.'; end if;
    select lead_id into v_lead from public.appointments where id = p_cita and company_id = p_company;
    if coalesce(v_lead, '') <> '' and public.lector_clave_pagador(v_av.nombre) <> '' then
        insert into public.lector_alias (company_id, pagador, lead_id)
        values (p_company, public.lector_clave_pagador(v_av.nombre), v_lead)
        on conflict (company_id, pagador, lead_id) do update set veces = lector_alias.veces + 1, ultimo_at = now();
    end if;
    return jsonb_build_object('resultado', v_res);
end $$;
revoke execute on function public.lector_asignar(text, bigint, text) from public, anon;
grant execute on function public.lector_asignar(text, bigint, text) to authenticated;

-- «No era de esta cita»: quita el pago, devuelve la cita a como estaba y no se la vuelve a proponer.
create or replace function public.lector_desasignar(p_company text, p_aviso bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_av public.lector_avisos;
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador deshacen pagos.' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtext('lector:' || p_company));
    perform set_config('lector.emparejando', '1', true);
    select * into v_av from public.lector_avisos where id = p_aviso and company_id = p_company for update;
    if not found or v_av.asignado = '' then raise exception 'Ese pago no está asignado a ninguna cita.'; end if;

    if v_av.como = 'cotejo' then
        update public.comprobantes_web set cotejo = '', cotejado_at = null
         where id = (v_av.antes->>'comprobante')::uuid and cotejo = 'llego';
    else
        delete from public.pending_payments where company_id = p_company and operation_id = 'lector:' || v_av.id;
        update public.appointments
           set status = coalesce(v_av.antes->>'status', status),
               pagado_por = case when pagado_por = 'lector' then coalesce(v_av.antes->>'pagado_por', '') else pagado_por end,
               created_at = coalesce((v_av.antes->>'created_at')::bigint, created_at),
               metodo_pago = coalesce(v_av.antes->>'metodo_pago', metodo_pago)
         where id = v_av.cita_id and company_id = p_company;
        if v_av.antes->>'comprobante' is not null then
            update public.comprobantes_web set estado = 'revisar', revisado_por = '', revisado_at = null, cotejo = '', cotejado_at = null
             where id = (v_av.antes->>'comprobante')::uuid and revisado_por = 'lector';
        end if;
    end if;
    update public.lector_esperas set aviso_id = null where aviso_id = v_av.id;
    update public.lector_avisos
       set descartes = array_append(descartes, cita_id), cita_id = null, asignado = '', asignado_at = null,
           como = '', antes = null, dudoso = null
     where id = v_av.id;
    return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.lector_desasignar(text, bigint) from public, anon;
grant execute on function public.lector_desasignar(text, bigint) to authenticated;

-- El estado del panel ahora dice a qué cita fue cada pago.
create or replace function public.lector_estado(p_company text, p_desde timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
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
                    'origen', a.origen, 'generico', a.generico, 'recuperado', a.recuperado, 'cuando', a.cuando,
                    'cita_id', a.cita_id, 'asignado', a.asignado, 'resultado', a.antes->>'resultado',
                    'por_asignar', a.asignado = '' and a.dudoso is not null and jsonb_array_length(a.dudoso) > 0,
                    'cliente', (select coalesce(nullif(c.beneficiario, ''), l.name, '') from public.appointments c
                                  left join public.leads l on l.id = c.lead_id and l.company_id = c.company_id
                                 where c.id = a.cita_id and c.company_id = a.company_id),
                    'servicio', (select c.service from public.appointments c where c.id = a.cita_id and c.company_id = a.company_id),
                    'slot', (select c.slot_start from public.appointments c where c.id = a.cita_id and c.company_id = a.company_id)
                ) as x
                  from public.lector_avisos a
                 where a.company_id = p_company and a.cuando >= v_desde
                 order by a.cuando desc
                 limit 200
            ) t), '[]'::jsonb)
    );
end $$;

notify pgrst, 'reload schema';
