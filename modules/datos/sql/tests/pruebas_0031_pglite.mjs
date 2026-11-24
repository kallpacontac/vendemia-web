/**
 * Prueba de modules/datos/sql/0031_ingreso_sin_ticket_comision.sql contra PGlite.
 * Lo de antes (caja_ingresos de la 0023/0024/0026, comision_cierres de la 0014, gastos) y lo del bot
 * (rol_en, mi_empleado, v2_autorizar_agenda), simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0031_pglite.mjs . && node pruebas_0031_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0031 = leer('modules/datos/sql/0031_ingreso_sin_ticket_comision.sql');

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
const guardar = async (d) => (await uno(`select caja_ingreso_guardar('c1', $1::jsonb) as r`, [JSON.stringify(d)])).r;
const hoy = new Date().toISOString().slice(0, 10);

await ex(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.mi_empleado(p text) returns text language sql stable as $$ select nullif(current_setting('t.ficha', true), '') $$;
create function public.v2_autorizar_agenda(p text) returns void language plpgsql as $$
begin if public.rol_en(p) is null then raise exception 'No tienes acceso.'; end if; end $$;

create table employees (id text primary key, company_id text, name text, comision_pct numeric, is_active integer default 1);
create table appointments (id text primary key, company_id text, employee_id text, status text);
create table gastos (id text primary key, company_id text, fecha text, concepto text, categoria text, importe numeric,
  creado_por text, employee_id text);
create table caja_ingresos (id uuid primary key default gen_random_uuid(), company_id text not null, dia date not null,
  concepto text not null, importe numeric(12,2) not null, metodo text not null, sede text not null default '',
  employee_id text not null default '', creado_por uuid, creado_at timestamptz not null default now());
create table comision_cierres (id uuid primary key default gen_random_uuid(), company_id text, employee_id text, desde date,
  citas text[] not null default '{}', adelantos text[] not null default '{}', comision numeric, adelantado numeric,
  pagado numeric, metodo text, nota text, pagado_por uuid, gasto_id text, pagado_at timestamptz default now());

insert into employees values ('alex', 'c1', 'Alexander', 50), ('chino', 'c1', 'Chino', null), ('otro', 'c2', 'De otro', 40);
insert into appointments values ('cita1', 'c1', 'alex', 'completed');
-- De antes de la 0031 (la 0026): uno de corte, uno de producto, uno sin barbero.
insert into caja_ingresos (company_id, dia, concepto, importe, metodo, employee_id) values
  ('c1', '${hoy}', 'Corte sin ticket', 20, 'cash', 'alex'),
  ('c1', '${hoy}', 'Venta de producto', 10, 'cash', 'alex'),
  ('c1', '${hoy}', 'Fondo de caja', 100, 'cash', '');
`);

await ex(s0031);

console.log('— los de antes —');
const antes = (await q(`select concepto, suma_comision, comision_pct from caja_ingresos order by concepto`)).rows;
ok('el corte de Alexander suma, con su 50 %', antes.find((r) => r.concepto === 'Corte sin ticket').suma_comision === true
  && Number(antes.find((r) => r.concepto === 'Corte sin ticket').comision_pct) === 50);
ok('la venta de producto con barbero también suma', antes.find((r) => r.concepto === 'Venta de producto').suma_comision === true);
ok('el fondo de caja (sin barbero) no suma', antes.find((r) => r.concepto === 'Fondo de caja').suma_comision === false);

console.log('— apuntar —');
await como('empleado', 'alex');
await espera('el empleado no apunta', () => guardar({ dia: hoy, concepto: 'x', importe: 5 }), /solo los apunta el dueño/);
await como('dueno');
let r = await guardar({ dia: hoy, concepto: 'Corte con barba', importe: 30, metodo: 'yape', employee_id: 'alex', suma_comision: true });
ok('con barbero y suma: congela su %', r.suma_comision === true && Number(r.comision_pct) === 50);
r = await guardar({ dia: hoy, concepto: 'Propina', importe: 5 });
ok('sin barbero: no suma', r.suma_comision === false && r.comision_pct === null);
r = await guardar({ dia: hoy, concepto: 'Corte', importe: 25, employee_id: 'chino' });
ok('sin decirlo y de corte: suma; sin % ese día, null (usa el de hoy)', r.suma_comision === true && r.comision_pct === null);
r = await guardar({ dia: hoy, concepto: 'Venta de producto', importe: 8, employee_id: 'chino' });
ok('con barbero y sin decir nada: suma', r.suma_comision === true);
r = await guardar({ dia: hoy, concepto: 'Propina de Chino', importe: 4, employee_id: 'chino', suma_comision: false });
ok('el dueño apaga el interruptor: no suma', r.suma_comision === false && r.comision_pct === null);
r = await guardar({ dia: hoy, concepto: 'Corte', importe: 25, suma_comision: true });
ok('sin barbero nunca suma', r.suma_comision === false);
await espera('barbero de otro negocio, no', () => guardar({ dia: hoy, concepto: 'Corte', importe: 25, employee_id: 'otro' }), /no es de este negocio/);
await ex(`update employees set comision_pct = 70 where id = 'alex'`);
ok('subirle el % no cambia lo apuntado', Number((await uno(`select comision_pct from caja_ingresos where concepto = 'Corte con barba'`)).comision_pct) === 50);

console.log('— leer —');
const leidos = (await uno(`select caja_ingresos_leer('c1', '${hoy}') as r`)).r;
ok('el cierre del día dice si suma', leidos.every((i) => 'suma_comision' in i && 'comision_pct' in i));
let lst = (await uno(`select ingresos_con_comision('c1', '${hoy}', '${hoy}') as r`)).r;
ok('el dueño ve los 5 que suman', lst.length === 5);
await como('empleado', 'alex');
lst = (await uno(`select ingresos_con_comision('c1', '${hoy}', '${hoy}') as r`)).r;
ok('Alexander solo los suyos (3)', lst.length === 3 && lst.every((i) => i.employee_id === 'alex'));
await como('empleado', '');
ok('un empleado sin ficha, nada', (await uno(`select ingresos_con_comision('c1', '${hoy}', '${hoy}') as r`)).r.length === 0);
await como('');
await espera('alguien de fuera, no', () => q(`select ingresos_con_comision('c1', '${hoy}', '${hoy}')`), /No tienes acceso/);
await como('dueno');
ok('fuera de las fechas, nada', (await uno(`select ingresos_con_comision('c1', '2000-01-01', '2000-01-02') as r`)).r.length === 0);

console.log('— pagarle —');
const ids = (await q(`select 'ingreso:' || id::text as id from caja_ingresos where employee_id = 'alex' and suma_comision order by creado_at`)).rows.map((x) => x.id);
const pagar = (citas, emp = 'alex') => uno(`select comision_cierre_guardar('c1', $1::jsonb) as r`,
  [JSON.stringify({ employee_id: emp, desde: hoy, citas, adelantos: [], comision: 25, adelantado: 0, pagado: 25, metodo: 'efectivo' })]);
await espera('un ingreso que no suma, no', async () => {
  const no = (await uno(`select 'ingreso:' || id::text as id from caja_ingresos where concepto = 'Propina'`)).id;
  await pagar([no]);
}, /no son de este barbero/);
await espera('el ingreso de otro barbero, no', () => pagar(ids, 'chino'), /no son de este barbero/);
r = (await pagar(['cita1', ...ids])).r;
ok('cita + ingresos en un cierre', r.citas.length === 4);
ok('el gasto sale en la caja', (await q(`select 1 from gastos where id = $1`, [r.gasto_id])).rows.length === 1);
await espera('pagarlos dos veces, no', () => pagar([ids[0]]), /ya se pagó/);

console.log('— otra vez —');
await ex(s0031);
ok('se puede correr dos veces', (await uno(`select count(*)::int as n from caja_ingresos where suma_comision`)).n === 5);

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
