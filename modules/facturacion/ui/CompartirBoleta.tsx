'use client';
/**
 * Los botones de siempre para una boleta ya emitida: WhatsApp e Imprimir, y en el
 * celular «Compartir» (la hoja del sistema: WhatsApp, Telegram, correo…).
 *
 * El mensaje lleva el enlace /comprobante/<id>: el ticket con su QR, que el cliente
 * abre sin cuenta. Hace falta porque APIsPerú no da PDF; con Lucode también vale.
 */
import { useEffect, useState } from 'react';
import { Check, Link2, MessageCircle, Printer, Share2 } from 'lucide-react';
import type { ComprobanteGuardado } from '../dominio/tipos';
import { compartible, enlaceComprobante, enlaceWhatsApp, imprimir, textoWhatsApp } from './api';

export default function CompartirBoleta({
  c,
  ancho,
  telefono,
  compacto = false,
  alError,
}: {
  c: ComprobanteGuardado;
  ancho: 58 | 80;
  /** El celular del cliente, si se sabe: WhatsApp abre su chat directamente. */
  telefono?: string;
  /** Solo iconos (para filas de una lista). */
  compacto?: boolean;
  alError?: (mensaje: string) => void;
}) {
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setPuedeCompartir(typeof navigator !== 'undefined' && typeof navigator.share === 'function'), []);

  if (!compartible(c)) return null;
  const nombre = `${c.tipo === 'factura' ? 'Factura' : 'Boleta'} ${c.serie}-${c.numero}`;

  const imprimirYa = async () => {
    try {
      await imprimir(c, ancho);
    } catch (e) {
      alError?.((e as Error).message);
    }
  };
  const compartir = async () => {
    try {
      await navigator.share({ title: nombre, text: textoWhatsApp(c) });
    } catch {
      /* cerró la hoja: nada */
    }
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enlaceComprobante(c));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      alError?.('No se pudo copiar el enlace.');
    }
  };

  return (
    <>
      <a
        className="btn btn-ghost btn-sm"
        href={enlaceWhatsApp(c, telefono)}
        target="_blank"
        rel="noopener noreferrer"
        title={telefono ? 'Enviar a su WhatsApp' : 'Enviar por WhatsApp'}
      >
        <MessageCircle size={14} />
        {!compacto && ' WhatsApp'}
      </a>
      {puedeCompartir ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={compartir} title="Compartir">
          <Share2 size={14} />
          {!compacto && ' Compartir'}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={copiar} title="Copiar el enlace de la boleta">
          {copiado ? <Check size={14} /> : <Link2 size={14} />}
          {!compacto && (copiado ? ' Copiado' : ' Copiar enlace')}
        </button>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={imprimirYa} title="Imprimir">
        <Printer size={14} />
        {!compacto && ' Imprimir'}
      </button>
    </>
  );
}
