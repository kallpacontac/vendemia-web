/**
 * Prueba de modules/lector/sql/0002_emparejar.sql (con la 0001) contra un Postgres de verdad (PGlite).
 * v2_comprobante_aplicar es el de verdad (tu-pagina 0021); lo demás de antes, simulado.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/lector/sql/tests/pruebas_0002_pglite.mjs . && node pruebas_0002_pglite.mjs <repo>
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
create function public.rol_en(p text) returns text language sql as $$ select 'dueno'::text $$;
create function public.loyalty_srv_check() returns void language sql as $$ select $$;
create table avisos (n serial, company text, tipo text, ref text, datos jsonb);
create function public.avisos_apuntar(p_company text, p_tipo text, p_ref text, p_datos jsonb,
    p_fila_creada timestamptz default now(), p_retraso interval default interval '0') returns void language sql as $$
    insert into avisos (company, tipo, ref, datos) values (p_company, p_tipo, p_ref, p_datos) $$;
create table leads (id text, company_id text, name text, phone text);
create table appointments (id text primary key, company_id text, lead_id text, service text, slot_start text, slot_end text,
  slot_minutes int, employee_id text, status text, created_at bigint, pagado_por text default '', metodo_pago text default '', beneficiario text default '');
create table appointment_services (id text primary key, appointment_id text, price double precision);
create table pending_payments (id text primary key, lead_id text, company_id text, amount numeric, voucher_path text, operation_id text,
  image_hash text, verified int, order_id text, appointment_id text, created_at bigint default extract(epoch from now())::bigint);
create table comprobantes_web (id uuid primary key default gen_random_uuid(), company_id text, appointment_id text, lead_id text,
  url text default '', image_hash text default '', estado text, revisado_por text default '', revisado_at timestamptz, monto numeric,
  motivo text default '', cotejo text default '', cotejado_at timestamptz, creado_at timestamptz default now());
create table tu_pagina (company_id text, slug text, publicada boolean);
insert into tu_pagina values ('neg', 'uno', true);
create function public.v2_adelanto_minimo(c text, t numeric) returns numeric language sql as $$ select round(t / 2, 2) $$;
create function public.v2_canchas_cfg(c text) returns jsonb language sql as $$ select null::jsonb $$;
create function public.v2_hueco(c text, s text, m int, e text, i text) returns text language sql as $$ select null::text $$;
-- En la prueba, el código de la reserva es su id.
create function public.v2_comprobante_cita(p_slug text, p_codigo text, p_telefono text) returns public.appointments
  language sql as $$ select * from public.appointments where id = p_codigo $$;
`);
await ex(aplicar);
await ex(leer('modules/lector/sql/0001_lector_de_pagos.sql'));
await ex(leer('modules/lector/sql/0002_emparejar.sql'));
await ex(leer('modules/lector/sql/0002_emparejar.sql'));
ok('la 0002 se puede aplicar dos veces', true);

// ── Nombres ──
const par = async (a, b) => Number((await uno(`select lector_parecido($1, $2) v`, [a, b])).v);
ok('nombre completo vs corto', (await par('ALVARO FRANCO PELAEZ BAUTISTA', 'Alvaro Peláez')) === 1);
ok('apellidos primero (Sip)', (await par('Pelaez Bautista Alvaro Franco', 'Alvaro Pelaez')) === 1);
ok('Yape recortado («Alv Pel»)', (await par('Alv Pel', 'Alvaro Peláez')) === 1);
ok('suena igual (Baldez = Valdez)', (await par('JORGE BALDEZ', 'Jorge Valdez')) === 1);
ok('la ch no se pierde (Chávez ≠ Cavez)', (await par('LUIS CHAVEZ', 'Luis Cavez')) === 0.5);
ok('un familiar no se parece', (await par('MARIA TORRES', 'Diego Ramos')) === 0);
ok('inicial vale media', (await par('Alvaro F.', 'Alvaro Franco')) === 0.75);

// ── Ayudas ──
await q(`select lector_codigo_nuevo('neg')`);
const cod = (await uno(`select codigo from lector_codigos`)).codigo;
const D = '22222222-2222-2222-2222-222222222222';
await q(`select lector_srv_vincular($1, $2, $3, 'Xiaomi')`, [cod, D, 'a'.repeat(64)]);
let h = 0;
const yape = (centimos, nombre, minutosAtras = 0, origen = 'Yape') =>
  q(`select lector_srv_recibir($1, 'aviso', $2)`, [D, { huella: 'h-' + String(++h).padStart(8, '0'), centimos, nombre, origen, cuando: Date.now() - minutosAtras * 60_000 }]);
const lima = async (min) => (await uno(`select to_char((now() + make_interval(mins => $1::int)) at time zone 'America/Lima', 'YYYY-MM-DD HH24:MI') t`, [min])).t;
const cita = async (id, lead, nombre, precio, desdeMin, hastaMin, estado = 'completed') => {
  await q(`insert into leads values ($1, 'neg', $2, '9' || $1)`, [lead, nombre]);
  await q(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, created_at)
           values ($1, 'neg', $2, 'Corte', $3, $4, 30, 'e1', $5, extract(epoch from now())::bigint)`, [id, lead, await lima(desdeMin), await lima(hastaMin), estado]);
  await q(`insert into appointment_services values ($1 || '-s', $1, $2)`, [id, precio]);
};
const est = (id) => uno(`select a.status, a.pagado_por, (select coalesce(sum(amount),0) from pending_payments p where p.appointment_id = a.id)::numeric pagado from appointments a where id = $1`, [id]);
const ultimo = () => uno(`select * from lector_avisos order by id desc limit 1`);

// 1 · Barbero: un solo candidato, aunque el nombre no se parezca (pagó un familiar).
await cita('c1', 'l1', 'Carlos Ríos', 30, -40, -10);
await yape(3000, 'MARIA TORRES');
let e = await est('c1');
ok('barbero: único candidato → cobrada sola', e.pagado_por === 'lector' && Number(e.pagado) === 30, JSON.stringify(e));
let a = await ultimo();
ok('el aviso dice a qué cita fue', a.cita_id === 'c1' && a.asignado === 'auto');
ok('motivo: única cita con ese monto', a.motivo === 'unico', a.motivo);
const push = await uno(`select datos from avisos order by n desc limit 1`);
ok('el push lleva la cita y el cliente', push.datos.cita === 'c1' && push.datos.cliente_cita === 'Carlos Ríos', JSON.stringify(push.datos));

// 2 · Dos citas de S/ 35 a la vez: decide el nombre.
await cita('c2', 'l2', 'Diego Paredes', 35, -30, 0);
await cita('c3', 'l3', 'Luis Quispe', 35, -30, 0);
await yape(3500, 'DIEGO PAREDES QUISPE');
ok('dos iguales: el nombre señala a uno', (await est('c2')).pagado_por === 'lector' && (await est('c3')).pagado_por === '');
ok('motivo: por el nombre', (await ultimo()).motivo === 'nombre');

// 3 · Dos iguales y el nombre no ayuda → por asignar. El dueño elige y se aprende.
await cita('c4', 'l4', 'Jorge Mendoza', 40, -30, 0);
await cita('c5', 'l5', 'Kevin Arévalo', 40, -30, 0);
await yape(4000, 'ROSA HUAMAN');
a = await ultimo();
ok('sin dudas no se adivina: queda por asignar', a.asignado === '' && a.dudoso?.length === 2 && (await est('c4')).pagado_por === '');
await q(`update lector_avisos set recibido_at = now() - interval '5 minutes' where id = $1`, [a.id]);
const pa = (await uno(`select lector_por_asignar('neg') r`)).r;
ok('el panel lo lista con sus 2 opciones', pa.length === 1 && pa[0].opciones.length === 2);
await q(`select lector_asignar('neg', $1, 'c5')`, [a.id]);
ok('el dueño elige: cobrada', (await est('c5')).pagado_por === 'lector');
ok('motivo: lo eligió el dueño', (await uno(`select motivo from lector_avisos where id = $1`, [a.id])).motivo === 'elegido');
ok('y aprende el familiar', (await uno(`select count(*)::int n from lector_alias where lead_id = 'l5'`)).n === 1);
// Otra vez Kevin y Jorge con S/ 40; paga ROSA HUAMAN → ahora sabe que es Kevin.
await q(`update appointments set status = 'cancelled' where id = 'c4'`);
await cita('c6', 'l4b', 'Jorge Mendoza', 40, -30, 0);
await q(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, created_at)
         values ('c7', 'neg', 'l5', 'Corte', $1, $2, 30, 'e1', 'completed', 0)`, [await lima(-30), await lima(0)]);
await q(`insert into appointment_services values ('c7-s', 'c7', 40)`);
await yape(4000, 'Rosa Huamán');
ok('familiar aprendido: va solo a Kevin', (await est('c7')).pagado_por === 'lector' && (await est('c6')).pagado_por === '');

// 3b · Dos citas de S/ 1 y llegan dos Yape de S/ 1 sin nombre que ayude: cuadran, las dos cobradas.
await cita('u1', 'lu1', 'Andrés Rojas', 1, -30, 0);
await cita('u2', 'lu2', 'Pablo Soto', 1, -30, 0);
await yape(100, 'CARMEN DIAZ');
ok('primer Yape de S/ 1: todavía no adivina', (await est('u1')).pagado_por === '' && (await est('u2')).pagado_por === '');
ok('y no sale «por asignar» enseguida (3 min de gracia)', (await uno(`select lector_por_asignar('neg') r`)).r.length === 0);
await yape(100, 'TERESA VEGA');
ok('segundo Yape de S/ 1: las dos cobradas solas', (await est('u1')).pagado_por === 'lector' && (await est('u2')).pagado_por === 'lector');
ok('y quedan marcadas «por orden» para corroborar', (await uno(`select count(*)::int n from lector_avisos where centimos = 100 and motivo = 'orden'`)).n >= 1);

// 4 · Pago en partes: S/ 20 y luego S/ 30 de S/ 50.
await cita('c8', 'l8', 'Piero Vásquez', 50, -20, 10);
await yape(2000, 'PIERO VASQUEZ');
e = await est('c8');
ok('parte 1: a cuenta (el nombre señala a uno)', Number(e.pagado) === 20 && e.pagado_por === '', JSON.stringify(e));
ok('motivo: pago en partes', (await ultimo()).motivo === 'partes');
await yape(3000, 'PIERO VASQUEZ');
e = await est('c8');
ok('parte 2: lo que faltaba → cobrada', Number(e.pagado) === 50 && e.pagado_por === 'lector', JSON.stringify(e));
await cita('c9', 'l9', 'Bruno Castillo', 50, -20, 10);
await yape(1500, 'ANA LOPEZ');
ok('en partes sin nombre que cuadre: no se toca', Number((await est('c9')).pagado) === 0);

// 5 · Página: el Yape llega 3 min ANTES de tocar «Ya yapeé».
await cita('w1', 'lw1', 'Marco Salazar', 60, 600, 630, 'pending_payment');
await cita('w2', 'lw2', 'Renzo Torres', 60, 640, 670, 'pending_payment');
await yape(3000, 'X Y', 3);
ok('dos apartadas iguales, sin «Ya yapeé»: no adivina', (await est('w1')).status === 'pending_payment' && (await est('w2')).status === 'pending_payment');
const r1 = (await uno(`select lector_srv_ya_pague('uno', 'w1', '') r`)).r;
e = await est('w1');
ok('«Ya yapeé» toma el Yape de antes: confirmada', e.status === 'confirmed' && Number(e.pagado) === 30, JSON.stringify(e) + JSON.stringify(r1));
ok('y la página lo sabe', r1.estado === 'confirmada', JSON.stringify(r1));
ok('motivo: el cliente avisó', (await uno(`select motivo from lector_avisos where cita_id = 'w1'`)).motivo === 'aviso');
ok('la otra sigue apartada', (await est('w2')).status === 'pending_payment');
const r2 = (await uno(`select lector_srv_ya_pague('uno', 'w2', '') r`)).r;
ok('sin Yape todavía: esperando', r2.estado === 'esperando');
await yape(3000, 'Z W');
ok('llega su Yape: confirmada al momento', (await est('w2')).status === 'confirmed');

// 6 · Comprobante validado por la IA: el Yape lo coteja sin sumar otro pago.
await cita('k1', 'lk1', 'Joel Saldaña', 30, 120, 150, 'confirmed');
await q(`insert into pending_payments (id, lead_id, company_id, amount, operation_id, verified, order_id, appointment_id) values ('pk1', 'lk1', 'neg', 15, 'ia', 1, '', 'k1')`);
await q(`insert into comprobantes_web (company_id, appointment_id, lead_id, estado, revisado_por, monto) values ('neg', 'k1', 'lk1', 'aprobado', 'automatico', 15)`);
await yape(1500, 'JOEL SALDANA');
const ck = await uno(`select cotejo from comprobantes_web where appointment_id = 'k1'`);
ok('cotejo: «Llegó» solo, sin pago doble', ck.cotejo === 'llego' && Number((await est('k1')).pagado) === 15);

// 7 · «No era de esta cita».
const a1 = await uno(`select id from lector_avisos where cita_id = 'c1'`);
await q(`select lector_desasignar('neg', $1)`, [a1.id]);
e = await est('c1');
ok('deshacer: quita el pago y la cita vuelve a por cobrar', e.pagado_por === '' && Number(e.pagado) === 0, JSON.stringify(e));
const libre = await uno(`select asignado, descartes from lector_avisos where id = $1`, [a1.id]);
ok('y esa cita no se le vuelve a proponer', libre.asignado === '' && libre.descartes.includes('c1'));
await q(`select lector_emparejar('neg')`);
ok('emparejar otra vez no la vuelve a tomar', (await est('c1')).pagado_por === '');

// 8 · El cliente yapea ANTES de que el barbero registre la cita.
await yape(2500, 'FRANCO HUAMAN');
await q(`insert into leads values ('lt', 'neg', 'Franco Huamán', '9lt')`);
await q(`insert into appointments (id, company_id, lead_id, service, slot_start, slot_end, slot_minutes, employee_id, status, created_at)
         values ('t1', 'neg', 'lt', 'Barba', $1, $2, 20, 'e1', 'completed', 0)`, [await lima(-25), await lima(-5)]);
await q(`insert into appointment_services values ('t1-s', 't1', 25)`);
ok('cita registrada después del Yape: se cobra sola', (await est('t1')).pagado_por === 'lector');

// 9 · Permisos.
const pf = await uno(`select has_function_privilege('authenticated', 'lector_emparejar(text)', 'execute') a,
                             has_function_privilege('anon', 'lector_asignar(text, bigint, text)', 'execute') b,
                             has_function_privilege('anon', 'lector_srv_ya_pague(text, text, text)', 'execute') c`);
ok('emparejar es interno; asignar no es para anon; «Ya yapeé» sí', !pf.a && !pf.b && pf.c);

// 10 · Deshacer la 0002.
await ex(leer('modules/lector/sql/0002_emparejar_deshacer.sql'));
ok('deshacer la 0002', (await uno(`select to_regclass('public.lector_esperas') is null a`)).a);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
