/**
 * Prueba de modules/fideliza/sql/0019_cumpleanos.sql en PGlite, con tablas mínimas y
 * loyalty_require / loyalty_srv_check / loyalty_audit simulados.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0019_pglite.mjs . && node pruebas_0019_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0019 = leer('modules/fideliza/sql/0019_cumpleanos.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const deshacer = leer('scripts/fideliza-0019-deshacer.sql');
const err = leer('modules/fideliza/sql/0003_operaciones.sql').match(/create or replace function public\.loyalty_err[\s\S]*?end \$\$;/)[0];

const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const uno = async (s, p) => (await db.query(s, p)).rows[0];
const lanza = async (n, s, p, patron) => { try { await db.query(s, p); ok(n + ' (no lanzó)', false); } catch (e) { ok(n, patron.test(e.message), e.message); } };

await db.exec(`
create role anon; create role authenticated;
create schema auth; create function auth.uid() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
create function public.loyalty_require(c text, p text) returns text language plpgsql as $$
begin if coalesce(current_setting('t.rol', true), 'owner') = 'nadie' then raise exception 'loyalty:forbidden'; end if; return 'owner'; end $$;
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create function public.loyalty_audit(c text, a text, t text, i text, d jsonb) returns void language sql as $$ select $$;
create table loyalty_settings (company_id text primary key, display_name text);
create table loyalty_members (id uuid primary key, company_id text, parent_member_id uuid, status text, unique (company_id, id));
insert into loyalty_settings values ('b', 'The 24/7'), ('k', 'Kallpa');
insert into loyalty_members values
  ('00000000-0000-4000-8000-0000000000a1', 'b', null, 'active'),
  ('00000000-0000-4000-8000-0000000000a2', 'b', '00000000-0000-4000-8000-0000000000a1', 'active'),
  ('00000000-0000-4000-8000-0000000000a3', 'b', null, 'active'),
  ('00000000-0000-4000-8000-0000000000a4', 'k', null, 'active');
`);
await db.exec(err);
await db.exec(s0019);
const A1 = '00000000-0000-4000-8000-0000000000a1', A2 = '00000000-0000-4000-8000-0000000000a2', A3 = '00000000-0000-4000-8000-0000000000a3', A4 = '00000000-0000-4000-8000-0000000000a4';
const hoy = (await uno(`select to_char(now() at time zone 'America/Lima', 'MM-DD') as d`)).d;

ok('sin dato: mes_dia null', (await uno(`select public.loyalty_birthday_get('b', $1) as v`, [A1])).v.mes_dia === null);
await lanza('31 de abril no existe', `select public.loyalty_birthday_set('b', $1, '04-31')`, [A1], /invalid_birthday/);
await lanza('formato malo', `select public.loyalty_birthday_set('b', $1, '4/5')`, [A1], /invalid_birthday/);
ok('29 de febrero sí vale', (await uno(`select public.loyalty_birthday_set('b', $1, '02-29') as v`, [A3])).v.mes_dia === '02-29');
// Se guarda desde una línea (A2) y queda en la persona (A1).
ok('desde una línea se guarda en la persona', (await uno(`select public.loyalty_birthday_set('b', $1, $2) as v`, [A2, hoy])).v.status === 'ok'
  && (await uno(`select member_id from loyalty_birthdays where member_id = $1`, [A1])) !== undefined);
let g = (await uno(`select public.loyalty_birthday_get('b', $1) as v`, [A1])).v;
ok('hoy cumple, sin regalo configurado', g.hoy === true && g.regalo === null, JSON.stringify(g));
await db.exec(`update loyalty_settings set cumple_regalo = 'cortesía y mascarilla gratis con cualquier corte' where company_id = 'b'`);
g = (await uno(`select public.loyalty_birthday_get('b', $1) as v`, [A2])).v;
ok('leído desde la línea: hoy y con regalo', g.hoy === true && g.regalo.startsWith('cortesía'), JSON.stringify(g));
await db.exec(`set t.rol = 'nadie'`);
await lanza('sin permiso no se guarda', `select public.loyalty_birthday_set('b', $1, '01-01')`, [A3], /forbidden/);
await db.exec(`set t.rol = 'owner'`);
// Kallpa sin regalo: aunque cumpla hoy, no se le avisa.
await db.query(`select public.loyalty_birthday_set('k', $1, $2)`, [A4, hoy]);
let c = (await uno(`select public.loyalty_srv_cumple_hoy() as v`)).v;
ok('cron: solo The 24/7 (Kallpa sin regalo)', c.length === 1 && c[0].member_id === A1 && c[0].company_id === 'b', JSON.stringify(c));
c = (await uno(`select public.loyalty_srv_cumple_hoy() as v`)).v;
ok('cron: el mismo día, una sola vez', c.length === 0);
ok('borrar con vacío', (await uno(`select public.loyalty_birthday_set('b', $1, '') as v`, [A1])).v.mes_dia === null);
await db.exec(deshacer);
ok('deshacer: sin tabla', (await uno(`select to_regclass('public.loyalty_birthdays') is null as v`)).v);
await db.exec(s0019);
ok('0019 dos veces: bien', (await uno(`select to_regprocedure('public.loyalty_srv_cumple_hoy()') is not null as v`)).v);
console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
