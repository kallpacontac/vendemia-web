'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CAJA DEL DÍA · lo que entró, con qué, lo que salió y lo que queda
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El cierre de un local: cuánto se cobró en efectivo y cuánto por Yape, qué
 * gastos hubo (el adelanto a una estilista incluido) y el neto.
 *
 * ── Qué es «cobrado» aquí ────────────────────────────────────────────────
 * Lo que alguien CONTÓ, no lo que la base supone: `entroEnCaja` (pagado_por
 * puesto — el voucher que verificó Mia, o una persona desde el panel). Una
 * cita confirmada ya cuenta como ingreso en Métricas, pero aquí no entra
 * hasta que se apunte su cobro: por eso la sección «Sin cobro apuntado», con
 * el botón para hacerlo. Ver lib/panel/dinero.ts.
 *
 * ── El día de qué ────────────────────────────────────────────────────────
 * El día en que se presta el servicio (`fecha_servicio` de v_movimientos), o
 * el de creación si no se sabe. No hay «fecha de cobro» guardada: una cita de
 * hoy pagada por Yape ayer entra en la caja de hoy. La pantalla lo dice.
 *
 * ── Los gastos ───────────────────────────────────────────────────────────
 * Van por `upsert_gasto` / `delete_gasto`: el bot es el único que escribe, y
 * el gasto vuelve por el espejo. Sirven para todo lo que sale del cajón,
 * adelantos incluidos (categoría «adelanto»), en vez de un libro de préstamos
 * aparte.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Receipt, Trash2, TrendingDown, Wallet } from 'lucide-react';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useVocabulario } from '@/components/panel/useVocabulario';
import { BotonCobrar } from '@/components/panel/BotonCobrar';
import { diaMes, hora, isoLocal, soles, telefono } from '@/lib/panel/format';
import { cobradoSinConstancia, entroEnCaja, suma } from '@/lib/panel/dinero';
import { cobroPorApuntar, etiquetaMetodo, type MetodoPago } from '@/lib/panel/metodosPago';
import { cap } from '@/lib/panel/vocabulario';
import {
  getCitasDelPeriodo,
  getGastos,
  getLeads,
  getMovimientos,
  getPedidos,
  type Cita,
} from '@/lib/supabase/queries';
import type { ResultadoMarcarPagado } from '@/lib/supabase/commands';

/** Sugerencias para la categoría. Texto libre: el negocio puede escribir otra. */
const CATEGORIAS = ['Adelanto', 'Insumos', 'Alquiler', 'Servicios (luz, agua, internet)', 'Sueldos', 'Otros'];

const correr = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00`);
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};

export default function Caja() {
  const { companyId } = useSesion();
  const v = useVocabulario();
  const comando = useComando();
  const avisar = useAvisar();
  const hoy = isoLocal(new Date());
  const [dia, setDia] = useState(hoy);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [movimientos, citas, pedidos, gastos, leads] = await Promise.all([
      getMovimientos(companyId, dia, dia),
      getCitasDelPeriodo(companyId, dia, dia),
      getPedidos(companyId, 500),
      getGastos(companyId, dia),
      getLeads(companyId, 500),
    ]);
    return { movimientos, citas, pedidos, gastos, leads };
  }, [companyId, dia]);

  const calculo = useMemo(() => {
    if (!datos) return null;
    const metodoCita = new Map(datos.citas.map((c) => [c.id, c.metodo_pago ?? '']));
    const metodoPedido = new Map(datos.pedidos.map((p) => [p.id, p.payment_method ?? '']));
    const importe = new Map(
      datos.movimientos.filter((m) => m.fuente === 'appointment').map((m) => [m.movimiento_id, Number(m.importe)]),
    );

    const cobrados = datos.movimientos.filter(entroEnCaja);
    const porMetodo = new Map<string, number>();
    for (const m of cobrados) {
      const metodo =
        (m.fuente === 'appointment' ? metodoCita.get(m.movimiento_id) : metodoPedido.get(m.movimiento_id)) ?? '';
      const etiqueta = etiquetaMetodo(metodo);
      porMetodo.set(etiqueta, (porMetodo.get(etiqueta) ?? 0) + Number(m.importe));
    }

    const porCobrar = datos.citas
      .filter((c) => cobroPorApuntar(c.status, c.pagado_por))
      .map((c) => ({ cita: c, importe: importe.get(c.id) ?? 0 }));
    const pedidosSinConstancia = datos.movimientos.filter((m) => m.fuente === 'order' && cobradoSinConstancia(m));

    const cobrado = suma(cobrados);
    const gastado = datos.gastos.reduce((t, g) => t + g.importe, 0);
    return {
      cobrado,
      porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]),
      porCobrar,
      porCobrarTotal: porCobrar.reduce((t, x) => t + x.importe, 0),
      pedidosSinConstancia,
      gastado,
      neto: cobrado - gastado,
    };
  }, [datos]);

  const nombrePorLead = useMemo(
    () => new Map((datos?.leads ?? []).map((l) => [l.id, l.name || telefono(l.phone)])),
    [datos],
  );

  async function cobrar(c: Cita, metodo: MetodoPago) {
    setEnVuelo(c.id);
    const r = await comando<ResultadoMarcarPagado>(
      'marcar_pagado',
      { tipo: 'appointment', id: c.id, metodo_pago: metodo },
      undefined,
      releer,
    );
    if (r) avisar(`Cobro apuntado: ${etiquetaMetodo(metodo).toLowerCase()}.`, 'ok');
    setEnVuelo(null);
  }

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Caja" sub="Lo que entró, con qué, y lo que salió" />

        <div className="filters" style={{ marginBottom: 16, alignItems: 'center' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDia((d) => correr(d, -1))}>
            <ChevronLeft size={15} />
          </button>
          <b style={{ minWidth: 120, textAlign: 'center' }}>
            {dia === hoy ? 'Hoy' : dia === correr(hoy, -1) ? 'Ayer' : ''}{' '}
            {diaMes(new Date(`${dia}T12:00`))}
          </b>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={dia >= hoy}
            onClick={() => setDia((d) => correr(d, 1))}
          >
            <ChevronRight size={15} />
          </button>
          {dia !== hoy && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDia(hoy)}>
              Volver a hoy
            </button>
          )}
        </div>

        <div className="mini-row">
          <div className="mini">
            <div className="ic" style={{ background: '#E8FBF2', color: '#0FA968' }}>
              <Wallet size={20} />
            </div>
            <div>
              <b>{soles(calculo?.cobrado ?? 0)}</b>
              <small>Cobrado</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: '#FFECEF', color: '#E5484D' }}>
              <TrendingDown size={20} />
            </div>
            <div>
              <b>{soles(calculo?.gastado ?? 0)}</b>
              <small>Gastos</small>
            </div>
          </div>
          <div className="mini">
            <div className="ic" style={{ background: 'var(--brand-soft)', color: 'var(--brand-txt)' }}>
              <Receipt size={20} />
            </div>
            <div>
              <b>{soles(calculo?.neto ?? 0)}</b>
              <small>Neto del día</small>
            </div>
          </div>
        </div>

        {error && <p className="vacio">No se pudo cargar la caja: {error}</p>}
        {cargando && !datos && <p className="vacio">Cargando la caja…</p>}

        {calculo && (
          <div className="caja-grid">
            {/* ── Cobrado, por método ── */}
            <div className="card">
              <div className="card-mini-head">
                <h3>Cobrado, por método</h3>
              </div>
              {calculo.porMetodo.length === 0 ? (
                <p className="vacio">Nada cobrado todavía este día.</p>
              ) : (
                calculo.porMetodo.map(([metodo, total]) => (
                  <div className="kv-fila" key={metodo}>
                    <span style={metodo === 'Sin método' ? { color: '#B26B00' } : undefined}>{metodo}</span>
                    <b>{soles(total)}</b>
                  </div>
                ))
              )}
              {calculo.porMetodo.some(([m]) => m === 'Sin método') && (
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  «Sin método»: cobros apuntados sin decir con qué, o verificados por Mia antes de que se
                  guardara el método.
                </p>
              )}
            </div>

            {/* ── Gastos ── */}
            <Gastos
              dia={dia}
              gastos={datos?.gastos ?? []}
              alCambiar={releer}
            />

            {/* ── Sin cobro apuntado ── */}
            <div className="card caja-ancha">
              <div className="card-mini-head">
                <h3>{cap(v.reservas)} sin cobro apuntado</h3>
                {calculo.porCobrar.length > 0 && (
                  <small className="muted">{soles(calculo.porCobrarTotal)} en juego</small>
                )}
              </div>
              {calculo.porCobrar.length === 0 ? (
                <p className="vacio">Todo lo de este día tiene su cobro apuntado.</p>
              ) : (
                <>
                  <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                    Cuentan en los ingresos, pero no están en la caja hasta que se apunte con qué se pagaron.
                  </p>
                  {calculo.porCobrar.map(({ cita, importe }) => (
                    <div className="confirmar-fila" key={cita.id}>
                      <div className="confirmar-quien">
                        <b>{nombrePorLead.get(cita.lead_id) ?? 'Cliente'}</b>
                        <small className="muted">
                          {cita.inicio ? hora(cita.inicio) : ''}
                          {cita.service ? ` · ${cita.service}` : ''}
                          {importe ? ` · ${soles(importe)}` : ''}
                        </small>
                      </div>
                      <div className="confirmar-acciones">
                        <BotonCobrar ocupado={enVuelo === cita.id} alCobrar={(m) => void cobrar(cita, m)} />
                      </div>
                    </div>
                  ))}
                </>
              )}
              {calculo.pedidosSinConstancia.length > 0 && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  Y {calculo.pedidosSinConstancia.length} pedido
                  {calculo.pedidosSinConstancia.length > 1 ? 's' : ''} pagado
                  {calculo.pedidosSinConstancia.length > 1 ? 's' : ''} sin que conste quién lo cobró (
                  {soles(suma(calculo.pedidosSinConstancia))}). Se apuntan en{' '}
                  <Link href="/panel/pedidos" style={{ fontWeight: 700 }}>
                    Pedidos
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
        )}

        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 14 }}>
          <b>Qué día cuenta:</b> el de la {v.sesion}, no el del pago: {v.una} {v.sesion} de hoy que se pagó ayer por
          Yape entra en la caja de hoy. <b>Cobrado</b> es lo que se apuntó como cobrado —por Mia al verificar un
          comprobante, o desde el panel—, no todo lo confirmado.
        </p>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

function Gastos({
  dia,
  gastos,
  alCambiar,
}: {
  dia: string;
  gastos: { id: string; concepto: string; categoria: string; importe: number }[];
  alCambiar: () => void;
}) {
  const comando = useComando();
  const [concepto, setConcepto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [importe, setImporte] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);

  const monto = Number(importe.replace(',', '.'));
  const valido = concepto.trim() !== '' && importe.trim() !== '' && Number.isFinite(monto) && monto >= 0;

  async function apuntar() {
    if (!valido || guardando) return;
    setGuardando(true);
    const r = await comando(
      'upsert_gasto',
      { gasto: { fecha: dia, concepto: concepto.trim(), categoria: categoria.trim(), importe: monto } },
      'Gasto apuntado',
      alCambiar,
    );
    setGuardando(false);
    if (r) {
      setConcepto('');
      setCategoria('');
      setImporte('');
    }
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Borrar este gasto?')) return;
    setBorrando(id);
    await comando('delete_gasto', { id }, 'Gasto borrado', alCambiar);
    setBorrando(null);
  }

  return (
    <div className="card">
      <div className="card-mini-head">
        <h3>Gastos</h3>
      </div>
      {gastos.length === 0 ? (
        <p className="vacio">Sin gastos apuntados este día.</p>
      ) : (
        gastos.map((g) => (
          <div className="kv-fila" key={g.id}>
            <span>
              {g.concepto}
              {g.categoria && <small className="muted"> · {g.categoria}</small>}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <b>{soles(g.importe)}</b>
              <button
                type="button"
                className="q-icon"
                aria-label="Borrar gasto"
                disabled={borrando === g.id}
                onClick={() => void borrar(g.id)}
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        ))
      )}

      <div className="gasto-form">
        <input
          className="input"
          placeholder="Concepto (p. ej. adelanto a Ana)"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
        />
        <input
          className="input"
          placeholder="Categoría"
          list="categorias-gasto"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <datalist id="categorias-gasto">
          {CATEGORIAS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <input
          className="input"
          placeholder="Importe"
          inputMode="decimal"
          value={importe}
          onChange={(e) => setImporte(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void apuntar();
          }}
        />
        <button className="btn btn-primary btn-sm" disabled={!valido || guardando} onClick={() => void apuntar()}>
          <Plus size={14} /> {guardando ? 'Apuntando…' : 'Apuntar'}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Un adelanto de sueldo va aquí, con la categoría «Adelanto».
      </p>
    </div>
  );
}
