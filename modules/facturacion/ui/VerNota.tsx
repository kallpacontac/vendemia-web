'use client';
/**
 * /nota/<id>: la nota de venta para el cliente, sin cuenta (sql/0004, nota_publica). El mismo
 * ticket que se imprime en el local (dominio/nota.ts), con «Guardar en PDF o imprimir».
 */
import { useEffect, useRef, useState } from 'react';
import { notaHtml, numeroNota } from '../dominio/nota';
import { leerNotaPublica } from './api';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function VerNota({ id }: { id: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [ancho, setAncho] = useState(80);
  const [falla, setFalla] = useState(false);
  const marco = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!UUID.test(id)) {
      setFalla(true);
      return;
    }
    let vivo = true;
    leerNotaPublica(id)
      .then((n) => {
        if (!vivo) return;
        if (!n) return setFalla(true);
        setAncho(n.negocio.ticket_ancho);
        document.title = `Nota de venta ${numeroNota(n)}`;
        setHtml(notaHtml(n));
      })
      .catch(() => vivo && setFalla(true));
    return () => {
      vivo = false;
    };
  }, [id]);

  return (
    <main className="vc">
      <style>{`
        .vc { --fondo: #f4f4f1; --tinta: #1b1b18; --suave: #6b6b66; --acento: #FF4900;
          min-height: 100vh; background: var(--fondo); color: var(--tinta); padding: 24px 16px 40px;
          display: flex; flex-direction: column; align-items: center; gap: 16px;
          font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
        @media (prefers-color-scheme: dark) { .vc { --fondo: #161614; --tinta: #f1f1ee; --suave: #a3a39d; } }
        .vc__marco { width: ${ancho === 58 ? 260 : 340}px; max-width: 100%; height: 72vh; border: 0; background: #fff;
          border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.08); }
        .vc__btn { appearance: none; border: 0; border-radius: 10px; padding: 12px 20px; font: 600 15px/1 inherit;
          background: var(--acento); color: #fff; cursor: pointer; min-height: 44px; }
        .vc__nota { color: var(--suave); font-size: 13px; text-align: center; max-width: 340px; margin: 0; }
      `}</style>
      {falla ? (
        <p className="vc__nota" style={{ marginTop: '30vh' }}>No encontramos esta nota. Pide al negocio que te la envíe otra vez.</p>
      ) : html === null ? (
        <p className="vc__nota" style={{ marginTop: '30vh' }}>Cargando tu nota…</p>
      ) : (
        <>
          <iframe ref={marco} className="vc__marco" title="Nota de venta" srcDoc={html} />
          <button type="button" className="vc__btn" onClick={() => marco.current?.contentWindow?.print()}>
            Guardar en PDF o imprimir
          </button>
        </>
      )}
    </main>
  );
}
