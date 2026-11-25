/**
 * Prueba de modules/tu-pagina/sql/0038_descuento_web.sql (PGlite, tablas simuladas).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0038_pglite.mjs . && node pruebas_0038_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/modules/tu-pagina/sql/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '').replace(/-- Comprobación[\s\S]*$/, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
await db.exec(`create role anon; create role authenticated; create schema auth;
create table public.tu_pagina (company_id text, slug text, publicada boolean, secciones jsonb);
insert into public.tu_pagina values ('c1', 'the247', true, '{"descuentoWeb": {"activo": true, "pct": 20}}'),
  ('c2', 'sin', true, '{"descuentoWeb": {"activo": false, "pct": 20}}');
create table public.leads (id text, company_id text, phone text);
insert into public.leads values ('l1', 'c1', '51911111111'), ('l2', 'c1', '51922222222');
create table public.appointments (id text primary key, company_id text, lead_id text, status text, slot_end text, created_at numeric);
create table public.appointment_services (appointment_id text, price numeric);
create table public.pagina_idem (company_id text, codigo text, ref_id text);
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create function public.rol_en(p text) returns text language sql as $$ select null::text $$;
create function public.v2_telefono(p text) returns text language sql immutable as $$
  select case when length(regexp_replace(coalesce(p, ''), '\\D', '', 'g')) = 9 then '51' || regexp_replace(p, '\\D', '', 'g') else regexp_replace(coalesce(p, ''), '\\D', '', 'g') end $$;
create function public.v2_ocupa_hora(s text, c numeric) returns boolean language sql as $$
  select s <> 'pending_payment' or c > extract(epoch from now() - interval '1 day') $$;`);
await db.exec(leer('0038_descuento_web.sql'));
await db.exec(leer('0038_descuento_web.sql'));

const cita = async (id, lead, codigo, precio, status = 'confirmed', creada = 'now()') => {
  await db.exec(`insert into public.appointments values ('${id}', 'c1', '${lead}', '${status}', '2026-11-26 10:30', extract(epoch from ${creada}));
    insert into public.appointment_services values ('${id}', ${precio});
    insert into public.pagina_idem values ('c1', '${codigo}', '${id}');`);
};
const aplicar = async (codigo, tel, slug = 'the247') =>
  (await db.query(`select public.cita_srv_descuento_web($1, $2, $3) r`, [slug, codigo, tel])).rows[0].r;
const precio = async (id) => Number((await db.query(`select sum(price) p from public.appointment_services where appointment_id = $1`, [id])).rows[0].p);

await cita('a1', 'l1', 'R1', 35);
let r = await aplicar('r1', '911 111 111');
ok('primera reserva por la web: 20 %', r.status === 'ok' && r.pct === 20 && Number(r.precio) === 28 && Number(r.precio_antes) === 35, JSON.stringify(r));
ok('el precio queda rebajado en la cita', (await precio('a1')) === 28);
r = await aplicar('R1', '911111111');
ok('repetir la misma llamada no rebaja dos veces', r.status === 'ok' && r.repetido === true && (await precio('a1')) === 28);

await cita('a2', 'l1', 'R2', 35);
r = await aplicar('R2', '911111111');
ok('segunda reserva del mismo celular: ya usado', r.status === 'usado' && (await precio('a2')) === 35, JSON.stringify(r));

await db.exec(`update public.appointments set status = 'cancelled' where id = 'a1'`);
await cita('a3', 'l1', 'R3', 40);
r = await aplicar('R3', '911111111');
ok('si la cita del descuento se canceló, vuelve a valer', r.status === 'ok' && (await precio('a3')) === 32, JSON.stringify(r));

await cita('a4', 'l2', 'R4', 33.3, 'pending_payment');
r = await aplicar('R4', '922222222');
ok('apartada también recibe el descuento (redondeo a céntimos)', r.status === 'ok' && (await precio('a4')) === 26.64, JSON.stringify(r));
await db.exec(`update public.appointments set created_at = extract(epoch from now() - interval '2 days') where id = 'a4'`);
await cita('a5', 'l2', 'R5', 50);
r = await aplicar('R5', '922222222');
ok('apartada que venció sin pagar: el descuento vuelve', r.status === 'ok' && (await precio('a5')) === 40, JSON.stringify(r));

r = await aplicar('R5', '933333333');
ok('otro celular con el código de otro: nada', r.status === 'not_found');
await db.exec(`insert into public.tu_pagina values ('c1x', 'sin2', true, '{}')`);
r = await aplicar('R5', '922222222', 'sin');
ok('página con el descuento apagado: sin_descuento', r.status === 'sin_descuento');
await db.exec(`update public.tu_pagina set secciones = '{"descuentoWeb": {"activo": true, "pct": 95}}' where slug = 'the247'`);
r = await aplicar('R5', '922222222');
ok('% fuera de rango (95): sin_descuento', r.status === 'sin_descuento');

await db.exec(leer('0038_descuento_web_deshacer.sql'));
ok('deshacer borra la tabla', (await db.query(`select to_regclass('public.descuentos_web') t`)).rows[0].t === null);

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
