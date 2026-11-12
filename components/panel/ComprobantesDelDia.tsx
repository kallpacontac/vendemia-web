'use client';

/**
 * Las fotos de los cobros de un día, en la Caja: las que se adjuntaron al cobrar desde el panel
 * («Comprobante al cobrar», datos 0010) y las que el cliente subió en la página y quedaron
 * aprobadas. Para cotejar al cierre con la app de Yape o Plin sin buscar nada.
 *
 * No pinta nada si ese día no hay fotos, o si la base aún no tiene la 0010.
 */
import { ExternalLink } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { supabase } from '@/lib/supabase/client';
import { soles } from '@/lib/panel/format';
import { etiquetaMetodo } from '@/lib/panel/metodosPago';
import './foto-del-pago.css';

interface FotoDelDia {
  id: string;
  url: string;
  operacion: string;
  metodo: string;
  monto: number | string | null;
  via: 'registrar_pago' | 'cobrada' | 'cancha' | 'pagina';
  creado_at: string;
  cliente: string;
  servicio: string;
}

const DE_DONDE: Record<FotoDelDia['via'], string> = {
  registrar_pago: 'Registrar pago',
  cobrada: 'Cobrada',
  cancha: 'Validar pago',
  pagina: 'Subida por el cliente',
};

const hora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
};

export default function ComprobantesDelDia({ companyId, dia, recarga }: { companyId: string; dia: string; recarga?: unknown }) {
  const { datos } = useCargar(async () => {
    const { data, error } = await supabase().rpc('cobro_fotos_del_dia', { p_company: companyId, p_dia: dia });
    return error ? [] : ((data ?? []) as FotoDelDia[]);
  }, [companyId, dia, recarga]);

  if (!datos?.length) return null;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-mini-head">
        <h3>Comprobantes del día</h3>
        <small className="muted">{datos.length === 1 ? '1 foto' : `${datos.length} fotos`}</small>
      </div>
      <ul className="fp-dia">
        {datos.map((f) => (
          <li key={f.id}>
            <a href={f.url} target="_blank" rel="noopener" aria-label={`Abrir el comprobante de ${f.cliente || 'cliente'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" loading="lazy" />
            </a>
            <span className="fp-dia__dato">
              <b>{f.cliente || 'Cliente'}</b>
              <small>
                {[hora(f.creado_at), etiquetaMetodo(f.metodo), f.operacion ? `op. ${f.operacion}` : '', DE_DONDE[f.via] ?? '', f.servicio]
                  .filter(Boolean)
                  .join(' · ')}
              </small>
            </span>
            <span className="fp-dia__monto">
              {f.monto !== null && f.monto !== '' ? soles(Number(f.monto)) : ''}{' '}
              <a href={f.url} target="_blank" rel="noopener" aria-hidden="true" tabIndex={-1}><ExternalLink size={13} /></a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
