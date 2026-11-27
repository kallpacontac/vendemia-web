/**
 * Prueba de modules/fideliza/sql/0029 («Borrar tarjeta») contra PGlite, con
 * 0001–0019, 0026, 0028 y 0029 cargadas sobre auth.uid(), companies y memberships simulados.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.5.8
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0029_pglite.mjs . && node pruebas_0028_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const repo = process.argv[2];
const dir = `${repo}/modules/fideliza/sql/`;
const sinNotify = (s) => s.replace(/notify pgrst[^;]*;/g, '');

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table public.companies (id text primary key, name text, owner_phone text);
create table public.platform_admins (auth_user_id text primary key);
create table public.memberships (id text primary key, auth_user_id text, company_id text, role text, employee_id text);
`);
for (const f of readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f) && !/deshacer/.test(f) && Number(f.slice(0, 4)) <= 19).sort()) {
  try { await db.exec(sinNotify(readFileSync(dir + f, 'utf8'))); } catch (e) { console.log('FALLA', f, '→', e.message); throw e; }
}
for (const n of ['0026_resena_y_nota.sql', '0028_amigos_y_google.sql', '0029_borrar_tarjeta.sql', '0029_borrar_tarjeta.sql']) {
  await db.exec(sinNotify(readFileSync(dir + n, 'utf8')));
}
await db.exec(`create or replace function public.loyalty_srv_check() returns void language sql as $$ select $$;`);

let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const q = async (s, p) => (await db.query(s, p)).rows;
const v1 = async (s, p) => Object.values((await q(s, p))[0])[0];
const err = async (f) => { try { await f(); return ''; } catch (e) { return e.message; } };
const U = '11111111-1111-1111-1111-111111111111';
const EXTRANO = '22222222-2222-2222-2222-222222222222';
let k = 0;
const clave = () => 'clave-prueba-' + (++k);
const como = (uid) => db.exec(`select set_config('t.uid', '${uid}', false)`);

await db.exec(`select set_config('t.uid', '${U}', false);
insert into companies values ('c1','Barbería Norte',''), ('c2','Otro','');
insert into memberships values ('m1','${U}','c1','owner',null), ('m3','${EXTRANO}','c2','owner',null);`);
await q(`select loyalty_settings_save('c1', '{"slug":"barberia-norte","display_name":"Barbería Norte"}')`);
const prog = await v1(`select loyalty_program_save('c1', null, 'Club Norte', 'x', 'repeat', $1::jsonb)`,
  [JSON.stringify({ rule_type: 'stamps', stamps_per_purchase: 1, reward_threshold: 2, reward_description: 'Corte gratis' })]);
await q(`select loyalty_program_publish('c1', $1)`, [prog]);

const diego = await v1(`select loyalty_member_create('c1', 'Diego Ramos', '+51911111111', null, false, $1, 'panel')`, [clave()]);
const ana = await v1(`select loyalty_member_create('c1', 'Ana Ruiz', '+51922222222', null, false, $1, 'panel')`, [clave()]);
const D = diego.member_id;
const sello = (id) => q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, $2, 'caja')`, [id, clave()]);
await sello(D); await sello(D); await sello(D); await sello(ana.member_id);
ok('Diego tiene libro y premio antes', (await v1(`select count(*)::int from loyalty_ledger where member_id = $1`, [D])) > 0
  && (await v1(`select count(*)::int from loyalty_rewards where member_id = $1`, [D])) > 0);

ok('el libro sigue sin poder borrarse a mano', /ledger_inmutable/.test(await err(() => q(`delete from loyalty_ledger where member_id = $1`, [D]))));

await como(EXTRANO);
ok('otro negocio no puede borrarla', (await err(() => q(`select loyalty_member_purge('c1', $1)`, [D]))) !== '');
await como(U);

const r = await v1(`select loyalty_member_purge('c1', $1)`, [D]);
ok('devuelve quién era', r.borrada === 'Diego Ramos (' + diego.public_code + ')', JSON.stringify(r));
for (const t of ['loyalty_members', 'loyalty_ledger', 'loyalty_rewards', 'loyalty_transactions', 'loyalty_contacts', 'loyalty_consents']) {
  const col = t === 'loyalty_members' ? 'id' : 'member_id';
  ok(`no queda nada en ${t}`, (await v1(`select count(*)::int from ${t} where ${col} = $1`, [D])) === 0);
}
ok('Ana sigue intacta', (await v1(`select count(*)::int from loyalty_ledger where member_id = $1`, [ana.member_id])) > 0);
ok('queda en la auditoría', (await v1(`select count(*)::int from loyalty_audit_log where action = 'member.purge'`)) === 1);
ok('después, el libro vuelve a estar cerrado', /ledger_inmutable/.test(await err(() => q(`delete from loyalty_ledger where member_id = $1`, [ana.member_id]))));
ok('otra vez → not_found', /not_found/.test(await err(() => q(`select loyalty_member_purge('c1', $1)`, [D]))));
const otra = await v1(`select loyalty_member_create('c1', 'Diego Ramos', '+51911111111', null, false, $1, 'panel')`, [clave()]);
ok('puede volver a sacar tarjeta con el mismo celular', !!otra.member_id && otra.member_id !== D);

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
