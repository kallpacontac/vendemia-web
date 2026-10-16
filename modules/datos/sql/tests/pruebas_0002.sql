-- ═══════════════════════════════════════════════════════════════════════════════
-- ARQUITECTURA v2 · PRUEBAS DE 0002_variantes_y_ajustes.sql
--
-- Todo dentro de BEGIN … ROLLBACK. Si algo falla se para con «FALLO n: …»; si llega al
-- final, la última fila dice «TODAS LAS PRUEBAS PASARON». Necesita la 0001 aplicada.
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

insert into public.companies (id, name) values ('zz-v2b-a', 'Variantes A');
insert into public.datos_v2_empresas (company_id, config_en_nube) values ('zz-v2b-a', true);
insert into public.memberships (id, auth_user_id, company_id, role) values
    ('zz-v2b-m1', '00000000-0000-4000-8000-0000000002c1', 'zz-v2b-a', 'owner');
insert into public.catalog (id, company_id, name, stock) values ('zz-v2b-polo', 'zz-v2b-a', 'Polo', 99);
insert into public.catalog (id, company_id, name, stock) values ('zz-v2b-gorra', 'zz-v2b-a', 'Gorra', 5);

-- 1 · Claves de pregunta: la del ejemplo del bot, y una sin nada que decir.
select pg_temp.ok(public.v2_clave_de_pregunta('¿Desde qué distrito nos escribes?') = 'distrito', '1a distrito');
select pg_temp.ok(public.v2_clave_de_pregunta('¿Qué edad tiene tu hijo?') = 'edad_hijo', '1b edad_hijo');
select pg_temp.ok(public.v2_clave_de_pregunta('¿?') = 'respuesta', '1c respuesta');

-- 2 · conClaves: completa la que falta, no toca la puesta, no repite.
select pg_temp.ok(
    public.v2_con_claves('[{"question":"¿Desde qué distrito nos escribes?"},{"question":"Distrito","field_key":"distrito"}]')::jsonb
      = '[{"question":"¿Desde qué distrito nos escribes?","field_key":"distrito_2"},{"question":"Distrito","field_key":"distrito"}]'::jsonb,
    '2a completa sin repetir');
select pg_temp.ok(public.v2_con_claves('no es json') = 'no es json', '2b texto roto, tal cual');
select pg_temp.ok(public.v2_con_claves('[{"question":"x","field_key":"k"}]') = '[{"question":"x","field_key":"k"}]', '2c sin cambios, tal cual');

-- ── El dueño ──────────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002c1","role":"authenticated"}';

-- 3 · Guardar variantes deja catalog.stock = suma.
select public.cfg_variante_guardar('zz-v2b-a', 'zz-v2b-polo', 'S', 3, '{"talla":"S"}');
select public.cfg_variante_guardar('zz-v2b-a', 'zz-v2b-polo', 'M', 2, '{"talla":"M"}');
select pg_temp.ok((select stock = 5 from public.catalog where id = 'zz-v2b-polo'), '3 suma');

-- 4 · La misma etiqueta actualiza, no duplica.
select public.cfg_variante_guardar('zz-v2b-a', 'zz-v2b-polo', ' M ', 7, '{"talla":"M"}');
select pg_temp.ok((select count(*) = 2 from public.catalog_variantes where catalog_id = 'zz-v2b-polo'), '4a no duplica');
select pg_temp.ok((select stock = 10 from public.catalog where id = 'zz-v2b-polo'), '4b suma nueva');

-- 5 · Las preguntas obligatorias salen con clave al guardarlas desde el panel.
select public.cfg_empresa_actualizar('zz-v2b-a', jsonb_build_object('qualifying_questions', '[{"question":"¿Desde qué distrito nos escribes?"}]'));
reset role;
select pg_temp.ok((select qualifying_questions::jsonb -> 0 ->> 'field_key' = 'distrito' from public.companies where id = 'zz-v2b-a'), '5 clave puesta');

-- ── El bot (clave de servicio) ────────────────────────────────────────────────
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

-- 6 · Vender una talla resta a esa talla y a la suma, sin bajar de 0.
select pg_temp.ok((public.ajustar_stock_variante('zz-v2b-a',
    (select id from public.catalog_variantes where catalog_id = 'zz-v2b-polo' and etiqueta = 'S'), -5) ->> 'stock_variante')::int = 0, '6a no baja de 0');
select pg_temp.ok((select stock = 7 from public.catalog where id = 'zz-v2b-polo'), '6b suma tras vender');

-- 7 · Con variantes, el stock del producto no se mueve a pelo. Sin variantes, sí.
select pg_temp.esperar_error($$select public.ajustar_stock('zz-v2b-a', 'zz-v2b-polo', -1)$$, 'tiene variantes', '7a');
select pg_temp.ok(public.ajustar_stock('zz-v2b-a', 'zz-v2b-gorra', -2) = 3, '7b sin variantes');

-- ── Borrar ────────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000002c1","role":"authenticated"}';

-- 8 · Borrar una variante recalcula la suma y deja rastro para la bajada.
select public.cfg_variante_borrar('zz-v2b-a', 'zz-v2b-polo', 'M');
reset role;
select pg_temp.ok((select stock = 0 from public.catalog where id = 'zz-v2b-polo'), '8a suma tras borrar');
select pg_temp.ok(exists (select 1 from public.sync_borrados where tabla = 'catalog_variantes' and company_id = 'zz-v2b-a'), '8b rastro');

-- 9 · La limpieza no la llama ni el dueño de un negocio: solo el equipo de Vendemia o el bot.
set local role authenticated;
select pg_temp.esperar_error($$select public.sync_borrados_limpiar(90)$$, 'solo el equipo', '9');

reset role;
select 'TODAS LAS PRUEBAS PASARON' as resultado;

rollback;
