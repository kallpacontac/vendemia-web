/**
 * Prueba de modules/fideliza/sql/0015 (niveles del mes, espera y bono) contra un Postgres
 * de verdad (PGlite), con 0001–0015 cargadas encima de auth.uid(), companies y memberships
 * simulados (también 0016). Se corrió el 12-nov-2026 con PGlite 0.5.8: 27/27. Con 0015 aplicada,
 * tests/pruebas.sql y pruebas_0014.sql siguieron pasando.
 *
 *   npm i --no-save @electric-sql/pglite@0.5.8
 *   node modules/fideliza/sql/tests/pruebas_0015_pglite.mjs
 *
 * No es dependencia del proyecto a propósito: solo hace falta para tocar la SQL.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
async function cargar(hasta = 99) {
  const db = new PGlite();
  await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', nullif(current_setting('t.uid', true), ''))::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table public.companies (id text primary key, name text, owner_phone text);
create table public.platform_admins (auth_user_id text primary key);
create table public.memberships (id text primary key, auth_user_id text, company_id text, role text, employee_id text);
`);
  const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= hasta).sort();
  for (const f of files) {
    const sql = readFileSync(dir + f, 'utf8').replace(/notify pgrst[^;]*;/g, '');
    try { await db.exec(sql); } catch (e) { console.log('FALLA', f, '→', e.message); throw e; }
  }
  return db;
}

const db = await cargar();
// 0015 dos veces: idempotente
await db.exec(readFileSync(dir + '0015_niveles_del_mes.sql', 'utf8').replace(/notify pgrst[^;]*;/g, ''));
await db.exec(`create or replace function public.loyalty_srv_check() returns void language sql as $$ select $$;`);
const U = '11111111-1111-1111-1111-111111111111';
await db.exec(`select set_config('t.uid', '${U}', false);
insert into companies values ('c1','Kallpa',''),('c2','Tienda','');
insert into memberships values ('m1','${U}','c1','owner',null),('m2','${U}','c2','owner',null);`);
const q = async (s, p) => (await db.query(s, p)).rows;
const v1 = async (s, p) => Object.values((await q(s, p))[0])[0];
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const espera = async (n, f, re) => {
  try { await f(); fallos++; console.log('MAL  (no lanzó)', n); }
  catch (e) { const b = re.test(e.message + ' ' + (e.detail ?? '')); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', n, '→', e.message, e.detail ?? ''); }
};
let k = 0;
const clave = () => 'clave-prueba-' + (++k);

await q(`select loyalty_settings_save('c1', '{"slug":"kallpa-x","display_name":"Kallpa"}')`);
const tiers = [
  { at: 12, level: '5% de dscto en tu próxima membresía', gift: 'Batido proteico', gift_count: 1 },
  { at: 16, level: '10% de dscto en tu próxima membresía', gift: 'Batido proteico', gift_count: 1 },
  { at: 20, level: '15% de dscto en tu próxima membresía', gift: 'Batido proteico', gift_count: 1 },
];
const draft = { rule_type: 'visits', period: 'month', tiers, cooldown_hours: 12, bonus_label: 'Reto del BOX', bonus_units: 4, reward_valid_days: 45 };
const pmal = await v1(`select loyalty_program_save('c1', null, 'Mal', 'x', 'repeat', $1::jsonb)`, [JSON.stringify({ ...draft, tiers: [{ at: 16, level: 'a' }, { at: 12, level: 'b' }] })]);
await espera('niveles desordenados', () => q(`select loyalty_program_publish('c1', $1)`, [pmal]), /invalid_rule/);
await q(`delete from loyalty_programs where id = $1`, [pmal]);
const prog = await v1(`select loyalty_program_save('c1', null, 'Club Kallpa', 'Asistencia', 'repeat', $1::jsonb)`, [JSON.stringify(draft)]);
const ver = await v1(`select loyalty_program_publish('c1', $1)`, [prog]);
ok('publicada con niveles', ver.period === 'month' && ver.tiers.length === 3 && ver.reward_threshold === 12 && ver.cooldown_hours === 12 && ver.bonus_units === 4, JSON.stringify(ver));
const alta = await v1(`select loyalty_member_create('c1', 'Ana', null, null, false, 'alta-ana-0001', 'panel')`);
const M = alta.member_id;
const visita = () => v1(`select loyalty_record('c1', $1, 'visit', 0, null, null, $2, 'caja')`, [M, clave()]);
const atras = (h) => q(`update loyalty_transactions set created_at = created_at - make_interval(hours => $2) where member_id = $1`, [M, h]);

let r = await visita();
ok('1.ª sesión', r.member.balance === 1 && r.member.threshold === 12 && r.member.period === 'month', JSON.stringify(r.member));
await espera('espera de 12 h', visita, /cooldown/);
await atras(11);
await espera('a las 11 h aún no', visita, /cooldown/);
await atras(2);
r = await visita();
ok('a las 13 h sí', r.member.balance === 2);
await q(`select loyalty_refund('c1', $1, null, 'Deshecho', $2)`, [r.transaction_id, clave()]);
r = await visita();
ok('tras deshacer, sin espera', r.member.balance === 2, JSON.stringify(r.member));
for (let i = 0; i < 9; i++) { await atras(13); r = await visita(); }
ok('11 sesiones, sin premio', r.member.balance === 11 && r.member.rewards_available === 0 && r.rewards_issued === 0);
await atras(13);
r = await visita();
ok('12 → nivel 5% + 1 batido', r.member.balance === 12 && r.rewards_issued === 2 && r.member.rewards_available === 2 && r.member.threshold === 16 && /10%/.test(r.member.reward_description), JSON.stringify(r.member));
const ultima12 = r.transaction_id;
r = await v1(`select loyalty_bonus('c1', $1, $2)`, [M, clave()]);
ok('reto del BOX +4 → 16: sube a 10% y 2.º batido', r.member.balance === 16 && r.rewards_issued === 2 && r.member.rewards_available === 3, JSON.stringify(r.member.rewards));
const descs = r.member.rewards.map((x) => x.description).sort().join(' | ');
ok('premios: 10% + 2 batidos (el 5% revocado)', descs === '10% de dscto en tu próxima membresía | Batido proteico | Batido proteico', descs);
await atras(13);
r = await visita();
ok('17', r.member.balance === 17);
await q(`select loyalty_refund('c1', $1, null, 'Deshecho', $2)`, [r.transaction_id, clave()]);
await q(`select loyalty_refund('c1', $1, null, 'Deshecho', $2)`, [ultima12, clave()]);
let card = await v1(`select loyalty_member_card($1)`, [M]);
const d2 = card.rewards.map((x) => x.description).sort().join(' | ');
ok('15 tras deshacer: 5% + 1 batido', card.balance === 15 && d2 === '5% de dscto en tu próxima membresía | Batido proteico' && card.rewards_available === 2, d2 + ' bal ' + card.balance);
await q(`select loyalty_redeem('c1', $1, (select id from loyalty_rewards where member_id = $1 and status='available' and tier_part='gift' limit 1), null, $2)`, [M, clave()]);
for (let i = 0; i < 5; i++) { await atras(13); r = await visita(); }
card = await v1(`select loyalty_member_card($1)`, [M]);
const d3 = card.rewards.map((x) => x.description).sort().join(' | ');
ok('20: 15% + 2 batidos por canjear (1 ya canjeado)', card.balance === 20 && d3 === '15% de dscto en tu próxima membresía | Batido proteico | Batido proteico', d3);
ok('con todo alcanzado, la meta es el último nivel', card.threshold === 20 && /15%/.test(card.reward_description));
// Cambio de mes
await q(`update loyalty_members set period_start = (period_start - interval '1 month')::date where id = $1`, [M]);
await q(`update loyalty_transactions set created_at = created_at - interval '35 days' where member_id = $1`, [M]);
await q(`update loyalty_rewards set period_start = (period_start - interval '1 month')::date where member_id = $1`, [M]);
card = await v1(`select loyalty_member_card($1)`, [M]);
ok('mes nuevo: se enseña 0 antes del cron', card.balance === 0 && card.threshold === 12);
const roll = await v1(`select loyalty_srv_period_roll()`);
ok('cron reinicia 1', roll.rolled === 1, JSON.stringify(roll));
const bal = await v1(`select balance from loyalty_members where id = $1`, [M]);
ok('saldo 0 en la base, premios del mes pasado siguen', bal === 0 && card.rewards_available === 3);
await espera('no se deshace un mes cerrado', () => q(`select loyalty_refund('c1', $1, null, 'Deshecho', $2)`, [r.transaction_id, clave()]), /period_closed/);
r = await visita();
ok('1.ª del mes nuevo', r.member.balance === 1);
const rec = await v1(`select loyalty_reconcile('c1', false)`);
ok('libro y saldo cuadran', rec.mismatches.length === 0, JSON.stringify(rec));

// ── Regresión: programa de siempre (la tienda) ───────────────────────────────
await q(`select loyalty_settings_save('c2', '{"slug":"tienda-x","display_name":"Tienda"}')`);
const p2 = await v1(`select loyalty_program_save('c2', null, 'Tienda', 'x', 'repeat', $1::jsonb)`, [JSON.stringify({ rule_type: 'stamps', stamps_per_purchase: 1, reward_threshold: 3, reward_description: 'Kekito o batido' })]);
const ver2 = await v1(`select loyalty_program_publish('c2', $1)`, [p2]);
ok('tienda sin niveles ni espera', ver2.period === 'none' && ver2.tiers === null && ver2.cooldown_hours === null && ver2.bonus_units === null);
const M2 = (await v1(`select loyalty_member_create('c2', 'Luis', null, null, false, 'alta-luis-0001', 'panel')`)).member_id;
for (let i = 0; i < 3; i++) r = await v1(`select loyalty_record('c2', $1, 'purchase', 0, null, null, $2, 'caja')`, [M2, clave()]);
ok('3 compras seguidas → 1 premio y saldo 0', r.member.balance === 0 && r.rewards_issued === 1 && r.member.threshold === 3, JSON.stringify(r.member));
await espera('tienda sin bono', () => q(`select loyalty_bonus('c2', $1, $2)`, [M2, clave()]), /no_bonus/);
const rec2 = await v1(`select loyalty_reconcile('c2', false)`);
ok('tienda cuadra', rec2.mismatches.length === 0);
// 0016: la caja de otro negocio distingue el descuento (level) del batido (gift).
{
  const c = await v1(`select loyalty_member_card($1)`, [M]);
  ok('la caja ve el tipo de cada premio', c.rewards.map((x) => x.part).sort().join(',') === 'gift,gift,level');
  const c2 = await v1(`select loyalty_member_card($1)`, [M2]);
  ok('premio de siempre sin tipo', c2.rewards.length === 1 && c2.rewards[0].part === null);
}
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
