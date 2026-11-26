/**
 * Prueba de modules/lector/sql/0003_el_barbero_elige.sql (con la 0001 y la 0002) contra un Postgres de
 * verdad (PGlite). v2_comprobante_aplicar es el de verdad (tu-pagina 0021); lo de datos 0010/0012, simulado.
 *
 *   node modules/lector/sql/tests/pruebas_0003_pglite.mjs <repo>   (con @electric-sql/pglite instalado)
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
create function public.v2_foto_pago_validar(p_company text, p_metodo text, p_foto jsonb) returns jsonb language plpgsql as $$
begin
    if exists (select 1 from comprobantes_cobro where company_id = p_company and image_hash = p_foto->>'hash') then
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
await ex(leer('modules/lector/sql/0003_el_barbero_elige.sql'));
ok('la 0003 se puede aplicar dos veces', true);

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
const hash = (c) => c.repeat(64);
const foto = (c) => ({ url: `https://res.cloudinary.com/x/${c}.jpg`, hash: hash(c) });
// Lo que el servidor guarda al subir la foto.
const lectura = (c, monto, minutosAtras = 0, decision = 'aprobar', codigo = '') =>
  q(`select lector_srv_lectura('neg', $1, $2, $3, $4, $5)`, [hash(c), monto, new Date(Date.now() - minutosAtras * 60_000).toISOString(), codigo, decision]);
const para = async (c) => (await uno(`select lector_para_cobrar('neg', $1) r`, [c])).r;
const cobrar = (c, aviso, f = null) => uno(`select lector_cobrar_con('neg', $1, $2, $3::jsonb) r`, [c, aviso, f ? JSON.stringify(f) : null]);

// 1 · Sin celular de cobros: nada que ver (The 24/7).
await cita('c1', 'e1', 'Juan Pérez', 30);
await como('empleado', 'e1');
ok('sin celular conectado: activo = false y nada más', (await para('c1')).activo === false);

// Conectar el celular (como dueño).
await como('dueno');
await q(`select lector_codigo_nuevo('neg')`);
const cod = (await uno(`select codigo from lector_codigos`)).codigo;
await q(`select lector_srv_vincular($1, $2, $3, 'Xiaomi')`, [cod, D, 'a'.repeat(64)]);
await q(`update lector_dispositivos set vinculado_at = now() - interval '1 day'`);

// 2 · Llegan tres Yape: el barbero ve los tres, el exacto primero.
const yJuan = await yape(3000, 'JUAN PEREZ Q.', 1);
const yAna = await yape(2000, 'ANA RUIZ', 2);
const yLuis = await yape(5000, 'LUIS SOTO', 3);
ok('sin foto del ticket, no se cobra solo', (await est('c1')).pagado_por === '');
await como('empleado', 'e1');
let p = await para('c1');
ok('ve los tres, el de S/ 30 primero', p.activo && p.yapes.length === 3 && p.yapes[0].id === yJuan && p.yapes[0].exacto === true, JSON.stringify(p));
ok('con los ajustes de serie: 15 / 5 / foto obligatoria', p.antes === 15 && p.despues === 5 && p.foto === 'obligatoria');

// 3 · Brechas: sin foto, foto de otro monto, de otra hora, de otro número.
await espera('sin foto (obligatoria): no cobra', () => cobrar('c1', yJuan), /Toma la foto del Yape/);
await lectura('a', 20);
await espera('la foto dice S/ 20 y el Yape es de S/ 30: no', () => cobrar('c1', yJuan, foto('a')), /La foto dice S\/ 20\.00, pero ese Yape es de S\/ 30\.00/);
await lectura('b', 30, 12);
await espera('foto de hace 12 min y Yape de hace 1: no', () => cobrar('c1', yJuan, foto('b')), /La foto es de las/);
await lectura('c', 30, 1, 'rechazar');
await espera('foto de un pago a otro número: no', () => cobrar('c1', yJuan, foto('c')), /Esa foto no vale/);
await lectura('d', 30, 1, 'aprobar', '123');
await q(`update lector_avisos set codigo = '999' where id = $1`, [yJuan]);
await espera('código de seguridad distinto: no', () => cobrar('c1', yJuan, foto('d')), /código de seguridad/);
await q(`update lector_avisos set codigo = null where id = $1`, [yJuan]);
ok('nada de eso cobró', (await est('c1')).pagado_por === '' && Number((await est('c1')).pagado) === 0);

// 4 · La foto buena: cobrado.
await lectura('e', 30, 1);
let r = (await cobrar('c1', yJuan, foto('e'))).r;
let e = await est('c1');
ok('foto que cuadra: cobrada', e.pagado_por === 'lector' && Number(e.pagado) === 30 && r.foto === 'si', JSON.stringify([e, r]));
const av = await uno(`select asignado, motivo, como, foto_ok, elegido_por, cita_id from lector_avisos where id = $1`, [yJuan]);
ok('el Yape dice quién lo eligió y por qué', av.asignado === 'equipo' && av.motivo === 'barbero' && av.cita_id === 'c1' && av.elegido_por);
ok('la foto queda en la caja a nombre del empleado', (await uno(`select count(*)::int n from comprobantes_cobro where via = 'empleado' and ref_id = 'c1'`)).n === 1);
ok('y aprende el familiar', (await uno(`select count(*)::int n from lector_alias where lead_id = 'c1-l'`)).n === 1);

// 5 · El mismo Yape para otro corte, la misma foto otra vez, la cita de otro barbero.
await cita('c2', 'e1', 'Mario Díaz', 30);
ok('el Yape ya tomado no sale en la lista', !(await para('c2')).yapes.some((y) => y.id === yJuan));
await espera('el mismo Yape para otro corte: no', () => cobrar('c2', yJuan, foto('e')), /ya se asignó a otra cita/);
await espera('la misma foto otra vez: no', () => cobrar('c2', yAna, foto('e')), /misma foto/);
await cita('c9', 'e2', 'Otro Cliente', 20);
await espera('la cita de otro barbero: no', () => cobrar('c9', yAna), /Esa no es tuya/);
await espera('ni ver sus Yapes', () => para('c9'), /Esa no es tuya/);

// 6 · Un Yape de más, con la foto opcional: se cobra lo que falta y lo demás queda a la vista.
await como('dueno');
await q(`select lector_ajustes_guardar('neg', 15, 5, 'opcional')`);
await como('empleado', 'e1');
await cita('c3', 'e1', 'Luis Soto', 30);
r = (await cobrar('c3', yLuis)).r;
e = await est('c3');
ok('S/ 50 para un corte de S/ 30: se cobran 30', e.pagado_por === 'lector' && Number(e.pagado) === 30 && Number(r.sobra) === 20, JSON.stringify([e, r]));
ok('y queda «sin foto» para el dueño', r.foto === 'sin_foto');

// 7 · Pago en partes: S/ 20 de un corte de S/ 30 → a cuenta.
r = (await cobrar('c2', yAna)).r;
e = await est('c2');
ok('S/ 20 de S/ 30: a cuenta', e.pagado_por === '' && Number(e.pagado) === 20 && Number(r.sobra) === 0, JSON.stringify(e));

// 8 · Sedes: el celular de Centro no sirve para una cita de Norte.
await como('dueno');
await q(`select lector_dispositivo_sede('neg', $1, 'Centro')`, [D]);
await como('empleado', 'e1');
await cita('c4', 'e1', 'Nora Aquino', 40, 'Norte');
const yNora = await yape(4000, 'NORA AQU*', 0);
ok('cita de Norte: no ve los Yapes del celular de Centro', (await para('c4')).yapes.length === 0);
await espera('ni puede tomarlos', () => cobrar('c4', yNora), /celular de cobros de Centro, no al de Norte/);
await cita('c5', 'e1', 'Nora Aquino', 40, 'Centro');
ok('la de Centro sí lo ve', (await para('c5')).yapes.some((y) => y.id === yNora));

// 9 · Un Yape viejo (fuera de 15 + 5 min) no se ve ni se toma.
const yViejo = await yape(4000, 'ALGUIEN', 30);
ok('Yape de hace 30 min: no sale', !(await para('c5')).yapes.some((y) => y.id === yViejo));
await espera('ni se puede tomar', () => cobrar('c5', yViejo), /hace más de 20 min/);

// 10 · El Cierre: quién, cuánto sobró, la foto.
await como('dueno');
const estado = (await uno(`select lector_estado('neg') r`)).r;
const fj = estado.avisos.find((a) => a.id === yJuan);
const fl = estado.avisos.find((a) => a.id === yLuis);
ok('el Cierre dice quién eligió y enlaza la foto', fj.quien === 'Carlos' && fj.foto_ok === 'si' && /cloudinary/.test(fj.foto_url ?? ''), JSON.stringify(fj));
ok('y lo que sobró', Number(fl.sobra) === 20 && fl.foto_ok === 'sin_foto');
ok('el celular dice su sede', estado.dispositivos[0].sede === 'Centro');

// 11 · «No era de esta cita»: el dueño lo deshace, la foto se va y esa cita ya no lo ve.
await q(`select lector_desasignar('neg', $1)`, [yJuan]);
e = await est('c1');
ok('deshacer: la cita vuelve a por cobrar', e.pagado_por === '' && Number(e.pagado) === 0, JSON.stringify(e));
ok('y la foto sale de la caja', (await uno(`select count(*)::int n from comprobantes_cobro where image_hash = $1`, [hash('e')])).n === 0);
await como('empleado', 'e1');
ok('el Yape vuelve a la lista, pero no para esa cita', !(await para('c1')).yapes.some((y) => y.id === yJuan) && (await para('c2')).yapes.some((y) => y.id === yJuan));
await espera('el barbero no deshace', () => q(`select lector_desasignar('neg', $1)`, [yLuis]), /Solo el dueño/);
await espera('ni cambia los ajustes', () => q(`select lector_ajustes_guardar('neg', 60, 30, 'opcional')`), /Solo el dueño/);

// 12 · Permisos.
const pf = await uno(`select has_function_privilege('authenticated', 'lector_srv_lectura(text, text, numeric, text, text, text)', 'execute') a,
                             has_function_privilege('anon', 'lector_cobrar_con(text, text, bigint, jsonb)', 'execute') b,
                             has_function_privilege('authenticated', 'lector_cobrar_con(text, text, bigint, jsonb)', 'execute') c`);
ok('la lectura la escribe solo el servidor; cobrar es para el equipo con sesión', !pf.a && !pf.b && pf.c);

// 13 · Deshacer la 0003.
await como('dueno');
await ex(leer('modules/lector/sql/0003_el_barbero_elige_deshacer.sql'));
ok('deshacer la 0003', (await uno(`select to_regclass('public.lector_ajustes') is null a`)).a
   && (await uno(`select count(*)::int n from lector_avisos where asignado = 'equipo'`)).n === 0);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
