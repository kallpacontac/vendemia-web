/**
 * Prueba de modules/fideliza/sql/0025_regalo_cumple.sql (PGlite, permisos de Fideliza simulados).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0025_pglite.mjs . && node pruebas_0025_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/fideliza/sql/0025_regalo_cumple.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated;
create table public.loyalty_settings (company_id text primary key, cumple_regalo text not null default '' check (char_length(cumple_regalo) <= 120));
insert into public.loyalty_settings (company_id) values ('c1'), ('c2');
create table public.auditoria (company text, accion text, detalle jsonb);
create function public.loyalty_require(p_company text, p_perm text, p_location uuid default null) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') <> 'owner' or p_company <> 'c1' or p_perm <> 'campaigns.manage' then raise exception 'loyalty:forbidden'; end if; return 'owner'; end $$;
create function public.loyalty_err(c text) returns void language plpgsql as $$ begin raise exception 'loyalty:%', c; end $$;
create function public.loyalty_audit(p_company text, p_action text, p_table text, p_id text, p_detail jsonb) returns void language sql as $$
  insert into public.auditoria values (p_company, p_action, p_detail) $$;`);
await db.exec(sql); await db.exec(sql);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const regalo = async (c) => (await db.query(`select cumple_regalo r from loyalty_settings where company_id = $1`, [c])).rows[0].r;
await rol('owner');
let r = await db.query(`select loyalty_cumple_regalo_guardar('c1', '  Perfilado de barba gratis  ') v`);
ok('guarda sin espacios', r.rows[0].v.regalo === 'Perfilado de barba gratis' && (await regalo('c1')) === 'Perfilado de barba gratis');
r = await db.query(`select count(*)::int n from auditoria where accion = 'settings.cumple_regalo'`);
ok('queda en la auditoría', r.rows[0].n === 1);
await db.query(`select loyalty_cumple_regalo_guardar('c1', '')`);
ok('vacío lo apaga', (await regalo('c1')) === '');
await db.query(`select loyalty_cumple_regalo_guardar('c1', null)`);
ok('null también', (await regalo('c1')) === '');
ok('más de 120 letras no', /invalid_settings/.test(await err(() => db.query(`select loyalty_cumple_regalo_guardar('c1', repeat('x', 121))`))));
ok('otro negocio no', /forbidden/.test(await err(() => db.query(`select loyalty_cumple_regalo_guardar('c2', 'x')`))));
ok('c2 intacto', (await regalo('c2')) === '');
await rol('cashier');
ok('sin permiso no', /forbidden/.test(await err(() => db.query(`select loyalty_cumple_regalo_guardar('c1', 'x')`))));
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
