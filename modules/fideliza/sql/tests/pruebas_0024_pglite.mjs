/**
 * Prueba de modules/fideliza/sql/0024 (la visita en la tarjeta) contra PGlite, con 0001–0018 y 0024
 * cargadas sobre auth.uid(), companies y memberships simulados, y la agenda del bot (appointments,
 * appointment_services, catalog, employees) y tu_pagina simuladas con sus columnas mínimas.
 *
 *   npm i --no-save @electric-sql/pglite@0.5.8
 *   node modules/fideliza/sql/tests/pruebas_0024_pglite.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
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
for (const f of readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) <= 18).sort()) {
  try { await db.exec(sinNotify(readFileSync(dir + f, 'utf8'))); } catch (e) { console.log('FALLA', f, '→', e.message); throw e; }
}
await db.exec(sinNotify(readFileSync(dir + '0024_visita_en_la_tarjeta.sql', 'utf8'))); // idempotente
await db.exec(`create or replace function public.loyalty_srv_check() returns void language sql as $$ select $$;`);

let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const q = async (s, p) => (await db.query(s, p)).rows;
const v1 = async (s, p) => Object.values((await q(s, p))[0])[0];
const U = '11111111-1111-1111-1111-111111111111';
let k = 0;
const clave = () => 'clave-prueba-' + (++k);

await db.exec(`select set_config('t.uid', '${U}', false);
insert into companies values ('c1','The 24/7',''), ('c2','Otro','');
insert into memberships values ('m1','${U}','c1','owner',null), ('m2','${U}','c2','owner',null);`);
await q(`select loyalty_settings_save('c1', '{"slug":"the247-x","display_name":"The 24/7"}')`);
const prog = await v1(`select loyalty_program_save('c1', null, 'Club 24/7', 'x', 'repeat', $1::jsonb)`,
  [JSON.stringify({ rule_type: 'stamps', stamps_per_purchase: 1, reward_threshold: 6, reward_description: 'Corte o barba gratis' })]);
await q(`select loyalty_program_publish('c1', $1)`, [prog]);
const alta = await v1(`select loyalty_member_create('c1', 'Luis', '+51987654321', null, false, 'alta-luis-0001', 'panel')`);
const LUIS = alta.member_id;
const TOK = alta.card_token;
const tarjeta = () => v1(`select loyalty_srv_card($1, false)`, [TOK]);

// ═══ 1 · Sin las tablas de la agenda (negocio sin bot): la tarjeta sigue igual ═══
await q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, 'cita-sin-tablas', 'caja')`, [LUIS]);
let c = await tarjeta();
ok('sin tablas de agenda: el movimiento sale sin visita', c.status === 'ok' && c.movements.length === 1 && c.movements[0].visit === null, JSON.stringify(c.movements));
ok('sin tu_pagina: reservar_slug null', c.reservar_slug === null);

// ═══ 2 · Con la agenda ═══════════════════════════════════════════════════════
await db.exec(`
create table public.appointments (id text primary key, company_id text, lead_id text default '', service text default '',
  slot_start text default '', status text default 'completed', employee_id text default '', sede text default '');
create table public.appointment_services (id text primary key, appointment_id text, catalog_item_id text default '',
  name text default '', price numeric default 0, duration_minutes int default 0, sort_order int default 0);
create table public.catalog (id text, company_id text, name text, tipo text default '', primary key (company_id, id));
create table public.employees (id text primary key, company_id text, name text default '');
create table public.tu_pagina (company_id text primary key, slug text, publicada boolean default false, secciones jsonb default '{}');
insert into employees values ('e-carlos','c1','Carlos'), ('e-otro','c2','Ajeno');
insert into catalog values ('s-corte','c1','Corte clásico',''), ('s-barba','c1','Barba','servicio'), ('p-coca','c1','Coca-Cola','producto');
-- Ticket de caja: corte + barba + bebida, con Carlos, en Huallaga 646.
insert into appointments (id, company_id, service, employee_id, sede) values
  ('apt-0001','c1','Corte clásico + Barba + Coca-Cola','e-carlos','Huallaga 646'),
  ('apt-0002','c1','Corte clásico','',''),
  ('apt-0003','c1','','e-carlos',''),
  ('apt-0004','c2','Corte de otro','e-otro','X');
insert into appointment_services (id, appointment_id, catalog_item_id, name, sort_order) values
  ('x1','apt-0001','p-coca','Coca-Cola',2), ('x2','apt-0001','s-barba','Barba',1), ('x3','apt-0001','s-corte','Corte clásico',0);
`);
c = await tarjeta();
ok('la operación vieja con cita inexistente sigue sin visita', c.movements[0].visit === null);

await q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, 'cita-apt-0001', 'caja')`, [LUIS]);
c = await tarjeta();
let vis = c.movements[0].visit;
ok('ticket: servicios en orden y sin la bebida', vis?.servicio === 'Corte clásico + Barba', JSON.stringify(vis));
ok('ticket: barbero, su id y la sede', vis?.barbero === 'Carlos' && vis?.barbero_id === 'e-carlos' && vis?.sede === 'Huallaga 646', JSON.stringify(vis));
ok('el movimiento conserva kind, units y fecha', c.movements[0].kind === 'earn' && c.movements[0].units === 1 && !!c.movements[0].at);

await q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, 'cita-apt-0002', 'caja')`, [LUIS]);
vis = (await tarjeta()).movements[0].visit;
ok('cita sin servicios desglosados ni barbero: el texto de la cita, sin barbero', vis?.servicio === 'Corte clásico' && vis?.barbero === null && vis?.barbero_id === null && vis?.sede === null, JSON.stringify(vis));

await q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, 'cita-apt-0003', 'caja')`, [LUIS]);
vis = (await tarjeta()).movements[0].visit;
ok('cita con barbero y sin servicio: solo el barbero', vis?.servicio === null && vis?.barbero === 'Carlos', JSON.stringify(vis));

await q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, 'cita-apt-0004', 'caja')`, [LUIS]);
vis = (await tarjeta()).movements[0].visit;
ok('una cita de OTRO negocio con la misma clave no se muestra', vis === null, JSON.stringify(vis));

await q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, $2, 'caja')`, [LUIS, clave()]);
vis = (await tarjeta()).movements[0].visit;
ok('sello a mano en «Escanear tarjeta»: sin visita', vis === null);

// Premio al 6.º sello: la fila del premio no repite la visita.
c = await tarjeta();
const premio = c.movements.find((m) => m.kind === 'reward_issue');
ok('al llegar a 6 hay premio y su fila no trae visita', !!premio && premio.visit === null, JSON.stringify(c.movements.map((m) => m.kind)));

// ═══ 3 · El enlace para reservar ═════════════════════════════════════════════
await db.exec(`insert into tu_pagina values ('c1','the247', false, '{"reservar": true}')`);
ok('página sin publicar: sin enlace', (await tarjeta()).reservar_slug === null);
await db.exec(`update tu_pagina set publicada = true, secciones = '{"reservar": false}'`);
ok('publicada pero sin reservas: sin enlace', (await tarjeta()).reservar_slug === null);
await db.exec(`update tu_pagina set secciones = '{"reservar": true}'`);
ok('publicada y con reservas: the247', (await tarjeta()).reservar_slug === 'the247');

// ═══ 4 · Permisos: los ayudantes no son públicos ═════════════════════════════
const priv = await q(`select has_function_privilege('anon', 'public.loyalty_visita_de_tx(text,uuid)', 'execute') a,
                             has_function_privilege('authenticated', 'public.loyalty_reservar_slug(text)', 'execute') b`);
ok('anon/authenticated no ejecutan los ayudantes', priv[0].a === false && priv[0].b === false, JSON.stringify(priv));

console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
process.exit(fallos ? 1 : 0);
