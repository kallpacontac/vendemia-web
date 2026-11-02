#!/usr/bin/env node
/**
 * Manda un mismo aviso push a los dueños y admins de todos los negocios, con el texto que quieras.
 * Es aparte de modules/avisos, que solo sabe mandar sus textos fijos por tipo: no toca la base ni
 * pide desplegar.
 *
 *   1 · node scripts/avisos-broadcast.mjs --sql
 *       Imprime la consulta. Córrela en el SQL editor de Supabase justo antes de enviar y guarda el
 *       resultado en un .json FUERA del repo: lleva las claves push de cada celular.
 *
 *   2 · node --env-file=.env.local scripts/avisos-broadcast.mjs --subs <archivo.json> \
 *         --titulo "…" --cuerpo "…" [--url /panel/…] [--negocio fundexa,barberia] [--enviar]
 *
 *   Sin --enviar no sale nada: dice a qué negocios y a cuántos celulares llegaría.
 *   --negocio  solo a estos, separados por comas. Vale parte del nombre o del company_id, sin
 *              importar tildes ni mayúsculas, así que «barberia» entra en TODAS las barberías:
 *              mira la lista antes de enviar. Si uno no coincide con nada, no se envía a ninguno.
 *   --url     la pantalla que abre al tocarlo. Tiene que empezar por /panel (panel-sw.js ignora
 *              cualquier otra). Por defecto, /panel.
 *
 * El `tag` sale del título: repetir el mismo aviso reemplaza al anterior en la bandeja en vez de
 * apilarse. Quien está en su horario de silencio no entra en la consulta y NO lo recibe después.
 * Necesita el par VAPID de producción (WEB_PUSH_VAPID_*): con otro, los servicios de push lo rechazan.
 */
import { readFileSync } from 'node:fs';
import webpush from 'web-push';

const CONSULTA = `select coalesce(jsonb_agg(jsonb_build_object(
    'company_id', s.company_id, 'negocio', c.name,
    'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]'::jsonb) as subs
  from public.panel_push_subscriptions s
  join public.companies c on c.id = s.company_id
 where s.revoked_at is null
   and public.avisos_recibe(s.auth_user_id, s.company_id)
   and not public.avisos_en_silencio(s.silencio_desde, s.silencio_hasta);`;

const POR_TANDA = 50;

const args = process.argv.slice(2);
const bandera = (b) => args.includes(b);
const valor = (b) => {
  const i = args.indexOf(b);
  return i >= 0 ? args[i + 1] : undefined;
};
const salir = (mensaje) => {
  console.error(mensaje);
  process.exit(1);
};

if (bandera('--sql')) {
  console.log(CONSULTA);
  process.exit(0);
}

const archivo = valor('--subs');
const titulo = valor('--titulo')?.trim();
const cuerpo = valor('--cuerpo')?.trim();
const url = valor('--url') ?? '/panel';
const normal = (t) => String(t ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
const terminos = (valor('--negocio') ?? '').split(',').map(normal).filter(Boolean);
const entra = (s, t) => normal(s.company_id).includes(t) || normal(s.negocio).includes(t);

if (!archivo || !titulo || !cuerpo) {
  salir('Uso: node --env-file=.env.local scripts/avisos-broadcast.mjs --subs <archivo.json> --titulo "…" --cuerpo "…" [--url /panel/…] [--negocio fundexa,barberia] [--enviar]\nPara sacar el archivo: node scripts/avisos-broadcast.mjs --sql');
}
if (!url.startsWith('/panel')) salir('--url tiene que empezar por /panel: el aviso del panel no abre otra cosa.');

function leerSuscripciones(ruta) {
  let datos;
  try {
    datos = JSON.parse(readFileSync(ruta, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    salir(`No pude leer ${ruta}: ${e.message}`);
  }
  // El SQL editor copia solo la celda, o la fila entera: [{ "subs": [...] }].
  if (Array.isArray(datos) && datos[0]?.subs) datos = datos[0].subs;
  if (typeof datos === 'string') datos = JSON.parse(datos);
  if (!Array.isArray(datos)) salir(`${ruta} no es la lista que devuelve la consulta de --sql.`);
  return datos;
}

const todas = leerSuscripciones(archivo);
const sinCoincidir = terminos.filter((t) => !todas.some((s) => entra(s, t)));
if (sinCoincidir.length) {
  salir(`No se envió nada: «${sinCoincidir.join('», «')}» no coincide con ningún negocio del archivo. O no se llama así, o nadie allí activó los avisos, o está en su horario de silencio.`);
}
const elegidas = terminos.length ? todas.filter((s) => terminos.some((t) => entra(s, t))) : todas;

// Un celular con dos negocios tiene dos filas y el mismo endpoint: un solo aviso.
const unicas = new Map();
for (const s of elegidas) {
  if (!unicas.has(s.endpoint)) unicas.set(s.endpoint, s);
}
const subs = [...unicas.values()];
const mensaje = { title: titulo, body: cuerpo, url, tag: `broadcast:${titulo}` };
const negocios = [...new Set(elegidas.map((s) => s.negocio ?? s.company_id))];

console.log(`\n«${titulo}»\n${cuerpo}\nAbre: ${url}\n`);
console.log(`Destino: ${subs.length} celulares de ${negocios.length} negocios:\n  ${negocios.join('\n  ')}\n`);

if (!subs.length) salir('No hay a quién enviarle. Revisa el archivo.');
if (!bandera('--enviar')) {
  console.log('No se envió nada. Añade --enviar para mandarlo.');
  process.exit(0);
}

const { WEB_PUSH_VAPID_PUBLIC_KEY: publica, WEB_PUSH_VAPID_PRIVATE_KEY: privada, WEB_PUSH_SUBJECT: sujeto } = process.env;
if (!publica || !privada || !sujeto) {
  salir('Faltan WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY o WEB_PUSH_SUBJECT. ¿Usaste --env-file=.env.local?');
}
webpush.setVapidDetails(sujeto, publica, privada);

const cuerpoPush = JSON.stringify(mensaje);
let aceptados = 0;
const caducados = [];
const errores = [];

// Las mismas opciones que modules/fideliza/servidor/push.ts, pero por tandas.
for (let i = 0; i < subs.length; i += POR_TANDA) {
  await Promise.all(
    subs.slice(i, i + POR_TANDA).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpoPush, {
          TTL: 60 * 60 * 12,
          timeout: 10_000,
        });
        aceptados++;
      } catch (e) {
        // 404/410: el navegador ya no existe o quitó el permiso.
        if (e.statusCode === 404 || e.statusCode === 410) caducados.push(s.endpoint);
        else errores.push(`${s.negocio ?? s.company_id}: HTTP ${e.statusCode ?? e.code ?? e.message}`);
      }
    }),
  );
}

// Aceptado por el servicio de push del navegador ≠ entregado ni leído.
console.log(`\nAceptados: ${aceptados} · Caducados: ${caducados.length} · Con error: ${errores.length}`);
if (errores.length) console.log(`\nCon error:\n  ${errores.join('\n  ')}`);
if (caducados.length) {
  const lista = caducados.map((c) => `'${c.replaceAll("'", "''")}'`).join(',\n  ');
  console.log(`\nPara dar de baja los caducados, corre esto en el SQL editor:\nupdate public.panel_push_subscriptions set revoked_at = now()\n where revoked_at is null and endpoint in (\n  ${lista});`);
}
process.exit(errores.length ? 1 : 0);
