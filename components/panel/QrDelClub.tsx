'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * QR DEL CLUB · para que el barbero se lo enseñe al cliente en la silla
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 24/7, 20-nov-2026: «para los barberos debe compartir el QR de Fideliza… debe ser práctico».
 *
 * Un toque en Mi agenda y el QR ocupa la pantalla: el cliente lo escanea desde su celular y cae
 * directo en el alta del club (fideliza.vendemias.com/n/<negocio>/unirse). Mientras está abierto la
 * pantalla no se apaga. Debajo, «Enviar por WhatsApp» (el barbero elige el chat) y «Copiar enlace».
 *
 * Lee loyalty_settings, que el equipo puede leer (en Fideliza es «cajero»: program.read). Sin club,
 * no sale nada.
 */
import { useEffect, useState } from 'react';
import { Check, Copy, Gift, MessageCircle, X } from 'lucide-react';
import { lecturas } from '@/modules/fideliza/cliente/api';
import { urlUnirse } from '@/modules/fideliza/dominio/config';
import { Qr } from '@/modules/fideliza/ui/Estados';
import './qr-del-club.css';

type WakeLock = { release: () => Promise<void> };

export default function QrDelClub({ companyId }: { companyId: string }) {
  const [club, setClub] = useState<{ url: string; nombre: string } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vigente = true;
    lecturas
      .ajustes(companyId)
      .then((a) => {
        if (vigente && a?.slug) setClub({ url: urlUnirse(a.slug), nombre: a.display_name || 'nuestro club' });
      })
      .catch(() => {
        /* sin club o sin permiso: no sale el botón */
      });
    return () => {
      vigente = false;
    };
  }, [companyId]);

  // Con el QR a la vista, que la pantalla no se apague mientras el cliente saca su celular.
  useEffect(() => {
    if (!abierto) return;
    let lock: WakeLock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
    void nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    const alEsc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    window.addEventListener('keydown', alEsc);
    return () => {
      window.removeEventListener('keydown', alEsc);
      void lock?.release().catch(() => {});
    };
  }, [abierto]);

  if (!club) return null;
  const texto = `Únete a ${club.nombre} y acumula premios: ${club.url}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(club!.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: queda el de WhatsApp */
    }
  }

  return (
    <>
      <button type="button" className="qrc-boton" onClick={() => setAbierto(true)}>
        <Gift size={20} aria-hidden="true" />
        <span>
          <b>QR del club</b>
          <small>Enséñaselo a tu cliente para que se una</small>
        </span>
      </button>

      {abierto && (
        <div className="qrc-velo" role="dialog" aria-modal="true" aria-label={`QR de ${club.nombre}`} onClick={() => setAbierto(false)}>
          <div className="qrc-hoja" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="qrc-cerrar" aria-label="Cerrar" onClick={() => setAbierto(false)}>
              <X size={22} />
            </button>
            <p className="qrc-titulo">Escanea con tu cámara</p>
            <p className="qrc-sub">y únete a <b>{club.nombre}</b></p>
            <div className="qrc-qr">
              <Qr valor={club.url} tam={320} />
            </div>
            <div className="qrc-acciones">
              <a className="btn btn-primary" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={18} /> Enviar por WhatsApp
              </a>
              <button type="button" className="btn btn-ghost" onClick={() => void copiar()}>
                {copiado ? <Check size={18} /> : <Copy size={18} />} {copiado ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
