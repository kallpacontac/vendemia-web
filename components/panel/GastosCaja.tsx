'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * GASTOS Y ADELANTOS · todo lo que sale de la caja, en un solo sitio
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The 24/7 (18-nov-2026): «hace adelantos o gastos, por ejemplo darle un almuerzo; que cualquier
 * gasto esté centralizado aquí, sin tantos botones; un combo con sus barberos».
 *
 * Tres preguntas, una debajo de otra, y un botón grande:
 *   ¿Cuánto?   el importe.
 *   ¿En qué?   escrito o con un toque (Almuerzo, Adelanto, Insumos…).
 *   ¿De quién? UN combo: «Del negocio», «Personal (retiro del dueño)» o un barbero. Con un barbero
 *              sale una sola casilla: «Descontar de su comisión». Marcada = adelanto (se le resta
 *              en Comisiones y en su «Mi comisión»); desmarcada = gasto del negocio para él (el
 *              almuerzo). Se guarda en datos 0013 (gastos.tipo y gastos.employee_id).
 *
 * Guiado (18-nov): al abrir, la vista baja al formulario y el cursor queda en «¿Cuánto?» (sale el
 * teclado numérico); cada respuesta lleva al siguiente paso, resaltado (lib/panel/guiar.ts).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { guiarA } from '@/lib/panel/guiar';
import { Check, Plus, Trash2, X } from 'lucide-react';
import ComboPanel from '@/components/panel/ComboPanel';
import { useComando } from '@/components/panel/Avisos';
import { diaMes, soles } from '@/lib/panel/format';
import type { Trabajador } from '@/lib/supabase/queries';
import type { GastoRow } from '@/lib/supabase/types';

const RAPIDOS: { texto: string; descuenta: boolean | null }[] = [
  { texto: 'Almuerzo', descuenta: false },
  { texto: 'Adelanto', descuenta: true },
  { texto: 'Insumos', descuenta: null },
  { texto: 'Luz / agua', descuenta: null },
  { texto: 'Alquiler', descuenta: null },
  { texto: 'Limpieza', descuenta: null },
];

const NEGOCIO = '·negocio·';
const PERSONAL = '·personal·';

type Gasto = Pick<GastoRow, 'id' | 'concepto' | 'categoria' | 'importe'> & Partial<Pick<GastoRow, 'tipo' | 'employee_id'>>;

export default function GastosCaja({
  dia,
  gastos,
  trabajadores,
  soloTodas,
  alCambiar,
  modo = 'completo',
  alCerrar,
}: {
  dia: string;
  gastos: Gasto[];
  trabajadores: Trabajador[];
  /** Mirando una sede: los gastos son de todo el negocio y la lista solo sale en «Todas». */
  soloTodas: boolean;
  alCambiar: () => void;
  /**
   * 'formulario': solo el formulario, ya abierto (la pestaña «Cobrar»: apuntar un gasto con el
   * cliente delante y volver a la cola). 'completo': la lista del día y «+ Gasto» (el Cierre).
   */
  modo?: 'completo' | 'formulario';
  alCerrar?: () => void;
}) {
  const comando = useComando();
  const activos = useMemo(() => trabajadores.filter((t) => t.activo), [trabajadores]);
  const nombre = useMemo(() => new Map(trabajadores.map((t) => [t.id, t.name])), [trabajadores]);
  const soloForm = modo === 'formulario';
  const [abierto, setAbiertoInterno] = useState(soloForm);
  const setAbierto = (a: boolean) => {
    setAbiertoInterno(a);
    if (!a) alCerrar?.();
  };
  const [importe, setImporte] = useState('');
  const [concepto, setConcepto] = useState('');
  const [quien, setQuien] = useState(NEGOCIO);
  const [descuenta, setDescuenta] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const monto = Number(importe.replace(',', '.'));
  const esBarbero = quien !== NEGOCIO && quien !== PERSONAL;
  const falta = !(Number.isFinite(monto) && monto > 0) ? '¿Cuánto fue?' : !concepto.trim() ? '¿En qué se gastó?' : '';
  const total = gastos.reduce((t, g) => t + Number(g.importe ?? 0), 0);
  const adelantos = gastos.filter((g) => g.tipo === 'adelanto').reduce((t, g) => t + Number(g.importe ?? 0), 0);

  function rapido(r: (typeof RAPIDOS)[number]) {
    setConcepto(r.texto);
    if (r.descuenta !== null) setDescuenta(r.descuenta);
    guiarA(refQuien.current);
  }

  function limpiar() {
    setImporte('');
    setConcepto('');
    setQuien(NEGOCIO);
    setDescuenta(true);
  }

  async function guardar() {
    if (falta || guardando) return;
    setGuardando(true);
    const tipo = quien === PERSONAL ? 'personal' : esBarbero && descuenta ? 'adelanto' : 'negocio';
    const r = await comando(
      'upsert_gasto',
      {
        gasto: {
          fecha: dia,
          concepto: concepto.trim(),
          categoria: RAPIDOS.some((x) => x.texto === concepto.trim()) ? concepto.trim() : '',
          importe: monto,
          tipo,
          employee_id: esBarbero ? quien : '',
        },
      },
      tipo === 'adelanto' ? `Adelanto a ${nombre.get(quien) ?? 'el barbero'} apuntado: se descuenta de su comisión.` : 'Gasto apuntado.',
      alCambiar,
    );
    setGuardando(false);
    if (r) {
      limpiar();
      setAbierto(false);
    }
  }

  async function borrar(g: Gasto) {
    if (!window.confirm(`¿Borrar «${g.concepto}» (${soles(Number(g.importe))})?`)) return;
    setBorrando(g.id);
    await comando('delete_gasto', { id: g.id }, 'Gasto borrado', alCambiar);
    setBorrando(null);
  }

  // ── La guía ──
  const raiz = useRef<HTMLDivElement>(null);
  const refMonto = useRef<HTMLInputElement>(null);
  const refEnQue = useRef<HTMLDivElement>(null);
  const refQuien = useRef<HTMLDivElement>(null);
  const refFin = useRef<HTMLDivElement>(null);
  const ahora = !(Number.isFinite(monto) && monto > 0) ? 'cuanto' : !concepto.trim() ? 'enque' : 'guardar';
  useEffect(() => {
    if (!abierto) return;
    guiarA(raiz.current);
    refMonto.current?.focus({ preventScroll: true });
  }, [abierto]);
  /** «Siguiente» del teclado: deja el número y baja a «¿En qué?». */
  const siguiente = (e: React.KeyboardEvent<HTMLInputElement>, a: React.RefObject<HTMLElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.currentTarget.blur();
    guiarA(a.current);
  };

  const etiqueta = (g: Gasto) =>
    g.tipo === 'adelanto'
      ? { texto: `Adelanto · ${g.employee_id ? (nombre.get(g.employee_id) ?? 'barbero') : 'sin barbero'}`, clase: 'gc-tipo--adelanto' }
      : g.tipo === 'personal'
        ? { texto: 'Personal', clase: 'gc-tipo--personal' }
        : { texto: g.employee_id ? `Del negocio · para ${nombre.get(g.employee_id) ?? 'un barbero'}` : 'Del negocio', clase: '' };

  return (
    <div ref={raiz} className={`card gc${soloForm ? ' gc--solo' : ''}`}>
      {!soloForm && <div className="card-mini-head">
        <h3>Gastos y adelantos</h3>
        {!abierto && (
          <button type="button" className="btn btn-primary" onClick={() => setAbierto(true)}>
            <Plus size={16} /> Gasto
          </button>
        )}
      </div>}

      {abierto && (
        <div className="gc-form">
          <div className="gc-cab">
            <b>Nuevo gasto · {diaMes(new Date(`${dia}T12:00:00`))}</b>
            <button type="button" className="ticket-cerrar" onClick={() => { limpiar(); setAbierto(false); }} disabled={guardando}>
              <X size={15} /> Cerrar
            </button>
          </div>

          <label className={`gc-campo${ahora === 'cuanto' ? ' gc-campo--ahora' : ''}`}>
            <span>¿Cuánto?</span>
            <span className="gc-monto">
              <i>S/</i>
              <input ref={refMonto} inputMode="decimal" enterKeyHint="next" placeholder="0" value={importe} onChange={(e) => setImporte(e.target.value)}
                onKeyDown={(e) => siguiente(e, refEnQue)} aria-label="Importe" autoFocus />
            </span>
          </label>

          <div ref={refEnQue} className={`gc-campo${ahora === 'enque' ? ' gc-campo--ahora' : ''}`}>
            <span>¿En qué?</span>
            <div className="ticket-chips">
              {RAPIDOS.map((r) => (
                <button key={r.texto} type="button" className={`ticket-chip${concepto === r.texto ? ' on' : ''}`} onClick={() => rapido(r)}>
                  {r.texto}
                </button>
              ))}
            </div>
            <input className="input" placeholder="O escríbelo: navajas, toallas…" value={concepto} onChange={(e) => setConcepto(e.target.value)}
              enterKeyHint="next" onKeyDown={(e) => siguiente(e, refQuien)} aria-label="Concepto" />
          </div>

          <div ref={refQuien} className="gc-campo">
            <span>¿De quién?</span>
            <ComboPanel tipo="persona" etiqueta="De quién es el gasto" value={quien}
              alCambiar={(q) => { setQuien(q); guiarA(refFin.current, 'end'); }}
              opciones={[
                { value: NEGOCIO, label: 'Del negocio' },
                { value: PERSONAL, label: 'Personal', detalle: 'retiro del dueño' },
                ...activos.map((t) => ({ value: t.id, label: t.name, detalle: 'barbero' })),
              ]} />
            {esBarbero && (
              <label className="gc-descuenta">
                <input type="checkbox" checked={descuenta} onChange={(e) => setDescuenta(e.target.checked)} />
                <span>
                  <b>Descontar de su comisión</b>
                  <small>{descuenta ? 'Es un adelanto: se le resta de lo que va a recibir.' : 'Lo paga el negocio (por ejemplo, su almuerzo).'}</small>
                </span>
              </label>
            )}
          </div>

          <div ref={refFin} className="gc-fin">
            {falta ? (
              <p className="ticket-falta">Falta: {falta.charAt(0).toLowerCase() + falta.slice(1)}</p>
            ) : (
              <button type="button" className="btn btn-primary gc-guardar" disabled={guardando} onClick={() => void guardar()}>
                <Check size={18} /> {guardando ? 'Guardando…' : `Guardar ${soles(monto)}`}
              </button>
            )}
          </div>
        </div>
      )}

      {soloForm ? null : soloTodas ? (
        <p className="vacio">Los gastos son de todo el negocio: la lista se ve en «Todas las sedes».</p>
      ) : gastos.length === 0 ? (
        <p className="vacio">Sin gastos este día.</p>
      ) : (
        <>
          {gastos.map((g) => {
            const e = etiqueta(g);
            return (
              <div className="kv-fila gc-fila" key={g.id}>
                <span>
                  {g.concepto}
                  <small className={`gc-tipo ${e.clase}`}>{e.texto}</small>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <b>{soles(Number(g.importe))}</b>
                  <button type="button" className="q-icon" aria-label={`Borrar ${g.concepto}`} disabled={borrando === g.id} onClick={() => void borrar(g)}>
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            );
          })}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Total {soles(total)}{adelantos > 0 ? ` · ${soles(adelantos)} en adelantos (se descuentan en Comisiones)` : ''}
          </p>
        </>
      )}
    </div>
  );
}
