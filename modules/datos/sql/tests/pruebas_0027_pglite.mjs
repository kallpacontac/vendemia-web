/**
 * Prueba de modules/datos/sql/0027_descanso_en_el_horario.sql (PGlite). Las funciones de las que
 * depende (v2_min, v2_clave_dia, v2_json de datos 0004; v2_tramo y v2_en_turno_el de tu-pagina 0011)
 * se sacan de esas migraciones, tal cual.
 *   mkdir <tmp> && cd <tmp> && npm i @electric-sql/pglite@0.2.17
 *   cp <repo>/modules/datos/sql/tests/pruebas_0027_pglite.mjs . && node pruebas_0027_pglite.mjs <repo>
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const repo = process.argv[2];
const leer = (p) => readFileSync(`${repo}/${p}`, 'utf8');
const funcion = (texto, nombre) => {
  const i = texto.indexOf(`create or replace function public.${nombre}(`);
  if (i < 0) throw new Error(`no encuentro ${nombre}`);
  const cuerpo = texto.indexOf('$$', i);
  const fin = texto.indexOf('$$', cuerpo + 2);
  return texto.slice(i, texto.indexOf(';', fin) + 1);
};
const d4 = leer('modules/datos/sql/0004_agenda_en_nube.sql');
const t11 = leer('modules/tu-pagina/sql/0011_canchas_y_avisame.sql');
const db = new PGlite();
let fallos = 0;
const ok = (n, c, x = '') => { if (!c) fallos++; console.log(c ? 'ok  ' : 'MAL ', n, x); };

for (const f of ['v2_min', 'v2_clave_dia', 'v2_json']) await db.exec(funcion(d4, f));
for (const f of ['v2_tramo', 'v2_dia_que_cubre', 'v2_en_turno_el']) await db.exec(funcion(t11, f));
const sql = leer('modules/datos/sql/0027_descanso_en_el_horario.sql').replace(/notify pgrst[^;]*;/g, '');
await db.exec(sql);
await db.exec(sql); // idempotente

// 2026-11-20 es viernes.
const negocio = { friday: { open: '09:00', close: '21:00', break_start: '13:00', break_end: '14:30' }, saturday: { open: '09:00', close: '21:00' } };
const cubre = async (h, fecha, hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return (await db.query(`select public.v2_dia_que_cubre($1::jsonb, $2, $3) is not null v`, [JSON.stringify(h), fecha, hh * 60 + mm])).rows[0].v;
};
ok('12:59 atiende', await cubre(negocio, '2026-11-20', '12:59'));
ok('13:00 almuerzo: no', !(await cubre(negocio, '2026-11-20', '13:00')));
ok('14:29 almuerzo: no', !(await cubre(negocio, '2026-11-20', '14:29')));
ok('14:30 vuelve', await cubre(negocio, '2026-11-20', '14:30'));
ok('sábado sin descanso: 13:00 atiende', await cubre(negocio, '2026-11-21', '13:00'));
ok('descanso mal escrito (fin antes): se ignora', await cubre({ friday: { open: '09:00', close: '21:00', break_start: '14:30', break_end: '13:00' } }, '2026-11-20', '13:30'));
ok('descanso a medias: se ignora', await cubre({ friday: { open: '09:00', close: '21:00', break_start: '13:00' } }, '2026-11-20', '13:30'));
ok('fuera de horario sigue cerrado', !(await cubre(negocio, '2026-11-20', '21:00')));
// Cierre pasada la medianoche (0011): la cola del día anterior sigue funcionando.
ok('madrugada del día siguiente (cierra 02:00)', await cubre({ friday: { open: '18:00', close: '02:00', break_start: '22:00', break_end: '22:30' } }, '2026-11-21', '01:00'));

// El barbero con su propio almuerzo, dentro del horario del negocio (v2_en_turno_el).
const turno = async (emp, hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return (await db.query(`select public.v2_en_turno_el($1, $2::jsonb, '2026-11-20', $3) v`, [JSON.stringify(emp), JSON.stringify({ friday: { open: '09:00', close: '21:00' } }), hh * 60 + mm])).rows[0].v;
};
const chino = { friday: { open: '09:00', close: '21:00', break_start: '15:00', break_end: '16:00' } };
ok('barbero: 13:00 atiende (su almuerzo es otro)', await turno(chino, '13:00'));
ok('barbero: 15:30 en su almuerzo', !(await turno(chino, '15:30')));
ok('sin horario propio: el del negocio', await turno({}, '15:30'));

console.log(fallos ? `\n${fallos} MAL` : '\ntodo bien');
process.exit(fallos ? 1 : 0);
