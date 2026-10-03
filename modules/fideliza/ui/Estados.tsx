'use client';

/** Los estados que toda pantalla de Fideliza tiene que poder enseñar. */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Lock, WifiOff } from 'lucide-react';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status">
      <div className="spin" />
      {texto}
    </div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="vacio">
      <b>{titulo}</b>
      {children}
    </div>
  );
}

export function Fallo({ texto, reintentar }: { texto: string; reintentar?: () => void }) {
  return (
    <div className="fz-panel-aviso fz-panel-aviso--error" role="alert">
      <span>{texto}</span>
      {reintentar && (
        <button className="btn btn-ghost btn-sm" onClick={reintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}

export function SinPermiso({ que }: { que: string }) {
  return (
    <div className="vacio">
      <Lock size={20} />
      <b>Tu usuario no tiene acceso a {que}</b>
      Pídeselo al propietario del negocio.
    </div>
  );
}

/** Aviso fijo cuando el navegador dice que no hay red. */
export function SinConexion() {
  const [en, setEn] = useState(true);
  useEffect(() => {
    const a = () => setEn(navigator.onLine);
    a();
    window.addEventListener('online', a);
    window.addEventListener('offline', a);
    return () => {
      window.removeEventListener('online', a);
      window.removeEventListener('offline', a);
    };
  }, []);
  if (en) return null;
  return (
    <div className="fz-panel-aviso fz-panel-aviso--error" role="alert">
      <WifiOff size={16} /> Sin conexión. No se puede registrar ni canjear hasta que vuelva: nada se da por hecho sin confirmar.
    </div>
  );
}

/** QR en SVG, generado en el navegador. `descargar` ofrece el PNG para imprimir. */
export function Qr({ valor, tam = 200, descargar }: { valor: string; tam?: number; descargar?: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    void QRCode.toString(valor, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg);
  }, [valor]);
  async function bajar() {
    const url = await QRCode.toDataURL(valor, { width: 1200, margin: 2, errorCorrectionLevel: 'M' });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${descargar}.png`;
    a.click();
  }
  return (
    <div className="fz-qr-panel">
      <div style={{ width: tam, height: tam }} aria-label="Código QR" dangerouslySetInnerHTML={{ __html: svg }} />
      {descargar && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void bajar()}>
          Descargar PNG
        </button>
      )}
    </div>
  );
}
