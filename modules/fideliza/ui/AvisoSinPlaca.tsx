'use client';

/**
 * «¿Te llegó una placa?» · en Mi página, mientras el negocio no tiene ninguna.
 *
 * El camino normal es placa → «Activar mi placa» → login → código. Pero ese
 * «a dónde ibas» vive en el navegador (lib/panel/destino.ts): si la cuenta se
 * confirma desde el correo en OTRO navegador (la app de Gmail, por ejemplo), se
 * pierde y el dueño acaba montando su página sin haber canjeado el código. La
 * placa sigue «sin activar» aunque publique. Pasó el 17-oct.
 *
 * Así que aquí no se depende de cómo llegó: sin placas, se le ofrece. Se puede
 * cerrar (hay negocios que solo usan su link o un QR impreso por ellos).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { useCargar } from '@/components/panel/useCargar';
import { lecturas } from '@/modules/fideliza/cliente/api';

const clave = (companyId: string) => `fz_sin_placa_cerrado:${companyId}`;

export default function AvisoSinPlaca() {
  const { companyId, puede } = useFideliza();
  const [cerrado, setCerrado] = useState(true);
  const { datos: placas } = useCargar(async () => (companyId ? lecturas.placas(companyId) : null), [companyId]);

  useEffect(() => {
    if (!companyId) return;
    try {
      setCerrado(localStorage.getItem(clave(companyId)) === '1');
    } catch {
      setCerrado(false);
    }
  }, [companyId]);

  if (!companyId || !puede('devices.manage') || cerrado || !placas || placas.length > 0) return null;

  const cerrar = () => {
    setCerrado(true);
    try {
      localStorage.setItem(clave(companyId), '1');
    } catch {
      /* ventana privada: vuelve a salir la próxima vez */
    }
  };

  return (
    <div className="fz-panel-aviso fz-panel-aviso--info" role="status">
      <span style={{ flex: 1 }}>
        <b>¿Te llegó una placa Vendemia?</b> Actívala con el código de la tarjeta que vino en la caja (XXXXX-XXXXX). Si ya publicaste tu página, la
        placa la abre al instante.
      </span>
      <Link className="btn btn-primary btn-sm" href="/panel/fideliza/placas?activar=1">
        Activar mi placa
      </Link>
      <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar}>
        No tengo placa
      </button>
    </div>
  );
}
