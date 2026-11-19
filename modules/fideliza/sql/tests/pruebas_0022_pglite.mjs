/**
 * Prueba de modules/fideliza/sql/0022_mis_avisos.sql (PGlite, permisos de Fideliza simulados).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0022_pglite.mjs . && node pruebas_0022_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/fideliza/sql/0022_mis_avisos.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.loyalty_require(p_company text, p_perm text, p_location uuid default null) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') <> 'owner' or p_company <> 'c1' then raise exception 'loyalty:forbidden'; end if; return 'owner'; end $$;
create function public.loyalty_err(c text) returns void language plpgsql as $$ begin raise exception 'loyalty:%', c; end $$;
create function public.loyalty_aviso_validar(p_audience text, p_valor integer) returns void language plpgsql immutable as $$
begin
    if p_audience = 'todos' or (p_audience = 'inactivos' and p_valor between 7 and 365) or (p_audience = 'cerca' and p_valor between 1 and 1000000) then return; end if;
    perform public.loyalty_err('invalid_audience');
end $$;`);
await db.exec(sql); await db.exec(sql);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
await rol('owner');
let r = await db.query(`select loyalty_aviso_guardado_guardar('c1', '{"nombre":"","audiencia":"todos","valor":1,"titulo":"Promo 2x1","texto":"Solo miércoles"}'::jsonb) v`);
const a = r.rows[0].v;
ok('nuevo, nombre = título si vacío', a.nombre === 'Promo 2x1' && a.envios === 0);
r = await db.query(`select loyalty_aviso_guardado_guardar('c1', $1::jsonb) v`, [JSON.stringify({ id: a.id, nombre: 'Miércoles', audiencia: 'inactivos', valor: 30, titulo: 'Te extrañamos', texto: 'Vuelve' })]);
ok('editar', r.rows[0].v.id === a.id && r.rows[0].v.audiencia === 'inactivos' && r.rows[0].v.valor === 30);
ok('regla inválida (3 días)', /invalid_audience/.test(await err(() => db.query(`select loyalty_aviso_guardado_guardar('c1', '{"audiencia":"inactivos","valor":3,"titulo":"x","texto":"y"}'::jsonb)`))));
ok('{faltan} fuera de «cerca»', /faltan/.test(await err(() => db.query(`select loyalty_aviso_guardado_guardar('c1', '{"audiencia":"todos","titulo":"x","texto":"te faltan {faltan}"}'::jsonb)`))));
ok('sin texto', /título y el texto/.test(await err(() => db.query(`select loyalty_aviso_guardado_guardar('c1', '{"audiencia":"todos","titulo":"x","texto":""}'::jsonb)`))));
await db.query(`select loyalty_aviso_guardado_enviado('c1', $1, 12)`, [a.id]);
r = await db.query(`select loyalty_avisos_guardados_leer('c1') v`);
ok('leer con último envío', r.rows[0].v.length === 1 && r.rows[0].v[0].envios === 1 && r.rows[0].v[0].ultimo_alcance === 12 && r.rows[0].v[0].ultimo_envio);
for (let i = 0; i < 19; i++) await db.query(`select loyalty_aviso_guardado_guardar('c1', '{"audiencia":"todos","titulo":"t${i}","texto":"x"}'::jsonb)`);
ok('tope de 20', /20 avisos/.test(await err(() => db.query(`select loyalty_aviso_guardado_guardar('c1', '{"audiencia":"todos","titulo":"t","texto":"x"}'::jsonb)`))));
await db.query(`select loyalty_aviso_guardado_borrar('c1', $1)`, [a.id]);
r = await db.query(`select jsonb_array_length(loyalty_avisos_guardados_leer('c1')) n`);
ok('borrar', r.rows[0].n === 19);
await rol('staff');
ok('sin permiso no lee', /forbidden/.test(await err(() => db.query(`select loyalty_avisos_guardados_leer('c1')`))));
await rol('owner');
ok('otro negocio no', /forbidden/.test(await err(() => db.query(`select loyalty_avisos_guardados_leer('c2')`))));
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
