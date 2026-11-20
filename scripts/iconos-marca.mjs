/**
 * Íconos de MARCA PROPIA para la app del panel (lib/panel/marcaPropia.ts).
 *
 *   node scripts/iconos-marca.mjs <logo.png> <carpeta-en-public> [#fondo]
 *   node scripts/iconos-marca.mjs public/assets/the247/logo-660.png public/assets/the247 #000000
 *
 * Deja en la carpeta:
 *   app-192.png, app-512.png    el ícono normal (logo sobre su fondo, cuadrado)
 *   app-maskable-512.png        el de Android que se recorta en círculo/gota: logo
 *                               más pequeño para que no se corte nada
 *   app-180.png                 el de iPhone (apple-touch-icon; iOS redondea solo)
 *   app-badge-96.png            el iconito blanco de la barra de estado en los avisos
 *
 * El logo debería ser cuadrado y de 512 px o más. Si no es cuadrado se centra
 * sobre el fondo.
 */
import path from 'node:path';
import sharp from 'sharp';

const [logo, carpeta, fondoHex = '#000000'] = process.argv.slice(2);
if (!logo || !carpeta) {
  console.error('Uso: node scripts/iconos-marca.mjs <logo.png> <carpeta> [#fondo]');
  process.exit(1);
}
const m = /^#?([0-9a-f]{6})$/i.exec(fondoHex);
if (!m) throw new Error(`Fondo no válido: ${fondoHex}`);
const n = parseInt(m[1], 16);
const fondo = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, alpha: 1 };

const meta = await sharp(logo).metadata();
if (Math.min(meta.width ?? 0, meta.height ?? 0) < 512) {
  console.warn(`⚠️  El logo mide ${meta.width}×${meta.height}: a 512 px se verá algo borroso.`);
}

/** El logo centrado en un cuadrado de `lado`, ocupando `escala` del lado. */
async function cuadrado(lado, escala, salida) {
  const dentro = Math.round(lado * escala);
  const pieza = await sharp(logo).resize(dentro, dentro, { fit: 'contain', background: fondo }).toBuffer();
  await sharp({ create: { width: lado, height: lado, channels: 4, background: fondo } })
    .composite([{ input: pieza, gravity: 'center' }])
    .flatten({ background: fondo })
    .png()
    .toFile(path.join(carpeta, salida));
  console.log('✓', path.join(carpeta, salida));
}

await cuadrado(192, 1, 'app-192.png');
await cuadrado(512, 1, 'app-512.png');
await cuadrado(180, 1, 'app-180.png');
// Zona segura de un ícono maskable: un círculo del 80 % del lado.
await cuadrado(512, 0.76, 'app-maskable-512.png');

/*
 * Badge: Android solo usa la transparencia (lo pinta blanco). La luz del logo
 * pasa a ser lo opaco; se recorta al dibujo para que no quede diminuto.
 */
const { data, info } = await sharp(logo)
  .flatten({ background: fondo })
  .greyscale()
  .trim({ threshold: 30 })
  .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
  .raw()
  .toBuffer({ resolveWithObject: true });
const claro = (fondo.r + fondo.g + fondo.b) / 3 > 127;
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  const v = data[i * info.channels];
  const a = claro ? 255 - v : v; // Fondo claro: lo opaco es lo oscuro.
  rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255;
  rgba[i * 4 + 3] = a < 60 ? 0 : a;
}
await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(path.join(carpeta, 'app-badge-96.png'));
console.log('✓', path.join(carpeta, 'app-badge-96.png'));
