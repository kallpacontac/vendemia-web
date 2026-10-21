-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0006_notas_con_adjuntos.sql
--
-- Se corre DESPUÉS de aplicar la 0006. Todo dentro de BEGIN … ROLLBACK. Si algo falla se
-- para con «FALLO n: …»; si llega al final, la última fila dice «TODAS LAS PRUEBAS PASARON».
-- ═══════════════════════════════════════════════════════════════════════════════

begin;

create function pg_temp.ok(p boolean, p_n text) returns void language plpgsql as $$
begin
    if not coalesce(p, false) then raise exception 'FALLO %', p_n; end if;
end $$;
grant execute on function pg_temp.ok(boolean, text) to authenticated;

-- Llama a cfg_empresa_actualizar con `p_patch` y comprueba que se niega con un motivo que
-- contiene `p_motivo`.
create function pg_temp.rechaza(p_patch jsonb, p_motivo text, p_n text) returns void language plpgsql as $$
begin
    perform public.cfg_empresa_actualizar('zz-v2n-a', p_patch);
    raise exception 'FALLO % (lo aceptó)', p_n;
exception when others then
    if sqlerrm like 'FALLO %' then raise; end if;
    if position(p_motivo in sqlerrm) = 0 then raise exception 'FALLO % (motivo: %)', p_n, sqlerrm; end if;
end $$;
grant execute on function pg_temp.rechaza(jsonb, text, text) to authenticated;

insert into public.companies (id, name, business_mode) values ('zz-v2n-a', 'Barbería de prueba', 'appointment');
insert into public.datos_v2_empresas (company_id, config_en_nube) values ('zz-v2n-a', true);
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-v2n-m1', '00000000-0000-4000-8000-0000000002e1', 'zz-v2n-a', 'owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002e1","role":"authenticated"}';

-- 1 · Lo que manda el panel: la lista como texto. Se guarda el texto, sin claves de más.
select pg_temp.ok((public.cfg_empresa_actualizar('zz-v2n-a', jsonb_build_object('welcome_media',
    '[{"url":"https://res.cloudinary.com/x/image/upload/notas/zz/a.jpg","type":"image","name":"a.jpg","extra":1},'
    '{"url":"https://res.cloudinary.com/x/video/upload/notas/zz/b.m4a","type":"audio","name":"b.m4a"}]'))
    -> 'updated') ? 'welcome_media', '1a welcome_media en updated');
reset role;
select pg_temp.ok((select jsonb_array_length(welcome_media::jsonb) = 2 from public.companies where id = 'zz-v2n-a'), '1b dos adjuntos');
select pg_temp.ok((select welcome_media::jsonb -> 0 = '{"url":"https://res.cloudinary.com/x/image/upload/notas/zz/a.jpg","type":"image","name":"a.jpg"}'::jsonb
                     from public.companies where id = 'zz-v2n-a'), '1c sin la clave extra, en orden');
select pg_temp.ok((select welcome_media::jsonb -> 1 ->> 'type' = 'audio' from public.companies where id = 'zz-v2n-a'), '1d audio con url /video/');

-- 2 · La lista como JSON (lo que manda el bot) también vale.
set local role authenticated;
select public.cfg_empresa_actualizar('zz-v2n-a', '{"closing_media":[{"url":"https://res.cloudinary.com/x/video/upload/c.mov","type":"video","name":"c.mov"}]}');
reset role;
select pg_temp.ok((select closing_media::jsonb -> 0 ->> 'name' = 'c.mov' from public.companies where id = 'zz-v2n-a'), '2 lista jsonb');

-- 3 · Rechazos, cada uno con su motivo. Y no se guarda NADA del patch (tampoco el nombre).
set local role authenticated;
select pg_temp.rechaza('{"name":"Otro","welcome_media":"[{\"url\":\"https://otro.com/a.jpg\",\"type\":\"image\"}]"}',
                       'welcome_media: url que no es de Cloudinary', '3a otro host');
select pg_temp.rechaza('{"welcome_media":[{"url":"https://res.cloudinary.com.otro.com/a.jpg","type":"image"}]}',
                       'url que no es de Cloudinary', '3b host que empieza igual');
select pg_temp.rechaza('{"welcome_media":[{"url":"http://res.cloudinary.com/a.jpg","type":"image"}]}',
                       'url que no es de Cloudinary', '3c http');
select pg_temp.rechaza('{"welcome_media":[{"url":"https://res.cloudinary.com/a.pdf","type":"document"}]}',
                       'no válido', '3d documento');
select pg_temp.rechaza('{"closing_media":[{"url":"https://res.cloudinary.com/a.jpg","type":"image"},{"url":"https://res.cloudinary.com/a.jpg","type":"image"}]}',
                       'closing_media: adjunto repetido', '3e repetido');
select pg_temp.rechaza('{"welcome_media":[{"url":"https://res.cloudinary.com/1","type":"image"},{"url":"https://res.cloudinary.com/2","type":"image"},{"url":"https://res.cloudinary.com/3","type":"image"},{"url":"https://res.cloudinary.com/4","type":"image"}]}',
                       'como mucho 3', '3f cuatro');
select pg_temp.rechaza('{"welcome_media":"no es json"}', 'no es una lista JSON', '3g texto roto');
select pg_temp.rechaza('{"welcome_media":{"url":"https://res.cloudinary.com/1"}}', 'tiene que ser una lista', '3h objeto suelto');
reset role;
select pg_temp.ok((select name = 'Barbería de prueba' and jsonb_array_length(welcome_media::jsonb) = 2
                     from public.companies where id = 'zz-v2n-a'), '3i nada guardado tras un rechazo');

-- 4 · Quitar todos: [] , '' y null dejan '[]'.
set local role authenticated;
select public.cfg_empresa_actualizar('zz-v2n-a', '{"welcome_media":"[]","closing_media":null}');
reset role;
select pg_temp.ok((select welcome_media = '[]' and closing_media = '[]' from public.companies where id = 'zz-v2n-a'), '4 vaciar');

-- 5 · El ayudante no lo llama nadie de fuera.
select pg_temp.ok(not has_function_privilege('authenticated', 'public.v2_notas_media(text, jsonb)', 'execute'), '5 ayudante cerrado');

select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
