/**
 * Prueba de modules/fideliza/sql/0017 (una tarjeta, varias líneas) contra un Postgres de
 * verdad (PGlite), con 0001–0017 cargadas sobre auth.uid(), companies y memberships simulados.
 * Caso Kallpa: línea principal «Asistencia» (niveles del mes, espera 12 h, Reto del BOX) y
 * línea «Compra» (sellos; aquí meta 3 para ir rápido). También prueba el deshacer.
 *
 *   npm i --no-save @electric-sql/pglite@0.5.8
 *   node modules/fideliza/sql/tests/pruebas_0017_pglite.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const sinNotify = (s) => s.replace(/notify pgrst[^;]*;/g, '');
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
    try { await db.exec(sinNotify(readFileSync(dir + f, 'utf8'))); } catch (e) { console.log('FALLA', f, '→', e.message); throw e; }
  }
  await db.exec(`create or replace function public.loyalty_srv_check() returns void language sql as $$ select $$;`);
  return db;
}

let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const U = '11111111-1111-1111-1111-111111111111';

// ═══ 1 · Las dos líneas de Kallpa ═══════════════════════════════════════════
{
  const db = await cargar();
  await db.exec(sinNotify(readFileSync(dir + '0017_una_tarjeta_varias_lineas.sql', 'utf8'))); // idempotente
  await db.exec(`select set_config('t.uid', '${U}', false);
insert into companies values ('c1','Kallpa','');
insert into memberships values ('m1','${U}','c1','owner',null);`);
  const q = async (s, p) => (await db.query(s, p)).rows;
  const v1 = async (s, p) => Object.values((await q(s, p))[0])[0];
  const espera = async (n, f, re) => {
    try { await f(); fallos++; console.log('MAL  (no lanzó)', n); }
    catch (e) { const b = re.test(e.message + ' ' + (e.detail ?? '')); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', n, '→', e.message); }
  };
  let k = 0;
  const clave = () => 'clave-prueba-' + (++k);

  await q(`select loyalty_settings_save('c1', '{"slug":"kallpa-x","display_name":"Kallpa"}')`);
  const tiers = [
    { at: 12, level: '5% de dscto en tu próxima membresía', gift: 'Batido proteico', gift_count: 1 },
    { at: 16, level: '10% de dscto en tu próxima membresía', gift: 'Batido proteico', gift_count: 1 },
    { at: 20, level: '15% de dscto en tu próxima membresía', gift: 'Batido proteico', gift_count: 1 },
  ];
  const asis = await v1(`select loyalty_program_save('c1', null, 'Club Kallpa', 'x', 'frequency', $1::jsonb)`,
    [JSON.stringify({ rule_type: 'visits', period: 'month', tiers, cooldown_hours: 12, bonus_label: 'Reto del BOX', bonus_units: 4, reward_valid_days: 45 })]);
  await q(`select loyalty_program_publish('c1', $1)`, [asis]);
  await q(`select loyalty_program_line('c1', $1, null, 'Asistencia')`, [asis]);
  const tienda = await v1(`select loyalty_program_save('c1', null, 'Club Kallpa Tienda', 'x', 'repeat', $1::jsonb)`,
    [JSON.stringify({ rule_type: 'stamps', stamps_per_purchase: 1, reward_threshold: 3, reward_description: 'Un kekito o un batido' })]);
  await espera('una línea suelta no se publica con el principal vivo', () => q(`select loyalty_program_publish('c1', $1)`, [tienda]), /another_program_live/);
  await q(`select loyalty_program_line('c1', $1, $2, 'Compra')`, [tienda, asis]);
  const vt = await v1(`select loyalty_program_publish('c1', $1)`, [tienda]);
  ok('la línea Compra se publica junto a Asistencia', vt.rule_type === 'stamps' && vt.reward_threshold === 3);
  ok('el programa vivo del negocio sigue siendo el principal', (await v1(`select (loyalty_live_program('c1')).id`)) === asis);

  const alta = await v1(`select loyalty_member_create('c1', 'Ana', '+51987654321', null, false, 'alta-ana-0001', 'panel')`);
  const ANA = alta.member_id;
  let card = await v1(`select loyalty_member_card($1)`, [ANA]);
  ok('tarjeta con dos líneas, principal primero', card.lines?.length === 2 && card.lines[0].label === 'Asistencia' && card.lines[0].main && card.lines[1].label === 'Compra' && !card.lines[1].main, JSON.stringify(card.lines));
  ok('la línea Compra aún sin miembro, 0 de 3', card.lines[1].member_id === null && card.lines[1].balance === 0 && card.lines[1].threshold === 3);

  const linea = await v1(`select loyalty_line_member('c1', $1, $2)`, [ANA, tienda]);
  ok('se crea el miembro de línea y es el mismo al repetir', linea && linea !== ANA && (await v1(`select loyalty_line_member('c1', $1, $2)`, [ANA, tienda])) === linea);
  ok('pedir la línea principal devuelve a la persona', (await v1(`select loyalty_line_member('c1', $1, $2)`, [ANA, asis])) === ANA);
  ok('desde el miembro de línea también se llega a la persona', (await v1(`select loyalty_line_member('c1', $1, $2)`, [linea, tienda])) === linea);

  // Visita y compras seguidas: la espera de 12 h es SOLO de la asistencia.
  let r = await v1(`select loyalty_record('c1', $1, 'visit', 0, null, null, $2, 'caja')`, [ANA, clave()]);
  ok('visita: Asistencia 1 de 12', r.member.lines[0].balance === 1 && r.member.lines[0].threshold === 12);
  for (let i = 0; i < 2; i++) r = await v1(`select loyalty_record('c1', $1, 'purchase', 0, null, null, $2, 'caja')`, [linea, clave()]);
  ok('2 compras seguidas, sin espera: Compra 2 de 3', r.member.lines[1].balance === 2);
  ok('el resultado trae la tarjeta de la PERSONA y de qué línea fue', r.member.id === ANA && r.program_id === tienda && r.line_member_id === linea, JSON.stringify({ id: r.member.id, p: r.program_id }));
  await espera('la 2.ª visita sí espera 12 h', () => q(`select loyalty_record('c1', $1, 'visit', 0, null, null, $2, 'caja')`, [ANA, clave()]), /cooldown/);
  await espera('en la línea de compras no se registra una visita', () => q(`select loyalty_record('c1', $1, 'visit', 0, null, null, $2, 'caja')`, [linea, clave()]), /kind_mismatch/);
  r = await v1(`select loyalty_record('c1', $1, 'purchase', 0, null, null, $2, 'caja')`, [linea, clave()]);
  const ultimaCompra = r.transaction_id;
  ok('3.ª compra: gana el kekito, la cartilla vuelve a 0', r.rewards_issued === 1 && r.member.lines[1].balance === 0 && r.member.lines[1].rewards_available === 1 && r.member.lines[1].rewards[0].description === 'Un kekito o un batido', JSON.stringify(r.member.lines[1]));
  ok('el premio de la tienda no se mezcla con la asistencia', r.member.rewards_available === 0 && r.member.lines[0].rewards_available === 0);

  // El bono es de la asistencia
  r = await v1(`select loyalty_bonus('c1', $1, $2)`, [ANA, clave()]);
  ok('Reto del BOX +4 en Asistencia: 5 de 12', r.member.lines[0].balance === 5);

  // Clientes: una fila por persona, con sus líneas
  const lista = await v1(`select loyalty_member_search('c1', '', null, 'all', 25, 0)`);
  ok('Clientes: Ana sale una sola vez, con sus 2 líneas', lista.total === 1 && lista.rows[0].id === ANA && lista.rows[0].lines.length === 2, JSON.stringify(lista));
  ok('filtro «con premio» encuentra el premio de la tienda', (await v1(`select loyalty_member_search('c1', '', null, 'reward', 25, 0)`)).total === 1);

  // Beto solo compra en la tienda
  const BETO = (await v1(`select loyalty_member_create('c1', 'Beto', null, null, false, 'alta-beto-0001', 'caja')`)).member_id;
  const lb = await v1(`select loyalty_line_member('c1', $1, $2)`, [BETO, tienda]);
  await q(`select loyalty_record('c1', $1, 'purchase', 0, null, null, $2, 'caja')`, [lb, clave()]);
  const nunca = await v1(`select loyalty_member_search('c1', '', null, 'never', 25, 0)`);
  ok('quien solo compra no sale como «sin operaciones»', nunca.total === 0, JSON.stringify(nunca.rows.map((x) => x.alias)));
  ok('su «última vez» es la de la tienda', (await v1(`select last_op_at is not null from loyalty_members where id = $1`, [BETO])) === true);

  // Caja: el código de la persona y hasta el de la línea dan la tarjeta de la persona
  const codAna = await v1(`select public_code from loyalty_members where id = $1`, [ANA]);
  const codLinea = await v1(`select public_code from loyalty_members where id = $1`, [linea]);
  let encontrados = await v1(`select loyalty_lookup('c1', $1)`, [codAna]);
  ok('caja: el QR/código de Ana trae sus 2 líneas', encontrados.length === 1 && encontrados[0].lines.length === 2);
  encontrados = await v1(`select loyalty_lookup('c1', $1)`, [codLinea]);
  ok('caja: el código interno de la línea también lleva a Ana', encontrados.length === 1 && encontrados[0].id === ANA);
  encontrados = await v1(`select loyalty_lookup('c1', '987654321')`);
  ok('caja: por teléfono, una sola tarjeta', encontrados.length === 1 && encontrados[0].id === ANA);

  // Canje en la tienda con el member_id de la línea
  const premio = card = await v1(`select loyalty_member_card($1)`, [ANA]);
  const red = await v1(`select loyalty_redeem('c1', $1, $2, null, $3)`, [premio.lines[1].member_id, premio.lines[1].rewards[0].id, clave()]);
  ok('canje del kekito: la tarjeta de la persona queda sin premios', red.status === 'created' && red.member.id === ANA && red.member.lines[1].rewards_available === 0);

  // Deshacer una compra de la línea
  r = await v1(`select loyalty_record('c1', $1, 'purchase', 0, null, null, $2, 'caja')`, [linea, clave()]);
  const dev = await v1(`select loyalty_refund('c1', $1, null, 'Deshecho', $2)`, [r.transaction_id, clave()]);
  ok('deshacer una compra de la tienda', dev.member.lines[1].balance === 0, JSON.stringify(dev.member.lines[1]));
  void ultimaCompra;

  // Tarjeta pública y Wallet
  const tok = alta.card_token;
  const pub = await v1(`select loyalty_srv_card($1, false)`, [tok]);
  ok('tarjeta pública con 2 líneas y sin ids internos', pub.lines.length === 2 && !('member_id' in pub.lines[1]) && !('program_id' in pub.lines[1]) && pub.lines[1].label === 'Compra');
  const w = await v1(`select loyalty_srv_wallet_object_data(null, $1, '3388000000012345678')`, [tok]);
  ok('Wallet con líneas', w.lines.length === 2);
  const rev0 = await v1(`select desired_rev from loyalty_wallet_passes where member_id = $1`, [ANA]);
  await q(`select loyalty_record('c1', $1, 'purchase', 0, null, null, $2, 'caja')`, [linea, clave()]);
  const rev1 = await v1(`select desired_rev from loyalty_wallet_passes where member_id = $1`, [ANA]);
  ok('una compra en la tienda actualiza el Wallet de la persona', rev1 > rev0, `${rev0} → ${rev1}`);

  // Números: cada persona una vez
  const met = await v1(`select loyalty_metrics('c1', (now() - interval '1 day')::date, now()::date)`);
  ok('Números: 2 clientes (no 4)', met.members.total === 2, JSON.stringify(met.members));
  const rec = await v1(`select loyalty_reconcile('c1', false)`);
  ok('libro y saldos cuadran en las dos líneas', rec.mismatches.length === 0);

  // Suspender a la persona suspende sus líneas
  await q(`select loyalty_member_set_status('c1', $1, 'suspended', 'Prueba de suspensión')`, [ANA]);
  ok('suspender a Ana suspende su línea', (await v1(`select status from loyalty_members where id = $1`, [linea])) === 'suspended');
  await espera('suspendida: no se le suma en la tienda', () => q(`select loyalty_line_member('c1', $1, $2)`, [ANA, tienda]), /member_inactive/);
  await q(`select loyalty_member_set_status('c1', $1, 'active', 'Prueba de reactivación')`, [ANA]);
  ok('reactivarla reactiva la línea', (await v1(`select status from loyalty_members where id = $1`, [linea])) === 'active');

  await espera('una línea con clientes no se suelta', () => q(`select loyalty_program_line('c1', $1, null, 'Compra')`, [tienda]), /line_has_members/);
  const otra = await v1(`select loyalty_program_save('c1', null, 'Otro', 'x', 'repeat', $1::jsonb)`, [JSON.stringify({ rule_type: 'stamps', reward_threshold: 5, reward_description: 'Algo' })]);
  await espera('dos líneas no pueden llamarse igual', () => q(`select loyalty_program_line('c1', $1, $2, 'compra')`, [otra, asis]), /line_label_taken/);
  await espera('una línea no cuelga de otra línea', () => q(`select loyalty_program_line('c1', $1, $2, 'Bar')`, [otra, tienda]), /invalid_line/);
  await espera('un segundo principal sigue sin poder publicarse', () => q(`select loyalty_program_publish('c1', $1)`, [otra]), /another_program_live/);

  await espera('el deshacer se niega con líneas en uso', () => db.exec(sinNotify(readFileSync(dir + '../../../scripts/fideliza-0017-deshacer.sql', 'utf8'))), /líneas o clientes de línea/);
}

// ═══ 2 · Sin líneas, el deshacer deja todo como antes ═══════════════════════
{
  const db = await cargar();
  await db.exec(`select set_config('t.uid', '${U}', false);
insert into companies values ('c1','Uno','');
insert into memberships values ('m1','${U}','c1','owner',null);`);
  const v1 = async (s, p) => Object.values((await db.query(s, p)).rows[0])[0];
  await db.query(`select loyalty_settings_save('c1', '{"slug":"uno-x","display_name":"Uno"}')`);
  const p = await v1(`select loyalty_program_save('c1', null, 'Uno', 'x', 'repeat', $1::jsonb)`, [JSON.stringify({ rule_type: 'stamps', reward_threshold: 5, reward_description: 'Café' })]);
  await db.query(`select loyalty_program_publish('c1', $1)`, [p]);
  const M = (await v1(`select loyalty_member_create('c1', 'Luz', null, null, false, 'alta-luz-0001', 'panel')`)).member_id;
  await db.exec(sinNotify(readFileSync(dir + '../../../scripts/fideliza-0017-deshacer.sql', 'utf8')));
  const card = await v1(`select loyalty_member_card($1)`, [M]);
  ok('deshecha: la tarjeta vuelve a ser la de antes (sin lines, con part)', card && !('lines' in card) && card.rule_type === 'stamps');
  const col = await v1(`select count(*)::int from information_schema.columns where table_name in ('loyalty_programs', 'loyalty_members') and column_name in ('parent_program_id', 'line_label', 'parent_member_id')`);
  ok('deshecha: sin columnas de líneas', col === 0);
  const r = await v1(`select loyalty_record('c1', $1, 'purchase', 0, null, null, 'clave-deshecha-1', 'caja')`, [M]);
  ok('deshecha: la caja sigue funcionando', r.member.balance === 1 && !('program_id' in r));
  // Y volver a aplicarla encima funciona
  await db.exec(sinNotify(readFileSync(dir + '0017_una_tarjeta_varias_lineas.sql', 'utf8')));
  ok('0017 se vuelve a aplicar tras deshacer', (await v1(`select jsonb_array_length(loyalty_member_card($1) -> 'lines')`, [M])) === 1);
}

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS 0017 PASARON');
process.exit(fallos ? 1 : 0);
