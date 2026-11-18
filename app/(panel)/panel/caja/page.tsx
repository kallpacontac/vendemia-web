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
 * ── Cobrada ≠ a cuenta (Alvaro, 19-oct-2026) ─────────────────────────────
 * «Cobrada» es cuando se cobró todo; con un pago parcial la cita o la
 * inscripción está «por cobrar». Pero ese dinero entró: suma a «Entró» y al
 * neto, y se enseña aparte como «a cuenta». Una cita apartada esperando el
 * comprobante tampoco es un cobro olvidado: va en «Esperando pago». Ver
 * lib/panel/dinero.ts y lib/panel/adelantos.ts.
 *
 * ── Los gastos ───────────────────────────────────────────────────────────
 * Van por `upsert_gasto` / `delete_gasto`: el bot es el único que escribe, y
 * el gasto vuelve por el espejo. Sirven para todo lo que sale del cajón,
 * adelantos incluidos (categoría «adelanto»), en vez de un libro de préstamos
 * aparte.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { QrCode, Receipt, Wallet } from 'lucide-react';
import CajaResumen from '@/components/panel/CajaResumen';
import CobrarTicket from '@/components/panel/CobrarTicket';
import Campana from '@/components/panel/Campana';
import GastosCaja from '@/components/panel/GastosCaja';
import ListosParaCobrar from '@/components/panel/ListosParaCobrar';
import { useSondeo } from '@/components/panel/useSondeo';
import { sumarSelloDeCita } from '@/components/panel/selloDeCita';
import SubnavCaja from '@/components/panel/SubnavCaja';
import { sedeCorta, sedesDeCitas, useSedeElegida, useSedes } from '@/components/panel/SelectorSede';
import QuienCita from '@/components/panel/QuienCita';
import Topbar from '@/components/panel/Topbar';
import { useSesion } from '@/components/panel/Sesion';
import { useAvisar, useComando } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { useVocabulario } from '@/components/panel/useVocabulario';
import { BotonCobrar } from '@/components/panel/BotonCobrar';
import ComprobantesDelDia from '@/components/panel/ComprobantesDelDia';
import { fotoParaCobro, type FotoPago } from '@/lib/panel/fotoPago';
import { RegistrarPago, SaldosPendientes } from '@/components/panel/Saldos';
import { diaMes, hora, hora12, isoLocal, soles, telefono } from '@/lib/panel/format';
import { cobradoSinConstancia, entradasDelDia, suma, type CitaCaja } from '@/lib/panel/dinero';
import { esPuntual, selloCita, type SelloCita } from '@/lib/panel/adelantos';
import { saldoDeVenta, type Saldo } from '@/lib/panel/saldo';
import { cobroPorApuntar, etiquetaMetodo, type MetodoPago } from '@/lib/panel/metodosPago';
import { cap } from '@/lib/panel/vocabulario';
import {
  getCatalogo,
  getCitasDelPeriodo,
  getGastos,
  getLeads,
  getMovimientos,
  getPagosCaja,
  getPedidos,
  getTrabajadores,
  type Cita,
} from '@/lib/supabase/queries';
import type { ResultadoMarcarPagado } from '@/lib/supabase/commands';
import BoletaDelCobro, { type LineaCobro } from '@/modules/facturacion/ui/BoletaDelCobro';


export default function CajaPagina() {
  return (
    <Suspense fallback={<main className="main"><div className="wrap"><p className="vacio">Cargando la caja…</p></div></main>}>
      <Caja />
    </Suspense>
  );
}

function Caja() {
  const { companyId } = useSesion();
  const v = useVocabulario();
  const comando = useComando();
  const avisar = useAvisar();
  const hoy = isoLocal(new Date());
  const [dia, setDia] = useState(hoy);
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  /** La cita con el formulario de «Registrar pago» abierto (una a la vez). */
  const [pagando, setPagando] = useState<string | null>(null);
  /** «Cobrar ticket» abierto: el cliente llegó a caja con el ticket del barbero (0031). */
  const [ticket, setTicket] = useState(false);
  /** «Gasto o adelanto» abierto en la pestaña Cobrar. */
  const [gasto, setGasto] = useState(false);
  /**
   * Dos pestañas, la misma pantalla (18-nov-2026): «Cobrar» (el mostrador, siempre hoy) y
   * «Cierre del día» (?ver=cierre: cuadrar, cualquier día). Ver SubnavCaja.
   */
  const cierre = useSearchParams().get('ver') === 'cierre';
  useEffect(() => {
    if (!cierre) setDia(hoy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cierre]);
  /** El último cobro de «Listos para cobrar», para su boleta (modules/facturacion/ui/BoletaDelCobro). */
  const [cobrada, setCobrada] = useState<{ id: string; texto: string; lineas: LineaCobro[]; tel: string } | null>(null);

  // Con 2 sedes o más: «Todas · sede A · sede B», la misma elección que en la Agenda.
  const sedes = useSedes(companyId);
  const [sede] = useSedeElegida(companyId, sedes);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [todosMovimientos, todasCitas, pedidos, todosGastos, leads, trabajadores, catalogo] = await Promise.all([
      getMovimientos(companyId, dia, dia),
      getCitasDelPeriodo(companyId, dia, dia),
      getPedidos(companyId, 500),
      getGastos(companyId, dia),
      getLeads(companyId, 500),
      getTrabajadores(companyId).catch(() => []),
      getCatalogo(companyId).catch(() => []),
    ]);
    const pagos = await getPagosCaja(companyId, dia, todosMovimientos);
    if (!sede) return { dia, sede, movimientos: todosMovimientos, citas: todasCitas, pedidos, gastos: todosGastos, leads, pagos, trabajadores, catalogo };

    // Una sede: solo el dinero de SUS citas (por la sede de cada cita, también la de un adelanto
    // pagado hoy para otro día). Pedidos y gastos no tienen sede: se ven en «Todas».
    const sedeDe = await sedesDeCitas([
      ...todosMovimientos.filter((m) => m.fuente === 'appointment').map((m) => m.movimiento_id),
      ...pagos.pagosDelDia.map((p) => p.appointment_id ?? ''),
    ]);
    for (const c of todasCitas) sedeDe.set(c.id, c.sede ?? '');
    const suya = (id: string | null | undefined) => !!id && sedeDe.get(id) === sede;
    return {
      dia,
      sede,
      movimientos: todosMovimientos.filter((m) => m.fuente === 'appointment' && suya(m.movimiento_id)),
      citas: todasCitas.filter((c) => (c.sede ?? '') === sede),
      pedidos,
      gastos: [] as typeof todosGastos,
      leads,
      pagos: { ...pagos, pagosDelDia: pagos.pagosDelDia.filter((p) => suya(p.appointment_id)) },
      trabajadores,
      catalogo,
    };
  }, [companyId, dia, sede]);

  // Lo que el barbero acaba de marcar «Atendido» tiene que aparecer solo, sin recargar: el cliente
  // ya viene caminando hacia la caja con su ticket. Solo hoy, y con la pestaña a la vista.
  useSondeo(releer, 20_000, dia === hoy);

  const calculo = useMemo(() => {
    if (!datos || datos.dia !== dia || datos.sede !== sede) return null;
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
      // A cuenta: lo que paga sigue con saldo. Una puntual que alguien dio por cobrada ya no.
      (p) => {
        if ((datos.pagos.saldoDePago.get(p.id)?.saldo ?? 0) <= 0) return false;
        const cita = p.appointment_id ? citaDe(p.appointment_id) : undefined;
        return !(cita?.puntual && cita.pagadoPor);
      },
    );
    const esACuenta = new Set(entradas.filter((e) => e.aCuenta).map((e) => e.id));
    const aCuenta = datos.pagos.pagosDelDia
      .filter((p) => esACuenta.has(p.id))
      .map((p) => ({
        pago: p,
        metodo: metodoCita.get(p.appointment_id ?? '') ?? '',
        cita: citaDelDia.get(p.appointment_id ?? '') ?? datos.pagos.citaDePago.get(p.appointment_id ?? ''),
        falta: datos.pagos.saldoDePago.get(p.id)?.saldo ?? 0,
      }));
    // Por método, TODO lo que entró: es lo que tiene que cuadrar con el cajón y el Yape.
    const porMetodo = new Map<string, number>();
    for (const e of entradas) {
      const etiqueta = etiquetaMetodo(e.metodo);
      porMetodo.set(etiqueta, (porMetodo.get(etiqueta) ?? 0) + e.importe);
    }

    // Las citas del día, cada una en su sitio: sin cobro apuntado (con o sin
    // pagos a cuenta), esperando el comprobante, o pagada sin hora.
    const ahora = Date.now();
    const filas = datos.citas.map((c) => {
      const pagado = datos.pagos.pagadoPorCita.get(c.id) ?? 0;
      const pagos: Saldo | undefined = pagado > 0 ? saldoDeVenta([importe.get(c.id) ?? 0], [pagado]) : undefined;
      return { cita: c, importe: importe.get(c.id) ?? 0, pagos, sello: selloCita(c, pagos, soles, ahora) };
    });
    const esperando = filas.filter((f) => f.sello?.clave === 'esperando_pago' || f.sello?.clave === 'caducada');
    const sinHora = filas.filter((f) => f.sello?.clave === 'pago_sin_hora');
    const porCobrar = filas.filter(
      (f) => cobroPorApuntar(f.cita.status, f.cita.pagado_por) && (!f.sello || f.sello.clave === 'por_cobrar'),
    );
    // Atendidas (el barbero dijo «Atendido» / «Vino»): el cliente está en la caja o va hacia ella.
    // Primero lo último que se atendió. Las demás aún no se atienden: abajo, aparte.
    const listos = porCobrar
      .filter((f) => f.cita.status === 'completed')
      .sort((a, b) => (b.cita.inicio?.getTime() ?? 0) - (a.cita.inicio?.getTime() ?? 0));
    const porAtender = porCobrar.filter((f) => f.cita.status !== 'completed');
    const pedidosSinConstancia = datos.movimientos.filter((m) => m.fuente === 'order' && cobradoSinConstancia(m));

    const entro = entradas.reduce((t, e) => t + e.importe, 0);
    const aCuentaTotal = aCuenta.reduce((t, a) => t + Number(a.pago.amount ?? 0), 0);
    const gastado = datos.gastos.reduce((t, g) => t + g.importe, 0);
    return {
      entro,
      aCuentaTotal,
      aCuenta,
      porMetodo: [...porMetodo.entries()].sort((a, b) => b[1] - a[1]),
      porCobrar: porAtender,
      // Lo que falta: el precio entero, o lo que queda tras lo pagado a cuenta.
      porCobrarTotal: porAtender.reduce((t, x) => t + (x.pagos ? x.pagos.saldo : x.importe), 0),
      listos,
      esperando,
      sinHora,
      pedidosSinConstancia,
      gastado,
      neto: entro - gastado,
    };
  }, [datos, dia, sede]);

  const nombrePorLead = useMemo(
    // El cliente de mostrador no tiene nombre ni teléfono: '' para que se lea «Cliente», no «—».
    () => new Map((datos?.leads ?? []).map((l) => [l.id, l.name || (l.phone ? telefono(l.phone) : '')])),
    [datos],
  );
  const nombrePorBarbero = useMemo(
    () => new Map((datos?.trabajadores ?? []).map((t) => [t.id, t.name])),
    [datos],
  );

  async function cobrar(c: Cita, metodo: MetodoPago, foto?: FotoPago) {
    setEnVuelo(c.id);
    // Antes de releer: después del cobro la fila ya no está en la cola.
    const importe = calculo?.listos.find((f) => f.cita.id === c.id)?.importe ?? 0;
    const r = await comando<ResultadoMarcarPagado>(
      'marcar_pagado',
      // La foto del pago, si el negocio la usa (datos 0010): Postgres la vuelve a revisar.
      { tipo: 'appointment', id: c.id, metodo_pago: metodo, ...(foto ? { foto: fotoParaCobro(foto) } : {}) },
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
    if (r && importe > 0) {
      // Una línea: el servicio por lo cobrado (con lo que se le sumó). Con el botón se puede desglosar.
      const servicio = c.service || 'Servicio';
      setCobrada({
        id: c.id,
        texto: `${soles(importe)} · ${servicio}`,
        lineas: [{ descripcion: servicio, cantidad: 1, precio: importe }],
        tel: (datos?.leads.find((l) => l.id === c.lead_id)?.phone ?? '').replace(/\D/g, '').slice(-9),
      });
    }
    // La tarjeta de fidelidad, sola: si su celular tiene tarjeta, su sello (una vez por cita).
    if (r && companyId) {
      const tel = datos?.leads.find((l) => l.id === c.lead_id)?.phone;
      const total = Number(datos?.movimientos.find((m) => m.fuente === 'appointment' && m.movimiento_id === c.id)?.importe ?? 0);
      const sello = await sumarSelloDeCita(companyId, tel, c.id, total);
      if (sello) avisar(sello.texto, sello.tono);
    }
  }

  return (
    <main className="main main--caja">
      <div className="wrap">
        {/* Lo que se hace en la Caja (17-nov-2026): cobrar, escanear la tarjeta de fidelidad y cerrar
            el día. La Agenda dice quién viene y si vino; el dinero, aquí. */}
        <Topbar titulo="Caja" sub={cierre ? 'Lo que entró, con qué, y lo que salió' : 'Cobra, escanea tarjetas y apunta gastos'} />
        <SubnavCaja />

        {/* La sede se elige arriba, en la cabecera (SedeGlobal). */}
        {sede && (
          <p className="agenda-sede-aviso">Viendo solo <b>{sedeCorta(sede)}</b>. Cámbialo arriba, en la sede.</p>
        )}

        {/* ── COBRAR: tres botones grandes, la cola y nada más ── */}
        {!cierre && (
          <div className="caja-tres" role="group" aria-label="Qué hacer">
            <button type="button" className={`caja-tres__btn caja-tres__btn--principal${ticket ? ' on' : ''}`} aria-expanded={ticket}
              onClick={() => { setTicket((t) => !t); setGasto(false); }}>
              <Receipt size={26} /> <span>{ticket ? 'Cerrar ticket' : 'Cobrar ticket'}</span>
            </button>
            <Link href="/panel/fideliza/caja?camara=1" className="caja-tres__btn">
              <QrCode size={26} /> <span>Escanear tarjeta</span>
            </Link>
            <button type="button" className={`caja-tres__btn${gasto ? ' on' : ''}`} aria-expanded={gasto}
              onClick={() => { setGasto((g) => !g); setTicket(false); }}>
              <Wallet size={26} /> <span>Gasto o adelanto</span>
            </button>
          </div>
        )}

        {!cierre && gasto && (
          <GastosCaja modo="formulario" dia={hoy} gastos={[]} trabajadores={datos?.trabajadores ?? []} soloTodas={false}
            alCambiar={releer} alCerrar={() => setGasto(false)} />
        )}

        {!cierre && ticket && companyId && datos && dia === hoy && (
          <CobrarTicket
            companyId={companyId}
            trabajadores={datos.trabajadores}
            catalogo={datos.catalogo}
            sedes={sedes}
            sedeInicial={sede}
            alCerrar={() => setTicket(false)}
            alListo={releer}
          />
        )}

        {!cierre && cobrada && companyId && (
          <section className="card caja-boleta" aria-label="Boleta del último cobro">
            <span className="muted">Último cobro: <b>{cobrada.texto}</b></span>
            <BoletaDelCobro companyId={companyId} refCobro={{ tipo: 'cita', id: cobrada.id }} lineas={cobrada.lineas} telefono={cobrada.tel} />
          </section>
        )}

        {/* ── Listos para cobrar: lo que ya se atendió. Es la cola del mostrador. ── */}
        {!cierre && calculo && companyId && (
          <ListosParaCobrar
            companyId={companyId}
            catalogo={datos?.catalogo ?? []}
            filas={calculo.listos}
            barbero={(id) => nombrePorBarbero.get(id)}
            cliente={(id) => nombrePorLead.get(id)}
            conSede={!sede}
            enVuelo={enVuelo}
            alCobrar={(c, m, foto) => void cobrar(c, m, foto)}
            alCambiar={releer}
          />
        )}

        {/* Sin nadie en la cola: qué va a salir aquí y el botón para cobrar a mano, a la vista. */}
        {!cierre && calculo && calculo.listos.length === 0 && !ticket && !gasto && (
          <section className="card listos-vacio" aria-label="Listos para cobrar">
            <div>
              <b><Campana size={16} /> Nadie esperando para pagar</b>
              <p className="muted">
                Cuando el barbero marque «Atendido», el cliente sale aquí solo, sin recargar. ¿Llegó alguien con su ticket
                y no está? Toca «Cobrar ticket».
              </p>
            </div>
          </section>
        )}

        {cierre && <CajaResumen dia={dia} hoy={hoy} alDia={setDia} calculo={calculo} />}

        {error && <p className="vacio">No se pudo cargar la caja: {error}</p>}
        {cargando && !datos && <p className="vacio">Cargando la caja…</p>}

        {/* Agendados que aún no se atienden: plegado, para quien paga antes (no es lo de cada momento). */}
        {!cierre && calculo && calculo.porCobrar.length > 0 && (
          <details className="card caja-sin-atender">
            <summary>
              <span>{cap(v.reservas)} de hoy que aún no se atienden · {calculo.porCobrar.length}</span>
              <small className="muted">{soles(calculo.porCobrarTotal)}</small>
            </summary>
              {calculo.porCobrar.length === 0 ? (
                <p className="vacio">Nada pendiente: lo atendido sale arriba, en «Listos para cobrar».</p>
              ) : (
                <>
                  <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                    Agendad{v.a}s que el barbero aún no marca como atendid{v.a}s. Si pagan antes, cóbral{v.a}s aquí.
                  </p>
                  {calculo.porCobrar.map(({ cita, importe, pagos, sello }) => (
                    <div key={cita.id}>
                      <div className="confirmar-fila">
                        <div className="confirmar-quien">
                          <QuienCita c={cita} contacto={nombrePorLead.get(cita.lead_id)} />
                          <small className="muted">
                            {cita.inicio ? hora(cita.inicio) : ''}
                            {cita.service ? ` · ${cita.service}` : ''}
                            {pagos ? ` · faltan ${soles(pagos.saldo)}` : importe ? ` · ${soles(importe)}` : ''}
                          </small>
                        </div>
                        <div className="confirmar-sellos">{sello && <Sello s={sello} />}</div>
                        <div className="confirmar-acciones">
                          <BotonPago abierto={pagando === cita.id} alPulsar={() => setPagando(pagando === cita.id ? null : cita.id)} />
                          <BotonCobrar ocupado={enVuelo === cita.id} alCobrar={(m, foto) => void cobrar(cita, m, foto)} />
                        </div>
                      </div>
                      {pagando === cita.id && (
                        <div className="form-cita">
                          <RegistrarPago
                            leadId={cita.lead_id}
                            appointmentId={cita.id}
                            sugerido={pagos ? pagos.saldo : importe}
                            alCerrar={() => setPagando(null)}
                            alGuardar={releer}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
              {calculo.porCobrar.length > 0 && (
                <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                  «Registrar pago» apunta un importe (una seña o una parte); «Cobrada», que se cobró todo lo que faltaba.
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
          </details>
        )}

        {/* ── CIERRE DEL DÍA: cuadrar la caja ── */}
        {cierre && calculo && (
          <div className="caja-grid">
            {/* ── Lo que entró, por método (completo + a cuenta) ── */}
            <div className="card">
              <div className="card-mini-head">
                <h3>Entró, por método</h3>
              </div>
              {calculo.porMetodo.length === 0 ? (
                <p className="vacio">No ha entrado nada todavía este día.</p>
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

            {/* ── A cuenta: entró, pero lo que paga sigue por cobrar ── */}
            {calculo.aCuenta.length > 0 && (
              <div className="card">
                <div className="card-mini-head">
                  <h3>A cuenta · por cobrar</h3>
                  <small className="muted">{soles(calculo.aCuentaTotal)} de lo que entró</small>
                </div>
                {calculo.aCuenta.map(({ pago, metodo, cita, falta }) => (
                  <div className="kv-fila" key={pago.id}>
                    <span>
                      {nombrePorLead.get(pago.lead_id) ?? 'Cliente'}
                      <small className="muted">
                        {' '}
                        · {etiquetaMetodo(metodo)}
                        {cita?.slot_start ? ` · para el ${textoSlotCorto(cita.slot_start)}` : ''}
                        {cita?.service ? ` · ${cita.service}` : ''}
                        {falta > 0 ? ` · faltan ${soles(falta)}` : ''}
                      </small>
                    </span>
                    <b>{soles(Number(pago.amount ?? 0))}</b>
                  </div>
                ))}
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Pagos que no cubren todavía el total: el dinero entró y suma a la caja, pero {v.la} {v.sesion}
                  sigue por cobrar hasta que se pague todo.
                </p>
              </div>
            )}

            {/* ── Gastos y adelantos: todo lo que sale de la caja, en un sitio (datos 0013) ── */}
            <GastosCaja dia={dia} gastos={datos?.gastos ?? []} trabajadores={datos?.trabajadores ?? []} soloTodas={Boolean(sede)} alCambiar={releer} />

          </div>
        )}

        {cierre && calculo && (calculo.esperando.length > 0 || calculo.sinHora.length > 0) && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-mini-head">
              <h3>Esperando pago</h3>
              <small className="muted">no son cobros olvidados</small>
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
              {cap(v.reservas)} apartad{v.a}s a nombre del cliente hasta que llegue su comprobante. Si no paga en 24 h,
              la hora se libera. Una seña o «Cobrada» {v.la} confirman si la hora sigue libre.
            </p>
            {calculo.sinHora.map(({ cita, sello }) => (
              <div className="confirmar-fila" key={cita.id}>
                <div className="confirmar-quien">
                  <QuienCita c={cita} contacto={nombrePorLead.get(cita.lead_id)} />
                  <small className="muted">
                    {cita.inicio ? hora(cita.inicio) : ''}
                    {cita.service ? ` · ${cita.service}` : ''} · dale otra hora en la Agenda o devuélvele el dinero
                  </small>
                </div>
                <div className="confirmar-sellos">{sello && <Sello s={sello} />}</div>
              </div>
            ))}
            {calculo.esperando.map(({ cita, importe, sello }) => (
              <div key={cita.id}>
                <div className="confirmar-fila">
                  <div className="confirmar-quien">
                    <QuienCita c={cita} contacto={nombrePorLead.get(cita.lead_id)} />
                    <small className="muted">
                      {cita.inicio ? hora(cita.inicio) : ''}
                      {cita.service ? ` · ${cita.service}` : ''}
                      {importe ? ` · ${soles(importe)}` : ''}
                    </small>
                  </div>
                  <div className="confirmar-sellos">{sello && <Sello s={sello} />}</div>
                  <div className="confirmar-acciones">
                    <BotonPago abierto={pagando === cita.id} alPulsar={() => setPagando(pagando === cita.id ? null : cita.id)} />
                    <BotonCobrar ocupado={enVuelo === cita.id} alCobrar={(m, foto) => void cobrar(cita, m, foto)} />
                  </div>
                </div>
                {pagando === cita.id && (
                  <div className="form-cita">
                    <RegistrarPago
                      leadId={cita.lead_id}
                      appointmentId={cita.id}
                      sugerido={importe}
                      alCerrar={() => setPagando(null)}
                      alGuardar={releer}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {cierre && companyId && <ComprobantesDelDia companyId={companyId} dia={dia} recarga={datos} />}

        {cierre && <SaldosPendientes key={companyId} alCambiar={releer} />}

        {cierre && (
        <details className="caja-como">
        <summary>¿Cómo se cuenta lo que entró?</summary>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7, marginTop: 8 }}>
          <b>Entró es lo que entró, no lo que podría entrar.</b> Cada comprobante que verificó Mia y cada pago
          registrado cuentan por su importe y el día en que se pagaron: una seña de S/ 50 es S/ 50, aunque la
          inscripción valga más. Lo que se marcó «Cobrada» sin importe cuenta por su precio, el día de la {v.sesion}.
          Lo pagado a cuenta suma el día que entra; {v.la} {v.sesion} solo pasa a cobrad{v.a} cuando se paga todo.
          Las deudas de otros períodos se consultan en «Saldos por cobrar», sin depender de la fecha seleccionada.
        </p>
        </details>
        )}
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */

/** «Registrar pago»: el mismo botón que en Saldos por cobrar. */
function BotonPago({ abierto, alPulsar }: { abierto: boolean; alPulsar: () => void }) {
  return (
    <button type="button" className="btn btn-ghost btn-sm" aria-expanded={abierto} onClick={alPulsar}>
      <Wallet size={14} /> Registrar pago
    </button>
  );
}

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
  return Number.isNaN(d.getTime()) ? slot : `${diaMes(d)} ${hora12(slot.slice(11, 16))}`.trim();
}
