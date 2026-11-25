/**
 * Prueba de modules/avisos/sql/0006_cobro_y_ticket.sql (PGlite, tablas simuladas).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/avisos/sql/tests/pruebas_0006_pglite.mjs . && node pruebas_0006_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/modules/avisos/sql/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '').replace(/-- Comprobación[\s\S]*$/, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
await db.exec(`create role anon; create role authenticated;
create table public.appointments (id text primary key, company_id text, lead_id text, service text, slot_start text,
  status text, employee_id text, pagado_por text, cumplido_por text, created_at numeric default extract(epoch from now()), beneficiario text);
create table public.appointment_services (id text, appointment_id text, price numeric);
create table public.pending_payments (id text, appointment_id text, amount numeric, verified int);
create table public.employees (id text, company_id text, name text);
insert into public.employees values ('e-carlos', 'c1', 'Carlos');
create table public.comisiones_congeladas (linea_id text, appointment_id text, regla text, valor numeric);
create table public.panel_push_events (id serial, company_id text, tipo text, ref text, datos jsonb, not_before timestamptz, estado text,
  unique (company_id, tipo, ref));
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.avisos_apuntar(p_company text, p_tipo text, p_ref text, p_datos jsonb, p_fila_creada timestamptz default now(), p_retraso interval default interval '0')
returns void language plpgsql as $$ begin
  insert into public.panel_push_events (company_id, tipo, ref, datos, not_before, estado) values (p_company, p_tipo, p_ref, p_datos, now(), 'pendiente')
  on conflict do nothing; end $$;
create function public.avisos_tg_cita() returns trigger language plpgsql as $$ begin return null; end $$;
create trigger avisos_cita after insert on public.appointments for each row execute function public.avisos_tg_cita();`);
await db.exec(leer('0006_cobro_y_ticket.sql'));
await db.exec(leer('0006_cobro_y_ticket.sql'));

const ahora = (min = 0) => `to_char((now() + interval '${min} minutes') at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI')`;
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const ev = async (tipo, filtro = '') => (await db.query(`select datos from public.panel_push_events where tipo = '${tipo}' ${filtro} order by id`)).rows.map((r) => r.datos);
const cita = (id, slot, extra = '') => db.exec(`insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id)
  values ('${id}', 'c1', 'l1', 'Corte', ${slot}, 'confirmed', 'e-carlos');
  insert into public.appointment_services values ('${id}-s', '${id}', 30); ${extra}`);

// 1 · «Nueva cita» solo a futuro
await cita('t1', ahora(0));
await cita('f1', ahora(120));
const reservas = await ev('reserva');
ok('ticket con la hora ya empezada: sin «Nueva cita»', !reservas.some((d) => d.servicio && JSON.stringify(d).includes('t1')) && reservas.length === 1, JSON.stringify(reservas));

// 2 · Atendido por el barbero → por cobrar a la caja
await rol('empleado');
await db.exec(`update public.appointments set status = 'completed', cumplido_por = 'panel' where id = 't1'`);
let pc = await ev('pago', "and datos->>'clase' = 'por_cobrar'");
ok('barbero marca Atendido: «por cobrar en caja» a dueño/admin', pc.length === 1 && Number(pc[0].monto) === 30 && pc[0].barbero === 'Carlos', JSON.stringify(pc));
await rol('admin');
await cita('t2', ahora(-5));
await db.exec(`update public.appointments set status = 'completed' where id = 't2'`);
pc = await ev('pago', "and datos->>'clase' = 'por_cobrar'");
ok('si lo marca el admin, no se avisa a sí mismo', pc.length === 1);
await rol('empleado');
await cita('t3', ahora(-5));
await db.exec(`update public.appointments set status = 'completed', cumplido_por = 'cron' where id = 't3'`);
ok('el reloj que la da por hecha no avisa', (await ev('pago', "and datos->>'clase' = 'por_cobrar'")).length === 1);

// 4 · Pagó una parte (diferido: se mira al cerrar)
await rol('admin');
await db.exec(`begin; insert into public.pending_payments values ('p1', 't1', 10, 1); commit;`);
let ab = await ev('mi_agenda', "and datos->>'que' = 'abono'");
ok('pago a cuenta: al barbero «Pagó S/ 10 · falta S/ 20»', ab.length === 1 && Number(ab[0].pagado) === 10 && Number(ab[0].falta) === 20, JSON.stringify(ab));

// 3 · Cobrado todo en la misma transacción: sale «cobrada», no otro «abono»
await db.exec(`insert into public.comisiones_congeladas values ('t1-s', 't1', 'servicio', 50);`);
await db.exec(`begin; insert into public.pending_payments values ('p2', 't1', 20, 1);
  update public.appointments set pagado_por = 'panel' where id = 't1'; commit;`);
ab = await ev('mi_agenda', "and datos->>'que' = 'abono'");
const cob = await ev('mi_agenda', "and datos->>'que' = 'cobrada'");
ok('cobrado todo: «Cobrado · tu parte S/ 15», sin abono extra', ab.length === 1 && cob.length === 1 && Number(cob[0].parte) === 15 && cob[0].empleado === 'e-carlos', JSON.stringify(cob));

await rol('empleado');
await db.exec(`update public.appointments set pagado_por = 'panel' where id = 't2'`);
ok('si cobró el mismo barbero, no se le avisa', (await ev('mi_agenda', "and datos->>'que' = 'cobrada'")).length === 1);

await rol('admin');
await db.exec(`insert into public.appointments (id, company_id, lead_id, service, slot_start, status, employee_id) values ('viejo', 'c1', 'l1', 'Corte', '2020-01-01 10:00', 'completed', 'e-carlos');
  update public.appointments set pagado_por = 'panel' where id = 'viejo';`);
ok('lo de hace años (el espejo) no avisa', (await ev('mi_agenda', "and datos->>'que' = 'cobrada'")).length === 1);

await db.exec(leer('0006_cobro_y_ticket_deshacer.sql'));
ok('deshacer quita los disparadores', (await db.query(`select count(*)::int n from pg_trigger where tgname in ('avisos_abono', 'avisos_cobro_cita')`)).rows[0].n === 0);

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
