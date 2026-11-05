/**
 * El comprobante de Yape o Plin que el cliente sube en la página.
 *
 * La IA solo LEE la captura. Quien decide es esta función, sin IA y con las mismas reglas del
 * bot (vendemia: src/utils/voucher.ts): que sea un comprobante, completado, a nuestro número y
 * de las últimas 4 horas. Dos diferencias a propósito, porque esto llega desde internet sin un
 * chat detrás: lo que no se lee no se da por bueno (va a revisión de una persona, el bot se
 * saltaba la comprobación), y una transferencia bancaria tampoco se aprueba sola.
 *
 * Los mensajes salen tal cual al cliente: dicen qué pasó y qué tiene que hacer.
 */
export const MAX_HORAS_COMPROBANTE = 4;

export interface LecturaComprobante {
  esComprobante: boolean;
  app: 'yape' | 'plin' | 'transfer' | 'unknown';
  estado: string;
  monto: number | null;
  /** Los dígitos del destinatario que se ven en la captura. */
  destino: string;
  /** ISO 8601 con hora de Perú. */
  fechaHora: string | null;
  operacion: string | null;
}

export type Decision = 'aprobar' | 'revisar' | 'rechazar';

export const MENSAJES = {
  noComprobante: 'Esta imagen no es un comprobante de pago. Sube la captura de Yape o Plin donde se vea el monto y el destinatario.',
  noCompletado: 'El pago no figura como completado. Espera a que Yape o Plin lo confirme y sube la captura nueva.',
  otroNumero: 'El pago se hizo a otro número, no al nuestro. Revisa el número de arriba y, si fue un error, escríbenos por WhatsApp.',
  antiguo: `El comprobante tiene más de ${MAX_HORAS_COMPROBANTE} horas. Sube el del pago de esta reserva.`,
  repetida: 'Esta misma captura ya se envió antes. Sube el comprobante de un pago nuevo.',
  operacionRepetida: (op: string) => `La operación #${op} ya fue registrada antes. Si crees que es un error, escríbenos por WhatsApp.`,
  archivoInvalido: 'Sube una imagen JPG, PNG o WEBP.',
  archivoGrande: 'La imagen pesa demasiado. Sube una captura de pantalla, no una foto.',
  noEncontrada: 'No encontramos esa reserva con ese celular. Revisa que sea el mismo número con el que reservaste.',
  vencida: 'El plazo para pagar esta reserva terminó y la cancha ya no está apartada. Escríbenos por WhatsApp antes de volver a pagar.',
  yaCobrada: 'Esta reserva ya está pagada completa. No necesitas subir otro comprobante.',
  demasiados: 'Ya subiste varios comprobantes para esta reserva. Escríbenos por WhatsApp y lo revisamos contigo.',
  muchosIntentos: 'Hiciste muchos intentos seguidos. Espera un momento o escríbenos por WhatsApp.',
  noGuardado: 'No pudimos guardar tu comprobante. Tu cancha sigue apartada: inténtalo otra vez en unos segundos.',
  sinRed: 'Sin conexión. Revisa tu internet e inténtalo otra vez.',
} as const;

/** Motivos que ve solo el dueño, para saber por qué le toca mirar la captura. */
const POR_REVISAR = {
  sinLectura: 'No se pudo leer la captura automáticamente.',
  estado: 'No se ve si el pago está completado.',
  sinDestino: 'No se ve el número que recibió el pago.',
  sinNumeros: 'El negocio no tiene número de Yape o Plin en Ajustes.',
  sinMonto: 'No se ve el monto.',
  sinFecha: 'No se ve la fecha del pago.',
  fechaFutura: 'La fecha del comprobante es futura.',
  transferencia: 'Es una transferencia bancaria: se revisa a mano.',
};

const COMPLETADO = ['completado', 'exitoso', 'aprobado', 'success', 'approved'];
const FALLIDO = ['pendiente', 'rechazado', 'pending', 'rejected', 'failed', 'fallido'];

export function evaluarLectura(
  l: LecturaComprobante | null,
  numeros: string[],
  ahoraMs: number = Date.now(),
): { decision: Decision; motivo: string } {
  if (!l) return { decision: 'revisar', motivo: POR_REVISAR.sinLectura };
  if (!l.esComprobante) return { decision: 'rechazar', motivo: MENSAJES.noComprobante };

  const estado = l.estado.toLowerCase();
  if (FALLIDO.some((e) => estado.includes(e))) return { decision: 'rechazar', motivo: MENSAJES.noCompletado };
  if (!COMPLETADO.some((e) => estado.includes(e))) return { decision: 'revisar', motivo: POR_REVISAR.estado };

  const destino = l.destino.replace(/\D/g, '');
  const finales = numeros.map((n) => n.replace(/\D/g, '').slice(-3)).filter((n) => n.length === 3);
  if (!finales.length) return { decision: 'revisar', motivo: POR_REVISAR.sinNumeros };
  if (destino.length < 3) return { decision: 'revisar', motivo: POR_REVISAR.sinDestino };
  if (!finales.some((f) => destino.includes(f))) return { decision: 'rechazar', motivo: MENSAJES.otroNumero };

  if (l.fechaHora) {
    const t = new Date(l.fechaHora).getTime();
    if (Number.isNaN(t)) return { decision: 'revisar', motivo: POR_REVISAR.sinFecha };
    if (t > ahoraMs + 15 * 60_000) return { decision: 'revisar', motivo: POR_REVISAR.fechaFutura };
    if (ahoraMs - t > MAX_HORAS_COMPROBANTE * 3_600_000) return { decision: 'rechazar', motivo: MENSAJES.antiguo };
  } else {
    return { decision: 'revisar', motivo: POR_REVISAR.sinFecha };
  }

  if (l.monto === null || !(l.monto > 0)) return { decision: 'revisar', motivo: POR_REVISAR.sinMonto };
  if (l.app !== 'yape' && l.app !== 'plin') return { decision: 'revisar', motivo: POR_REVISAR.transferencia };
  return { decision: 'aprobar', motivo: '' };
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47];

/** Lo que de verdad es el archivo, por sus primeros bytes: el `type` lo escribe el navegador. */
export function tipoDeImagen(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (JPEG.every((x, i) => b[i] === x)) return 'image/jpeg';
  if (PNG.every((x, i) => b[i] === x)) return 'image/png';
  const texto = (d: number, h: number) => String.fromCharCode(...b.slice(d, h));
  if (texto(0, 4) === 'RIFF' && texto(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
