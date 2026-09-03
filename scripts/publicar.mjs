/**
 * CONSTRUIR LA LANDING ESTÁTICA · node scripts/publicar.mjs
 *
 * Deja en out/ la landing —una sola página, con sus assets— lista para subir a
 * cualquier servidor estático, servida en la raíz de un dominio, dentro de un
 * subdirectorio o abierta a pelo desde el disco.
 *
 *   npm run publicar        → construye out/ y comprueba que está entero
 *   npm run publicar --ver  → además lo sirve en localhost para mirarlo
 *
 * ⚠️ ESTO YA NO PUBLICA EL PANEL, Y NO ES UN DESCUIDO.
 *
 * El sitio de verdad se despliega en Vercel: ahí van la landing Y el panel, que
 * es lo que se enseña al cliente. Ver README › Desplegar.
 *
 * El panel no puede salir por aquí por dos razones que se suman:
 *
 *   1 · Necesita las variables NEXT_PUBLIC_SUPABASE_*, que se incrustan en el
 *       bundle al construir. Un out/ suelto se queda con las que hubiera en esa
 *       máquina, y viajando en un .zip eso es una clave paseándose.
 *   2 · El prefijo relativo "./" que permite abrir la landing desde cualquier
 *       carpeta solo funciona con UNA página en la raíz. Desde /panel/leads,
 *       "./_next/…" resuelve a /panel/_next/… — 404, página sin estilos ni JS.
 *
 * Así que el paso 2 borra de out/ las rutas del panel: sale solo la landing, y
 * con eso el prefijo relativo vuelve a ser correcto.
 *
 * ── HISTÓRICO ─────────────────────────────────────────────────────────────
 * Este script copiaba el resultado a una carpeta hermana (kallpabot-backoffice)
 * porque el fuente y el sitio publicado vivían separados. Ya no: son un solo
 * proyecto y el artefacto es out/. Si buscas la carpeta vieja, se retiró como
 * kallpabot-backoffice.anterior.
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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

/* ⚠️ app/api NO CABE EN UN EXPORT ESTÁTICO, y hay que apartarlo antes de
   construir, no después.

   `app/api/cloudinary/firma` firma las subidas de fotos del catálogo: es la
   única pieza de servidor del proyecto. Con `output: 'export'` el build no
   avisa ni la ignora — falla entero:

     Error: export const dynamic = "force-dynamic" on page
     "/api/cloudinary/firma" cannot be used with "output: export"

   Y es correcto que falle: un artefacto estático no puede tener un endpoint que
   firma con un secreto. Así que se aparta durante el build y se devuelve
   después, con el mismo criterio que el resto de este paso — este artefacto es
   la landing sola, y la landing no sube fotos.

   Se usa un `try/finally` para que un build fallido NO deje el proyecto sin
   `app/api`: eso rompería el despliegue de Vercel sin que nadie relacione una
   cosa con la otra. */
const API = join(RAIZ, 'app', 'api');
const API_GUARDADA = join(RAIZ, '.api-apartada');
const habiaApi = existsSync(API);
if (habiaApi) {
  rmSync(API_GUARDADA, { recursive: true, force: true });
  cpSync(API, API_GUARDADA, { recursive: true });
  rmSync(API, { recursive: true, force: true });
}
try {
  execFileSync('npx', ['next', 'build'], {
    cwd: RAIZ,
    stdio: 'inherit',
    env: { ...process.env, EXPORTAR_ESTATICO: '1' },
    shell: process.platform === 'win32',
  });
} finally {
  if (habiaApi) {
    cpSync(API_GUARDADA, API, { recursive: true });
    rmSync(API_GUARDADA, { recursive: true, force: true });
    bien('app/api devuelto a su sitio');
  }
}

/* ── 2 · Fuera lo que no es la landing ─────────────────────────────────────
   /dev/assets es el inventario de assets: útil trabajando, y algo embarazoso
   en producción.

   El panel y el login se quitan por lo explicado arriba: este artefacto es la
   landing sola. Quien quiera el panel, que lo despliegue en Vercel. */
for (const sobra of ['dev', 'panel', 'panel.html', 'panel.txt', 'login', 'login.html', 'login.txt',
                     'nueva-clave.html', 'nueva-clave.txt', 'callback.html', 'callback.txt']) {
  const ruta = join(SALIDA, sobra);
  if (existsSync(ruta)) {
    rmSync(ruta, { recursive: true, force: true });
    bien(`/${sobra} excluido`);
  }
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
  'index.html', '_next', 'brand', 'ilustraciones', 'assets/logos',
];
const faltan = IMPRESCINDIBLES.filter((f) => !existsSync(join(SALIDA, f)));
if (faltan.length) {
  throw new Error(`El sitio está incompleto. Falta en out/:\n  ${faltan.join('\n  ')}`);
}
bien(`${IMPRESCINDIBLES.length} piezas imprescindibles presentes`);

/* /login y /panel SON absolutas a propósito y no cuentan como error: apuntan
   al despliegue de Vercel, que es donde vive el panel. Si un día esta landing
   se cuelga en otro dominio, esos dos enlaces tendrán que ser absolutos de
   verdad (https://…), no relativos — pero eso es otra decisión. */
const ESPERADAS = ['/login', '/panel'];
const sueltas = [...readFileSync(join(SALIDA, 'index.html'), 'utf8')
  .matchAll(/(?:src|href)="(\/[^"/][^"]*)"/g)]
  .map((m) => m[1])
  .filter((u) => !ESPERADAS.includes(u));
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
