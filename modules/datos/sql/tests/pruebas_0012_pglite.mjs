/**
 * Prueba de modules/datos/sql/0012_cobra_el_empleado.sql contra un Postgres de verdad (PGlite).
 * Debajo corre la 0010 entera y la v2_comprobante_aplicar real (tu-pagina 0018); lo del bot
 * (rol_en, mi_empleado, es_admin_plataforma) y lo de canchas que no se prueba aquí, simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0012_pglite.mjs . && node pruebas_0012_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0010 = leer('modules/datos/sql/0010_comprobante_al_cobrar.sql');
const s0018 = leer('modules/tu-pagina/sql/0018_cobrar_cancha_en_panel.sql');
const aplicar = s0018.match(/create or replace function public\.v2_comprobante_aplicar[\s\S]*?end \$\$;/)[0];
const s0012 = leer('modules/datos/sql/0012_cobra_el_empleado.sql');

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

const U_DUENO = '00000000-0000-4000-8000-000000000001';
const U_JUAN = '00000000-0000-4000-8000-000000000002';
const U_ADMIN_VENDEMIA = '00000000-0000-4000-8000-000000000009';

await ex(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.mi_empleado(p text) returns text language sql stable as $$ select nullif(current_setting('t.ficha', true), '') $$;
create function public.es_admin_plataforma() returns boolean language sql stable as $$ select coalesce(current_setting('t.admin', true), '') = 'si' $$;
create function public.agenda_en_nube(p text) returns boolean language sql stable as $$ select true $$;
create function public.v2_autorizar_agenda(p text, p_empleado_vale boolean default false) returns text language plpgsql as $$
begin
  if public.rol_en(p) is null then raise exception 'No tienes acceso a este negocio.' using errcode = '42501'; end if;
  if public.rol_en(p) = 'empleado' and not p_empleado_vale then raise exception 'Eso lo hace el dueño o el administrador del negocio.' using errcode = '42501'; end if;
  return public.rol_en(p);
end $$;
create function public.v2_canchas_cfg(p text) returns jsonb language sql stable as $$ select '{"adelanto":"20"}'::jsonb $$;
create function public.v2_es_cancha(p text, i text) returns boolean language sql stable as $$ select i like 'cancha%' $$;
create function public.v2_cancha_motivo(p text, i text, ini text, m integer, ex text) returns text language sql stable as $$ select null::text $$;

create table companies (id text primary key, name text);
create table tu_pagina (company_id text, secciones jsonb);
create table catalog (id text primary key, company_id text, tipo text);
create table leads (id text primary key, company_id text, name text, phone text);
create table employees (id text primary key, company_id text, name text);
create table memberships (company_id text, auth_user_id text, employee_id text);
create table appointments (id text primary key, company_id text, lead_id text, status text, pagado_por text,
  employee_id text, slot_start text, slot_minutes integer, metodo_pago text, created_at bigint, service text);
create table appointment_services (id text primary key, appointment_id text, catalog_item_id text, price numeric, sort_order integer);
create table pending_payments (id text primary key, lead_id text, company_id text, amount numeric, voucher_path text,
  operation_id text, image_hash text, verified integer, order_id text, appointment_id text);
create table comprobantes_web (id uuid default gen_random_uuid(), company_id text, appointment_id text, lead_id text, url text,
  image_hash text, operacion text, metodo text, monto numeric, estado text, revisado_at timestamptz);

insert into companies values ('c1', 'Barbería'), ('c2', 'Otra');
insert into catalog values ('corte', 'c1', 'servicio'), ('cancha1', 'c1', 'servicio');
insert into leads values ('l1', 'c1', 'Pedro', '51999');
insert into employees values ('juan', 'c1', 'Juan'), ('ana', 'c1', 'Ana');
insert into memberships values ('c1', '${U_DUENO}', null), ('c1', '${U_JUAN}', 'juan');
-- a1: de Juan, S/ 40, sin pagar. a2: de Ana. a3: sin asignar, con S/ 10 a cuenta. a4: apartada (no cancha).
-- a5: cancha apartada, S/ 60. a6: cancelada.
insert into appointments values
  ('a1', 'c1', 'l1', 'confirmed', '', 'juan', '2026-11-12 18:00', 30, '', 0, 'Corte'),
  ('a2', 'c1', 'l1', 'confirmed', '', 'ana',  '2026-11-12 19:00', 30, '', 0, 'Corte'),
  ('a3', 'c1', 'l1', 'completed', '', '',     '2026-11-12 20:00', 30, '', 0, 'Corte'),
  ('a4', 'c1', 'l1', 'pending_payment', '', 'juan', '2026-11-13 10:00', 30, '', 0, 'Corte'),
  ('a5', 'c1', 'l1', 'pending_payment', '', '', '2026-11-12 21:00', 60, '', 0, 'Cancha 1'),
  ('a6', 'c1', 'l1', 'cancelled', '', 'juan', '2026-11-12 22:00', 30, '', 0, 'Corte');
insert into appointment_services values
  ('s1', 'a1', 'corte', 40, 0), ('s2', 'a2', 'corte', 40, 0), ('s3', 'a3', 'corte', 30, 0),
  ('s4', 'a4', 'corte', 40, 0), ('s5', 'a5', 'cancha1', 60, 0), ('s6', 'a6', 'corte', 40, 0);
insert into pending_payments values ('pp0', 'l1', 'c1', 10, '', 'x', '', 1, '', 'a3');
`);
await ex(s0010);
await ex(aplicar);
await ex(s0012);
await ex(s0012); // idempotente

const como = (rol, uid, ficha = '', admin = 'no') =>
  ex(`select set_config('t.rol', '${rol}', false), set_config('t.uid', '${uid}', false),
             set_config('t.ficha', '${ficha}', false), set_config('t.admin', '${admin}', false)`);
const h = (n) => n.toString(16).padStart(64, '0');
const foto = (n, op = '') => JSON.stringify({ url: `https://res.cloudinary.com/x/p${n}.jpg`, hash: h(n), operacion: op });
const cobrar = (cita, metodo, f) => q(`select empleado_cobrar_saldo('c1', $1, $2, $3::jsonb) v`, [cita, metodo, f]);

// ── Apagado de serie ──
await como('empleado', U_JUAN, 'juan');
let r = await uno(`select cobro_foto_modo('c1') v`);
ok('de serie, los empleados no cobran', r.v.empleado_cobra === false);
await espera('apagado: no cobra', () => cobrar('a1', 'cash', foto(1)), /los empleados no cobran/);
await espera('apagado: no sube foto', () => q(`select cobro_foto_permiso('c1')`), /los empleados no cobran/);

// ── Solo Vendemia lo enciende ──
await como('dueno', U_DUENO);
await espera('el dueño no lo enciende', () => q(`select cobro_empleado_guardar('c1', true)`), /equipo de Vendemia/);
await como('admin', U_DUENO);
await espera('el administrador tampoco', () => q(`select cobro_empleado_guardar('c1', true)`), /equipo de Vendemia/);
await como('', U_ADMIN_VENDEMIA, '', 'si');
r = await uno(`select cobro_empleado_guardar('c1', true) v`);
ok('Vendemia lo enciende', r.v.empleado_cobra === true);
r = await uno(`select foto_pago, empleado_cobra from cobro_ajustes where company_id = 'c1'`);
ok('la «Foto del pago» del negocio sigue apagada', r.foto_pago === 'apagada' && r.empleado_cobra === true);

// ── Encendido ──
await como('empleado', U_JUAN, 'juan');
r = await uno(`select cobro_foto_permiso('c1') v`);
ok('el empleado sube foto, y para él es obligatoria', r.v === 'obligatoria');
r = await uno(`select empleado_saldos('c1', array['a1','a2','a3','a4','a5','a6']) v`);
ok('saldos: suyas y sin asignar, con lo que falta', r.v.a1 == 40 && r.v.a3 == 20 && r.v.a5 == 60 && r.v.a4 == 40 && !('a2' in r.v) && !('a6' in r.v));

await espera('sin foto, ni en efectivo', () => cobrar('a1', 'cash', null), /necesitas la foto/);
await espera('método raro', () => cobrar('a1', 'bank_transfer', foto(1)), /efectivo, Yape o Plin/);
await espera('foto de fuera de Cloudinary', () => cobrar('a1', 'cash', JSON.stringify({ url: 'https://x.com/a.jpg', hash: h(1) })), /no es válida/);
await espera('la de Ana no', () => cobrar('a2', 'cash', foto(2)), /no es tuya/);
await espera('cancelada no', () => cobrar('a6', 'cash', foto(3)), /cancelada/);
await espera('apartada que no es cancha: la caja', () => cobrar('a4', 'cash', foto(4)), /la confirma la caja/);

r = await uno(`select v from (select (empleado_cobrar_saldo('c1', 'a1', 'cash', $1::jsonb)) v) x`, [foto(10)]);
ok('cobra su cita: el importe exacto (40)', Number(r.v.cobrado) === 40 && r.v.resultado === 'cobrada');
r = await uno(`select pagado_por, metodo_pago from appointments where id = 'a1'`);
ok('queda cobrada, en efectivo', r.pagado_por === 'panel' && r.metodo_pago === 'cash');
r = await uno(`select via, monto, subido_por::text u from comprobantes_cobro where ref_id = 'a1'`);
ok('queda quién la cobró, por dónde y cuánto', r.via === 'empleado' && Number(r.monto) === 40 && r.u === U_JUAN);
await espera('dos veces no', () => cobrar('a1', 'cash', foto(11)), /Ya está cobrada/);

r = await uno(`select v from (select (empleado_cobrar_saldo('c1', 'a3', 'yape', $1::jsonb)) v) x`, [foto(12, '555')]);
ok('sin asignar con S/ 10 a cuenta: cobra los 20 que faltan', Number(r.v.cobrado) === 20 && r.v.resultado === 'cobrada');
await espera('la misma foto en otro cobro', () => cobrar('a5', 'yape', foto(12)), /ya se usó/);
await espera('la misma operación con otra foto', () => cobrar('a5', 'yape', foto(13, '555')), /ya fue registrada/);

r = await uno(`select v from (select (empleado_cobrar_saldo('c1', 'a5', 'plin', $1::jsonb)) v) x`, [foto(14)]);
ok('cancha apartada: la cobra entera y queda confirmada', Number(r.v.cobrado) === 60 && r.v.resultado === 'cobrada');
r = await uno(`select status from appointments where id = 'a5'`);
ok('…confirmada', r.status === 'confirmed');

// Sin ficha enlazada: solo las sin asignar.
await ex(`insert into appointments values ('a7', 'c1', 'l1', 'confirmed', '', 'juan', '2026-11-12 23:00', 30, '', 0, 'Corte');
          insert into appointment_services values ('s7', 'a7', 'corte', 40, 0);`);
await como('empleado', U_JUAN, '');
await espera('sin ficha, la de Juan no', () => cobrar('a7', 'cash', foto(15)), /no es tuya/);

// El dueño y el administrador no usan esta puerta.
await como('dueno', U_DUENO);
await espera('el dueño cobra por la Caja', () => cobrar('a7', 'cash', foto(16)), /Esto es para el empleado/);

// La Caja: quién cobró.
r = await q(`select cobro_fotos_del_dia('c1', (now() at time zone 'America/Lima')::date::text) v`);
const filas = r.rows[0].v;
ok('la Caja dice «Juan» en las tres', filas.length === 3 && filas.every((f) => f.quien === 'Juan' && f.via === 'empleado'));

// Apagarlo de nuevo corta en seco.
await como('', U_ADMIN_VENDEMIA, '', 'si');
await q(`select cobro_empleado_guardar('c1', false)`);
await como('empleado', U_JUAN, 'juan');
await espera('apagado otra vez: no cobra', () => cobrar('a7', 'cash', foto(17)), /los empleados no cobran/);
await espera('apagado otra vez: sin saldos', () => q(`select empleado_saldos('c1', array['a7'])`), /los empleados no cobran/);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
