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
 */

import { useEffect, useMemo, useState } from 'react';
import { BellRing, ChevronRight, ConciergeBell, RotateCcw, Truck, Wallet } from 'lucide-react';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { soles, telefono } from '@/lib/panel/format';
import { faltaCobrar } from '@/lib/panel/confirmacion';
import { demoActivo } from '@/lib/panel/demo';
import { supabase } from '@/lib/supabase/client';
import { getLeads, getPedidos } from '@/lib/supabase/queries';
import type { ResultadoMarcarPagado } from '@/lib/supabase/commands';
import {
  ETAPAS, MINUTOS_TARDE, anterior, enTablero, espera, estadoListo, estadoWeb, etapaGuardada, minutosDesde, ordenar,
  siguiente, tarjetaDePedido, tarjetaDeWeb, textoAvanzar, titulos,
  type Etapa, type PedidoWebFila, type Rubro, type Tarjeta,
} from '@/lib/panel/tableroPedidos';
import DetallesPedido from '@/modules/tu-pagina/ui/DetallesPedido';
import { nombreMesa, type TipoLlamado } from '@/modules/tu-pagina/dominio/mesa';
import './tablero-pedidos.css';

const CADA_MS = 15_000;
const LINEAS_A_LA_VISTA = 4;

export default function TableroPedidos({ companyId, rubro, conPagina, conMesas }: {
  companyId: string;
  rubro: Rubro;
  /** Hay carrito en la página sin agenda en la nube: se leen también los pedidos_web. */
  conPagina: boolean;
  conMesas: boolean;
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
    const nombres = new Map(leads.map((l) => [l.id, l.name || telefono(l.phone)]));
    return [
      ...pedidos.map((p) => tarjetaDePedido(p, nombres.get(p.lead_id) ?? 'Cliente', faltaCobrar('order', p.status))),
      ...((web.data ?? []) as PedidoWebFila[]).map(tarjetaDeWeb),
    ].filter((t): t is Tarjeta => t !== null);
  }, [companyId, conPagina]);

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
  const [encima, setEncima] = useState<Etapa | null>(null);
  const [verEntregados, setVerEntregados] = useState(false);

  const tarjetas = useMemo(
    () => (datos ?? []).map((t) => (movidas[t.id] ? { ...t, etapa: movidas[t.id], movido: new Date() } : t)).filter((t) => enTablero(t, ahora)),
    [datos, movidas, ahora],
  );
  const columnas = useMemo(() => ordenar(tarjetas), [tarjetas]);
  const nombres = titulos(rubro);

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

  const soltar = (etapa: Etapa) => {
    const t = tarjetas.find((x) => x.id === arrastrada);
    setArrastrada(null);
    setEncima(null);
    if (t) void mover(t, etapa);
  };

  const enEspera = columnas.nuevo.length + columnas.preparando.length + columnas.listo.length;
  return (
    <section className="tpd" aria-label="Tablero de pedidos">
      {conMesas && <FranjaMesas companyId={companyId} />}
      <div className="tpd__resumen">
        <b>{enEspera}</b> {enEspera === 1 ? 'pedido en curso' : 'pedidos en curso'}
        {columnas.nuevo.length > 0 && <span className="tpd__nuevos">{columnas.nuevo.length} por confirmar</span>}
      </div>
      {cargando && !datos ? (
        <div className="vacio">Cargando…</div>
      ) : (
        <div className="tpd__columnas">
          {ETAPAS.map((etapa) => {
            const lista = columnas[etapa];
            const cuerpo = lista.length === 0
              ? <p className="tpd__vacia">{etapa === 'nuevo' ? 'Aquí caen los pedidos que entran.' : 'Nada por ahora.'}</p>
              : lista.map((t) => (
                <TarjetaPedido key={t.id} t={t} ahora={ahora} rubro={rubro} ocupada={ocupada === t.id}
                  alAvanzar={(e) => void mover(t, e)} alCobrar={() => void cobrar(t)}
                  alArrastrar={(si) => setArrastrada(si ? t.id : null)} />
              ));
            const props = {
              className: `tpd__col tpd__col--${etapa}${encima === etapa ? ' tpd__col--encima' : ''}`,
              onDragOver: (e: React.DragEvent) => { if (arrastrada) { e.preventDefault(); setEncima(etapa); } },
              onDragLeave: () => setEncima((x) => (x === etapa ? null : x)),
              onDrop: (e: React.DragEvent) => { e.preventDefault(); soltar(etapa); },
            };
            const cabeza = <><span>{nombres[etapa]}</span><b>{lista.length}</b></>;
            // En el celular, lo entregado va plegado: lo que pide acción queda arriba. En columnas, siempre a la vista.
            return etapa === 'entregado' ? (
              <div key={etapa} {...props} className={`${props.className}${verEntregados ? '' : ' tpd__col--plegada'}`}>
                <h3 className="tpd__cabeza">
                  <button type="button" className="tpd__plegar" aria-expanded={verEntregados} onClick={() => setVerEntregados((v) => !v)}>{cabeza}</button>
                </h3>
                <div className="tpd__lista">{cuerpo}</div>
              </div>
            ) : (
              <div key={etapa} {...props}>
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

function TarjetaPedido({ t, ahora, rubro, ocupada, alAvanzar, alCobrar, alArrastrar }: {
  t: Tarjeta;
  ahora: Date;
  rubro: Rubro;
  ocupada: boolean;
  alAvanzar: (e: Etapa) => void;
  alCobrar: () => void;
  alArrastrar: (si: boolean) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const min = minutosDesde(t.etapa === 'nuevo' ? t.creado : t.movido, ahora);
  const tarde = t.etapa === 'nuevo' && min !== null && min >= MINUTOS_TARDE;
  const prox = siguiente(t.etapa);
  const texto = textoAvanzar(t);
  const atras = anterior(t);
  const sobran = t.lineas.length - LINEAS_A_LA_VISTA;
  return (
    <article
      className={`tpd__tarjeta${tarde ? ' tpd__tarjeta--tarde' : ''}${abierta ? ' tpd__tarjeta--abierta' : ''}`}
      draggable={!ocupada}
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
        {t.cobro === 'falta' && <span className="tpd__sello tpd__sello--falta">Falta cobrar</span>}
        {t.cobro === 'cobrado' && <span className="tpd__sello tpd__sello--ok">Cobrado</span>}
      </div>
      <div className="tpd__acciones">
        {prox && texto && (
          <button type="button" className="btn btn-primary btn-sm" disabled={ocupada} onClick={() => alAvanzar(prox)}>
            {texto} <ChevronRight size={15} aria-hidden="true" />
          </button>
        )}
        {/* Quien no usa «Listo» (el restaurante que comanda en su POS) entrega de una. */}
        {t.etapa === 'preparando' && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={ocupada} onClick={() => alAvanzar('entregado')}>Entregado</button>
        )}
        {t.cobro === 'falta' && (
          <button type="button" className={`btn btn-sm ${t.etapa === 'entregado' ? 'btn-primary' : 'btn-ghost'}`} disabled={ocupada} onClick={alCobrar}>
            <Wallet size={14} aria-hidden="true" /> Cobrado
          </button>
        )}
        {atras && (
          <button type="button" className="btn btn-ghost btn-sm tpd__atras" disabled={ocupada} onClick={() => alAvanzar(atras)}
            title={`Volver a ${titulos(rubro)[atras].replace(' hoy', '')}`} aria-label={`Volver a ${titulos(rubro)[atras].replace(' hoy', '')}`}>
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
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
