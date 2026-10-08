-- Pruebas de 0001_avisos_panel.sql. Todo dentro de BEGIN … ROLLBACK: no deja
-- nada. Si una falla, se corta con su motivo en rojo; si todas pasan, la última
-- fila dice «TODAS LAS PRUEBAS PASARON».
begin;

do $$
declare
    v_company text := 'barberia-01';
    v_lead text;
    n int;
    v_estado text;
begin
    select id into v_lead from public.leads where company_id = v_company limit 1;
    if v_lead is null then raise exception 'Hace falta algún lead de %', v_company; end if;

    -- 1 · Un pago de Mia apunta un evento pendiente.
    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id)
    values ('prueba-aviso-1', v_lead, v_company, 50, 'op-123');
    select count(*) into n from public.panel_push_events where ref = 'pago:prueba-aviso-1' and estado = 'pendiente';
    if n <> 1 then raise exception '1: el pago no apuntó evento (%).', n; end if;

    -- 2 · Lo que registra el propio dueño (registrar_pago) no le avisa.
    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id)
    values ('prueba-aviso-2', v_lead, v_company, 30, 'panel:abc');
    select count(*) into n from public.panel_push_events where ref = 'pago:prueba-aviso-2';
    if n <> 0 then raise exception '2: un pago del panel no debe avisar.'; end if;

    -- 3 · Anti-avalancha: una fila de hace 2 horas (espejo poniéndose al día) nace descartada.
    insert into public.pending_payments (id, lead_id, company_id, amount, operation_id, created_at)
    values ('prueba-aviso-3', v_lead, v_company, 20, 'op-456', extract(epoch from now() - interval '2 hours')::bigint);
    select estado into v_estado from public.panel_push_events where ref = 'pago:prueba-aviso-3';
    if v_estado is distinct from 'descartado' then raise exception '3: esperaba descartado, salió %.', v_estado; end if;

    -- 4 · El mismo hecho dos veces = un evento.
    perform public.avisos_apuntar(v_company, 'plan', 'prueba-dup', '{}'::jsonb);
    perform public.avisos_apuntar(v_company, 'plan', 'prueba-dup', '{}'::jsonb);
    select count(*) into n from public.panel_push_events where ref = 'prueba-dup';
    if n <> 1 then raise exception '4: dedupe roto (%).', n; end if;

    -- 5 · Silencio en hora de Lima (UTC-5): 23:30 Lima = 04:30 UTC.
    if not public.avisos_en_silencio('22:00', '07:00', '2026-10-08 04:30+00') then raise exception '5a: 23:30 debía ser silencio.'; end if;
    if public.avisos_en_silencio('22:00', '07:00', '2026-10-08 15:00+00') then raise exception '5b: 10:00 no es silencio.'; end if;
    if not public.avisos_en_silencio('13:00', '15:00', '2026-10-08 19:00+00') then raise exception '5c: 14:00 dentro de 13–15.'; end if;
    if public.avisos_en_silencio(null, '07:00', now()) then raise exception '5d: sin horario no hay silencio.'; end if;

    -- 6 · WhatsApp: se cae → evento a +5 min; vuelve → cancelado. Solo si hay instancia.
    if exists (select 1 from public.instances where company_id = v_company) then
        update public.instances set wa_connected = true  where company_id = v_company;
        update public.instances set wa_connected = false where company_id = v_company;
        select count(*) into n from public.panel_push_events
         where company_id = v_company and tipo = 'whatsapp' and estado = 'pendiente' and not_before > now() + interval '4 minutes';
        if n <> 1 then raise exception '6a: la caída no apuntó evento a +5 min (%).', n; end if;
        update public.instances set wa_connected = true where company_id = v_company;
        select count(*) into n from public.panel_push_events
         where company_id = v_company and tipo = 'whatsapp' and estado = 'pendiente';
        if n <> 0 then raise exception '6b: al volver debía cancelarse.'; end if;
    else
        raise notice '6: sin fila en instances para %, se salta.', v_company;
    end if;

    -- 7 · avisos_disparar no rompe aunque falte el secreto (solo avisa).
    perform public.avisos_disparar();

    raise notice 'TODAS LAS PRUEBAS PASARON';
end $$;

rollback;

-- El editor de Supabase no enseña los NOTICE. Si alguna prueba falla, el DO de
-- arriba corta con un error en rojo y esta línea no llega a ejecutarse.
select 'TODAS LAS PRUEBAS PASARON' as resultado;
