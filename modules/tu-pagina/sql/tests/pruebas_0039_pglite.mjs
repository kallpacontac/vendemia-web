/**
 * Prueba de modules/tu-pagina/sql/0039_ticket_dos_fotos.sql (PGlite, tablas y permisos simulados).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0039_pglite.mjs . && node pruebas_0039_pglite.mjs <repo>
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
insert into public.appointments values ('a-pedro', 'c1', 'e-pedro'), ('a-juan', 'c1', 'e-juan'), ('a-p2', 'c1', 'e-pedro');
create table public.cobro_ajustes (company_id text primary key, foto_pago text not null default 'apagada',
  actualizado_por uuid, actualizado_at timestamptz not null default now());
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
await db.exec(leer('0039_ticket_dos_fotos.sql'));
await db.exec(leer('0039_ticket_dos_fotos.sql'));
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const url = (n) => `https://res.cloudinary.com/demo/image/upload/v1/comprobantes/c1/${n}.jpg`;
const foto = (cita, orden, u, h = 'ab12') => db.query(`select public.mi_agenda_ticket_foto('c1', $1, $2, $3, $4) r`, [cita, u, h, orden]);
const fila = async (cita) => (await db.query(`select * from public.ticket_fotos where appointment_id = $1`, [cita])).rows;

await rol('empleado');
ok('primera foto', (await foto('a-pedro', 1, url('uno'))).rows[0].r.orden === 1);
ok('segunda foto, misma fila', (await foto('a-pedro', 2, url('dos'))).rows[0].r.orden === 2);
let f = await fila('a-pedro');
ok('una fila con las dos', f.length === 1 && f[0].url.endsWith('uno.jpg') && f[0].url_2.endsWith('dos.jpg'));
ok('sin primera, la segunda ocupa su sitio', (await foto('a-p2', 2, url('sola'))).rows[0].r.orden === 1
  && (await fila('a-p2'))[0].url.endsWith('sola.jpg'));
ok('orden 3 no', /dos fotos como mucho/.test(await err(() => foto('a-pedro', 3, url('x'))) ?? ''));
ok('segunda con URL ajena no', /no se guardó bien/.test(await err(() => foto('a-pedro', 2, 'https://evil.com/x.jpg')) ?? ''));
ok('barbero no adjunta al de otro', /tus propios tickets/.test(await err(() => foto('a-juan', 2, url('x'))) ?? ''));
ok('la de 4 argumentos sigue (primera)', (await db.query(`select public.mi_agenda_ticket_foto('c1', 'a-pedro', $1, 'cd') r`, [url('nueva')])).rows[0].r.status === 'ok');
f = await fila('a-pedro');
ok('reemplazar la primera deja la segunda', f[0].url.endsWith('nueva.jpg') && f[0].url_2.endsWith('dos.jpg'));

// El ajuste
ok('de serie, opcional', (await db.query(`select public.ticket_foto_modo('c1') m`)).rows[0].m === 'opcional');
ok('el barbero no lo cambia', /dueño o el administrador/.test(await err(() => db.query(`select public.ticket_foto_guardar('c1', 'apagada')`)) ?? ''));
await rol('admin');
await db.query(`select public.ticket_foto_guardar('c1', 'obligatoria')`);
await rol('empleado');
ok('el barbero lo lee', (await db.query(`select public.ticket_foto_modo('c1') m`)).rows[0].m === 'obligatoria');
await rol('dueno');
ok('valor raro no', /Elige/.test(await err(() => db.query(`select public.ticket_foto_guardar('c1', 'siempre')`)) ?? ''));
await db.query(`select public.ticket_foto_guardar('c1', 'apagada')`);
ok('dueño lo apaga', (await db.query(`select public.ticket_foto_modo('c1') m`)).rows[0].m === 'apagada');
ok('no pisa foto_pago', (await db.query(`select foto_pago from public.cobro_ajustes where company_id = 'c1'`)).rows[0].foto_pago === 'apagada');
await rol('');
ok('sin acceso, no lo lee', /No tienes acceso/.test(await err(() => db.query(`select public.ticket_foto_modo('c1')`)) ?? ''));

await db.exec(leer('0039_ticket_dos_fotos_deshacer.sql'));
ok('deshacer quita la columna y el ajuste', (await db.query(`select to_regprocedure('public.ticket_foto_modo(text)') p,
  exists (select 1 from information_schema.columns where table_name = 'ticket_fotos' and column_name = 'url_2') c`)).rows
  .every((r) => r.p === null && r.c === false));
await rol('empleado');
ok('tras deshacer, la de 4 argumentos sigue', (await db.query(`select public.mi_agenda_ticket_foto('c1', 'a-pedro', $1, 'ef') r`, [url('otra')])).rows[0].r.status === 'ok');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
