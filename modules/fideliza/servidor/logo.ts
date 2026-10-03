import 'server-only';

/**
 * El logo de Google Wallet: HTTPS público, PNG o JPEG, cuadrado y de al menos
 * 660×660. Google lo recorta en círculo, así que además se avisa del margen.
 *
 * Se leen solo las cabeceras del fichero (medidas), con tope de 2 MB y 8 s.
 * No se aceptan IPs literales ni localhost: es una URL que escribe un usuario y
 * que el servidor va a descargar.
 */
export interface ResultadoLogo {
  ok: boolean;
  ancho?: number;
  alto?: number;
  formato?: string;
  errores: string[];
  avisos: string[];
}

const MAX = 2 * 1024 * 1024;

function medidas(b: Buffer): { formato: string; ancho: number; alto: number } | null {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { formato: 'png', ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marca = b[i + 1];
      const largo = b.readUInt16BE(i + 2);
      if (marca >= 0xc0 && marca <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marca)) {
        return { formato: 'jpeg', alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
      }
      i += 2 + largo;
    }
  }
  return null;
}

export async function comprobarLogo(url: string): Promise<ResultadoLogo> {
  const errores: string[] = [];
  const avisos: string[] = [];
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, errores: ['No es una URL válida.'], avisos };
  }
  if (u.protocol !== 'https:') return { ok: false, errores: ['Tiene que ser https://.'], avisos };
  if (/^(localhost|[\d.]+|\[.*\])$/i.test(u.hostname) || u.hostname.endsWith('.local')) {
    return { ok: false, errores: ['Usa una dirección pública con dominio, no una IP.'], avisos };
  }
  let r: Response;
  try {
    r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
  } catch {
    return { ok: false, errores: ['No se pudo descargar la imagen desde esa dirección.'], avisos };
  }
  if (!r.ok) return { ok: false, errores: [`La dirección responde con error ${r.status}.`], avisos };
  const tipo = r.headers.get('content-type') ?? '';
  if (!/image\/(png|jpe?g)/i.test(tipo)) errores.push('Tiene que ser PNG (recomendado) o JPEG.');
  const lector = r.body?.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  while (lector) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > MAX) {
      await lector.cancel();
      return { ok: false, errores: ['La imagen pesa más de 2 MB.'], avisos };
    }
    partes.push(value);
  }
  const m = medidas(Buffer.concat(partes));
  if (!m) return { ok: false, errores: [...errores, 'No se pudieron leer las medidas de la imagen.'], avisos };
  if (m.ancho !== m.alto) errores.push(`Tiene que ser cuadrada (1:1). Mide ${m.ancho}×${m.alto}.`);
  if (Math.min(m.ancho, m.alto) < 660) errores.push(`Mínimo 660×660. Mide ${m.ancho}×${m.alto}.`);
  if (m.formato === 'jpeg') avisos.push('Mejor PNG: en JPEG el fondo no puede ser transparente.');
  avisos.push('Google la recorta en círculo: deja aire alrededor del logo (unos 15 % por lado).');
  return { ok: errores.length === 0, ...m, errores, avisos };
}
