'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * PEDIDOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta pantalla existe por un agujero concreto, no por completitud.
 *
 * Hasta la 0024, un pedido solo llegaba a `paid` por UN camino: `image.flow.ts`
 * lo marca cuando el bot verifica la captura de Yape. Y con `verify_vouchers`
 * apagado (migración 0017) el bot recibe la captura, la guarda y **no da ningún
 * pago por bueno a propósito** — así que el pedido se quedaba en `pending` para
 * siempre y no había forma de cerrarlo desde ningún sitio. Lo mismo si el
 * cliente paga en efectivo, por transferencia o en el local.
 *
 * `marcar_pagado` es lo único que desatasca eso, y necesitaba una pantalla.
 *
 * ⚠️ No es una pantalla de gestión de pedidos: no se editan, no se crean y no se
 * borran. Se ven, y se afirman dos hechos sobre ellos — cobrado y entregado.
 * Todo lo demás lo escribe el bot.
 */
import { useMemo, useState } from 'react';
import { Package, Search, Truck, Wallet } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { cuando, soles, telefono } from '@/lib/panel/format';
import {
  faltaCobrar,
  pideRevision,
  selloCumplido,
  selloPagado,
} from '@/lib/panel/confirmacion';
import { getLeads, getPedidos, type Pedido } from '@/lib/supabase/queries';
import type { ResultadoMarcarPagado } from '@/lib/supabase/commands';

const POR_PAGINA = 12;

export default function Pedidos() {
  const { companyId } = useSesion();
  const { datos, cargando, recargar } = useCargar(async () => {
    if (!companyId) return null;
    const [pedidos, leads] = await Promise.all([getPedidos(companyId), getLeads(companyId, 500)]);
    return { pedidos, leads };
  }, [companyId]);

  const [busqueda, setBusqueda] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [pagina, setPagina] = useState(1);

  const pedidos = useMemo(() => datos?.pedidos ?? [], [datos]);
  const nombrePorLead = useMemo(
    () => new Map((datos?.leads ?? []).map((l) => [l.id, l.name || telefono(l.phone)])),
    [datos],
  );

  const sinCobrar = pedidos.filter((p) => faltaCobrar('order', p.status));
  const enJuego = sinCobrar.reduce((s, p) => s + (p.total ?? 0), 0);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return pedidos.filter((p) => {
      if (soloPendientes && !faltaCobrar('order', p.status)) return false;
      if (!q) return true;
      const quien = (nombrePorLead.get(p.lead_id) ?? '').toLowerCase();
      return quien.includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [pedidos, busqueda, soloPendientes, nombrePorLead]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const actual = Math.min(pagina, paginas);
  const visibles = filtrados.slice((actual - 1) * POR_PAGINA, actual * POR_PAGINA);

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Pedidos" sub="Lo que Mia cerró, y qué se ha cobrado" />

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand-txt)' }}>
              <Package size={20} />
            </div>
            <div>
              <b>{pedidos.length}</b>
              <small>Pedidos</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#FEF6E7', color: '#B26B00' }}>
              <Wallet size={20} />
            </div>
            <div>
              <b>{sinCobrar.length}</b>
              <small>Sin cobrar</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#F3EEFF', color: '#A78BFA' }}>
              <Wallet size={20} />
            </div>
            <div>
              <b>{soles(enJuego)}</b>
              <small>Pendiente de cobro</small>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="search">
            <Search size={16} />
            <input
              placeholder="Buscar por cliente o nº de pedido…"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={soloPendientes}
              onChange={(e) => {
                setSoloPendientes(e.target.checked);
                setPagina(1);
              }}
            />
            Solo sin cobrar
          </label>
        </div>

        <div className="table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Qué pidió</th>
                <th>Cobro</th>
                <th>Entrega</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="vacio">
                      <b>Sin pedidos</b>
                      {pedidos.length === 0
                        ? 'Cuando Mia cierre una venta, aparecerá aquí. Un negocio de citas no crea pedidos: los suyos están en la Agenda.'
                        : 'Con estos filtros no queda ninguno.'}
                    </div>
                  </td>
                </tr>
              )}
              {visibles.map((p) => (
                <FilaPedido
                  key={p.id}
                  pedido={p}
                  cliente={nombrePorLead.get(p.lead_id) ?? 'Cliente'}
                  alCambiar={recargar}
                />
              ))}
            </tbody>
          </table>
        </div>

        {paginas > 1 && (
          <div className="pagination">
            <button onClick={() => setPagina(actual - 1)} disabled={actual === 1}>
              ‹
            </button>
            {Array.from({ length: paginas }, (_, i) => (
              <button
                key={i}
                className={i + 1 === actual ? 'active' : ''}
                onClick={() => setPagina(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPagina(actual + 1)} disabled={actual === paginas}>
              ›
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function FilaPedido({
  pedido,
  cliente,
  alCambiar,
}: {
  pedido: Pedido;
  cliente: string;
  alCambiar: () => void;
}) {
  const comando = useComando();
  const avisar = useAvisar();
  const [ocupado, setOcupado] = useState(false);

  const cobro = selloPagado('order', pedido.status, pedido.pagado_por);
  const entrega = selloCumplido('order', pedido.status, pedido.cumplido_por);

  async function cobrar() {
    setOcupado(true);
    /**
     * Sin mensaje de éxito fijo: lo decide `cambio`.
     *
     * El comando es idempotente y marcar pagado algo ya pagado devuelve
     * `cambio: false` sin fallar. Anunciar «cobrado» ahí le haría creer al dueño
     * que acaba de entrar dinero que ya estaba contado — y en una pantalla de
     * dinero eso es lo peor que puede pasar.
     */
    const r = await comando<ResultadoMarcarPagado>(
      'marcar_pagado',
      { tipo: 'order', id: pedido.id },
      undefined,
      alCambiar,
    );
    if (r) {
      avisar(
        r.cambio
          ? `Cobrado. Pasó de ${r.antes} a pagado.`
          : 'Este pedido ya constaba como cobrado: no se ha cambiado nada.',
        r.cambio ? 'ok' : 'espera',
      );
    }
    setOcupado(false);
  }

  async function entregar() {
    setOcupado(true);
    await comando(
      'marcar_cumplido',
      { tipo: 'order', id: pedido.id, vino: true },
      'Anotado: entregado',
      alCambiar,
    );
    setOcupado(false);
  }

  const articulos = pedido.articulos.map((a) => `${a.quantity}× ${a.name}`).join(', ');

  return (
    <tr className={pideRevision(cobro) || pideRevision(entrega) ? 'fila-revisar' : ''}>
      <td>
        <b>{cliente}</b>
      </td>
      <td
        className="muted"
        style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={articulos}
      >
        {articulos || '—'}
      </td>
      <td>
        <span
          className="badge-pill"
          style={{ color: cobro.color, background: `${cobro.color}18` }}
          title={cobro.ayuda}
        >
          {cobro.label}
        </span>
      </td>
      <td>
        <span
          className="badge-pill"
          style={{ color: entrega.color, background: `${entrega.color}18` }}
          title={entrega.ayuda}
        >
          {entrega.label}
        </span>
      </td>
      <td className="muted">{cuando(pedido.creado)}</td>
      <td style={{ textAlign: 'right', fontWeight: 700 }}>{soles(pedido.total)}</td>
      <td style={{ textAlign: 'right' }}>
        <div className="acciones-fila">
          {faltaCobrar('order', pedido.status) && (
            <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void cobrar()}>
              <Wallet size={14} /> Cobrado
            </button>
          )}
          {/* Entregar solo tiene sentido una vez cobrado y mientras no conste ya
              entregado. `vino: false` en un pedido no existe: no hay estado
              'no_delivered' e inventarlo rompería el cálculo de ingresos. */}
          {!faltaCobrar('order', pedido.status) && entrega.grado === 'pendiente' && (
            <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void entregar()}>
              <Truck size={14} /> Entregado
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
