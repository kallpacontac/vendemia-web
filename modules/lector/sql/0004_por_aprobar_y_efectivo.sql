-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA LECTOR · 0004 · «Por aprobar», sin IA, y la foto del efectivo configurable
--
-- 26-nov-2026, Alvaro, sobre la 0003:
--   · Yape DE MÁS (S/ 50 para un corte de S/ 30): «lo que sea más seguro y menos propenso a robos».
--     No se cobra solo: el Yape queda APARTADO para esa cita («propuesto») y lo aprueba el dueño o el
--     administrador en Caja › Cierre del día. Así nadie toma un Yape grande ajeno para quedarse la
--     diferencia. Mientras espera, nadie más lo ve ni se empareja solo.
--   · «No llegó el Yape» (el celular de cobros dormido, o pagó a otro número): «claro, y lo aprueba el
--     admin». El barbero deja la foto en la cita (ticket_fotos, tu-pagina 0037) y NO se cobra: si el Yape
--     llega después se empareja solo con esa foto (lector 0002, «ticket»); si no, el admin lo aprueba en
--     el Cierre («Esperando su Yape»).
--   · Cerrar el atajo: con el celular de cobros conectado, empleado_cobrar_saldo (datos 0012) ya no
--     cobra Yape ni Plin solo con una foto. O elige el Yape que llegó, o queda por aprobar.
--   · Efectivo: la foto, configurable (Configuración › Cobros): obligatoria (como hasta hoy, de serie: The
--     24/7 no cambia) u opcional.
--   · Sin IA: la foto del barbero la lee Tesseract en el servidor (gratis, modules/lector/servidor/ocr.ts).
--     Para que la foto cuente como comprobada («si») hace falta el monto y, además, la hora o el código
--     de seguridad; si no, queda «sin leer» (ámbar) y el dueño la mira.
--
-- APLICAR después de la 0003 (si vuelves a correr la 0002 o la 0003, corre después esta). Requiere datos
-- 0010/0012 (cobro_ajustes, empleado_cobrar_saldo) y tu-pagina 0037 (ticket_fotos). Pruebas:
-- tests/pruebas_0004_pglite.mjs. Deshacer: 0004_por_aprobar_y_efectivo_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1 · Lo que se guarda ────────────────────────────────────────────────────
alter table public.lector_avisos add column if not exists propuesto_cita text;
alter table public.lector_avisos add column if not exists propuesto_at   timestamptz;
alter table public.lector_avisos drop constraint if exists lector_avisos_asignado_chk;
alter table public.lector_avisos add constraint lector_avisos_asignado_chk check (asignado in ('', 'auto', 'panel', 'equipo', 'propuesto'));

alter table public.cobro_ajustes add column if not exists efectivo_foto text not null default 'obligatoria';
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'cobro_ajustes_efectivo_foto_chk') then
        alter table public.cobro_ajustes add constraint cobro_ajustes_efectivo_foto_chk check (efectivo_foto in ('obligatoria', 'opcional'));
    end if;
end $$;

-- ── 2 · Ayudas ──────────────────────────────────────────────────────────────
create or replace function public.lector_conectado(p_company text)
returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from public.lector_dispositivos where company_id = p_company and revocado_at is null);
$$;
revoke execute on function public.lector_conectado(text) from public, anon, authenticated;

-- Para el servidor (/api/cobros/foto): con celular de cobros, la foto se lee sin IA.
create or replace function public.lector_srv_conectado(p_company text)
returns boolean language plpgsql stable security definer set search_path = public as $$
begin
    perform public.loyalty_srv_check();
    return public.lector_conectado(p_company);
end $$;
revoke execute on function public.lector_srv_conectado(text) from public, authenticated;
grant execute on function public.lector_srv_conectado(text) to anon;

-- La foto que mandó el barbero contra el Yape elegido. Devuelve si · sin_leer · revisar · sin_foto, o
-- falla con el motivo para el barbero. p_foto ya validada (v2_foto_pago_validar) o null.
create or replace function public.lector_comprobar_foto(p_company text, p_av public.lector_avisos, p_foto jsonb, p_exige boolean)
returns text language plpgsql stable security definer set search_path = public as $$
declare
    v_monto numeric := p_av.centimos / 100.0;
    v_lec   public.lector_lecturas;
    v_hora  timestamptz;
    hm      constant text := 'FMHH12:MI am';
begin
    if p_foto is null then
        if p_exige then raise exception 'Toma la foto del Yape en el celular de tu cliente: así se comprueba que es el suyo.'; end if;
        return 'sin_foto';
    end if;
    select * into v_lec from public.lector_lecturas where hash = p_foto->>'hash' and company_id = p_company;
    if not found then return 'sin_leer'; end if;
    if v_lec.decision = 'rechazar' then
        raise exception 'Esa foto no vale: el pago no figura como completado. Toma la del Yape de tu cliente.';
    end if;
    if v_lec.monto is not null and abs(v_lec.monto - v_monto) >= 0.01 then
        raise exception 'La foto dice S/ %, pero ese Yape es de S/ %. Elige el Yape de tu cliente.',
            to_char(v_lec.monto, 'FM999990.00'), to_char(v_monto, 'FM999990.00');
    end if;
    v_hora := public.lector_hora_captura(v_lec.fecha);
    if v_hora is not null and abs(extract(epoch from v_hora - p_av.cuando)) > 180 then
        raise exception 'La foto es de las %, pero ese Yape llegó a las %. Elige el Yape de tu cliente.',
            to_char(v_hora at time zone 'America/Lima', hm), to_char(p_av.cuando at time zone 'America/Lima', hm);
    end if;
    if not public.lector_mismo_codigo(v_lec.codigo, p_av.codigo) then
        raise exception 'El código de seguridad de la foto no es el de ese Yape. Elige el Yape de tu cliente.';
    end if;
    -- Comprobada = el monto y algo más que lo ate a ESE Yape (la hora, o el mismo código).
    if v_lec.monto is null or (v_hora is null and not (coalesce(v_lec.codigo, '') <> '' and v_lec.codigo = p_av.codigo)) then
        return 'sin_leer';
    end if;
    return case when v_lec.decision = 'revisar' and v_hora is null then 'sin_leer' else 'si' end;
end $$;
revoke execute on function public.lector_comprobar_foto(text, public.lector_avisos, jsonb, boolean) from public, anon, authenticated;

-- Aplicar el Yape a la cita (lo comparten el barbero y la aprobación del dueño).
create or replace function public.lector_aplicar_equipo(p_company text, p_cita public.appointments, p_av public.lector_avisos,
                                                        p_foto jsonb, p_ok text, p_quien uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_falta  numeric;
    v_monto  numeric := p_av.centimos / 100.0;
    v_aplica numeric;
    v_met    text := case when lower(p_av.origen) = 'yape' then 'yape' when lower(p_av.origen) like '%plin%' then 'plin' else 'bank_transfer' end;
    v_r      jsonb;
    v_pago   text;
    v_lead   text := p_cita.lead_id;
begin
    v_falta := (select coalesce(sum(s.price), 0)::numeric from public.appointment_services s where s.appointment_id = p_cita.id)
             - (select coalesce(sum(p.amount), 0)::numeric from public.pending_payments p where p.company_id = p_company and p.appointment_id = p_cita.id);
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;
    v_aplica := least(v_monto, v_falta);
    v_r := public.v2_comprobante_aplicar(p_cita, v_aplica, v_met, 'lector:' || p_av.id,
                                         coalesce(p_foto->>'hash', ''), coalesce(p_foto->>'url', ''), 'lector');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Que la caja la mueva a otra hora.', v_r->>'motivo';
    end if;
    if p_foto is not null then
        select id into v_pago from public.pending_payments
         where company_id = p_company and operation_id = 'lector:' || p_av.id limit 1;
        perform public.v2_foto_pago_guardar(p_company, 'appointment', p_cita.id, v_pago, 'empleado', p_foto, v_met, v_aplica);
    end if;
    update public.lector_avisos
       set cita_id = p_cita.id, asignado = 'equipo', asignado_at = now(), como = 'barbero', motivo = 'barbero', dudoso = null,
           elegido_por = p_quien, sobra = v_monto - v_aplica, foto_ok = p_ok, propuesto_cita = null,
           antes = jsonb_build_object('status', p_cita.status, 'pagado_por', coalesce(p_cita.pagado_por, ''),
                                      'created_at', p_cita.created_at, 'metodo_pago', p_cita.metodo_pago,
                                      'resultado', v_r->>'resultado', 'foto_hash', p_foto->>'hash')
     where id = p_av.id;
    update public.lector_esperas set aviso_id = p_av.id
     where appointment_id = p_cita.id and company_id = p_company and aviso_id is null;
    if coalesce(v_lead, '') <> '' and public.lector_clave_pagador(p_av.nombre) <> '' then
        insert into public.lector_alias (company_id, pagador, lead_id)
        values (p_company, public.lector_clave_pagador(p_av.nombre), v_lead)
        on conflict (company_id, pagador, lead_id) do update set veces = lector_alias.veces + 1, ultimo_at = now();
    end if;
    return jsonb_build_object('resultado', v_r->>'resultado', 'cobrado', v_aplica, 'sobra', v_monto - v_aplica, 'foto', p_ok);
end $$;
revoke execute on function public.lector_aplicar_equipo(text, public.appointments, public.lector_avisos, jsonb, text, uuid) from public, anon, authenticated;

-- La cita que el barbero puede cobrar (las mismas puertas que datos 0012), con candado.
create or replace function public.lector_cita_del_barbero(p_company text, p_cita text, p_ficha text)
returns public.appointments language plpgsql security definer set search_path = public as $$
declare
    v_cita public.appointments;
    v_item text;
begin
    select * into v_cita from public.appointments where id = p_cita and company_id = p_company for update;
    if not found then raise exception 'Eso no existe en este negocio.'; end if;
    if p_ficha is not null and coalesce(v_cita.employee_id, '') <> '' and v_cita.employee_id is distinct from nullif(p_ficha, '') then
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
    return v_cita;
end $$;
revoke execute on function public.lector_cita_del_barbero(text, text, text) from public, anon, authenticated;

-- ── 3 · El barbero cobra con el Yape que eligió ─────────────────────────────
-- De más → queda «por aprobar» (no se cobra). Si no, se cobra al momento.
create or replace function public.lector_cobrar_con(p_company text, p_cita text, p_aviso bigint, p_foto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ficha text := public.lector_quien_cobra(p_company);
    v_aj    public.lector_ajustes := public.lector_ajustes_de(p_company);
    v_av    public.lector_avisos;
    v_disp  public.lector_dispositivos;
    v_cita  public.appointments;
    v_falta numeric;
    v_met   text;
    v_foto  jsonb;
    v_ok    text;
begin
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

    v_cita := public.lector_cita_del_barbero(p_company, p_cita, v_ficha);
    if v_disp.sede <> '' and coalesce(v_cita.sede, '') <> '' and v_disp.sede <> v_cita.sede then
        raise exception 'Ese Yape llegó al celular de cobros de %, no al de %.', v_disp.sede, v_cita.sede;
    end if;
    v_falta := (select coalesce(sum(s.price), 0)::numeric from public.appointment_services s where s.appointment_id = v_cita.id)
             - (select coalesce(sum(p.amount), 0)::numeric from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id);
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;

    v_met := case when lower(v_av.origen) = 'yape' then 'yape' when lower(v_av.origen) like '%plin%' then 'plin' else 'bank_transfer' end;
    if p_foto is not null and jsonb_typeof(p_foto) = 'object'
       and (btrim(coalesce(p_foto->>'url', '')) <> '' or btrim(coalesce(p_foto->>'hash', '')) <> '') then
        v_foto := public.v2_foto_pago_validar(p_company, v_met, p_foto);
    end if;
    v_ok := public.lector_comprobar_foto(p_company, v_av, v_foto, v_aj.foto = 'obligatoria');

    -- De más: lo aprueba el dueño o el administrador. El Yape queda apartado para esta cita.
    if v_av.centimos > round(v_falta * 100) then
        update public.lector_avisos
           set asignado = 'propuesto', propuesto_cita = p_cita, propuesto_at = now(), elegido_por = (select auth.uid()),
               foto_ok = v_ok, sobra = v_av.centimos / 100.0 - v_falta, dudoso = null,
               antes = jsonb_build_object('foto', v_foto)
         where id = v_av.id;
        return jsonb_build_object('resultado', 'por_aprobar', 'cobrado', 0, 'sobra', v_av.centimos / 100.0 - v_falta, 'foto', v_ok);
    end if;
    return public.lector_aplicar_equipo(p_company, v_cita, v_av, v_foto, v_ok, (select auth.uid()));
end $$;
revoke execute on function public.lector_cobrar_con(text, text, bigint, jsonb) from public, anon;
grant execute on function public.lector_cobrar_con(text, text, bigint, jsonb) to authenticated;

-- ── 4 · «No llegó el Yape»: la foto en la cita, por aprobar ─────────────────
create or replace function public.lector_dejar_por_aprobar(p_company text, p_cita text, p_foto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ficha text := public.lector_quien_cobra(p_company);
    v_cita  public.appointments;
    v_foto  jsonb;
begin
    if not public.lector_conectado(p_company) then raise exception 'Este negocio no tiene celular de cobros conectado.'; end if;
    if to_regclass('public.ticket_fotos') is null then raise exception 'Falta instalar la foto del ticket (tu-pagina 0037).'; end if;
    if p_foto is null or jsonb_typeof(p_foto) <> 'object' or btrim(coalesce(p_foto->>'url', '')) = '' then
        raise exception 'Toma la foto del Yape en el celular de tu cliente.';
    end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    v_cita := public.lector_cita_del_barbero(p_company, p_cita, v_ficha);
    v_foto := public.v2_foto_pago_validar(p_company, 'yape', p_foto);
    -- La foto del ticket (0037): con ella, el Yape que llegue se empareja solo (lector 0002, «ticket»).
    execute 'insert into public.ticket_fotos (appointment_id, company_id, url, hash, subida_por, created_at)
             values ($1, $2, $3, $4, $5, now())
             on conflict (appointment_id) do update set url = excluded.url, hash = excluded.hash,
                                                        subida_por = excluded.subida_por, created_at = now()'
       using v_cita.id, p_company, v_foto->>'url', coalesce(v_foto->>'hash', ''), coalesce((select auth.uid())::text, '');
    return jsonb_build_object('resultado', 'por_aprobar');
end $$;
revoke execute on function public.lector_dejar_por_aprobar(text, text, jsonb) from public, anon;
grant execute on function public.lector_dejar_por_aprobar(text, text, jsonb) to authenticated;

-- ── 5 · El dueño o el administrador aprueban ────────────────────────────────
-- Los Yapes de más que eligió el equipo, esperando aprobación.
create or replace function public.lector_propuestas(p_company text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
    if not public.lector_puede(p_company) then
        raise exception 'No tienes acceso a los pagos de este negocio.' using errcode = '42501';
    end if;
    return coalesce((
        select jsonb_agg(jsonb_build_object(
                   'id', a.id, 'centimos', a.centimos, 'nombre', a.nombre, 'origen', a.origen, 'cuando', a.cuando,
                   'cita_id', a.propuesto_cita, 'sobra', a.sobra, 'foto_ok', a.foto_ok, 'foto_url', a.antes #>> '{foto,url}',
                   'cliente', coalesce(nullif(c.beneficiario, ''), l.name, ''), 'servicio', c.service, 'slot', c.slot_start,
                   'quien', coalesce((select nullif(e.name, '') from public.memberships m
                                        join public.employees e on e.id = m.employee_id and e.company_id = m.company_id
                                       where m.company_id = a.company_id and m.auth_user_id = a.elegido_por::text limit 1), 'El equipo'))
               order by a.propuesto_at)
          from public.lector_avisos a
          left join public.appointments c on c.id = a.propuesto_cita and c.company_id = a.company_id
          left join public.leads l on l.id = c.lead_id and l.company_id = c.company_id
         where a.company_id = p_company and a.asignado = 'propuesto'), '[]'::jsonb);
end $$;
revoke execute on function public.lector_propuestas(text) from public, anon;
grant execute on function public.lector_propuestas(text) to authenticated;

create or replace function public.lector_aprobar_propuesta(p_company text, p_aviso bigint, p_si boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_av   public.lector_avisos;
    v_cita public.appointments;
    v_foto jsonb;
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador aprueban pagos.' using errcode = '42501';
    end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    perform pg_advisory_xact_lock(hashtext('lector:' || p_company));
    perform set_config('lector.emparejando', '1', true);
    select * into v_av from public.lector_avisos where id = p_aviso and company_id = p_company for update;
    if not found or v_av.asignado <> 'propuesto' then raise exception 'Ese pago ya no está esperando aprobación.'; end if;
    if not p_si then
        update public.lector_avisos
           set asignado = '', descartes = array_append(descartes, propuesto_cita), propuesto_cita = null, propuesto_at = null,
               elegido_por = null, sobra = 0, foto_ok = '', antes = null
         where id = v_av.id;
        return jsonb_build_object('resultado', 'rechazado');
    end if;
    select * into v_cita from public.appointments where id = v_av.propuesto_cita and company_id = p_company for update;
    if not found then raise exception 'Esa cita ya no existe.'; end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Esa cita ya está cobrada.'; end if;
    v_foto := v_av.antes->'foto';
    if v_foto is not null and jsonb_typeof(v_foto) = 'object' then
        v_foto := public.v2_foto_pago_validar(p_company, 'yape', v_foto || jsonb_build_object('operacion', ''));
    else
        v_foto := null;
    end if;
    return public.lector_aplicar_equipo(p_company, v_cita, v_av, v_foto, v_av.foto_ok, v_av.elegido_por);
end $$;
revoke execute on function public.lector_aprobar_propuesta(text, bigint, boolean) from public, anon;
grant execute on function public.lector_aprobar_propuesta(text, bigint, boolean) to authenticated;

-- «No llegó el Yape» (o la foto del ticket sin su Yape): el dueño lo da por cobrado con esa foto.
create or replace function public.lector_aprobar_sin_yape(p_company text, p_cita text, p_metodo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_cita  public.appointments;
    v_url   text;
    v_hash  text;
    v_met   text := case when p_metodo in ('yape', 'plin', 'cash', 'bank_transfer') then p_metodo else 'yape' end;
    v_falta numeric;
    v_r     jsonb;
    v_pago  text;
begin
    if not public.lector_puede(p_company) then
        raise exception 'Solo el dueño o el administrador aprueban pagos.' using errcode = '42501';
    end if;
    if to_regclass('public.ticket_fotos') is null then raise exception 'Falta instalar la foto del ticket (tu-pagina 0037).'; end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));
    perform pg_advisory_xact_lock(hashtext('lector:' || p_company));
    perform set_config('lector.emparejando', '1', true);
    select * into v_cita from public.appointments where id = p_cita and company_id = p_company for update;
    if not found then raise exception 'Esa cita no es de este negocio.'; end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Esa cita ya está cobrada.'; end if;
    execute 'select url, hash from public.ticket_fotos where appointment_id = $1 and company_id = $2'
       into v_url, v_hash using p_cita, p_company;
    if v_url is null then raise exception 'Esa cita no tiene foto del pago.'; end if;
    v_falta := (select coalesce(sum(s.price), 0)::numeric from public.appointment_services s where s.appointment_id = v_cita.id)
             - (select coalesce(sum(p.amount), 0)::numeric from public.pending_payments p where p.company_id = p_company and p.appointment_id = v_cita.id);
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;
    v_r := public.v2_comprobante_aplicar(v_cita, v_falta, v_met, 'aprobado:' || v_cita.id || ':' || extract(epoch from now())::bigint,
                                         coalesce(v_hash, ''), v_url, 'panel');
    if v_r->>'resultado' = 'sin_sitio' then raise exception 'No se puede confirmar: %.', v_r->>'motivo'; end if;
    return v_r || jsonb_build_object('cobrado', v_falta);
end $$;
revoke execute on function public.lector_aprobar_sin_yape(text, text, text) from public, anon;
grant execute on function public.lector_aprobar_sin_yape(text, text, text) to authenticated;

-- ── 6 · La foto del efectivo ────────────────────────────────────────────────
create or replace function public.cobro_efectivo_foto(p_company text)
returns text language plpgsql stable security definer set search_path = public as $$
begin
    if public.rol_en(p_company) is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
    return coalesce((select efectivo_foto from public.cobro_ajustes where company_id = p_company), 'obligatoria');
end $$;
revoke execute on function public.cobro_efectivo_foto(text) from public, anon;
grant execute on function public.cobro_efectivo_foto(text) to authenticated;

create or replace function public.cobro_efectivo_foto_guardar(p_company text, p_modo text)
returns text language plpgsql security definer set search_path = public as $$
begin
    if coalesce(public.rol_en(p_company), '') not in ('dueno', 'admin') then
        raise exception 'Solo el dueño o el administrador cambian esto.' using errcode = '42501';
    end if;
    if p_modo is null or p_modo not in ('obligatoria', 'opcional') then raise exception 'La foto es obligatoria u opcional.'; end if;
    insert into public.cobro_ajustes (company_id, efectivo_foto, actualizado_por, actualizado_at)
    values (p_company, p_modo, (select auth.uid()), now())
    on conflict (company_id) do update set efectivo_foto = excluded.efectivo_foto, actualizado_por = excluded.actualizado_por, actualizado_at = now();
    return p_modo;
end $$;
revoke execute on function public.cobro_efectivo_foto_guardar(text, text) from public, anon;
grant execute on function public.cobro_efectivo_foto_guardar(text, text) to authenticated;

-- El cobro del empleado (datos 0012) con dos cambios: el efectivo sin foto si el negocio lo dejó
-- opcional, y Yape/Plin NO con solo una foto si hay celular de cobros (elige el Yape o queda por aprobar).
create or replace function public.empleado_cobrar_saldo(p_company text, p_appointment text, p_metodo text, p_foto jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_ficha   text := public.v2_empleado_puede_cobrar(p_company);
    v_metodo  text := btrim(coalesce(p_metodo, ''));
    v_cita    public.appointments;
    v_item    text;
    v_total   numeric;
    v_pagado  numeric;
    v_falta   numeric;
    v_hay     boolean := p_foto is not null and jsonb_typeof(p_foto) = 'object'
                         and (btrim(coalesce(p_foto->>'url', '')) <> '' or btrim(coalesce(p_foto->>'hash', '')) <> '');
    v_foto    jsonb;
    v_pago_id text;
    v_r       jsonb;
begin
    if v_metodo not in ('cash', 'yape', 'plin') then raise exception 'Elige cómo te pagaron: efectivo, Yape o Plin.'; end if;
    if v_metodo in ('yape', 'plin') and public.lector_conectado(p_company) then
        raise exception 'Con el celular de cobros conectado, elige el Yape que llegó, o «No llegó: dejar por aprobar».';
    end if;
    -- La evidencia: siempre en Yape y Plin; en efectivo, según el negocio (obligatoria de serie).
    if not v_hay and not (v_metodo = 'cash'
                          and coalesce((select efectivo_foto from public.cobro_ajustes where company_id = p_company), 'obligatoria') = 'opcional') then
        raise exception 'Para cobrar necesitas la foto: la del Yape o Plin, o la del dinero que recibiste.';
    end if;
    perform pg_advisory_xact_lock(hashtext('tu_pagina:' || p_company));

    select * into v_cita from public.appointments where id = p_appointment and company_id = p_company;
    if not found then raise exception 'Eso no existe en este negocio.'; end if;
    if coalesce(v_cita.employee_id, '') <> '' and v_cita.employee_id is distinct from nullif(v_ficha, '') then
        raise exception 'Esa no es tuya: la cobra quien la atiende o la caja.' using errcode = '42501';
    end if;
    if v_cita.status not in ('pending_payment', 'confirmed', 'completed') then
        raise exception 'Está cancelada: no se le cobra nada.';
    end if;
    if coalesce(v_cita.pagado_por, '') <> '' then raise exception 'Ya está cobrada completa.'; end if;
    if v_cita.status = 'pending_payment' then
        select s.catalog_item_id into v_item from public.appointment_services s
         where s.appointment_id = v_cita.id order by s.sort_order limit 1;
        if not public.v2_es_cancha(p_company, coalesce(v_item, '')) then
            raise exception 'Está apartada, todavía sin confirmar: la confirma la caja.';
        end if;
    end if;

    if v_hay then v_foto := public.v2_foto_pago_validar(p_company, v_metodo, p_foto); end if;

    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
     where p.company_id = p_company and p.appointment_id = v_cita.id;
    v_falta := v_total - v_pagado;
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;

    v_r := public.v2_comprobante_aplicar(v_cita, v_falta, v_metodo,
                                         coalesce(nullif(v_foto->>'op', ''), 'empleado:' || gen_random_uuid()),
                                         coalesce(v_foto->>'hash', ''), coalesce(v_foto->>'url', ''), 'panel');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Que la caja la mueva a otra hora.', v_r->>'motivo';
    end if;
    if v_foto is not null then
        select id into v_pago_id from public.pending_payments
         where company_id = p_company and appointment_id = v_cita.id and image_hash = v_foto->>'hash' limit 1;
        perform public.v2_foto_pago_guardar(p_company, 'appointment', v_cita.id, v_pago_id, 'empleado', v_foto, v_metodo, v_falta);
    end if;
    return v_r || jsonb_build_object('cobrado', v_falta, 'metodo', v_metodo);
end $$;
revoke execute on function public.empleado_cobrar_saldo(text, text, text, jsonb) from public, anon;
grant execute on function public.empleado_cobrar_saldo(text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
