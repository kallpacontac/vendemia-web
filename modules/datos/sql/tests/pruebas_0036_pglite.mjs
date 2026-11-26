/**
 * Prueba de modules/datos/sql/0036_sin_conexion_pagos.sql (PGlite), encima de la 0025. Las funciones de
 * siempre van simuladas: se prueba la envoltura (una sola vez, a su hora, sin tocar los pagos de antes).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0036_pglite.mjs . && node pruebas_0036_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (n) => readFileSync(`${repo}/modules/datos/sql/${n}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };

await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-0000000000aa'::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$
  select case when p = 'c1' then nullif(current_setting('t.rol', true), '') end $$;
create table gastos (id text primary key, company_id text, importe numeric);
create table pending_payments (id text primary key, company_id text, lead_id text, amount numeric, operation_id text,
  created_at bigint default extract(epoch from now())::bigint);
create function public.caja_ticket(p_company text, p_datos jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.agenda_marcar_pagado(p_company text, p_datos jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.caja_ingreso_guardar(p_company text, p_datos jsonb) returns jsonb language sql as $$ select '{}'::jsonb $$;
create function public.agenda_gasto_guardar(p_company text, p_gasto jsonb) returns jsonb language plpgsql as $$
begin
  insert into gastos values (p_gasto->>'id', p_company, (p_gasto->>'importe')::numeric) on conflict (id) do nothing;
  return jsonb_build_object('id', p_gasto->>'id');
end $$;
-- Como la de la 0010: idempotente por 'panel:<op>'.
create function public.agenda_registrar_pago(p_company text, p_datos jsonb, p_op text) returns jsonb language plpgsql as $$
begin
  if exists (select 1 from pending_payments where operation_id = 'panel:' || p_op) then
    return jsonb_build_object('lead_id', p_datos->>'lead_id', 'duplicado', true);
  end if;
  if (p_datos->>'monto')::numeric <= 0 then raise exception 'monto inválido'; end if;
  insert into pending_payments (id, company_id, lead_id, amount, operation_id)
  values (gen_random_uuid()::text, p_company, p_datos->>'lead_id', (p_datos->>'monto')::numeric, 'panel:' || p_op);
  return jsonb_build_object('lead_id', p_datos->>'lead_id', 'monto', (p_datos->>'monto')::numeric, 'foto', p_datos ? 'foto');
end $$;`);
await db.exec(leer('0025_sin_conexion.sql'));
await db.exec(leer('0036_sin_conexion_pagos.sql'));
await db.exec(leer('0036_sin_conexion_pagos.sql')); // idempotente

const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const aplicar = async (op, tipo, datos, cuando = `now() - interval '5 hours'`) =>
  (await db.query(`select sin_conexion_aplicar('c1', '${op}', '${tipo}', $1::jsonb, ${cuando}) v`, [JSON.stringify(datos)])).rows[0].v;
const epoch = async (q) => Number((await db.query(q)).rows[0].e);

// Un pago de antes, de ese mismo cliente: no se toca.
await db.exec(`insert into pending_payments values ('viejo', 'c1', 'lead1', 20, 'voucher:1', 1700000000)`);

await rol('admin');
const pago = { lead_id: 'lead1', monto: 30, metodo_pago: 'cash', appointment_id: 'cita1' };
let r = await aplicar(uuid(1), 'pago', pago);
ok('pago: aplica', r.monto === 30, JSON.stringify(r));
const fila = (await db.query(`select * from pending_payments where operation_id = 'panel:${uuid(1)}'`)).rows[0];
const esperada = await epoch(`select extract(epoch from now() - interval '5 hours')::bigint e`);
ok('pago: entra a la hora del celular, no a la de subida', Number(fila.created_at) === esperada, `${fila.created_at} vs ${esperada}`);
ok('el pago de antes sigue con su hora', Number((await db.query(`select created_at from pending_payments where id = 'viejo'`)).rows[0].created_at) === 1700000000);

r = await aplicar(uuid(1), 'pago', pago);
ok('reintento: duplicado y un solo pago', r.duplicado === true && (await db.query(`select count(*) n from pending_payments where lead_id = 'lead1'`)).rows[0].n == 2);

// Si agenda_registrar_pago ya lo tenía (subió con otra op de la 0025… o lo reintenta el bot): no toca horas.
await db.exec(`insert into pending_payments values ('del-bot', 'c1', 'lead1', 10, 'panel:${uuid(2)}', 1750000000)`);
r = await aplicar(uuid(2), 'pago', pago);
ok('si ya existía: duplicado y su hora no se cambia', r.duplicado === true
  && Number((await db.query(`select created_at from pending_payments where id = 'del-bot'`)).rows[0].created_at) === 1750000000);

const e = await err(() => aplicar(uuid(3), 'pago', { ...pago, monto: 0 }));
ok('lo que rechaza registrar_pago vuelve tal cual y no queda nada', /monto inválido/.test(e ?? '')
  && (await db.query(`select count(*) n from sin_conexion_ops where op_id = '${uuid(3)}'`)).rows[0].n == 0, e);

await rol('empleado');
ok('el empleado sigue sin anotar sin conexión', /dueño y el administrador/.test((await err(() => aplicar(uuid(4), 'pago', pago))) ?? ''));

// Lo de la 0025 sigue igual.
await rol('dueno');
r = await aplicar(uuid(5), 'gasto', { gasto: { id: 'g1', fecha: '2026-11-26', importe: 5 } });
ok('0025: gasto sigue entrando', r.id === 'g1');
ok('0025: hora adelantada sigue rechazada', /adelantada/.test((await err(() => aplicar(uuid(6), 'gasto', { gasto: { id: 'g2', fecha: '2026-11-26', importe: 5 } }, `now() + interval '1 hour'`))) ?? ''));

console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
