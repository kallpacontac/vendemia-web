'use client';

/**
 * El cumpleaños del cliente en la Caja (sql/0019). Pedido por Alvaro el 14-nov-2026 (The 24/7):
 * «el cajero debería preguntar y agregar ese dato para enviar recordatorios».
 *
 *   · Sin dato: «🎂 Pregúntale su cumpleaños», día y mes, Guardar. Se dice para qué sirve (el
 *     regalo del negocio), que es lo que hace que el cliente lo dé con gusto.
 *   · Con dato: una línea discreta con la fecha y «Cambiar».
 *   · Hoy cumple: aviso grande para quien atiende, con el regalo que le toca.
 *
 * Sin año, a propósito. Un fallo al leer no estorba a la Caja: simplemente no sale.
 */
import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { codigoDe, mensajeDe } from '@/modules/fideliza/dominio/errores';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface Datos { mes_dia: string | null; hoy: boolean; regalo: string | null }

/** «03-12» → «12 de marzo». */
export const fechaCumple = (mesDia: string) => {
  const [m, d] = mesDia.split('-').map(Number);
  return `${d} de ${MESES[m - 1] ?? ''}`;
};

export default function CumpleCliente({ companyId, memberId, nombre }: { companyId: string; memberId: string; nombre: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [editando, setEditando] = useState(false);
  const [dia, setDia] = useState('');
  const [mes, setMes] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    let vivo = true;
    setDatos(null); setEditando(false); setDia(''); setMes(''); setFallo('');
    void supabase().rpc('loyalty_birthday_get', { p_company: companyId, p_member: memberId }).then(({ data, error }) => {
      if (vivo && !error && data) setDatos(data as Datos);
    });
    return () => { vivo = false; };
  }, [companyId, memberId]);

  if (!datos) return null;

  async function guardar() {
    setFallo('');
    if (!dia || !mes) { setFallo('Elige el día y el mes.'); return; }
    if (Number(dia) > DIAS_MES[Number(mes) - 1]) { setFallo(`${MESES[Number(mes) - 1]} no tiene ${dia} días.`); return; }
    setGuardando(true);
    const mesDia = `${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    const { error } = await supabase().rpc('loyalty_birthday_set', { p_company: companyId, p_member: memberId, p_mes_dia: mesDia });
    setGuardando(false);
    if (error) { setFallo(mensajeDe(codigoDe(error.message))); return; }
    // Vuelve a leer para saber si es hoy.
    const r = await supabase().rpc('loyalty_birthday_get', { p_company: companyId, p_member: memberId });
    setDatos((r.data as Datos | null) ?? { ...datos!, mes_dia: mesDia });
    setEditando(false);
  }

  if (datos.hoy && !editando) {
    return (
      <div className="fz-cumple fz-cumple--hoy" role="status">
        <Cake size={22} aria-hidden="true" />
        <span><b>¡Hoy es el cumpleaños de {nombre}!</b>{datos.regalo ? <> Le toca: <b>{datos.regalo}</b>.</> : ' Salúdalo.'}</span>
      </div>
    );
  }

  if (datos.mes_dia && !editando) {
    return (
      <p className="fz-cumple fz-cumple--dato">
        <Cake size={16} aria-hidden="true" /> Cumple el <b>{fechaCumple(datos.mes_dia)}</b>
        <button type="button" className="fz-cumple__cambiar" onClick={() => {
          const [m, d] = datos.mes_dia!.split('-');
          setMes(String(Number(m))); setDia(String(Number(d))); setEditando(true);
        }}>Cambiar</button>
      </p>
    );
  }

  return (
    <div className="fz-cumple fz-cumple--pregunta">
      <p><Cake size={18} aria-hidden="true" /> <b>Pregúntale su cumpleaños</b></p>
      <small>{datos.regalo ? `Ese día le avisamos y recibe: ${datos.regalo}.` : 'Ese día le mandamos un saludo.'}</small>
      <div className="fz-cumple__campos">
        <select className="input" aria-label="Día" value={dia} onChange={(e) => setDia(e.target.value)}>
          <option value="">Día</option>
          {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
        </select>
        <select className="input" aria-label="Mes" value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="">Mes</option>
          {MESES.map((x, i) => <option key={x} value={String(i + 1)}>{x}</option>)}
        </select>
        <button type="button" className="btn btn-primary btn-sm" disabled={guardando} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        {editando && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(false)}>Cancelar</button>}
      </div>
      {fallo && <small className="fz-cumple__fallo" role="alert">{fallo}</small>}
    </div>
  );
}
