/**
 * Prueba de modules/datos/sql/0021_acceso_del_equipo.sql (PGlite, auth y pgcrypto simulados).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0021_pglite.mjs . && node pruebas_0021_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/datos/sql/0021_acceso_del_equipo.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth; create schema extensions;
create function extensions.gen_salt(t text) returns text language sql as $$ select 'sal' $$;
create function extensions.crypt(c text, s text) returns text language sql as $$ select 'h:' || c $$;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.v2_autorizar_agenda(p text, v boolean default false) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso'; end if; return 'x'; end $$;
create function public.rol_en(p text) returns text language sql stable as $$ select case when p = 'c1' then nullif(current_setting('t.rol', true), '') end $$;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token text, recovery_token text, email_change_token_new text, email_change text, email_change_token_current text,
  phone_change text, phone_change_token text, reauthentication_token text);
create table auth.identities (id uuid, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create table memberships (id text primary key, auth_user_id text, company_id text, role text, employee_id text);
create table employees (id text, company_id text, name text);
insert into employees values ('e1', 'c1', 'Brandy Ríos'), ('e2', 'c1', 'Carlos'), ('e3', 'c1', 'Ñato'), ('x1', 'c2', 'Ajeno');
create table empleado_fichas (company_id text, employee_id text, telefono text default '', actualizado_at timestamptz default now(), primary key (company_id, employee_id));
-- Una persona que ya es barbero en OTRO negocio con el celular 911111111.
insert into auth.users (id, email, encrypted_password) values ('00000000-0000-0000-0000-0000000000aa', '911111111@equipo.vendemias.com', 'h:suya');
insert into memberships values ('m-x', '00000000-0000-0000-0000-0000000000aa', 'c2', 'member', 'x1');`);
await db.exec(sql); await db.exec(sql);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);

await rol('admin');
let r = await db.query(`select equipo_acceso_dar('c1', 'e2', '987 654 321') v`);
const c1 = r.rows[0].v;
ok('dar acceso: usuario = celular y clave nombre+4', c1.usuario === '987654321' && /^carlos\d{4}$/.test(c1.clave) && c1.nueva === true, JSON.stringify(c1));
r = await db.query(`select encrypted_password p from auth.users where email = '987654321@equipo.vendemias.com'`);
ok('guardada cifrada (no en claro)', r.rows[0].p === 'h:' + c1.clave);
r = await db.query(`select count(*)::int n from auth.identities`);
ok('con su identidad', r.rows[0].n === 1);
r = await db.query(`select role, employee_id from memberships where company_id = 'c1'`);
ok('miembro enlazado a su ficha', r.rows.length === 1 && r.rows[0].role === 'member' && r.rows[0].employee_id === 'e2');
r = await db.query(`select telefono from empleado_fichas where employee_id = 'e2'`);
ok('celular en la ficha', r.rows[0]?.telefono === '987654321');
ok('dos veces no', /ya tiene acceso/.test(await err(() => db.query(`select equipo_acceso_dar('c1', 'e2', '987654321')`))));
r = await db.query(`select equipo_accesos_leer('c1') v`);
ok('leer accesos', r.rows[0].v.e2?.usuario === '987654321');
r = await db.query(`select equipo_acceso_clave('c1', 'e2') v`);
ok('nueva contraseña distinta y cifrada', /^carlos\d{4}$/.test(r.rows[0].v.clave));
r = await db.query(`select equipo_acceso_dar('c1', 'e3', '922222222') v`);
ok('nombre con Ñ → clave válida', /^nato\d{4}$/.test(r.rows[0].v.clave), r.rows[0].v.clave);
ok('celular malo', /9 dígitos/.test(await err(() => db.query(`select equipo_acceso_dar('c1', 'e1', '12345')`))));
ok('empleado de otro negocio', /no es de este negocio/.test(await err(() => db.query(`select equipo_acceso_dar('c1', 'x1', '933333333')`))));

// La cuenta que ya es de OTRO negocio: se le da acceso, pero su contraseña NO se toca.
r = await db.query(`select equipo_acceso_dar('c1', 'e1', '911111111') v`);
ok('cuenta de otro negocio: acceso sin clave nueva', r.rows[0].v.clave === null && r.rows[0].v.nueva === false);
r = await db.query(`select encrypted_password p from auth.users where id = '00000000-0000-0000-0000-0000000000aa'`);
ok('su contraseña sigue igual', r.rows[0].p === 'h:suya');
ok('y no se le puede restablecer desde aquí', /otro negocio/.test(await err(() => db.query(`select equipo_acceso_clave('c1', 'e1')`))));

r = await db.query(`select equipo_acceso_quitar('c1', 'e2') n`);
ok('quitar acceso', r.rows[0].n === 1);
r = await db.query(`select count(*)::int n from auth.users where email = '987654321@equipo.vendemias.com'`);
ok('la cuenta queda (solo deja de entrar aquí)', r.rows[0].n === 1);

await rol('empleado');
ok('el barbero no puede', /dueño o el administrador/.test(await err(() => db.query(`select equipo_acceso_clave('c1', 'e3')`))));
ok('ni leer', /dueño o el administrador/.test(await err(() => db.query(`select equipo_accesos_leer('c1')`))));
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
