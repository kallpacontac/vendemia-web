/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIDELIZA · direcciones públicas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El panel vive en vendemias.com/panel/fideliza. Lo que se graba en una placa
 * o se imprime en un QR vive en fideliza.vendemias.com — es lo que NO puede
 * cambiar nunca, porque está físicamente en el local del cliente.
 *
 * En local las dos cosas son localhost:3000: el middleware solo separa los
 * hosts cuando NEXT_PUBLIC_FIDELIZA_URL apunta a otro dominio.
 */
export const FIDELIZA_URL = (process.env.NEXT_PUBLIC_FIDELIZA_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Lo que se graba en el chip. El token es lo único que lo identifica. */
export const urlPlaca = (token: string) => `${FIDELIZA_URL}/t/${token}`;
/** Lo que lleva el QR impreso de la MISMA placa: mide QR aparte de NFC. */
export const urlPlacaQr = (token: string) => `${FIDELIZA_URL}/t/${token}?o=qr`;
export const urlNegocio = (slug: string) => `${FIDELIZA_URL}/n/${slug}`;
export const urlUnirse = (slug: string) => `${FIDELIZA_URL}/n/${slug}/unirse`;
export const urlTarjeta = (token: string) => `${FIDELIZA_URL}/m/${token}`;

export const ZONA = 'America/Lima';
