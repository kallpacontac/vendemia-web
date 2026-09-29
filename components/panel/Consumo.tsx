'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TARJETA DE CONSUMO · cuántas conversaciones van del plan este mes
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Va en el dashboard y no en Ajustes porque es lo único del plan con lo que el
 * dueño puede hacer algo HOY: recargar antes de que Mia empiece a pasarle las
 * conversaciones nuevas. En Ajustes lo encontraría tarde.
 *
 * Carga sola (no dentro del dashboard) para que un fallo aquí —las tablas aún
 * no existen, la consulta tarda— no retrase ni rompa el resto de la pantalla.
 * Si no hay datos, no pinta nada: un "0 de 300" falso diría que Mia no ha
 * atendido a nadie.
 */
import { MessageCircle } from 'lucide-react';
import { useCargar } from '@/components/panel/useCargar';
import { useSondeo } from '@/components/panel/useSondeo';
import { whatsappUrl } from '@/lib/content';
import { estadoConsumo, type Nivel } from '@/lib/panel/consumo';
import { RECARGAS, miles } from '@/lib/planes';
import { getConsumo } from '@/lib/supabase/queries';

/** Cada cuánto se relee con la pestaña a la vista. Una conversación nueva no corre prisa. */
const SONDEO_CONSUMO_MS = 5 * 60 * 1000;

const COLOR: Record<Nivel, string> = {
  ok: 'var(--brand)',
  aviso: 'var(--warm)',
  recarga: 'var(--warm)',
  gracia: 'var(--hot)',
  agotado: 'var(--hot)',
};

export default function Consumo({ companyId, negocio }: { companyId: string | null; negocio?: string }) {
  const { datos, releer } = useCargar(
    // El .catch es a propósito: esta tarjeta es un extra del dashboard, y un
    // error aquí no puede tumbar la pantalla entera.
    async () => (companyId ? getConsumo(companyId).catch(() => null) : null),
    [companyId],
  );
  useSondeo(releer, SONDEO_CONSUMO_MS, !!companyId);

  if (!datos) return null;
  const e = estadoConsumo(datos);
  const color = COLOR[e.nivel];

  return (
    <div className="card">
      <div className="card-mini-head">
        <h3>Conversaciones del mes</h3>
        <MessageCircle size={15} style={{ color: 'var(--ink-soft)' }} aria-hidden="true" />
      </div>

      <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{e.titulo}</p>

      <div
        role="progressbar"
        aria-label="Conversaciones usadas del plan"
        aria-valuemin={0}
        aria-valuemax={e.tope}
        aria-valuenow={e.delPlan}
        style={{ height: 8, borderRadius: 99, background: 'var(--bg-input)', margin: '10px 0', overflow: 'hidden' }}
      >
        <div style={{ width: `${e.pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .3s' }} />
      </div>

      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>{e.detalle}</p>

      {e.ofrecerRecarga && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {/* Cada botón abre WhatsApp con el paquete ya nombrado: la
              conversación con nosotros empieza en "quiero +300", no en
              "hola, ¿cómo recargo?". El pago y el alta los hacemos a mano. */}
          {RECARGAS.map((r) => (
            <a
              key={r.conversaciones}
              className="btn btn-sm btn-ghost"
              href={whatsappUrl(
                `Hola 👋 Quiero recargar +${miles(r.conversaciones)} conversaciones (S/${r.precio})${negocio ? ` para ${negocio}` : ''}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              +{miles(r.conversaciones)} · S/{r.precio}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
