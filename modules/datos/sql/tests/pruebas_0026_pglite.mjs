/**
 * Prueba de modules/datos/sql/0026_ingresos_por_barbero.sql (PGlite), sobre la 0023 y la 0024 reales.
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0026_pglite.mjs . && node pruebas_0026_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (n) => readFileSync(`${repo}/modules/datos/sql/${n}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$
  select case when p = 'c1' then nullif(current_setting('t.rol', true), '') end $$;
create table employees (id text, company_id text, name text);
insert into employees values ('chino', 'c1', 'Chino'), ('ajeno', 'c2', 'Ajeno');`);
await db.exec(leer('0023_ingresos_de_caja.sql'));
await db.exec(leer('0024_ingresos_por_sede.sql'));
// Un ingreso de antes de la 0026: tiene que seguir leyéndose (del negocio).
await db.exec(`select set_config('t.rol', 'dueno', false)`);
await db.query(`select caja_ingreso_guardar('c1', $1::jsonb)`, [JSON.stringify({ dia: '2026-11-20', concepto: 'Fondo', importe: 50, metodo: 'cash', sede: 'Huallaga 625' })]);
await db.exec(leer('0026_ingresos_por_barbero.sql'));
await db.exec(leer('0026_ingresos_por_barbero.sql')); // idempotente

const guardar = (d) => db.query(`select caja_ingreso_guardar('c1', $1::jsonb) v`, [JSON.stringify({ dia: '2026-11-20', concepto: 'Corte sin ticket', importe: 20, metodo: 'yape', ...d })]);
let r = await guardar({ employee_id: 'chino', sede: 'Huallaga 646' });
ok('guarda con barbero y sede', r.rows[0].v.employee_id === 'chino' && r.rows[0].v.sede === 'Huallaga 646', JSON.stringify(r.rows[0].v));
r = await guardar({});
ok('sin barbero: del negocio', r.rows[0].v.employee_id === '');
let e = await err(() => guardar({ employee_id: 'ajeno' }));
ok('un barbero de otro negocio, no', /no es de este negocio/.test(e ?? ''), e);
await db.exec(`select set_config('t.rol', 'admin', false)`);
e = await err(() => guardar({ employee_id: 'chino' }));
ok('el admin sigue sin apuntar ingresos (0023)', /solo los apunta el dueño/.test(e ?? ''), e);
const lista = (await db.query(`select caja_ingresos_leer('c1', '2026-11-20') v`)).rows[0].v;
ok('el admin los lee, con barbero y sede', lista.length === 3 && lista.some((i) => i.employee_id === 'chino' && i.sede === 'Huallaga 646'), JSON.stringify(lista));
ok('el de antes de la 0026 sigue, sin barbero y con su sede', lista[0].concepto === 'Fondo' && lista[0].employee_id === '' && lista[0].sede === 'Huallaga 625');

console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
