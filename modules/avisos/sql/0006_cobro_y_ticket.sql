-- ═══════════════════════════════════════════════════════════════════════════════
-- VENDEMIA AVISOS · 0006 · Los avisos del cobro, con las palabras de la pantalla (25-nov-2026)
--
-- Pedido de Alvaro (The 24/7): «unificar los estados» de la cita en Mi agenda, Agenda, Caja y
-- push. Lo que cambia en los avisos:
--
--   1 · «Generar ticket» (o cualquier cita anotada con la hora ya empezada) deja de avisar
--       «Nueva cita» al dueño y al admin: no es una reserva, es alguien que ya está en la silla.
--   2 · Cuando el BARBERO marca «Atendido» y queda algo por cobrar, al dueño y al admin:
--       «Por cobrar en caja · Corte · Carlos · S/ 30» (tipo 'pago', clase 'por_cobrar', así lo
--       apaga quien apague los avisos de pagos). Si lo marca el dueño o el admin, no: está ahí.
--   3 · Al barbero, cuando le COBRAN su atención: «Cobrado · Corte · tu parte S/ 15»
--       (tipo 'mi_agenda', que 'cobrada'). Si la cobró él mismo, no.
--   4 · Al barbero, cuando pagan una parte de una atención suya ya atendida:
--       «Pagó S/ 10 · falta S/ 20» (tipo 'mi_agenda', que 'abono'). Se mira al cerrar la
--       transacción (trigger diferido), cuando ya se sabe si con ese pago quedó cobrada.
--
-- No cambian ni el despachador ni las preferencias: son tipos que ya existen, con una `clase`
-- para redactarlos (modules/avisos/dominio/redactar.ts). Ningún aviso tumba el cambio que lo
-- provoca (exception when others → warning).
--
-- APLICAR después de la 0004 de avisos y la 0011 de datos (comisiones congeladas; sin ella el
-- aviso sale sin «tu parte»). Prueba: tests/pruebas_0006_pglite.mjs.
-- Deshacer: 0006_cobro_y_ticket_deshacer.sql.
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

-- ── Lo que se cobra y lo que ya se pagó de una cita ──────────────────────────────
create or replace function public.avisos_cuenta_cita(p_cita text, out total numeric, out pagado numeric, out parte numeric)
language plpgsql stable security definer set search_path = public as $$
begin
    select coalesce(sum(price), 0) into total from public.appointment_services where appointment_id = p_cita;
    select coalesce(sum(amount), 0) into pagado from public.pending_payments
     where appointment_id = p_cita and coalesce(verified::int, 0) = 1;
    -- La parte del barbero, de la comisión congelada al vender (datos 0011). Sin ella, null.
    begin
        execute $q$
            select sum(case k.regla when 'fija' then k.valor
                                    when 'sin' then 0
                                    else round(s.price * coalesce(k.valor, 0) / 100, 2) end)
              from public.comisiones_congeladas k
              join public.appointment_services s on s.id = k.linea_id
             where k.appointment_id = $1 $q$
          into parte using p_cita;
    exception when undefined_table then parte := null;
    end;
end $$;
revoke execute on function public.avisos_cuenta_cita(text) from public, anon, authenticated;

-- ── 1 · Una cita anotada con su hora ya empezada no es «Nueva cita» ────────────────
create or replace function public.avisos_tg_cita() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    if new.status in ('confirmed', 'pending_payment')
       -- 0006: el ticket del barbero y lo que se anota a posteriori ya está pasando: no avisa.
       and not (coalesce(new.slot_start, '') ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$'
                and new.slot_start <= to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI')) then
        perform public.avisos_apuntar(new.company_id, 'reserva', 'cita:' || new.id,
            jsonb_build_object('clase', 'cita', 'lead_id', new.lead_id, 'servicio', new.service,
                               'slot', new.slot_start, 'estado', new.status),
            coalesce(to_timestamp(new.created_at), now()));
    end if;
    return null;
end $$;

-- ── 2 y 3 · Atendido por cobrar (al dueño/admin) y cobrado (al barbero) ─────────────
create or replace function public.avisos_tg_cobro_cita() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_rol    text;
    v_cuenta record;
    v_base   jsonb;
    v_ayer   text := to_char((now() - interval '2 days') at time zone 'America/Lima', 'YYYY-MM-DD');
begin
    begin
        -- Solo lo de estos días: el espejo poniéndose al día no es noticia.
        if coalesce(new.slot_start, '') < v_ayer then return null; end if;
        v_rol := coalesce(public.rol_en(new.company_id), '');
        v_base := jsonb_build_object(
            'cita', new.id, 'lead_id', new.lead_id, 'servicio', coalesce(new.service, ''), 'slot', new.slot_start,
            'empleado', coalesce(new.employee_id, ''),
            'barbero', (select e.name from public.employees e where e.id = new.employee_id and e.company_id = new.company_id),
            'beneficiario', nullif(btrim(coalesce(to_jsonb(new) ->> 'beneficiario', '')), ''));

        -- 2 · El barbero lo marcó «Atendido» y hay algo por cobrar: que la caja lo sepa.
        if new.status = 'completed' and old.status is distinct from 'completed'
           and coalesce(new.pagado_por, '') = '' and v_rol = 'empleado'
           and coalesce(to_jsonb(new) ->> 'cumplido_por', '') <> 'cron' then
            select * into v_cuenta from public.avisos_cuenta_cita(new.id);
            if v_cuenta.total > 0 and v_cuenta.pagado < v_cuenta.total then
                perform public.avisos_apuntar(new.company_id, 'pago', 'cobrar:' || new.id,
                    v_base || jsonb_build_object('clase', 'por_cobrar', 'monto', v_cuenta.total - v_cuenta.pagado,
                                                 'pagado', v_cuenta.pagado));
            end if;
        end if;

        -- 3 · Le cobraron su atención (todo): al barbero, con su parte. Si cobró él, no.
        if coalesce(old.pagado_por, '') = '' and coalesce(new.pagado_por, '') <> ''
           and coalesce(new.employee_id, '') <> '' and new.status in ('completed', 'confirmed')
           and v_rol <> 'empleado' then
            select * into v_cuenta from public.avisos_cuenta_cita(new.id);
            perform public.avisos_apuntar(new.company_id, 'mi_agenda', 'eq:cobrada:' || new.id,
                v_base || jsonb_build_object('clase', 'cobro', 'que', 'cobrada', 'monto', v_cuenta.total, 'parte', v_cuenta.parte));
        end if;
    exception when others then
        raise warning 'avisos_tg_cobro_cita: %', sqlerrm;
    end;
    return null;
end $$;
revoke execute on function public.avisos_tg_cobro_cita() from public, anon, authenticated;

drop trigger if exists avisos_cobro_cita on public.appointments;
create trigger avisos_cobro_cita
    after update of status, pagado_por on public.appointments
    for each row execute function public.avisos_tg_cobro_cita();

-- ── 4 · Pagó una parte de una atención ya atendida: al barbero ────────────────────
-- Diferido: al cerrar la transacción ya se sabe si con este pago quedó cobrada (entonces el
-- aviso es «Cobrado», del punto 3, y este no sale).
create or replace function public.avisos_tg_abono() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    a        public.appointments;
    v_cuenta record;
    v_ayer   text := to_char((now() - interval '2 days') at time zone 'America/Lima', 'YYYY-MM-DD');
begin
    begin
        if coalesce(new.appointment_id, '') = '' or coalesce(new.verified::int, 0) <> 1 then return null; end if;
        select * into a from public.appointments where id = new.appointment_id;
        if a.id is null or a.status <> 'completed' or coalesce(a.pagado_por, '') <> ''
           or coalesce(a.employee_id, '') = '' or coalesce(a.slot_start, '') < v_ayer then
            return null;
        end if;
        if coalesce(public.rol_en(a.company_id), '') = 'empleado' then return null; end if;
        select * into v_cuenta from public.avisos_cuenta_cita(a.id);
        if v_cuenta.pagado <= 0 or v_cuenta.pagado >= v_cuenta.total then return null; end if;
        perform public.avisos_apuntar(a.company_id, 'mi_agenda', 'eq:abono:' || new.id,
            jsonb_build_object('cita', a.id, 'lead_id', a.lead_id, 'servicio', coalesce(a.service, ''), 'slot', a.slot_start,
                               'empleado', a.employee_id, 'clase', 'cobro', 'que', 'abono',
                               'pagado', v_cuenta.pagado, 'falta', v_cuenta.total - v_cuenta.pagado,
                               'beneficiario', nullif(btrim(coalesce(to_jsonb(a) ->> 'beneficiario', '')), '')));
    exception when others then
        raise warning 'avisos_tg_abono: %', sqlerrm;
    end;
    return null;
end $$;
revoke execute on function public.avisos_tg_abono() from public, anon, authenticated;

drop trigger if exists avisos_abono on public.pending_payments;
create constraint trigger avisos_abono
    after insert on public.pending_payments
    deferrable initially deferred
    for each row execute function public.avisos_tg_abono();

commit;

notify pgrst, 'reload schema';

-- Comprobación: tres «sí».
select to_regprocedure('public.avisos_tg_cobro_cita()') is not null as cobro,
       to_regprocedure('public.avisos_tg_abono()') is not null as abono,
       exists (select 1 from pg_trigger where tgname = 'avisos_abono') as trigger_abono;
