/**
 * Prueba de modules/datos/sql/0025_sin_conexion.sql (PGlite). Las funciones de siempre
 * (caja_ticket, agenda_marcar_pagado, agenda_gasto_guardar, caja_ingreso_guardar) van simuladas:
 * lo que se prueba es la envoltura — quién, una sola vez, a su hora, y ticket + cobro juntos.
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0025_pglite.mjs . && node pruebas_0025_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/datos/sql/0025_sin_conexion.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$
  select case when p = 'c1' then nullif(current_setting('t.rol', true), '') end $$;
create table appointments (id text primary key, company_id text, slot_start text, slot_end text, slot_minutes int,
  status text, pagado_por text default '', metodo_pago text default '');
create table gastos (id text primary key, company_id text, fecha text, importe numeric);
create table caja_ingresos (id serial primary key, company_id text, dia date, importe numeric);
create sequence cita_n;
-- Como la de verdad: termina AHORA (aquí, fijo a las 10:00 del 19-nov) y dura lo que el catálogo.
create function public.caja_ticket(p_company text, p_datos jsonb) returns jsonb language plpgsql as $$
declare v_id text := 'cita-' || nextval('cita_n');
begin
  if p_datos ? 'metodo_pago' or p_datos ? 'foto' then raise exception 'caja_ticket no debe recibir el cobro'; end if;
  if p_datos->>'items' = '["agotado"]' then raise exception 'De Cera solo quedan 0.'; end if;
  insert into appointments values (v_id, p_company, '2026-11-19 09:30', '2026-11-19 10:00', 30, 'completed');
  return jsonb_build_object('status', 'ok', 'id', v_id, 'total', 25, 'servicio', 'Corte');
end $$;
create function public.agenda_marcar_pagado(p_company text, p_datos jsonb) returns jsonb language plpgsql as $$
declare v_ya text;
begin
  if current_setting('t.falla_cobro', true) = 'si' then raise exception 'Este negocio pide la foto del pago.'; end if;
  select pagado_por into v_ya from appointments where company_id = p_company and id = p_datos->>'id';
  if not found then raise exception 'Eso no existe en este negocio.'; end if;
  update appointments set pagado_por = 'panel', metodo_pago = p_datos->>'metodo_pago' where id = p_datos->>'id';
  return jsonb_build_object('id', p_datos->>'id', 'cambio', v_ya = '', 'foto', p_datos ? 'foto');
end $$;
create function public.agenda_gasto_guardar(p_company text, p_gasto jsonb) returns jsonb language plpgsql as $$
begin
  insert into gastos values (p_gasto->>'id', p_company, p_gasto->>'fecha', (p_gasto->>'importe')::numeric)
  on conflict (id) do update set importe = excluded.importe;
  return jsonb_build_object('id', p_gasto->>'id');
end $$;
create function public.caja_ingreso_guardar(p_company text, p_datos jsonb) returns jsonb language plpgsql as $$
begin
  if public.rol_en(p_company) <> 'dueno' then raise exception 'Los ingresos del día solo los apunta el dueño.'; end if;
  insert into caja_ingresos (company_id, dia, importe) values (p_company, (p_datos->>'dia')::date, (p_datos->>'importe')::numeric);
  return jsonb_build_object('importe', p_datos->>'importe');
end $$;`);
await db.exec(sql);
await db.exec(sql); // idempotente

const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const hace = (h) => `now() - interval '${h} hours'`;
const aplicar = async (company, op, tipo, datos, cuando = hace(1)) =>
  (await db.query(`select sin_conexion_aplicar('${company}', '${op}', '${tipo}', $1::jsonb, ${cuando}) v`, [JSON.stringify(datos)])).rows[0].v;
const cuenta = async (q) => Number((await db.query(q)).rows[0].n);

// ── Quién ──
await rol('empleado');
let e = await err(() => aplicar('c1', uuid(1), 'gasto', { gasto: { id: 'g1', fecha: '2026-11-19', importe: 5 } }));
ok('el empleado no anota sin conexión', /dueño y el administrador/.test(e ?? ''), e);
await rol('dueno');
e = await err(() => aplicar('c2', uuid(1), 'gasto', { gasto: { id: 'g1', fecha: '2026-11-19', importe: 5 } }));
ok('de otro negocio, nada', /No tienes acceso/.test(e ?? ''), e);
e = await err(() => aplicar('c1', uuid(1), 'pedido', {}));
ok('un tipo que no existe se rechaza', /no se puede anotar/.test(e ?? ''), e);

// ── El ticket: a su hora y con su cobro ──
await rol('admin');
const ticket = { items: ['corte'], employee_id: 'e1', sede: '', telefono: '', nombre: '', metodo_pago: 'cash' };
const op10 = uuid(11);
let r = await aplicar('c1', op10, 'ticket', ticket, hace(5));
const cita = (await db.query(`select * from appointments where id = $1`, [r.id])).rows[0];
const esperada = (await db.query(`select to_char((now() - interval '5 hours') at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') h`)).rows[0].h;
ok('ticket: termina a la hora del celular, no a la de subida', cita.slot_end === esperada, `${cita.slot_end} vs ${esperada}`);
const ini = (await db.query(`select to_char($1::timestamp - interval '30 minutes', 'YYYY-MM-DD HH24:MI') h`, [esperada])).rows[0].h;
ok('ticket: empieza lo que dura antes', cita.slot_start === ini, `${cita.slot_start} vs ${ini}`);
ok('ticket: queda cobrado con su método', cita.pagado_por === 'panel' && cita.metodo_pago === 'cash');
ok('ticket: devuelve el cobro y la hora', r.cobro?.cambio === true && r.hora === esperada, JSON.stringify(r));

// ── Una sola vez ──
const antes = await cuenta(`select count(*) n from appointments`);
const r2 = await aplicar('c1', op10, 'ticket', ticket, hace(5));
ok('reintento: mismo resultado, marcado duplicado', r2.duplicado === true && r2.id === r.id, JSON.stringify(r2));
ok('reintento: no crea otro ticket', (await cuenta(`select count(*) n from appointments`)) === antes);

// ── Ticket y cobro, juntos o ninguno ──
await db.exec(`select set_config('t.falla_cobro', 'si', false)`);
const op12 = uuid(12);
e = await err(() => aplicar('c1', op12, 'ticket', { ...ticket, metodo_pago: 'yape' }));
ok('si el cobro falla, el error es el del cobro', /foto del pago/.test(e ?? ''), e);
ok('…y el ticket tampoco queda', (await cuenta(`select count(*) n from appointments`)) === antes);
ok('…ni la operación como hecha', (await cuenta(`select count(*) n from sin_conexion_ops where op_id = '${op12}'`)) === 0);
await db.exec(`select set_config('t.falla_cobro', '', false)`);
r = await aplicar('c1', op12, 'ticket', { ...ticket, metodo_pago: 'yape', foto: { url: 'u', hash: 'h', operacion: '1' } });
ok('al reintentar con la foto, entra', r.cobro?.foto === true && (await cuenta(`select count(*) n from appointments`)) === antes + 1, JSON.stringify(r));
e = await err(() => aplicar('c1', uuid(13), 'ticket', { ...ticket, metodo_pago: '' }));
ok('ticket sin método: se pregunta', /Con qué pagó/.test(e ?? ''), e);
e = await err(() => aplicar('c1', uuid(14), 'ticket', { ...ticket, items: ['agotado'] }));
ok('lo que rechaza caja_ticket vuelve tal cual', /solo quedan 0/.test(e ?? ''), e);

// ── La hora ──
e = await err(() => aplicar('c1', uuid(20), 'gasto', { gasto: { id: 'g20', fecha: '2026-11-19', importe: 5 } }, `now() + interval '1 hour'`));
ok('reloj adelantado: se rechaza', /adelantada/.test(e ?? ''), e);
e = await err(() => aplicar('c1', uuid(21), 'gasto', { gasto: { id: 'g21', fecha: '2026-11-19', importe: 5 } }, hace(80)));
ok('más de 72 h: se rechaza', /más de 3 días/.test(e ?? ''), e);
r = await aplicar('c1', uuid(22), 'gasto', { gasto: { id: 'g22', fecha: '2026-11-19', importe: 5 } }, hace(70));
ok('70 h: entra', r.id === 'g22');
e = await err(() => aplicar('c1', uuid(23), 'gasto', { gasto: { fecha: '2026-11-19', importe: 5 } }));
ok('gasto sin id: se rechaza (no sería idempotente)', /id del gasto/.test(e ?? ''), e);

// ── Cobro de una cita que ya estaba ──
await db.exec(`insert into appointments values ('cita-x', 'c1', '2026-11-19 09:00', '2026-11-19 09:30', 30, 'completed')`);
r = await aplicar('c1', uuid(30), 'cobro', { id: 'cita-x', metodo_pago: 'plin' });
ok('cobro: aplica', r.cambio === true);
r = await aplicar('c1', uuid(31), 'cobro', { id: 'cita-x', metodo_pago: 'plin' });
ok('cobro de algo ya cobrado (otra op): cambio false, sin error', r.cambio === false, JSON.stringify(r));
e = await err(() => aplicar('c1', uuid(32), 'cobro', { id: 'no-existe', metodo_pago: 'cash' }));
ok('cobro de algo que no existe: se rechaza', /no existe/.test(e ?? ''), e);

// ── Ingresos: solo el dueño ──
e = await err(() => aplicar('c1', uuid(40), 'ingreso', { dia: '2026-11-19', importe: 10, concepto: 'x' }));
ok('ingreso del admin: lo rechaza la 0023', /solo los apunta el dueño/.test(e ?? ''), e);
await rol('dueno');
r = await aplicar('c1', uuid(41), 'ingreso', { dia: '2026-11-19', importe: 10, concepto: 'x' });
await aplicar('c1', uuid(41), 'ingreso', { dia: '2026-11-19', importe: 10, concepto: 'x' });
ok('ingreso del dueño: uno, aunque se suba dos veces', (await cuenta(`select count(*) n from caja_ingresos`)) === 1);

// ── Lo apuntado ──
const fila = (await db.query(`select * from sin_conexion_ops where op_id = '${op10}'`)).rows[0];
ok('queda quién y cuándo', fila.creado_por === '00000000-0000-0000-0000-0000000000aa' && fila.tipo === 'ticket' && fila.company_id === 'c1');
await db.exec(`set role authenticated`);
e = await err(() => db.query(`select * from sin_conexion_ops`));
await db.exec(`reset role`);
ok('la tabla no se lee directamente', /permission denied/.test(e ?? ''), e);

console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
