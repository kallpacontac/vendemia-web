'use client';

/**
 * Cierre del día › «Ingresos del día» (datos 0023; The 24/7, 19-nov-2026: «en el cierre de caja,
 * solo para la cuenta del dueño, que pueda ingresar los ingresos del día y los gastos/adelantos»).
 *
 * Dinero que entró sin un ticket: un corte que no se anotó, una venta por fuera, el fondo de caja.
 * Suma a «Entró, por método» y al neto. Lo apunta y lo borra SOLO el dueño (lo impone Postgres);
 * el administrador lo ve, para que el cierre le cuadre igual.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useAvisar } from './Avisos';
import { supabase } from '@/lib/supabase/client';
import { diaMes, soles } from '@/lib/panel/format';
import { guiarA } from '@/lib/panel/guiar';
import { METODO_LABEL, type MetodoPago } from '@/lib/panel/metodosPago';

export interface IngresoCaja {
  id: string;
  dia: string;
  concepto: string;
  importe: number;
  metodo: MetodoPago;
}

const METODOS: MetodoPago[] = ['cash', 'yape', 'plin', 'bank_transfer'];
const RAPIDOS = ['Corte sin ticket', 'Venta de producto', 'Fondo de caja', 'Otro ingreso'];

/** Los del día. null = sin la 0023 o sin permiso: la tarjeta no sale. */
export async function leerIngresosCaja(companyId: string, dia: string): Promise<IngresoCaja[] | null> {
  const { data, error } = await supabase().rpc('caja_ingresos_leer', { p_company: companyId, p_dia: dia });
  if (error) return null;
  return ((data ?? []) as IngresoCaja[]).map((i) => ({ ...i, importe: Number(i.importe) }));
}

export default function IngresosCaja({
  companyId,
  dia,
  ingresos,
  esDueno,
  soloTodas,
  alCambiar,
  incrustado = false,
}: {
  companyId: string;
  dia: string;
  ingresos: IngresoCaja[];
  esDueno: boolean;
  /** Mirando una sede: son de todo el negocio y la lista solo sale en «Todas». */
  soloTodas: boolean;
  alCambiar: () => void;
  /** Dentro de la tarjeta «Entró, por método» del Cierre: sin tarjeta propia. */
  incrustado?: boolean;
}) {
  const avisar = useAvisar();
  const [abierto, setAbierto] = useState(false);
  const [importe, setImporte] = useState('');
  const [concepto, setConcepto] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('cash');
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const refMonto = useRef<HTMLInputElement>(null);
  const refFin = useRef<HTMLDivElement>(null);

  const monto = Number(importe.replace(',', '.'));
  const falta = !(Number.isFinite(monto) && monto > 0) ? '¿cuánto entró?' : !concepto.trim() ? '¿de qué es?' : '';
  const total = ingresos.reduce((t, i) => t + i.importe, 0);

  useEffect(() => {
    if (!abierto) return;
    guiarA(raiz.current);
    refMonto.current?.focus({ preventScroll: true });
  }, [abierto]);

  function limpiar() {
    setImporte('');
    setConcepto('');
    setMetodo('cash');
  }

  async function guardar() {
    if (falta || guardando) return;
    setGuardando(true);
    const { error } = await supabase().rpc('caja_ingreso_guardar', {
      p_company: companyId,
      p_datos: { dia, concepto: concepto.trim(), importe: monto, metodo },
    });
    setGuardando(false);
    if (error) {
      avisar(/caja_ingreso_guardar/.test(error.message) ? 'Falta instalar los ingresos de caja (modules/datos/sql/0023_ingresos_de_caja.sql).' : error.message, 'error');
      return;
    }
    avisar(`✓ Ingreso de ${soles(monto)} apuntado.`, 'ok');
    limpiar();
    setAbierto(false);
    alCambiar();
  }

  async function borrar(i: IngresoCaja) {
    if (!window.confirm(`¿Borrar «${i.concepto}» (${soles(i.importe)})?`)) return;
    setBorrando(i.id);
    const { error } = await supabase().rpc('caja_ingreso_borrar', { p_company: companyId, p_id: i.id });
    setBorrando(null);
    if (error) return avisar(error.message, 'error');
    avisar('Ingreso borrado.', 'ok');
    alCambiar();
  }

  return (
    <div ref={raiz} className={incrustado ? 'gc gc--dentro' : 'card gc'}>
      <div className="card-mini-head">
        {incrustado ? <b>Ingresos sin ticket</b> : <h3>Ingresos del día</h3>}
        {esDueno && !abierto && !soloTodas && (
          <button type="button" className="btn btn-primary" onClick={() => setAbierto(true)}>
            <Plus size={16} /> Ingreso
          </button>
        )}
      </div>

      {abierto && (
        <div className="gc-form">
          <div className="gc-cab">
            <b>Nuevo ingreso · {diaMes(new Date(`${dia}T12:00:00`))}</b>
            <button type="button" className="ticket-cerrar" onClick={() => { limpiar(); setAbierto(false); }} disabled={guardando}>
              <X size={15} /> Cerrar
            </button>
          </div>

          <label className="gc-campo">
            <span>¿Cuánto entró?</span>
            <span className="gc-monto">
              <i>S/</i>
              <input ref={refMonto} inputMode="decimal" enterKeyHint="next" placeholder="0" value={importe}
                onChange={(e) => setImporte(e.target.value)} aria-label="Importe" />
            </span>
          </label>

          <div className="gc-campo">
            <span>¿De qué?</span>
            <div className="ticket-chips">
              {RAPIDOS.map((r) => (
                <button key={r} type="button" className={`ticket-chip${concepto === r ? ' on' : ''}`} onClick={() => setConcepto(r)}>
                  {r}
                </button>
              ))}
            </div>
            <input className="input" placeholder="O escríbelo" value={concepto} onChange={(e) => setConcepto(e.target.value)} aria-label="Concepto" />
          </div>

          <div className="gc-campo">
            <span>¿Con qué?</span>
            <div className="ticket-chips" role="radiogroup" aria-label="Método">
              {METODOS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={metodo === m} className={`ticket-chip${metodo === m ? ' on' : ''}`}
                  onClick={() => { setMetodo(m); guiarA(refFin.current, 'end'); }}>
                  {METODO_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <div ref={refFin} className="gc-fin">
            {falta ? (
              <p className="ticket-falta">Falta: {falta}</p>
            ) : (
              <button type="button" className="btn btn-primary gc-guardar" disabled={guardando} onClick={() => void guardar()}>
                <Check size={18} /> {guardando ? 'Guardando…' : `Guardar ${soles(monto)}`}
              </button>
            )}
          </div>
        </div>
      )}

      {soloTodas ? (
        <p className="muted" style={{ fontSize: 12.5 }}>Los ingresos sin ticket son de todo el negocio: se ven en «Todas las sedes».</p>
      ) : ingresos.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>{esDueno ? 'Lo que entró sin ticket (un corte sin anotar, el fondo de caja…), apúntalo aquí.' : 'Sin ingresos sin ticket este día.'}</p>
      ) : (
        <>
          {ingresos.map((i) => (
            <div className="kv-fila gc-fila" key={i.id}>
              <span>
                {i.concepto}
                <small className="gc-tipo">{METODO_LABEL[i.metodo] ?? i.metodo}</small>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <b>{soles(i.importe)}</b>
                {esDueno && (
                  <button type="button" className="q-icon" aria-label={`Borrar ${i.concepto}`} disabled={borrando === i.id} onClick={() => void borrar(i)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </span>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Total {soles(total)} · ya está sumado arriba y en el neto.</p>
        </>
      )}
      {!esDueno && ingresos.length > 0 && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Los ingresos sin ticket solo los apunta el dueño.</p>}
    </div>
  );
}
