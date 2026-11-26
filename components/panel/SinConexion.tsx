'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SIN CONEXIÓN · la barra de arriba, la bandeja y su subida
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Apagones y cortes (Alvaro, 19-nov-2026): el dueño y el administrador siguen
 * cobrando tickets, cobrando citas y apuntando gastos sin internet; se guardan
 * en el celular (lib/panel/sinConexion/bandeja.ts) y suben solos al volver.
 *
 * Aquí:
 *   · se le dice al service worker que guarde copias para esta persona (o que
 *     las borre: empleado, otra cuenta);
 *   · se sube la bandeja al volver la red, al abrir y cada 30 s si queda algo;
 *   · la barra cuenta, sin rodeos, de cuándo es lo que se ve y qué falta subir;
 *   · `PendientesCaja`: lo anotado en este celular, en la Caja, aparte del
 *     resumen (que es lo que tiene el servidor).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CloudOff, RefreshCw, Trash2, UploadCloud, X } from 'lucide-react';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar } from '@/components/panel/Avisos';
import { soles } from '@/lib/panel/format';
import { etiquetaMetodo } from '@/lib/panel/metodosPago';
import { escucharRed, estadoRed, oirRed, type EstadoRed } from '@/lib/panel/sinConexion/red';
import { listarOperaciones, oirBandeja, quitarOperacion, type Operacion } from '@/lib/panel/sinConexion/bandeja';
import { aviseAlWorker, claveActivo } from '@/lib/panel/sinConexion/worker';
import { oirPedidoDeSubida, puedeSinConexion, reintentar, subirPendientes } from '@/lib/panel/sinConexion/subir';
import './sin-conexion.css';

/** Las pantallas que abren sin red (las guarda el service worker aunque no se hayan visitado). */
const RUTAS = ['/panel', '/panel/caja', '/panel/agenda'];

interface Estado {
  red: EstadoRed;
  /** Dueño o administrador del negocio activo. */
  puede: boolean;
  /** Lo de esta persona en este negocio, pendiente o rechazado. */
  ops: Operacion[];
  subirAhora: () => void;
}

const Ctx = createContext<Estado | null>(null);

export function useSinConexion(): Estado {
  return useContext(Ctx) ?? { red: estadoRed(), puede: false, ops: [], subirAhora: () => {} };
}

export function ProveedorSinConexion({ children }: { children: React.ReactNode }) {
  const { session, companyId, rol, cargando } = useSesion();
  const avisar = useAvisar();
  const usuario = session?.user?.id ?? '';
  const puede = puedeSinConexion(rol);

  const [red, setRed] = useState<EstadoRed>(estadoRed());
  useEffect(() => {
    escucharRed();
    setRed(estadoRed());
    return oirRed(setRed);
  }, []);

  // El service worker: copias solo para el dueño y el administrador. Se espera a saber el rol
  // (mientras carga sería «no puede» y borraría las copias justo cuando hacen falta).
  useEffect(() => {
    if (cargando || !usuario || !companyId) return;
    aviseAlWorker({ tipo: 'vm-sin-conexion', activo: puede, usuario, rutas: puede ? RUTAS : [] });
    try {
      localStorage.setItem(claveActivo(usuario), puede ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
  }, [cargando, usuario, companyId, puede]);

  const [todas, setTodas] = useState<Operacion[]>([]);
  const releer = useCallback(() => {
    if (!usuario) return setTodas([]);
    listarOperaciones(usuario).then(setTodas).catch(() => setTodas([]));
  }, [usuario]);
  useEffect(() => {
    releer();
    return oirBandeja(releer);
  }, [releer]);
  const ops = useMemo(() => todas.filter((o) => !companyId || o.company === companyId), [todas, companyId]);
  const pendientes = todas.filter((o) => o.estado === 'pendiente').length;

  /** «Falta instalar…» una vez por sesión: la subida se reintenta cada 30 s. */
  const faltaAvisado = useRef(false);
  const subirAhora = useCallback(() => {
    if (!usuario) return;
    void subirPendientes(usuario).then((r) => {
      if (r.subidas) avisar(`✓ Se subi${r.subidas === 1 ? 'ó 1 operación anotada' : `eron ${r.subidas} operaciones anotadas`} sin conexión.`, 'ok');
      r.notas.forEach((n) => avisar(n, 'espera'));
      if (r.rechazadas) avisar(`${r.rechazadas === 1 ? '1 operación no se pudo subir' : `${r.rechazadas} operaciones no se pudieron subir`}: míralas arriba.`, 'error');
      if (r.faltaInstalar && !faltaAvisado.current) {
        faltaAvisado.current = true;
        avisar('Parte de lo anotado sin conexión espera: falta instalar en la base la 0025 o la 0036 (pagos).', 'error');
      }
    });
  }, [usuario, avisar]);

  // Al abrir, al volver la red, cuando se anota algo con red, y cada 30 s mientras quede algo.
  useEffect(() => {
    if (red.enLinea) subirAhora();
  }, [red.enLinea, subirAhora]);
  useEffect(() => oirPedidoDeSubida(subirAhora), [subirAhora]);
  useEffect(() => {
    if (!pendientes) return;
    const t = window.setInterval(subirAhora, 30_000);
    return () => window.clearInterval(t);
  }, [pendientes, subirAhora]);

  const valor = useMemo(() => ({ red, puede, ops, subirAhora }), [red, puede, ops, subirAhora]);
  return (
    <Ctx.Provider value={valor}>
      <BarraSinConexion />
      {children}
    </Ctx.Provider>
  );
}

const horaDe = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  const h = d.toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' });
  return hoy ? h : `${d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })} ${h}`;
};

function BarraSinConexion() {
  const { red, puede, ops, subirAhora } = useSinConexion();
  const [abierta, setAbierta] = useState(false);
  const pendientes = ops.filter((o) => o.estado === 'pendiente');
  const rechazadas = ops.filter((o) => o.estado === 'rechazada');
  useEffect(() => {
    if (!ops.length) setAbierta(false);
  }, [ops.length]);
  if (red.enLinea && !ops.length) return null;

  const copia = red.copiaDesde ? new Date(red.copiaDesde).toISOString() : null;
  return (
    <div className={`sc-barra${red.enLinea ? '' : ' sc-barra--sin'}${rechazadas.length ? ' sc-barra--mal' : ''}`} role="status">
      <div className="sc-barra__fila">
        {red.enLinea ? <UploadCloud size={16} aria-hidden="true" /> : <CloudOff size={16} aria-hidden="true" />}
        <span className="sc-barra__texto">
          {red.enLinea ? (
            <b>Conexión de vuelta</b>
          ) : (
            <>
              <b>Sin conexión</b>
              {copia && <> · lo que ves es de las {horaDe(copia)}</>}
              {' · '}
              {puede ? 'puedes cobrar y apuntar gastos: se guardan en este celular' : 'para cambiar algo necesitas internet'}
            </>
          )}
        </span>
        {ops.length > 0 && (
          <button type="button" className="sc-barra__btn" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
            {pendientes.length > 0 && <>{pendientes.length} sin subir</>}
            {pendientes.length > 0 && rechazadas.length > 0 && ' · '}
            {rechazadas.length > 0 && <>{rechazadas.length} con problema</>}
          </button>
        )}
        {red.enLinea && pendientes.length > 0 && (
          <button type="button" className="sc-barra__btn" onClick={subirAhora}>
            <RefreshCw size={14} aria-hidden="true" /> Subir ahora
          </button>
        )}
      </div>
      {abierta && <ListaBandeja ops={ops} alCerrar={() => setAbierta(false)} />}
    </div>
  );
}

function ListaBandeja({ ops, alCerrar }: { ops: Operacion[]; alCerrar: () => void }) {
  const avisar = useAvisar();
  async function descartar(o: Operacion) {
    const que = `${o.resumen.texto} (${soles(o.resumen.importe)})`;
    if (!window.confirm(`¿Descartar «${que}»? No se subirá nunca: si de verdad pasó, tendrás que anotarlo otra vez.`)) return;
    await quitarOperacion(o.id);
    avisar('Descartada.', 'ok');
  }
  return (
    <div className="sc-lista">
      <div className="sc-lista__cab">
        <b>Anotado en este celular</b>
        <button type="button" className="q-icon" aria-label="Cerrar" onClick={alCerrar}><X size={16} /></button>
      </div>
      <ul>
        {ops.map((o) => (
          <li key={o.id} className={o.estado === 'rechazada' ? 'sc-op sc-op--mal' : 'sc-op'}>
            <span className="sc-op__hora">{horaDe(o.ocurrioEn)}</span>
            <span className="sc-op__que">
              {o.resumen.texto}
              {o.resumen.metodo && <small> · {etiquetaMetodo(o.resumen.metodo)}</small>}
              {o.estado === 'rechazada' && <small className="sc-op__error">{o.error}</small>}
            </span>
            <b className="sc-op__monto">{o.resumen.salida ? '−' : ''}{soles(o.resumen.importe)}</b>
            {o.estado === 'rechazada' && (
              <span className="sc-op__acciones">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void reintentar(o.id)}>
                  <RefreshCw size={14} /> Reintentar
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void descartar(o)} aria-label="Descartar">
                  <Trash2 size={14} />
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * En la Caja: lo anotado en este celular que el servidor aún no tiene. Va aparte del resumen
 * a propósito: el resumen es lo que hay en la base, y mezclarlo haría creer que ya subió.
 */
export function PendientesCaja({ companyId }: { companyId: string }) {
  const { ops, red } = useSinConexion();
  const mias = ops.filter((o) => o.company === companyId);
  if (!mias.length) return null;
  const entra = mias.filter((o) => !o.resumen.salida).reduce((t, o) => t + o.resumen.importe, 0);
  const sale = mias.filter((o) => o.resumen.salida).reduce((t, o) => t + o.resumen.importe, 0);
  const porMetodo = new Map<string, number>();
  for (const o of mias) if (!o.resumen.salida) porMetodo.set(etiquetaMetodo(o.resumen.metodo ?? ''), (porMetodo.get(etiquetaMetodo(o.resumen.metodo ?? '')) ?? 0) + o.resumen.importe);
  return (
    <section className="card sc-caja" aria-label="Anotado sin conexión">
      <div className="card-mini-head">
        <h3><CloudOff size={16} style={{ verticalAlign: -3 }} /> Anotado sin conexión</h3>
        <span className="muted">{red.enLinea ? 'subiendo…' : 'se sube al volver la conexión'}</span>
      </div>
      <p className="sc-caja__totales">
        Entró <b>{soles(entra)}</b>
        {[...porMetodo.entries()].map(([m, v]) => <span key={m}> · {m} {soles(v)}</span>)}
        {sale > 0 && <> · salió <b>{soles(sale)}</b></>}
      </p>
      <small className="muted">Todavía no suma en el resumen de la caja: entra en cuanto suba, a la hora en que pasó.</small>
    </section>
  );
}
