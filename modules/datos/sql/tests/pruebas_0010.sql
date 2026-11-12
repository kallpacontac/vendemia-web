-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0010_comprobante_al_cobrar.sql
--
-- Se corre DESPUÉS de aplicar la 0010. Todo dentro de BEGIN … ROLLBACK. Si algo falla se
-- para con «FALLO n: …»; si llega al final, la última fila dice «TODAS LAS PRUEBAS PASARON».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create function pg_temp.esperar_error(p_sql text, p_patron text, p_n text) returns void language plpgsql as $$
begin
    begin
        execute p_sql;
    exception when others then
        if sqlerrm !~ p_patron then
            raise exception 'FALLO %: esperaba «%» y salió «%»', p_n, p_patron, sqlerrm;
        end if;
        return;
    end;
    raise exception 'FALLO %: esperaba el error «%» y no hubo error', p_n, p_patron;
end $$;
grant execute on function pg_temp.esperar_error(text, text, text) to authenticated, service_role;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated, service_role;

-- Montaje: un negocio con la agenda en la nube; dueña (…a1), administrador (…a2) y empleado (…a3).
insert into public.companies (id, name) values ('zz-cf-a', 'Barbería de prueba');
insert into public.datos_v2_empresas (company_id, config_en_nube, agenda_en_nube) values ('zz-cf-a', true, true)
    on conflict (company_id) do update set agenda_en_nube = true;
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-cf-m1', '00000000-0000-4000-8000-0000000010a1', 'zz-cf-a', 'owner'),
    ('zz-cf-m2', '00000000-0000-4000-8000-0000000010a2', 'zz-cf-a', 'admin'),
    ('zz-cf-m3', '00000000-0000-4000-8000-0000000010a3', 'zz-cf-a', 'member');
insert into public.leads (id, company_id, phone, name, intent, status, created_at, bot_active, source, last_activity_at)
values ('zz-cf-l1', 'zz-cf-a', '51900001010', 'Diego Prueba', 'inquiry', 'exploring',
        extract(epoch from now())::bigint, 0, 'web', extract(epoch from now())::bigint);
-- Tres citas confirmadas de S/ 80, sin cobrar.
insert into public.appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status,
                                 created_at, pagado_por, cumplido_por, metodo_pago, beneficiario)
select 'zz-cf-c' || i, 'zz-cf-a', 'zz-cf-l1', 'Corte', '2026-12-0' || i || ' 10:00', '2026-12-0' || i || ' 10:30', 30, '', 'confirmed',
       extract(epoch from now())::bigint, '', '', '', ''
  from generate_series(1, 3) i;
insert into public.appointment_services (id, appointment_id, company_id, catalog_item_id, name, price, duration_minutes, sort_order)
select 'zz-cf-c' || i || '-s', 'zz-cf-c' || i, 'zz-cf-a', '', 'Corte', 80, 30, 0 from generate_series(1, 3) i;

-- Una foto «buena»: de Cloudinary, con su huella.
create function pg_temp.foto(p_letra text, p_op text) returns jsonb language sql as $$
    select jsonb_build_object('url', 'https://res.cloudinary.com/demo/image/upload/zz-' || p_letra || '.jpg',
                              'hash', repeat(p_letra, 64), 'operacion', p_op);
$$;
grant execute on function pg_temp.foto(text, text) to authenticated, service_role;

set local role authenticated;

-- ── El empleado ──────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000010a3","role":"authenticated"}';
-- 1 · Ve la opción (la Agenda la necesita) y por defecto está apagada.
select pg_temp.ok(public.cobro_foto_modo('zz-cf-a') = '{"modo":"apagada","nube":true}'::jsonb, '1 modo por defecto');
-- 2 · No la cambia, ni pasa la puerta de la foto.
select pg_temp.esperar_error($$select public.cobro_foto_guardar('zz-cf-a', 'opcional')$$, 'solo lo cambia el dueño', '2a');
select pg_temp.esperar_error($$select public.cobro_foto_permiso('zz-cf-a')$$, 'dueño o el administrador', '2b');

-- ── El administrador ─────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000010a2","role":"authenticated"}';
-- 3 · Tampoco la cambia: protege el dinero del dueño.
select pg_temp.esperar_error($$select public.cobro_foto_guardar('zz-cf-a', 'apagada')$$, 'solo lo cambia el dueño', '3');
-- 4 · Apagada: la puerta de la foto no se abre.
select pg_temp.esperar_error($$select public.cobro_foto_permiso('zz-cf-a')$$, 'apagada en Configuración', '4');

-- ── La dueña ─────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000010a1","role":"authenticated"}';
select pg_temp.esperar_error($$select public.cobro_foto_guardar('zz-cf-a', 'siempre')$$, 'Opción no válida', '5 valor raro');
select pg_temp.ok(public.cobro_foto_guardar('zz-cf-a', 'obligatoria') ->> 'modo' = 'obligatoria', '6 la dueña la cambia');

-- ── El administrador cobra con «obligatoria» ─────────────────────────────────
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000010a2","role":"authenticated"}';
select pg_temp.ok(public.cobro_foto_permiso('zz-cf-a') = 'obligatoria', '7 puerta abierta');

-- 8 · Yape sin foto: no se registra.
select pg_temp.esperar_error($$select public.agenda_registrar_pago('zz-cf-a',
    '{"lead_id":"zz-cf-l1","appointment_id":"zz-cf-c1","monto":30,"metodo_pago":"yape"}', 'zz-cf-op8')$$, 'pide la foto', '8');
-- 9 · Efectivo sin foto: sí.
select pg_temp.ok((public.agenda_registrar_pago('zz-cf-a',
    '{"lead_id":"zz-cf-l1","appointment_id":"zz-cf-c1","monto":20,"metodo_pago":"cash"}', 'zz-cf-op9') ->> 'foto')::boolean = false, '9 efectivo');
-- 10 · Una foto que no subió el servidor: fuera.
select pg_temp.esperar_error($$select public.agenda_registrar_pago('zz-cf-a',
    jsonb_build_object('lead_id','zz-cf-l1','appointment_id','zz-cf-c1','monto',30,'metodo_pago','yape',
                       'foto', jsonb_build_object('url','https://otro.sitio/x.jpg','hash',repeat('a',64))), 'zz-cf-op10')$$, 'no es válida', '10');
-- 11 · Con su foto: entra, con la operación leída y la foto en el pago.
select pg_temp.ok((public.agenda_registrar_pago('zz-cf-a',
    jsonb_build_object('lead_id','zz-cf-l1','appointment_id','zz-cf-c1','monto',30,'metodo_pago','yape',
                       'foto', pg_temp.foto('a', 'op 1234-5678')), 'zz-cf-op11') ->> 'foto')::boolean, '11 con foto');
-- 12 · La misma foto otra vez: no.
select pg_temp.esperar_error($$select public.agenda_registrar_pago('zz-cf-a',
    jsonb_build_object('lead_id','zz-cf-l1','appointment_id','zz-cf-c2','monto',10,'metodo_pago','yape',
                       'foto', pg_temp.foto('a', '')), 'zz-cf-op12')$$, 'misma foto', '12');
-- 13 · Otra foto con la misma operación: no.
select pg_temp.esperar_error($$select public.agenda_registrar_pago('zz-cf-a',
    jsonb_build_object('lead_id','zz-cf-l1','appointment_id','zz-cf-c2','monto',10,'metodo_pago','plin',
                       'foto', pg_temp.foto('b', '12345678')), 'zz-cf-op13')$$, 'operación #12345678', '13');

-- 14 · «Cobrada» por Yape sin foto: no. Con foto: sí, y queda apuntada con lo que faltaba.
select pg_temp.esperar_error($$select public.agenda_marcar_pagado('zz-cf-a',
    '{"tipo":"appointment","id":"zz-cf-c2","metodo_pago":"yape"}')$$, 'pide la foto', '14a');
select pg_temp.ok((public.agenda_marcar_pagado('zz-cf-a',
    jsonb_build_object('tipo','appointment','id','zz-cf-c2','metodo_pago','yape','foto', pg_temp.foto('c', '87654321'))) ->> 'foto')::boolean, '14b');
-- 15 · «Cobrada» en efectivo: sin foto, como siempre.
select pg_temp.ok((public.agenda_marcar_pagado('zz-cf-a',
    '{"tipo":"appointment","id":"zz-cf-c3","metodo_pago":"cash"}') ->> 'pagado_por') = 'panel', '15');

-- 16 · Las fotos de hoy en la Caja: las dos.
select pg_temp.ok(jsonb_array_length(public.cobro_fotos_del_dia('zz-cf-a',
    to_char(now() at time zone 'America/Lima', 'YYYY-MM-DD'))) = 2, '16 fotos del día');
select pg_temp.esperar_error($$select public.cobro_fotos_del_dia('zz-cf-a', 'ayer')$$, 'Día no válido', '16b');

-- ── Lo guardado (sin RLS de por medio) ───────────────────────────────────────
reset role;
select pg_temp.ok((select operation_id = '12345678' and image_hash = repeat('a', 64) and voucher_path like 'https://res.cloudinary.com/%'
                     from public.pending_payments where company_id = 'zz-cf-a' and amount = 30), '17 foto en el pago');
select pg_temp.ok((select count(*) = 2 from public.comprobantes_cobro where company_id = 'zz-cf-a'), '18 dos fotos');
select pg_temp.ok((select pago_id <> '' and subido_por = '00000000-0000-4000-8000-0000000010a2'::uuid
                     from public.comprobantes_cobro where company_id = 'zz-cf-a' and via = 'registrar_pago'), '19 enlazada al pago');
select pg_temp.ok((select pago_id = '' and monto = 80 from public.comprobantes_cobro where company_id = 'zz-cf-a' and via = 'cobrada'),
                  '20 cobrada con lo que faltaba');
select pg_temp.ok((select pagado_por = 'panel' from public.appointments where id = 'zz-cf-c2'), '21 c2 cobrada');

-- 22 · El servidor (el bot) no necesita la foto: ya trae su propia captura.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.ok((public.agenda_registrar_pago('zz-cf-a',
    '{"lead_id":"zz-cf-l1","appointment_id":"zz-cf-c1","monto":5,"metodo_pago":"yape"}', 'zz-cf-op22') ->> 'foto')::boolean = false, '22');
reset role;

-- 23 · Apagada otra vez: Yape sin foto vuelve a entrar.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000010a1","role":"authenticated"}';
select public.cobro_foto_guardar('zz-cf-a', 'apagada');
select pg_temp.ok(public.agenda_registrar_pago('zz-cf-a',
    '{"lead_id":"zz-cf-l1","appointment_id":"zz-cf-c1","monto":5,"metodo_pago":"yape"}', 'zz-cf-op23') ? 'detalle', '23 apagada');

-- 24 · «Validar pago» de canchas sigue la misma regla: obligatoria, sin foto no; con foto sí.
select public.cobro_foto_guardar('zz-cf-a', 'obligatoria');
select pg_temp.esperar_error($$select public.cancha_validar_pago('zz-cf-a', 'zz-cf-c1', 5, 'plin')$$, 'pide la foto', '24a');
select pg_temp.ok((public.cancha_validar_pago('zz-cf-a', 'zz-cf-c1', 5, 'plin',
    'https://res.cloudinary.com/demo/image/upload/zz-d.jpg', repeat('d', 64), '55556666') ->> 'foto')::boolean, '24b');
-- 25 · …y no deja repetir una operación que entró por otro botón.
select pg_temp.esperar_error($$select public.cancha_validar_pago('zz-cf-a', 'zz-cf-c1', 5, 'yape',
    'https://res.cloudinary.com/demo/image/upload/zz-e.jpg', repeat('e', 64), '87654321')$$, 'operación #87654321', '25');
reset role;
select pg_temp.ok((select count(*) = 1 from public.comprobantes_cobro where company_id = 'zz-cf-a' and via = 'cancha' and pago_id <> ''), '26 cancha enlazada');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
