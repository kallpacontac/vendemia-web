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
 *
 * También en el menú de la cuenta (arriba a la derecha), para todos: VentanaQrClub + useClub.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Gift, MessageCircle, X } from 'lucide-react';
import { lecturas } from '@/modules/fideliza/cliente/api';
import { urlUnirse } from '@/modules/fideliza/dominio/config';
import { Qr } from '@/modules/fideliza/ui/Estados';
import './qr-del-club.css';

type WakeLock = { release: () => Promise<void> };
export interface Club { url: string; nombre: string }

/** Una lectura por negocio y pestaña: la cabecera sale en todas las pantallas. */
const vistos = new Map<string, Promise<Club | null>>();
function leerClub(companyId: string): Promise<Club | null> {
  let p = vistos.get(companyId);
  if (!p) {
    p = lecturas
      .ajustes(companyId)
      .then((a) => (a?.slug ? { url: urlUnirse(a.slug), nombre: a.display_name || 'nuestro club' } : null))
      .catch(() => null); // sin club o sin permiso: no sale
    vistos.set(companyId, p);
  }
  return p;
}

/** El club de Fideliza del negocio, o null si no tiene (o aún no se sabe). */
export function useClub(companyId: string | null | undefined): Club | null {
  const [club, setClub] = useState<Club | null>(null);
  useEffect(() => {
    setClub(null);
    if (!companyId) return;
    let vigente = true;
    void leerClub(companyId).then((c) => vigente && setClub(c));
    return () => {
      vigente = false;
    };
  }, [companyId]);
  return club;
}

/** El QR a pantalla completa, con «Enviar por WhatsApp» y «Copiar enlace». */
export function VentanaQrClub({ club, alCerrar }: { club: Club; alCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const cerrarRef = useRef(alCerrar);
  cerrarRef.current = alCerrar;
  // Con el QR a la vista, que la pantalla no se apague mientras el cliente saca su celular.
  useEffect(() => {
    let lock: WakeLock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
    void nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    const alEsc = (e: KeyboardEvent) => e.key === 'Escape' && cerrarRef.current();
    window.addEventListener('keydown', alEsc);
    return () => {
      window.removeEventListener('keydown', alEsc);
      void lock?.release().catch(() => {});
    };
  }, []);

  const texto = `Únete a ${club.nombre} y acumula premios: ${club.url}`;
  async function copiar() {
    try {
      await navigator.clipboard.writeText(club.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sin portapapeles: queda el de WhatsApp */
    }
  }

  return (
    <div className="qrc-velo" role="dialog" aria-modal="true" aria-label={`QR de ${club.nombre}`} onClick={alCerrar}>
      <div className="qrc-hoja" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="qrc-cerrar" aria-label="Cerrar" onClick={alCerrar}>
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
  );
}

/** El botón grande de Mi agenda. */
export default function QrDelClub({ companyId }: { companyId: string }) {
  const club = useClub(companyId);
  const [abierto, setAbierto] = useState(false);
  if (!club) return null;
  return (
    <>
      <button type="button" className="qrc-boton" onClick={() => setAbierto(true)}>
        <Gift size={20} aria-hidden="true" />
        <span>
          <b>QR del club</b>
          <small>Enséñaselo a tu cliente para que se una</small>
        </span>
      </button>
      {abierto && <VentanaQrClub club={club} alCerrar={() => setAbierto(false)} />}
    </>
  );
}
