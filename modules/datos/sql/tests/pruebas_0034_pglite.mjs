/**
 * Prueba de modules/datos/sql/0034_modo_atencion.sql contra PGlite.
 * Carga de verdad la 0006 (v2_notas_media y la cfg_empresa_actualizar de antes) y la v2_parchear
 * de la 0003; la tabla `companies` lleva lo que añade la 0049 del bot, con sus CHECK.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0034_pglite.mjs . && node pruebas_0034_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0003 = leer('modules/datos/sql/0003_nulos_del_formulario.sql');
const parchear = s0003.slice(s0003.indexOf('create or replace function public.v2_parchear'));
const v2Parchear = parchear.slice(0, parchear.indexOf('end $$;') + 'end $$;'.length);

const db = new PGlite();
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c) => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n); };
const espera = async (n, f, patron) => {
  try { await f(); console.log('MAL  (no lanzó)', n); fallos++; }
  catch (e) { const b = patron.test(e.message); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', n, '→', e.message); }
};
const uno = async (s, p) => (await db.query(s, p)).rows[0];
const como = (rol) => ex(`select set_config('t.rol', '${rol}', false)`);
const cfg = async (patch) => (await uno(`select cfg_empresa_actualizar('c1', $1::jsonb) as r`, [JSON.stringify(patch)])).r;
const fila = () => uno(`select modo_atencion, canal_cierre, servicio_cierre, bot_name from companies where id = 'c1'`);

await ex(`
create role anon; create role authenticated; create role service_role;
create function public.v2_autorizar_config(p text) returns text language sql stable as $$ select current_setting('t.rol', true) $$;
create function public.horario_error(p text) returns text language sql immutable as $$ select null::text $$;
create function public.v2_con_claves(p text) returns text language sql immutable as $$ select p $$;
create table companies (id text primary key, name text, bot_name text, business_mode text, payment_methods text,
  welcome_media text not null default '[]', closing_media text not null default '[]');
insert into companies (id, name, bot_name, business_mode) values ('c1', 'Vendemia', 'Mia', 'appointment');
`);
await ex(v2Parchear);
await ex(leer('modules/datos/sql/0006_notas_con_adjuntos.sql'));

console.log('— sin la 0049 del bot —');
await espera('0 se para y dice qué falta', () => ex(leer('modules/datos/sql/0034_modo_atencion.sql')), /0049 del bot/);
await ex('rollback'); // se paró dentro de su begin
await como('dueno');
ok('0b antes, los tres campos vuelven en ignored', (await cfg({ modo_atencion: 'hibrido' })).ignored.includes('modo_atencion'));

// La 0049 del bot, tal cual sus columnas y sus CHECK.
await ex(`
alter table companies add column modo_atencion text not null default 'cierra';
alter table companies add column canal_cierre text not null default 'llamada';
alter table companies add column servicio_cierre text not null default '';
alter table companies add constraint companies_modo_atencion_valido check (modo_atencion in ('cierra', 'hibrido', 'dueno'));
alter table companies add constraint companies_canal_cierre_valido check (canal_cierre in ('llamada', 'meet'));
`);
await ex(leer('modules/datos/sql/0034_modo_atencion.sql'));
await como('admin');

console.log('— se guardan —');
let r = await cfg({ modo_atencion: 'hibrido', servicio_cierre: ' demo-gratis ', canal_cierre: 'meet' });
ok('1a los tres en updated', ['modo_atencion', 'servicio_cierre', 'canal_cierre'].every((k) => r.updated.includes(k)));
ok('1b nada en ignored', r.ignored.length === 0);
let f = await fila();
ok('1c guardados (servicio sin espacios)', f.modo_atencion === 'hibrido' && f.canal_cierre === 'meet' && f.servicio_cierre === 'demo-gratis');
ok('1d el administrador puede (no es campo de cobro)', r.sin_permiso.length === 0);

r = await cfg({ modo_atencion: 'dueno' });
ok('2a uno solo, sin tocar los otros', r.updated.join() === 'modo_atencion');
f = await fila();
ok('2b dueno, y el servicio se conserva', f.modo_atencion === 'dueno' && f.servicio_cierre === 'demo-gratis');

console.log('— se rechazan, con el motivo del bot —');
await espera('3a híbrido con tilde', () => cfg({ modo_atencion: 'híbrido', bot_name: 'Otra' }), /modo_atencion debe ser 'cierra', 'hibrido' o 'dueno', no "híbrido"/);
await espera('3b Meet con mayúscula', () => cfg({ canal_cierre: 'Meet' }), /canal_cierre debe ser 'llamada' o 'meet', no "Meet"/);
await espera('3c null en el modo', () => cfg({ modo_atencion: null }), /modo_atencion debe ser/);
await espera('3d un número', () => cfg({ canal_cierre: 1 }), /canal_cierre debe ser/);
f = await fila();
ok('3e un rechazo no guarda NADA del patch', f.bot_name === 'Mia' && f.modo_atencion === 'dueno');

console.log('— lo de antes sigue —');
r = await cfg({ bot_name: 'Pierina', payment_methods: '[]' });
ok('4a admin: bot_name sí, pagos en sin_permiso', r.updated.includes('bot_name') && r.sin_permiso.includes('payment_methods'));
await espera('4b adjunto de otro host', () => cfg({ welcome_media: [{ url: 'https://otro.com/a.jpg', type: 'image' }] }), /Cloudinary/);
r = await cfg({ servicio_cierre: null });
f = await fila();
ok('4c servicio null = vacío', r.updated.includes('servicio_cierre') && f.servicio_cierre === '');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
