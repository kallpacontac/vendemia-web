'use client';

/**
 * La campana que «suena» (17-nov-2026, Alvaro: «una animación de campana, como timbrando: eso
 * característico que requiere atención»). Solo donde hay algo que hacer YA: clientes listos para
 * cobrar, comprobantes por revisar, citas que ya pasaron sin decir si vino. Se balancea un
 * momento cada pocos segundos (no sin parar: cansaría) y se queda quieta con «reducir movimiento».
 */
import { Bell } from 'lucide-react';

export default function Campana({ size = 16 }: { size?: number }) {
  return (
    <span className="campana" aria-hidden="true">
      <Bell size={size} />
    </span>
  );
}
