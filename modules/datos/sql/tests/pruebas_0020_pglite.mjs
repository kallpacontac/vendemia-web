/**
 * Prueba de modules/datos/sql/0020_orden_del_menu.sql (PGlite).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0020_pglite.mjs . && node pruebas_0020_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$ select case when p in ('c1', 'kallpa') then nullif(current_setting('t.rol', true), '') end $$;
create function public.es_admin_plataforma() returns boolean language sql stable as $$ select coalesce(current_setting('t.admin', true), '') = '1' $$;
create table public.companies (id text primary key);
insert into public.companies values ('c1'), ('kallpa');`);
const sql = leer('modules/datos/sql/0020_orden_del_menu.sql');
await db.exec(sql);
await db.exec(sql);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
let r = await db.query(`select orden[2] o, cardinality(en_mas) n from menu_ajustes where company_id = 'kallpa'`);
ok('kallpa: Fideliza tras el Dashboard, idempotente', r.rows.length === 1 && r.rows[0].o === '/panel/fideliza' && r.rows[0].n === 2);
await rol('empleado');
r = await db.query(`select menu_orden('kallpa') v`);
ok('el empleado lo lee', r.rows[0].v.orden[1] === '/panel/fideliza');
r = await db.query(`select menu_orden('c1') v`);
ok('sin fila: vacío', JSON.stringify(r.rows[0].v) === '{"orden":[],"en_mas":[]}', JSON.stringify(r.rows[0].v));
ok('el empleado no guarda', /dueño o el administrador/.test(await err(() => db.query(`select menu_orden_guardar('c1', array['/panel'])`))));
await rol('');
ok('ajeno no lee', /No tienes acceso/.test(await err(() => db.query(`select menu_orden('c1')`))));
await rol('admin');
r = await db.query(`select menu_orden_guardar('c1', array['/panel', '/panel/caja', 'https://x', '/panel/caja', '/panel/leads'], array['/panel/leads', '/panel']) v`);
ok('limpia: sin repetir ni ajenas, en su orden', JSON.stringify(r.rows[0].v.orden) === '["/panel","/panel/caja","/panel/leads"]', JSON.stringify(r.rows[0].v));
ok('el dashboard no va a Más', JSON.stringify(r.rows[0].v.en_mas) === '["/panel/leads"]');
await db.query(`select menu_orden_guardar('c1', '{}', '{}')`);
r = await db.query(`select count(*)::int n from menu_ajustes where company_id = 'c1'`);
ok('vacío = volver al de siempre', r.rows[0].n === 0);
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
