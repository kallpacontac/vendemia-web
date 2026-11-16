/**
 * Prueba de modules/tu-pagina/sql/0027_reprogramar_con_adelanto.sql contra un Postgres de verdad (PGlite).
 * Reales: v2_fecha_legible, v2_primer_nombre, v2_ocupa_hora, tu_pagina_sumar_min, v2_sede_cfg y v2_sede_llena.
 * Simulados: quién llama, la hora (t.ahora), v2_hueco (t.hueco = el motivo) y v2_wa.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0027_pglite.mjs . && node pruebas_0027_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const fn = (texto, nombre) => texto.match(new RegExp(`create or replace function public\\.${nombre}\\b[\\s\\S]*?\\$\\$;`))[0];
const s0004 = leer('modules/datos/sql/0004_agenda_en_nube.sql');
const s0025 = leer('modules/tu-pagina/sql/0025_aforo_por_sede.sql');
const s0027 = leer('modules/tu-pagina/sql/0027_reprogramar_con_adelanto.sql').replace(/-- Comprobación:[\s\S]*$/, '');

const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, extra); };
const uno = async (s, p) => (await q(s, p)).rows[0];

await ex(`
create role anon; create role authenticated;
create function public.v2_autorizar_agenda(p text, p_empleado_vale boolean default false) returns text language plpgsql as $$
begin
  if current_setting('t.rol', true) = 'empleado' and not p_empleado_vale then raise exception 'Eso lo hace el dueño o el administrador del negocio.'; end if;
  return 'dueno';
end $$;
create function public.v2_ahora() returns text language sql as $$ select current_setting('t.ahora', true) $$;
create function public.v2_hueco(p_company text, p_inicio text, p_minutos integer, p_empleado text, p_excepto text default '')
returns text language sql as $$ select nullif(current_setting('t.hueco', true), '') $$;
create function public.v2_wa(p_tel text, p_texto text) returns text language sql as $$ select 'https://wa.me/' || p_tel $$;

create table companies (id text primary key, slot_minutes integer);
create table tu_pagina (company_id text, secciones jsonb);
create table catalog (id text primary key, company_id text, name text, duration_minutes integer, tipo text default '');
create table leads (id text primary key, company_id text, phone text, name text);
create table appointments (id text primary key, company_id text, lead_id text, service text, slot_start text, slot_end text,
  slot_minutes integer, employee_id text default '', status text, sede text default '', beneficiario text default '',
  beneficiario_edad text default '', metodo_pago text default '', pagado_por text default '', cumplido_por text default '',
  created_at bigint default extract(epoch from now())::bigint);
create table appointment_services (id text primary key, appointment_id text, company_id text, catalog_item_id text, name text,
  price numeric, duration_minutes integer, sort_order integer);
create table pending_payments (id text primary key, company_id text, appointment_id text, amount numeric, created_at timestamptz default now());

insert into companies values ('b', 30);
insert into tu_pagina values ('b', '{"citas":{"sedes":[{"nombre":"Huallaga 625","capacidad":2},{"nombre":"Huallaga 646 Premium","capacidad":2}]}}');
insert into catalog values ('degradado', 'b', 'Corte degradado', 50, ''), ('cera', 'b', 'Cera', 0, 'producto');
insert into leads values ('l1', 'b', '51987654321', 'Carlos Ruiz'), ('l2', 'b', '51911111111', 'Ana');
insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, status, sede, metodo_pago) values
  ('a1', 'b', 'l1', 'Corte degradado', '2026-11-16 10:00', '2026-11-16 10:45', 45, 'no_show', 'Huallaga 625', 'yape'),
  ('a2', 'b', 'l2', 'Corte degradado', '2026-11-16 11:00', '2026-11-16 11:45', 45, 'no_show', 'Huallaga 625', ''),
  ('a3', 'b', 'l2', 'Corte degradado', '2026-11-16 12:00', '2026-11-16 12:45', 45, 'confirmed', 'Huallaga 625', 'yape'),
  ('a4', 'b', 'l2', 'Corte degradado', '2026-11-15 12:00', '2026-11-15 12:45', 45, 'cancelled', 'Huallaga 646 Premium', 'yape');
insert into appointment_services values
  ('s1', 'a1', 'b', 'degradado', 'Corte degradado', 20, 45, 0), ('s1b', 'a1', 'b', 'cera', 'Cera', 12, 0, 1),
  ('s2', 'a2', 'b', 'degradado', 'Corte degradado', 20, 45, 0), ('s3', 'a3', 'b', 'degradado', 'Corte degradado', 20, 45, 0),
  ('s4', 'a4', 'b', 'degradado', 'Corte degradado', 20, 45, 0);
insert into pending_payments (id, company_id, appointment_id, amount) values ('p1', 'b', 'a1', 10), ('p3', 'b', 'a3', 10), ('p4', 'b', 'a4', 32);
`);
for (const n of ['v2_fecha_legible', 'v2_primer_nombre', 'v2_ocupa_hora']) await ex(fn(s0004, n));
await ex(fn(leer('modules/tu-pagina/sql/0002_tienda_y_reservas.sql'), 'tu_pagina_sumar_min'));
await ex(fn(s0025, 'v2_sede_llena'));
await ex(fn(s0025, 'v2_sede_cfg'));
await ex(s0027);
await ex(`set t.rol = 'dueno'; set t.ahora = '2026-11-16 15:00'; set t.hueco = ''`);

const repro = async (datos) => {
  try { return (await uno(`select public.agenda_reprogramar('b', $1::jsonb) as v`, [JSON.stringify(datos)])).v; }
  catch (e) { return { error: e.message }; }
};
const lista = async () => (await uno(`select public.agenda_adelantos_sin_usar('b') as v`)).v;

// 1 · La lista: «No vino» y canceladas con pagos, sin reprogramar
let l = await lista();
ok('lista: a1 (no vino, S/ 10) y a4 (cancelada, S/ 32); sin a2 (no pagó) ni a3 (sigue en pie)',
  JSON.stringify(l.map((x) => x.id).sort()) === '["a1","a4"]', JSON.stringify(l.map((x) => [x.id, x.pagado])));
ok('lista: trae cliente, pagado y total', l.find((x) => x.id === 'a1').cliente === 'Carlos Ruiz' && Number(l.find((x) => x.id === 'a1').pagado) === 10 && Number(l.find((x) => x.id === 'a1').total) === 32);

// 2 · Reprogramar: cita nueva, el dinero pasa
let r = await repro({ id: 'a1', slot_start: '2026-11-17 16:00' });
ok('reprograma: ok, 50 min (la duración de hoy, sin el producto)', r.status === 'ok' && r.minutos === 50, JSON.stringify(r));
const nueva = await uno(`select * from appointments where id = $1`, [r.id]);
ok('nueva: confirmada, misma sede, mismo cliente, enlazada', nueva.status === 'confirmed' && nueva.sede === 'Huallaga 625' && nueva.lead_id === 'l1'
  && nueva.reprogramada_de === 'a1' && nueva.slot_end === '2026-11-17 16:50');
const vieja = await uno(`select * from appointments where id = 'a1'`);
ok('vieja: sigue «No vino» y apunta a la nueva', vieja.status === 'no_show' && vieja.reprogramada_a === r.id);
ok('el pago pasa (misma fila, no copia)', (await uno(`select appointment_id from pending_payments where id = 'p1'`)).appointment_id === r.id
  && Number((await uno(`select count(*) as n from pending_payments`)).n) === 3);
ok('servicios y precios copiados', Number((await uno(`select sum(price) as t from appointment_services where appointment_id = $1`, [r.id])).t) === 32);
ok('cuentas: total 32, pagado 10, falta 22', Number(r.total) === 32 && Number(r.pagado) === 10 && Number(r.falta) === 22);
ok('mensaje con fecha, sede y adelanto', r.mensaje === 'Hola Carlos! Te reprogramamos tu cita de Corte degradado para el martes 17 de noviembre a las 16:00 en Huallaga 625. Tu adelanto de S/ 10 ya está en esta cita. ¿Te queda bien?', r.mensaje);
ok('ya no sale en la lista', !(await lista()).some((x) => x.id === 'a1'));
r = await repro({ id: 'a1', slot_start: '2026-11-18 10:00' });
ok('dos veces: no', /ya se reprogramó/.test(r.error ?? ''), JSON.stringify(r));

// 3 · Reglas
r = await repro({ id: 'a3', slot_start: '2026-11-18 10:00' });
ok('cita en pie: no (para eso «Cambiar»)', /Solo se reprograma/.test(r.error ?? ''));
r = await repro({ id: 'a4', slot_start: '2026-11-16 14:00' });
ok('hora pasada: no', /ya pasó/.test(r.error ?? ''));
r = await repro({ id: 'a4', slot_start: 'mañana' });
ok('sin hora: no', /Elige el día y la hora/.test(r.error ?? ''));
r = await repro({ id: 'a4', slot_start: '2026-11-18 10:00', sede: 'Otra' });
ok('sede inventada: no', /Elige la sede/.test(r.error ?? ''));
await ex(`set t.hueco = 'a esa hora el local está cerrado o no hay nadie de turno'`);
r = await repro({ id: 'a4', slot_start: '2026-11-18 22:00' });
ok('local cerrado: claro', r.error === 'No se puede el miércoles 18 de noviembre a las 22:00: a esa hora el local está cerrado o no hay nadie de turno. Elige otra hora.', r.error);
await ex(`set t.hueco = ''`);

// 4 · Aforo de la sede (2 sillas): no crea y lo dice; la otra sede sí
await ex(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, status, sede) values
  ('o1', 'b', 'l2', 'X', '2026-11-18 10:00', '2026-11-18 11:00', 60, 'confirmed', 'Huallaga 646 Premium'),
  ('o2', 'b', 'l2', 'X', '2026-11-18 10:30', '2026-11-18 11:00', 30, 'confirmed', '')`);
r = await repro({ id: 'a4', slot_start: '2026-11-18 10:00' });
ok('sede llena: no se crea y dice cuántas sillas', r.error === 'No se puede el miércoles 18 de noviembre a las 10:00: Huallaga 646 Premium ya tiene sus 2 sillas ocupadas a esa hora. Elige otra hora u otra sede.', r.error);
ok('nada a medias: el pago sigue en la cancelada', (await uno(`select appointment_id from pending_payments where id = 'p4'`)).appointment_id === 'a4');
r = await repro({ id: 'a4', slot_start: '2026-11-18 10:00', sede: 'Huallaga 625' });
ok('en la otra sede (sin las suyas): sí... 625 tiene 1 sin sede', r.status === 'ok' && r.sede === 'Huallaga 625', JSON.stringify(r));
ok('pagó todo: la nueva queda cobrada', Number(r.falta) === 0 && (await uno(`select pagado_por from appointments where id = $1`, [r.id])).pagado_por === 'panel');
ok('pagó todo: el mensaje no habla de adelanto', /Ya la tienes pagada/.test(r.mensaje) && !/adelanto/.test(r.mensaje), r.mensaje);

// 5 · «No vino» libera la hora: una cita no_show no ocupa silla
await ex(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, status, sede) values
  ('n1', 'b', 'l2', 'X', '2026-11-19 10:00', '2026-11-19 11:00', 60, 'no_show', 'Huallaga 625'),
  ('n2', 'b', 'l2', 'X', '2026-11-19 10:00', '2026-11-19 11:00', 60, 'confirmed', 'Huallaga 625')`);
await ex(`insert into pending_payments (id, company_id, appointment_id, amount) values ('pn', 'b', 'a2', 5)`);
r = await repro({ id: 'a2', slot_start: '2026-11-19 10:00' });
ok('con un «No vino» y una en pie a esa hora (2 sillas): cabe', r.status === 'ok', JSON.stringify(r));

// 6 · Solo dueño o administrador
await ex(`set t.rol = 'empleado'`);
let e = '';
try { await uno(`select public.agenda_adelantos_sin_usar('b') as v`); } catch (x) { e = x.message; }
ok('el barbero no ve la lista de adelantos', /dueño o el administrador/.test(e));

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
