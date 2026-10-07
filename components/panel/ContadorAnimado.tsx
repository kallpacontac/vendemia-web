'use client';

import { useEffect, useState } from 'react';
import { soles } from '@/lib/panel/format';

const DURACION_CONTADOR_MS = 1235;

/** Conserva el valor final para lectores de pantalla y reserva su ancho. */
export default function ContadorAnimado({ valor, moneda = false }: { valor: number; moneda?: boolean }) {
  const [visible, setVisible] = useState(valor);

  useEffect(() => {
    const movimiento = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let inicio: number | undefined;
    const finalizar = () => {
      cancelAnimationFrame(frame);
      setVisible(valor);
    };
    const animar = (ahora: number) => {
      inicio ??= ahora;
      const progreso = Math.min((ahora - inicio) / DURACION_CONTADOR_MS, 1);
      const suavizado = 1 - (1 - progreso) ** 3;
      setVisible(progreso === 1 ? valor : Math.round(valor * suavizado));
      if (progreso < 1) frame = requestAnimationFrame(animar);
    };
    if (movimiento.matches || valor === 0) finalizar();
    else {
      setVisible(0);
      frame = requestAnimationFrame(animar);
    }
    const alCambiarPreferencia = () => { if (movimiento.matches) finalizar(); };
    movimiento.addEventListener('change', alCambiarPreferencia);
    return () => {
      cancelAnimationFrame(frame);
      movimiento.removeEventListener('change', alCambiarPreferencia);
    };
  }, [valor]);

  const formato = (n: number) => moneda ? soles(n) : n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
  return <span className="contador-animado">
    <span className="contador-animado__ancho" aria-hidden="true">{formato(valor)}</span>
    <span className="contador-animado__numero" aria-hidden="true">{formato(visible)}</span>
    <span className="sr-only">{formato(valor)}</span>
  </span>;
}
