'use client';

/**
 * Cámara trasera que lee UN QR y se cierra. Mismo método que la Caja
 * (BarcodeDetector, Chrome de Android); el tipo de window.BarcodeDetector está
 * declarado en Caja.tsx.
 */
import { useEffect, useRef } from 'react';

export const hayEscaner = () =>
  typeof window !== 'undefined' && Boolean(window.BarcodeDetector) && Boolean(navigator.mediaDevices);

export default function EscanerQr({ alLeer, alFallar }: { alLeer: (texto: string) => void; alFallar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let vivo = true;
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current || !vivo) return;
        video.current.srcObject = flujo;
        await video.current.play();
        const det = new window.BarcodeDetector!({ formats: ['qr_code'] });
        while (vivo) {
          const r = await det.detect(video.current).catch(() => []);
          if (r[0]?.rawValue) {
            vivo = false;
            alLeer(r[0].rawValue);
            break;
          }
          await new Promise((res) => setTimeout(res, 250));
        }
      } catch {
        if (vivo) alFallar();
      }
    })();
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((t) => t.stop());
    };
    // Una cámara por montaje: quien la usa la monta y la desmonta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <video ref={video} className="fz-video" playsInline muted aria-label="Cámara para leer el QR de la placa" />;
}
