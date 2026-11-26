-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA LECTOR · 0003 · El barbero elige el Yape de su cliente
--
-- 26-nov-2026, Alvaro: sin código de seguridad (solo sale entre dos Yape de personas) y sin nombre que
-- cruzar (la captura dice A QUIÉN se yapeó; el aviso, DE QUIÉN llegó), quien sabe de qué cita es un
-- Yape es el barbero, con el cliente delante. En Mi agenda › Cobrar › Yape/Plin ve los Yapes que
-- llegaron al celular de cobros (15 min antes y hasta 5 después, configurable), con nombre, monto y
-- hora, TODOS los montos («los tres»), y toca el de su cliente. El dinero es real: llegó a la cuenta
-- del negocio. Lo único que decide el barbero es de qué cita es.
--
-- Brechas de robo y cómo se cierran (Alvaro: «que no tome otro Yape de otro corte o de otra sede»):
--   · Tomar el Yape de otro corte → la FOTO del Yape en el celular del cliente (obligatoria de serie)
--     tiene que cuadrar con el Yape elegido: mismo monto, ±3 min, y el código de seguridad si están los
--     dos. La lectura la guarda el SERVIDOR al subir la foto (lector_lecturas): el barbero no la escribe.
--     Una foto de un pago a otro número, o que no es un comprobante, no vale.
--   · Cobrar en efectivo, guardárselo y «pagarlo» con un Yape ajeno → igual: sin la foto de ESE pago no
--     se puede. Con la foto opcional (si el dueño la apaga), el Cierre lo marca en ámbar: «sin foto».
--   · De otra sede → cada celular de cobros puede ser de una sede (Configuración › Cobros): el barbero
--     solo ve los Yapes del celular de la sede de la cita. Con un solo celular para todas, manda la foto.
--   · El mismo Yape para dos cortes → cada Yape se toma UNA vez (con candado); el segundo recibe «ya se
--     asignó a otra cita».
--   · Un Yape de más (S/ 50 para un corte de S/ 30) → se cobra lo que falta y los S/ 20 quedan a la
--     vista del dueño en el Cierre («S/ 20 de más»). Nada de propina automática para el barbero.
--   · La misma foto dos veces → v2_foto_pago_validar (datos 0010): foto u operación ya usadas, fuera.
--   · Un Yape viejo o de antes de conectar → fuera del rango, o anterior a vinculado_at: no se ve.
--   · Deshacer → solo el dueño o el administrador («No era de esta cita»); queda quién lo eligió.
--   · Un barbero solo cobra SUS citas (o las sin asignar), como en datos 0012.
-- Lo que queda: que el barbero fabrique una captura falsa con el monto y la hora de un Yape ajeno que
-- ve en la lista. Se nota igual: el cliente verdadero de ese Yape se queda «por cobrar» y su barbero
-- lo reclama; y el Cierre dice quién eligió cada Yape y enlaza la foto.
--
-- Sin celular de cobros conectado no hay nada que ver ni que consultar (The 24/7 no cambia).
--
-- APLICAR después de la 0002 (si vuelves a correr la 0002, corre después otra vez esta). Requiere datos 0010 (v2_foto_pago_validar/_guardar, comprobantes_cobro)
-- y 0012 (v2_empleado_puede_cobrar), tu-pagina 0021 (v2_comprobante_aplicar) y 0023 (appointments.sede).
-- Pruebas: tests/pruebas_0003_pglite.mjs. Deshacer: 0003_el_barbero_elige_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · Lo que se guarda ────────────────────────────────────────────────────
-- Las opciones del negocio. Sin fila: 15 / 5 / obligatoria.
create table if not exists public.lector_ajustes (
    company_id     text primary key references public.companies(id) on delete cascade,
    antes_min      int  not null default 15 check (antes_min between 5 and 60),
    despues_min    int  not null default 5  check (despues_min between 1 and 30),
    foto           text not null default 'obligatoria' check (foto in ('obligatoria', 'opcional')),
    actualizado_por uuid,
    actualizado_at timestamptz not null default now()
);

-- Lo que la IA leyó en cada foto, guardado por el servidor al subirla (/api/cobros/foto). La clave es la
-- huella de la imagen: el barbero manda la foto, no lo que dice.
create table if not exists public.lector_lecturas (
    hash       text primary key check (hash ~ '^[0-9a-f]{64}$'),
    company_id text not null references public.companies(id) on delete cascade,
    monto      numeric,
    fecha      text not null default '',
    codigo     text not null default '',
    decision   text not null default '',
    creado_at  timestamptz not null default now()
);
create index if not exists ix_lector_lecturas_viejas on public.lector_lecturas (creado_at);

-- De qué sede es cada celular ('' = de todas).
alter table public.lector_dispositivos add column if not exists sede text not null default '';

-- Quién eligió el Yape, lo que sobró y cómo quedó la foto: si · sin_leer · revisar · sin_foto.
alter table public.lector_avisos add column if not exists elegido_por uuid;
alter table public.lector_avisos add column if not exists sobra       numeric not null default 0;
alter table public.lector_avisos add column if not exists foto_ok     text not null default '';
alter table public.lector_avisos drop constraint if exists lector_avisos_asignado_chk;
alter table public.lector_avisos add constraint lector_avisos_asignado_chk check (asignado in ('', 'auto', 'panel', 'equipo'));

alter table public.lector_ajustes enable row level security;
alter table public.lector_lecturas enable row level security;
revoke all on public.lector_ajustes, public.lector_lecturas from anon, authenticated;

-- ── 2 · Ayudas ──────────────────────────────────────────────────────────────
create or replace function public.lector_ajustes_de(p_company text)
returns public.lector_ajustes language sql stable security definer set search_path = public as $$
    select coalesce((select a from public.lector_ajustes a where a.company_id = p_company),
                    row(p_company, 15, 5, 'obligatoria', null, now())::public.lector_ajustes);
$$;
revoke execute on function public.lector_ajustes_de(text) from public, anon, authenticated;

-- Quién cobra: la ficha del empleado ('' = sin ficha: solo las sin asignar), o null si es el dueño o
-- el administrador (cualquier cita). El empleado, con las mismas puertas que «Cobrar» (datos 0012).
create or replace function public.lector_quien_cobra(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_rol text := public.rol_en(p_company);
begin
    if v_rol is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    if v_rol in ('dueno', 'admin') then return null; end if;
    if v_rol = 'empleado' then return coalesce(public.v2_empleado_puede_cobrar(p_company), ''); end if;
    raise exception 'No puedes cobrar en este negocio.' using errcode = '42501';
end $$;
revoke execute on function public.lector_quien_cobra(text) from public, anon, authenticated;

-- ── 3 · El servidor guarda la lectura de la foto ────────────────────────────
create or replace function public.lector_srv_lectura(p_company text, p_hash text, p_monto numeric, p_fecha text,
                                                     p_codigo text, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    if coalesce(p_hash, '') !~ '^[0-9a-f]{64}$' then return; end if;
    -- Sin celular de cobros no hay Yape que comprobar: no se guarda nada.
    if not exists (select 1 from public.lector_dispositivos where company_id = p_company and revocado_at is null) then return; end if;
    insert into public.lector_lecturas (hash, company_id, monto, fecha, codigo, decision)
    values (p_hash, p_company, p_monto, left(coalesce(p_fecha, ''), 40),
            left(regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g'), 6), left(coalesce(p_decision, ''), 20))
    on conflict (hash) do update set monto = excluded.monto, fecha = excluded.fecha, codigo = excluded.codigo,
                                     decision = excluded.decision, company_id = excluded.company_id;
    -- Solo sirven mientras se cobra: una semana sobra.
    delete from public.lector_lecturas where creado_at < now() - interval '7 days';
end $$;
revoke execute on function public.lector_srv_lectura(text, text, numeric, text, text, text) from public, authenticated;
grant execute on function public.lector_srv_lectura(text, text, numeric, text, text, text) to anon;

-- ── 4 · Lo que ve el barbero al cobrar ──────────────────────────────────────
-- {activo, antes, despues, foto, falta, yapes:[{id, centimos, nombre, origen, cuando, exacto}]}.
-- activo = false → no hay celular de cobros: la pantalla no enseña nada ni vuelve a preguntar.
create or replace function public.lector_para_cobrar(p_company text, p_cita text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_ficha text := public.lector_quien_cobra(p_company);
    v_aj    public.lector_ajustes := public.lector_ajustes_de(p_company);
    v_cita  public.appointments;
    v_falta numeric;
begin
    if not exists (select 1 from public.lector_dispositivos where company_id = p_company and revocado_at is null) then
        return jsonb_build_object('activo', false);
    end if;
    select * into v_cita from public.appointments where id = p_cita and company_id = p_company;
    if not found then raise exception 'Eso no existe en este negocio.'; end if;
    if v_ficha is not null and coalesce(v_cita.employee_id, '') <> '' and v_cita.employee_id is distinct from nullif(v_ficha, '') then
        raise exception 'Esa no es tuya: la cobra quien la atiende o la caja.' using errcode = '42501';
    end if;
    v_falta := (select coalesce(sum(s.price), 0)::numeric from public.appointment_services s where s.appointment_id = v_cita.id)
             - (select coalesce(sum(p.amount), 0)::numeric from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id);
    return jsonb_build_object(
        'activo', true, 'antes', v_aj.antes_min, 'despues', v_aj.despues_min, 'foto', v_aj.foto, 'falta', v_falta,
        'yapes', coalesce((
            select jsonb_agg(jsonb_build_object('id', x.id, 'centimos', x.centimos, 'nombre', x.nombre, 'origen', x.origen,
                                                'cuando', x.cuando, 'exacto', x.exacto) order by x.exacto desc, x.cuando desc)
              from (select a.id, a.centimos, a.nombre, a.origen, a.cuando, a.centimos = round(v_falta * 100) as exacto
                      from public.lector_avisos a
                      join public.lector_dispositivos d on d.id = a.dispositivo_id and d.revocado_at is null
                     where a.company_id = p_company and a.asignado = '' and a.centimos is not null
                       and a.cuando >= greatest(d.vinculado_at, now() - make_interval(mins => v_aj.antes_min + v_aj.despues_min))
                       and not (p_cita = any (a.descartes))
                       and (d.sede = '' or coalesce(v_cita.sede, '') = '' or d.sede = v_cita.sede)
                     order by a.cuando desc
                     limit 20) x), '[]'::jsonb));
end $$;
revoke execute on function public.lector_para_cobrar(text, text) from public, anon;
grant execute on function public.lector_para_cobrar(text, text) to authenticated;

-- ── 5 · El barbero cobra con ese Yape ───────────────────────────────────────
create or replace function public.lector_cobrar_con(p_company text, p_cita text, p_aviso bigint, p_foto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ficha  text := public.lector_quien_cobra(p_company);
    v_aj     public.lector_ajustes := public.lector_ajustes_de(p_company);
    v_av     public.lector_avisos;
    v_disp   public.lector_dispositivos;
    v_cita   public.appointments;
    v_item   text;
    v_falta  numeric;
    v_monto  numeric;
    v_aplica numeric;
    v_met    text;
    v_foto   jsonb;
    v_lec    public.lector_lecturas;
    v_hora   timestamptz;
    v_ok     text;
    v_r      jsonb;
    v_pago   text;
    v_lead   text;
    hm       constant text := 'FMHH12:MI am';
begin
    -- Los mismos candados que el resto del dinero y que el emparejar: nadie se cruza.
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    perform pg_advisory_xact_lock(hashtext('lector:' || p_company));
    perform set_config('lector.emparejando', '1', true);

    select * into v_av from public.lector_avisos where id = p_aviso and company_id = p_company for update;
    if not found or v_av.centimos is null then raise exception 'Ese Yape ya no está en la lista.'; end if;
    if v_av.asignado <> '' then raise exception 'Ese Yape ya se asignó a otra cita. Elige el de tu cliente o avisa a la caja.'; end if;
    select * into v_disp from public.lector_dispositivos where id = v_av.dispositivo_id;
    if v_disp.revocado_at is not null or v_av.cuando < v_disp.vinculado_at then
        raise exception 'Ese Yape no es del celular de cobros conectado.';
    end if;
    if v_av.cuando < now() - make_interval(mins => v_aj.antes_min + v_aj.despues_min) then
        raise exception 'Ese Yape llegó hace más de % min: que lo asigne la caja.', v_aj.antes_min + v_aj.despues_min;
    end if;
    if p_cita = any (v_av.descartes) then raise exception 'La caja ya dijo que ese Yape no es de esta cita.'; end if;

    select * into v_cita from public.appointments where id = p_cita and company_id = p_company for update;
    if not found then raise exception 'Eso no existe en este negocio.'; end if;
    if v_ficha is not null and coalesce(v_cita.employee_id, '') <> '' and v_cita.employee_id is distinct from nullif(v_ficha, '') then
        raise exception 'Esa no es tuya: la cobra quien la atiende o la caja.' using errcode = '42501';
    end if;
    if v_cita.status not in ('pending_payment', 'confirmed', 'completed') then raise exception 'Está cancelada: no se le cobra nada.'; end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Ya está cobrada completa.'; end if;
    if v_cita.status = 'pending_payment' then
        select s.catalog_item_id into v_item from public.appointment_services s
         where s.appointment_id = v_cita.id order by s.sort_order limit 1;
        if not public.v2_es_cancha(p_company, coalesce(v_item, '')) then
            raise exception 'Está apartada, todavía sin confirmar: la confirma la caja.';
        end if;
    end if;
    if v_disp.sede <> '' and coalesce(v_cita.sede, '') <> '' and v_disp.sede <> v_cita.sede then
        raise exception 'Ese Yape llegó al celular de cobros de %, no al de %.', v_disp.sede, v_cita.sede;
    end if;

    v_falta := (select coalesce(sum(s.price), 0)::numeric from public.appointment_services s where s.appointment_id = v_cita.id)
             - (select coalesce(sum(p.amount), 0)::numeric from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id);
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;
    v_monto := v_av.centimos / 100.0;
    v_aplica := least(v_monto, v_falta);
    v_met := case when lower(v_av.origen) = 'yape' then 'yape' when lower(v_av.origen) like '%plin%' then 'plin' else 'bank_transfer' end;

    -- La foto del Yape en el celular del cliente: tiene que ser ESE pago.
    if p_foto is not null and jsonb_typeof(p_foto) = 'object'
       and (btrim(coalesce(p_foto->>'url', '')) <> '' or btrim(coalesce(p_foto->>'hash', '')) <> '') then
        v_foto := public.v2_foto_pago_validar(p_company, v_met, p_foto);
        select * into v_lec from public.lector_lecturas where hash = v_foto->>'hash' and company_id = p_company;
        if not found then
            v_ok := 'sin_leer';
        else
            if v_lec.decision = 'rechazar' then
                raise exception 'Esa foto no vale: no es un comprobante o el pago fue a otro número. Toma la del Yape de tu cliente.';
            end if;
            if v_lec.monto is not null and abs(v_lec.monto - v_monto) >= 0.01 then
                raise exception 'La foto dice S/ %, pero ese Yape es de S/ %. Elige el Yape de tu cliente.',
                    to_char(v_lec.monto, 'FM999990.00'), to_char(v_monto, 'FM999990.00');
            end if;
            v_hora := public.lector_hora_captura(v_lec.fecha);
            if v_hora is not null and abs(extract(epoch from v_hora - v_av.cuando)) > 180 then
                raise exception 'La foto es de las %, pero ese Yape llegó a las %. Elige el Yape de tu cliente.',
                    to_char(v_hora at time zone 'America/Lima', hm), to_char(v_av.cuando at time zone 'America/Lima', hm);
            end if;
            if not public.lector_mismo_codigo(v_lec.codigo, v_av.codigo) then
                raise exception 'El código de seguridad de la foto no es el de ese Yape. Elige el Yape de tu cliente.';
            end if;
            v_ok := case when v_lec.monto is null then 'sin_leer' when v_lec.decision = 'revisar' then 'revisar' else 'si' end;
        end if;
    else
        if v_aj.foto = 'obligatoria' then
            raise exception 'Toma la foto del Yape en el celular de tu cliente: así se comprueba que es el suyo.';
        end if;
        v_ok := 'sin_foto';
    end if;

    v_r := public.v2_comprobante_aplicar(v_cita, v_aplica, v_met, 'lector:' || v_av.id,
                                         coalesce(v_foto->>'hash', ''), coalesce(v_foto->>'url', ''), 'lector');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Que la caja la mueva a otra hora.', v_r->>'motivo';
    end if;
    if v_foto is not null then
        select id into v_pago from public.pending_payments
         where company_id = p_company and operation_id = 'lector:' || v_av.id limit 1;
        perform public.v2_foto_pago_guardar(p_company, 'appointment', v_cita.id, v_pago, 'empleado', v_foto, v_met, v_aplica);
    end if;

    update public.lector_avisos
       set cita_id = p_cita, asignado = 'equipo', asignado_at = now(), como = 'barbero', motivo = 'barbero', dudoso = null,
           elegido_por = (select auth.uid()), sobra = v_monto - v_aplica, foto_ok = v_ok,
           antes = jsonb_build_object('status', v_cita.status, 'pagado_por', coalesce(v_cita.pagado_por, ''),
                                      'created_at', v_cita.created_at, 'metodo_pago', v_cita.metodo_pago,
                                      'resultado', v_r->>'resultado', 'foto_hash', v_foto->>'hash')
     where id = v_av.id;
    update public.lector_esperas set aviso_id = v_av.id
     where appointment_id = p_cita and company_id = p_company and aviso_id is null;
    -- Lo confirmó hablando con el cliente: ese pagador cuenta como ese cliente la próxima vez.
    v_lead := v_cita.lead_id;
    if coalesce(v_lead, '') <> '' and public.lector_clave_pagador(v_av.nombre) <> '' then
        insert into public.lector_alias (company_id, pagador, lead_id)
        values (p_company, public.lector_clave_pagador(v_av.nombre), v_lead)
        on conflict (company_id, pagador, lead_id) do update set veces = lector_alias.veces + 1, ultimo_at = now();
    end if;
    return jsonb_build_object('resultado', v_r->>'resultado', 'cobrado', v_aplica, 'sobra', v_monto - v_aplica, 'foto', v_ok);
end $$;
revoke execute on function public.lector_cobrar_con(text, text, bigint, jsonb) from public, anon;
grant execute on function public.lector_cobrar_con(text, text, bigint, jsonb) to authenticated;

-- ── 6 · Configuración › Cobros ──────────────────────────────────────────────
create or replace function public.lector_ajustes_ver(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
    v_aj public.lector_ajustes := public.lector_ajustes_de(p_company);
begin
    if not public.lector_puede(p_company) then
        raise exception 'No tienes acceso a los pagos de este negocio.' using errcode = '42501';
    end if;
    return jsonb_build_object('antes', v_aj.antes_min, 'despues', v_aj.despues_min, 'foto', v_aj.foto,
        -- Las sedes de la página (tu-pagina: secciones.citas.sedes), para decir de cuál es cada celular.
        'sedes', coalesce((
            select jsonb_agg(btrim(s->>'nombre'))
              from public.tu_pagina p,
                   jsonb_array_elements(case when jsonb_typeof(p.secciones #> '{citas,sedes}') = 'array'
                                             then p.secciones #> '{citas,sedes}' else '[]'::jsonb end) s
             where p.company_id = p_company and btrim(coalesce(s->>'nombre', '')) <> ''), '[]'::jsonb));
end $$;
revoke execute on function public.lector_ajustes_ver(text) from public, anon;
grant execute on function public.lector_ajustes_ver(text) to authenticated;

create or replace function public.lector_ajustes_guardar(p_company text, p_antes int, p_despues int, p_foto text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador cambian esto.' using errcode = '42501';
    end if;
    if p_antes is null or p_antes not between 5 and 60 then raise exception 'El rango de antes va de 5 a 60 minutos.'; end if;
    if p_despues is null or p_despues not between 1 and 30 then raise exception 'La espera va de 1 a 30 minutos.'; end if;
    if p_foto is null or p_foto not in ('obligatoria', 'opcional') then raise exception 'La foto es obligatoria u opcional.'; end if;
    insert into public.lector_ajustes (company_id, antes_min, despues_min, foto, actualizado_por, actualizado_at)
    values (p_company, p_antes, p_despues, p_foto, (select auth.uid()), now())
    on conflict (company_id) do update set antes_min = excluded.antes_min, despues_min = excluded.despues_min,
        foto = excluded.foto, actualizado_por = excluded.actualizado_por, actualizado_at = now();
    return public.lector_ajustes_ver(p_company);
end $$;
revoke execute on function public.lector_ajustes_guardar(text, int, int, text) from public, anon;
grant execute on function public.lector_ajustes_guardar(text, int, int, text) to authenticated;

create or replace function public.lector_dispositivo_sede(p_company text, p_dispositivo uuid, p_sede text)
returns void language plpgsql security definer set search_path = public as $$
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador cambian esto.' using errcode = '42501';
    end if;
    update public.lector_dispositivos set sede = left(btrim(coalesce(p_sede, '')), 80)
     where id = p_dispositivo and company_id = p_company and revocado_at is null;
    if not found then raise exception 'Ese celular no está conectado a este negocio.'; end if;
end $$;
revoke execute on function public.lector_dispositivo_sede(text, uuid, text) from public, anon;
grant execute on function public.lector_dispositivo_sede(text, uuid, text) to authenticated;

-- ── 7 · El Cierre dice quién eligió, lo que sobró y la foto ─────────────────
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
                'por_enviar', d.por_enviar, 'sin_leer', d.sin_leer, 'sede', d.sede
            ) order by d.vinculado_at)
              from public.lector_dispositivos d
             where d.company_id = p_company and d.revocado_at is null), '[]'::jsonb),
        'avisos', coalesce((
            select jsonb_agg(x order by x->>'cuando' desc) from (
                select jsonb_build_object(
                    'id', a.id, 'centimos', a.centimos, 'nombre', a.nombre, 'codigo', a.codigo,
                    'origen', a.origen, 'generico', a.generico, 'recuperado', a.recuperado, 'cuando', a.cuando,
                    'cita_id', a.cita_id, 'asignado', a.asignado, 'resultado', a.antes->>'resultado', 'motivo', a.motivo,
                    'por_asignar', a.asignado = '' and a.dudoso is not null and jsonb_array_length(a.dudoso) > 0,
                    'cliente', (select coalesce(nullif(c.beneficiario, ''), l.name, '') from public.appointments c
                                  left join public.leads l on l.id = c.lead_id and l.company_id = c.company_id
                                 where c.id = a.cita_id and c.company_id = a.company_id),
                    'servicio', (select c.service from public.appointments c where c.id = a.cita_id and c.company_id = a.company_id),
                    'slot', (select c.slot_start from public.appointments c where c.id = a.cita_id and c.company_id = a.company_id),
                    'quien', case when a.elegido_por is null then '' else coalesce(
                        (select nullif(e.name, '') from public.memberships m
                           join public.employees e on e.id = m.employee_id and e.company_id = m.company_id
                          where m.company_id = a.company_id and m.auth_user_id = a.elegido_por::text limit 1),
                        'El equipo') end,
                    'sobra', a.sobra, 'foto_ok', a.foto_ok,
                    'foto_url', (select f.url from public.comprobantes_cobro f
                                  where f.company_id = a.company_id and f.image_hash = a.antes->>'foto_hash' limit 1)
                ) as x
                  from public.lector_avisos a
                 where a.company_id = p_company and a.cuando >= v_desde
                 order by a.cuando desc
                 limit 200
            ) t), '[]'::jsonb)
    );
end $$;

-- «No era de esta cita» también quita la foto que el barbero guardó con ese cobro.
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
        if v_av.antes->>'foto_hash' is not null then
            delete from public.comprobantes_cobro where company_id = p_company and image_hash = v_av.antes->>'foto_hash';
        end if;
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
           como = '', antes = null, dudoso = null, motivo = '', elegido_por = null, sobra = 0, foto_ok = ''
     where id = v_av.id;
    return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.lector_desasignar(text, bigint) from public, anon;
grant execute on function public.lector_desasignar(text, bigint) to authenticated;

notify pgrst, 'reload schema';
