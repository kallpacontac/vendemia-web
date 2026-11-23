/**
 * Prueba de modules/datos/sql/0029_equipo_ve_por_pagar.sql contra un Postgres de verdad (PGlite).
 * Lo de antes (cobro_ajustes de la 0010, v2_empleado_cobra de la 0012, v2_adelanto_minimo de
 * tu-pagina 0021, avisos_apuntar de avisos 0001) y lo del bot (rol_en, mi_empleado), simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0029_pglite.mjs . && node pruebas_0029_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0029 = leer('modules/datos/sql/0029_equipo_ve_por_pagar.sql');
const deshacer = leer('scripts/equipo-ve-por-pagar-0029-deshacer.sql');

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
const avisos = async () => (await q(`select ref, datos->>'que' as que, datos->>'empleado' as emp from avisos order by n`)).rows;

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
-- Citas con 50 % de adelanto.
create function public.v2_adelanto_minimo(p text, t numeric) returns numeric language sql stable as $$ select round(t * 0.5, 2) $$;

create table cobro_ajustes (company_id text primary key, foto_pago text not null default 'apagada',
  actualizado_por uuid, actualizado_at timestamptz not null default now());
create table appointments (id text primary key, company_id text, lead_id text, status text, employee_id text,
  slot_start text, service text, created_at bigint);
create table appointment_services (id text primary key, appointment_id text, price numeric);
create table pending_payments (id text primary key, company_id text, appointment_id text, amount numeric);

create table avisos (n serial, company_id text, tipo text, ref text, datos jsonb, unique (company_id, tipo, ref));
create function public.avisos_apuntar(c text, t text, r text, d jsonb, f timestamptz default now(), x interval default '0') returns void
language sql as $$ insert into avisos (company_id, tipo, ref, datos) values (c, t, r, d) on conflict do nothing $$;
`);

await ex(s0029);
await ex(`create trigger avisos_agenda_equipo after insert or update of employee_id, slot_start, status on public.appointments
          for each row execute function public.avisos_tg_agenda_equipo();`);

const fut = (h) => `2099-01-01 ${h}`;
await ex(`
insert into appointments values
  ('a1', 'c1', 'l1', 'pending_payment', 'juan', '${fut('16:00')}', 'Corte', 0),
  ('a2', 'c1', 'l1', 'pending_payment', 'ana',  '${fut('17:00')}', 'Corte', 0),
  ('a3', 'c1', 'l1', 'pending_payment', '',     '${fut('18:00')}', 'Corte', 0),
  ('a4', 'c1', 'l1', 'confirmed',       'juan', '${fut('19:00')}', 'Corte', 0);
insert into appointment_services values ('s1', 'a1', 30), ('s2', 'a2', 20), ('s3', 'a3', 20), ('s4', 'a4', 15);
insert into pending_payments values ('p1', 'c1', 'a3', 4);
`);

console.log('— apagado de serie —');
await como('empleado', 'juan');
ok('cobro_foto_modo dice que no las ve', (await uno(`select cobro_foto_modo('c1') as r`)).r.equipo_ve_por_pagar === false);
ok('mi_adelantos no le da nada', JSON.stringify((await uno(`select mi_adelantos('c1', array['a1','a3']) as r`)).r) === '{}');
let av = await avisos();
ok('solo la confirmada avisa al insertar', av.length === 1 && av[0].ref === 'eq:nueva:a4');

await ex(`update appointments set slot_start = '${fut('16:30')}' where id = 'a1'`);
ok('mover una apartada no avisa', (await avisos()).length === 1);
await ex(`update appointments set status = 'confirmed' where id = 'a1'`);
av = await avisos();
ok('al confirmarse, le llega como nueva', av.some((a) => a.ref === 'eq:nueva:a1' && a.que === 'nueva' && a.emp === 'juan'));
await ex(`update appointments set status = 'cancelled' where id = 'a2'`);
ok('cancelar una apartada no avisa', !(await avisos()).some((a) => a.ref.includes('a2')));

console.log('— quién lo cambia —');
await espera('el empleado no', () => q(`select equipo_ve_por_pagar_guardar('c1', true)`), /dueño o el administrador/);
await como('');
await espera('alguien de fuera no', () => q(`select equipo_ve_por_pagar_guardar('c1', true)`), /No tienes acceso/);
await como('admin');
ok('el administrador sí', (await uno(`select equipo_ve_por_pagar_guardar('c1', true) as r`)).r.equipo_ve_por_pagar === true);
await espera('sin decir sí o no, no', () => q(`select equipo_ve_por_pagar_guardar('c1', null)`), /Di si/);

console.log('— encendido —');
await como('empleado', 'juan');
ok('cobro_foto_modo dice que las ve', (await uno(`select cobro_foto_modo('c1') as r`)).r.equipo_ve_por_pagar === true);
await ex(`insert into appointments values ('a5', 'c1', 'l1', 'pending_payment', 'juan', '${fut('20:00')}', 'Corte', 0), ('a6', 'c1', 'l1', 'pending_payment', 'ana', '${fut('21:00')}', 'Corte', 0)`);
await ex(`insert into appointment_services values ('s5', 'a5', 40), ('s6', 'a6', 40)`);
ok('una apartada nueva ya avisa', (await avisos()).some((a) => a.ref === 'eq:nueva:a5'));
const r = (await uno(`select mi_adelantos('c1', array['a3','a4','a5','a6']) as r`)).r;
ok('la suya: total 40, adelanto 20, nada pagado', r.a5 && Number(r.a5.total) === 40 && Number(r.a5.adelanto) === 20 && Number(r.a5.pagado) === 0);
ok('la sin asignar, con lo que pagó', r.a3 && Number(r.a3.pagado) === 4 && Number(r.a3.adelanto) === 10);
ok('la de Ana no', !r.a6);
ok('la confirmada no (no espera adelanto)', !r.a4);
const n = (await avisos()).length;
await ex(`update appointments set status = 'confirmed' where id = 'a5'`);
ok('confirmarla no repite el aviso', (await avisos()).length === n);
await ex(`update appointments set status = 'cancelled' where id = 'a6'`);
ok('cancelar una apartada que veía, avisa', (await avisos()).some((a) => a.ref.startsWith('eq:cancelada:a6')));

await como('dueno');
ok('el dueño ve todas las apartadas', Object.keys((await uno(`select mi_adelantos('c1', array['a3']) as r`)).r).length === 1);
await ex(`update cobro_ajustes set equipo_ve_por_pagar = false`);
ok('el dueño las ve aunque esté apagado', Object.keys((await uno(`select mi_adelantos('c1', array['a3']) as r`)).r).length === 1);

console.log('— otra vez y deshacer —');
await ex(s0029);
ok('se puede correr dos veces', (await uno(`select count(*)::int as n from information_schema.columns where column_name = 'equipo_ve_por_pagar'`)).n === 1);
await ex(deshacer);
ok('deshecho, sin columna', (await uno(`select count(*)::int as n from information_schema.columns where column_name = 'equipo_ve_por_pagar'`)).n === 0);
ok('deshecho, cobro_foto_modo como en la 0012', !('equipo_ve_por_pagar' in (await uno(`select cobro_foto_modo('c1') as r`)).r));
await ex(`insert into appointments values ('a7', 'c1', 'l1', 'pending_payment', 'juan', '${fut('22:00')}', 'Corte', 0)`);
ok('deshecho, la apartada vuelve a avisar como en la 0004', (await avisos()).some((a) => a.ref === 'eq:nueva:a7'));

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
