-- Deshace modules/lector/sql/0004_por_aprobar_y_efectivo.sql. Lo ya cobrado se queda (son cobros). Los
-- Yapes «por aprobar» vuelven a quedar libres. lector_cobrar_con y empleado_cobrar_saldo vuelven a los de
-- antes: empleado_cobrar_saldo se repone aquí (el de datos 0012); lector_cobrar_con, corriendo otra vez la 0003.
update public.lector_avisos set asignado = '', propuesto_cita = null, elegido_por = null, sobra = 0, foto_ok = '', antes = null
 where asignado = 'propuesto';
drop function if exists public.lector_aprobar_sin_yape(text, text, text);
drop function if exists public.lector_aprobar_propuesta(text, bigint, boolean);
drop function if exists public.lector_propuestas(text);
drop function if exists public.lector_dejar_por_aprobar(text, text, jsonb);
drop function if exists public.cobro_efectivo_foto_guardar(text, text);
drop function if exists public.cobro_efectivo_foto(text);
drop function if exists public.lector_srv_conectado(text);
alter table public.lector_avisos drop constraint if exists lector_avisos_asignado_chk;
alter table public.lector_avisos add constraint lector_avisos_asignado_chk check (asignado in ('', 'auto', 'panel', 'equipo'));
alter table public.lector_avisos drop column if exists propuesto_at, drop column if exists propuesto_cita;
alter table public.cobro_ajustes drop constraint if exists cobro_ajustes_efectivo_foto_chk;
alter table public.cobro_ajustes drop column if exists efectivo_foto;
-- El cobro del empleado, otra vez el de datos 0012 (copiado tal cual), ANTES de quitar lo que usaba el de la 0004.
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
    v_foto    jsonb;
    v_pago_id text;
    v_r       jsonb;
begin
    if v_metodo not in ('cash', 'yape', 'plin') then raise exception 'Elige cómo te pagaron: efectivo, Yape o Plin.'; end if;
    -- La evidencia, siempre: también en efectivo.
    if p_foto is null or jsonb_typeof(p_foto) <> 'object'
       or (btrim(coalesce(p_foto->>'url', '')) = '' and btrim(coalesce(p_foto->>'hash', '')) = '') then
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

    -- Misma regla de la 0010: foto subida por el servidor, no repetida, operación no repetida.
    v_foto := public.v2_foto_pago_validar(p_company, v_metodo, p_foto);

    select coalesce(sum(s.price), 0) into v_total from public.appointment_services s where s.appointment_id = v_cita.id;
    select coalesce(sum(p.amount), 0) into v_pagado from public.pending_payments p
     where p.company_id = p_company and p.appointment_id = v_cita.id;
    v_falta := v_total - v_pagado;
    if v_falta <= 0 then raise exception 'No le falta nada por pagar.'; end if;

    -- El importe no lo escribe nadie: es lo que falta.
    v_r := public.v2_comprobante_aplicar(v_cita, v_falta, v_metodo,
                                         coalesce(nullif(v_foto->>'op', ''), 'empleado:' || gen_random_uuid()),
                                         v_foto->>'hash', v_foto->>'url', 'panel');
    if v_r->>'resultado' = 'sin_sitio' then
        raise exception 'No se puede confirmar: %. Que la caja la mueva a otra hora.', v_r->>'motivo';
    end if;
    select id into v_pago_id from public.pending_payments
     where company_id = p_company and appointment_id = v_cita.id and image_hash = v_foto->>'hash' limit 1;
    perform public.v2_foto_pago_guardar(p_company, 'appointment', v_cita.id, v_pago_id, 'empleado', v_foto, v_metodo, v_falta);

    return v_r || jsonb_build_object('cobrado', v_falta, 'metodo', v_metodo);
end $$;

-- Las ayudas las usan lector_cobrar_con y empleado_cobrar_saldo de la 0004: se quitan al final.
drop function if exists public.lector_aplicar_equipo(text, public.appointments, public.lector_avisos, jsonb, text, uuid);
drop function if exists public.lector_comprobar_foto(text, public.lector_avisos, jsonb, boolean);
drop function if exists public.lector_cita_del_barbero(text, text, text);
drop function if exists public.lector_conectado(text);
notify pgrst, 'reload schema';
