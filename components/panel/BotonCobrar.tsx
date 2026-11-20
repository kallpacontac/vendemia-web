'use client';

/**
 * «Cobrada» → ¿con qué? Un botón que, al pulsarlo, se abre en los métodos de
 * pago en el mismo sitio. El método es lo que desglosa la caja del día: un
 * cobro sin método entra como «sin método» y la caja no cuadra con lo que hay
 * en el cajón y en el Yape.
 *
 * Con «Comprobante al cobrar» encendido (Configuración › Negocio, datos 0010),
 * Yape, Plin y transferencia pasan por un paso más: la foto del pago, opcional
 * u obligatoria según el negocio. El efectivo sigue siendo un toque.
 *
 * Con `total`, un botón más: «Con vuelto» (lib/panel/vuelto.ts). Como un cajero:
 * con qué pagó, el billete que entregó (un toque) y el vuelto en grande. Lo justo
 * sigue siendo un toque en «Efectivo». Si yapeó o plineó de más, el vuelto sale
 * del cajón y se apunta como gasto «Vuelto · Yape» para que la caja cuadre.
 *
 * Lo usan la Agenda («Ya pasaron») y la Caja («Por cobrar», «Cobrar», «Listos»).
 */
import { useState } from 'react';
import { ArrowLeftRight, Check, Wallet, X } from 'lucide-react';
import FotoDelPago from '@/components/panel/FotoDelPago';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useSesion } from '@/components/panel/Sesion';
import { isoLocal } from '@/lib/panel/format';
import { aplicarOAnotar, nuevoId } from '@/lib/panel/sinConexion/subir';
import { METODO_LABEL, METODOS_CITA, type MetodoPago } from '@/lib/panel/metodosPago';
import { exigeFoto, fotoParaMetodo, type FotoPago } from '@/lib/panel/fotoPago';
import { billetesPara, categoriaVuelto, METODOS_CON_VUELTO, vueltoDe } from '@/lib/panel/vuelto';

/** Con céntimos: S/ 15.50 de vuelto no es S/ 16. */
const soles2 = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string) => Number(String(s).replace(',', '.'));

export function BotonCobrar({
  ocupado,
  alCobrar,
  metodos = METODOS_CITA,
  etiqueta = 'Cobrada',
  grande = false,
  total,
}: {
  ocupado?: boolean;
  /** El texto del botón cerrado: «Cobrada» en una lista, «Cobrar S/ 25» en el ticket. */
  etiqueta?: string;
  /** Botones de tamaño normal (no `btn-sm`): para el mostrador, con el dedo, en la tablet. */
  grande?: boolean;
  /** `foto` solo llega si se adjuntó una: se manda con el cobro y Postgres la revisa. */
  alCobrar: (metodo: MetodoPago, foto?: FotoPago) => void;
  metodos?: MetodoPago[];
  /** Lo que se cobra. Con él sale «Con vuelto». */
  total?: number;
}) {
  const { companyId, cobroFoto, session, rol } = useSesion();
  const comando = useComando();
  const avisar = useAvisar();
  const [eligiendo, setEligiendo] = useState(false);
  /** El método elegido que espera su foto. */
  const [conFoto, setConFoto] = useState<MetodoPago | null>(null);
  const [foto, setFoto] = useState<FotoPago | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  /** El paso «Con vuelto»: con qué pagó y cuánto entregó. */
  const [vuelto, setVuelto] = useState<{ metodo: MetodoPago; recibido: string } | null>(null);
  /** Un Yape/Plin de más que espera su foto: el vuelto a apuntar después del cobro. */
  const [vueltoPendiente, setVueltoPendiente] = useState<{ metodo: MetodoPago; recibido: number } | null>(null);

  const conVuelto = typeof total === 'number' && total > 0;

  function cerrar() {
    setEligiendo(false);
    setConFoto(null);
    setFoto(null);
    setVuelto(null);
    setVueltoPendiente(null);
  }

  /** El vuelto de un Yape o Plin sale del cajón: un gasto que la Caja devuelve a ese método. */
  async function apuntarVuelto(metodo: MetodoPago, recibido: number) {
    if (!conVuelto || metodo === 'cash') return;
    const v = vueltoDe(total!, recibido);
    if (v <= 0) return;
    const gasto = {
      id: nuevoId(),
      fecha: isoLocal(new Date()),
      concepto: `Vuelto en efectivo de un ${METODO_LABEL[metodo]} de ${soles2(recibido)}`,
      categoria: categoriaVuelto(metodo),
      importe: v,
      tipo: 'negocio',
    };
    // Dueño o administrador: también sin conexión, como el cobro (datos 0025).
    const via = await aplicarOAnotar(
      { company: companyId ?? '', usuario: session?.user?.id ?? '', tipo: 'gasto', datos: { gasto },
        resumen: { texto: gasto.concepto, importe: v, salida: true } },
      rol,
    );
    if (via.como === 'aplicada' || via.como === 'anotada') return;
    const r = via.como === 'error' ? undefined : await comando('upsert_gasto', { gasto });
    if (r === undefined) avisar(`No se apuntó el vuelto de ${soles2(v)}: apúntalo como gasto para que cuadre la caja.`, 'error');
  }

  function cobrarCon(m: MetodoPago, f?: FotoPago) {
    const pendiente = vueltoPendiente;
    cerrar();
    alCobrar(m, f);
    if (pendiente) void apuntarVuelto(pendiente.metodo, pendiente.recibido);
  }

  const tam = grande ? 'btn' : 'btn btn-sm';
  if (conFoto && companyId) {
    const obligatoria = exigeFoto(cobroFoto, conFoto);
    return (
      <div className="fp-cobrar" role="group" aria-label={`Cobrar con ${METODO_LABEL[conFoto]}`}>
        <span className="fp-cobrar__titulo">
          Cobrada con {METODO_LABEL[conFoto]}
          {vueltoPendiente && conVuelto && ` · vuelto ${soles2(vueltoDe(total!, vueltoPendiente.recibido))} en efectivo`}
        </span>
        <FotoDelPago companyId={companyId} foto={foto} obligatoria={obligatoria} alFoto={setFoto} alLeyendo={setLeyendo} />
        {foto && foto.decision !== 'aprobar' && foto.motivo && <p className="fp-aviso">Ojo: {foto.motivo}</p>}
        <button
          className={`${tam} btn-primary`}
          disabled={ocupado || leyendo || (obligatoria && !foto)}
          title={obligatoria && !foto ? 'Este negocio pide la foto del comprobante' : undefined}
          onClick={() => cobrarCon(conFoto, foto ?? undefined)}
        >
          <Check size={14} /> {foto ? 'Registrar con foto' : obligatoria ? 'Falta la foto' : 'Registrar sin foto'}
        </button>
        <button className={`${tam} btn-ghost`} onClick={cerrar} aria-label="Cancelar">
          <X size={14} />
        </button>
      </div>
    );
  }

  if (vuelto && conVuelto) {
    const recibido = num(vuelto.recibido);
    const v = vueltoDe(total!, recibido);
    const falta = recibido > 0 && recibido < total! ? total! - recibido : 0;
    const listo = recibido >= total!;
    const confirmar = () => {
      if (!listo) return;
      if (fotoParaMetodo(cobroFoto, vuelto.metodo)) {
        setVueltoPendiente({ metodo: vuelto.metodo, recibido });
        setVuelto(null);
        setConFoto(vuelto.metodo);
        return;
      }
      const m = vuelto.metodo;
      cerrar();
      alCobrar(m);
      void apuntarVuelto(m, recibido);
    };
    return (
      <div className="vuelto" role="group" aria-label="Cobrar con vuelto">
        <div className="vuelto__cab">
          <span>Cobrar <b>{soles2(total!)}</b></span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar} aria-label="Cancelar">
            <X size={14} />
          </button>
        </div>
        <div className="vuelto__metodos" role="group" aria-label="¿Con qué pagó?">
          {METODOS_CON_VUELTO.filter((m) => metodos.includes(m)).map((m) => (
            <button key={m} type="button" className={`fpill ${vuelto.metodo === m ? 'active' : ''}`} aria-pressed={vuelto.metodo === m}
              onClick={() => setVuelto({ ...vuelto, metodo: m })}>
              {METODO_LABEL[m]}
            </button>
          ))}
        </div>
        <span className="vuelto__rotulo">{vuelto.metodo === 'cash' ? '¿Con cuánto paga?' : `¿Cuánto ${vuelto.metodo === 'yape' ? 'yapeó' : 'plineó'}?`}</span>
        <div className="vuelto__billetes">
          {billetesPara(total!).map((b) => (
            <button key={b} type="button" className={`vuelto__billete${recibido === b ? ' on' : ''}`} aria-pressed={recibido === b}
              onClick={() => setVuelto({ ...vuelto, recibido: String(b) })}>
              S/ {b}
            </button>
          ))}
          <input className="input vuelto__otro" inputMode="decimal" placeholder="Otro" aria-label="Otro monto"
            value={billetesPara(total!).includes(recibido) ? '' : vuelto.recibido}
            onChange={(e) => setVuelto({ ...vuelto, recibido: e.target.value })} />
        </div>
        {listo ? (
          <div className="vuelto__monto" aria-live="polite">
            <span>Vuelto{vuelto.metodo !== 'cash' && v > 0 ? ' en efectivo' : ''}</span>
            <b>{soles2(v)}</b>
          </div>
        ) : falta > 0 ? (
          <p className="fp-aviso" aria-live="polite">Faltan {soles2(falta)}.</p>
        ) : null}
        {listo && vuelto.metodo !== 'cash' && v > 0 && (
          <small className="muted">Sale del cajón y queda apuntado, para que cuadren el {METODO_LABEL[vuelto.metodo]} y el cajón.</small>
        )}
        <button type="button" className="btn btn-primary vuelto__ok" disabled={!listo || ocupado} onClick={confirmar}>
          <Check size={16} /> {listo ? (v > 0 ? `Cobrar y dar ${soles2(v)}` : 'Cobrar') : 'Elige con cuánto paga'}
        </button>
      </div>
    );
  }

  if (!eligiendo) {
    return (
      <button className={`${tam} btn-primary`} disabled={ocupado} onClick={() => setEligiendo(true)}>
        <Wallet size={grande ? 16 : 14} /> {etiqueta}
      </button>
    );
  }
  return (
    <span className="elegir-metodo" role="group" aria-label="¿Con qué se pagó?">
      {metodos.map((m) => (
        <button
          key={m}
          className={`${tam} btn-primary`}
          disabled={ocupado}
          onClick={() => {
            setEligiendo(false);
            if (fotoParaMetodo(cobroFoto, m)) setConFoto(m);
            else alCobrar(m);
          }}
        >
          {METODO_LABEL[m]}
        </button>
      ))}
      {conVuelto && (
        <button className={`${tam} btn-ghost`} disabled={ocupado} title="Pagó con más: calcula el vuelto"
          onClick={() => {
            setEligiendo(false);
            setVuelto({ metodo: 'cash', recibido: '' });
          }}>
          <ArrowLeftRight size={14} /> Con vuelto
        </button>
      )}
      <button className={`${tam} btn-ghost`} onClick={() => setEligiendo(false)} aria-label="Cancelar">
        <X size={14} />
      </button>
    </span>
  );
}
