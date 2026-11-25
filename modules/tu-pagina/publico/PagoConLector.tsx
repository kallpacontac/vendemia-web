'use client';

/**
 * El paso de pagar una cita apartada cuando el negocio tiene el celular de cobros conectado
 * (Vendemia Caja, lector 0002): el cliente yapea y toca «Ya yapeé»; la reserva se confirma sola
 * cuando el aviso llega a ese celular. Sin captura y sin IA.
 *
 *   · Cuenta el Yape aunque haya llegado unos minutos ANTES de tocar el botón.
 *   · La captura queda siempre a la mano («¿Algo falló? Sube tu captura»), y pasa al frente si en
 *     5 minutos no llegó nada.
 *   · Sin lector conectado (o sin la SQL), es SubirComprobante de siempre.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import SubirComprobante, { type QueSeReserva } from '@/modules/tu-pagina/publico/SubirComprobante';

const CADA_MS = 4_000;
const HASTA_MS = 5 * 60_000;

/** ¿El negocio tiene el lector? null mientras se pregunta. Solo pregunta cuando `pedir` (hay que pagar). */
export function useLectorActivo(slug: string, pedir = true): boolean | null {
  const [activo, setActivo] = useState<boolean | null>(null);
  useEffect(() => {
    if (!pedir) return;
    let vivo = true;
    fetch(`/api/tu-pagina/publico/ya-pague?slug=${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { activo?: boolean }) => { if (vivo) setActivo(j.activo === true); })
      .catch(() => { if (vivo) setActivo(false); });
    return () => { vivo = false; };
  }, [slug, pedir]);
  return activo;
}

type Estado = 'inicio' | 'esperando' | 'confirmada' | 'cobrada' | 'tarde';

export default function PagoConLector({ slug, codigo, telefono, que = 'cita', activo, alSubir }: {
  slug: string; codigo: string; telefono: string; que?: QueSeReserva;
  /** De useLectorActivo: el que la pinta decide también el texto de los pasos. */
  activo: boolean | null;
  alSubir?: (d: { tieneTarjeta?: boolean }) => void;
}) {
  const [estado, setEstado] = useState<Estado>('inicio');
  const [verCaptura, setVerCaptura] = useState(false);
  const desde = useRef(0);
  // En una ref: la página se redibuja cada segundo (cuenta regresiva del plazo) y eso no puede
  // reiniciar la consulta.
  const alListo = useRef(alSubir);
  alListo.current = alSubir;

  useEffect(() => {
    if (estado !== 'esperando') return;
    let vivo = true;
    const preguntar = async () => {
      try {
        const r = await fetch('/api/tu-pagina/publico/ya-pague', {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, codigo, telefono }),
        });
        const j = (await r.json().catch(() => ({}))) as { estado?: string };
        if (!vivo) return;
        if (j.estado === 'confirmada' || j.estado === 'cobrada') {
          setEstado(j.estado);
          alListo.current?.({});
          return;
        }
        if (j.estado === 'sin_lector') { setEstado('tarde'); setVerCaptura(true); return; }
      } catch { /* sin red: se vuelve a preguntar */ }
      if (!vivo) return;
      if (Date.now() - desde.current > HASTA_MS) { setEstado('tarde'); setVerCaptura(true); return; }
      reloj = window.setTimeout(preguntar, CADA_MS);
    };
    let reloj = window.setTimeout(preguntar, 0);
    return () => { vivo = false; window.clearTimeout(reloj); };
  }, [estado, slug, codigo, telefono]);

  if (activo === null) return null;
  if (!activo) return <SubirComprobante slug={slug} codigo={codigo} telefono={telefono} que={que} alSubir={alSubir} />;

  if (estado === 'confirmada' || estado === 'cobrada') {
    return (
      <div className="tp-subir">
        <p className="tp-subir__ok" role="status">
          <Check size={18} aria-hidden="true" />
          <span>
            <b>{estado === 'cobrada' ? '¡Llegó tu pago! Tu reserva está pagada completa' : '¡Llegó tu pago! Tu reserva está confirmada'}</b>
            Te esperamos.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="tp-subir">
      {estado === 'inicio' && (
        <button type="button" className="tp-boton" onClick={() => { desde.current = Date.now(); setEstado('esperando'); }}>
          <Check size={20} aria-hidden="true" /> Ya yapeé
        </button>
      )}
      {estado === 'esperando' && (
        <p className="tp-subir__ok tp-subir__ok--aviso" role="status">
          <Loader2 size={18} aria-hidden="true" className="tp-girando" />
          <span><b>Esperando tu Yape…</b>Se confirma sola en cuanto nos llega. No cierres esta página.</span>
        </p>
      )}
      {estado === 'tarde' && (
        <p className="tp-aviso" role="alert">Aún no nos llega tu pago. Sube la captura aquí abajo y el negocio lo revisa.</p>
      )}
      {verCaptura ? (
        <SubirComprobante slug={slug} codigo={codigo} telefono={telefono} que={que} alSubir={alSubir} />
      ) : (
        <button type="button" className="tp-enlace" onClick={() => setVerCaptura(true)}>¿Algo falló? Sube tu captura</button>
      )}
    </div>
  );
}
