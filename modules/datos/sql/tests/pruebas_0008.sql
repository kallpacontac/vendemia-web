-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0008_mia_gerente.sql
--
-- Se corre DESPUÉS de aplicar la 0008. Todo dentro de BEGIN … ROLLBACK. Si algo falla se
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

-- Un negocio con dueña (…3a1), administrador (…3a2) y empleado (…3a3).
insert into public.companies (id, name) values ('zz-mg-a', 'Academia de prueba');
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-mg-m1', '00000000-0000-4000-8000-0000000003a1', 'zz-mg-a', 'owner'),
    ('zz-mg-m2', '00000000-0000-4000-8000-0000000003a2', 'zz-mg-a', 'admin'),
    ('zz-mg-m3', '00000000-0000-4000-8000-0000000003a3', 'zz-mg-a', 'member');
insert into public.leads (id, company_id, phone, name, source) values ('zz-mg-carla', 'zz-mg-a', '51999000111', 'Carla', 'whatsapp');
insert into public.catalog (id, company_id, name, stock) values ('zz-mg-polo', 'zz-mg-a', 'Polo negro', 12);
insert into public.catalog (id, company_id, name) values ('zz-mg-clase', 'zz-mg-a', 'Clase suelta');
insert into public.catalog_variantes (id, company_id, catalog_id, etiqueta, stock)
    values ('zz-mg-polo-m', 'zz-mg-a', 'zz-mg-polo', 'M', 4);

-- ═══ BORRADORES ═══

-- 1 · Solo el bot los crea, y valida lo que manda.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}';
select pg_temp.esperar_error($$select public.borrador_srv_crear('zz-mg-a', 'zz-mg-carla', '{"objetivo":"ofrecer","texto":"Hola"}')$$,
                             'permission denied|solo el bot', '1a la dueña no crea borradores');
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.esperar_error($$select public.borrador_srv_crear('zz-mg-a', 'zz-mg-otro', '{"objetivo":"ofrecer","texto":"Hola"}')$$,
                             'no es de este negocio', '1b lead ajeno');
select pg_temp.esperar_error($$select public.borrador_srv_crear('zz-mg-a', 'zz-mg-carla', '{"objetivo":"vender","texto":"Hola"}')$$,
                             'objetivo no válido', '1c objetivo');
select pg_temp.esperar_error($$select public.borrador_srv_crear('zz-mg-a', 'zz-mg-carla',
                             '{"objetivo":"ofrecer","texto":"Hola","adjunto":{"url":"https://otro.com/a.jpg","type":"image"}}')$$,
                             'adjunto no válido', '1d adjunto fuera de Cloudinary');
select pg_temp.esperar_error($$select public.borrador_srv_crear('zz-mg-a', 'zz-mg-carla',
                             '{"objetivo":"ofrecer","texto":"Hola","encargo":{"precio_lista":280,"entrada":30,"escalon":20,"tope":25,"vence":"2026-10-26"}}')$$,
                             'encargo no válido', '1e entrada mayor que el escalón');

-- 2 · El bueno: oferta con tope de S/ 25 sobre S/ 280 (mínimo S/ 255).
-- Su id se guarda en un ajuste de la transacción, no en una tabla temporal: con `set local role
-- authenticated` las tablas temporales de la sesión no se ven («relation does not exist»).
select set_config('prueba.borrador', public.borrador_srv_crear('zz-mg-a', 'zz-mg-carla', jsonb_build_object(
    'objetivo', 'ofrecer',
    'texto', 'Hola Carla, soy {firma} de Kallpa. Si la inscribes esta semana te lo dejo en S/ 270. ¿Te separo el sábado?',
    'adjunto', jsonb_build_object('url', 'https://res.cloudinary.com/x/video/upload/clase.mp4', 'type', 'video', 'name', 'clase.mp4'),
    'audio', jsonb_build_object('guion', 'A Sofía nadie la va a apurar.', 'segundos', 15),
    'encargo', jsonb_build_object('producto', 'Trimestral', 'precio_lista', 280, 'entrada', 10, 'escalon', 20, 'tope', 25, 'vence', '2026-10-26')))::text,
    true);
-- Uno nuevo para el mismo cliente reemplaza al anterior.
select public.borrador_srv_crear('zz-mg-a', 'zz-mg-carla', '{"objetivo":"avisar","texto":"Viejo"}');
reset role;
select pg_temp.ok((select count(*) = 1 from public.borradores where company_id = 'zz-mg-a' and estado = 'por_aprobar'), '2a uno por aprobar por cliente');
select pg_temp.ok((select texto = 'Viejo' from public.borradores where company_id = 'zz-mg-a' and estado = 'por_aprobar'), '2b gana el último');
-- Se deja por aprobar el de la oferta para seguir.
update public.borradores set estado = 'descartado' where company_id = 'zz-mg-a' and texto = 'Viejo';
update public.borradores set estado = 'por_aprobar' where id = current_setting('prueba.borrador')::uuid;

-- 3 · Quién lo ve: dueña y administrador sí; el empleado no.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}';
select pg_temp.ok((select count(*) = 0 from public.borradores), '3a el empleado no ve borradores');
select pg_temp.esperar_error(format('select public.borrador_aprobar(%L)', current_setting('prueba.borrador')::uuid),
                             'dueño o el administrador', '3b el empleado no aprueba');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}';
select pg_temp.ok((select count(*) = 1 from public.borradores where estado = 'por_aprobar'), '3c el administrador lo ve');

-- 4 · Aprobar con el texto corregido por debajo del mínimo: no sale.
select pg_temp.esperar_error(format('select public.borrador_aprobar(%L, %L)', current_setting('prueba.borrador')::uuid,
                                    'Hola Carla, soy Lucía. Te lo dejo en S/ 240.'),
                             'S/ 240 .*S/ 255', '4a precio por debajo del tope');
-- «S/ 10 menos» es la rebaja, no un precio: pasa. Y el administrador sin nombre no puede dejar {firma}.
select pg_temp.esperar_error(format('select public.borrador_aprobar(%L)', current_setting('prueba.borrador')::uuid),
                             'tu nombre', '4b {firma} sin nombre');
select public.borrador_aprobar(current_setting('prueba.borrador')::uuid, 'Hola Carla, soy Lucía. S/ 10 menos si es esta semana. ¿Te separo el sábado?');
reset role;
select pg_temp.ok((select estado = 'aprobado' and aprobado_por = '00000000-0000-4000-8000-0000000003a2'
                          and texto_final like 'Hola Carla, soy Lucía%'
                     from public.borradores where id = current_setting('prueba.borrador')::uuid), '4c aprobado por el administrador');
-- De día va a la cola en el acto; de noche se programa (las dos ramas se miran por la hora real).
select pg_temp.ok((select (programado_para is null and comando_at is not null
                           and exists (select 1 from public.commands c where c.type = 'enviar_borrador'
                                        and c.payload ->> 'borrador_id' = b.id::text
                                        and c.created_by = '00000000-0000-4000-8000-0000000003a2'))
                       or (programado_para > now() and comando_at is null)
                     from public.borradores b where id = current_setting('prueba.borrador')::uuid), '4d a la cola o programado');

-- 5 · No se aprueba dos veces ni se descarta lo aprobado.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}';
select pg_temp.esperar_error(format('select public.borrador_aprobar(%L)', current_setting('prueba.borrador')::uuid), 'ya está aprobado', '5a dos veces');
select pg_temp.esperar_error(format('select public.borrador_descartar(%L)', current_setting('prueba.borrador')::uuid), 'no se puede descartar', '5b descartar aprobado');
reset role;

-- 6 · El bot cuenta el resultado.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select public.borrador_srv_resultado(current_setting('prueba.borrador')::uuid, true);
reset role;
select pg_temp.ok((select estado = 'enviado' and enviado_at is not null from public.borradores where id = current_setting('prueba.borrador')::uuid), '6 enviado');

-- 7 · Más de un día por aprobar: no se aprueba; el reloj lo caduca.
insert into public.borradores (company_id, lead_id, objetivo, texto, created_at)
values ('zz-mg-a', 'zz-mg-carla', 'avisar', 'De ayer', now() - interval '25 hours');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}';
select pg_temp.esperar_error(format('select public.borrador_aprobar(%L)',
                                    (select id from public.borradores where company_id = 'zz-mg-a' and texto = 'De ayer')),
                             'más de un día', '7a viejo');
reset role;
select public.borradores_reloj();
select pg_temp.ok((select estado = 'caducado' from public.borradores where company_id = 'zz-mg-a' and texto = 'De ayer'), '7b caducado');

-- ═══ AVISOS DE STOCK ═══

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}';

-- 8 · Poner: producto entero y una talla.
select pg_temp.ok((public.aviso_stock_poner('zz-mg-a', 'zz-mg-polo', null, 5) ->> 'stock')::int = 12, '8a devuelve el stock actual');
select pg_temp.ok((public.aviso_stock_poner('zz-mg-a', 'zz-mg-polo', 'zz-mg-polo-m', 4) ->> 'ya_por_debajo')::boolean, '8b la M ya está en el mínimo');
select pg_temp.esperar_error($$select public.aviso_stock_poner('zz-mg-a', 'zz-mg-clase', null, 2)$$, 'no llevas control de stock', '8c sin stock');
select pg_temp.esperar_error($$select public.aviso_stock_poner('zz-mg-a', 'zz-mg-nada', null, 2)$$, 'no está en tu catálogo', '8d no existe');
select pg_temp.esperar_error($$select public.aviso_stock_poner('zz-mg-a', 'zz-mg-polo', null, -1)$$, 'de 0 en adelante', '8e negativo');
-- Cambiar el mínimo no duplica.
select public.aviso_stock_poner('zz-mg-a', 'zz-mg-polo', null, 6);
select pg_temp.ok((select count(*) = 2 and min(minimo) = 4 and max(minimo) = 6 from public.avisos_stock), '8f el mismo aviso, otro mínimo');

-- 9 · Cada uno ve los suyos; el empleado no pone avisos.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a2","role":"authenticated"}';
select pg_temp.ok((select count(*) = 0 from public.avisos_stock), '9a el administrador no ve los de la dueña');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000003a3","role":"authenticated"}';
select pg_temp.esperar_error($$select public.aviso_stock_poner('zz-mg-a', 'zz-mg-polo', null, 5)$$, 'dueño y del administrador', '9b el empleado no');
reset role;

-- 10 · El bot, en nombre de quien preguntó; y no para un empleado.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select pg_temp.ok(jsonb_array_length(public.avisos_stock_srv_de('zz-mg-a', '00000000-0000-4000-8000-0000000003a1')) = 2, '10a lista de la dueña');
select pg_temp.esperar_error($$select public.aviso_stock_srv_poner('zz-mg-a', '00000000-0000-4000-8000-0000000003a3', 'zz-mg-polo', null, 3)$$,
                             'dueño y del administrador', '10b no para un empleado');
select pg_temp.ok(public.aviso_stock_srv_quitar('zz-mg-a', '00000000-0000-4000-8000-0000000003a1',
                   (select id from public.avisos_stock where variante_id = 'zz-mg-polo-m')), '10c quitar');
reset role;
select pg_temp.ok((select count(*) = 1 from public.avisos_stock where company_id = 'zz-mg-a'), '10d queda uno');

-- 11 · Nada de esto lo llama alguien de fuera.
select pg_temp.ok(not has_function_privilege('authenticated', 'public.borrador_srv_crear(text, text, jsonb)', 'execute'), '11a srv_crear cerrado');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.borradores_reloj()', 'execute'), '11b reloj cerrado');
select pg_temp.ok(not has_function_privilege('anon', 'public.borrador_aprobar(uuid, text)', 'execute'), '11c anon no aprueba');
select pg_temp.ok(not has_function_privilege('authenticated', 'public.aviso_stock_srv_poner(text, uuid, text, text, integer)', 'execute'), '11d srv_poner cerrado');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
