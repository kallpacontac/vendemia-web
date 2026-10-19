/**
 * Destino único del alta que empieza al escanear una placa todavía libre.
 * `fuente` no decide el flujo: solo conserva si entró por el QR o por el NFC.
 */
export type FuentePlaca = 'nfc' | 'qr';

export function rutaActivacionPlaca(fuente: FuentePlaca = 'nfc'): string {
  return `/panel/fideliza/placas?activar=1&origen=placa&fuente=${fuente}`;
}

export function fuenteDeRuta(ruta: string): FuentePlaca {
  try {
    return new URL(ruta, 'https://vendemias.com').searchParams.get('fuente') === 'qr' ? 'qr' : 'nfc';
  } catch {
    return 'nfc';
  }
}
