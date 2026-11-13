/**
 * Prueba de modules/datos/sql/0011_venta_congelada.sql contra un Postgres de verdad (PGlite),
 * con las tablas del bot reducidas a las columnas que usa y rol_en simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0011_pglite.mjs . && node pruebas_0011_pglite.mjs <repo>/modules/datos/sql/0011_venta_congelada.sql
 *
 * No es dependencia del proyecto a propósito: solo hace falta para tocar la SQL.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const sql = readFileSync(process.argv[2], 'utf8').replace(/notify pgrst[^;]*;/, '');
const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c) => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n); };
const uno = async (s, p) => (await q(s, p)).rows[0];

await ex(`
create role anon; create role authenticated;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create table companies (id text primary key);
create table catalog (id text primary key, company_id text, name text, comision_pct numeric, comision_monto numeric);
create table employees (id text primary key, company_id text, comision_pct numeric);
create table appointments (id text primary key, company_id text, status text, employee_id text);
create table appointment_services (id text primary key, appointment_id text, catalog_item_id text, name text, price numeric);
create table orders (id text primary key, company_id text, items text);
create table catalogo_costos (catalog_id text primary key, company_id text, costo numeric(12,2));
insert into companies values ('c1'), ('c2');
insert into catalog values ('corte', 'c1', 'Corte', null, null), ('barba', 'c1', 'Barba', 10, null),
                           ('tinte', 'c1', 'Tinte', null, 15), ('cera', 'c1', 'Cera', null, null),
                           ('regalo', 'c1', 'Regalo', 0, null);
insert into employees values ('juan', 'c1', 40), ('ana', 'c1', 50), ('nuevo', 'c1', 0);
insert into catalogo_costos values ('cera', 'c1', 8);
-- Ya completada ANTES de la migración: se congela al aplicarla.
insert into appointments values ('vieja', 'c1', 'completed', 'juan');
insert into appointment_services values ('v1', 'vieja', 'corte', 'Corte', 30);
insert into orders values ('p0', 'c1', '[{"name":"Cera","price":20,"quantity":2,"catalog_item_id":"cera"}]');
`);
await ex(sql);
await ex(sql); // idempotente

let r = await uno(`select regla, valor from comisiones_congeladas where linea_id = 'v1'`);
ok('lo ya completado se congela al aplicar (40 % de Juan)', r?.regla === 'profesional' && Number(r.valor) === 40);
r = await uno(`select costo from pedido_costos where order_id = 'p0' and catalog_id = 'cera'`);
ok('pedido ya hecho: costo de hoy', Number(r?.costo) === 8);

// Cita nueva: confirmada no congela; completada sí, con las cuatro reglas.
await ex(`insert into appointments values ('a1', 'c1', 'confirmed', 'juan');
          insert into appointment_services values ('l1', 'a1', 'corte', 'Corte', 30), ('l2', 'a1', 'barba', 'Barba', 20),
                                                  ('l3', 'a1', 'tinte', 'Tinte', 80), ('l4', 'a1', 'regalo', 'Regalo', 5),
                                                  ('l5', 'a1', 'cera', 'Cera', 20);`);
r = await uno(`select count(*)::int n from comisiones_congeladas where appointment_id = 'a1'`);
ok('confirmada: nada congelado', r.n === 0);
await ex(`update appointments set status = 'completed' where id = 'a1'`);
const reglas = Object.fromEntries((await q(`select linea_id, regla, valor from comisiones_congeladas where appointment_id = 'a1'`)).rows.map((x) => [x.linea_id, `${x.regla}:${x.valor === null ? '' : Number(x.valor)}`]));
ok('% del profesional', reglas.l1 === 'profesional:40');
ok('% del servicio', reglas.l2 === 'servicio:10');
ok('monto fijo gana', reglas.l3 === 'fija:15');
ok('0 explícito = servicio:0, no el del profesional', reglas.l4 === 'servicio:0');
r = await uno(`select costo from costos_congelados where linea_id = 'l5'`);
ok('costo de la cera congelado', Number(r?.costo) === 8);

// Lo importante: cambiar tarifas y costos después NO mueve lo congelado.
await ex(`update employees set comision_pct = 60 where id = 'juan';
          update catalog set comision_pct = 25 where id = 'barba';
          update catalogo_costos set costo = 12 where catalog_id = 'cera';
          update appointments set status = 'completed' where id = 'a1';`);
const despues = Object.fromEntries((await q(`select linea_id, valor from comisiones_congeladas where appointment_id = 'a1'`)).rows.map((x) => [x.linea_id, x.valor === null ? null : Number(x.valor)]));
ok('subir el % de Juan no cambia la cita ya hecha', despues.l1 === 40);
ok('subir el % de la barba no cambia la cita ya hecha', despues.l2 === 10);
r = await uno(`select costo from costos_congelados where linea_id = 'l5'`);
ok('subir el costo no cambia la venta ya hecha', Number(r.costo) === 8);
r = await uno(`select valor from comisiones_congeladas where linea_id = 'v1'`);
ok('la de antes de la migración tampoco se mueve', Number(r.valor) === 40);

// Un consumo añadido a una cita ya completada se congela al entrar, con la tarifa de ese momento.
await ex(`insert into appointment_services values ('l6', 'a1', 'corte', 'Corte extra', 30)`);
r = await uno(`select regla, valor from comisiones_congeladas where linea_id = 'l6'`);
ok('línea nueva en cita completada: tarifa del momento (60)', r?.regla === 'profesional' && Number(r.valor) === 60);

// Cambiar de profesional una cita completada: se le paga al nuevo, con su tarifa.
await ex(`update appointments set employee_id = 'ana' where id = 'a1'`);
r = await uno(`select employee_id, valor from comisiones_congeladas where linea_id = 'l1'`);
ok('reasignada: congela con la de Ana (50)', r.employee_id === 'ana' && Number(r.valor) === 50);
r = await uno(`select valor from comisiones_congeladas where linea_id = 'l2'`);
ok('reasignada: la del servicio vuelve a leerse (25)', Number(r.valor) === 25);

// Profesional sin %, servicio sin tarifa: «sin».
await ex(`insert into appointments values ('a2', 'c1', 'confirmed', 'nuevo');
          insert into appointment_services values ('m1', 'a2', 'corte', 'Corte', 30);
          update appointments set status = 'completed' where id = 'a2';`);
r = await uno(`select regla, valor from comisiones_congeladas where linea_id = 'm1'`);
ok('sin tarifa', r.regla === 'sin' && r.valor === null);

// Cancelada o no vino: nada.
await ex(`insert into appointments values ('a3', 'c1', 'no_show', 'juan');
          insert into appointment_services values ('n1', 'a3', 'corte', 'Corte', 30);`);
r = await uno(`select count(*)::int n from comisiones_congeladas where appointment_id = 'a3'`);
ok('no vino: no congela', r.n === 0);

// Pedidos: costo al crearse; cambiar el costo luego no lo mueve; JSON roto no tumba la venta.
await ex(`insert into orders values ('p1', 'c1', '[{"name":"Cera","price":20,"quantity":1,"catalog_item_id":"cera"},{"name":"Corte","price":30,"quantity":1,"catalog_item_id":"corte"}]');
          update catalogo_costos set costo = 15 where catalog_id = 'cera';
          update orders set items = items where id = 'p1';`);
r = await uno(`select costo from pedido_costos where order_id = 'p1' and catalog_id = 'cera'`);
ok('pedido: costo del momento (12), no el nuevo (15)', Number(r.costo) === 12);
r = await uno(`select count(*)::int n from pedido_costos where order_id = 'p1'`);
ok('sin costo puesto, no se inventa fila', r.n === 1);
await ex(`insert into orders values ('p2', 'c1', 'esto no es json')`);
r = await uno(`select count(*)::int n from orders where id = 'p2'`);
ok('JSON roto: el pedido se guarda igual', r.n === 1);

// Nadie de fuera escribe en las tablas congeladas.
await ex(`grant select on appointments to authenticated; set role authenticated; select set_config('t.rol', 'dueno', false);`);
try { await ex(`insert into comisiones_congeladas values ('x', 'a1', 'c1', 'juan', 'fija', 1)`); ok('authenticated no escribe', false); }
catch { ok('authenticated no escribe', true); }
r = await uno(`select count(*)::int n from costos_congelados`);
ok('el dueño lee los costos', r.n > 0);
await ex(`select set_config('t.rol', 'admin', false)`);
r = await uno(`select count(*)::int n from costos_congelados`);
ok('el admin no ve costos', r.n === 0);
r = await uno(`select count(*)::int n from pedido_costos`);
ok('el admin no ve costos de pedidos', r.n === 0);
await ex(`reset role`);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
