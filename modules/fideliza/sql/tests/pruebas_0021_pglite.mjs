/**
 * Prueba de modules/fideliza/sql/0021_clientes_al_dia.sql en PGlite, con tablas mínimas.
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0021_pglite.mjs . && node pruebas_0021_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/fideliza/sql/0021_clientes_al_dia.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
await db.exec(`
create role anon; create role authenticated;
create function public.loyalty_require(c text, p text) returns text language sql as $$ select 'owner' $$;
create function public.loyalty_can(c text, p text) returns boolean language sql as $$ select coalesce(current_setting('t.contactos', true), '1') = '1' $$;
create function public.loyalty_norm_phone(p text) returns text language sql as $$ select '+51' || right(regexp_replace(p, '[^0-9]', '', 'g'), 9) $$;
create function public.loyalty_lines_of(m uuid) returns jsonb language sql as $$ select '[]'::jsonb $$;
create table loyalty_programs (id uuid, company_id text, parent_program_id uuid, status text);
create table loyalty_members (id uuid primary key, company_id text, parent_member_id uuid, public_code text, alias text, status text,
  balance int default 0, rewards_available int default 0, ops_count int default 0, first_op_at timestamptz, last_op_at timestamptz,
  created_at timestamptz, joined_via text);
create table loyalty_contacts (member_id uuid, kind text, value text, verified_at timestamptz);
create table loyalty_wallet_passes (member_id uuid, state text);
create table loyalty_birthdays (member_id uuid primary key, company_id text, mes_dia text);
insert into loyalty_members values
  ('00000000-0000-4000-8000-0000000000a1', 'k', null, 'VDM-AAAAAA', 'Juan Pérez', 'active', 3, 0, 3, now() - interval '20 days', now() - interval '2 days', now() - interval '20 days', 'caja'),
  ('00000000-0000-4000-8000-0000000000a2', 'k', null, 'VDM-BBBBBB', 'Ana Quispe', 'active', 0, 0, 0, null, null, now() - interval '1 hour', 'public'),
  ('00000000-0000-4000-8000-0000000000a3', 'k', '00000000-0000-4000-8000-0000000000a1', 'VDM-CCCCCC', null, 'active', 1, 0, 1, now(), now(), now(), 'caja');
insert into loyalty_contacts values ('00000000-0000-4000-8000-0000000000a2', 'phone', '+51955882306', null),
  ('00000000-0000-4000-8000-0000000000a2', 'email', 'ana@x.pe', null);
insert into loyalty_birthdays values ('00000000-0000-4000-8000-0000000000a2', 'k', '03-12');
`);
await db.exec(sql);
await db.exec(sql);
const buscar = async (q) => (await db.query(`select loyalty_member_search('k', $1, null, 'all', 25, 0) v`, [q])).rows[0].v;
let v = await buscar('');
ok('la nueva desde la página, arriba', v.rows[0].alias === 'Ana Quispe' && v.total === 2, JSON.stringify(v.rows.map((r) => r.alias)));
ok('trae la ficha: celular, correo, cumpleaños, alta', v.rows[0].phone === '+51955882306' && v.rows[0].email === 'ana@x.pe' && v.rows[0].cumple === '03-12' && v.rows[0].joined_via === 'public');
ok('sin miembros de línea', !v.rows.some((r) => r.public_code === 'VDM-CCCCCC'));
ok('por apellido', (await buscar('pérez')).rows[0]?.alias === 'Juan Pérez');
ok('por el principio, como antes', (await buscar('ana')).rows[0]?.alias === 'Ana Quispe');
ok('por las últimas cifras del celular', (await buscar('2306')).rows[0]?.alias === 'Ana Quispe');
ok('celular completo, como antes', (await buscar('955 882 306')).rows[0]?.alias === 'Ana Quispe');
await db.exec(`select set_config('t.contactos', '0', false)`);
v = await buscar('2306');
ok('sin permiso de contactos: ni cifras ni celular', v.total === 0);
v = await buscar('');
ok('sin permiso: phone y email nulos', v.rows[0].phone === null && v.rows[0].email === null);
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
