/**
 * Prueba de modules/facturacion/sql/0001 contra un Postgres de verdad (PGlite), con rol_en,
 * auth.uid() y loyalty_srv_check simulados. Se corrió así el 11-nov-2026 (26/26) y el 13-nov-2026
 * con la tasa MYPE por fecha (37/37):
 *
 *   mkdir /tmp/pg && cd /tmp/pg && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/facturacion/pruebas/sql_pglite.mjs . && node sql_pglite.mjs <repo>/modules/facturacion/sql/0001_facturacion.sql <repo>/modules/facturacion/sql/0002_servicios_y_productos.sql
 *
 * No es dependencia del proyecto a propósito: solo hace falta para tocar la SQL.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
// Todas las SQL que se pasen, en orden (0001, 0002…).
const sql = process.argv.slice(2).map((f) => readFileSync(f, 'utf8').replace(/notify pgrst[^;]*;/g, '')).join(';\n');
const db = new PGlite();
const q = (s, p) => db.query(s, p);
const ex = (s) => db.exec(s);
await ex(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create function public.rol_en(p text) returns text language sql stable as $$ select nullif(current_setting('t.rol', true), '') $$;
create function public.loyalty_srv_check() returns void language plpgsql as $$ begin
  if coalesce(current_setting('t.srv', true), '') <> 'si' then raise exception 'Servidor no autorizado' using errcode='42501'; end if; end $$;
`);
await ex(sql);
await ex(sql); // idempotente
const set = (rol, srv = 'no') =>
  ex(`select set_config('t.rol', '${rol}', false), set_config('t.srv', '${srv}', false), set_config('t.uid', '11111111-1111-1111-1111-111111111111', false)`);
let fallos = 0;
const espera = async (nombre, f, patron) => {
  try { await f(); console.log('MAL  (no lanzó)', nombre); fallos++; }
  catch (e) { const b = patron.test(e.message); if (!b) fallos++; console.log(b ? 'ok  ' : 'MAL ', nombre, '→', e.message); }
};
const ok = (n, c) => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n); };

await set('');
await espera('sin acceso', () => q(`select factura_ajustes_leer('c1')`), /No tienes acceso/);
await set('empleado');
await espera('empleado no', () => q(`select factura_ajustes_leer('c1')`), /dueño o el administrador/);
await set('admin');
let r = await q(`select factura_ajustes_leer('c1') v`);
ok('defaults sin fila', r.rows[0].v.activo === false && r.rows[0].v.serie_boleta === 'B001' && r.rows[0].v.rol === 'admin');
await espera('admin no guarda', () => q(`select factura_ajustes_guardar('c1', '{}'::jsonb, null, null)`), /solo lo cambia el dueño/);
await set('dueno');
await espera('simulado en produccion', () => q(`select factura_ajustes_guardar('c1', '{"proveedor":"simulado","ambiente":"produccion"}'::jsonb, null, null)`), /producción/);
const datos = { activo: true, proveedor: 'lucode', ambiente: 'pruebas', ruc: '20131312955', razon_social: 'MI EMPRESA SAC', nombre_comercial: 'Mi Barbería', direccion: 'Jr Lima 1', ubigeo: '', departamento: '', provincia: '', distrito: '', serie_boleta: 'B001', serie_factura: 'F001', igv_tipo: 'gravado', igv_porcentaje: 18, leyenda_amazonia: '2001', ticket_ancho: 80, ultimo_boleta: 41 };
r = await q(`select factura_ajustes_guardar('c1', $1::jsonb, 'v1:s:aaaaaaaaaaaaaaaaaaaa:bbbb', 'wxyz') v`, [JSON.stringify(datos)]);
const a = r.rows[0].v;
const sinUltimo = { ...datos }; delete sinUltimo.ultimo_boleta;
ok('guardado + pista + último 41 + leyenda nula si gravado', a.activo && a.tokens.lucode === 'wxyz' && a.ultimo_boleta === 41 && a.leyenda_amazonia === null && !('token_cifrado' in a));
await set('admin');
const doc = (clave, tipo = 'boleta', tasa = 18) => JSON.stringify({ clave, tipo, cliente: { tipoDoc: 'sin_documento', numDoc: '', nombre: '', direccion: '' }, lineas: [{ descripcion: 'Corte', cantidad: 1, precio: 35, unidad: 'ZZ', valorUnitario: 29.661017, valorVenta: 29.66, igv: 5.34, importe: 35 }], op_gravadas: 29.66, op_exoneradas: 0, igv: 5.34, total: 35, igv_porcentaje: tasa, ref_tipo: 'cita', ref_id: 'abc' });
await espera('tasa que no es la de hoy', () => q(`select factura_reservar('c1', $1::jsonb)`, [doc('clave-0000', 'boleta', 10.5)]), /tasa del IGV cambió \(ahora es 18 %\)/);
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [JSON.stringify({ ...JSON.parse(doc('clave-000x')), igv_porcentaje: undefined })]).catch((e) => e);
ok('sin tasa no emite', r instanceof Error && /tasa del IGV/.test(r.message));
r = await q(`select ultimo from factura_series where serie = 'B001'`);
ok('rechazos sin gastar número', r.rows[0].ultimo === 41);
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0001')]);
ok('primera boleta es la 42', r.rows[0].v.numero === 42 && r.rows[0].v.serie === 'B001');
const id1 = r.rows[0].v.id;
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0001')]);
ok('misma clave = mismo comprobante', r.rows[0].v.id === id1 && r.rows[0].v.repetido === true);
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0002')]);
ok('siguiente 43', r.rows[0].v.numero === 43);
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0003', 'factura')]);
ok('factura F001-1', r.rows[0].v.numero === 1 && r.rows[0].v.serie === 'F001');
await set('dueno');
await espera('serie no vuelve atrás', () => q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...datos, ultimo_boleta: 10 })]), /no puede volver atrás/);
await set('admin');
r = await q(`select v from factura_lista('c1', factura_hoy() - 1, factura_hoy()) v`);
ok('lista 3 sin clave ni emitido_por', r.rows.length === 3 && !('clave' in r.rows[0].v) && !('emitido_por' in r.rows[0].v) && r.rows[0].v.emisor.ruc === '20131312955');
await espera('srv sin clave', () => q(`select factura_srv_cargar($1)`, [id1]), /Servidor no autorizado/);
await set('admin', 'si');
r = await q(`select factura_srv_cargar($1) v`, [id1]);
ok('srv carga token cifrado del proveedor', r.rows[0].v.token_cifrado.startsWith('v1:s:') && r.rows[0].v.proveedor === 'lucode');
await espera('estado inválido', () => q(`select factura_srv_resultado($1, '{"estado":"por_enviar"}'::jsonb)`, [id1]), /Estado no válido/);
r = await q(`select factura_srv_resultado($1, '{"estado":"aceptado","mensaje":"ok","hash":"H1","pdf_url":"https://x/p.pdf","observaciones":["4252 obs"]}'::jsonb) v`, [id1]);
ok('resultado aceptado', r.rows[0].v.estado === 'aceptado' && r.rows[0].v.hash === 'H1' && r.rows[0].v.observaciones[0] === '4252 obs');
r = await q(`select factura_srv_resultado($1, '{"estado":"aceptado","mensaje":"otra"}'::jsonb) v`, [id1]);
ok('hash no se pierde al reapuntar', r.rows[0].v.hash === 'H1' && r.rows[0].v.pdf_url === 'https://x/p.pdf');
await set('admin');
await espera('baja sin motivo', () => q(`select factura_pedir_baja('c1', $1, ' ')`, [id1]), /motivo/);
r = await q(`select factura_pedir_baja('c1', $1, 'Error en monto') v`, [id1]);
ok('baja correlativo 1', r.rows[0].v.correlativo === 1);
r = await q(`select ultimo from factura_series where serie like 'RC%'`);
ok('serie RC del día', r.rows.length === 1);
await espera('otro negocio no ve', () => q(`select factura_uno('c2', $1)`, [id1]), /No tienes acceso|no es de este negocio/);
await set('admin');
await espera('anular uno no aceptado', async () => {
  const x = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0009')]);
  await q(`select factura_pedir_baja('c1', $1, 'Error x')`, [x.rows[0].v.id]);
}, /aceptado/);
await set('dueno');
await q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...sinUltimo, igv_tipo: 'exonerado', leyenda_amazonia: '2002' })]);
await set('admin');
r = await q(`select factura_ajustes_leer('c1') v`);
ok('exonerado: tasa de hoy 0 y sin cambio', Number(r.rows[0].v.igv_tasa_hoy) === 0 && r.rows[0].v.igv_tasa_cambio === null);
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0010', 'boleta', 0)]);
r = await q(`select igv_porcentaje, leyendas from comprobantes_electronicos where id = $1`, [r.rows[0].v.id]);
ok('exonerado: 0 % y leyenda 2002', Number(r.rows[0].igv_porcentaje) === 0 && r.rows[0].leyendas[0] === '2002');

// ── 0002: servicios y productos en la Amazonía ──
await set('dueno');
await q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...sinUltimo, igv_tipo: 'exonerado', leyenda_amazonia: 'ambas' })]);
await set('admin');
r = await q(`select factura_ajustes_leer('c1') v`);
ok('ambas: se guarda', r.rows[0].v.leyenda_amazonia === 'ambas');
const ultimoAntes = Number((await q(`select ultimo from factura_series where company_id = 'c1' and serie = 'B001'`)).rows[0].ultimo);
await espera('ambas: sin decir qué se vendió no emite', () => q(`select factura_reservar('c1', $1::jsonb)`, [doc('clave-0030', 'boleta', 0)]), /servicios, productos o los dos/);
await espera('ambas: con leyenda inventada no emite', () => q(`select factura_reservar('c1', $1::jsonb)`, [JSON.stringify({ ...JSON.parse(doc('clave-0031', 'boleta', 0)), leyendas: ['1000'] })]), /servicios, productos o los dos/);
ok('ambas: el rechazo no gastó número', Number((await q(`select ultimo from factura_series where company_id = 'c1' and serie = 'B001'`)).rows[0].ultimo) === ultimoAntes);
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [JSON.stringify({ ...JSON.parse(doc('clave-0032', 'boleta', 0)), leyendas: ['2002'] })]);
r = await q(`select leyendas from comprobantes_electronicos where id = $1`, [r.rows[0].v.id]);
ok('ambas: solo servicio → 2002', JSON.stringify(r.rows[0].leyendas) === '["2002"]');
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [JSON.stringify({ ...JSON.parse(doc('clave-0033', 'boleta', 0)), leyendas: ['2002', '2001', '2002'] })]);
r = await q(`select leyendas from comprobantes_electronicos where id = $1`, [r.rows[0].v.id]);
ok('ambas: los dos → 2001 y 2002, sin repetir', JSON.stringify(r.rows[0].leyendas) === '["2001", "2002"]' || JSON.stringify(r.rows[0].leyendas) === '["2001","2002"]');
await set('dueno');
await q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...sinUltimo, igv_tipo: 'exonerado', leyenda_amazonia: '2002' })]);
await set('admin');
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [JSON.stringify({ ...JSON.parse(doc('clave-0034', 'boleta', 0)), leyendas: ['2001'] })]);
r = await q(`select leyendas from comprobantes_electronicos where id = $1`, [r.rows[0].v.id]);
ok('fija 2002: no hace caso a lo pedido', JSON.stringify(r.rows[0].leyendas) === '["2002"]');
await set('dueno');
await espera('leyenda inventada en Ajustes', () => q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...sinUltimo, igv_tipo: 'exonerado', leyenda_amazonia: '2003' })]), /leyenda_amazonia_check/);

// ── Restaurante u hotel MYPE: la tasa la pone la fecha ──
r = await q(`select factura_tasa_mype('2025-12-31') a, factura_tasa_mype('2026-01-01') b, factura_tasa_mype('2026-12-31') c,
  factura_tasa_mype('2027-01-01') d, factura_tasa_mype('2027-12-31') e, factura_tasa_mype('2028-01-01') f,
  factura_mype_proximo_cambio('2026-11-13') g, factura_mype_proximo_cambio('2027-06-01') h, factura_mype_proximo_cambio('2028-01-01') i`);
const t = r.rows[0];
const fecha = (x) => (x instanceof Date ? x.toISOString().slice(0, 10) : String(x));
ok('mype: 10 · 10,5 · 10,5 · 15 · 15 · 18', [t.a, t.b, t.c, t.d, t.e, t.f].map(Number).join() === '10,10.5,10.5,15,15,18');
ok('mype: próximos cambios 2027-01-01 · 2028-01-01 · ninguno', fecha(t.g) === '2027-01-01' && fecha(t.h) === '2028-01-01' && t.i === null);
await set('dueno');
r = await q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null) v`, [JSON.stringify({ ...sinUltimo, igv_tipo: 'mype', igv_porcentaje: 18 })]);
const hoyMype = Number((await q(`select factura_tasa_mype(factura_hoy()) x`)).rows[0].x);
const am = r.rows[0].v;
ok(`mype: ajustes dicen hoy ${hoyMype} % y sin leyenda`, am.igv_tipo === 'mype' && Number(am.igv_tasa_hoy) === hoyMype && am.leyenda_amazonia === null);
ok('mype: avisa el próximo cambio', am.igv_tasa_cambio === null || Number(am.igv_tasa_cambio.tasa) > hoyMype);
await set('admin');
await espera('mype: con 18 no emite', () => q(`select factura_reservar('c1', $1::jsonb)`, [doc('clave-0020', 'boleta', 18)]), new RegExp(`ahora es ${String(hoyMype).replace('.', ',')} %`));
r = await q(`select factura_reservar('c1', $1::jsonb) v`, [doc('clave-0021', 'boleta', hoyMype)]);
r = await q(`select igv_tipo, igv_porcentaje from comprobantes_electronicos where id = $1`, [r.rows[0].v.id]);
ok('mype: el comprobante queda gravado con la tasa de hoy', r.rows[0].igv_tipo === 'gravado' && Number(r.rows[0].igv_porcentaje) === hoyMype);
await set('dueno');
await espera('tipo de IGV inventado', () => q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...sinUltimo, igv_tipo: 'cero' })]), /igv_tipo_check/);
await set('admin');
await set('dueno');
await q(`select factura_ajustes_guardar('c1', $1::jsonb, null, null)`, [JSON.stringify({ ...sinUltimo, activo: false })]);
await set('admin');
await espera('apagado no emite', () => q(`select factura_reservar('c1', $1::jsonb)`, [doc('clave-0011')]), /no están activas/);
await set('dueno');
r = await q(`select factura_ajustes_guardar('c1', $1::jsonb, '', '') v`, [JSON.stringify({ ...sinUltimo, activo: false })]);
ok('token borrado', !r.rows[0].v.tokens.lucode);
r = await q(`select has_function_privilege('authenticated','public.factura_srv_cargar(uuid)','execute') a,
  has_function_privilege('anon','public.factura_srv_cargar(uuid)','execute') b,
  has_function_privilege('anon','public.factura_reservar(text,jsonb)','execute') c,
  has_table_privilege('authenticated','public.factura_credenciales','select') d,
  has_function_privilege('authenticated','public.factura_rol(text,boolean)','execute') e`);
const g = r.rows[0];
ok('permisos', g.a === false && g.b === true && g.c === false && g.d === false && g.e === false);
console.log(fallos ? `\n${fallos} FALLOS` : '\nTODO BIEN');
