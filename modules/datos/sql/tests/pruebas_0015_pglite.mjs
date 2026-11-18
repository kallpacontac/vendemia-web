/**
 * Prueba de modules/datos/sql/0015_mi_por_cobrar.sql (PGlite).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0015_pglite.mjs . && node pruebas_0015_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/datos/sql/0015_mi_por_cobrar.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '').replace(/-- Comprobación:[\s\S]*$/, '');
const db = new PGlite(); let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
await db.exec(`create role anon; create role authenticated;
create function public.v2_autorizar_agenda(p text, v boolean default false) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso'; end if; return current_setting('t.rol', true); end $$;
create function public.mi_empleado(p text) returns text language sql as $$ select nullif(current_setting('t.ficha', true), '') $$;
create table gastos (id text primary key, company_id text, fecha text, concepto text, importe real, tipo text, employee_id text);
create table comision_cierres (id uuid primary key default gen_random_uuid(), company_id text, employee_id text, desde date, citas text[], adelantos text[],
  comision numeric, adelantado numeric, pagado numeric, metodo text, pagado_at timestamptz default now());
insert into gastos values ('g1','b','2026-11-10','Adelanto',20,'adelanto','e1'), ('g2','b','2026-11-17','Adelanto',30,'adelanto','e1'),
  ('g3','b','2026-11-17','Adelanto',40,'adelanto','e2'), ('g4','b','2026-11-17','Luz',80,'negocio',''), ('g5','x','2026-11-17','Adelanto',99,'adelanto','e1');
insert into comision_cierres (company_id, employee_id, desde, citas, adelantos, comision, adelantado, pagado, metodo) values
  ('b','e1','2026-11-01','{c1,c2}','{g1}',60,20,40,'efectivo'), ('b','e2','2026-11-05','{c3}','{}',15,0,15,'yape');`);
await db.exec(sql);
const leer = async (rol, ficha) => { await db.exec(`set t.rol='${rol}'; set t.ficha='${ficha}'`); return (await db.query(`select public.mi_por_cobrar('b') v`)).rows[0].v; };
let r = await leer('empleado', 'e1');
ok('su ficha y el primer cierre del negocio', r.ficha === 'e1' && r.primero === '2026-11-01', JSON.stringify(r).slice(0, 120));
ok('solo sus cierres', r.cierres.length === 1 && r.cierres[0].citas.join() === 'c1,c2');
ok('solo sus adelantos sin cerrar (g2; g1 ya pagado; g3 de otro; g5 de otro negocio)', r.adelantos.length === 1 && r.adelantos[0].id === 'g2', JSON.stringify(r.adelantos));
r = await leer('empleado', '');
ok('sin ficha: nada', r.ficha === null);
try { await leer('', 'e1'); ok('sin acceso: error', false); } catch { ok('sin acceso: error', true); }
console.log(fallos ? `${fallos} MAL` : 'Todo bien'); process.exit(fallos ? 1 : 0);
