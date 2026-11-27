/**
 * Prueba de modules/lector/sql/0004_por_aprobar_y_efectivo.sql (con la 0001, 0002 y 0003) contra un
 * Postgres de verdad (PGlite). v2_comprobante_aplicar es el de verdad (tu-pagina 0021).
 *
 *   node modules/lector/sql/tests/pruebas_0004_pglite.mjs <repo>   (con @electric-sql/pglite instalado)
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8').replace(/notify pgrst[^;]*;/g, '');
const f0021 = leer('modules/tu-pagina/sql/0021_adelanto_de_citas.sql');
const ini = f0021.indexOf('create or replace function public.v2_comprobante_aplicar');
const aplicar = f0021.slice(ini, f0021.indexOf('end $$;', ini) + 'end $$;'.length);

const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const espera = async (n, f, patron) => {
  try { await f(); console.log('MAL  (no lanzó)', n); fallos++; }
  catch (e) { const b = patron.test(e.message); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', n, '→', e.message); }
};
const uno = async (s, p) => (await q(s, p)).rows[0];

await ex(`
create role anon; create role authenticated;
create schema auth; create function auth.uid() returns uuid language sql as $$ select '11111111-1111-1111-1111-111111111111'::uuid $$;
create schema cron; create table cron.job (jobname text);
create function cron.schedule(a text, b text, c text) returns int language sql as $$ insert into cron.job values (a); select 1 $$;
create function cron.unschedule(a text) returns boolean language sql as $$ delete from cron.job where jobname = a; select true $$;
create table public.companies (id text primary key, name text);
insert into companies values ('neg', 'Barbería Uno');
-- El rol y la ficha de quien llama, por prueba.
create function public.rol_en(p text) returns text language sql as $$ select coalesce(nullif(current_setting('t.rol', true), ''), 'dueno') $$;
create function public.v2_empleado_puede_cobrar(p text) returns text language sql as $$ select coalesce(current_setting('t.ficha', true), '') $$;
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create function public.v2_es_cancha(c text, i text) returns boolean language sql as $$ select false $$;
create table avisos (n serial, company text, tipo text, ref text, datos jsonb);
create function public.avisos_apuntar(p_company text, p_tipo text, p_ref text, p_datos jsonb,
    p_fila_creada timestamptz default now(), p_retraso interval default interval '0') returns void language sql as $$
    insert into avisos (company, tipo, ref, datos) values (p_company, p_tipo, p_ref, p_datos) $$;
create table leads (id text, company_id text, name text, phone text);
create table appointments (id text primary key, company_id text, lead_id text, service text, slot_start text, slot_end text,
  slot_minutes int, employee_id text, status text, created_at bigint, pagado_por text default '', metodo_pago text default '',
  beneficiario text default '', sede text not null default '');
create table appointment_services (id text primary key, appointment_id text, price double precision);
create table pending_payments (id text primary key, lead_id text, company_id text, amount numeric, voucher_path text, operation_id text,
  image_hash text, verified int, order_id text, appointment_id text, created_at bigint default extract(epoch from now())::bigint);
create table comprobantes_web (id uuid primary key default gen_random_uuid(), company_id text, appointment_id text, lead_id text,
  url text default '', image_hash text default '', estado text, revisado_por text default '', revisado_at timestamptz, monto numeric,
  motivo text default '', cotejo text default '', cotejado_at timestamptz, creado_at timestamptz default now(),
  fecha_pago text not null default '', codigo_seguridad text not null default '');
create table tu_pagina (company_id text, slug text, publicada boolean, secciones jsonb);
insert into tu_pagina values ('neg', 'uno', true, '{"citas":{"sedes":[{"nombre":"Centro"},{"nombre":"Norte"}]}}');
create table memberships (company_id text, auth_user_id text, employee_id text);
create table employees (id text, company_id text, name text);
insert into memberships values ('neg', '11111111-1111-1111-1111-111111111111', 'e1');
insert into employees values ('e1', 'neg', 'Carlos'), ('e2', 'neg', 'Pedro');
-- datos 0010, lo justo: foto subida por el servidor y no repetida.
create table comprobantes_cobro (id serial, company_id text, ref_tipo text, ref_id text, pago_id text, via text, url text,
  image_hash text, operacion text, metodo text, monto numeric, subido_por uuid);
create table cobro_ajustes (company_id text primary key, foto_pago text default 'apagada', actualizado_por uuid, actualizado_at timestamptz default now());
create table ticket_fotos (appointment_id text primary key, company_id text not null, url text not null check (url ~ '^https://res\\.cloudinary\\.com/[A-Za-z0-9_-]+/image/upload/'), hash text not null default '', subida_por text not null default '', created_at timestamptz not null default now());
create function public.v2_foto_pago_validar(p_company text, p_metodo text, p_foto jsonb) returns jsonb language plpgsql as $$
begin
    if exists (select 1 from comprobantes_cobro where company_id = p_company and image_hash = p_foto->>'hash')
       or exists (select 1 from pending_payments where company_id = p_company and image_hash = p_foto->>'hash') then
        raise exception 'Esta misma foto ya se usó para registrar otro pago.';
    end if;
    return jsonb_build_object('url', p_foto->>'url', 'hash', p_foto->>'hash', 'op', '');
end $$;
create function public.v2_foto_pago_guardar(p_company text, p_tipo text, p_ref text, p_pago text, p_via text,
    p_foto jsonb, p_metodo text, p_monto numeric) returns void language sql as $$
    insert into comprobantes_cobro (company_id, ref_tipo, ref_id, pago_id, via, url, image_hash, operacion, metodo, monto, subido_por)
    values (p_company, p_tipo, p_ref, coalesce(p_pago, ''), p_via, p_foto->>'url', p_foto->>'hash', '', p_metodo, p_monto, auth.uid()) $$;
create function public.v2_adelanto_minimo(c text, t numeric) returns numeric language sql as $$ select round(t / 2, 2) $$;
create function public.v2_canchas_cfg(c text) returns jsonb language sql as $$ select null::jsonb $$;
create function public.v2_hueco(c text, s text, m int, e text, i text) returns text language sql as $$ select null::text $$;
create function public.v2_comprobante_cita(p_slug text, p_codigo text, p_telefono text) returns public.appointments
  language sql as $$ select * from public.appointments where id = p_codigo $$;
`);
await ex(aplicar);
await ex(leer('modules/lector/sql/0001_lector_de_pagos.sql'));
await ex(leer('modules/lector/sql/0002_emparejar.sql'));
await ex(leer('modules/lector/sql/0003_el_barbero_elige.sql'));
await ex(leer('modules/lector/sql/0004_por_aprobar_y_efectivo.sql'));
await ex(leer('modules/lector/sql/0004_por_aprobar_y_efectivo.sql'));
ok('la 0004 se puede aplicar dos veces', true);

// ── Ayudas ──
const como = (rol, ficha = '') => q(`select set_config('t.rol', $1, false), set_config('t.ficha', $2, false)`, [rol, ficha]);
const lima = async (min) => (await uno(`select to_char((now() + make_interval(mins => $1::int)) at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') t`, [min])).t;
const cita = async (id, empleado, nombre, precio, sede = '') => {
  await q(`insert into leads values ($1 || '-l', 'neg', $2, '9' || $1)`, [id, nombre]);
  await q(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, created_at, sede)
           values ($1, 'neg', $1 || '-l', 'Corte', $2, $3, 30, $4, 'completed', extract(epoch from now())::bigint, $5)`,
          [id, await lima(-30), await lima(0), empleado, sede]);
  await q(`insert into appointment_services values ($1 || '-s', $1, $2)`, [id, precio]);
};
const est = (id) => uno(`select a.pagado_por, (select coalesce(sum(amount),0) from pending_payments p where p.appointment_id = a.id)::numeric pagado from appointments a where id = $1`, [id]);
const D = '22222222-2222-2222-2222-222222222222';
let h = 0;
const yape = async (centimos, nombre, minutosAtras = 0, codigo = null) => {
  await q(`select lector_srv_recibir($1, 'aviso', $2)`, [D, { huella: 'h-' + String(++h).padStart(8, '0'), centimos, nombre, origen: 'Yape', codigo, cuando: Date.now() - minutosAtras * 60_000 }]);
  return (await uno(`select max(id) id from lector_avisos`)).id;
};
const hash = (c) => { if (!/^[0-9a-f]$/.test(c)) throw new Error('huella de prueba no hex: ' + c); return c.repeat(64); };
const foto = (c) => ({ url: `https://res.cloudinary.com/x/image/upload/${c}.jpg`, hash: hash(c) });
// Lo que el servidor guarda al subir la foto.
const lectura = (c, monto, minutosAtras = 0, decision = 'aprobar', codigo = '') =>
  q(`select lector_srv_lectura('neg', $1, $2, $3, $4, $5)`, [hash(c), monto, new Date(Date.now() - minutosAtras * 60_000).toISOString(), codigo, decision]);
const para = async (c) => (await uno(`select lector_para_cobrar('neg', $1) r`, [c])).r;
const cobrar = (c, aviso, f = null) => uno(`select lector_cobrar_con('neg', $1, $2, $3::jsonb) r`, [c, aviso, f ? JSON.stringify(f) : null]);
const empleado = (c, metodo, f = null) => uno(`select empleado_cobrar_saldo('neg', $1, $2, $3::jsonb) r`, [c, metodo, f ? JSON.stringify(f) : null]);
const leerFoto = (c, monto, fecha, codigo = '', decision = 'aprobar') =>
  q(`select lector_srv_lectura('neg', $1, $2, $3, $4, $5)`, [hash(c), monto, fecha, codigo, decision]);
const iso = (minutosAtras) => new Date(Date.now() - minutosAtras * 60_000).toISOString();

// ── 1 · Sin celular de cobros: el cobro del barbero, igual que hoy (The 24/7) ──
await como('empleado', 'e1');
await cita('a1', 'e1', 'Ana Paz', 20);
await espera('efectivo sin foto: no (obligatoria de serie)', () => empleado('a1', 'cash'), /necesitas la foto/);
await empleado('a1', 'yape', foto('3'));
ok('Yape con foto, sin celular: cobrado como siempre', (await est('a1')).pagado_por === 'panel' && Number((await est('a1')).pagado) === 20);
await cita('a2', 'e1', 'Beto Ruiz', 15);
await empleado('a2', 'cash', foto('4'));
ok('efectivo con foto: cobrado', (await est('a2')).pagado_por === 'panel');
await espera('el barbero no cambia la foto del efectivo', () => q(`select cobro_efectivo_foto_guardar('neg', 'opcional')`), /Solo el dueño/);
await como('dueno');
await q(`select cobro_efectivo_foto_guardar('neg', 'opcional')`);
await como('empleado', 'e1');
ok('la ve el barbero: opcional', (await uno(`select cobro_efectivo_foto('neg') r`)).r === 'opcional');
await cita('a3', 'e1', 'Ciro Vela', 18);
await empleado('a3', 'cash');
ok('efectivo sin foto, opcional: cobrado', (await est('a3')).pagado_por === 'panel' && Number((await est('a3')).pagado) === 18);
await cita('a4', 'e1', 'Dina Rojas', 18);
await espera('Yape sin foto: nunca', () => empleado('a4', 'yape'), /necesitas la foto/);
await leerFoto('6', 10, iso(0));
ok('sin celular, la lectura de la foto no guarda nada', (await uno(`select count(*)::int n from lector_lecturas`)).n === 0);

// Conectar el celular.
await como('dueno');
await q(`select lector_codigo_nuevo('neg')`);
const cod = (await uno(`select codigo from lector_codigos`)).codigo;
await q(`select lector_srv_vincular($1, $2, $3, 'Xiaomi')`, [cod, D, 'a'.repeat(64)]);
await q(`update lector_dispositivos set vinculado_at = now() - interval '1 day'`);
ok('el servidor sabe que hay celular', (await uno(`select lector_srv_conectado('neg') r`)).r === true);

// ── 2 · Con celular: Yape/Plin solo con foto ya no; el efectivo sigue ──
await como('empleado', 'e1');
await espera('Yape solo con foto, con celular: no', () => empleado('a4', 'yape', foto('5')), /elige el Yape que llegó/);
await empleado('a4', 'cash');
ok('el efectivo sigue igual', (await est('a4')).pagado_por === 'panel');

// ── 3 · Yape de más: por aprobar, no se cobra ──
await cita('m1', 'e1', 'Juan Pérez', 30);
const y50 = await yape(5000, 'LUIS SOTO', 1);
await leerFoto('7', 50, iso(1));
let r = (await cobrar('m1', y50, foto('7'))).r;
ok('S/ 50 para S/ 30: queda por aprobar', r.resultado === 'por_aprobar' && Number(r.sobra) === 20 && (await est('m1')).pagado_por === '', JSON.stringify(r));
ok('el Yape queda apartado', (await uno(`select asignado from lector_avisos where id = $1`, [y50])).asignado === 'propuesto');
await cita('m2', 'e1', 'Otro Más', 50);
ok('ningún otro barbero lo ve', !(await para('m2')).yapes.some((y) => y.id === y50));
await yape(1234, 'ALGUIEN', 0); // llega otro Yape: se empareja lo libre, el apartado no
ok('y no se empareja solo', (await uno(`select asignado from lector_avisos where id = $1`, [y50])).asignado === 'propuesto');
await espera('el barbero no aprueba', () => q(`select lector_aprobar_propuesta('neg', $1, true)`, [y50]), /Solo el dueño/);
await como('dueno');
const pr = (await uno(`select lector_propuestas('neg') r`)).r;
ok('el dueño lo ve: quién, de qué cita, cuánto sobra, la foto', pr.length === 1 && pr[0].quien === 'Carlos' && pr[0].cita_id === 'm1'
   && Number(pr[0].sobra) === 20 && /cloudinary/.test(pr[0].foto_url ?? ''), JSON.stringify(pr));
r = (await uno(`select lector_aprobar_propuesta('neg', $1, true) r`, [y50])).r;
let e = await est('m1');
ok('aprobado: cobrados S/ 30 y S/ 20 de más a la vista', e.pagado_por === 'lector' && Number(e.pagado) === 30 && Number(r.sobra) === 20, JSON.stringify([e, r]));
const av = await uno(`select asignado, motivo, cita_id, elegido_por, foto_ok from lector_avisos where id = $1`, [y50]);
ok('queda como elegido por el barbero', av.asignado === 'equipo' && av.motivo === 'barbero' && av.cita_id === 'm1' && !!av.elegido_por && av.foto_ok === 'si', JSON.stringify(av));
ok('y la foto en la caja', (await uno(`select count(*)::int n from comprobantes_cobro where image_hash = $1`, [hash('7')])).n === 1);

// Rechazar: el Yape vuelve a estar libre, pero ya no para esa cita.
await q(`select lector_ajustes_guardar('neg', 15, 5, 'opcional')`);
await como('empleado', 'e1');
await cita('m3', 'e1', 'Pía Luna', 30);
const y40 = await yape(4000, 'PIA LUNA', 1);
r = (await cobrar('m3', y40)).r;
ok('sin foto (opcional) y de más: por aprobar', r.resultado === 'por_aprobar' && r.foto === 'sin_foto', JSON.stringify(r));
await como('dueno');
await q(`select lector_aprobar_propuesta('neg', $1, false)`, [y40]);
const libre = await uno(`select asignado, descartes from lector_avisos where id = $1`, [y40]);
ok('rechazado: libre y descartado para esa cita', libre.asignado === '' && libre.descartes.includes('m3'));
await espera('aprobar después de rechazar: no', () => q(`select lector_aprobar_propuesta('neg', $1, true)`, [y40]), /ya no está esperando/);

// ── 4 · La foto comprobada necesita monto Y (hora o código) ──
await como('empleado', 'e1');
await cita('f1', 'e1', 'Eva Mar', 12);
const y12 = await yape(1200, 'EVA MAR', 1);
await leerFoto('f', 12, '');
r = (await cobrar('f1', y12, foto('f'))).r;
ok('solo el monto, sin hora ni código: «sin leer»', r.foto === 'sin_leer' && (await est('f1')).pagado_por === 'lector', JSON.stringify(r));
await cita('f2', 'e1', 'Gael Rey', 13);
const y13 = await yape(1300, 'GAEL REY', 1, '555');
await leerFoto('8', 13, '', '555');
r = (await cobrar('f2', y13, foto('8'))).r;
ok('monto + el mismo código, sin hora: comprobada', r.foto === 'si', JSON.stringify(r));

// ── 5 · «No llegó el Yape»: por aprobar con la foto ──
await cita('n1', 'e1', 'Hugo Vaca', 27);
await espera('sin foto: no', () => q(`select lector_dejar_por_aprobar('neg', 'n1', null)`), /Toma la foto/);
await q(`select lector_dejar_por_aprobar('neg', 'n1', $1::jsonb)`, [JSON.stringify(foto('9'))]);
ok('queda por cobrar, con la foto en la cita', (await est('n1')).pagado_por === '' && (await uno(`select count(*)::int n from ticket_fotos where appointment_id = 'n1'`)).n === 1);
await yape(2700, 'HUGO VACA', 0);
ok('llega su Yape: se cobra solo con esa foto', (await est('n1')).pagado_por === 'lector'
   && (await uno(`select motivo from lector_avisos where cita_id = 'n1'`)).motivo === 'foto');
await cita('n2', 'e1', 'Iris Gil', 33);
await q(`select lector_dejar_por_aprobar('neg', 'n2', $1::jsonb)`, [JSON.stringify(foto('0'))]);
await espera('el barbero no aprueba el sin-Yape', () => q(`select lector_aprobar_sin_yape('neg', 'n2', 'yape')`), /Solo el dueño/);
await como('dueno');
const esp = (await uno(`select lector_esperando('neg', (now() at time zone 'America/Lima')::date) r`)).r;
ok('el dueño lo ve en «Esperando su Yape»', esp.some((x) => x.cita_id === 'n2' && x.tipo === 'ticket'), JSON.stringify(esp.map((x) => x.cita_id)));
await q(`select lector_aprobar_sin_yape('neg', 'n2', 'yape')`);
e = await est('n2');
ok('aprobado: cobrado', e.pagado_por === 'panel' && Number(e.pagado) === 33, JSON.stringify(e));
await espera('aprobar otra vez: no', () => q(`select lector_aprobar_sin_yape('neg', 'n2', 'yape')`), /ya está cobrada/);

// ── 6 · Permisos ──
const pf = await uno(`select has_function_privilege('authenticated', 'lector_srv_conectado(text)', 'execute') a,
                             has_function_privilege('anon', 'lector_aprobar_propuesta(text, bigint, boolean)', 'execute') b,
                             has_function_privilege('authenticated', 'lector_aplicar_equipo(text, appointments, lector_avisos, jsonb, text, uuid)', 'execute') c`);
ok('lo del servidor y lo interno no son para el panel', !pf.a && !pf.b && !pf.c);

// ── 7 · Deshacer la 0004: el cobro del barbero vuelve al de datos 0012 ──
await ex(leer('modules/lector/sql/0004_por_aprobar_y_efectivo_deshacer.sql'));
await como('empleado', 'e1');
await cita('d1', 'e1', 'Juan Uno', 10);
await espera('deshecha: el efectivo vuelve a pedir foto', () => empleado('d1', 'cash'), /necesitas la foto/);
await empleado('d1', 'yape', foto('d'));
ok('deshecha: el cobro con foto funciona como en la 0012', (await est('d1')).pagado_por === 'panel');
ok('y sin rastro de la 0004', (await uno(`select to_regprocedure('public.lector_propuestas(text)') is null a`)).a);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);

