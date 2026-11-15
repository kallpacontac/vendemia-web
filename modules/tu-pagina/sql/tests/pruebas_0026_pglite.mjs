/**
 * Prueba de modules/tu-pagina/sql/0026_sin_cita_del_barbero.sql contra un Postgres de verdad (PGlite).
 * Reales: v2_lead, v2_franjas, v2_json, v2_telefono, v2_ocupa_hora, tu_pagina_sumar_min, v2_sede_cfg y
 * v2_sede_llena. Simulados (con ajustes t.*): quién llama (rol y ficha), la hora y v2_hueco.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0026_pglite.mjs . && node pruebas_0026_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const fn = (texto, nombre) => texto.match(new RegExp(`create or replace function public\\.${nombre}\\b[\\s\\S]*?\\$\\$;`))[0];
const s0004 = leer('modules/datos/sql/0004_agenda_en_nube.sql');
const s0025 = leer('modules/tu-pagina/sql/0025_aforo_por_sede.sql');
const s0026 = leer('modules/tu-pagina/sql/0026_sin_cita_del_barbero.sql').replace(/-- Comprobación:[\s\S]*$/, '');

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
create function public.mi_empleado(p text) returns text language sql as $$ select nullif(current_setting('t.ficha', true), '') $$;
create function public.v2_ahora() returns text language sql as $$ select current_setting('t.ahora', true) $$;
create function public.v2_es_cancha(p text, i text) returns boolean language sql as $$ select i = 'cancha' $$;
create function public.v2_hueco(p_company text, p_inicio text, p_minutos integer, p_empleado text, p_excepto text default '')
returns text language sql as $$ select case when current_setting('t.lleno', true) = 'si' then 'ese horario ya está lleno' end $$;

create table companies (id text primary key, slot_minutes integer);
create table tu_pagina (company_id text, secciones jsonb);
create table employees (id text primary key, company_id text, name text, is_active integer);
create table catalog (id text primary key, company_id text, name text, price numeric, duration_minutes integer, is_active integer,
  sort_order integer, tipo text default '', schedule_slots text default '');
create table leads (id text primary key, company_id text, phone text, name text, source text, created_at timestamptz default now());
create table appointments (id text primary key, company_id text, lead_id text, service text, slot_start text, slot_end text,
  slot_minutes integer, employee_id text default '', status text, sede text default '', created_at bigint default extract(epoch from now())::bigint);
create table appointment_services (id text primary key, appointment_id text, company_id text, catalog_item_id text, name text,
  price numeric, duration_minutes integer, sort_order integer);

insert into companies values ('b', 30), ('u', 30);
insert into tu_pagina values
  ('b', '{"citas":{"sedes":[{"nombre":"Huallaga 625","capacidad":2},{"nombre":"Huallaga 646 Premium","capacidad":2}]}}'),
  ('u', '{"citas":{}}');
insert into employees values ('e1', 'b', 'Jhon', 1), ('e2', 'b', 'Luis', 1), ('e0', 'b', 'Baja', 0), ('u1', 'u', 'Ana', 1);
insert into catalog (id, company_id, name, price, duration_minutes, is_active, sort_order, tipo, schedule_slots) values
  ('corte', 'b', 'Corte clásico', 15, 30, 1, 1, '', ''),
  ('degradado', 'b', 'Corte degradado', 20, 45, 1, 2, '', ''),
  ('cera', 'b', 'Cera', 12, 0, 1, 3, 'producto', ''),
  ('viejo', 'b', 'Corte niño', 10, 30, 0, 4, '', ''),
  ('grupo', 'b', 'Clase', 50, 60, 1, 5, '', '[{"id":"m","days":[1],"time":"10:00"}]'),
  ('cancha', 'b', 'Cancha', 90, 60, 1, 6, '', ''),
  ('ucorte', 'u', 'Corte', 15, 30, 1, 1, '', '');
`);
for (const n of ['v2_json', 'v2_franjas', 'v2_telefono', 'v2_ocupa_hora', 'v2_lead']) await ex(fn(s0004, n));
await ex(fn(leer('modules/tu-pagina/sql/0002_tienda_y_reservas.sql'), 'tu_pagina_sumar_min'));
await ex(fn(s0025, 'v2_sede_llena'));
await ex(fn(s0025, 'v2_sede_cfg'));
await ex(s0026);

const como = async (rol, ficha, ahora = '2026-11-14 15:00') => ex(`set t.rol = '${rol}'; set t.ficha = '${ficha}'; set t.ahora = '${ahora}'; set t.lleno = ''`);
const crear = async (datos, empresa = 'b') => {
  try { return (await uno(`select public.mi_agenda_sin_cita($1, $2::jsonb) as v`, [empresa, JSON.stringify(datos)])).v; }
  catch (e) { return { error: e.message }; }
};
const base = { catalog_item_id: 'corte', telefono: '987 654 321', nombre: 'Carlos', sede: 'Huallaga 625' };

// 1 · Datos del formulario
await como('empleado', 'e1');
const d = (await uno(`select public.mi_agenda_sin_cita_datos('b') as v`)).v;
ok('datos: solo servicios por hora y activos', JSON.stringify(d.servicios.map((x) => x.id)) === '["corte","degradado"]', JSON.stringify(d.servicios));
ok('datos: las dos sedes y la ficha', d.sedes.length === 2 && d.ficha === 'e1');

// 2 · Crear: ahora, a su nombre, precio del catálogo
let r = await crear(base);
ok('crea ahora, confirmada', r.status === 'ok' && r.slot_start === '2026-11-14 15:00' && r.minutos === 30, JSON.stringify(r));
let a = await uno(`select * from appointments where id = $1`, [r.id]);
ok('a nombre de su ficha y en su sede', a.employee_id === 'e1' && a.sede === 'Huallaga 625' && a.status === 'confirmed' && a.slot_end === '2026-11-14 15:30');
ok('precio del catálogo aunque mande otro', Number((await uno(`select price from appointment_services where appointment_id = $1`, [r.id])).price) === 15);
ok('cliente nuevo con 51 delante', (await uno(`select phone from leads where id = $1`, [a.lead_id])).phone === '51987654321' && r.cliente_nuevo === true);

// 3 · No puede cortar a dos
r = await crear({ ...base, telefono: '987000111', nombre: 'Otro', slot_start: '2026-11-14 15:15' });
ok('se cruza con su cita: no', /Ya tienes una cita/.test(r.error ?? ''), JSON.stringify(r));
r = await crear({ ...base, telefono: '987000111', nombre: 'Otro', slot_start: '2026-11-14 15:30' });
ok('justo al terminar: sí', r.status === 'ok', JSON.stringify(r));
await ex(`update appointments set status = 'no_show' where slot_start = '2026-11-14 15:30' and employee_id = 'e1'`);
r = await crear({ ...base, telefono: '987000222', nombre: 'Tercero', slot_start: '2026-11-14 15:30' });
ok('tras marcar «No vino», el hueco vale', r.status === 'ok', JSON.stringify(r));

// 4 · La hora
r = await crear({ ...base, slot_start: '2026-11-14 14:20' });
ok('hace 40 min: no', /media hora/.test(r.error ?? ''), JSON.stringify(r));
r = await crear({ ...base, telefono: '987000333', nombre: 'Cuatro', slot_start: '2026-11-14 14:30' });
ok('hace 30 min: sí', r.status === 'ok', JSON.stringify(r));
r = await crear({ ...base, slot_start: '2026-11-15 10:00' });
ok('mañana: no', /Solo se anota a quien llega hoy/.test(r.error ?? ''), JSON.stringify(r));
r = await crear({ ...base, slot_start: '15h' });
ok('hora rara: no', /no es válida/.test(r.error ?? ''));

// 5 · Servicio y sede
r = await crear({ ...base, catalog_item_id: 'cera', slot_start: '2026-11-14 17:00' });
ok('producto: no', /no se agenda por hora/.test(r.error ?? ''), JSON.stringify(r));
r = await crear({ ...base, catalog_item_id: 'viejo', slot_start: '2026-11-14 17:00' });
ok('apagado: no', /Elige el servicio/.test(r.error ?? ''));
r = await crear({ ...base, catalog_item_id: 'cancha', slot_start: '2026-11-14 17:00' });
ok('cancha: no', /no se agenda por hora/.test(r.error ?? ''));
r = await crear({ ...base, sede: '', slot_start: '2026-11-14 17:00' });
ok('con 2 sedes, sin sede: no', /Elige en qué sede/.test(r.error ?? ''));
r = await crear({ ...base, sede: 'Otra', slot_start: '2026-11-14 17:00' });
ok('sede inventada: no', /Elige en qué sede/.test(r.error ?? ''));

// 6 · Aforo de la sede: avisa, no bloquea (capacidad 2)
await como('empleado', 'e2');
r = await crear({ ...base, telefono: '987000444', nombre: 'Cinco', slot_start: '2026-11-14 18:00' });
ok('sede con sitio: sin aviso', r.status === 'ok' && r.aviso === null, JSON.stringify(r));
await ex(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, sede)
          values ('w1', 'b', 'x', 'Corte', '2026-11-14 18:00', '2026-11-14 18:30', 30, '', 'confirmed', 'Huallaga 625')`);
await como('empleado', 'e1');
r = await crear({ ...base, telefono: '987000555', nombre: 'Seis', slot_start: '2026-11-14 18:00' });
ok('sede llena: crea y avisa', r.status === 'ok' && /sillas ocupadas/.test(r.aviso ?? ''), JSON.stringify(r));
r = await crear({ ...base, telefono: '987000666', nombre: 'Siete', sede: 'Huallaga 646 Premium', slot_start: '2026-11-14 19:00' });
ok('la otra sede no cuenta las de esta', r.status === 'ok' && r.aviso === null, JSON.stringify(r));

// 7 · Quién puede
await como('empleado', '');
r = await crear({ ...base, slot_start: '2026-11-14 20:00' });
ok('sin ficha enlazada: no', /ficha enlazada/.test(r.error ?? ''), JSON.stringify(r));
await como('empleado', 'e0');
r = await crear({ ...base, slot_start: '2026-11-14 20:00' });
ok('ficha de baja: no', /dada de baja/.test(r.error ?? ''));
await como('', '');
r = await crear({ ...base, slot_start: '2026-11-14 20:00' });
ok('de fuera del negocio: no', /No tienes acceso/.test(r.error ?? ''));
await como('dueno', 'e2');
r = await crear({ ...base, telefono: '987000777', nombre: 'Ocho', slot_start: '2026-11-14 20:00' });
ok('el dueño que también corta: a su ficha', r.status === 'ok' && (await uno(`select employee_id from appointments where id = $1`, [r.id])).employee_id === 'e2');
r = await crear({ catalog_item_id: 'corte', telefono: '987000888', nombre: 'Nueve', sede: 'Huallaga 625' }, 'u');
ok('con la ficha de otro negocio: no', /dada de baja/.test(r.error ?? ''), JSON.stringify(r));

// 8 · Un solo local (sin sedes): avisa con el aforo general
await como('empleado', 'u1');
await ex(`set t.lleno = 'si'`);
r = await crear({ catalog_item_id: 'ucorte', telefono: '987000999', nombre: 'Diez' }, 'u');
ok('sin sedes: crea y avisa con v2_hueco', r.status === 'ok' && r.sede === '' && /lleno/.test(r.aviso ?? ''), JSON.stringify(r));

// 9 · Cliente que ya existía: no duplica
await como('empleado', 'e2');
const antes = Number((await uno(`select count(*) as n from leads`)).n);
r = await crear({ ...base, nombre: '', slot_start: '2026-11-14 20:30' });
ok('mismo celular: reutiliza el cliente', r.status === 'ok' && r.cliente_nuevo === false && Number((await uno(`select count(*) as n from leads`)).n) === antes, JSON.stringify(r));

console.log(fallos ? `\n${fallos} MAL` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
