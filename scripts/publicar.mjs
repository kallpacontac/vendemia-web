/**
 * CONSTRUIR EL SITIO COMPLETO · node scripts/publicar.mjs
 *
 * Deja en out/ el sitio entero listo para subir a cualquier servidor estático:
 * la landing (index.html) y las páginas del panel (login, dashboard, agenda…),
 * con sus assets. No hay segundo proyecto ni segunda carpeta.
 *
 *   npm run publicar        → construye out/ y comprueba que está entero
 *   npm run publicar --ver  → además lo sirve en localhost para mirarlo
 *
 * ── DE DÓNDE SALE CADA COSA ───────────────────────────────────────────────
 *   index.html                 lo genera Next desde app/ y components/
 *   _next/, ilustraciones/     lo genera Next desde public/ y el build
 *   login.html, dashboard.html…  se copian tal cual desde public/
 *
 * Las páginas del panel se editan A MANO en public/. Next no las toca: las
 * copia. Eso es a propósito — son HTML sencillo que no necesita build, y
 * meterlas en React solo para "unificar" habría sido reescribir siete páginas
 * que ya funcionan.
 *
 * ── HISTÓRICO ─────────────────────────────────────────────────────────────
 * Este script copiaba el resultado a una carpeta hermana (kallpabot-backoffice)
 * porque el fuente y el sitio publicado vivían separados. Ya no: son un solo
 * proyecto y el artefacto es out/. Si buscas la carpeta vieja, se retiró como
 * kallpabot-backoffice.anterior.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'out');
const ver = process.argv.includes('--ver');

const bien = (s) => console.log(`  ✓ ${s}`);

/* ── 1 · Construir ────────────────────────────────────────────────────────── */
console.log('\n▸ Construyendo el sitio…');
rmSync(SALIDA, { recursive: true, force: true });
rmSync(join(RAIZ, '.next'), { recursive: true, force: true });
execFileSync('npx', ['next', 'build'], {
  cwd: RAIZ,
  stdio: 'inherit',
  env: { ...process.env, EXPORTAR_ESTATICO: '1' },
  shell: process.platform === 'win32',
});

/* ── 2 · Fuera la página de desarrollo ─────────────────────────────────────
   /dev/assets es el inventario de assets: útil trabajando, y algo embarazoso
   en producción. */
if (existsSync(join(SALIDA, 'dev'))) {
  rmSync(join(SALIDA, 'dev'), { recursive: true, force: true });
  bien('/dev/assets excluido');
}

/* ── 3 · Rutas relativas ───────────────────────────────────────────────────
   `assetPrefix: './'` arregla /_next/, pero no lo que escribe la propia página:
   las ilustraciones salen de lib/assets.ts como "/algo" y los iconos los emite
   Next como "/icon.png?hash". Eso es correcto en desarrollo y un 404 en
   cualquier sitio que no sea la raíz exacta del dominio.

   ⚠️ La lista se deriva de lo que el build ACABA de emitir, no está escrita a
   mano: con una lista fija se escaparon /icon.png y /apple-icon.png, que no son
   carpetas nuestras sino ficheros que Next genera por convención. */
const RAICES = readdirSync(SALIDA);
let reescritos = 0;
for (const f of listar(SALIDA).filter((x) => /\.(html|css|js|txt)$/.test(x))) {
  const antes = readFileSync(f, 'utf8');
  let despues = antes;
  for (const raiz of RAICES) {
    for (const abre of ['"', "'", '(']) {
      despues = despues.split(`${abre}/${raiz}`).join(`${abre}./${raiz}`);
    }
  }
  if (despues !== antes) { writeFileSync(f, despues); reescritos++; }
}
bien(`rutas absolutas pasadas a relativas · ${reescritos} fichero(s)`);

/* ── 4 · Comprobar que el sitio está ENTERO ────────────────────────────────
   No basta con que compile: si alguien borra una página de public/ por error,
   el build sigue saliendo verde y el sitio se queda sin panel. */
const IMPRESCINDIBLES = [
  'index.html', 'login.html', 'dashboard.html', 'agenda.html',
  'leads.html', 'mensajes.html', 'metricas.html', 'configuracion.html',
  'assets/app.css', 'assets/data.js', '_next',
];
const faltan = IMPRESCINDIBLES.filter((f) => !existsSync(join(SALIDA, f)));
if (faltan.length) {
  throw new Error(`El sitio está incompleto. Falta en out/:\n  ${faltan.join('\n  ')}`);
}
bien(`${IMPRESCINDIBLES.length} piezas imprescindibles presentes`);

const sueltas = [...readFileSync(join(SALIDA, 'index.html'), 'utf8')
  .matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)].map((m) => m[1]);
if (sueltas.length) {
  console.warn(`\n  ⚠️  Quedan rutas absolutas en index.html:\n${[...new Set(sueltas)].map((u) => '       ' + u).join('\n')}`);
} else {
  bien('no queda ninguna ruta absoluta en index.html');
}

console.log(`\n✔ Sitio completo en\n  ${SALIDA}\n`);
console.log('  Súbelo tal cual a cualquier servidor estático.\n');

/* ── 5 · Verlo, si se pide ─────────────────────────────────────────────────── */
if (ver) {
  const TIPOS = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
    '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon',
  };
  createServer((req, res) => {
    const r = decodeURIComponent(req.url.split('?')[0]);
    let f = join(SALIDA, r === '/' ? 'index.html' : r);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!existsSync(f)) { res.writeHead(404); return res.end('404 ' + r); }
    res.writeHead(200, { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  }).listen(4173, () => {
    console.log('  Sirviendo en http://localhost:4173  (Ctrl+C para parar)\n');
  });
}

/** Lista recursiva de ficheros. */
function listar(dir) {
  const salida = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...listar(ruta));
    else salida.push(ruta);
  }
  return salida;
}
