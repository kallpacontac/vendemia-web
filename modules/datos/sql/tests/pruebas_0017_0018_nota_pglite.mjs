/**
 * Prueba de facturacion/sql/0004 (nota de venta), datos/sql/0017 (cumpleaños) y 0018 (ficha del empleado), en PGlite.
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0017_0018_nota_pglite.mjs . && node pruebas_0017_0018_nota_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.v2_autorizar_agenda(p text, v boolean default false) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso'; end if; return 'x'; end $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create table companies (id text primary key, name text);
insert into companies values ('c1', 'The 24/7 Barber Shop');
create table tu_pagina (company_id text primary key, secciones jsonb);
insert into tu_pagina values ('c1', '{"proveedor":{"ruc":"20131312955","razon_social":"INVERSIONES SAC","direccion":"Jr Huallaga 625"}}');
create table factura_ajustes (company_id text primary key, nombre_comercial text, razon_social text, ruc text, direccion text, ticket_ancho int);
create table leads (id text primary key, company_id text, phone text, name text);
insert into leads values ('l1', 'c1', '51987654321', 'Carlos'), ('l2', 'c2', '51987654321', 'Otro negocio');
create table employees (id text, company_id text, name text);
insert into employees values ('e1', 'c1', 'Brandy'), ('x1', 'c2', 'Ajeno');
create table loyalty_members (id uuid primary key default gen_random_uuid(), company_id text, unique (company_id, id));
create table loyalty_contacts (id uuid primary key default gen_random_uuid(), company_id text, member_id uuid, kind text, value text);
create table loyalty_birthdays (member_id uuid primary key, company_id text, mes_dia text, set_by text, updated_at timestamptz default now());
insert into loyalty_members (id, company_id) values ('00000000-0000-0000-0000-000000000001', 'c1');
insert into loyalty_contacts (company_id, member_id, kind, value) values ('c1', '00000000-0000-0000-0000-000000000001', 'phone', '+51 987 654 321');`);
for (const f of ['modules/facturacion/sql/0004_nota_de_venta.sql', 'modules/datos/sql/0017_cumple_del_cliente.sql', 'modules/datos/sql/0018_ficha_del_empleado.sql']) {
  await db.exec(leer(f)); await db.exec(leer(f));
}
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);

// ── Nota de venta ──
await rol('empleado');
const lineas = JSON.stringify({ ref_tipo: 'cita', ref_id: 'a1', cliente: 'Carlos', telefono: '987654321', atendio: 'Brandy',
  lineas: [{ descripcion: 'Corte degradado', cantidad: 1, precio: 20 }, { descripcion: 'Inca Kola', cantidad: 2, precio: 3 }] });
let r = await db.query(`select nota_emitir('c1', $1::jsonb) v`, [lineas]);
const n1 = r.rows[0].v;
ok('nota 1 numerada, total 26', n1.numero === 1 && Number(n1.total) === 26, JSON.stringify({ n: n1.numero, t: n1.total }));
ok('datos del negocio desde Mi página', n1.negocio.nombre === 'The 24/7 Barber Shop' && n1.negocio.ruc === '20131312955' && n1.negocio.ticket_ancho === 80);
r = await db.query(`select nota_emitir('c1', $1::jsonb) v`, [lineas]);
ok('mismo cobro = misma nota', r.rows[0].v.id === n1.id && r.rows[0].v.numero === 1);
r = await db.query(`select nota_emitir('c1', $1::jsonb) v`, [lineas.replace('"a1"', '"a2"')]);
ok('siguiente cobro = NV 2', r.rows[0].v.numero === 2);
ok('vacía no', /nada cobrado/.test(await err(() => db.query(`select nota_emitir('c1', '{"lineas":[]}'::jsonb)`))));
await rol('');
r = await db.query(`select nota_publica($1) v`, [n1.id]);
ok('pública sin sesión', r.rows[0].v?.numero === 1 && r.rows[0].v.lineas.length === 2);
ok('sin acceso no emite', /No tienes acceso/.test(await err(() => db.query(`select nota_emitir('c1', $1::jsonb)`, [lineas]))));

// ── Cumpleaños ──
await rol('empleado');
r = await db.query(`select cliente_cumple_guardar('c1', '987 654 321', '11-18') n`);
ok('cumple al cliente de ese celular (solo este negocio)', r.rows[0].n === 1);
r = await db.query(`select id, cumple from leads order by id`);
ok('l1 = 11-18, l2 intacto', r.rows[0].cumple === '11-18' && r.rows[1].cumple === null);
r = await db.query(`select mes_dia from loyalty_birthdays`);
ok('y a su tarjeta del Club', r.rows[0]?.mes_dia === '11-18');
ok('fecha mala', /no es válido/.test(await err(() => db.query(`select cliente_cumple_guardar('c1', '987654321', '13-40')`))));

// ── Ficha del empleado ──
await rol('admin');
await db.query(`select empleado_ficha_guardar('c1', 'e1', '{"telefono":"975 052 865","dni":"12345678","sedes":["Huallaga 625","Huallaga 625",""]}'::jsonb)`);
r = await db.query(`select empleado_fichas_leer('c1') v`);
ok('admin guarda y lee', r.rows[0].v.e1.telefono === '975052865' && r.rows[0].v.e1.dni === '12345678' && r.rows[0].v.e1.sedes.length === 1, JSON.stringify(r.rows[0].v));
ok('teléfono corto', /9 dígitos/.test(await err(() => db.query(`select empleado_ficha_guardar('c1', 'e1', '{"telefono":"123"}'::jsonb)`))));
ok('de otro negocio', /no es de este negocio/.test(await err(() => db.query(`select empleado_ficha_guardar('c1', 'x1', '{}'::jsonb)`))));
await rol('empleado');
r = await db.query(`select empleado_fichas_leer('c1') v`);
ok('el barbero no ve DNI ni teléfonos', JSON.stringify(r.rows[0].v) === '{}');
ok('el barbero no cambia', /dueño o el administrador/.test(await err(() => db.query(`select empleado_ficha_guardar('c1', 'e1', '{}'::jsonb)`))));
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
