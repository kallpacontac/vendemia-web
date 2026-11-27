'use client';

/**
 * El barbero cobra lo que falta de su cita, desde Mi agenda (datos 0012), como en la Caja: «Cobrar S/ 30»
 * → ¿cómo te pagó? → cada método con su lógica (26-nov-2026, Alvaro).
 *
 *   · EFECTIVO      un toque. La foto, según el negocio (Configuración › Cobros, lector 0004):
 *                   obligatoria de serie, u opcional.
 *   · YAPE / PLIN   con el celular de cobros conectado: SIEMPRE espera el Yape. Salen los que llegaron
 *                   (YapesQueLlegaron) y toca el de su cliente; la foto del Yape del cliente, según el
 *                   negocio. Si el Yape es de más → «por aprobar»: lo aprueba el dueño o el admin. Si no
 *                   llega → «No llegó el Yape»: deja la foto y queda por aprobar (se cobra solo si llega).
 *                   Sin celular conectado: como siempre, con la foto obligatoria.
 *
 * El importe no lo escribe nadie: es lo que falta. La base vuelve a comprobarlo todo (lector 0003/0004,
 * datos 0012) y decide; esta pantalla solo enseña lo que toca.
 */
import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import FotoDelPago from '@/components/panel/FotoDelPago';
import YapesQueLlegaron, { type LectorCobro, type YapeLlegado } from '@/components/panel/YapesQueLlegaron';
import { useAvisar } from '@/components/panel/Avisos';
import { supabase } from '@/lib/supabase/client';
import { fotoParaCobro, type FotoPago } from '@/lib/panel/fotoPago';
import { soles } from '@/lib/panel/format';

type Metodo = 'cash' | 'yape' | 'plin';
/**
 * 26-nov-2026 (Alvaro: «no solo son Yapes: Plin, transferencia… usemos un término que no confunda»).
 * Un solo botón para lo que no es efectivo: con el celular de cobros, el método real sale del aviso que
 * eligió (Yape, Plin o transferencia, lector 0003); sin él, de la foto (Yape o Plin).
 */
const METODOS: { id: Metodo; label: string }[] = [
  { id: 'cash', label: 'Efectivo' },
  { id: 'yape', label: 'Yape, Plin o transferencia' },
];

export default function CobroDelBarbero({ companyId, citaId, falta, alCerrar, alListo }: {
  companyId: string;
  citaId: string;
  falta: number;
  alCerrar: () => void;
  alListo: () => void;
}) {
  const avisar = useAvisar();
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [foto, setFoto] = useState<FotoPago | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** undefined = aún no se sabe; null = sin celular de cobros. */
  const [lector, setLector] = useState<LectorCobro | null | undefined>(undefined);
  const [yape, setYape] = useState<YapeLlegado | null>(null);
  const [noLlego, setNoLlego] = useState(false);
  const [efectivoFoto, setEfectivoFoto] = useState<'obligatoria' | 'opcional'>('obligatoria');

  // La foto del efectivo (lector 0004). Sin la 0004: obligatoria, como hasta hoy.
  useEffect(() => {
    let vivo = true;
    void supabase().rpc('cobro_efectivo_foto', { p_company: companyId }).then(({ data, error }) => {
      if (vivo && !error && data === 'opcional') setEfectivoFoto('opcional');
    });
    return () => { vivo = false; };
  }, [companyId]);

  function elegir(m: Metodo) {
    setMetodo(m);
    setFoto(null);
    setYape(null);
    setNoLlego(false);
  }

  function alFoto(f: FotoPago | null) {
    setFoto(f);
    // Si la foto es de un Yape o un Plin, el método sale de ella (sin lector).
    if (f && (f.metodo === 'yape' || f.metodo === 'plin') && metodo !== 'cash' && !lector) setMetodo(f.metodo);
  }

  const digital = metodo === 'yape' || metodo === 'plin';
  const conLector = digital && !!lector;
  const deMas = !!yape && yape.centimos > Math.round(falta * 100);
  // Qué foto pide cada camino.
  const pideFoto = metodo === 'cash' ? efectivoFoto === 'obligatoria'
    : conLector ? noLlego || lector?.foto === 'obligatoria'
    : true;
  const muestraFoto = metodo === 'cash' || (digital && lector === null) || (conLector && (noLlego || !!yape));
  const listo = !!metodo && !leyendo && !enviando && (!pideFoto || !!foto) && (!conLector || noLlego || !!yape);

  async function cobrar() {
    if (!metodo || !listo) return;
    setEnviando(true);
    const f = fotoParaCobro(foto) ?? null;
    const { data, error } = conLector
      ? noLlego
        ? await supabase().rpc('lector_dejar_por_aprobar', { p_company: companyId, p_cita: citaId, p_foto: f })
        : await supabase().rpc('lector_cobrar_con', { p_company: companyId, p_cita: citaId, p_aviso: yape!.id, p_foto: f })
      : await supabase().rpc('empleado_cobrar_saldo', { p_company: companyId, p_appointment: citaId, p_metodo: metodo, p_foto: f });
    setEnviando(false);
    if (error) {
      avisar(error.message, 'error');
      return;
    }
    const r = (data ?? {}) as { resultado?: string; cobrado?: number };
    if (r.resultado === 'por_aprobar') avisar(noLlego
      ? 'Queda por aprobar: se cobra solo si llega el pago, o lo aprueba la caja.'
      : 'Pagó de más: queda por aprobar en la caja.', 'ok');
    else avisar(`Cobro anotado: ${soles(Number(r.cobrado ?? falta))}`, 'ok');
    alListo();
  }

  const boton = !metodo ? '' : metodo === 'cash' ? `Cobré ${soles(falta)} en efectivo`
    : conLector && noLlego ? 'Dejar por aprobar'
    : conLector && deMas ? 'Mandar a aprobar'
    : conLector && yape && yape.centimos / 100 < falta ? `Cobré ${soles(yape.centimos / 100)} a cuenta`
    : `Cobré ${soles(falta)}`;
  const otroMonto = foto?.monto != null && Math.abs(foto.monto - (conLector && yape ? yape.centimos / 100 : falta)) >= 0.01;

  return (
    <div className="mag-cobro" role="group" aria-label={`Cobrar ${soles(falta)}`}>
      <div className="mag-cobro__cab">
        <b>Cobrar {soles(falta)}</b>
        <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={alCerrar} aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
      <small>{metodo ? 'Es lo que falta. Queda a tu nombre en la caja.' : '¿Cómo te pagó?'}</small>
      <div className="mag-cobro__metodos vuelto__metodos" role="radiogroup" aria-label="Cómo te pagó">
        {METODOS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={metodo === m.id}
            className={`fpill${metodo === m.id ? ' active' : ''}`} disabled={enviando} onClick={() => elegir(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {digital && !noLlego && (
        <YapesQueLlegaron companyId={companyId} citaId={citaId} elegido={yape} alElegir={setYape} alInfo={setLector} />
      )}
      {conLector && deMas && yape && (
        <small className="mag-cobro__ojo">
          Ese pago es de {soles(yape.centimos / 100)}: {soles(yape.centimos / 100 - falta)} de más. No se cobra solo: lo aprueba la caja.
        </small>
      )}
      {conLector && noLlego && (
        <small>Toma la foto del comprobante en el celular de tu cliente. Se cobra solo si el pago llega; si no, lo aprueba la caja.</small>
      )}
      {conLector && yape && pideFoto && !foto && !noLlego && <small>Toma la foto del comprobante en el celular de tu cliente.</small>}
      {muestraFoto && <FotoDelPago companyId={companyId} foto={foto} obligatoria={pideFoto} alFoto={alFoto} alLeyendo={setLeyendo} />}
      {metodo === 'cash' && pideFoto && !foto && <small>Fotografía el dinero o el recibo.</small>}
      {otroMonto && (
        <small className="mag-cobro__ojo">
          La foto dice {soles(foto?.monto ?? 0)}, pero {conLector && yape ? `el pago es de ${soles(yape.centimos / 100)}` : `se anotan ${soles(falta)}`}. Si no cuadra, no cobres y avisa a la caja.
        </small>
      )}

      {metodo && (
        <div className="mia-acciones" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={!listo} onClick={() => void cobrar()}>
            <Check size={14} /> {enviando ? 'Anotando…' : boton}
          </button>
          {conLector && !yape && !noLlego && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => { setNoLlego(true); setFoto(null); }}>
              No llegó el pago
            </button>
          )}
          {conLector && noLlego && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={enviando} onClick={() => { setNoLlego(false); setFoto(null); }}>
              Ver los pagos
            </button>
          )}
        </div>
      )}
    </div>
  );
}
