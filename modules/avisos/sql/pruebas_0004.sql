-- Pruebas de 0004_avisos_al_equipo.sql. Todo dentro de BEGIN … ROLLBACK: no deja nada.
-- Si una falla, se corta con su motivo; si todas pasan, la última fila dice
-- «TODAS LAS PRUEBAS PASARON».
begin;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;

-- Una hora de Lima dentro de N minutos, en el formato de slot_start.
create function pg_temp.slot(p_min int) returns text language sql as $$
    select to_char((now() + make_interval(mins => p_min)) at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI')
$$;

-- La barbería: dueña, un barbero (Luis) con su ficha enlazada y otro (Pedro) sin enlazar.
insert into public.companies (id, name, business_mode) values ('zz-av4-a', 'Barbería de prueba', 'appointment');
insert into public.employees (id, company_id, name) values
    ('zz-av4-luis', 'zz-av4-a', 'Luis'), ('zz-av4-pedro', 'zz-av4-a', 'Pedro');
insert into public.memberships (id, auth_user_id, company_id, role, employee_id) values
    ('zz-av4-m1', '00000000-0000-4000-8000-0000000004c1', 'zz-av4-a', 'owner', null),
    ('zz-av4-m2', '00000000-0000-4000-8000-0000000004c2', 'zz-av4-a', 'member', 'zz-av4-luis');
insert into public.leads (id, company_id, phone, name, source) values ('zz-av4-ana', 'zz-av4-a', '51999000333', 'Ana', 'whatsapp');
insert into public.panel_push_subscriptions (auth_user_id, company_id, endpoint, p256dh, auth, silencio_desde, silencio_hasta) values
    ('00000000-0000-4000-8000-0000000004c1', 'zz-av4-a', 'https://push.example/duena-0000000004', repeat('p', 40), repeat('a', 16), null, null),
    ('00000000-0000-4000-8000-0000000004c2', 'zz-av4-a', 'https://push.example/luis-00000000004', repeat('p', 40), repeat('a', 16), null, null);

create function pg_temp.eventos(p_que text) returns bigint language sql as $$
    select count(*) from public.panel_push_events
     where company_id = 'zz-av4-a' and tipo = 'mi_agenda' and datos ->> 'que' = p_que
$$;
create function pg_temp.le_llega(p_user text, p_tipo text, p_que text) returns boolean language sql as $$
    select bool_or(public.avisos_para_equipo(p_user::uuid, 'zz-av4-a', p_tipo, e.datos))
      from public.panel_push_events e
     where e.company_id = 'zz-av4-a' and e.tipo = p_tipo and (p_que is null or e.datos ->> 'que' = p_que)
$$;

-- 1 · Cita nueva con Luis, pasado mañana: a Luis sí; a la dueña no (ya le llega la 'reserva').
insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id, created_at)
values ('zz-av4-c1', 'zz-av4-a', 'zz-av4-ana', 'Corte + barba', pg_temp.slot(2 * 24 * 60), 'confirmed', 'zz-av4-luis',
        extract(epoch from now())::bigint);
select pg_temp.ok(pg_temp.eventos('nueva') = 1, '1a nueva cita apuntada');
select pg_temp.ok(pg_temp.le_llega('00000000-0000-4000-8000-0000000004c2', 'mi_agenda', 'nueva'), '1b le llega a Luis');
select pg_temp.ok(not pg_temp.le_llega('00000000-0000-4000-8000-0000000004c1', 'mi_agenda', 'nueva'), '1c no se le repite a la dueña');

-- 2 · Se mueve de hora: a Luis.
update public.appointments set slot_start = pg_temp.slot(2 * 24 * 60 + 60) where id = 'zz-av4-c1';
select pg_temp.ok(pg_temp.eventos('movida') = 1, '2 movida');

-- 3 · Pasa a Pedro: «quitada» para Luis, «asignada» para Pedro (que no tiene a nadie enlazado).
update public.appointments set employee_id = 'zz-av4-pedro' where id = 'zz-av4-c1';
select pg_temp.ok(pg_temp.eventos('quitada') = 1 and pg_temp.eventos('asignada') = 1, '3a quitada y asignada');
select pg_temp.ok(pg_temp.le_llega('00000000-0000-4000-8000-0000000004c2', 'mi_agenda', 'quitada'), '3b a Luis le llega la quitada');
select pg_temp.ok(not pg_temp.le_llega('00000000-0000-4000-8000-0000000004c2', 'mi_agenda', 'asignada'), '3c la de Pedro no le llega a Luis');

-- 4 · Vuelve a Luis y se cancela.
update public.appointments set employee_id = 'zz-av4-luis' where id = 'zz-av4-c1';
update public.appointments set status = 'cancelled' where id = 'zz-av4-c1';
select pg_temp.ok(pg_temp.eventos('cancelada') = 1, '4 cancelada');

-- 5 · Sin asignar: a Luis (empleado), no a la dueña.
insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id, created_at)
values ('zz-av4-c2', 'zz-av4-a', 'zz-av4-ana', 'Corte', pg_temp.slot(3 * 24 * 60), 'confirmed', '', extract(epoch from now())::bigint);
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av4-a' and tipo = 'mi_agenda'
                     and datos ->> 'cita' = 'zz-av4-c2' and datos ->> 'empleado' = ''), '5a sin asignar apuntada');
select pg_temp.ok((select public.avisos_para_equipo('00000000-0000-4000-8000-0000000004c2'::uuid, 'zz-av4-a', 'mi_agenda', datos)
                     and not public.avisos_para_equipo('00000000-0000-4000-8000-0000000004c1'::uuid, 'zz-av4-a', 'mi_agenda', datos)
                     from public.panel_push_events where datos ->> 'cita' = 'zz-av4-c2'), '5b a los empleados, no a la dueña');

-- 6 · Lo que ya pasó no avisa.
insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id, created_at)
values ('zz-av4-c3', 'zz-av4-a', 'zz-av4-ana', 'Corte', pg_temp.slot(-120), 'confirmed', 'zz-av4-luis', extract(epoch from now())::bigint);
select pg_temp.ok((select count(*) = 0 from public.panel_push_events where datos ->> 'cita' = 'zz-av4-c3'), '6 pasado no avisa');

-- 7 · Recordatorio: una cita de Luis dentro de 10 min, creada ayer. Uno solo aunque el reloj pase dos veces.
insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id, created_at)
values ('zz-av4-c4', 'zz-av4-a', 'zz-av4-ana', 'Corte', pg_temp.slot(10), 'confirmed', 'zz-av4-luis',
        extract(epoch from now() - interval '1 day')::bigint);
select public.avisos_generar_recordatorios();
select public.avisos_generar_recordatorios();
select pg_temp.ok((select count(*) = 1 from public.panel_push_events where company_id = 'zz-av4-a' and tipo = 'recordatorio'
                     and datos ->> 'cita' = 'zz-av4-c4'), '7a un recordatorio');
select pg_temp.ok(pg_temp.le_llega('00000000-0000-4000-8000-0000000004c2', 'recordatorio', null), '7b le llega a Luis');
select pg_temp.ok(not pg_temp.le_llega('00000000-0000-4000-8000-0000000004c1', 'recordatorio', null), '7c no a la dueña');

-- 8 · Una cita recién creada dentro de 15 min no se recuerda (su aviso de «nueva» acaba de llegar).
insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id, created_at)
values ('zz-av4-c5', 'zz-av4-a', 'zz-av4-ana', 'Corte', pg_temp.slot(8), 'confirmed', 'zz-av4-luis', extract(epoch from now())::bigint);
select public.avisos_generar_recordatorios();
select pg_temp.ok((select count(*) = 0 from public.panel_push_events where tipo = 'recordatorio' and datos ->> 'cita' = 'zz-av4-c5'), '8 recién creada no se recuerda');

-- 9 · Los avisos del dueño siguen siendo del dueño: a Luis no le llega una 'reserva'.
select pg_temp.ok(not public.avisos_recibe('00000000-0000-4000-8000-0000000004c2'::uuid, 'zz-av4-a'), '9a el empleado no recibe lo del dueño');
select pg_temp.ok(position('avisos_para_equipo' in pg_get_functiondef('public.panel_push_srv_pendientes()'::regprocedure)) > 0,
                  '9b el despachador usa avisos_para_equipo');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
