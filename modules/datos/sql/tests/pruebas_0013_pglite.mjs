/**
 * Prueba de modules/datos/sql/0013_gastos_y_adelantos.sql contra un Postgres de verdad (PGlite).
 * Simulados (ajustes t.*): quién llama (rol y ficha) y la hora.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0013_pglite.mjs . && node pruebas_0013_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const s0013 = readFileSync(`${repo}/modules/datos/sql/0013_gastos_y_adelantos.sql`, 'utf8')
  .replace(/notify pgrst[^;]*;/g, '').replace(/-- Comprobación:[\s\S]*$/, '');

const db = new PGlite();
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, extra); };
const uno = async (s, p) => (await db.query(s, p)).rows[0];

await db.exec(`
create role anon; create role authenticated;
create schema if not exists auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function public.v2_autorizar_agenda(p text, p_empleado_vale boolean default false) returns text language plpgsql as $$
begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso a este negocio.'; end if;
  if current_setting('t.rol', true) = 'empleado' and not p_empleado_vale then raise exception 'Eso lo hace el dueño o el administrador del negocio.'; end if;
  return current_setting('t.rol', true);
end $$;
create function public.mi_empleado(p text) returns text language sql as $$ select nullif(current_setting('t.ficha', true), '') $$;
create table employees (id text primary key, company_id text, name text);
create table gastos (id text primary key, company_id text not null, fecha text not null, concepto text not null,
  categoria text not null default '', importe real not null, creado_por text not null default '', created_at bigint not null default 0);
create table appointments (id text primary key, company_id text, status text, slot_start text);
create table appointment_services (id text primary key, appointment_id text, company_id text, catalog_item_id text);
insert into employees values ('e1', 'b', 'Alexander'), ('e2', 'b', 'Brandy'), ('x1', 'otro', 'Ajeno');
insert into gastos values ('viejo', 'b', '2026-11-01', 'Adelanto a Brandy', 'Adelanto', 30, '', 0);
`);
await db.exec(s0013);
const como = (rol, ficha = '') => db.exec(`set t.rol = '${rol}'; set t.ficha = '${ficha}'`);
const guardar = async (g) => {
  try { return (await uno(`select public.agenda_gasto_guardar('b', $1::jsonb) as v`, [JSON.stringify(g)])).v; }
  catch (e) { return { error: e.message }; }
};

ok('el de antes con categoría «Adelanto» pasa a adelanto', (await uno(`select tipo from gastos where id = 'viejo'`)).tipo === 'adelanto');

await como('admin');
let r = await guardar({ fecha: '2026-11-18', concepto: 'Luz', importe: 80 });
ok('del negocio por defecto', r.tipo === 'negocio' && r.employee_id === '', JSON.stringify(r));
r = await guardar({ fecha: '2026-11-18', concepto: 'Adelanto', importe: 50, tipo: 'adelanto', employee_id: 'e1' });
ok('adelanto a un barbero', r.tipo === 'adelanto' && r.employee_id === 'e1', JSON.stringify(r));
r = await guardar({ fecha: '2026-11-18', concepto: 'Almuerzo de Brandy', importe: 12, tipo: 'negocio', employee_id: 'e2' });
ok('almuerzo para un barbero, del negocio (no se descuenta)', r.tipo === 'negocio' && r.employee_id === 'e2', JSON.stringify(r));
r = await guardar({ fecha: '2026-11-18', concepto: 'Retiro', importe: 100, tipo: 'personal', employee_id: 'e1' });
ok('personal: sin barbero', r.tipo === 'personal' && r.employee_id === '', JSON.stringify(r));
r = await guardar({ fecha: '2026-11-18', concepto: 'Adelanto', importe: 50, tipo: 'adelanto' });
ok('adelanto sin barbero: no', /elige el barbero/.test(r.error ?? ''), JSON.stringify(r));
r = await guardar({ fecha: '2026-11-18', concepto: 'Adelanto', importe: 50, tipo: 'adelanto', employee_id: 'x1' });
ok('barbero de otro negocio: no', /no es de este negocio/.test(r.error ?? ''));
r = await guardar({ fecha: '2026-11-18', concepto: 'Nada', importe: 0 });
ok('importe 0: no', /mayor que 0/.test(r.error ?? ''));
r = await guardar({ fecha: '2026-11-18', concepto: 'Raro', importe: 5, tipo: 'regalo' });
ok('tipo inventado: no', /no existe/.test(r.error ?? ''));

await como('empleado', 'e1');
r = await guardar({ fecha: '2026-11-18', concepto: 'Yo mismo', importe: 5 });
ok('el barbero no apunta gastos', /dueño o el administrador/.test(r.error ?? ''));
let a = (await uno(`select public.mis_adelantos('b', '2026-11-01', '2026-11-30') as v`)).v;
ok('mis adelantos: solo los suyos', Number(a.total) === 50 && a.filas.length === 1, JSON.stringify(a));
await como('empleado', 'e2');
a = (await uno(`select public.mis_adelantos('b', '2026-11-01', '2026-11-30') as v`)).v;
ok('el almuerzo del negocio no es adelanto de Brandy', Number(a.total) === 0, JSON.stringify(a));
await como('empleado', '');
a = (await uno(`select public.mis_adelantos('b', '2026-11-01', '2026-11-30') as v`)).v;
ok('sin ficha: cero', Number(a.total) === 0);

await db.exec(`
insert into appointments values ('a1','b','completed', to_char(now() - interval '2 days', 'YYYY-MM-DD') || ' 10:00'),
  ('a2','b','confirmed', to_char(now(), 'YYYY-MM-DD') || ' 10:00'), ('a3','b','cancelled', to_char(now(), 'YYYY-MM-DD') || ' 11:00'),
  ('a4','b','completed', '2025-01-01 10:00');
insert into appointment_services values ('s1','a1','b','corte'), ('s2','a1','b','cera'), ('s3','a2','b','corte'), ('s4','a3','b','corte'), ('s5','a4','b','corte');
`);
await como('admin');
const mv = (await uno(`select public.caja_mas_vendidos('b') as v`)).v;
ok('más vendidos: 60 días, sin canceladas', mv.corte === 2 && mv.cera === 1, JSON.stringify(mv));

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
