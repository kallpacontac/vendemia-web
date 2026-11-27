import 'server-only';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import type { LecturaComprobante } from '@/modules/tu-pagina/dominio/comprobante';
import { juntar, leerVoucher } from '../dominio/leerVoucher';

/**
 * Leer la foto de un Yape o Plin sin IA (gratis): Tesseract, en el servidor.
 *
 * Probado el 26-nov con un voucher de Yape y con la «foto de la pantalla» del mismo (girada 4°,
 * borrosa y con brillo): en modo «texto suelto» (PSM 11) y a 1400 px de ancho lee monto, hora y código.
 * El texto grande del monto se pierde en el modo por bloques: por eso el 11. Si a la primera falta
 * la hora, una segunda pasada a 1800 px suele traerla.
 *
 * El idioma (spa) lo baja Tesseract la primera vez y queda en /tmp: en caliente, ~1 s por foto.
 * El mismo lector se reutiliza mientras la función siga viva.
 */
let lector: Promise<Worker> | null = null;

function elLector() {
  if (!lector) {
    lector = createWorker('spa', 1, { cachePath: join(tmpdir(), 'tesseract') })
      .then(async (w) => {
        await w.setParameters({ tessedit_pageseg_mode: '11' as never });
        return w;
      })
      .catch((e) => {
        lector = null;
        throw e;
      });
  }
  return lector;
}

const preparar = (imagen: Buffer, ancho: number) =>
  sharp(imagen).rotate().resize({ width: ancho }).grayscale().normalize().sharpen({ sigma: ancho > 1500 ? 2 : 1.5 }).png().toBuffer();

/** Para las pruebas: suelta el lector y deja salir al proceso. */
export async function cerrarLector() {
  const l = lector;
  lector = null;
  if (l) await (await l).terminate().catch(() => undefined);
}

/** null = no se pudo leer un importe (o falló Tesseract): la foto queda «sin leer». */
export async function leerSinIA(imagen: Buffer): Promise<LecturaComprobante | null> {
  try {
    const w = await elLector();
    const uno = leerVoucher((await w.recognize(await preparar(imagen, 1400))).data.text);
    if (uno?.monto != null && uno.fechaHora && (uno.app !== 'yape' || uno.codigoSeguridad)) return uno;
    const dos = leerVoucher((await w.recognize(await preparar(imagen, 1800))).data.text);
    return juntar(uno, dos);
  } catch {
    return null;
  }
}
