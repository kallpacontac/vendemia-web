#!/usr/bin/env node
/**
 * GENERADOR DE ASSETS DE MARCA
 *
 *   node scripts/logo.mjs
 *
 * Entrada:  uploads/logo-principal.png — el lockup original, azul sobre blanco.
 * Salida:   public/brand/*.svg  — el isotipo vectorizado. Es LO QUE USA LA WEB.
 *           public/brand/*.webp — lockup y rásteres para OG, prensa y correo.
 *
 * Es determinista y reejecutable: borra y reescribe public/brand entero.
 *
 * ── Cómo se vectoriza, y por qué así ─────────────────────────────────────
 * Trazar la imagen entera de una pasada no sirve: potrace es binario, así que
 * daría una silueta negra sin ojos ni contorno.
 *
 * Lo que hace que esto salga limpio es que el dibujo, pese a parecer
 * ilustrado, son CUATRO TINTAS PLANAS. Medido con k-means sobre los píxeles
 * opacos: naranja 68 %, sombra del avión 14 %, tinta navy 9 %, blanco 3 %. El
 * resto (~6 %) son píxeles de antialias entre esas cuatro, no colores
 * propios. Así que se cuantiza a esas cuatro, se saca una máscara por tinta y
 * se traza cada una por separado.
 *
 * Dos detalles que deciden la calidad:
 *
 *   · Se traza al DOBLE de resolución con reescalado suave. potrace umbraliza,
 *     y sobre un borde duro de 1 px eso da curvas escalonadas. Con el borde en
 *     rampa el umbral cae en subpíxel y las curvas salen redondas.
 *
 *   · Las capas se pintan de mayor a menor área y cada máscara va DILATADA
 *     (umbral por encima del medio). Sin ese solape, entre dos regiones
 *     vecinas queda una costura de fondo de un píxel, que a tamaño grande se
 *     ve como un pelo blanco recorriendo el contorno.
 *
 * Al ser vector, la variante azul de marca sale gratis: son los mismos paths
 * con otro mapa de relleno.
 *
 * ── Las tres operaciones sobre el ráster ──────────────────────────────────
 *
 * 1. QUITAR EL FONDO — con flood fill desde los bordes, NO con un umbral
 *    global de "casi blanco". La diferencia importa: Mia lleva la palabra
 *    "mia" en BLANCO dentro del cuerpo. Un umbral global se la come y deja
 *    un agujero. El flood fill nunca alcanza ese blanco porque está rodeado
 *    de azul por todos lados.
 *
 * 2. RECUPERAR EL BORDE — los píxeles de antialias son mezcla de tinta y
 *    fondo, así que no entran en el flood fill (no llegan al umbral) y se
 *    quedarían como un halo blanco opaco. A los que tocan el fondo se les
 *    calcula alfa por distancia al blanco y se les deshace la mezcla
 *    (unpremultiply). Sin esto el logo se ve recortado con tijeras.
 *
 * 3. REENTINTAR — el original es azul #0167F9 y el sitio va en naranja
 *    #FF4900. Los dos son el mismo color en HSL salvo el matiz, así que
 *    basta una rotación de matiz constante: conserva saturación y
 *    luminosidad, o sea que los degradados del avión sobreviven intactos.
 *    Se excluye la tinta oscura (ojos, boca, contorno): el logo de
 *    referencia la mantiene navy sobre el cuerpo naranja.
 */

import sharp from 'sharp';
import potrace from 'potrace';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(ROOT, '../../uploads/logo-principal.png');
const OUT = path.join(ROOT, 'public', 'brand');

/* ── Parámetros ─────────────────────────────────────────────────────────── */

/** Un píxel es fondo si su canal más bajo llega aquí. El fondo real mide
 *  250–255; la tinta más clara del arte baja de 200. 235 cae en tierra de
 *  nadie, que es donde tiene que estar. */
const BG_MIN = 235;

/** Ancho de la banda de antialias que se rescata alrededor del fondo. */
const FEATHER = 3;

/** Corte entre mascota y wordmark. Sale del perfil de tinta por columna:
 *  la punta del avión se apaga en x≈575 y la "v" arranca en x≈580. */
const SPLIT_X = 578;

/** Ventana del AVATAR (chispas + cabeza + mano que saluda), en fracciones del
 *  lienzo cuadrado del isotipo. Por debajo de ~32 px el avión de papel es una
 *  mancha y la cara de Mia deja de leerse; a ese tamaño se usa este recorte.
 *
 *  Los límites NO son a ojo, salen de medir las rachas de alfa por fila:
 *    chispas   y 0.040 – 0.099   x 0.613 – 0.727
 *    cabeza    y 0.110 – 0.36    x 0.300 – 0.742
 *    mano      y 0.28  – 0.36    x 0.758 – 0.843  (separada de la cabeza)
 *  El corte de abajo tiene dos límites y hay que respetar los dos:
 *    · no más arriba de ~0.38, o entra en los hombros y el recorte se lee como
 *      un rectángulo cortado en vez de un busto;
 *    · no más abajo de 0.385, que es donde empieza el PUNTO DE LA "i" de la
 *      palabra "mia" que Mia lleva en el pecho. Colarlo dejaba una mota blanca
 *      suelta bajo la barbilla que parecía suciedad del recorte.
 *  0.382 es la única franja que cumple las dos. */
const AVATAR = { x0: 0.29, x1: 0.855, y0: 0.028, y1: 0.382 };

/** Azul de marca (PALETA.md) → naranja del sitio (globals.css). */
const BRAND_BLUE = '#0167F9';
const SITE_ORANGE = '#FF4900';

/** Por debajo de esta luminosidad no se reentinta: es la tinta navy
 *  (#02091C) de ojos, boca y contorno, y se queda como está. */
const INK_L_MAX = 0.22;
const MIN_SAT = 0.15;

/**
 * Las cuatro tintas del dibujo. Los valores salen de un k-means sobre los
 * píxeles opacos, redondeados a los tokens de marca donde caían casi encima
 * (el naranja medido era #FE4A06 y el token es #FF4900).
 *
 * `blue` es el mismo color deshaciendo la rotación de matiz: la variante azul
 * no se vuelve a trazar, solo cambia de relleno.
 */
const INKS = [
  { id: 'body', orange: '#FF4900' },
  { id: 'shade', orange: '#D03E02' },
  { id: 'ink', orange: '#02091C' },
  { id: 'paper', orange: '#FFFFFF' },
];

/** Factor de sobremuestreo al trazar. 2 basta; 3 no mejora y triplica el path. */
const TRACE_SCALE = 2;

/**
 * Umbral de potrace sobre la máscara (forma en negro, fondo en blanco). Por
 * encima de 128 la forma crece: es la dilatación que evita costuras entre
 * capas vecinas. 168 ≈ medio píxel a escala 2.
 */
const TRACE_THRESHOLD = 168;

/* ── Color ──────────────────────────────────────────────────────────────── */

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function rgb2hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hk = h / 360;
  return [f(hk + 1 / 3), f(hk), f(hk - 1 / 3)].map((v) => Math.round(v * 255));
}

const HUE_SHIFT =
  rgb2hsl(...hex2rgb(SITE_ORANGE))[0] - rgb2hsl(...hex2rgb(BRAND_BLUE))[0];

/* ── 1 + 2 · Fondo fuera ────────────────────────────────────────────────── */

/**
 * Devuelve un RGBA del tamaño original con el fondo blanco a alfa 0 y el
 * borde recuperado.
 */
function cutBackground(data, W, H) {
  const N = W * H;
  const out = Buffer.alloc(N * 4);
  const isBg = new Uint8Array(N);

  const minc = (i) => {
    const o = i * 4;
    return Math.min(data[o], data[o + 1], data[o + 2]);
  };

  // Flood fill 4-conexo desde todo el marco. Pila explícita: 1.5 M píxeles
  // desbordan la pila de llamadas de Node sin despeinarse.
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (i) => {
    if (!isBg[i] && minc(i) >= BG_MIN) { isBg[i] = 1; stack[sp++] = i; }
  };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }

  while (sp > 0) {
    const i = stack[--sp];
    const x = i % W, y = (i / W) | 0;
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
  }

  // Banda de antialias: píxeles NO-fondo con algún vecino fondo a <= FEATHER.
  const nearBg = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isBg[i]) continue;
      let hit = false;
      for (let dy = -FEATHER; dy <= FEATHER && !hit; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -FEATHER; dx <= FEATHER; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (isBg[yy * W + xx]) { hit = true; break; }
        }
      }
      nearBg[i] = hit ? 1 : 0;
    }
  }

  for (let i = 0; i < N; i++) {
    const o = i * 4;
    if (isBg[i]) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }

    const r = data[o], g = data[o + 1], b = data[o + 2];

    if (!nearBg[i]) {
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
      continue;
    }

    // Mezcla sobre blanco: P = a·F + (1-a)·255.
    // La opacidad la marca el canal más bajo, que es el que más se aleja del
    // fondo; 60 niveles de rampa cubren el antialias sin comerse trazo fino.
    const a = Math.max(0, Math.min(1, (255 - Math.min(r, g, b)) / 60));
    if (a <= 0.004) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
    const un = (v) => Math.max(0, Math.min(255, Math.round((v - 255 * (1 - a)) / a)));
    out[o] = un(r); out[o + 1] = un(g); out[o + 2] = un(b);
    out[o + 3] = Math.round(a * 255);
  }

  return out;
}

/* ── 3 · Reentintado ────────────────────────────────────────────────────── */

/** Rota el matiz del cuerpo de color y deja intacta la tinta oscura. */
function retint(rgba, N) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    if (out[o + 3] === 0) continue;
    const [h, s, l] = rgb2hsl(out[o], out[o + 1], out[o + 2]);
    if (s < MIN_SAT || l < INK_L_MAX) continue;
    const [r, g, b] = hsl2rgb(h + HUE_SHIFT, s, l);
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  return out;
}

/** Lleva la tinta oscura a blanco dentro de un rango de columnas. Se usa solo
 *  en el wordmark del lockup: en la mascota dejaría los ojos en blanco sobre
 *  la cara naranja, que es exactamente lo que no queremos. */
function inkToWhite(rgba, W, N, fromX) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    if (out[o + 3] === 0 || i % W < fromX) continue;
    const [h, s, l] = rgb2hsl(out[o], out[o + 1], out[o + 2]);
    if (l > 0.45) continue; // solo la tinta, no el acento de color
    if (s > 0.55 && l > 0.25) continue;
    const [r, g, b] = hsl2rgb(h, s * 0.2, 1 - l * 0.35);
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  return out;
}

/* ── Vectorizado ────────────────────────────────────────────────────────── */

/** El color equivalente en la tinta azul original: deshace la rotación de
 *  matiz. Los acromáticos (blanco) y la tinta navy se quedan igual, por la
 *  misma razón que en retint(). */
function toBlue(hex) {
  const [h, s, l] = rgb2hsl(...hex2rgb(hex));
  if (s < MIN_SAT || l < INK_L_MAX) return hex;
  const [r, g, b] = hsl2rgb(h - HUE_SHIFT, s, l);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Índice de tinta más cercana por píxel. 255 = transparente. */
function quantize(rgba, N, palette) {
  const rgbs = palette.map((p) => hex2rgb(p.orange));
  const out = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    let best = 0, bd = Infinity;
    for (let k = 0; k < rgbs.length; k++) {
      const d =
        (rgba[o] - rgbs[k][0]) ** 2 +
        (rgba[o + 1] - rgbs[k][1]) ** 2 +
        (rgba[o + 2] - rgbs[k][2]) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    out[i] = best;
  }
  return out;
}

/**
 * Quita motas del mapa de tintas.
 *
 * Cuantizar manda cada píxel de antialias a la tinta más cercana, y en un
 * borde naranja↔navy los intermedios caen en "blanco". Resultado: miles de
 * motas de 1–3 px repartidas por todos los contornos. Trazadas tal cual daban
 * 338 kB de SVG, y el 40 % era la capa blanca — que en el dibujo es solo la
 * palabra "mia" y los brillos de los ojos.
 *
 * Filtro de MINORÍA, no de moda: un píxel solo cambia si su propia clase está
 * en franca minoría en su 3×3. Un filtro de moda a secas adelgaza los trazos
 * finos (las letras de "mia" miden ~10 px) y aquí no hace falta tocarlos.
 * El transparente cuenta como una clase más, para no comerse la silueta.
 */
function despeckle(idx, W, H, passes = 2) {
  let cur = idx;
  for (let pass = 0; pass < passes; pass++) {
    const next = Uint8Array.from(cur);
    const tally = new Map();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        tally.clear();
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const v = cur[i + dy * W + dx];
            tally.set(v, (tally.get(v) || 0) + 1);
          }
        if ((tally.get(cur[i]) || 0) > 3) continue; // no está en minoría
        let best = cur[i], bn = -1;
        for (const [v, n] of tally) if (n > bn) { bn = n; best = v; }
        next[i] = best;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * potrace escribe tres decimales en cada coordenada ("735.703"), y eso era
 * casi la mitad del fichero. Se redondea a entero: como se traza al doble de
 * resolución, un entero aquí son 0.5 px del dibujo original — a 132 px en
 * pantalla, la décima parte de un píxel.
 *
 * Se puede redondear cada número por su cuenta sin acumular error porque
 * potrace emite coordenadas ABSOLUTAS (M/L/C en mayúscula).
 */
const compactPath = (d) =>
  d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n))))
    .replace(/\s+/g, ' ')
    .trim();

/** Traza una máscara (forma negra sobre blanco) y devuelve solo el atributo d. */
function tracePath(pngBuffer) {
  return new Promise((resolve, reject) => {
    const p = new potrace.Potrace({
      threshold: TRACE_THRESHOLD,
      blackOnWhite: true,
      turdSize: 60,
      alphaMax: 1,
      optCurve: true,
      optTolerance: 0.6,
    });
    p.loadImage(pngBuffer, (err) => {
      if (err) return reject(err);
      const tag = p.getPathTag();
      const m = /\bd="([^"]*)"/.exec(tag);
      resolve(m ? compactPath(m[1]) : '');
    });
  });
}

/**
 * Convierte un RGBA en una lista de capas vectoriales, de mayor a menor área.
 * Las coordenadas quedan en el espacio ampliado (×TRACE_SCALE).
 */
async function vectorize(rgba, W, H) {
  const idx = despeckle(quantize(rgba, W * H, INKS), W, H);

  const areas = INKS.map((_, k) => idx.reduce((n, v) => n + (v === k ? 1 : 0), 0));
  const order = INKS.map((ink, k) => ({ ink, k, area: areas[k] }))
    .filter((l) => l.area > 0)
    .sort((a, b) => b.area - a.area);

  const layers = [];
  for (const { ink, k, area } of order) {
    const mask = Buffer.alloc(W * H, 255);
    for (let i = 0; i < W * H; i++) if (idx[i] === k) mask[i] = 0;

    const png = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
      .resize(W * TRACE_SCALE, H * TRACE_SCALE, { kernel: 'lanczos3' })
      .png()
      .toBuffer();

    const d = await tracePath(png);
    if (d) layers.push({ id: ink.id, orange: ink.orange, d, area });
  }
  return layers;
}

/**
 * Documento SVG a partir de las capas.
 *
 * `size` va en píxeles del ráster de origen (sin ampliar), que es como se
 * razona en el resto del script; aquí se multiplica por la escala de trazado.
 */
function svgDoc(layers, size, tint) {
  const S = TRACE_SCALE;
  const vb = [0, 0, size.width * S, size.height * S].join(' ');
  const body = layers
    .map((l) => `<path fill="${tint === 'blue' ? toBlue(l.orange) : l.orange}" d="${l.d}"/>`)
    .join('\n  ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ` +
    `width="${size.width}" height="${size.height}" role="img" aria-label="Mia · Vendemia">\n  ` +
    body +
    '\n</svg>\n'
  );
}

/* ── Recorte ────────────────────────────────────────────────────────────── */

function alphaBBox(rgba, W, H, x0 = 0, x1 = W - 1, y0 = 0, y1 = H - 1) {
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (rgba[(y * W + x) * 4 + 3] > 12) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/* ── Escritura ──────────────────────────────────────────────────────────── */

const made = [];

async function emit(name, pipeline) {
  const webp = path.join(OUT, `${name}.webp`);
  await pipeline.clone().webp({ lossless: true, effort: 6 }).toFile(webp);
  made.push(webp);
  return webp;
}

async function emitPng(name, pipeline) {
  const png = path.join(OUT, `${name}.png`);
  await pipeline.clone().png({ compressionLevel: 9, palette: false }).toFile(png);
  made.push(png);
  return png;
}

/* ── Main ───────────────────────────────────────────────────────────────── */

const { data, info } = await sharp(SRC).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, N = W * H;
// removeAlpha deja 3 canales; el cortador trabaja en 4 para no duplicar rutas.
const rgba0 = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  rgba0[i * 4] = data[i * 3];
  rgba0[i * 4 + 1] = data[i * 3 + 1];
  rgba0[i * 4 + 2] = data[i * 3 + 2];
  rgba0[i * 4 + 3] = 255;
}

console.log(`origen ${W}×${H}  ·  matiz ${HUE_SHIFT.toFixed(1)}°  (${BRAND_BLUE} → ${SITE_ORANGE})`);

const cut = cutBackground(rgba0, W, H);
const orange = retint(cut, N);
const lockupDark = inkToWhite(orange, W, N, SPLIT_X);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const raw = (buf) => sharp(buf, { raw: { width: W, height: H, channels: 4 } });

const markBox = alphaBBox(cut, W, H, 0, SPLIT_X - 1);
const fullBox = alphaBBox(cut, W, H);
console.log('isotipo', markBox, '\nlockup ', fullBox);

/**
 * Margen uniforme, proporcional al lado mayor. NO se cuadra el lienzo: el
 * avatar es un recorte ancho y bajo, y meterlo en un cuadrado le añade un 30 %
 * de aire vertical vacío. Como los componentes dimensionan por ALTURA, ese
 * aire se traduce directamente en un logo que se ve pequeño y descolgado al
 * lado del wordmark. Proporción natural y a cada asset su caja.
 *
 * El 2 % existe solo para no cortar el antialias que queda por debajo del
 * umbral de alfa con el que se calculó la caja.
 */
function pad(box, ratio = 0.02) {
  const p = Math.round(Math.max(box.width, box.height) * ratio);
  return { top: p, bottom: p, left: p, right: p, background: { r: 0, g: 0, b: 0, alpha: 0 } };
}

/** Cuadrado y centrado. Solo para los iconos de app, que sí lo son. */
function squarePad(box, ratio = 0.06) {
  const side = Math.max(box.width, box.height);
  const p = Math.round(side * ratio);
  const top = Math.round((side - box.height) / 2);
  const left = Math.round((side - box.width) / 2);
  return {
    top: top + p,
    bottom: side - box.height - top + p,
    left: left + p,
    right: side - box.width - left + p,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  };
}

const markOrange = () => raw(orange).extract(markBox).extend(pad(markBox));

// El isotipo lo sirve la web en SVG. Del ráster solo queda un PNG, y es para
// lo que el vector no cubre: prensa, firmas de correo, plantillas de terceros.
await emitPng('mia', markOrange());

// AVATAR — se recorta del isotipo ya montado (no del original) para que las
// fracciones de AVATAR se puedan leer sobre el propio mia.svg.
const sq = await markOrange().raw().toBuffer({ resolveWithObject: true });
const SW = sq.info.width, SH = sq.info.height;
const win = {
  x0: Math.round(AVATAR.x0 * SW), x1: Math.round(AVATAR.x1 * SW),
  y0: Math.round(AVATAR.y0 * SH), y1: Math.round(AVATAR.y1 * SH),
};
// Ceñir la ventana a lo que realmente tiene tinta dentro: así el margen del
// avatar es el mismo por los cuatro lados sea cual sea el ajuste de AVATAR.
const avatarBox = alphaBBox(sq.data, SW, SH, win.x0, win.x1, win.y0, win.y1);
const sqRaw = () => sharp(sq.data, { raw: { width: SW, height: SH, channels: 4 } });
/** El avatar en lienzo cuadrado. Lo comparten el PNG y los iconos de app. */
const avatarSquare = () => sqRaw().extract(avatarBox).extend(squarePad(avatarBox));

console.log('avatar  ', avatarBox);
// Mismo criterio que arriba, más un uso propio: el avatar en PNG cuadrado es
// la foto de perfil de WhatsApp, Instagram y Google Business.
await emitPng('mia-avatar', avatarSquare());

/* ── SVG · lo que usa la web ───────────────────────────────────────────── */

// Se traza cada recorte POR SEPARADO. Recortar con el viewBox sería más
// barato de generar, pero el avatar acabaría cargando los paths del avión
// entero para enseñar solo la cabeza: 108 kB en el navbar en vez de 12.
const traceOf = async (rgba, w, h, label) => {
  const layers = await vectorize(rgba, w, h);
  console.log(
    `capas ${label.padEnd(8)}`,
    layers.map((l) => `${l.id} ${((l.area / (w * h)) * 100).toFixed(1)}% ${l.d.length}B`).join(' · ')
  );
  return layers;
};

const markLayers = await traceOf(sq.data, SW, SH, 'isotipo');

const av = await sqRaw().extract(avatarBox).raw().toBuffer({ resolveWithObject: true });
const avatarLayers = await traceOf(av.data, av.info.width, av.info.height, 'avatar');

const markSize = { width: SW, height: SH };
const avatarSize = { width: av.info.width, height: av.info.height };

const svgs = {
  'mia.svg': svgDoc(markLayers, markSize, 'orange'),
  'mia-azul.svg': svgDoc(markLayers, markSize, 'blue'),
  'mia-avatar.svg': svgDoc(avatarLayers, avatarSize, 'orange'),
  'mia-avatar-azul.svg': svgDoc(avatarLayers, avatarSize, 'blue'),
};
for (const [name, doc] of Object.entries(svgs)) {
  const f = path.join(OUT, name);
  await writeFile(f, doc, 'utf8');
  made.push(f);
}

/* ── Iconos de app ──────────────────────────────────────────────────────────
 * ⚠️ ESTE SCRIPT YA NO DECIDE EL ICONO. Lo decide `app/icon.svg`, que está
 * escrito a mano (el avión de papel de lib/plane.ts sobre lienzo cuadrado) y
 * NO se regenera aquí.
 *
 * Antes el icono salía del avatar de Mia, y este script lo sobrescribía en
 * cada ejecución. Eso convertía `npm run logo` en un comando que revierte en
 * silencio una decisión de diseño: cambiabas el favicon, alguien regeneraba
 * los assets por otro motivo, y volvía el anterior sin que nadie lo notara —
 * un favicon a 16 px no salta a la vista en una revisión.
 *
 * Lo que sí sigue haciendo el script es RASTERIZAR ese SVG a los dos PNG que
 * Next descubre por convención, que es trabajo mecánico y conviene que esté
 * atado al mismo comando: así el vector y los mapas de bits no se separan. */
const iconSvgPath = path.join(ROOT, 'app', 'icon.svg');
const iconSvg = await readFile(iconSvgPath);

// Lockup completo, para OG / prensa / donde no se componga con texto.
await emit('lockup', raw(lockupDark).extract(fullBox));   // wordmark claro → fondo oscuro
await emit('lockup-claro', raw(orange).extract(fullBox)); // wordmark tinta → fondo claro
await emit('lockup-azul', raw(cut).extract(fullBox));     // original sin tocar

// Los dos PNG salen del MISMO SVG cuadrado, así que no hace falta `flatten`:
// icon.svg ya lleva su propio fondo opaco. (Cuando el icono era el avatar
// transparente sí hacía falta, porque iOS rellena la transparencia con negro y
// el contorno navy de Mia desaparecía contra él.)
await sharp(iconSvg).resize(512, 512).png().toFile(path.join(ROOT, 'app', 'icon.png'));
made.push(path.join(ROOT, 'app', 'icon.png'));

await sharp(iconSvg).resize(180, 180).png().toFile(path.join(ROOT, 'app', 'apple-icon.png'));
made.push(path.join(ROOT, 'app', 'apple-icon.png'));

/* ── Manifiesto ─────────────────────────────────────────────────────────────
 * Mark.tsx dimensiona por ALTURA y necesita la proporción de cada recorte para
 * reservar el ancho antes de que la imagen cargue (si no, BrandIntro mide una
 * caja de ancho 0 y el isotipo no se centra). Esa proporción la decide este
 * script, así que la escribe él: un fichero generado no se puede
 * desincronizar, dos números copiados a mano sí.                            */
const dims = async (file) => {
  const m = await sharp(file).metadata();
  return { w: m.width, h: m.height };
};
const manifest = {
  // El SVG no lleva medidas intrínsecas útiles: las que valen son las del
  // viewBox, que decide este script.
  mark: { src: '/brand/mia.svg', w: markSize.width, h: markSize.height },
  avatar: { src: '/brand/mia-avatar.svg', w: avatarSize.width, h: avatarSize.height },
  lockup: { src: '/brand/lockup.webp', ...(await dims(path.join(OUT, 'lockup.webp'))) },
  lockupLight: { src: '/brand/lockup-claro.webp', ...(await dims(path.join(OUT, 'lockup-claro.webp'))) },
};
const manifestPath = path.join(ROOT, 'lib', 'brand-assets.ts');
await writeFile(
  manifestPath,
  `/* GENERADO POR scripts/logo.mjs · no editar a mano · npm run logo */\n\n` +
    `export type BrandAsset = { src: string; w: number; h: number };\n\n` +
    `export const BRAND_ASSETS = ${JSON.stringify(manifest, null, 2)} satisfies Record<string, BrandAsset>;\n\n` +
    `export type BrandAssetId = keyof typeof BRAND_ASSETS;\n`,
  'utf8'
);
made.push(manifestPath);

// Open Graph: 1200×630 sobre el fondo del sitio.
await sharp({
  create: { width: 1200, height: 630, channels: 4, background: '#060200' },
})
  .composite([
    {
      input: await raw(lockupDark)
        .extract(fullBox)
        .resize({ width: 880, fit: 'inside' })
        .png()
        .toBuffer(),
      gravity: 'centre',
    },
  ])
  .png()
  .toFile(path.join(ROOT, 'app', 'opengraph-image.png'));
made.push(path.join(ROOT, 'app', 'opengraph-image.png'));

console.log('\nescrito:');
for (const f of made) {
  const s = await stat(f);
  console.log(`  ${path.relative(ROOT, f).padEnd(34)} ${(s.size / 1024).toFixed(1)} kB`);
}
