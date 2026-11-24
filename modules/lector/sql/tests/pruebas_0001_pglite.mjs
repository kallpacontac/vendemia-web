/**
 * Prueba de modules/lector/sql/0001_lector_de_pagos.sql contra un Postgres de verdad (PGlite).
 * Lo de antes (companies, rol_en del bot, avisos_apuntar, loyalty_srv_check, pg_cron), simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/lector/sql/tests/pruebas_0001_pglite.mjs . && node pruebas_0001_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');

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
const como = (rol) => ex(`select set_config('t.rol', '${rol}', false)`);

await ex(`
create role anon; create role authenticated;
create schema auth; create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create schema cron; create table cron.job (jobname text);
create function cron.schedule(a text, b text, c text) returns int language sql as $$ insert into cron.job values (a); select 1 $$;
create function cron.unschedule(a text) returns boolean language sql as $$ delete from cron.job where jobname = a; select true $$;
create table public.companies (id text primary key, name text);
insert into companies values ('neg', 'Barbería Uno'), ('otro', 'Otro');
create function public.rol_en(p text) returns text language sql as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create table avisos (n serial, company text, tipo text, ref text, datos jsonb, creada timestamptz);
create function public.avisos_apuntar(p_company text, p_tipo text, p_ref text, p_datos jsonb,
    p_fila_creada timestamptz default now(), p_retraso interval default interval '0') returns void language sql as $$
    insert into avisos (company, tipo, ref, datos, creada) values (p_company, p_tipo, p_ref, p_datos, p_fila_creada) $$;
`);
await ex(leer('modules/lector/sql/0001_lector_de_pagos.sql'));
ok('se programa la limpieza', (await uno(`select count(*)::int n from cron.job where jobname = 'lector_limpiar'`)).n === 1);
// Aplicarla dos veces no rompe nada.
await ex(leer('modules/lector/sql/0001_lector_de_pagos.sql'));
ok('se puede aplicar dos veces', (await uno(`select count(*)::int n from cron.job where jobname = 'lector_limpiar'`)).n === 1);

// ── Código ──
await como('empleado');
await espera('el empleado no pide código', () => q(`select lector_codigo_nuevo('neg')`), /dueño o el administrador/);
await como('');
await espera('alguien de fuera no pide código', () => q(`select lector_codigo_nuevo('neg')`), /dueño o el administrador/);
await como('admin');
const c1 = (await uno(`select lector_codigo_nuevo('neg') r`)).r;
ok('código de 6, sin letras confusas', /^[A-HJKMNP-Z2-9]{6}$/.test(c1.codigo));
const c2 = (await uno(`select lector_codigo_nuevo('neg') r`)).r;
ok('pedir otro anula el anterior', (await uno(`select count(*)::int n from lector_codigos where company_id = 'neg'`)).n === 1);

const D = '22222222-2222-2222-2222-222222222222';
const CLAVE = 'a'.repeat(64);
await espera('el código viejo ya no vale', () => q(`select lector_srv_vincular($1, $2, $3, 'Xiaomi')`, [c1.codigo, D, CLAVE]), /no vale o ya caducó/);
const v = (await uno(`select lector_srv_vincular($1, $2, $3, 'Xiaomi') r`, [c2.codigo.toLowerCase().replace(/(...)/, '$1-'), D, CLAVE])).r;
ok('vincula con el código (minúsculas y guion valen)', v.negocio === 'Barbería Uno' && v.company_id === 'neg');
await espera('un código se usa una vez', () => q(`select lector_srv_vincular($1, $2, $3, 'X')`, [c2.codigo, D, CLAVE]), /no vale o ya caducó/);
ok('la clave sale para firmar', (await uno(`select lector_srv_clave($1) r`, [D])).r.clave === CLAVE);
ok('celular desconocido = null', (await uno(`select lector_srv_clave('33333333-3333-3333-3333-333333333333') r`)).r === null);

// Código caducado
const c3 = (await uno(`select lector_codigo_nuevo('neg') r`)).r;
await ex(`update lector_codigos set expira = now() - interval '1 minute' where codigo = '${c3.codigo}'`);
await espera('código caducado', () => q(`select lector_srv_vincular($1, $2, $3, 'X')`, [c3.codigo, D, CLAVE]), /no vale o ya caducó/);

// ── Recibir ──
const ahora = Date.now();
const aviso = (huella, extra = {}) => ({ huella, centimos: 3000, nombre: 'ALVARO FRANCO PELAEZ', codigo: null, origen: 'Yape', generico: false, recuperado: false, cuando: ahora, version: '1.0.2', ...extra });
let r = (await uno(`select lector_srv_recibir($1, 'aviso', $2) r`, [D, aviso('h-0000001')])).r;
ok('aviso nuevo', r.nuevo === true);
r = (await uno(`select lector_srv_recibir($1, 'aviso', $2) r`, [D, aviso('h-0000001')])).r;
ok('el mismo aviso dos veces se guarda una', r.nuevo === false && (await uno(`select count(*)::int n from lector_avisos`)).n === 1);
const a1 = await uno(`select * from avisos order by n limit 1`);
ok('apunta un push de pago, clase lector', a1.tipo === 'pago' && a1.datos.clase === 'lector' && Number(a1.datos.monto) === 30 && a1.ref.startsWith('lector:'));
ok('solo un push por aviso', (await uno(`select count(*)::int n from avisos`)).n === 1);

await q(`select lector_srv_recibir($1, 'aviso', $2)`, [D, aviso('h-0000002', { centimos: null, nombre: '' })]);
ok('un «sin leer» se guarda sin push', (await uno(`select count(*)::int n from lector_avisos`)).n === 2 && (await uno(`select count(*)::int n from avisos`)).n === 1);

await q(`select lector_srv_recibir($1, 'aviso', $2)`, [D, aviso('h-0000003', { cuando: ahora + 3_600_000, codigo: '12a' })]);
const fut = await uno(`select cuando <= now() f, codigo from lector_avisos where huella = 'h-0000003'`);
ok('hora del futuro → ahora; código raro → null', fut.f === true && fut.codigo === null);

await q(`select lector_srv_recibir($1, 'latido', '{"version":"1.0.2","por_enviar":3,"sin_leer":1}')`, [D]);
const d1 = await uno(`select por_enviar, sin_leer, version, ultimo_latido is not null l from lector_dispositivos`);
ok('el latido guarda el estado del celular', d1.por_enviar === 3 && d1.sin_leer === 1 && d1.version === '1.0.2' && d1.l);
await espera('tipo desconocido', () => q(`select lector_srv_recibir($1, 'otro', '{}')`, [D]), /Tipo desconocido/);

// ── Panel ──
await como('admin');
const e = (await uno(`select lector_estado('neg') r`)).r;
ok('el panel ve el celular y lo de hoy', e.dispositivos.length === 1 && e.avisos.length === 3 && !('clave' in e.dispositivos[0]));
await como('empleado');
await espera('el empleado no ve los pagos', () => q(`select lector_estado('neg')`), /No tienes acceso/);
await como('admin');
await espera('otro negocio no ve los míos', async () => { await ex(`select set_config('t.rol', '', false)`); await q(`select lector_estado('otro')`); }, /No tienes acceso/);
await como('dueno');
await q(`select lector_desvincular('neg', $1)`, [D]);
ok('desvincular revoca', (await uno(`select lector_srv_clave($1) r`, [D])).r.revocado === true);
await espera('un celular desvinculado ya no envía', () => q(`select lector_srv_recibir($1, 'latido', '{}')`, [D]), /no vinculado/);
const c4 = (await uno(`select lector_codigo_nuevo('neg') r`)).r;
await q(`select lector_srv_vincular($1, $2, $3, 'Xiaomi')`, [c4.codigo, D, 'b'.repeat(64)]);
ok('volver a vincular reactiva con clave nueva', (await uno(`select lector_srv_clave($1) r`, [D])).r.revocado === false
  && (await uno(`select lector_srv_clave($1) r`, [D])).r.clave === 'b'.repeat(64));

// ── Permisos de la API ──
const sinPermiso = await uno(`select has_table_privilege('anon', 'lector_dispositivos', 'select') a, has_table_privilege('authenticated', 'lector_avisos', 'select') b`);
ok('las tablas no se leen desde la API', !sinPermiso.a && !sinPermiso.b);
const fn = await uno(`select has_function_privilege('authenticated', 'lector_srv_clave(uuid)', 'execute') a, has_function_privilege('anon', 'lector_estado(text, timestamptz)', 'execute') b`);
ok('las srv no son para el panel y el panel no es para anon', !fn.a && !fn.b);

// ── 90 días ──
await ex(`update lector_avisos set cuando = now() - interval '91 days' where huella = 'h-0000001'`);
await ex(`select lector_limpiar()`);
ok('a los 90 días se borra', (await uno(`select count(*)::int n from lector_avisos`)).n === 2);

// ── Deshacer ──
await ex(leer('modules/lector/sql/0001_lector_de_pagos_deshacer.sql'));
ok('deshacer quita todo', (await uno(`select to_regclass('public.lector_avisos') is null a, count(*)::int n from cron.job`)).a);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
