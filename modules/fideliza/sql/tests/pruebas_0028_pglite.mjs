/**
 * Prueba de modules/fideliza/sql/0028 («Trae a un amigo» y guardar con Google) contra PGlite, con
 * 0001–0019 y 0028 cargadas sobre auth.uid(), companies y memberships simulados.
 *
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.5.8
 *   cp <repo>/modules/fideliza/sql/tests/pruebas_0028_pglite.mjs . && node pruebas_0028_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const repo = process.argv[2];
const dir = `${repo}/modules/fideliza/sql/`;
const sinNotify = (s) => s.replace(/notify pgrst[^;]*;/g, '');

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated' $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table public.companies (id text primary key, name text, owner_phone text);
create table public.platform_admins (auth_user_id text primary key);
create table public.memberships (id text primary key, auth_user_id text, company_id text, role text, employee_id text);
`);
for (const f of readdirSync(dir).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f) && !/deshacer/.test(f) && Number(f.slice(0, 4)) <= 19).sort()) {
  try { await db.exec(sinNotify(readFileSync(dir + f, 'utf8'))); } catch (e) { console.log('FALLA', f, '→', e.message); throw e; }
}
const m28 = sinNotify(readFileSync(dir + '0028_amigos_y_google.sql', 'utf8'));
await db.exec(m28);
await db.exec(m28); // idempotente
await db.exec(`create or replace function public.loyalty_srv_check() returns void language sql as $$ select $$;`);

let fallos = 0;
const ok = (n, c, extra = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, c ? '' : extra); };
const q = async (s, p) => (await db.query(s, p)).rows;
const v1 = async (s, p) => Object.values((await q(s, p))[0])[0];
const err = async (f) => { try { await f(); return ''; } catch (e) { return e.message; } };
const U = '11111111-1111-1111-1111-111111111111';
const EXTRANO = '22222222-2222-2222-2222-222222222222';
let k = 0;
const clave = () => 'clave-prueba-' + (++k);
const como = (uid) => db.exec(`select set_config('t.uid', '${uid}', false)`);

await db.exec(`select set_config('t.uid', '${U}', false);
insert into companies values ('c1','Barbería Norte',''), ('c2','Otro','');
insert into memberships values ('m1','${U}','c1','owner',null), ('m2','${U}','c2','owner',null);`);
await q(`select loyalty_settings_save('c1', '{"slug":"barberia-norte","display_name":"Barbería Norte"}')`);
const prog = await v1(`select loyalty_program_save('c1', null, 'Club Norte', 'x', 'repeat', $1::jsonb)`,
  [JSON.stringify({ rule_type: 'stamps', stamps_per_purchase: 1, reward_threshold: 6, reward_description: 'Corte gratis' })]);
await q(`select loyalty_program_publish('c1', $1)`, [prog]);

// Diego: cliente de antes, sacado en el panel.
const diego = await v1(`select loyalty_member_create('c1', 'Diego Ramos', '+51911111111', null, false, $1, 'panel')`, [clave()]);
const DIEGO = diego.member_id;
const TDIEGO = diego.card_token;
const extras = (t) => v1(`select loyalty_srv_tarjeta_extras($1)`, [t]);
const guardar = (d) => v1(`select loyalty_amigos_guardar('c1', $1::jsonb)`, [JSON.stringify(d)]);
/** Lo que hace /n/<slug>/unirse: crea la tarjeta, pone el celular y anota la invitación. */
async function alta(nombre, tel, codigo) {
  const r = await v1(`select loyalty_srv_join('barberia-norte', $1, null, $2)`, [nombre, clave()]);
  await q(`select loyalty_srv_card_action($1, 'contact', $2::jsonb)`, [r.card_token, JSON.stringify({ phone: tel })]);
  const a = codigo ? await v1(`select loyalty_srv_amigo_anotar($1, $2)`, [r.card_token, codigo]) : null;
  const id = await v1(`select id from loyalty_members where card_token_hash = loyalty_hash($1)`, [r.card_token]);
  return { token: r.card_token, id, anotar: a };
}
const sello = (id) => q(`select loyalty_record('c1', $1, 'purchase', 3000, null, null, $2, 'caja')`, [id, clave()]);
const restar = (id) => q(`select loyalty_adjust('c1', $1, -1, 'Se marcó por error', $2)`, [id, clave()]);
const avisos = (id) => v1(`select loyalty_srv_amigo_avisos('c1', $1)`, [id]);
const premiosDe = (id) => q(`select status, description, origen from loyalty_rewards where member_id = $1 and origen = 'amigos' order by issued_at, id`, [id]);
const disponibles = (id) => v1(`select rewards_available from loyalty_members where id = $1`, [id]);
const cuadra = async () => (await v1(`select loyalty_reconcile('c1', false)`)).mismatches.length === 0;

// ═══ 1 · Configuración ═══════════════════════════════════════════════════════
ok('de fábrica, apagado y cada 2', (await v1(`select loyalty_amigos_leer('c1')`)).activo === false && (await v1(`select loyalty_amigos_leer('c1')`)).cada === 2);
ok('cada 6 no', /invalid_settings/.test(await err(() => guardar({ activo: true, cada: 6, premio: 'Corte clásico' }))));
ok('prendido sin premio no', /invalid_settings/.test(await err(() => guardar({ activo: true, cada: 2, premio: ' ' }))));
ok('premio de 81 letras no', /invalid_settings/.test(await err(() => guardar({ activo: false, cada: 2, premio: 'x'.repeat(81) }))));
await como(EXTRANO);
ok('quien no es del negocio no lo cambia', /forbidden|not_member|loyalty/.test(await err(() => guardar({ activo: true, cada: 2, premio: 'Corte clásico' }))));
await como(U);
ok('apagado: la tarjeta no enseña amigos', (await extras(TDIEGO)).amigos === null);
ok('apagado: el alta no muestra quién invita', (await v1(`select loyalty_srv_amigos_invita('barberia-norte', 'ABCDEF')`)).status === 'apagado');
let cfg = await guardar({ activo: true, cada: 2, premio: 'Corte clásico', catalogo_id: 'svc-1', regalo: false });
ok('se guarda', cfg.activo === true && cfg.premio === 'Corte clásico' && cfg.catalogo_id === 'svc-1');

// ═══ 2 · La tarjeta de Diego ═════════════════════════════════════════════════
let e = await extras(TDIEGO);
const COD = e.amigos?.codigo;
ok('código de 6 letras sin 0/O/1/I/L', /^[A-HJKMNP-Z2-9]{6}$/.test(COD ?? ''), JSON.stringify(e));
ok('el código no cambia al volver a abrir', (await extras(TDIEGO)).amigos.codigo === COD);
ok('sin Google todavía', e.google === false && e.slug === 'barberia-norte');
ok('avance en cero', e.amigos.invitados === 0 && e.amigos.avance === 0 && e.amigos.cada === 2);
ok('el alta dice quién invita (nombre de pila)', (await v1(`select loyalty_srv_amigos_invita('barberia-norte', $1)`, [COD.toLowerCase()])).invita === 'Diego');
ok('código inventado: inválido', (await v1(`select loyalty_srv_amigos_invita('barberia-norte', 'ZZZZZZ')`)).status === 'invalido');

// ═══ 3 · Quién cuenta y quién no ═════════════════════════════════════════════
ok('Diego no se invita a sí mismo', (await v1(`select loyalty_srv_amigo_anotar($1, $2)`, [TDIEGO, COD])).status === 'mismo');
const gemelo = await alta('Diego otra vez', '+51911111111', COD);
ok('otra tarjeta con el celular de Diego: no cuenta', gemelo.anotar.status === 'mismo', JSON.stringify(gemelo.anotar));
const vieja = await alta('Vieja', '+51922222222', null);
const repetida = await alta('Vieja de nuevo', '922 222 222', COD);
ok('celular que ya tiene tarjeta: ya es cliente', repetida.anotar.status === 'ya_cliente', JSON.stringify(repetida.anotar));
ok('código inventado al anotar: inválido', (await v1(`select loyalty_srv_amigo_anotar($1, 'ZZZZZZ')`, [vieja.token])).status === 'invalido');

const carla = await alta('Carla Pérez', '+51933333333', COD);
ok('Carla queda anotada, sin regalo', carla.anotar.status === 'anotado' && carla.anotar.regalo === false);
ok('Carla no se anota dos veces', (await v1(`select loyalty_srv_amigo_anotar($1, $2)`, [carla.token, COD])).status === 'ya_cliente');
ok('anotada: en espera, aún no cuenta', (await extras(TDIEGO)).amigos.invitados === 1 && (await extras(TDIEGO)).amigos.vinieron === 0);
ok('sin visita, sin avisos', (await avisos(carla.id)).length === 0);

// ═══ 4 · Carla viene: cuenta ═════════════════════════════════════════════════
await sello(carla.id);
e = await extras(TDIEGO);
ok('con su primer sello, Carla cuenta', e.amigos.vinieron === 1 && e.amigos.avance === 1);
let av = await avisos(carla.id);
ok('aviso «vino» a Diego, le falta 1', av.length === 1 && av[0].aviso === 'vino' && av[0].invitado === 'Carla' && av[0].faltan === 1 && av[0].invitador_id === DIEGO, JSON.stringify(av));
ok('el aviso se da una vez', (await avisos(carla.id)).length === 0);
await sello(carla.id);
ok('su segunda visita no vuelve a avisar', (await avisos(carla.id)).length === 0 && (await extras(TDIEGO)).amigos.vinieron === 1);
ok('sin premio con un solo amigo', (await premiosDe(DIEGO)).length === 0);

// ═══ 5 · Beto viene: premio para Diego ═══════════════════════════════════════
const beto = await alta('Beto', '+51944444444', COD);
await sello(beto.id);
let pr = await premiosDe(DIEGO);
ok('con 2 amigos, Diego gana su premio', pr.length === 1 && pr[0].status === 'available' && pr[0].description === 'Corte clásico', JSON.stringify(pr));
ok('Diego tiene 1 premio por entregar', (await disponibles(DIEGO)) === 1);
av = await avisos(beto.id);
ok('aviso «premio» con el nombre del premio', av.length === 1 && av[0].aviso === 'premio' && av[0].premio === 'Corte clásico', JSON.stringify(av));
ok('el avance vuelve a 0 y cuenta 1 ganado', (await extras(TDIEGO)).amigos.avance === 0 && (await extras(TDIEGO)).amigos.ganados === 1);
ok('los saldos cuadran (reconcile)', await cuadra());
ok('el premio no tocó el saldo de sellos de Diego', (await v1(`select balance from loyalty_members where id = $1`, [DIEGO])) === 0);

// ═══ 6 · A Beto le quitan el sello: se anula el premio sin canjear ═══════════
await restar(beto.id);
pr = await premiosDe(DIEGO);
ok('Beto en cero: el premio se anula', pr.length === 1 && pr[0].status === 'revoked', JSON.stringify(pr));
ok('Diego ya no tiene premios por entregar', (await disponibles(DIEGO)) === 0);
e = await extras(TDIEGO);
ok('Beto vuelve a espera; Carla sigue contando', e.amigos.vinieron === 1 && e.amigos.avance === 1 && e.amigos.ganados === 0, JSON.stringify(e.amigos));
ok('los saldos cuadran tras anular', await cuadra());
await sello(beto.id);
pr = await premiosDe(DIEGO);
ok('Beto vuelve de verdad: premio otra vez', pr.filter((x) => x.status === 'available').length === 1 && (await disponibles(DIEGO)) === 1);

// ═══ 7 · Canjeado no se deshace ══════════════════════════════════════════════
const rid = await v1(`select id from loyalty_rewards where member_id = $1 and origen = 'amigos' and status = 'available'`, [DIEGO]);
await q(`select loyalty_redeem('c1', $1, $2, null, $3)`, [DIEGO, rid, clave()]);
ok('Diego canjea su premio de amigos', (await v1(`select status from loyalty_rewards where id = $1`, [rid])) === 'redeemed');
await restar(beto.id);
ok('restar a Beto tras el canje no lo deshace', (await v1(`select status from loyalty_rewards where id = $1`, [rid])) === 'redeemed');
await sello(beto.id);
ok('Beto no vuelve a contar para otro premio', (await extras(TDIEGO)).amigos.avance === 0);
ok('los saldos cuadran tras el canje', await cuadra());

// ═══ 8 · El sello de regalo del amigo ════════════════════════════════════════
await guardar({ activo: true, cada: 2, premio: 'Corte clásico', regalo: true });
const dani = await alta('Dani', '+51955555555', COD);
ok('Dani empieza con 1 sello de regalo', dani.anotar.regalo === true && (await v1(`select balance from loyalty_members where id = $1`, [dani.id])) === 1);
ok('el regalo no cuenta como visita', (await extras(TDIEGO)).amigos.vinieron === 2);
ok('el regalo está en el libro (cuadra)', await cuadra());
await sello(dani.id);
ok('su primera visita sí cuenta', (await extras(TDIEGO)).amigos.vinieron === 3 && (await extras(TDIEGO)).amigos.avance === 1);
await restar(dani.id);
ok('quitarle esa visita (queda el regalo) la descuenta', (await extras(TDIEGO)).amigos.vinieron === 2);
await sello(dani.id);

// ═══ 9 · Tope de 2 premios al mes ════════════════════════════════════════════
for (const [n, t] of [['Eli', '+51966666661'], ['Fer', '+51966666662'], ['Gabo', '+51966666663']]) {
  const x = await alta(n, t, COD);
  await sello(x.id);
}
pr = (await premiosDe(DIEGO)).filter((x) => x.status !== 'revoked');
ok('máximo 2 premios de amigos en el mes', pr.length === 2, JSON.stringify(pr));
ok('lo que sobra queda guardado para el mes siguiente', (await extras(TDIEGO)).amigos.avance >= 2);

// ═══ 10 · Apagado ════════════════════════════════════════════════════════════
await guardar({ activo: false, cada: 2, premio: 'Corte clásico' });
ok('apagado: la tarjeta deja de enseñarlo', (await extras(TDIEGO)).amigos === null);
const hugo = await alta('Hugo', '+51977777777', COD);
ok('apagado: no se anota', hugo.anotar.status === 'apagado');
ok('los premios ya ganados siguen', (await premiosDe(DIEGO)).filter((x) => x.status === 'available').length === 1);

// ═══ 11 · Números ════════════════════════════════════════════════════════════
const res = await v1(`select loyalty_amigos_resumen('c1', now() - interval '1 day', now() + interval '1 day')`);
ok('resumen: amigos que vinieron, invitaciones y premios', res.traidos === 6 && res.invitados === 6 && res.premios === 2, JSON.stringify(res));

// ═══ 12 · Google ═════════════════════════════════════════════════════════════
const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
ok('huella con otra forma no', /invalid_input/.test(await err(() => q(`select loyalty_srv_google_vincular($1, 'xyz')`, [TDIEGO]))));
ok('vincular la tarjeta de Diego', (await v1(`select loyalty_srv_google_vincular($1, $2)`, [TDIEGO, H1])).status === 'ok');
ok('la tarjeta dice «guardada con Google»', (await extras(TDIEGO)).google === true);
const uso = await v1(`select loyalty_srv_celular_en_uso('barberia-norte', '911 111 111')`);
ok('el celular de Diego: existe y con Google', uso.existe === true && uso.google === true, JSON.stringify(uso));
ok('un celular nuevo: no existe', (await v1(`select loyalty_srv_celular_en_uso('barberia-norte', '999888777')`)).existe === false);
ok('un celular mal escrito: no existe (sin error)', (await v1(`select loyalty_srv_celular_en_uso('barberia-norte', '12')`)).existe === false);
ok('otra cuenta de Google: sin tarjeta', (await v1(`select loyalty_srv_google_recuperar('barberia-norte', $1)`, [H2])).status === 'sin_tarjeta');
ok('en otro negocio: sin tarjeta', (await v1(`select loyalty_srv_google_recuperar('nada-de-nada', $1)`, [H1])).status === 'not_found');
const rec = await v1(`select loyalty_srv_google_recuperar('barberia-norte', $1)`, [H1]);
ok('recuperar con Google da un enlace nuevo', rec.status === 'ok' && rec.card_token && rec.card_token !== TDIEGO);
ok('el enlace viejo deja de servir', (await extras(TDIEGO)).status === 'not_found');
ok('el nuevo abre la tarjeta de Diego, con su código de amigos', (await extras(rec.card_token)).status === 'ok');
ok('la misma cuenta en la tarjeta de Carla se mueve allí',
  (await v1(`select loyalty_srv_google_vincular($1, $2)`, [carla.token, H1])).status === 'ok'
  && (await v1(`select count(*)::int from loyalty_member_google where huella = $1`, [H1])) === 1
  && (await v1(`select member_id from loyalty_member_google where huella = $1`, [H1])) === carla.id);
ok('no se guarda nada más que la huella', JSON.stringify(Object.keys((await q(`select * from loyalty_member_google limit 1`))[0]).sort()) === '["company_id","created_at","huella","member_id"]');

// ═══ 13 · Permisos ═══════════════════════════════════════════════════════════
const grants = await q(`select p.proname, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p where p.proname in ('loyalty_amigos_premiar','loyalty_amigos_guardar','loyalty_srv_amigo_anotar','loyalty_srv_google_recuperar','loyalty_amigos_cfg')`);
const g = Object.fromEntries(grants.map((x) => [x.proname, x]));
ok('premiar no se llama desde fuera', !g.loyalty_amigos_premiar.anon && !g.loyalty_amigos_premiar.auth);
ok('la config interna no se llama desde fuera', !g.loyalty_amigos_cfg.anon && !g.loyalty_amigos_cfg.auth);
ok('guardar: solo con sesión', !g.loyalty_amigos_guardar.anon && g.loyalty_amigos_guardar.auth);
ok('anotar y recuperar: solo el servidor (anon + clave)', g.loyalty_srv_amigo_anotar.anon && !g.loyalty_srv_amigo_anotar.auth && g.loyalty_srv_google_recuperar.anon && !g.loyalty_srv_google_recuperar.auth);

console.log(fallos ? `\n${fallos} FALLOS` : '\nTODAS LAS PRUEBAS PASARON');
process.exit(fallos ? 1 : 0);
