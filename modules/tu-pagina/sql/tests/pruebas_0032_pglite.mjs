/**
 * Prueba de modules/tu-pagina/sql/0032_comprobante_antifraude.sql contra un Postgres de verdad (PGlite).
 * Reales: v2_canchas_cfg (0011), comprobantes_web (0017), v2_valida_operacion (0018), lo de la 0021 y la 0032.
 * Simulados: loyalty_srv_check, v2_autorizar_agenda, v2_hueco/v2_cancha_motivo, avisos_apuntar (a una tabla).
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0032_pglite.mjs . && node pruebas_0032_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const fn = (texto, nombre) => texto.match(new RegExp(`create or replace function public\\.${nombre}\\b[\\s\\S]*?\\$\\$;`))[0];
const s0011 = leer('modules/tu-pagina/sql/0011_canchas_y_avisame.sql');
const s0017 = leer('modules/tu-pagina/sql/0017_pago_de_cancha.sql');
const s0018 = leer('modules/tu-pagina/sql/0018_cobrar_cancha_en_panel.sql');
const s0021 = leer('modules/tu-pagina/sql/0021_adelanto_de_citas.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const s0032 = leer('modules/tu-pagina/sql/0032_comprobante_antifraude.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const tablaComprobantes = s0017.match(/create table if not exists public\.comprobantes_web[\s\S]*?\n\);/)[0];

const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, extra); };
const uno = async (s, p) => (await q(s, p)).rows[0];

await ex(`
create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key, email text);
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create function public.v2_telefono(p text) returns text language sql immutable as $$
  select case when d ~ '^9\\d{8}$' then '51' || d else d end from (select regexp_replace(coalesce(p, ''), '\\D', '', 'g') as d) x $$;
create function public.v2_autorizar_agenda(p text, p_empleado_vale boolean default false) returns text language sql as $$ select 'owner' $$;
create function public.v2_cancha_motivo(p text, i text, ini text, m integer, ex text default '') returns text language sql stable as $$ select null::text $$;
create function public.v2_hueco(p_company text, p_inicio text, p_minutos integer, p_empleado text, p_excepto text default '') returns text language sql as $$ select null::text $$;
create function public.v2_primer_nombre(p text) returns text language sql immutable as $$
  select case when btrim(coalesce(p, '')) = '' then '' else ' ' || split_part(btrim(p), ' ', 1) end $$;
create function public.v2_wa(p_tel text, p_texto text) returns text language sql immutable as $$ select 'https://wa.me/' || public.v2_telefono(p_tel) $$;
create table panel_push_events (id serial, company_id text, tipo text, ref text, datos jsonb, estado text default 'pendiente', unique (company_id, tipo, ref));
create function public.avisos_apuntar(p_company text, p_tipo text, p_ref text, p_datos jsonb, p_creado timestamptz default now(), p_espera interval default null)
returns void language sql as $$ insert into panel_push_events (company_id, tipo, ref, datos) values (p_company, p_tipo, p_ref, p_datos) on conflict do nothing $$;
create function public.avisos_generar_recordatorios() returns void language sql as $$ select $$;

create table companies (id text primary key, payment_methods text);
create table tu_pagina (company_id text, slug text, publicada boolean, secciones jsonb);
create table catalog (id text primary key, company_id text, tipo text);
create table leads (id text primary key, company_id text, name text, phone text);
create table memberships (company_id text, auth_user_id text, role text);
create table pagina_idem (company_id text, codigo text, ref_id text, creado_at timestamptz default now());
create table appointments (id text primary key, company_id text, lead_id text, status text, pagado_por text,
  employee_id text, slot_start text, slot_minutes integer, metodo_pago text, created_at bigint, service text);
create table appointment_services (id text primary key, appointment_id text, catalog_item_id text, price numeric);
create table pending_payments (id text primary key, lead_id text, company_id text, amount numeric, voucher_path text,
  operation_id text, image_hash text, verified integer, order_id text, appointment_id text);

insert into auth.users values ('00000000-0000-0000-0000-000000000001', 'dueno@x.pe'), ('00000000-0000-0000-0000-000000000002', 'barbero@x.pe');
insert into memberships values ('barber', '00000000-0000-0000-0000-000000000001', 'owner'), ('barber', '00000000-0000-0000-0000-000000000002', 'employee');
insert into companies values ('barber', '[{"type":"yape","number":"51914440860","name":""}]');
insert into tu_pagina values ('barber', 'barber', true, '{"reservar":true,"citas":{"adelanto":50,"comprobante":"pagina","validacion":"automatica"}}');
insert into catalog values ('corte', 'barber', '');
insert into leads values ('l1', 'barber', 'Pedro Ruiz', '51999111222'), ('l2', 'barber', 'Luis', '51999333444');
insert into appointments values
  ('a1', 'barber', 'l1', 'pending_payment', '', '', '2026-11-20 10:00', 30, '', 0, 'Corte clásico'),
  ('a2', 'barber', 'l1', 'pending_payment', '', '', '2026-11-20 11:00', 30, '', 0, 'Corte clásico'),
  ('a3', 'barber', 'l1', 'pending_payment', '', '', '2026-11-20 12:00', 30, '', 0, 'Corte clásico'),
  ('a4', 'barber', 'l2', 'pending_payment', '', '', '2026-11-20 13:00', 30, '', 0, 'Corte clásico');
insert into appointment_services values ('s1', 'a1', 'corte', 25), ('s2', 'a2', 'corte', 25), ('s3', 'a3', 'corte', 25), ('s4', 'a4', 'corte', 25);
insert into pagina_idem (company_id, codigo, ref_id, creado_at) values
  ('barber', 'R-AAAA', 'a1', '2026-11-17 15:00-05'), ('barber', 'R-BBBB', 'a2', now()), ('barber', 'R-CCCC', 'a3', now()), ('barber', 'R-DDDD', 'a4', now());
`);
await ex(tablaComprobantes);
await ex(fn(s0011, 'v2_canchas_cfg'));
await ex(fn(s0018, 'v2_valida_operacion'));
await ex(s0021);
await ex(s0032);

const H = (n) => n.repeat(64).slice(0, 64);
const registrar = async (cod, datos) => (await uno(`select public.comprobante_srv_registrar('barber', $1, '999111222', $2::jsonb) as v`,
  [cod, JSON.stringify(datos)])).v;
const buscar = async (cod, tel = '999111222') => (await uno(`select public.comprobante_srv_buscar('barber', $1, $2) as v`, [cod, tel])).v;

// 1 · Buscar: cuándo se reservó y si es sospechoso
const b1 = await buscar('R-AAAA');
ok('buscar: reservada_ms = la hora de pagina_idem', Number(b1.reservada_ms) === Date.parse('2026-11-17T15:00:00-05:00'), JSON.stringify(b1));
ok('buscar: sin antecedentes, no sospechoso', b1.sospechoso === false && b1.validacion === 'automatica');

// 2 · Aprobado solo, con código de seguridad
let r = await registrar('R-AAAA', { decision: 'aprobar', hash: H('a'), monto: 12.5, metodo: 'yape', operacion: '111', url: 'https://x/1.jpg', codigo_seguridad: '5-1-8' });
ok('registrar aprobado: confirma la cita', r.status === 'ok' && r.resultado === 'confirmada', JSON.stringify(r));
let c = await uno(`select * from comprobantes_web where appointment_id = 'a1'`);
ok('registrar: guarda el código de seguridad (solo dígitos)', c.codigo_seguridad === '518' && c.revisado_por === 'automatico' && c.cotejo === '');

// 3 · Por cotejar → «Llegó»
let lista = (await uno(`select public.comprobantes_por_cotejar('barber') as v`)).v;
ok('por cotejar: sale el validado solo, con su código', lista.length === 1 && lista[0].codigo_seguridad === '518' && lista[0].cliente === 'Pedro Ruiz', JSON.stringify(lista));
r = (await uno(`select public.comprobante_cotejar('barber', $1, true) as v`, [lista[0].id])).v;
ok('llegó: queda cotejado y sale de la lista', (await uno(`select cotejo from comprobantes_web where id = $1`, [lista[0].id])).cotejo === 'llego'
  && (await uno(`select public.comprobantes_por_cotejar('barber') as v`)).v.length === 0);
let error = '';
try { await q(`select public.comprobante_cotejar('barber', $1, false)`, [lista[0].id]); } catch (e) { error = e.message; }
ok('cotejar dos veces: no deja', /ya se cotejó/.test(error), error);
ok('llegó: el pago sigue en la Caja', Number((await uno(`select count(*) as n from pending_payments where appointment_id = 'a1'`)).n) === 1);

// 4 · Otro validado solo → «No llegó»
r = await registrar('R-BBBB', { decision: 'aprobar', hash: H('b'), monto: 12.5, metodo: 'yape', operacion: '222', url: 'https://x/2.jpg', codigo_seguridad: '777' });
ok('segundo aprobado: confirmada', r.resultado === 'confirmada' && (await uno(`select status from appointments where id = 'a2'`)).status === 'confirmed');
const id2 = (await uno(`select id from comprobantes_web where appointment_id = 'a2'`)).id;
r = (await uno(`select public.comprobante_cotejar('barber', $1, false) as v`, [id2])).v;
ok('no llegó: cancela la cita sin adelanto', r.cancelada === true && (await uno(`select status from appointments where id = 'a2'`)).status === 'cancelled', JSON.stringify(r));
ok('no llegó: el pago sale de la Caja', Number((await uno(`select count(*) as n from pending_payments where appointment_id = 'a2'`)).n) === 0);
c = await uno(`select * from comprobantes_web where id = $1`, [id2]);
ok('no llegó: comprobante rechazado y marcado', c.estado === 'rechazado' && c.cotejo === 'no_llego');
ok('no llegó: mensaje para WhatsApp con nombre y operación', /Hola Pedro/.test(r.mensaje) && /222/.test(r.mensaje) && /cancelada/.test(r.mensaje) && r.wa_link.startsWith('https://wa.me/51999111222'), r.mensaje);

// 5 · El mismo celular queda sospechoso; otro cliente no
ok('sospechoso: el celular que falló', (await buscar('R-CCCC')).sospechoso === true);
ok('sospechoso: otro cliente, no', (await buscar('R-DDDD', '999333444')).sospechoso === false);

// 6 · Por revisar: el panel enseña el código
r = await registrar('R-CCCC', { decision: 'revisar', hash: H('c'), monto: 12.5, metodo: 'yape', operacion: '333', url: 'https://x/3.jpg', codigo_seguridad: '404', motivo: 'Este celular ya envió antes un comprobante que no llegó a tu app.' });
ok('revisar: ok', r.status === 'ok' && r.resultado === 'revisar');
const panel = (await uno(`select public.comprobantes_panel('barber') as v`)).v;
ok('panel: el por revisar lleva su código de seguridad', panel.length === 1 && panel[0].codigo_seguridad === '404', JSON.stringify(panel));
ok('revisar: avisa al momento', Number((await uno(`select count(*) as n from panel_push_events where datos->>'clase' = 'comprobante_por_revisar'`)).n) === 1);

// 7 · Recordatorio a los 15 min, una sola vez, con los correos de dueño y admin
await ex(`select public.avisos_comprobantes_esperando()`);
ok('recordatorio: a los 2 segundos, nada', Number((await uno(`select count(*) as n from panel_push_events where ref like 'comprobante_espera:%'`)).n) === 0);
await ex(`update comprobantes_web set creado_at = now() - interval '20 minutes' where estado = 'revisar'`);
await ex(`select public.avisos_comprobantes_esperando(); select public.avisos_comprobantes_esperando();`);
const ev = await uno(`select count(*) over () as n, datos from panel_push_events where ref like 'comprobante_espera:%'`);
ok('recordatorio: a los 20 min, uno solo', Number(ev?.n) === 1, JSON.stringify(ev));
ok('recordatorio: correo solo del dueño (no del barbero)', JSON.stringify(ev?.datos.correos) === '["dueno@x.pe"]' && ev?.datos.lead_id === 'l1' && Number(ev?.datos.minutos) >= 20);
await ex(`delete from panel_push_events; update comprobantes_web set creado_at = now() - interval '4 hours' where estado = 'revisar'`);
await ex(`select public.avisos_comprobantes_esperando()`);
ok('recordatorio: de hace 4 h ya no', Number((await uno(`select count(*) as n from panel_push_events`)).n) === 0);

// 8 · Permisos
const permiso = async (rol, f) => (await uno(`select has_function_privilege($1, $2, 'execute') as v`, [rol, f])).v;
ok('permisos: la página (anon) registra y busca', await permiso('anon', 'public.comprobante_srv_registrar(text, text, text, jsonb)') && await permiso('anon', 'public.comprobante_srv_buscar(text, text, text)'));
ok('permisos: anon NO coteja ni lista', !(await permiso('anon', 'public.comprobante_cotejar(text, uuid, boolean)')) && !(await permiso('anon', 'public.comprobantes_por_cotejar(text)')));
ok('permisos: el panel (authenticated) coteja', await permiso('authenticated', 'public.comprobante_cotejar(text, uuid, boolean)'));
ok('permisos: nadie llama al recordatorio desde fuera', !(await permiso('anon', 'public.avisos_comprobantes_esperando()')) && !(await permiso('authenticated', 'public.avisos_comprobantes_esperando()')));

// 9 · Correr la 0032 dos veces no rompe nada
await ex(s0032);
ok('idempotente: segunda pasada sin error', true);

console.log(fallos ? `\n${fallos} MAL` : '\nTodo ok');
process.exit(fallos ? 1 : 0);
