/**
 * Prueba de modules/tu-pagina/sql/0037_foto_del_ticket.sql (PGlite, tablas y permisos simulados).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0037_pglite.mjs . && node pruebas_0037_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/modules/tu-pagina/sql/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
create table public.appointments (id text primary key, company_id text, employee_id text);
insert into public.appointments values ('a-pedro', 'c1', 'e-pedro'), ('a-juan', 'c1', 'e-juan'), ('a-otro', 'c2', 'e-x');
create function public.rol_en(p text) returns text language sql stable as $$
  select case when p = 'c1' then nullif(current_setting('t.rol', true), '') end $$;
create function public.v2_autorizar_agenda(p text, emp boolean default false) returns text language plpgsql as $$
declare r text := public.rol_en(p); begin
  if r is null then raise exception 'No tienes acceso a este negocio.'; end if;
  if r = 'empleado' and not emp then raise exception 'Eso lo hace el dueño'; end if;
  return r; end $$;
create function public.mi_empleado(p text) returns text language sql stable as $$
  select case when current_setting('t.rol', true) = 'empleado' then 'e-pedro' end $$;`);
await db.exec(leer('0037_foto_del_ticket.sql'));
await db.exec(leer('0037_foto_del_ticket.sql'));
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const url = 'https://res.cloudinary.com/demo/image/upload/v1/comprobantes/c1/x.jpg';
const foto = (cita, u = url, h = 'ab12') => db.query(`select public.mi_agenda_ticket_foto('c1', $1, $2, $3) r`, [cita, u, h]);
const cuantas = async () => (await db.query(`select count(*)::int n from public.ticket_fotos`)).rows[0].n;

await rol('empleado');
ok('barbero adjunta a SU ticket', (await foto('a-pedro')).rows[0].r.status === 'ok');
ok('barbero NO adjunta al de otro', /tus propios tickets/.test(await err(() => foto('a-juan')) ?? ''));
ok('URL que no es de Cloudinary se rechaza', /no se guardó bien/.test(await err(() => foto('a-pedro', 'https://evil.com/x.jpg')) ?? ''));
ok('cita de otro negocio se rechaza', /no es de este negocio/.test(await err(() => foto('a-otro')) ?? ''));
ok('hash que no es hex se rechaza', (await err(() => foto('a-pedro', url, 'zz;drop'))) !== null);
await foto('a-pedro', url.replace('x.jpg', 'y.jpg'));
ok('la segunda foto reemplaza a la primera', (await cuantas()) === 1
  && (await db.query(`select url from public.ticket_fotos where appointment_id = 'a-pedro'`)).rows[0].url.endsWith('y.jpg'));

await rol('admin');
ok('admin adjunta a cualquiera de su negocio', (await foto('a-juan')).rows[0].r.status === 'ok');
await rol('dueno');
ok('dueño también', (await foto('a-juan')).rows[0].r.status === 'ok');
await rol('');
ok('sin acceso al negocio, nada', /No tienes acceso/.test(await err(() => foto('a-pedro')) ?? ''));
ok('quedan 2 fotos', (await cuantas()) === 2);

await db.exec(leer('0037_foto_del_ticket_deshacer.sql'));
ok('deshacer borra tabla y función', (await db.query(`select to_regclass('public.ticket_fotos') t`)).rows[0].t === null);

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
