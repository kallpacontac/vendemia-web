'use client';
/**
 * /comprobante/<id>: la boleta o factura para el cliente, sin cuenta. Es el mismo ticket que
 * se imprime en el local (dominio/impreso.ts), con su QR, y un botón para guardarlo en PDF.
 * Los datos los da factura_publica (sql/0003): solo lo que llegó a SUNAT.
 */
import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { textoQr, ticketHtml } from '../dominio/impreso';
import { leerPublico } from './api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function VerComprobante({ id }: { id: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [ancho, setAncho] = useState<58 | 80>(80);
  const [nombre, setNombre] = useState('');
  const [falla, setFalla] = useState(false);
  const marco = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!UUID.test(id)) {
      setFalla(true);
      return;
    }
    let vivo = true;
    (async () => {
      const r = await leerPublico(id);
      if (!vivo) return;
      if (!r) return setFalla(true);
      const qr = r.c.hash ? await QRCode.toDataURL(textoQr(r.c), { margin: 0, width: 240, errorCorrectionLevel: 'M' }) : '';
      if (!vivo) return;
      setAncho(r.ancho);
      setNombre(`${r.c.tipo === 'factura' ? 'Factura' : 'Boleta'} ${r.c.serie}-${r.c.numero}`);
      setHtml(ticketHtml(r.c, { ancho: r.ancho, qrDataUrl: qr }));
    })().catch(() => vivo && setFalla(true));
    return () => {
      vivo = false;
    };
  }, [id]);

  useEffect(() => {
    if (nombre) document.title = nombre;
  }, [nombre]);

  return (
    <main className="vc">
      <style>{`
        .vc { --fondo: #f4f4f1; --tinta: #1b1b18; --suave: #6b6b66; --acento: #4f46e5;
          min-height: 100vh; background: var(--fondo); color: var(--tinta); padding: 24px 16px 40px;
          display: flex; flex-direction: column; align-items: center; gap: 16px;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
        @media (prefers-color-scheme: dark) { .vc { --fondo: #161614; --tinta: #f1f1ee; --suave: #a3a39d; --acento: #8b85ff; } }
        .vc__marco { width: ${ancho === 58 ? 260 : 340}px; max-width: 100%; height: 78vh; border: 0; background: #fff;
          border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.08); }
        .vc__btn { appearance: none; border: 0; border-radius: 10px; padding: 12px 20px; font: 600 15px/1 inherit;
          background: var(--acento); color: #fff; cursor: pointer; min-height: 44px; }
        .vc__btn:focus-visible { outline: 3px solid var(--acento); outline-offset: 2px; }
        .vc__nota { color: var(--suave); font-size: 13px; text-align: center; max-width: 340px; margin: 0; }
      `}</style>
      {falla ? (
        <p className="vc__nota" style={{ marginTop: '30vh' }}>
          No encontramos este comprobante. Pide al negocio que te lo envíe otra vez.
        </p>
      ) : html === null ? (
        <p className="vc__nota" style={{ marginTop: '30vh' }}>Cargando tu comprobante…</p>
      ) : (
        <>
          <iframe ref={marco} className="vc__marco" title={nombre} srcDoc={html} />
          <button type="button" className="vc__btn" onClick={() => marco.current?.contentWindow?.print()}>
            Guardar en PDF o imprimir
          </button>
          <p className="vc__nota">Puedes comprobarlo en SUNAT escaneando el código QR.</p>
        </>
      )}
    </main>
  );
}
