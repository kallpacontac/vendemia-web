'use client';
/**
 * Al cobrar, ¿qué comprobante? (18-nov-2026, The 24/7: «para escoger: nota de venta o boleta
 * electrónica… y enviar el comprobante por WhatsApp directo, la imagen del ticket y un texto»).
 *
 *   · Nota de venta (sql/0004): siempre se puede. Sale numerada, con Imprimir y WhatsApp.
 *   · Boleta electrónica: solo con las boletas activas (Ajustes). Abre su formulario ya lleno
 *     (BoletaDelCobro). Si en Ajustes «Al cobrar» es «automático», sale sola como antes.
 *
 * WhatsApp abre el chat del cliente (su celular) con el saludo y el enlace del comprobante, que
 * WhatsApp muestra como la IMAGEN del ticket (opengraph-image de /nota y /comprobante). Funciona
 * con cualquier número, aunque no esté en los contactos.
 */
import { useEffect, useState } from 'react';
import { FileText, Loader2, MessageCircle, Printer, ReceiptText } from 'lucide-react';
import { numeroNota, textoWhatsAppNota, type NotaVenta } from '../dominio/nota';
import {
  ajustesParaCobro, compartirArchivos, compartirImagen, emitirNota, enlaceNota, enlaceWhatsAppNota, imprimirNota,
  precargarImagen, type Ajustes,
} from './api';
import BoletaDelCobro, { type LineaCobro } from './BoletaDelCobro';
import '../estilos/facturacion.css';

export default function ComprobanteDelCobro({
  companyId,
  refCobro,
  lineas,
  telefono,
  cliente,
  atendio,
}: {
  companyId: string;
  refCobro: { tipo: string; id: string };
  lineas: LineaCobro[];
  telefono?: string;
  cliente?: string;
  atendio?: string;
}) {
  const [ajustes, setAjustes] = useState<Ajustes | null | undefined>(undefined);
  const [eleccion, setEleccion] = useState<'' | 'nota' | 'boleta'>('');
  const [nota, setNota] = useState<NotaVenta | null>(null);
  const [enVuelo, setEnVuelo] = useState(false);
  const [error, setError] = useState('');
  const [conImagen, setConImagen] = useState(false);
  useEffect(() => setConImagen(compartirArchivos()), []);
  // La imagen del ticket se baja en cuanto hay nota: al tocar WhatsApp ya está lista.
  useEffect(() => {
    if (nota) void precargarImagen(`/nota/${nota.id}`, numeroNota(nota));
  }, [nota]);

  useEffect(() => {
    let vivo = true;
    ajustesParaCobro(companyId).then((a) => vivo && setAjustes(a));
    return () => {
      vivo = false;
    };
  }, [companyId]);

  // Nuevo cobro, nueva elección.
  useEffect(() => {
    setEleccion('');
    setNota(null);
    setError('');
  }, [refCobro.id]);

  const validas = lineas.filter((l) => l.descripcion.trim() && l.cantidad > 0 && l.precio >= 0);
  if (ajustes === undefined || !validas.length) return null;

  // «Al cobrar: automático» en Ajustes: la boleta sale sola, como siempre.
  if (ajustes?.al_cobrar === 'automatico') {
    return <BoletaDelCobro companyId={companyId} refCobro={refCobro} lineas={lineas} telefono={telefono} />;
  }

  async function sacarNota() {
    setEleccion('nota');
    setEnVuelo(true);
    setError('');
    try {
      setNota(await emitirNota(companyId, { ref: refCobro, lineas: validas, cliente, telefono, atendio }));
    } catch (e) {
      setError((e as Error).message);
      setEleccion('');
    } finally {
      setEnVuelo(false);
    }
  }

  async function mandarImagen() {
    if (!nota) return;
    const texto = textoWhatsAppNota(nota, enlaceNota(nota));
    const r = await compartirImagen(await precargarImagen(`/nota/${nota.id}`, numeroNota(nota)), texto);
    // Sin poder compartir la imagen: el chat con el texto y el enlace.
    if (r === 'no') window.open(enlaceWhatsAppNota(nota, telefono), '_blank', 'noopener');
  }

  const imprimir = () => {
    if (!nota) return;
    try {
      imprimirNota(nota);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fe-cobro fe-elegir" role="group" aria-label="Comprobante">
      {eleccion === '' && (
        <>
          <span className="fe-cobro__que">Comprobante:</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void sacarNota()}>
            <ReceiptText size={14} /> Nota de venta
          </button>
          {ajustes && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEleccion('boleta')}>
              <FileText size={14} /> Boleta electrónica
            </button>
          )}
        </>
      )}

      {eleccion === 'nota' && (enVuelo ? (
        <span className="fe-cobro__que"><Loader2 size={14} className="fe-girar" /> Sacando la nota…</span>
      ) : nota && (
        <>
          <span className="fe-cobro__que"><ReceiptText size={14} /> Nota <b>{numeroNota(nota)}</b></span>
          <span className="fe-cobro__acciones">
            <button type="button" className="btn btn-ghost btn-sm" onClick={imprimir}>
              <Printer size={14} /> Imprimir
            </button>
            {conImagen ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void mandarImagen()}>
                <MessageCircle size={14} /> WhatsApp con imagen
              </button>
            ) : (
              <a className="btn btn-primary btn-sm" href={enlaceWhatsAppNota(nota, telefono)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={14} /> WhatsApp
              </a>
            )}
            {/* El número que no está en los contactos: abrir su chat (luego se le comparte la imagen). */}
            {conImagen && (telefono ?? '').replace(/\D/g, '').length >= 9 && (
              <a className="btn btn-ghost btn-sm" href={enlaceWhatsAppNota(nota, telefono)} target="_blank" rel="noopener noreferrer">
                Abrir chat del cliente
              </a>
            )}
          </span>
        </>
      ))}

      {eleccion === 'boleta' && ajustes && (
        <BoletaDelCobro companyId={companyId} refCobro={refCobro} lineas={lineas} telefono={telefono} abrir />
      )}

      {error && <small className="fe-cobro__error">{error}</small>}
    </div>
  );
}
