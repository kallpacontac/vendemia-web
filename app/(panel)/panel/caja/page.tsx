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
 * ── Lo que entró, no lo que podría entrar (3-oct-2026) ───────────────────
 * Los pagos con importe (vouchers y registrar_pago) cuentan por su importe y
 * en el día en que se pagaron: una seña de S/ 50 es S/ 50. Los cobros sin
 * importe («Cobrada», marcar_pagado) cuentan por su precio, el día del
 * servicio, porque no hay fecha de cobro guardada. Ver entradasDelDia.
 *
 * ── El adelanto no es un cobro (Alvaro, 19-oct-2026) ─────────────────────
 * Un Yape que no cubre el total de una cita puntual es un ADELANTO: se ve en
 * su propia tarjeta y no suma a «Cobrado» ni al neto hasta que la cita queda
 * cobrada entera. Y una cita apartada esperando el comprobante no es un cobro
 * olvidado: va en «Esperando pago», no en «sin cobro apuntado». Ver
 * lib/panel/adelantos.ts.
 *
 * ── Los gastos ───────────────────────────────────────────────────────────
 * Van por `upsert_gasto` / `delete_gasto`: el bot es el único que escribe, y
 * el gasto vuelve por el espejo. Sirven para todo lo que sale del cajón,
 * adelantos incluidos (categoría «adelanto»), en vez de un libro de préstamos
 * aparte.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2 } from 'lucide-react';
import CajaResumen from '@/components/panel/CajaResumen';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useVocabulario } from '@/components/panel/useVocabulario';
import { BotonCobrar } from '@/components/panel/BotonCobrar';
import { SaldosPendientes } from '@/components/panel/Saldos';
import { diaMes, hora, isoLocal, soles, telefono } from '@/lib/panel/format';
import { cobradoSinConstancia, entradasDelDia, suma, type CitaCaja } from '@/lib/panel/dinero';
import { esPuntual, selloCita, type SelloCita } from '@/lib/panel/adelantos';
import { saldoDeVenta, type Saldo } from '@/lib/panel/saldo';
import { cobroPorApuntar, etiquetaMetodo, type MetodoPago } from '@/lib/panel/metodosPago';
import { cap } from '@/lib/panel/vocabulario';
import {
  getCitasDelPeriodo,
  getGastos,
  getLeads,
  getMovimientos,
  getPagosCaja,
  getPedidos,
  type Cita,
} from '@/lib/supabase/queries';
import type { ResultadoMarcarPagado } from '@/lib/supabase/commands';

/** Sugerencias para la categoría. Texto libre: el negocio puede escribir otra. */
const CATEGORIAS = ['Adelanto', 'Insumos', 'Alquiler', 'Servicios (luz, agua, internet)', 'Sueldos', 'Otros'];

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
    const pagos = await getPagosCaja(companyId, dia, movimientos);
    return { dia, movimientos, citas, pedidos, gastos, leads, pagos };
  }, [companyId, dia]);

  const calculo = useMemo(() => {
    if (!datos || datos.dia !== dia) return null;
    const metodoCita = new Map(datos.citas.map((c) => [c.id, c.metodo_pago ?? '']));
    const metodoPedido = new Map(datos.pedidos.map((p) => [p.id, p.payment_method ?? '']));
    for (const [id, m] of datos.pagos.metodoCita) if (!metodoCita.has(id)) metodoCita.set(id, m);
    for (const [id, m] of datos.pagos.metodoPedido) if (!metodoPedido.has(id)) metodoPedido.set(id, m);
    const importe = new Map(
      datos.movimientos.filter((m) => m.fuente === 'appointment').map((m) => [m.movimiento_id, Number(m.importe)]),
    );
    const citaDelDia = new Map(datos.citas.map((c) => [c.id, c]));
    const citaDe = (id: string): CitaCaja | undefined => {
      const c = citaDelDia.get(id);
      const p = datos.pagos.citaDePago.get(id);
      const slot = c?.slot_start ?? p?.slot_start;
      if (slot === undefined) return undefined;
      return {
        puntual: esPuntual(slot),
        pagadoPor: c?.pagado_por ?? p?.pagado_por ?? '',
        pagado: datos.pagos.pagadoPorCita.get(id) ?? 0,
      };
    };

    // Lo que ENTRÓ este día: cada pago por su importe y su fecha, y los cobros
    // sin importe (barbería) por su precio. Una seña de S/ 50 es S/ 50. Ver
    // entradasDelDia en lib/panel/dinero.ts.
    const entradas = entradasDelDia(
      datos.movimientos,
      datos.pagos.pagosDelDia,
      datos.pagos.conPagoConImporte,
      (fuente, id) => (fuente === 'appointment' ? metodoCita.get(id) : metodoPedido.get(id)) ?? '',
      citaDe,
    );
    const cobros = entradas.filter((e) => !e.adelanto);
    const esAdelanto = new Set(entradas.filter((e) => e.adelanto).map((e) => e.id));
    const adelantos = datos.pagos.pagosDelDia
      .filter((p) => esAdelanto.has(p.id))
      .map((p) => ({
        pago: p,
        metodo: metodoCita.get(p.appointment_id ?? '') ?? '',
        cita: citaDelDia.get(p.appointment_id ?? '') ?? datos.pagos.citaDePago.get(p.appointment_id ?? ''),
      }));
    const porMetodo = new Map<string, number>();
    for (const e of cobros) {
      const etiqueta = etiquetaMetodo(e.metodo);
      porMetodo.set(etiqueta, (porMetodo.get(etiqueta) ?? 0) + e.importe);
    }

    // Las citas del día, cada una en su sitio: sin cobro apuntado (con o sin
    // adelanto), esperando el comprobante, o pagada sin hora.
    const ahora = Date.now();
    const filas = datos.citas.map((c) => {
      const pagado = datos.pagos.pagadoPorCita.get(c.id) ?? 0;
      const pagos: Saldo | undefined = pagado > 0 ? saldoDeVenta([importe.get(c.id) ?? 0], [pagado]) : undefined;
      return { cita: c, importe: importe.get(c.id) ?? 0, pagos, sello: selloCita(c, pagos, soles, ahora) };
    });
    const esperando = filas.filter((f) => f.sello?.clave === 'esperando_pago' || f.sello?.clave === 'caducada');
    const sinHora = filas.filter((f) => f.sello?.clave === 'pago_sin_hora');
    const porCobrar = filas.filter(
      (f) => cobroPorApuntar(f.cita.status, f.cita.pagado_por) && (!f.sello || f.sello.clave === 'adelanto'),
    );
    const pedidosSinConstancia = datos.movimientos.filter((m) => m.fuente === 'order' && cobradoSinConstancia(m));

    const cobrado = cobros.reduce((t, e) => t + e.importe, 0);
    const gastado = datos.gastos.reduce((t, g) => t + g.importe, 0);
    return {
      cobrado,
      adelantado: adelantos.reduce((t, a) => t + Number(a.pago.amount ?? 0), 0),
      adelantos,
      porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]),
      porCobrar,
      // Lo que falta: el precio entero, o lo que queda tras el adelanto.
      porCobrarTotal: porCobrar.reduce((t, x) => t + (x.pagos ? x.pagos.saldo : x.importe), 0),
      esperando,
      sinHora,
      pedidosSinConstancia,
      gastado,
      neto: cobrado - gastado,
    };
  }, [datos, dia]);

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
    if (r)
      avisar(
        r.antes === 'pending_payment' && r.cambio
          ? `Cobrada con ${etiquetaMetodo(metodo).toLowerCase()}: ${v.la} ${v.sesion} queda confirmad${v.a}.`
          : `Cobro apuntado: ${etiquetaMetodo(metodo).toLowerCase()}.`,
        'ok',
      );
    setEnVuelo(null);
  }

  return (
    <main className="main main--caja">
      <div className="wrap">
        <Topbar titulo="Caja" sub="Lo que entró, con qué, y lo que salió" />

        <CajaResumen dia={dia} hoy={hoy} alDia={setDia} calculo={calculo} />

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

            {/* ── Adelantos: dinero a cuenta, aparte de lo cobrado ── */}
            {calculo.adelantos.length > 0 && (
              <div className="card">
                <div className="card-mini-head">
                  <h3>Adelantos</h3>
                  <small className="muted">{soles(calculo.adelantado)} a cuenta</small>
                </div>
                {calculo.adelantos.map(({ pago, metodo, cita }) => (
                  <div className="kv-fila" key={pago.id}>
                    <span>
                      {nombrePorLead.get(pago.lead_id) ?? 'Cliente'}
                      <small className="muted">
                        {' '}
                        · {etiquetaMetodo(metodo)}
                        {cita?.slot_start ? ` · para el ${textoSlotCorto(cita.slot_start)}` : ''}
                        {cita?.service ? ` · ${cita.service}` : ''}
                      </small>
                    </span>
                    <b>{soles(Number(pago.amount ?? 0))}</b>
                  </div>
                ))}
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Pagos que no cubren todavía el total de su {v.sesion}. No suman a «Cobrado» ni al neto: entran
                  cuando se cobra el resto.
                </p>
              </div>
            )}

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
                  {calculo.porCobrar.map(({ cita, importe, pagos, sello }) => (
                    <div className="confirmar-fila" key={cita.id}>
                      <div className="confirmar-quien">
                        <b>{nombrePorLead.get(cita.lead_id) ?? 'Cliente'}</b>
                        <small className="muted">
                          {cita.inicio ? hora(cita.inicio) : ''}
                          {cita.service ? ` · ${cita.service}` : ''}
                          {pagos ? ` · faltan ${soles(pagos.saldo)}` : importe ? ` · ${soles(importe)}` : ''}
                        </small>
                      </div>
                      {sello && <Sello s={sello} />}
                      <div className="confirmar-acciones">
                        <BotonCobrar ocupado={enVuelo === cita.id} alCobrar={(m) => void cobrar(cita, m)} />
                      </div>
                    </div>
                  ))}
                </>
              )}
              {calculo.porCobrar.some((f) => f.pagos) && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  «Cobrada» en {v.una} {v.sesion} con adelanto apunta lo que faltaba, con el método que elijas.
                </p>
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

        {calculo && (calculo.esperando.length > 0 || calculo.sinHora.length > 0) && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-mini-head">
              <h3>Esperando pago</h3>
              <small className="muted">no son cobros olvidados</small>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              {cap(v.reservas)} apartad{v.a}s a nombre del cliente hasta que llegue su comprobante. Si no paga en 24 h,
              la hora se libera. «Cobrada» {v.la} confirma si la hora sigue libre.
            </p>
            {calculo.sinHora.map(({ cita, sello }) => (
              <div className="confirmar-fila" key={cita.id}>
                <div className="confirmar-quien">
                  <b>{nombrePorLead.get(cita.lead_id) ?? 'Cliente'}</b>
                  <small className="muted">
                    {cita.inicio ? hora(cita.inicio) : ''}
                    {cita.service ? ` · ${cita.service}` : ''} · dale otra hora en la Agenda o devuélvele el dinero
                  </small>
                </div>
                {sello && <Sello s={sello} />}
              </div>
            ))}
            {calculo.esperando.map(({ cita, importe, sello }) => (
              <div className="confirmar-fila" key={cita.id}>
                <div className="confirmar-quien">
                  <b>{nombrePorLead.get(cita.lead_id) ?? 'Cliente'}</b>
                  <small className="muted">
                    {cita.inicio ? hora(cita.inicio) : ''}
                    {cita.service ? ` · ${cita.service}` : ''}
                    {importe ? ` · ${soles(importe)}` : ''}
                  </small>
                </div>
                {sello && <Sello s={sello} />}
                <div className="confirmar-acciones">
                  <BotonCobrar ocupado={enVuelo === cita.id} alCobrar={(m) => void cobrar(cita, m)} />
                </div>
              </div>
            ))}
          </div>
        )}

        <SaldosPendientes key={companyId} alCambiar={releer} />

        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 14 }}>
          <b>Cobrado es lo que entró, no lo que podría entrar.</b> Cada comprobante que verificó Mia y cada pago
          registrado cuentan por su importe y el día en que se pagaron: una seña de S/ 50 es S/ 50, aunque la
          inscripción valga más. Lo que se marcó «Cobrada» sin importe cuenta por su precio, el día de la {v.sesion}.
          Un adelanto de {v.una} {v.sesion} va aparte y no suma hasta que se cobra el resto.
          Las deudas de otros períodos se consultan en «Saldos por cobrar», sin depender de la fecha seleccionada.
        </p>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

function Sello({ s }: { s: SelloCita }) {
  return (
    <span className="badge-pill" style={{ color: s.color, background: `${s.color}18` }} title={s.ayuda}>
      {s.label}
    </span>
  );
}

/** «22 oct 16:00» de un slot "2026-10-22 16:00". */
function textoSlotCorto(slot: string): string {
  const d = new Date(`${slot.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? slot : `${diaMes(d)} ${slot.slice(11, 16)}`.trim();
}

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
  const [creando, setCreando] = useState(false);
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
      setCreando(false);
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
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={creando} onClick={() => setCreando((v) => !v)}><Plus size={15}/> {creando ? 'Cerrar' : 'Nuevo gasto'}</button>
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

      {creando && <>
      <p className="muted caja-gasto-fecha">Registrar gasto del {diaMes(new Date(`${dia}T12:00:00`))}</p>
      <div className="gasto-form">
        <input
          className="input"
          placeholder="Concepto (p. ej. adelanto a Ana)"
          aria-label="Concepto del gasto"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
        />
        <input
          className="input"
          placeholder="Categoría"
          aria-label="Categoría del gasto"
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
          aria-label="Importe del gasto"
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
      </>}
    </div>
  );
}
