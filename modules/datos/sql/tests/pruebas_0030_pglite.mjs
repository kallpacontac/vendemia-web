/**
 * Prueba de modules/datos/sql/0030_equipo_ve_con_captura.sql (sobre la 0029) contra PGlite.
 * Lo de antes y lo del bot, simulado como en pruebas_0029_pglite.mjs.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0030_pglite.mjs . && node pruebas_0030_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0029 = leer('modules/datos/sql/0029_equipo_ve_por_pagar.sql');
const s0030 = leer('modules/datos/sql/0030_equipo_ve_con_captura.sql').replace(/select public\.v2_equipo_ve_apartadas\('the247barbershop'\)[^;]*;/, '');

const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c) => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n); };
const espera = async (n, f, patron) => {
  try { await f(); console.log('MAL  (no lanzó)', n); fallos++; }
  catch (e) { const b = patron.test(e.message); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', n, '→', e.message); }
};
const uno = async (s, p) => (await q(s, p)).rows[0];
const como = (rol, ficha = '') => ex(`select set_config('t.rol', '${rol}', false), set_config('t.ficha', '${ficha}', false)`);
const refs = async () => (await q(`select ref from avisos order by n`)).rows.map((r) => r.ref);
const mias = async (ids) => Object.keys((await uno(`select mi_adelantos('c1', $1::text[]) as r`, [ids])).r).sort();

await ex(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.mi_empleado(p text) returns text language sql stable as $$ select nullif(current_setting('t.ficha', true), '') $$;
create function public.es_admin_plataforma() returns boolean language sql stable as $$ select false $$;
create function public.agenda_en_nube(p text) returns boolean language sql stable as $$ select true $$;
create function public.v2_foto_pago(p text) returns text language sql stable as $$ select 'apagada' $$;
create function public.v2_empleado_cobra(p text) returns boolean language sql stable as $$ select false $$;
create function public.v2_adelanto_minimo(p text, t numeric) returns numeric language sql stable as $$ select round(t * 0.5, 2) $$;

create table cobro_ajustes (company_id text primary key, foto_pago text not null default 'apagada',
  actualizado_por uuid, actualizado_at timestamptz not null default now());
create table appointments (id text primary key, company_id text, lead_id text, status text, employee_id text,
  slot_start text, service text, created_at bigint);
create table appointment_services (id text primary key, appointment_id text, price numeric);
create table pending_payments (id text primary key, company_id text, appointment_id text, amount numeric,
  created_at bigint not null default extract(epoch from now())::bigint);
create table comprobantes_web (id uuid primary key default gen_random_uuid(), company_id text, appointment_id text,
  estado text, creado_at timestamptz not null default now());

create table avisos (n serial, company_id text, tipo text, ref text, datos jsonb, unique (company_id, tipo, ref));
create function public.avisos_apuntar(c text, t text, r text, d jsonb, f timestamptz default now(), x interval default '0') returns void
language sql as $$ insert into avisos (company_id, tipo, ref, datos) values (c, t, r, d) on conflict do nothing $$;
`);

await ex(s0029);
await ex(`create trigger avisos_agenda_equipo after insert or update of employee_id, slot_start, status on public.appointments
          for each row execute function public.avisos_tg_agenda_equipo();`);
await ex(s0030);

const fut = (h) => `2099-01-01 ${h}`;
await ex(`
insert into appointments values
  ('a1', 'c1', 'l1', 'pending_payment', 'alex', '${fut('15:00')}', 'Corte', 0),
  ('a2', 'c1', 'l1', 'pending_payment', 'alex', '${fut('16:00')}', 'Corte', 0),
  ('a3', 'c1', 'l1', 'pending_payment', 'alex', '${fut('17:00')}', 'Corte', 0),
  ('a4', 'c1', 'l1', 'pending_payment', 'victor', '${fut('18:00')}', 'Corte', 0);
insert into appointment_services values ('s1', 'a1', 30), ('s2', 'a2', 30), ('s3', 'a3', 30), ('s4', 'a4', 30);
insert into comprobantes_web (company_id, appointment_id, estado) values ('c1', 'a1', 'revisar'), ('c1', 'a3', 'rechazado'), ('c1', 'a4', 'revisar');
insert into pending_payments (id, company_id, appointment_id, amount) values ('p2', 'c1', 'a2', 15);
`);
const todas = ['a1', 'a2', 'a3', 'a4'];

console.log('— de serie: nunca —');
await como('empleado', 'alex');
ok('cobro_foto_modo dice nunca', (await uno(`select cobro_foto_modo('c1') as r`)).r.equipo_ve_apartadas === 'nunca');
ok('mi_adelantos no le da nada', (await mias(todas)).length === 0);
ok('ningún aviso al equipo', (await refs()).length === 0);

console.log('— quién la cambia —');
await espera('el empleado no', () => q(`select equipo_ve_apartadas_guardar('c1', 'todas')`), /dueño o el administrador/);
await como('admin');
await espera('una postura que no existe, no', () => q(`select equipo_ve_apartadas_guardar('c1', 'algunas')`), /Elige/);
ok('el administrador sí', (await uno(`select equipo_ve_apartadas_guardar('c1', 'con_captura') as r`)).r.equipo_ve_apartadas === 'con_captura');
ok('y queda la de la 0029 apagada', (await uno(`select equipo_ve_por_pagar from cobro_ajustes`)).equipo_ve_por_pagar === false);

console.log('— con captura —');
await como('empleado', 'alex');
ok('cobro_foto_modo dice con_captura', (await uno(`select cobro_foto_modo('c1') as r`)).r.equipo_ve_apartadas === 'con_captura');
ok('ve la de captura por revisar y la de pago apuntado; no la rechazada ni la de otro', JSON.stringify(await mias(todas)) === '["a1","a2"]');
const r = (await uno(`select mi_adelantos('c1', array['a1','a2']) as r`)).r;
ok('a1 dice por revisar', r.a1.por_revisar === true && Number(r.a1.adelanto) === 15);
ok('a2 no (ya tiene pago apuntado)', r.a2.por_revisar === false && Number(r.a2.pagado) === 15);

// La captura llega: el aviso sale del trigger de comprobantes_web.
await ex(`insert into appointments values ('a5', 'c1', 'l1', 'pending_payment', 'alex', '${fut('19:00')}', 'Corte', 0)`);
ok('apartarse sin pagar no avisa', !(await refs()).includes('eq:nueva:a5'));
await ex(`insert into comprobantes_web (company_id, appointment_id, estado) values ('c1', 'a5', 'revisar')`);
ok('al subir la captura, le llega como nueva', (await refs()).includes('eq:nueva:a5'));
const n = (await refs()).length;
await ex(`update appointments set status = 'confirmed' where id = 'a5'`);
ok('confirmarla luego no repite el aviso', (await refs()).length === n);
// Una captura rechazada no la hace visible.
await ex(`insert into appointments values ('a6', 'c1', 'l1', 'pending_payment', 'alex', '${fut('20:00')}', 'Corte', 0)`);
await ex(`insert into comprobantes_web (company_id, appointment_id, estado) values ('c1', 'a6', 'rechazado')`);
ok('captura rechazada: sin aviso', !(await refs()).includes('eq:nueva:a6'));
// La captura y el cambio de la cita en la MISMA transacción: el UPDATE no la da por vista antes.
await ex(`insert into appointments values ('a7', 'c1', 'l1', 'pending_payment', 'alex', '${fut('21:00')}', 'Corte', 0)`);
await ex(`begin; update appointments set employee_id = 'victor' where id = 'a7';
          insert into comprobantes_web (company_id, appointment_id, estado) values ('c1', 'a7', 'revisar'); commit;`);
ok('reasignada y con captura: nueva para Victor', (await q(`select 1 from avisos where ref = 'eq:nueva:a7' and datos->>'empleado' = 'victor'`)).rows.length === 1);
// Una vista que se cancela avisa.
await ex(`update appointments set status = 'cancelled' where id = 'a1'`);
ok('cancelar una apartada con captura (la veía) avisa', (await refs()).some((x) => x.startsWith('eq:cancelada:a1')));
// Sin captura cancelada: no avisa (no la veía).
await ex(`update appointments set status = 'cancelled' where id = 'a3'`);
ok('cancelar una que no veía no avisa', !(await refs()).some((x) => x.startsWith('eq:cancelada:a3')));

console.log('— todas —');
await como('dueno');
await ex(`select equipo_ve_apartadas_guardar('c1', 'todas')`);
ok('todas = la de la 0029 encendida', (await uno(`select equipo_ve_por_pagar, equipo_ve_con_captura from cobro_ajustes`)).equipo_ve_por_pagar === true);
await como('empleado', 'alex');
ok('ve también la rechazada', (await mias(['a2', 'a6'])).length === 2);
await ex(`insert into appointments values ('a8', 'c1', 'l1', 'pending_payment', 'alex', '${fut('22:00')}', 'Corte', 0)`);
ok('una apartada nueva avisa al momento', (await refs()).includes('eq:nueva:a8'));
await ex(`insert into comprobantes_web (company_id, appointment_id, estado) values ('c1', 'a8', 'revisar')`);
ok('y la captura no la repite', (await refs()).filter((x) => x === 'eq:nueva:a8').length === 1);

console.log('— el dueño, siempre —');
await como('dueno');
await ex(`select equipo_ve_apartadas_guardar('c1', 'nunca')`);
ok('nunca: el dueño las sigue viendo', (await mias(['a2', 'a6'])).length === 2);
await como('empleado', 'alex');
ok('nunca: el empleado ya no', (await mias(['a2', 'a6'])).length === 0);

console.log('— otra vez —');
await ex(s0030);
ok('se puede correr dos veces', (await uno(`select count(*)::int as n from information_schema.columns where column_name = 'equipo_ve_con_captura'`)).n === 1);

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
