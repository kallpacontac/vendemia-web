'use client';

/**
 * El cumpleaños de un cliente nuevo (18-nov-2026, The 24/7): día y mes, sin año. Opcional.
 * Devuelve 'MM-DD' o '' (sin cumpleaños). Lo guarda cliente_cumple_guardar (datos 0017).
 */
import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export default function ElegirCumple({ valor, alCambiar }: { valor: string; alCambiar: (mesDia: string) => void }) {
  const [mes, setMes] = useState(valor ? valor.slice(0, 2) : '');
  const [dia, setDia] = useState(valor ? valor.slice(3, 5) : '');
  // Si desde fuera se limpia (cliente cobrado), se limpia aquí también.
  useEffect(() => {
    if (!valor) {
      setMes('');
      setDia('');
    }
  }, [valor]);
  const tope = mes ? DIAS_MES[Number(mes) - 1] : 31;
  const avisar = (m: string, d: string) => alCambiar(m && d && Number(d) <= DIAS_MES[Number(m) - 1] ? `${m}-${d}` : '');

  return (
    <div className="cumple">
      <span className="cumple__rotulo"><Cake size={15} aria-hidden /> Cumpleaños <small>opcional</small></span>
      <div className="cumple__campos">
        <select className="select" value={dia} aria-label="Día del cumpleaños"
          onChange={(e) => { setDia(e.target.value); avisar(mes, e.target.value); }}>
          <option value="">Día</option>
          {Array.from({ length: tope }, (_, i) => String(i + 1).padStart(2, '0')).map((d) => <option key={d} value={d}>{Number(d)}</option>)}
        </select>
        <select className="select" value={mes} aria-label="Mes del cumpleaños"
          onChange={(e) => { setMes(e.target.value); avisar(e.target.value, dia); }}>
          <option value="">Mes</option>
          {MESES.map((m, i) => <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Lo guarda en el cliente de ese celular (y en su tarjeta del Club, si tiene). Sin la 0017, no pasa nada. */
export async function guardarCumple(companyId: string, telefono: string, mesDia: string): Promise<boolean> {
  if (!mesDia || telefono.replace(/\D/g, '').length < 9) return false;
  const { error } = await supabase().rpc('cliente_cumple_guardar', { p_company: companyId, p_telefono: telefono, p_mes_dia: mesDia });
  return !error;
}
