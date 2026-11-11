'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TABLERO DE PEDIDOS · lo que hay que preparar y entregar, en columnas
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Desde 768 px: columnas, y se arrastra. En el celular: los mismos grupos uno
 * debajo de otro y un botón por tarjeta para pasarla a la siguiente, que arrastrar
 * con el pulgar entre columnas que no caben no funciona.
 *
 * Mover NO cobra: la columna es la entrega (orders.etapa, tu-pagina/sql/0019). El
 * cobro va en el sello y en su botón, que es el mismo marcar_pagado de siempre. Lo
 * único que toca status es «Entregado» de un pedido ya cobrado: marcar_cumplido,
 * como hacía la tabla.
 *
 * Si el negocio cobra antes (todo o un adelanto, sql/0020), el pedido espera en «Por
 * cobrar» hasta que se registra el pago con su importe (pedido_cobrar). Registrar el
 * pago ahí también lo confirma: pasa a Preparando de un toque.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, ChevronRight, ConciergeBell, RotateCcw, Settings2, Truck, Wallet } from 'lucide-react';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { soles, telefono } from '@/lib/panel/format';
import { faltaCobrar } from '@/lib/panel/confirmacion';
import { demoActivo } from '@/lib/panel/demo';
import { supabase } from '@/lib/supabase/client';
import { getLeads, getPedidos } from '@/lib/supabase/queries';
import type { ResultadoMarcarPagado } from '@/lib/supabase/commands';
import {
  COLUMNAS, MINUTOS_TARDE, anterior, columnaDe, enTablero, espera, estadoListo, estadoWeb, etapaGuardada, faltaAntes, faltaTotal,
  minutosDesde, ordenar, siguiente, tarjetaDePedido, tarjetaDeWeb, textoAvanzar, titulos,
  type Columna, type Etapa, type PedidoWebFila, type Rubro, type Tarjeta,
} from '@/lib/panel/tableroPedidos';
import { CONTRA_ENTREGA, errorCobro, textoCobro, type CobroPedidos, type ModoCobro } from '@/modules/tu-pagina/dominio/cobroPedidos';
import DetallesPedido from '@/modules/tu-pagina/ui/DetallesPedido';
import { nombreMesa, type TipoLlamado } from '@/modules/tu-pagina/dominio/mesa';
import './tablero-pedidos.css';

const CADA_MS = 15_000;
const LINEAS_A_LA_VISTA = 4;

type Metodo = 'yape' | 'plin' | 'cash' | 'bank_transfer';
const METODOS: { id: Metodo; nombre: string }[] = [
  { id: 'yape', nombre: 'Yape' }, { id: 'plin', nombre: 'Plin' }, { id: 'cash', nombre: 'Efectivo' }, { id: 'bank_transfer', nombre: 'Transferencia' },
];

/** «Adelanto de S/ 20» → «adelanto de S/ 20»: solo la primera letra, que «S/» no se toca. */
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const nuevoOp = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function TableroPedidos({ companyId, rubro, conPagina, conMesas, nube, cobroInicial }: {
  companyId: string;
  rubro: Rubro;
  /** Hay carrito en la página sin agenda en la nube: se leen también los pedidos_web. */
  conPagina: boolean;
  conMesas: boolean;
  /** Agenda en la nube: los pagos con importe y el modo de cobro solo existen ahí. */
  nube: boolean;
  /** Cómo cobra hoy. null: no se puede elegir aquí (sin Mi página o sin la nube). */
  cobroInicial: CobroPedidos | null;
}) {
  const avisar = useAvisar();
  const comando = useComando();
  const { datos, cargando, releer, recargar } = useCargar(async () => {
    const desde = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const [pedidos, leads, web] = await Promise.all([
      getPedidos(companyId, 300),
      getLeads(companyId, 500),
      conPagina && !demoActivo()
        ? supabase().from('pedidos_web').select('*').eq('company_id', companyId).neq('estado', 'cancelado').gte('creado_at', desde)
          .order('creado_at', { ascending: false }).limit(200)
        : Promise.resolve({ data: [] as PedidoWebFila[] }),
    ]);
    // Lo ya pagado (adelantos) de lo que sigue sin cobrar. Si falla, el tablero se ve igual, sin eso.
    const pagado = new Map<string, number>();
    const porCobrar = pedidos.filter((p) => faltaCobrar('order', p.status) && (p.creado?.getTime() ?? 0) >= Date.parse(desde)).map((p) => p.id);
    if (porCobrar.length && !demoActivo()) {
      const { data } = await supabase().from('pending_payments').select('order_id, amount').eq('company_id', companyId).in('order_id', porCobrar.slice(0, 150));
      for (const r of (data ?? []) as { order_id: string; amount: number | string | null }[]) {
        pagado.set(r.order_id, (pagado.get(r.order_id) ?? 0) + (Number(r.amount) || 0));
      }
    }
    const nombres = new Map(leads.map((l) => [l.id, l.name || telefono(l.phone)]));
    return [
      ...pedidos.map((p) => tarjetaDePedido(p, nombres.get(p.lead_id) ?? 'Cliente', faltaCobrar('order', p.status), pagado.get(p.id) ?? 0, nube)),
      ...((web.data ?? []) as PedidoWebFila[]).map(tarjetaDeWeb),
    ].filter((t): t is Tarjeta => t !== null);
  }, [companyId, conPagina, nube]);

  // Una cocina deja la tablet abierta: se relee sola mientras se ve.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setAhora(new Date());
      if (document.visibilityState === 'visible') releer();
    }, CADA_MS);
    return () => clearInterval(t);
  }, [releer]);

  // Lo que se acaba de mover se ve ya, sin esperar a la siguiente lectura.
  const [movidas, setMovidas] = useState<Record<string, Etapa>>({});
  useEffect(() => setMovidas({}), [datos]);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [arrastrada, setArrastrada] = useState<string | null>(null);
  const [encima, setEncima] = useState<Columna | null>(null);
  const [verEntregados, setVerEntregados] = useState(false);
  const [cobro, setCobro] = useState<CobroPedidos>(cobroInicial ?? CONTRA_ENTREGA);
  const [ajustando, setAjustando] = useState(false);

  const tarjetas = useMemo(
    () => (datos ?? []).map((t) => (movidas[t.id] ? { ...t, etapa: movidas[t.id], movido: new Date() } : t)).filter((t) => enTablero(t, ahora)),
    [datos, movidas, ahora],
  );
  const columnas = useMemo(() => ordenar(tarjetas), [tarjetas]);
  const nombres = titulos(rubro);
  // «Por cobrar» solo si el negocio cobra antes, o si queda algo de cuando cobraba así.
  const conPorCobrar = cobro.modo !== 'contra_entrega' || columnas.por_cobrar.length > 0;
  const visibles = COLUMNAS.filter((c) => c !== 'por_cobrar' || conPorCobrar);

  async function mover(t: Tarjeta, etapa: Etapa) {
    if (t.etapa === etapa) return;
    if (demoActivo()) return avisar('Estás en modo demo: no se guarda nada.', 'espera');
    if (t.entregaFirme) return avisar('Ese pedido ya consta entregado y cobrado: no vuelve atrás.', 'espera');
    setOcupada(t.id);
    try {
      const { data, error } = t.fuente === 'pagina'
        ? await supabase().rpc('pedidos_web_estado', { p_company: companyId, p_ids: [t.id], p_estado: estadoWeb(etapa) })
        : await supabase().rpc('pedido_etapa', { p_company: companyId, p_id: t.id, p_etapa: etapaGuardada(etapa) });
      if (error) {
        const sinMigracion = error.code === 'PGRST202' || error.code === '23514';
        avisar(sinMigracion ? 'Para mover pedidos falta una actualización de la base de datos (Mi página 0019).' : error.message, 'error');
        return;
      }
      const estado = t.fuente === 'pedido' ? (data as { status?: string } | null)?.status : 'ok';
      if (estado && estado !== 'ok') {
        avisar(estado === 'cancelado' ? 'Ese pedido está cancelado.' : estado === 'ya_entregado' ? 'Ese pedido ya consta entregado.' : 'No se pudo mover.', 'espera');
        return;
      }
      setMovidas((m) => ({ ...m, [t.id]: etapa }));
      // Entregado y ya cobrado: lo mismo que hacía «Entregado» en la tabla, para que la Caja lo vea.
      if (etapa === 'entregado' && t.fuente === 'pedido' && t.cobro === 'cobrado') {
        await comando('marcar_cumplido', { tipo: 'order', id: t.id, vino: true }, undefined, recargar);
      }
      avisar(`${t.codigo}: ${etapa === 'listo' ? estadoListo(t.entrega).toLowerCase() : nombres[etapa].toLowerCase().replace(' hoy', '')}`);
    } finally {
      setOcupada(null);
    }
  }

  /** «Cobrado» de un toque, sin importe: lo de siempre, también con la agenda en el bot. */
  async function cobrar(t: Tarjeta) {
    setOcupada(t.id);
    try {
      const r = await comando<ResultadoMarcarPagado>('marcar_pagado', { tipo: 'order', id: t.id }, undefined, recargar);
      if (!r) return;
      avisar(r.cambio ? `${t.codigo}: cobrado.` : 'Este pedido ya constaba como cobrado: no se ha cambiado nada.', r.cambio ? 'ok' : 'espera');
      if (t.etapa === 'entregado') await comando('marcar_cumplido', { tipo: 'order', id: t.id, vino: true }, undefined, recargar);
    } finally {
      setOcupada(null);
    }
  }

  /** Un pago con importe: el adelanto, o lo que falta de un pedido con adelanto. true si se guardó. */
  async function cobrarImporte(t: Tarjeta, monto: number, metodo: Metodo, op: string, preparar: boolean): Promise<boolean> {
    if (demoActivo()) { avisar('Estás en modo demo: no se guarda nada.', 'espera'); return false; }
    setOcupada(t.id);
    try {
      const { data, error } = await supabase().rpc('pedido_cobrar', { p_company: companyId, p_id: t.id, p_monto: monto, p_metodo: metodo, p_op: op });
      if (error) {
        avisar(error.code === 'PGRST202' ? 'Para cobrar con importe falta una actualización de la base de datos (Mi página 0020).' : error.message, 'error');
        return false;
      }
      const r = (data ?? {}) as { status?: string; falta?: number; cubierto?: boolean };
      if (r.status !== 'ok') {
        avisar(
          r.status === 'excede' ? `Falta solo ${soles(Number(r.falta) || 0)}.`
            : r.status === 'ya_cobrado' ? 'Este pedido ya constaba como cobrado.'
              : r.status === 'cancelado' ? 'Ese pedido está cancelado.'
                : r.status === 'no_es_nube' ? 'Con la agenda en el bot, los pagos los registra Mia.'
                  : 'No se pudo guardar el pago.',
          'espera',
        );
        if (r.status === 'ya_cobrado') recargar();
        return false;
      }
      avisar(r.cubierto ? `${t.codigo}: cobrado.` : `${t.codigo}: ${soles(monto)} a cuenta, falta ${soles(Number(r.falta) || 0)}.`);
    } finally {
      setOcupada(null);
    }
    if (preparar && t.etapa === 'nuevo') await mover(t, 'preparando');
    recargar();
    return true;
  }

  const soltar = (col: Columna) => {
    const t = tarjetas.find((x) => x.id === arrastrada);
    setArrastrada(null);
    setEncima(null);
    // Soltar en «Por cobrar» es volver a Nuevo: si le falta el pago, ahí se queda.
    if (t) void mover(t, col === 'por_cobrar' ? 'nuevo' : col);
  };

  const enEspera = columnas.por_cobrar.length + columnas.nuevo.length + columnas.preparando.length + columnas.listo.length;
  return (
    <section className="tpd" aria-label="Tablero de pedidos">
      {conMesas && <FranjaMesas companyId={companyId} />}
      <div className="tpd__resumen">
        <b>{enEspera}</b> {enEspera === 1 ? 'pedido en curso' : 'pedidos en curso'}
        {columnas.nuevo.length > 0 && <span className="tpd__nuevos">{columnas.nuevo.length} por confirmar</span>}
        {cobroInicial && (
          <button type="button" className="btn btn-ghost btn-sm tpd__modo" aria-expanded={ajustando} onClick={() => setAjustando((v) => !v)}>
            <Settings2 size={14} aria-hidden="true" /> Cobro: {minuscula(textoCobro(cobro))}
          </button>
        )}
      </div>
      {ajustando && cobroInicial && (
        <AjusteCobro companyId={companyId} actual={cobro} alGuardar={(c) => { setCobro(c); setAjustando(false); }} alCerrar={() => setAjustando(false)} />
      )}
      {cargando && !datos ? (
        <div className="vacio">Cargando…</div>
      ) : (
        <div className={`tpd__columnas${conPorCobrar ? ' tpd__columnas--con-cobro' : ''}`}>
          {visibles.map((col) => {
            const lista = columnas[col];
            const cuerpo = lista.length === 0
              ? <p className="tpd__vacia">{col === 'nuevo' ? 'Aquí caen los pedidos que entran.' : col === 'por_cobrar' ? 'Aquí esperan los pedidos hasta que llega el pago.' : 'Nada por ahora.'}</p>
              : lista.map((t) => (
                <TarjetaPedido key={t.id} t={t} ahora={ahora} rubro={rubro} ocupada={ocupada === t.id} nube={nube}
                  alAvanzar={(e) => void mover(t, e)} alCobrar={() => void cobrar(t)}
                  alCobrarImporte={(monto, metodo, op, preparar) => cobrarImporte(t, monto, metodo, op, preparar)}
                  alArrastrar={(si) => setArrastrada(si ? t.id : null)} />
              ));
            const props = {
              className: `tpd__col tpd__col--${col}${encima === col ? ' tpd__col--encima' : ''}`,
              onDragOver: (e: React.DragEvent) => { if (arrastrada) { e.preventDefault(); setEncima(col); } },
              onDragLeave: () => setEncima((x) => (x === col ? null : x)),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); soltar(col); },
            };
            const cabeza = <><span>{nombres[col]}</span><b>{lista.length}</b></>;
            // En el celular, lo entregado va plegado: lo que pide acción queda arriba. En columnas, siempre a la vista.
            return col === 'entregado' ? (
              <div key={col} {...props} className={`${props.className}${verEntregados ? '' : ' tpd__col--plegada'}`}>
                <h3 className="tpd__cabeza">
                  <button type="button" className="tpd__plegar" aria-expanded={verEntregados} onClick={() => setVerEntregados((v) => !v)}>{cabeza}</button>
                </h3>
                <div className="tpd__lista">{cuerpo}</div>
              </div>
            ) : (
              <div key={col} {...props}>
                <h3 className="tpd__cabeza">{cabeza}</h3>
                <div className="tpd__lista">{cuerpo}</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TarjetaPedido({ t, ahora, rubro, ocupada, nube, alAvanzar, alCobrar, alCobrarImporte, alArrastrar }: {
  t: Tarjeta;
  ahora: Date;
  rubro: Rubro;
  ocupada: boolean;
  nube: boolean;
  alAvanzar: (e: Etapa) => void;
  alCobrar: () => void;
  alCobrarImporte: (monto: number, metodo: Metodo, op: string, preparar: boolean) => Promise<boolean>;
  alArrastrar: (si: boolean) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [pagando, setPagando] = useState(false);
  const col = columnaDe(t);
  const porCobrar = col === 'por_cobrar';
  const min = minutosDesde(t.etapa === 'nuevo' ? t.creado : t.movido, ahora);
  // Lo que espera el pago del cliente no se marca tarde: no depende del negocio.
  const tarde = col === 'nuevo' && min !== null && min >= MINUTOS_TARDE;
  const prox = siguiente(t.etapa);
  const texto = textoAvanzar(t);
  const atras = anterior(t);
  const sobran = t.lineas.length - LINEAS_A_LA_VISTA;
  const antes = faltaAntes(t);
  const falta = faltaTotal(t);
  // Con algo ya pagado, cobrar es «lo que falta», con su importe y su método.
  const conImporte = nube && t.fuente === 'pedido' && t.pagado > 0;
  return (
    <article
      className={`tpd__tarjeta${tarde ? ' tpd__tarjeta--tarde' : ''}${abierta ? ' tpd__tarjeta--abierta' : ''}`}
      draggable={!ocupada && !pagando}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', t.id); alArrastrar(true); }}
      onDragEnd={() => alArrastrar(false)}
    >
      {/* Tocarla enseña todo lo pedido; en el celular, además, la dirección y la nota. */}
      <div className="tpd__abrir" role="button" tabIndex={0} aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAbierta((v) => !v); } }}>
        <span className="tpd__fila">
          <b className="tpd__codigo">{t.codigo}</b>
          {t.entrega && (
            <span className="tpd__entrega">
              {t.entrega === 'delivery' ? <Truck size={13} aria-hidden="true" /> : null}
              {t.etapa === 'listo' ? estadoListo(t.entrega) : t.entrega === 'delivery' ? 'Delivery' : 'Recojo'}
            </span>
          )}
          <span className={`tpd__espera${tarde ? ' tpd__espera--tarde' : ''}`}>{espera(min)}</span>
        </span>
        <span className="tpd__cliente">{t.cliente}</span>
        <ul className="tpd__lineas">
          {t.lineas.slice(0, abierta ? undefined : LINEAS_A_LA_VISTA).map((l, i) => (
            <li key={i}><b>{l.cantidad}×</b> {l.nombre}{l.opcion ? ` · ${l.opcion}` : ''}</li>
          ))}
          {!abierta && sobran > 0 && <li className="tpd__mas">y {sobran} más</li>}
        </ul>
      </div>
      <div className="tpd__detalles">
        <DetallesPedido direccion={t.entrega === 'delivery' ? t.direccion : ''} nota={t.nota} ubicacion={t.ubicacion} pagaraCon={t.pagaraCon} />
      </div>
      <div className="tpd__pie">
        <span className="tpd__total">{soles(t.total)}</span>
        {porCobrar ? (
          <span className="tpd__sello tpd__sello--falta">{antes >= t.total ? 'Paga antes' : `Adelanto ${soles(antes)}`}</span>
        ) : t.cobro === 'falta' && t.pagado > 0 ? (
          <span className="tpd__sello tpd__sello--falta">A cuenta {soles(t.pagado)} · falta {soles(falta)}</span>
        ) : t.cobro === 'falta' ? (
          <span className="tpd__sello tpd__sello--falta">Falta cobrar</span>
        ) : t.cobro === 'cobrado' ? (
          <span className="tpd__sello tpd__sello--ok">Cobrado</span>
        ) : null}
      </div>
      {pagando ? (
        <FormPago sugerido={porCobrar ? antes : falta} maximo={falta} preparar={porCobrar} ocupada={ocupada}
          alGuardar={async (monto, metodo, op) => { if (await alCobrarImporte(monto, metodo, op, porCobrar)) setPagando(false); }}
          alCerrar={() => setPagando(false)} />
      ) : (
        <div className="tpd__acciones">
          {porCobrar ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupada} onClick={() => setPagando(true)}>
                <Wallet size={14} aria-hidden="true" /> Registrar pago
              </button>
              {/* El dueño manda: si confía en el cliente, lo prepara sin esperar el pago. */}
              <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada} onClick={() => alAvanzar('preparando')}>Preparar igual</button>
            </>
          ) : prox && texto && (
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupada} onClick={() => alAvanzar(prox)}>
              {texto} <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
          {/* Quien no usa «Listo» (el restaurante que comanda en su POS) entrega de una. */}
          {t.etapa === 'preparando' && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada} onClick={() => alAvanzar('entregado')}>Entregado</button>
          )}
          {t.cobro === 'falta' && !porCobrar && (
            <button type="button" className={`btn btn-sm ${t.etapa === 'entregado' ? 'btn-primary' : 'btn-ghost'}`} disabled={ocupada}
              onClick={conImporte ? () => setPagando(true) : alCobrar}>
              <Wallet size={14} aria-hidden="true" /> {conImporte ? `Cobrar ${soles(falta)}` : 'Cobrado'}
            </button>
          )}
          {atras && (
            <button type="button" className="btn btn-ghost btn-sm tpd__atras" disabled={ocupada} onClick={() => alAvanzar(atras)}
              title={`Volver a ${titulos(rubro)[atras].replace(' hoy', '')}`} aria-label={`Volver a ${titulos(rubro)[atras].replace(' hoy', '')}`}>
              <RotateCcw size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** Registrar un pago con importe en la tarjeta. Cada formulario abierto es una operación: el doble toque no paga dos veces. */
function FormPago({ sugerido, maximo, preparar, ocupada, alGuardar, alCerrar }: {
  sugerido: number;
  maximo: number;
  preparar: boolean;
  ocupada: boolean;
  alGuardar: (monto: number, metodo: Metodo, op: string) => void;
  alCerrar: () => void;
}) {
  const op = useRef(nuevoOp()).current;
  const [texto, setTexto] = useState(String(sugerido));
  const [metodo, setMetodo] = useState<Metodo>('yape');
  const monto = Math.round((Number(texto.replace(',', '.')) || 0) * 100) / 100;
  const error = monto <= 0 ? 'Pon el monto.' : monto > maximo + 0.005 ? `Falta solo ${soles(maximo)}.` : '';
  return (
    <form className="tpd__pago" onSubmit={(e) => { e.preventDefault(); if (!error) alGuardar(monto, metodo, op); }}>
      <label className="tpd__pago-monto">
        <span>Monto recibido</span>
        <input className="input" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} aria-invalid={Boolean(error)} autoFocus />
      </label>
      <div className="tpd__metodos" role="group" aria-label="Cómo pagó">
        {METODOS.map((m) => (
          <button key={m.id} type="button" className="tpd__metodo" aria-pressed={metodo === m.id} onClick={() => setMetodo(m.id)}>{m.nombre}</button>
        ))}
      </div>
      {error && texto !== '' && <small className="tpd__pago-error">{error}</small>}
      <div className="tpd__acciones">
        <button type="submit" className="btn btn-primary btn-sm" disabled={ocupada || Boolean(error)}>{preparar ? 'Guardar y preparar' : 'Guardar pago'}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada} onClick={alCerrar}>Cancelar</button>
      </div>
    </form>
  );
}

/* ── Cómo cobra los pedidos este negocio (Mi página 0020) ── */

const MODOS: { id: ModoCobro; nombre: string; detalle: string }[] = [
  { id: 'contra_entrega', nombre: 'Contra entrega', detalle: 'Se cobra al entregar.' },
  { id: 'anticipado', nombre: 'Todo por adelantado', detalle: 'El cliente paga antes. El pedido espera en «Por cobrar».' },
  { id: 'adelanto', nombre: 'Un adelanto', detalle: 'Paga una parte antes y el resto al recibir.' },
];

function AjusteCobro({ companyId, actual, alGuardar, alCerrar }: {
  companyId: string;
  actual: CobroPedidos;
  alGuardar: (c: CobroPedidos) => void;
  alCerrar: () => void;
}) {
  const avisar = useAvisar();
  const [modo, setModo] = useState<ModoCobro>(actual.modo);
  const [tipo, setTipo] = useState<'monto' | 'porcentaje'>(actual.tipo ?? 'monto');
  const [valor, setValor] = useState(actual.valor ? String(actual.valor) : '');
  const [guardando, setGuardando] = useState(false);
  const elegido: CobroPedidos = modo === 'adelanto' ? { modo, tipo, valor: Number(valor.replace(',', '.')) || 0 } : { modo };
  const error = errorCobro(elegido);

  async function guardar() {
    if (error) return;
    if (demoActivo()) return avisar('Estás en modo demo: no se guarda nada.', 'espera');
    setGuardando(true);
    try {
      const { data, error: e } = await supabase().rpc('pedido_cobro_guardar', { p_company: companyId, p_cobro: elegido });
      if (e) {
        avisar(e.code === 'PGRST202' ? 'Para elegir cómo cobras falta una actualización de la base de datos (Mi página 0020).' : e.message, 'error');
        return;
      }
      const r = (data ?? {}) as { status?: string; cobro?: CobroPedidos };
      if (r.status !== 'ok' || !r.cobro) {
        avisar(r.status === 'sin_pagina' ? 'Primero crea Mi página: ahí es donde el cliente ve cómo pagar.' : 'Revisa los datos.', 'espera');
        return;
      }
      avisar(`Listo: ${minuscula(textoCobro(r.cobro))}. Vale para los pedidos que entren desde ahora.`);
      alGuardar({ ...r.cobro, valor: r.cobro.valor === undefined ? undefined : Number(r.cobro.valor) });
      // La página pública lo lee de su caché: se vacía para que el carrito lo diga ya. Sin esperar.
      void supabase().auth.getSession().then(({ data: s }) => fetch('/api/tu-pagina/panel/publicar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ company_id: companyId }),
      })).catch(() => undefined);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="tpd__ajuste" role="region" aria-label="Cómo cobras los pedidos">
      <b>¿Cuándo te pagan los pedidos?</b>
      <div className="tpd__modos" role="radiogroup" aria-label="Modo de cobro">
        {MODOS.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} className="tpd__modo-opcion" onClick={() => setModo(m.id)}>
            <b>{m.nombre}</b><span>{m.detalle}</span>
          </button>
        ))}
      </div>
      {modo === 'adelanto' && (
        <div className="tpd__adelanto">
          <div className="tpd__metodos" role="group" aria-label="Cómo se calcula">
            <button type="button" className="tpd__metodo" aria-pressed={tipo === 'monto'} onClick={() => setTipo('monto')}>Monto fijo</button>
            <button type="button" className="tpd__metodo" aria-pressed={tipo === 'porcentaje'} onClick={() => setTipo('porcentaje')}>Porcentaje</button>
          </div>
          <label className="tpd__pago-monto">
            <span>{tipo === 'monto' ? 'Adelanto en soles' : 'Porcentaje del total'}</span>
            <input className="input" inputMode="decimal" value={valor} placeholder={tipo === 'monto' ? 'Por ejemplo, 20' : 'Por ejemplo, 50'} onChange={(e) => setValor(e.target.value)} />
          </label>
        </div>
      )}
      <p className="tpd__ajuste-nota">
        {modo === 'contra_entrega'
          ? 'Los pedidos entran directo a Nuevos.'
          : 'Tu página lo avisa antes de pedir y, al terminar, le da al cliente tu Yape o Plin. Los pedidos esperan en «Por cobrar» hasta que registres el pago. Vale para los que entren desde ahora, también por WhatsApp.'}
      </p>
      {error && valor !== '' && <small className="tpd__pago-error">{error}</small>}
      <div className="tpd__acciones">
        <button type="button" className="btn btn-primary btn-sm" disabled={guardando || Boolean(error)} onClick={() => void guardar()}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={guardando} onClick={alCerrar}>Cancelar</button>
      </div>
    </div>
  );
}

/* ── Las mesas que esperan (plantilla «Atención en mesa» o «Carta visual») ── */

interface Llamado { id: string; tipo: TipoLlamado; salon: string; numero: string; detalle: string; lineas: unknown[]; repeticiones: number; espera: number }

const QUE: Partial<Record<TipoLlamado, string>> = { mozo: 'Llama al mozo', cuenta: 'Pide la cuenta', requerimiento: 'Necesita algo', pedido: 'Quiere pedir' };

function FranjaMesas({ companyId }: { companyId: string }) {
  const avisar = useAvisar();
  const { datos, releer } = useCargar(async () => {
    const { data, error } = await supabase().rpc('mesa_panel_vivo', { p_company: companyId });
    return error ? [] : ((data as { pendientes?: Llamado[] } | null)?.pendientes ?? []);
  }, [companyId]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') releer(); }, 10_000);
    return () => clearInterval(t);
  }, [releer]);
  const [hechos, setHechos] = useState<string[]>([]);
  const lista = (datos ?? []).filter((l) => !hechos.includes(l.id));
  if (lista.length === 0) return null;

  async function llegue(l: Llamado) {
    if (demoActivo()) return avisar('Estás en modo demo: no se guarda nada.', 'espera');
    const { error } = await supabase().rpc('mesa_panel_llegue', { p_company: companyId, p_id: l.id });
    if (error) return avisar(error.message, 'error');
    setHechos((h) => [...h, l.id]);
  }

  return (
    <div className="tpd__mesas" role="region" aria-label="Mesas que esperan">
      <a className="tpd__mesas-titulo" href="/panel/mesas"><ConciergeBell size={16} aria-hidden="true" /> Mesas esperando · {lista.length}</a>
      <div className="tpd__mesas-lista">
        {lista.map((l) => (
          <div key={l.id} className="tpd__mesa">
            <BellRing size={15} aria-hidden="true" />
            <span><b>{nombreMesa(l)}</b> {QUE[l.tipo] ?? 'Necesita atención'}{l.repeticiones > 0 ? ' · insiste' : ''} · {espera(Math.floor(l.espera / 60))}</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void llegue(l)}>Llegué</button>
          </div>
        ))}
      </div>
    </div>
  );
}
