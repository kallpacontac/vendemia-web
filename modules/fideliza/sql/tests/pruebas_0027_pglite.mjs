/**
 * Prueba de modules/fideliza/sql/0027_admin_es_encargado.sql (PGlite, tablas simuladas).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0027_pglite.mjs . && node pruebas_0027_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/modules/fideliza/sql/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
await db.exec(`create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create table public.memberships (company_id text, auth_user_id text, role text);
create table public.loyalty_staff (company_id text, auth_user_id text, role text);
create table public.platform_admins (auth_user_id text);
create function public.loyalty_es_admin() returns boolean language sql stable as $$
  select exists (select 1 from public.platform_admins a where a.auth_user_id = (select auth.uid())::text) $$;
insert into public.memberships values
  ('c1', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('c1', '00000000-0000-0000-0000-000000000002', 'admin'),
  ('c1', '00000000-0000-0000-0000-000000000003', 'member'),
  ('c1', '00000000-0000-0000-0000-000000000004', 'agent'),
  ('c1', '00000000-0000-0000-0000-000000000005', 'admin');
insert into public.loyalty_staff values ('c1', '00000000-0000-0000-0000-000000000005', 'cashier');
insert into public.platform_admins values ('00000000-0000-0000-0000-000000000009');`);
const rol = async (n, empresa = 'c1') => {
  await db.exec(`select set_config('t.uid', '00000000-0000-0000-0000-00000000000${n}', false)`);
  return (await db.query(`select public.loyalty_role($1) r`, [empresa])).rows[0].r;
};

await db.exec(leer('0027_admin_es_encargado.sql'));
await db.exec(leer('0027_admin_es_encargado.sql'));
ok('dueño → owner', (await rol(1)) === 'owner');
ok('admin del panel → manager', (await rol(2)) === 'manager');
ok('member (barbero) → cashier', (await rol(3)) === 'cashier');
ok('agent → cashier', (await rol(4)) === 'cashier');
ok('admin con rol puesto a mano en Fideliza → manda el de Fideliza', (await rol(5)) === 'cashier');
ok('admin de plataforma → platform_admin', (await rol(9)) === 'platform_admin');
ok('de otro negocio → null', (await rol(2, 'c2')) === null);

await db.exec(leer('0027_admin_es_encargado_deshacer.sql'));
ok('deshacer: admin vuelve a cashier', (await rol(2)) === 'cashier');
ok('deshacer: dueño sigue owner', (await rol(1)) === 'owner');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
