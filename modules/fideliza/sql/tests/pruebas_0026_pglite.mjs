/**
 * Prueba de modules/fideliza/sql/0026_resena_y_nota.sql (PGlite, tablas y permisos simulados).
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0026_pglite.mjs . && node pruebas_0026_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const sql = readFileSync(`${repo}/modules/fideliza/sql/0026_resena_y_nota.sql`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };
const err = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
await db.exec(`create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.loyalty_settings (company_id text primary key, slug text unique, display_name text);
insert into public.loyalty_settings values ('c1', 'don-lucho', 'Don Lucho'), ('c2', 'otro', 'Otro');
create table public.loyalty_members (id uuid primary key, company_id text, status text default 'active', alias text,
  parent_member_id uuid, last_op_at timestamptz, unique (company_id, id));
create table public.loyalty_transactions (company_id text, member_id uuid, kind text, created_at timestamptz);
create table public.loyalty_contacts (member_id uuid, kind text, value text);
create table public.loyalty_push_subscriptions (member_id uuid, revoked_at timestamptz);
create table public.consentidos (member_id uuid);
create table public.auditoria (accion text);
create function public.loyalty_consents_now(p uuid, c text) returns boolean language sql stable as $$ select exists (select 1 from public.consentidos where member_id = p) $$;
create function public.loyalty_require(p_company text, p_perm text, p_location uuid default null) returns text language plpgsql as $$ begin
  if p_company <> 'c1' then raise exception 'loyalty:forbidden'; end if;
  if current_setting('t.rol', true) = 'owner' then return 'owner'; end if;
  if current_setting('t.rol', true) = 'cashier' and p_perm in ('members.read', 'program.read') then return 'cashier'; end if;
  raise exception 'loyalty:forbidden'; end $$;
create function public.loyalty_err(c text) returns void language plpgsql as $$ begin raise exception 'loyalty:%', c; end $$;
create function public.loyalty_audit(a text, b text, c text, d text, e jsonb) returns void language sql as $$ insert into public.auditoria values (b) $$;
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create function public.loyalty_persona(p_company text, p_member uuid) returns uuid language sql stable as $$
  select coalesce(m.parent_member_id, m.id) from public.loyalty_members m where m.company_id = p_company and m.id = p_member $$;`);
await db.exec(sql); await db.exec(sql);
const rol = (r) => db.exec(`select set_config('t.rol', '${r}', false)`);
const guardar = (d) => db.query(`select loyalty_resena_guardar('c1', $1::jsonb) v`, [JSON.stringify(d)]);
const base = { activo: true, visita: 1, titulo: '¿Qué tal tu corte?', texto: 'Déjanos tu reseña en Google.', url: 'https://search.google.com/local/writereview?placeid=ChIJ123' };
await rol('owner');

// ── Guardar ──
ok('visita 3 no', /invalid_settings/.test(await err(() => guardar({ ...base, visita: 3 }))));
ok('sin título no', /invalid_settings/.test(await err(() => guardar({ ...base, titulo: ' ' }))));
ok('enlace que no es de Google no', /invalid_url/.test(await err(() => guardar({ ...base, url: 'https://estafa.com/review' }))));
for (const u of ['https://google.evil.io/x', 'https://google.com.evil.io/x', 'http://g.page/r/x', 'https://notgoogle.com/x']) {
  ok(`dominio falso ${u} no`, /invalid_url/.test(await err(() => guardar({ ...base, url: u }))));
}
ok('prendido sin enlace no', /invalid_url/.test(await err(() => guardar({ ...base, url: '' }))));
ok('en la tarjeta sin enlace no', /invalid_url/.test(await err(() => guardar({ ...base, activo: false, en_tarjeta: true, url: '' }))));
ok('apagado y sin enlace sí', (await guardar({ ...base, activo: false, url: '' })).rows[0].v.activo === false);
for (const u of ['https://g.page/r/CQx/review', 'https://maps.app.goo.gl/abc', 'https://www.google.com.pe/search?q=x']) {
  ok(`enlace válido ${u}`, (await guardar({ ...base, url: u })).rows[0].v.url === u);
}
let r = await guardar(base);
const desde1 = r.rows[0].v.desde;
ok('al prender guarda desde', Boolean(desde1) && !Number.isNaN(Date.parse(desde1)));
r = await guardar({ ...base, texto: 'Otro texto' });
ok('re-guardar prendido conserva desde', r.rows[0].v.desde === desde1 && r.rows[0].v.texto === 'Otro texto');
ok('otro negocio no', /forbidden/.test(await err(() => db.query(`select loyalty_resena_guardar('c2', $1::jsonb)`, [JSON.stringify(base)]))));
await rol('cashier');
ok('el cajero no lo cambia', /forbidden/.test(await err(() => guardar(base))));
ok('el cajero sí lo lee', (await db.query(`select loyalty_resena_leer('c1') v`)).rows[0].v.config.activo === true);
await rol('owner');

// ── El cron ──
// Se prendió hace 5 días (para tener visitas «después»).
await db.exec(`update loyalty_settings set resena = jsonb_set(resena, '{desde}', to_jsonb((now() - interval '5 days')::text)) where company_id = 'c1'`);
const id = (n) => `00000000-0000-0000-0000-00000000000${n}`;
await db.exec(`
insert into loyalty_members (id, company_id, alias, parent_member_id, last_op_at) values
  ('${id(1)}', 'c1', 'Ana (ayer, correo)', null, now() - interval '1 day'),
  ('${id(2)}', 'c1', 'Beto (hoy)', null, now()),
  ('${id(3)}', 'c1', 'Caro (antes de prender)', null, now() - interval '2 days'),
  ('${id(4)}', 'c1', 'Dani (sin canal)', null, now() - interval '1 day'),
  ('${id(5)}', 'c1', 'Eva (persona)', null, now() - interval '1 day'),
  ('${id(6)}', 'c1', 'Eva (línea)', '${id(5)}', now() - interval '1 day'),
  ('${id(7)}', 'c1', 'Fer (push)', null, now() - interval '2 days');
insert into loyalty_transactions values
  ('c1', '${id(1)}', 'purchase', now() - interval '1 day'),
  ('c1', '${id(2)}', 'purchase', now()),
  ('c1', '${id(3)}', 'purchase', now() - interval '20 days'), ('c1', '${id(3)}', 'purchase', now() - interval '2 days'),
  ('c1', '${id(4)}', 'purchase', now() - interval '1 day'),
  ('c1', '${id(6)}', 'visit', now() - interval '1 day'),
  ('c1', '${id(7)}', 'visit', now() - interval '2 days'), ('c1', '${id(7)}', 'refund', now() - interval '2 days');
insert into loyalty_contacts values ('${id(1)}', 'email', 'ana@correo.pe'), ('${id(4)}', 'phone', '+51987654321'), ('${id(5)}', 'email', 'eva@correo.pe');
insert into loyalty_push_subscriptions values ('${id(7)}', null);
insert into consentidos values ('${id(7)}');`);
// «Ayer» tiene que ser antes de hoy en Lima: si la prueba corre justo después de medianoche, se corre un día.
r = await db.query(`select loyalty_srv_resenas_hoy() v`);
const lista = r.rows[0].v;
const quien = lista.map((x) => x.member_id).sort();
ok('a quién le toca', JSON.stringify(quien) === JSON.stringify([id(1), id(5), id(7)].sort()), JSON.stringify(lista.map((x) => x.member_id)));
const ana = lista.find((x) => x.member_id === id(1));
ok('lleva el correo, el negocio y el enlace', ana?.email === 'ana@correo.pe' && ana?.negocio === 'Don Lucho' && ana?.url === base.url && ana?.push === false);
ok('la línea cuenta para su persona', lista.some((x) => x.member_id === id(5) && x.email === 'eva@correo.pe'));
ok('con avisos aceptados, sin correo', lista.some((x) => x.member_id === id(7) && x.push === true && x.email === null));
r = await db.query(`select loyalty_srv_resenas_hoy() v`);
ok('una sola vez por cliente', r.rows[0].v.length === 0);
r = await db.query(`select loyalty_resena_leer('c1') v`);
ok('cuenta los pedidos', r.rows[0].v.enviados === 3 && r.rows[0].v.enviados_30 === 3);

// 2.ª visita: Caro hizo su 2.ª hace 2 días (después de prender).
await guardar({ ...base, visita: 2 });
await db.exec(`insert into loyalty_contacts values ('${id(3)}', 'email', 'caro@correo.pe')`);
r = await db.query(`select loyalty_srv_resenas_hoy() v`);
ok('con la 2.ª visita le toca a Caro', r.rows[0].v.length === 1 && r.rows[0].v[0].member_id === id(3));
await guardar({ ...base, activo: false });
await db.exec(`insert into loyalty_members (id, company_id, last_op_at) values ('${id(8)}', 'c1', now() - interval '1 day');
  insert into loyalty_transactions values ('c1', '${id(8)}', 'purchase', now() - interval '1 day');
  insert into loyalty_contacts values ('${id(8)}', 'email', 'g@correo.pe');`);
r = await db.query(`select loyalty_srv_resenas_hoy() v`);
ok('apagado no sale nada', r.rows[0].v.length === 0);
r = await guardar({ ...base, activo: true });
ok('volver a prender empieza a contar de nuevo', Date.parse(r.rows[0].v.desde) > Date.now() - 60_000);
r = await db.query(`select loyalty_srv_resenas_hoy() v`);
ok('y no escribe a los de antes', r.rows[0].v.length === 0);

// ── La tarjeta ──
r = await db.query(`select loyalty_srv_resena_tarjeta('don-lucho') v`);
ok('sin «en la tarjeta», no hay botón', r.rows[0].v === null);
await guardar({ ...base, en_tarjeta: true });
r = await db.query(`select loyalty_srv_resena_tarjeta('don-lucho') v`);
ok('con «en la tarjeta», el enlace', r.rows[0].v === base.url);
await guardar({ ...base, activo: false, en_tarjeta: true });
r = await db.query(`select loyalty_srv_resena_tarjeta('don-lucho') v`);
ok('el botón va aunque el aviso esté apagado', r.rows[0].v === base.url);
r = await db.query(`select loyalty_srv_resena_tarjeta('otro') v`);
ok('otro negocio sin configurar: nada', r.rows[0].v === null);

// ── La nota ──
r = await db.query(`select loyalty_member_nota_set('c1', '${id(6)}', '  Degradado bajo, con barba  ') v`);
ok('guarda la nota en la persona', r.rows[0].v.nota === 'Degradado bajo, con barba');
r = await db.query(`select loyalty_member_nota_get('c1', '${id(5)}') v`);
ok('se lee desde la persona', r.rows[0].v === 'Degradado bajo, con barba');
ok('más de 280 no', /invalid_settings/.test(await err(() => db.query(`select loyalty_member_nota_set('c1', '${id(5)}', repeat('x', 281))`))));
await rol('cashier');
ok('el cajero la lee', (await db.query(`select loyalty_member_nota_get('c1', '${id(5)}') v`)).rows[0].v === 'Degradado bajo, con barba');
ok('el cajero no la cambia', /forbidden/.test(await err(() => db.query(`select loyalty_member_nota_set('c1', '${id(5)}', 'x')`))));
await rol('owner');
await db.query(`select loyalty_member_nota_set('c1', '${id(5)}', '')`);
ok('vacía la borra', (await db.query(`select loyalty_member_nota_get('c1', '${id(5)}') v`)).rows[0].v === null);
ok('cliente que no existe', /not_found/.test(await err(() => db.query(`select loyalty_member_nota_get('c1', '${id(9)}')`))));
console.log(fallos ? `${fallos} FALLOS` : 'todo ok');
