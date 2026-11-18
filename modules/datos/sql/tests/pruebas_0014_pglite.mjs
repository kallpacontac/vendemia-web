/**
 * Prueba de modules/datos/sql/0014_cierres_de_comision.sql contra Postgres (PGlite).
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0014_pglite.mjs . && node pruebas_0014_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/datos/sql/0014_cierres_de_comision.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');

const db = new PGlite();
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, extra); };
const espera = async (n, f, patron) => {
  try { await f(); ok(n + ' (no lanzó)', false); }
  catch (e) { ok(n, patron.test(e.message), '→ ' + e.message); }
};
const q = (s, p) => db.query(s, p);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);

await db.exec(`
create role anon; create role authenticated;
create schema if not exists auth; create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.v2_autorizar_agenda(p text, p_empleado_vale boolean default false) returns text language plpgsql as $$
begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso a este negocio.'; end if;
  if current_setting('t.rol', true) = 'empleado' and not p_empleado_vale then raise exception 'Eso lo hace el dueño o el administrador del negocio.'; end if;
  return current_setting('t.rol', true);
end $$;
create table employees (id text primary key, company_id text, name text);
create table appointments (id text primary key, company_id text, employee_id text, status text, slot_start text);
create table gastos (id text primary key, company_id text not null, fecha text not null, concepto text not null,
  categoria text not null default '', importe real not null, creado_por text not null default '', created_at bigint);
insert into employees values ('e1', 'c1', 'Alexander'), ('e2', 'c1', 'Brandy'), ('e9', 'c2', 'Otro');
insert into appointments values
  ('a1', 'c1', 'e1', 'completed', '2026-11-18 10:00'), ('a2', 'c1', 'e1', 'completed', '2026-11-18 11:00'),
  ('a3', 'c1', 'e1', 'confirmed', '2026-11-18 12:00'), ('a4', 'c1', 'e2', 'completed', '2026-11-18 10:00'),
  ('a9', 'c2', 'e9', 'completed', '2026-11-18 10:00');
`);
await db.exec(sql);
await db.exec(sql); // idempotente

const pago = (o = {}) => JSON.stringify({ employee_id: 'e1', desde: '2026-11-16', citas: ['a1', 'a2'], adelantos: ['g1'],
  comision: 25, adelantado: 10, pagado: 15, metodo: 'yape', ...o });

await rol('');
await espera('sin acceso', () => q(`select comision_cierres_leer('c1')`), /No tienes acceso/);
await rol('empleado');
await espera('el barbero no paga', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago()]), /dueño o el administrador/);
await rol('admin');
let r = await q(`select comision_cierres_leer('c1') v`);
ok('sin cierres: lista vacía', Array.isArray(r.rows[0].v) && r.rows[0].v.length === 0);
await espera('barbero de otro negocio', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ employee_id: 'e9' })]), /no es de este negocio/);
await espera('cita de otro barbero', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ citas: ['a1', 'a4'] })]), /no son de este barbero/);
await espera('cita sin atender', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ citas: ['a3'] })]), /no están atendidas/);
await espera('cita de otro negocio', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ citas: ['a9'] })]), /no son de este barbero/);
await espera('nada que pagar', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ citas: [], adelantos: [] })]), /nada que pagar/);
await espera('monto negativo', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ pagado: -1 })]), /no son válidos/);
await espera('método inventado', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ metodo: 'bitcoin' })]), /metodo_check/);

r = await q(`select comision_cierre_guardar('c1', $1::jsonb) v`, [pago({ citas: ['a1', 'a2', 'a1'] })]);
const c1 = r.rows[0].v;
ok('pagado: guarda montos y citas sin repetir', Number(c1.pagado) === 15 && c1.citas.length === 2 && c1.metodo === 'yape' && !('company_id' in c1));
await espera('la misma cita dos veces', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ citas: ['a2'], adelantos: [] })]), /ya se pagó/);
await espera('el mismo adelanto dos veces', () => q(`select comision_cierre_guardar('c1', $1::jsonb)`, [pago({ citas: [], adelantos: ['g1'] })]), /ya se pagó/);
r = await q(`select comision_cierre_guardar('c1', $1::jsonb) v`, [pago({ employee_id: 'e2', citas: ['a4'], adelantos: [], comision: 12.5, adelantado: 0, pagado: 12.5 })]);
ok('otro barbero, otro cierre', Number(r.rows[0].v.comision) === 12.5);
let g = await q(`select * from gastos where id = $1`, ['cierre-' + c1.id]);
ok('el pago sale como gasto de hoy', g.rows.length === 1 && Number(g.rows[0].importe) === 15 && g.rows[0].categoria === 'Comisiones'
  && /Comisión de Alexander \(yape\)/.test(g.rows[0].concepto) && /^\d{4}-\d{2}-\d{2}$/.test(g.rows[0].fecha) && c1.gasto_id === 'cierre-' + c1.id);
r = await q(`select comision_cierres_leer('c1') v`);
ok('leer: los dos, el último primero', r.rows[0].v.length === 2 && r.rows[0].v[0].employee_id === 'e2');

await espera('el admin no deshace', () => q(`select comision_cierre_borrar('c1', $1)`, [c1.id]), /solo lo puede el dueño/);
await rol('dueno');
await espera('deshacer de otro negocio', () => q(`select comision_cierre_borrar('c2', $1)`, [c1.id]), /ya no existe/);
await q(`select comision_cierre_borrar('c1', $1)`, [c1.id]);
g = await q(`select count(*)::int n from gastos where id = $1`, ['cierre-' + c1.id]);
ok('deshacer borra su gasto', g.rows[0].n === 0);
r = await q(`select comision_cierre_guardar('c1', $1::jsonb) v`, [pago()]);
ok('deshecho: se puede volver a pagar', Number(r.rows[0].v.pagado) === 15);
await db.exec(`alter table gastos add column employee_id text not null default ''`);
r = await q(`select comision_cierre_guardar('c1', $1::jsonb) v`, [pago({ employee_id: 'e2', citas: [], adelantos: ['g7'], comision: 0, adelantado: 5, pagado: 0 })]);
g = await q(`select count(*)::int n from gastos where company_id = 'c1'`);
ok('pagado 0: sin gasto', r.rows[0].v.gasto_id === '' && g.rows[0].n === 2);
await db.exec(`insert into appointments values ('a5', 'c1', 'e2', 'completed', '2026-11-18 15:00')`);
r = await q(`select comision_cierre_guardar('c1', $1::jsonb) v`, [pago({ employee_id: 'e2', citas: ['a5'], adelantos: [], comision: 9, adelantado: 0, pagado: 9 })]);
g = await q(`select employee_id from gastos where id = $1`, [r.rows[0].v.gasto_id]);
ok('con la 0013, el gasto dice a quién fue', g.rows[0]?.employee_id === 'e2');

r = await q(`select has_function_privilege('anon','public.comision_cierre_guardar(text,jsonb)','execute') a,
  has_table_privilege('authenticated','public.comision_cierres','select') b,
  has_function_privilege('authenticated','public.comision_cierres_leer(text,integer)','execute') c`);
ok('permisos: anon no, tabla cerrada, leer por función', r.rows[0].a === false && r.rows[0].b === false && r.rows[0].c === true);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO BIEN');
