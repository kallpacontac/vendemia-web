/**
 * Prueba de modules/datos/sql/0019_documentos_del_empleado.sql (PGlite, con storage simulado).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0019_pglite.mjs . && node pruebas_0019_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (f) => readFileSync(`${repo}/${f}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function public.v2_autorizar_agenda(p text, v boolean default false) returns text language plpgsql as $$ begin
  if coalesce(current_setting('t.rol', true), '') = '' then raise exception 'No tienes acceso'; end if; return 'x'; end $$;
create function public.rol_en(p text) returns text language sql stable as $$ select case when p = 'c1' then nullif(current_setting('t.rol', true), '') end $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id serial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create table employees (id text, company_id text);
insert into employees values ('e1', 'c1'), ('x1', 'c2');`);
await db.exec(leer('modules/datos/sql/0018_ficha_del_empleado.sql'));
await db.exec(leer('modules/datos/sql/0019_documentos_del_empleado.sql'));
await db.exec(leer('modules/datos/sql/0019_documentos_del_empleado.sql'));
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
let r = await db.query(`select public from storage.buckets where id = 'empleados-docs'`);
ok('cubo privado, idempotente', r.rows.length === 1 && r.rows[0].public === false);
r = await db.query(`select count(*)::int n from pg_policies where tablename = 'objects' and policyname like 'empleados_docs_%'`);
ok('3 políticas en storage.objects', r.rows[0].n === 3);
r = await db.query(`select (storage.foldername('c1/e1/dni-1.jpg'))[1] f`);
ok('carpeta = negocio', r.rows[0].f === 'c1');

await rol('admin');
await db.query(`select empleado_doc_guardar('c1', 'e1', 'dni', 'c1/e1/dni-1.jpg')`);
await db.query(`select empleado_doc_guardar('c1', 'e1', 'cv', 'c1/e1/cv-1.pdf')`);
r = await db.query(`select empleado_fichas_leer('c1') v`);
ok('admin guarda y lee las rutas', r.rows[0].v.e1.dni_foto === 'c1/e1/dni-1.jpg' && r.rows[0].v.e1.cv === 'c1/e1/cv-1.pdf', JSON.stringify(r.rows[0].v));
ok('ruta de otra carpeta no', /no es de este empleado/.test(await err(() => db.query(`select empleado_doc_guardar('c1', 'e1', 'dni', 'c2/x1/dni.jpg')`))));
ok('tipo raro no', /no válido/.test(await err(() => db.query(`select empleado_doc_guardar('c1', 'e1', 'foto', 'c1/e1/a.jpg')`))));
await db.query(`select empleado_doc_guardar('c1', 'e1', 'dni', '')`);
r = await db.query(`select empleado_fichas_leer('c1') v`);
ok('quitar deja vacío', r.rows[0].v.e1.dni_foto === '' && r.rows[0].v.e1.cv === 'c1/e1/cv-1.pdf');
await rol('empleado');
ok('el barbero no', /dueño o el administrador/.test(await err(() => db.query(`select empleado_doc_guardar('c1', 'e1', 'cv', '')`))));
r = await db.query(`select empleado_fichas_leer('c1') v`);
ok('el barbero no ve rutas', JSON.stringify(r.rows[0].v) === '{}');
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
