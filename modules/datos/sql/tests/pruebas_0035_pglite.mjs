/**
 * Prueba de modules/datos/sql/0035_crm_etapa_a_mano.sql contra PGlite.
 * Lo del bot (companies con modo_atencion, catalog, leads, instances, rol_en/puede), simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0035_pglite.mjs . && node pruebas_0035_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');

const db = new PGlite();
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const espera = async (n, f, patron) => {
  try { await f(); console.log('MAL  (no lanzó)', n); fallos++; }
  catch (e) { const b = patron.test(e.message); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', n, '→', e.message); }
};
const uno = async (s, p) => (await db.query(s, p)).rows[0];
const como = (rol) => ex(`select set_config('t.rol', '${rol}', false)`);
const regla = async (c) => (await uno(`select crm_regla($1) as r`, [c])).r;
const poner = (c, l, e) => uno(`select crm_etapa_poner($1, $2, $3) as r`, [c, l, e]);
const aMano = async (c) => (await uno(`select crm_etapas_a_mano($1) as r`, [c])).r;

await ex(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.puede(p text, permiso text) returns boolean language sql stable as $$ select public.rol_en(p) is not null $$;
create function public.es_admin_plataforma() returns boolean language sql stable as $$ select false $$;
create table companies (id text primary key, business_mode text, modo_atencion text not null default 'cierra',
  servicio_cierre text not null default '', canal_cierre text not null default 'llamada');
create table instances (company_id text primary key);
create table catalog (id text primary key, company_id text, is_active integer not null default 1);
create table leads (id text primary key, company_id text);
insert into companies (id, business_mode, modo_atencion, servicio_cierre) values
  ('cierra', 'appointment', 'cierra', ''),
  ('hib', 'appointment', 'hibrido', 'demo'),
  ('hib-roto', 'appointment', 'hibrido', 'borrado'),
  ('hib-tienda', 'ecommerce', 'hibrido', 'demo2'),
  ('dueno', 'appointment', 'dueno', ''),
  ('sinbot', 'appointment', 'cierra', '');
insert into instances values ('cierra'), ('hib'), ('hib-roto'), ('hib-tienda'), ('dueno');
insert into catalog values ('demo', 'hib', 1), ('borrado', 'hib-roto', 0), ('demo2', 'hib-tienda', 1);
insert into leads values ('l-cierra', 'cierra'), ('l-hib', 'hib'), ('l-dueno', 'dueno'), ('l-sinbot', 'sinbot');
`);
await ex(leer('modules/datos/sql/0035_crm_etapa_a_mano.sql'));

console.log('— la regla —');
ok('1a cierra → auto', (await regla('cierra')) === 'auto');
ok('1b híbrido con su servicio → hibrido', (await regla('hib')) === 'hibrido');
ok('1c híbrido con el servicio desactivado → auto (como el bot)', (await regla('hib-roto')) === 'auto');
ok('1d híbrido en una tienda → auto (como el bot)', (await regla('hib-tienda')) === 'auto');
ok('1e lo contestas tú → manual', (await regla('dueno')) === 'manual');
ok('1f sin instancia (sin bot) → manual', (await regla('sinbot')) === 'manual');

console.log('— sin acceso —');
await como('');
await espera('2a sin rol no lee', () => aMano('hib'), /No tienes acceso/);
await espera('2b sin rol no mueve', () => poner('dueno', 'l-dueno', 'cliente'), /No tienes acceso/);

console.log('— mover —');
await como('empleado');
await espera('3a auto: no se mueve', () => poner('cierra', 'l-cierra', 'cliente'), /las mueve Mia/);
await espera('3b híbrido: a «Interesado» no', () => poner('hib', 'l-hib', 'interesado'), /solo mueves tú/);
await poner('hib', 'l-hib', 'cliente');
let r = await aMano('hib');
ok('3c híbrido: a «Cliente» sí', r.regla === 'hibrido' && r.etapas.length === 1 && r.etapas[0].etapa === 'cliente', JSON.stringify(r));
await poner('hib', 'l-hib', 'demo');
r = await aMano('hib');
ok('3d se pisa, no se duplica', r.etapas.length === 1 && r.etapas[0].etapa === 'demo', JSON.stringify(r));
await poner('dueno', 'l-dueno', 'interesado');
await poner('sinbot', 'l-sinbot', 'contactado');
ok('3e manual: cualquier columna', (await aMano('dueno')).etapas[0].etapa === 'interesado' && (await aMano('sinbot')).etapas[0].etapa === 'contactado');
await espera('3f columna inventada', () => poner('dueno', 'l-dueno', 'ganado'), /no existe/);
await espera('3g contacto de otro negocio', () => poner('dueno', 'l-hib', 'cliente'), /no es de este negocio/);

console.log('— que lo decida Mia —');
await poner('hib', 'l-hib', null);
ok('4a null la quita', (await aMano('hib')).etapas.length === 0);
await ex(`insert into crm_etapas (company_id, lead_id, etapa) values ('cierra', 'l-cierra', 'cliente')`);
await poner('cierra', 'l-cierra', null);
ok('4b quitarla se puede incluso en auto', (await aMano('cierra')).etapas.length === 0);

console.log('— la tabla no se toca directa —');
await ex(`set role authenticated`);
await espera('5a authenticated no lee la tabla', () => uno(`select * from crm_etapas`), /permission denied/);
await espera('5b ni la regla suelta', () => regla('hib'), /permission denied/);
await ex(`reset role`);

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
