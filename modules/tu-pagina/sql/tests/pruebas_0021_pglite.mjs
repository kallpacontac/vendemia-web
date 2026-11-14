/**
 * Prueba de modules/tu-pagina/sql/0021_adelanto_de_citas.sql y 0022_tarjeta_al_reservar.sql contra un Postgres de verdad (PGlite),
 * con tablas mínimas. Lo que no es de la 0021 (v2_hueco, v2_cancha_motivo, loyalty_srv_check…),
 * simulado; v2_canchas_cfg es la real de la 0011.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/tu-pagina/sql/tests/pruebas_0021_pglite.mjs . && node pruebas_0021_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const s0011 = leer('modules/tu-pagina/sql/0011_canchas_y_avisame.sql');
const canchasCfg = s0011.match(/create or replace function public\.v2_canchas_cfg[\s\S]*?\$\$;/)[0];
const s0021 = leer('modules/tu-pagina/sql/0021_adelanto_de_citas.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const deshacer = leer('scripts/adelanto-citas-0021-deshacer.sql');
const s0022 = leer('modules/tu-pagina/sql/0022_tarjeta_al_reservar.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const s0023 = leer('modules/tu-pagina/sql/0023_sede_de_la_cita.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const s0024 = leer('modules/tu-pagina/sql/0024_plazo_de_cita_apartada.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const s0025 = leer('modules/tu-pagina/sql/0025_aforo_por_sede.sql').replace(/-- Comprobación:[\s\S]*$/, '');
const sumarMin = leer('modules/tu-pagina/sql/0002_tienda_y_reservas.sql').match(/create or replace function public\.tu_pagina_sumar_min[\s\S]*?\$\$;/)[0];
const ocupaHora = leer('modules/datos/sql/0004_agenda_en_nube.sql').match(/create or replace function public\.v2_ocupa_hora[\s\S]*?\$\$;/)[0];
const normTel = leer('modules/fideliza/sql/0003_operaciones.sql').match(/create or replace function public\.loyalty_norm_phone[\s\S]*?end \$\$;/)[0];

const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, extra); };
const uno = async (s, p) => (await q(s, p)).rows[0];

await ex(`
create role anon; create role authenticated;
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
-- La de modules/datos/sql/0004: solo cifras, con 51 delante si es un celular de 9.
create function public.v2_telefono(p text) returns text language sql immutable as $$
  select case when d ~ '^9\\d{8}$' then '51' || d else d end from (select regexp_replace(coalesce(p, ''), '\\D', '', 'g') as d) x $$;
create function public.v2_autorizar_agenda(p text, p_empleado_vale boolean default false) returns text language sql as $$ select 'owner' $$;
create function public.v2_cancha_motivo(p text, i text, ini text, m integer, ex text default '') returns text language sql stable as $$ select null::text $$;
-- El aforo: lleno si t.lleno = 'si'. Guarda con qué se llamó para comprobar que no se cuenta a sí misma.
create function public.v2_hueco(p_company text, p_inicio text, p_minutos integer, p_empleado text, p_excepto text default '')
returns text language plpgsql as $$
begin
  perform set_config('t.excepto', p_excepto, false);
  return case when coalesce(current_setting('t.lleno', true), '') = 'si' then 'a esa hora ya no hay sitio' end;
end $$;

create table companies (id text primary key, payment_methods text);
create table tu_pagina (company_id text, slug text, publicada boolean, secciones jsonb);
create table catalog (id text primary key, company_id text, tipo text);
create table leads (id text primary key, company_id text, name text, phone text);
create table pagina_idem (company_id text, codigo text, ref_id text);
create table appointments (id text primary key, company_id text, lead_id text, status text, pagado_por text,
  employee_id text, slot_start text, slot_minutes integer, metodo_pago text, created_at bigint, service text);
create table appointment_services (id text primary key, appointment_id text, catalog_item_id text, price numeric);
create table pending_payments (id text primary key, lead_id text, company_id text, amount numeric, voucher_path text,
  operation_id text, image_hash text, verified integer, order_id text, appointment_id text);
create table comprobantes_web (id uuid default gen_random_uuid(), company_id text, appointment_id text, lead_id text, codigo text, url text,
  image_hash text, estado text, motivo text default '', monto numeric, metodo text default '', operacion text default '', creado_at timestamptz default now());

insert into companies values ('barber', '[{"type":"yape","number":"51914440860","name":""}]'), ('cancha', '[]'), ('nada', '[]');
insert into tu_pagina values
  ('barber', 'barber', true, '{"reservar":true,"citas":{"adelanto":50,"comprobante":"pagina"}}'),
  ('cancha', 'cancha', true, '{"reservar":true,"canchas":{"activo":true,"adelanto":"40","comprobante":"pagina"},"citas":{"adelanto":50}}'),
  ('nada',   'nada',   true, '{"reservar":true}');
insert into catalog values ('corte', 'barber', ''), ('c1', 'cancha', '');
insert into leads values ('l1', 'barber', 'Pedro', '51999111222'), ('l2', 'cancha', 'Luis', '51999333444'), ('l3', 'nada', 'Ana', '51999555666');
insert into appointments values
  ('a1', 'barber', 'l1', 'pending_payment', '', '', '2026-11-20 10:00', 30, '', 0, 'Corte clásico'),
  ('a2', 'barber', 'l1', 'pending_payment', '', '', '2026-11-20 11:00', 30, '', 0, 'Corte clásico'),
  ('a3', 'cancha', 'l2', 'pending_payment', '', '', '2026-11-20 20:00', 60, '', 0, 'Cancha'),
  ('a4', 'nada',   'l3', 'pending_payment', '', '', '2026-11-20 20:00', 60, '', 0, 'Algo');
insert into appointment_services values ('s1', 'a1', 'corte', 25), ('s2', 'a2', 'corte', 25), ('s3', 'a3', 'c1', 90), ('s4', 'a4', 'x', 30);
insert into pagina_idem values ('barber', 'R-AAAA', 'a1'), ('barber', 'R-BBBB', 'a2'), ('cancha', 'R-CCCC', 'a3'), ('nada', 'R-DDDD', 'a4');
insert into comprobantes_web (company_id, appointment_id, lead_id, codigo, url, image_hash, estado) values ('barber', 'a2', 'l1', 'R-BBBB', 'https://x/y.jpg', 'h', 'revisar');
`);
await ex(canchasCfg);
await ex(s0021);

// 1 · Configuración
ok('citas: hay config en barber', (await uno(`select public.v2_citas_cfg('barber') is not null as v`)).v);
ok('citas: en canchas manda canchas (null)', (await uno(`select public.v2_citas_cfg('cancha') is null as v`)).v);
ok('citas: sin adelanto, null', (await uno(`select public.v2_citas_cfg('nada') is null as v`)).v);
await ex(`update tu_pagina set secciones = '{"reservar":false,"citas":{"adelanto":50}}' where company_id = 'nada'`);
ok('citas: sin reservar, null', (await uno(`select public.v2_citas_cfg('nada') is null as v`)).v);
await ex(`update tu_pagina set secciones = '{"reservar":true,"citas":{"adelanto":150}}' where company_id = 'nada'`);
ok('citas: 150 % no vale', (await uno(`select public.v2_citas_cfg('nada') is null as v`)).v);
await ex(`update tu_pagina set secciones = '{"reservar":true}' where company_id = 'nada'`);

// 2 · Mínimo
ok('mínimo: 50 % de S/ 25 = 12.50', Number((await uno(`select public.v2_adelanto_minimo('barber', 25) as v`)).v) === 12.5);
ok('mínimo: cancha fija S/ 40 de 90', Number((await uno(`select public.v2_adelanto_minimo('cancha', 90) as v`)).v) === 40);
ok('mínimo: cancha fija, total menor manda', Number((await uno(`select public.v2_adelanto_minimo('cancha', 30) as v`)).v) === 30);
ok('mínimo: sin nada, 0', Number((await uno(`select public.v2_adelanto_minimo('nada', 30) as v`)).v) === 0);

// 3 · Buscar por código y celular
const b1 = (await uno(`select public.comprobante_srv_buscar('barber', 'r-aaaa', '999 111 222') as v`)).v;
ok('buscar cita: ok, validación manual, número de Yape', b1.status === 'ok' && b1.validacion === 'manual' && b1.numeros[0] === '51914440860', JSON.stringify(b1));
const b2 = (await uno(`select public.comprobante_srv_buscar('barber', 'R-AAAA', '999000000') as v`)).v;
ok('buscar cita: otro celular = no existe', b2.status === 'not_found');
const b3 = (await uno(`select public.comprobante_srv_buscar('cancha', 'R-CCCC', '999333444') as v`)).v;
ok('buscar cancha: sigue automática por defecto', b3.status === 'ok' && b3.validacion === 'automatica', JSON.stringify(b3));
const b4 = (await uno(`select public.comprobante_srv_buscar('nada', 'R-DDDD', '999555666') as v`)).v;
ok('buscar en negocio sin adelanto ni canchas: no existe', b4.status === 'not_found');
await ex(`update tu_pagina set secciones = jsonb_set(secciones, '{citas,validacion}', '"automatica"') where company_id = 'barber'`);
ok('buscar cita: validación automática si se pide', (await uno(`select public.comprobante_srv_buscar('barber', 'R-AAAA', '999111222') as v`)).v.validacion === 'automatica');
await ex(`update tu_pagina set secciones = secciones #- '{citas,validacion}' where company_id = 'barber'`);

// 4 · Aplicar un pago
const cita = async (id) => (await uno(`select * from appointments where id = $1`, [id]));
const aplicar = async (id, monto) => (await uno(
  `select public.v2_comprobante_aplicar(a, $2::numeric, 'yape', '', 'h-' || $1 || '-' || $3, '', 'panel') as v from appointments a where a.id = $1`, [id, monto, String(Math.random())])).v;
let r = await aplicar('a1', 10);
ok('S/ 10 de 12.50: parcial, sigue apartada', r.resultado === 'parcial' && Number(r.minimo) === 12.5 && (await cita('a1')).status === 'pending_payment', JSON.stringify(r));
await ex(`set t.lleno = 'si'`);
r = await aplicar('a1', 5);
ok('llega al adelanto pero no hay sitio: sin_sitio y no registra', r.resultado === 'sin_sitio'
  && Number((await uno(`select count(*) as n from pending_payments where appointment_id = 'a1'`)).n) === 1, JSON.stringify(r));
await ex(`set t.lleno = ''`);
r = await aplicar('a1', 5);
ok('llega al adelanto: confirmada, faltan S/ 10', r.resultado === 'confirmada' && Number(r.falta) === 10 && (await cita('a1')).status === 'confirmed', JSON.stringify(r));
ok('v2_hueco no cuenta a la propia cita', (await uno(`select current_setting('t.excepto', true) as v`)).v === 'a1');
r = await aplicar('a1', 10);
ok('el resto: cobrada', r.resultado === 'cobrada' && (await cita('a1')).pagado_por === 'panel', JSON.stringify(r));
r = await aplicar('a3', 40);
ok('cancha: con S/ 40 se confirma (como antes)', r.resultado === 'confirmada' && Number(r.minimo) === 40, JSON.stringify(r));

// 5 · Panel
const panel = (await uno(`select public.comprobantes_panel('barber') as v`)).v;
ok('panel: trae adelanto y apartada', panel.length === 1 && Number(panel[0].adelanto) === 12.5 && panel[0].apartada === true && Number(panel[0].total) === 25, JSON.stringify(panel));

// 6 · 0022: ¿ya tiene tarjeta? (solo con código + celular de la reserva)
await ex(`
create function public.loyalty_err(c text) returns void language plpgsql as $$ begin raise exception '%', c; end $$;
create table loyalty_settings (company_id text, slug text);
create table loyalty_members (company_id text, id uuid, status text);
create table loyalty_contacts (company_id text, member_id uuid, kind text, value text);
insert into loyalty_settings values ('barber', 'club-barber');
insert into loyalty_members values ('barber', '00000000-0000-4000-8000-0000000000aa', 'active');
update tu_pagina set secciones = secciones || '{"fideliza":{"activo":true,"slug":"club-barber"}}' where company_id = 'barber';
`);
await ex(normTel);
await ex(s0022);
const tiene = async (cod, tel) => (await uno(`select public.tu_pagina_srv_tiene_tarjeta('barber', $1, $2) as v`, [cod, tel])).v;
let t = await tiene('R-BBBB', '999 111 222');
ok('0022: sin tarjeta con ese celular → tiene false', t.status === 'ok' && t.club === true && t.tiene === false, JSON.stringify(t));
await ex(`insert into loyalty_contacts values ('barber', '00000000-0000-4000-8000-0000000000aa', 'phone', '+51999111222')`);
t = await tiene('R-BBBB', '+51 999 111 222');
ok('0022: con tarjeta → tiene true', t.tiene === true, JSON.stringify(t));
t = await tiene('R-BBBB', '999000000');
ok('0022: otro celular → not_found (no sirve para espiar números)', t.status === 'not_found');
await ex(`update loyalty_members set status = 'deleted'`);
ok('0022: tarjeta borrada no cuenta', (await tiene('R-BBBB', '999111222')).tiene === false);
await ex(`update tu_pagina set secciones = jsonb_set(secciones, '{fideliza,activo}', 'false') where company_id = 'barber'`);
ok('0022: sin club en la página → club false', (await tiene('R-BBBB', '999111222')).club === false);

// 7 · 0023: la sede de la cita (solo con código + celular, solo una de las configuradas)
await ex(s0023);
await ex(`update tu_pagina set secciones = jsonb_set(secciones, '{citas,sedes}', '[{"nombre":"Huallaga 625","direccion":"Jr. Huallaga 625"},{"nombre":"Premium","direccion":"Jr. Huallaga 646"}]') where company_id = 'barber'`);
const sede = async (cod, tel, x) => (await uno(`select public.cita_srv_sede('barber', $1, $2, $3) as v`, [cod, tel, x])).v;
ok('0023: sede que no existe → sede_invalida', (await sede('R-BBBB', '999111222', 'Otra')).status === 'sede_invalida');
ok('0023: otro celular → not_found', (await sede('R-BBBB', '999000000', 'Premium')).status === 'not_found');
ok('0023: código + celular + sede válida → ok', (await sede('R-BBBB', '999 111 222', 'Premium')).status === 'ok');
ok('0023: queda guardada en la cita', (await uno(`select sede from appointments where id = 'a2'`)).sede === 'Premium');
ok('0023: no se cambia una sede ya puesta', (await sede('R-BBBB', '999111222', 'Huallaga 625')).status === 'not_found'
  && (await uno(`select sede from appointments where id = 'a2'`)).sede === 'Premium');
ok('0023: las demás citas siguen sin sede', (await uno(`select sede from appointments where id = 'a1'`)).sede === '');

// 8 · 0024: plazo para pagar (no 24 h), más corto si la cita es pronto
await ex(s0024);
await ex(`
insert into appointments values
  ('a5', 'barber', 'l1', 'pending_payment', '', '', to_char((now() + interval '60 minutes') at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI'), 30, '', 0, 'Corte clásico'),
  ('a6', 'barber', 'l1', 'pending_payment', '', '', '2030-01-01 10:00', 30, '', 0, 'Corte clásico');
insert into pagina_idem values ('barber', 'R-EEEE', 'a5'), ('barber', 'R-FFFF', 'a6');`);
const apartar = async (cod, tel) => (await uno(`select public.cita_srv_apartar('barber', $1, $2) as v`, [cod, tel])).v;
const venceEn = async (id) => Number((await uno(`select round((created_at + 86400 - extract(epoch from now())) / 60) as m from appointments where id = $1`, [id])).m);
let ap = await apartar('R-FFFF', '999111222');
ok('0024: cita lejana → 60 min', ap.status === 'ok' && ap.plazo === 60 && (await venceEn('a6')) === 60, JSON.stringify(ap));
ap = await apartar('R-EEEE', '999111222');
// La hora de la cita va al minuto: faltan 59–60 min, así que el tercio es 19 o 20.
ok('0024: cita en 1 h → ~20 min (un tercio)', ap.status === 'ok' && [19, 20].includes(ap.plazo) && Math.abs((await venceEn('a5')) - ap.plazo) <= 1, JSON.stringify(ap));
await ex(`update tu_pagina set secciones = jsonb_set(secciones, '{citas,plazo}', '30') where company_id = 'barber'`);
ok('0024: plazo configurado (30) manda en citas lejanas', (await apartar('R-FFFF', '999111222')).plazo === 30);
ok('0024: otro celular → not_found', (await apartar('R-FFFF', '999000000')).status === 'not_found');
await ex(`update appointments set status = 'confirmed' where id = 'a6'`);
ok('0024: ya confirmada → no_apartada', (await apartar('R-FFFF', '999111222')).status === 'no_apartada');

// 9 · 0025: aforo independiente por sede
await ex(`alter table companies add column if not exists slot_minutes integer default 30; alter table appointments add column if not exists slot_end text default '';`);
await ex(sumarMin); await ex(ocupaHora); await ex(s0025);
await ex(`update tu_pagina set secciones = jsonb_set(secciones, '{citas,sedes}', '[{"nombre":"Huallaga 625","direccion":"Jr. Huallaga 625","capacidad":2},{"nombre":"Premium","direccion":"Jr. Huallaga 646","capacidad":1}]') where company_id = 'barber'`);
// Tres citas a las 2030-02-01 10:00 en el mismo negocio; las dos primeras ya con sede «Huallaga 625».
await ex(`
insert into appointments values
  ('s1', 'barber', 'l1', 'confirmed', '', '', '2030-02-01 10:00', 30, '', 0, 'Corte', 'Huallaga 625'),
  ('s2', 'barber', 'l1', 'confirmed', '', '', '2030-02-01 10:00', 30, '', 0, 'Corte', 'Huallaga 625'),
  ('s3', 'barber', 'l1', 'confirmed', '', '', '2030-02-01 10:00', 30, '', 0, 'Corte', ''),
  ('s4', 'barber', 'l1', 'confirmed', '', '', '2030-02-01 10:00', 30, '', 0, 'Corte', '');
update appointments set slot_end = '' where id in ('s1','s2','s3','s4');
insert into pagina_idem values ('barber', 'R-S003', 's3'), ('barber', 'R-S004', 's4');`);
const sedeR = async (cod, x) => (await uno(`select public.cita_srv_sede('barber', $1, '999111222', $2) as v`, [cod, x])).v;
// Premium (aforo 1): s4 sin sede cuenta «ante la duda», así que s3 no cabe; s1 y s2 son de la otra sede.
let rs = await sedeR('R-S003', 'Premium');
ok('0025: Premium llena por una cita sin sede (ante la duda) → lleno y cancelada', rs.status === 'lleno' && (await uno(`select status from appointments where id = 's3'`)).status === 'cancelled', JSON.stringify(rs));
// Ahora s3 está cancelada: s4 sí cabe en Premium (las de Huallaga 625 no cuentan ahí).
rs = await sedeR('R-S004', 'Premium');
ok('0025: lo de la otra sede no quita sitio → ok', rs.status === 'ok' && (await uno(`select sede from appointments where id = 's4'`)).sede === 'Premium', JSON.stringify(rs));
// Huallaga 625 (aforo 2) ya tiene s1 y s2: una tercera allí no cabe.
await ex(`insert into appointments values ('s5', 'barber', 'l1', 'pending_payment', '', '', '2030-02-01 10:00', 30, '', extract(epoch from now())::bigint, 'Corte', '');
          update appointments set slot_end = '' where id = 's5'; insert into pagina_idem values ('barber', 'R-S005', 's5');`);
ok('0025: Huallaga 625 con 2/2 → lleno', (await sedeR('R-S005', 'Huallaga 625')).status === 'lleno');
// Una a las 10:30 (otra media hora) sí cabe en Huallaga 625.
await ex(`insert into appointments values ('s6', 'barber', 'l1', 'pending_payment', '', '', '2030-02-01 10:30', 30, '', extract(epoch from now())::bigint, 'Corte', '');
          update appointments set slot_end = '' where id = 's6'; insert into pagina_idem values ('barber', 'R-S006', 's6');`);
ok('0025: otra media hora en la misma sede → ok', (await sedeR('R-S006', 'Huallaga 625')).status === 'ok');
// Una de 60 min a las 09:30 pisa las 10:00 (llena): no cabe aunque empiece en un hueco.
await ex(`insert into appointments values ('s7', 'barber', 'l1', 'pending_payment', '', '', '2030-02-01 09:30', 60, '', extract(epoch from now())::bigint, 'Corte + barba', '');
          update appointments set slot_end = '' where id = 's7'; insert into pagina_idem values ('barber', 'R-S007', 's7');`);
ok('0025: 60 min que pisa la media hora llena → lleno', (await sedeR('R-S007', 'Huallaga 625')).status === 'lleno');
ok('0025: sede que no existe → sede_invalida', (await sedeR('R-S007', 'Otra')).status === 'sede_invalida');
// Panel: pone la sede y avisa si se pasa del aforo, sin bloquear.
const panelR = async (id, x) => (await uno(`select public.cita_sede_panel('barber', $1, $2) as v`, [id, x])).v;
await ex(`insert into appointments values ('s8', 'barber', 'l1', 'confirmed', '', '', '2030-02-01 10:00', 30, '', 0, 'Corte', ''); update appointments set slot_end = '' where id = 's8';`);
let rp = await panelR('s8', 'Premium');
ok('0025 panel: Premium 1/1 → se guarda y avisa sobre_aforo', rp.status === 'ok' && rp.sobre_aforo === true && (await uno(`select sede from appointments where id = 's8'`)).sede === 'Premium', JSON.stringify(rp));
await ex(`insert into appointments values ('s9', 'barber', 'l1', 'confirmed', '', '', '2030-02-01 12:00', 30, '', 0, 'Corte', ''); update appointments set slot_end = '' where id = 's9';`);
rp = await panelR('s9', 'Huallaga 625');
ok('0025 panel: hora libre → sin aviso', rp.status === 'ok' && rp.sobre_aforo === false, JSON.stringify(rp));

// 10 · Deshacer
await ex(deshacer);
ok('deshacer: sin v2_citas_cfg', (await uno(`select to_regprocedure('public.v2_citas_cfg(text)') is null as v`)).v);
ok('deshacer: buscar cita de barber vuelve a no existir', (await uno(`select public.comprobante_srv_buscar('barber', 'R-BBBB', '999111222') as v`)).v.status === 'not_found');
// Y otra vez la 0021 encima: idempotente.
await ex(s0021);
ok('0021 dos veces: sigue bien', Number((await uno(`select public.v2_adelanto_minimo('barber', 25) as v`)).v) === 12.5);

console.log(fallos ? `\n${fallos} PRUEBA(S) FALLARON` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
