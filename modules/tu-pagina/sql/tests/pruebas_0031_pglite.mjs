/**
 * Prueba de modules/tu-pagina/sql/0031_cobrar_ticket_en_caja.sql contra un Postgres de verdad (PGlite).
 * Reales: v2_lead, v2_franjas, v2_json, v2_telefono, v2_sede_cfg y el congelado de comisiones (datos 0011).
 * Simulados (con ajustes t.*): quién llama (rol), la hora y si algo es cancha.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0031_pglite.mjs . && node pruebas_0031_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const fn = (texto, nombre) => texto.match(new RegExp(`create or replace function public\\.${nombre}\\b[\\s\\S]*?\\$\\$;`))[0];
const s0004 = leer('modules/datos/sql/0004_agenda_en_nube.sql');
const s0011 = leer('modules/datos/sql/0011_venta_congelada.sql');
const s0025 = leer('modules/tu-pagina/sql/0025_aforo_por_sede.sql');
const s0031 = leer('modules/tu-pagina/sql/0031_cobrar_ticket_en_caja.sql').replace(/-- Comprobación:[\s\S]*$/, '');

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
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso a este negocio.'; end if;
  if current_setting('t.rol', true) = 'empleado' and not p_empleado_vale then raise exception 'Eso lo hace el dueño o el administrador del negocio.'; end if;
  return current_setting('t.rol', true);
end $$;
create function public.v2_ahora() returns text language sql as $$ select current_setting('t.ahora', true) $$;
create function public.rol_en(p text) returns text language sql as $$ select 'dueno' $$;
create function public.v2_es_cancha(p text, i text) returns boolean language sql as $$ select i = 'cancha' $$;

create table companies (id text primary key, slot_minutes integer);
create table tu_pagina (company_id text, secciones jsonb);
create table employees (id text primary key, company_id text, name text, is_active integer, comision_pct numeric);
create table catalog (id text primary key, company_id text, name text, price numeric, duration_minutes integer, is_active integer,
  sort_order integer, tipo text default '', schedule_slots text default '', stock integer, comision_pct numeric, comision_monto numeric);
create table catalogo_costos (catalog_id text, company_id text, costo numeric);
create table leads (id text primary key, company_id text, phone text, name text, source text, created_at timestamptz default clock_timestamp());
create table appointments (id text primary key, company_id text, lead_id text, service text, slot_start text, slot_end text,
  slot_minutes integer, employee_id text default '', status text, sede text default '', beneficiario text default '',
  cumplido_por text default '', created_at bigint default extract(epoch from now())::bigint);
create table appointment_services (id text primary key, appointment_id text, company_id text, catalog_item_id text, name text,
  price numeric, duration_minutes integer, sort_order integer);
create table orders (id text primary key, company_id text, items text);

insert into companies values ('b', 30), ('u', 30);
insert into tu_pagina values
  ('b', '{"citas":{"sedes":[{"nombre":"Huallaga 625","capacidad":1},{"nombre":"Huallaga 646 Premium","capacidad":1}]}}'),
  ('u', '{"citas":{}}');
insert into employees values ('e1', 'b', 'Jhon', 1, 40), ('e0', 'b', 'Baja', 0, 40), ('u1', 'u', 'Ana', 1, 50);
insert into catalog (id, company_id, name, price, duration_minutes, is_active, sort_order, tipo, schedule_slots, stock, comision_pct, comision_monto) values
  ('corte', 'b', 'Corte clásico', 15, 30, 1, 1, '', '', null, null, null),
  ('barba', 'b', 'Barba', 10, 20, 1, 2, '', '', null, null, 4),
  ('cera', 'b', 'Cera', 12, 0, 1, 3, 'producto', '', 2, null, null),
  ('viejo', 'b', 'Corte niño', 10, 30, 0, 4, '', '', null, null, null),
  ('grupo', 'b', 'Clase', 50, 60, 1, 5, '', '[{"id":"m","days":[1],"time":"10:00"}]', null, null, null),
  ('cancha', 'b', 'Cancha', 90, 60, 1, 6, '', '', null, null, null),
  ('ucorte', 'u', 'Corte', 15, 30, 1, 1, '', '', null, null, null);
`);
for (const n of ['v2_json', 'v2_franjas', 'v2_telefono', 'v2_lead']) await ex(fn(s0004, n));
await ex(fn(s0025, 'v2_sede_cfg'));
// El congelado de la 0011, de verdad: tablas, funciones y triggers.
await ex(s0011.replace(/-- ── 4 ·[\s\S]*$/, '').replace(/^\s*begin;\s*$/m, '').replace(/^\s*commit;\s*$/m, ''));
await ex(s0031);

const como = async (rol, ahora = '2026-11-17 15:00') => ex(`set t.rol = '${rol}'; set t.ahora = '${ahora}'`);
const ticket = async (datos, empresa = 'b') => {
  try { return (await uno(`select public.caja_ticket($1, $2::jsonb) as v`, [empresa, JSON.stringify(datos)])).v; }
  catch (e) { return { error: e.message }; }
};
const base = { items: ['corte'], employee_id: 'e1', sede: 'Huallaga 625' };

// 1 · Quién
await como('empleado');
let r = await ticket(base);
ok('el barbero no cobra tickets', /dueño o el administrador/.test(r.error ?? ''), JSON.stringify(r));
await como('');
r = await ticket(base);
ok('sin acceso: no', /No tienes acceso/.test(r.error ?? ''));

// 2 · Lo básico: atendido, a nombre del barbero, precio del catálogo, comisión congelada
await como('admin');
r = await ticket(base);
ok('crea el ticket', r.status === 'ok' && Number(r.total) === 15 && r.barbero === 'Jhon' && r.sin_telefono === true, JSON.stringify(r));
let a = await uno(`select * from appointments where id = $1`, [r.id]);
ok('ya atendido (completed) y por el panel', a.status === 'completed' && a.cumplido_por === 'panel');
ok('ocupó la silla hasta ahora', a.slot_start === '2026-11-17 14:30' && a.slot_end === '2026-11-17 15:00' && a.slot_minutes === 30, `${a.slot_start}→${a.slot_end}`);
ok('del barbero y su sede', a.employee_id === 'e1' && a.sede === 'Huallaga 625');
let cc = await uno(`select regla, valor from comisiones_congeladas where appointment_id = $1`, [r.id]);
ok('comisión congelada con el % del barbero', cc?.regla === 'profesional' && Number(cc.valor) === 40, JSON.stringify(cc));
ok('cliente de mostrador (sin celular)', (await uno(`select phone from leads where id = $1`, [a.lead_id])).phone === '');

// 3 · Varias cosas: servicios + producto; stock
r = await ticket({ ...base, items: ['corte', 'barba', 'cera'], nombre: 'Pedro' });
a = await uno(`select * from appointments where id = $1`, [r.id]);
ok('total de todo lo del ticket', Number(r.total) === 37 && a.service === 'Corte clásico + Barba + Cera', `${r.total} ${a.service}`);
ok('la duración solo cuenta servicios', a.slot_minutes === 50 && a.slot_start === '2026-11-17 14:10', `${a.slot_minutes}`);
ok('sin celular, el nombre va en la cita', a.beneficiario === 'Pedro');
ok('la cera baja de stock', (await uno(`select stock from catalog where id = 'cera'`)).stock === 1);
const nLineas = (await uno(`select count(*)::int n from comisiones_congeladas where appointment_id = $1`, [r.id])).n;
ok('las tres líneas congeladas', nLineas === 3, String(nLineas));
const fija = await uno(`select regla, valor from comisiones_congeladas c join appointment_services s on s.id = c.linea_id where s.appointment_id = $1 and s.catalog_item_id = 'barba'`, [r.id]);
ok('la barba con su comisión fija del servicio', fija?.regla === 'fija' && Number(fija.valor) === 4, JSON.stringify(fija));
r = await ticket({ ...base, items: ['cera', 'cera'] });
ok('sin stock suficiente: no, y no se crea nada', /solo quedan 1/.test(r.error ?? ''), JSON.stringify(r));
ok('el stock sigue igual', (await uno(`select stock from catalog where id = 'cera'`)).stock === 1);

// 4 · Cliente con celular
r = await ticket({ ...base, telefono: '987 654 321', nombre: 'Carlos' });
a = await uno(`select * from appointments where id = $1`, [r.id]);
ok('con celular: su ficha', r.cliente_nuevo === true && r.sin_telefono === false && (await uno(`select phone, name from leads where id = $1`, [a.lead_id])).phone === '51987654321', JSON.stringify(r));
r = await ticket({ ...base, telefono: '987654321' });
ok('el mismo celular otra vez: la misma ficha', r.lead_id === a.lead_id && r.cliente_nuevo === false, JSON.stringify(r));
r = await ticket({ ...base, telefono: '98765' });
ok('celular a medias: no', /no está completo/.test(r.error ?? ''));

// 5 · Lo que no vale
r = await ticket({ ...base, items: [] });
ok('sin nada: no', /Elige lo que se hizo/.test(r.error ?? ''));
r = await ticket({ ...base, items: ['viejo'] });
ok('apagado: no', /ya no está en el catálogo/.test(r.error ?? ''));
r = await ticket({ ...base, items: ['ucorte'] });
ok('de otro negocio: no', /ya no está en el catálogo/.test(r.error ?? ''));
r = await ticket({ ...base, items: ['grupo'] });
ok('grupo: no', /no se cobra como ticket/.test(r.error ?? ''));
r = await ticket({ ...base, items: ['cancha'] });
ok('cancha: no', /no se cobra como ticket/.test(r.error ?? ''));
r = await ticket({ ...base, employee_id: 'e0' });
ok('barbero de baja: no', /dado de baja/.test(r.error ?? ''));
r = await ticket({ ...base, employee_id: 'u1' });
ok('barbero de otro negocio: no', /no es de este negocio/.test(r.error ?? ''));
r = await ticket({ ...base, sede: '' });
ok('con 2 sedes, sin sede: no', /Elige la sede/.test(r.error ?? ''));
r = await ticket({ ...base, sede: 'Otra' });
ok('sede inventada: no', /Elige la sede/.test(r.error ?? ''));

// 6 · Sin aforo: aunque la sede (1 silla) esté llena, el ticket entra
const antes = (await uno(`select count(*)::int n from appointments where sede = 'Huallaga 625'`)).n;
r = await ticket(base);
ok('la sede llena no frena un ticket ya atendido', r.status === 'ok' && antes >= 3);

// 7 · Sin barbero (el dueño cobra sin saber quién): vale, sin comisión
r = await ticket({ items: ['corte'], sede: 'Huallaga 646 Premium' });
a = await uno(`select * from appointments where id = $1`, [r.id]);
ok('sin barbero: vale, sin asignar', r.status === 'ok' && a.employee_id === '');

// 8 · Un negocio de una sede: no la pide
await como('dueno');
r = await ticket({ items: ['ucorte'], employee_id: 'u1' }, 'u');
ok('una sede: no la pide', r.status === 'ok', JSON.stringify(r));

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
