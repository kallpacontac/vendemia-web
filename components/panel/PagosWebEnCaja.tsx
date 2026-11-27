'use client';

/**
 * En la Agenda, solo el aviso: «N pagos web por validar · Validar en Caja».
 *
 * 27-nov-2026, Alvaro (The 24/7): validar el adelanto de una reserva web es dinero, y el dinero va en la
 * Caja («me marea tmbn»). La tarjeta para aprobar (ComprobantesPorRevisar) vive ahora en la Caja; aquí
 * queda el enlace para que quien mira la Agenda sepa que hay algo esperando. Sin ninguno, no sale nada.
 * Canchas no cambia: su tablero sigue validando en su sitio.
 */
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useCargar } from '@/components/panel/useCargar';

export default function PagosWebEnCaja({ companyId, recarga }: { companyId: string; recarga: unknown }) {
  const { datos } = useCargar(async () => {
    const { data, error } = await supabase().rpc('comprobantes_panel', { p_company: companyId });
    return error ? 0 : ((data ?? []) as unknown[]).length;
  }, [companyId, recarga]);
  if (!datos) return null;
  return (
    <Link href="/panel/caja" className="pagos-web-caja">
      <span>
        <b>{datos === 1 ? '1 pago web por validar' : `${datos} pagos web por validar`}</b>
        <small>El cliente reservó en tu página y subió su pago. Se valida en la Caja.</small>
      </span>
      <span className="pagos-web-caja__ir">Validar en Caja <ArrowRight size={15} aria-hidden="true" /></span>
    </Link>
  );
}
