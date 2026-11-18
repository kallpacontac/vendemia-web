/**
 * Prueba de modules/datos/sql/0016_sueldo_base.sql (PGlite).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0016_pglite.mjs . && node pruebas_0016_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/datos/sql/0016_sueldo_base.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite(); let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.v2_autorizar_agenda(p text, v boolean default false) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso'; end if; return 'x'; end $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create table employees (id text, company_id text);
insert into employees values ('e1', 'c1'), ('e2', 'c1'), ('x1', 'c2');`);
await db.exec(sql); await db.exec(sql);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await rol('dueno');
await db.query(`select empleado_sueldo_guardar('c1', 'e1', 1200.456)`);
let r = await db.query(`select empleado_sueldos_leer('c1') v`);
ok('dueño guarda y lee (redondeado)', Number(r.rows[0].v.e1) === 1200.46, JSON.stringify(r.rows[0].v));
await db.query(`select empleado_sueldo_guardar('c1', 'e1', 1500)`);
r = await db.query(`select empleado_sueldos_leer('c1') v`); ok('cambia', Number(r.rows[0].v.e1) === 1500);
await db.query(`select empleado_sueldo_guardar('c1', 'e1', null)`);
r = await db.query(`select empleado_sueldos_leer('c1') v`); ok('vacío lo quita', !('e1' in r.rows[0].v));
ok('empleado de otro negocio', /no es de este negocio/.test(await err(() => db.query(`select empleado_sueldo_guardar('c1', 'x1', 900)`))));
ok('número absurdo', /demasiado alto/.test(await err(() => db.query(`select empleado_sueldo_guardar('c1', 'e2', 999999)`))));
await db.query(`select empleado_sueldo_guardar('c1', 'e2', 900)`);
for (const otro of ['admin', 'empleado']) {
  await rol(otro);
  r = await db.query(`select empleado_sueldos_leer('c1') v`); ok(`${otro} no ve sueldos`, JSON.stringify(r.rows[0].v) === '{}');
  ok(`${otro} no los cambia`, /solo lo cambia el dueño/.test(await err(() => db.query(`select empleado_sueldo_guardar('c1', 'e2', 5000)`))));
}
await rol('');
ok('sin acceso', /No tienes acceso/.test(await err(() => db.query(`select empleado_sueldos_leer('c1')`))));
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
