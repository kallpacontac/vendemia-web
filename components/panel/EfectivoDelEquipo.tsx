'use client';

/**
 * «En efectivo, ¿foto?» para cuando cobran los empleados (lector 0004, 26-nov-2026, Alvaro: «configurable»).
 * Obligatoria de serie (como hasta hoy: The 24/7 no cambia) u opcional. Dueño y administrador; la base lo
 * vuelve a mirar (empleado_cobrar_saldo). Sin la 0004 en la base no sale.
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';

type Modo = 'obligatoria' | 'opcional';

export default function EfectivoDelEquipo({ companyId, puede }: { companyId: string; puede: boolean }) {
  const avisar = useAvisar();
  const [guardando, setGuardando] = useState(false);
  const { datos, releer } = useCargar(async (): Promise<Modo | null> => {
    const { data, error } = await supabase().rpc('cobro_efectivo_foto', { p_company: companyId });
    return error ? null : data === 'opcional' ? 'opcional' : 'obligatoria';
  }, [companyId]);
  if (!datos) return null;

  async function cambiar(modo: Modo) {
    setGuardando(true);
    const { error } = await supabase().rpc('cobro_efectivo_foto_guardar', { p_company: companyId, p_modo: modo });
    setGuardando(false);
    if (error) return avisar(error.message, 'error');
    avisar(modo === 'opcional' ? 'En efectivo, la foto ahora es opcional.' : 'En efectivo, la foto ahora es obligatoria.', 'ok');
    releer();
  }

  return (
    <div className="cfg-enlace" style={{ marginTop: 12 }}>
      <div>
        <b>En efectivo, foto {datos === 'opcional' ? 'opcional' : 'obligatoria'}</b>
        <small>
          {datos === 'opcional'
            ? 'El empleado cobra el efectivo con un toque. Lo que lo comprueba es el cuadre del cajón al cierre.'
            : 'El empleado fotografía el dinero o el recibo en cada cobro en efectivo. En Yape y Plin la foto se pide siempre.'}
        </small>
      </div>
      {puede && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={guardando}
          onClick={() => void cambiar(datos === 'opcional' ? 'obligatoria' : 'opcional')}>
          {datos === 'opcional' ? 'Pedir foto' : 'Hacerla opcional'}
        </button>
      )}
    </div>
  );
}
