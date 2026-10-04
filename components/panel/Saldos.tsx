'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * SALDOS · quién debe y cuánto (la seña reserva el cupo, 3-oct-2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dos piezas, la misma cuenta (lib/panel/saldo.ts, copia de la del bot):
 *
 *   · <SaldosPendientes> va en la Caja. Lo que un administrador hace el día 1
 *     es una sola cosa: ver quién debe y reclamarlo. Por LEAD, no por
 *     inscripción —una madre con tres hijos es una deuda, no tres—, de la deuda
 *     más vieja a la más nueva, con el total arriba.
 *   · <SaldoDeFicha> va en la ficha del cliente (Mensajes): sus alumnos, lo que
 *     pagó, lo que debe y cada comprobante con su importe.
 *
 * El pago en efectivo se apunta con `registrar_pago`, que lleva IMPORTE. No con
 * marcar_pagado, que no lo lleva y daría la venta entera por cobrada.
 *
 * El panel no escribe en la base: encola y el bot aplica. Y no le escribe nada
 * al cliente; eso, si hace falta, lo manda una persona desde Mensajes.
 */
import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { useSesion } from './Sesion';
import { useComando } from './Avisos';
import { useCargar } from './useCargar';
import { soles } from '@/lib/panel/format';
import { METODO_LABEL, METODOS_CITA, type MetodoPago } from '@/lib/panel/metodosPago';
import { conSaldo, type VentaLead } from '@/lib/panel/saldo';
import { getCitas, getLeads, getVentas } from '@/lib/supabase/queries';

/** «hace 2 días», a partir de un epoch en segundos. */
function haceDias(epoch: number): string {
  if (!epoch) return '';
  const dias = Math.floor((Date.now() / 1000 - epoch) / 86400);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** Quién recibe el servicio: el beneficiario si lo hay, si no, el propio cliente. */
const alumnosDe = (v: VentaLead) => v.inscripciones.length;

export function SaldosPendientes() {
  const { companyId } = useSesion();
  const { datos, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [citas, leads] = await Promise.all([getCitas(companyId), getLeads(companyId, 1000)]);
    const ventas = await getVentas(companyId, citas);
    return { deudas: conSaldo(ventas), nombre: new Map(leads.map((l) => [l.id, l.name || l.phone])) };
  }, [companyId]);

  // Sin deudas no se pinta nada: en una barbería esta tarjeta nunca existe.
  if (!datos || datos.deudas.length === 0) return null;
  const total = datos.deudas.reduce((t, v) => t + v.saldo.saldo, 0);

  return (
    <div className="card saldos">
      <div className="card-mini-head">
        <h3>Saldos por cobrar</h3>
        <b className="saldos__total">{soles(total)}</b>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '-6px 0 10px' }}>
        Tienen el cupo porque pusieron una seña, y deben el resto. De la deuda más antigua a la más nueva.
      </p>
      <ul className="saldos__lista">
        {datos.deudas.map((v) => (
          <FilaSaldo key={v.leadId} v={v} nombre={datos.nombre.get(v.leadId) ?? 'Cliente'} alGuardar={releer} />
        ))}
      </ul>
    </div>
  );
}

function FilaSaldo({ v, nombre, alGuardar }: { v: VentaLead; nombre: string; alGuardar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const n = alumnosDe(v);
  return (
    <li className="saldos__fila">
      <div className="saldos__quien">
        <b>{nombre}</b>
        <small className="muted">
          {n} {n === 1 ? 'alumno' : 'alumnos'} · {soles(v.saldo.total)} · pagó {soles(v.saldo.pagado)} ·{' '}
          {haceDias(v.desde)}
        </small>
      </div>
      <b className="saldos__debe">debe {soles(v.saldo.saldo)}</b>
      {abierto ? (
        <RegistrarPago v={v} alCerrar={() => setAbierto(false)} alGuardar={alGuardar} />
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(true)}>
          <Wallet size={14} /> Registrar pago
        </button>
      )}
    </li>
  );
}

/**
 * El formulario de `registrar_pago`. El importe arranca en el saldo entero
 * porque es lo más habitual («vino a pagar lo que faltaba»), pero se edita: una
 * segunda seña también vale.
 */
export function RegistrarPago({ v, alCerrar, alGuardar }: { v: VentaLead; alCerrar: () => void; alGuardar: () => void }) {
  const comando = useComando();
  const [monto, setMonto] = useState(String(v.saldo.saldo));
  const [metodo, setMetodo] = useState<MetodoPago>('cash');
  const [enviando, setEnviando] = useState(false);
  const valor = Number(monto.replace(',', '.'));
  const valido = Number.isFinite(valor) && valor > 0;

  async function guardar() {
    if (!valido) return;
    setEnviando(true);
    const r = await comando(
      'registrar_pago',
      { lead_id: v.leadId, monto: Math.round(valor * 100) / 100, metodo_pago: metodo },
      `Pago de ${soles(valor)} registrado.`,
      alGuardar,
    );
    setEnviando(false);
    if (r !== undefined) alCerrar();
  }

  return (
    <div className="saldos__form">
      <input
        className="input"
        inputMode="decimal"
        aria-label="Importe"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
      />
      <select className="select" aria-label="Con qué pagó" value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
        {METODOS_CITA.map((m) => (
          <option key={m} value={m}>
            {METODO_LABEL[m]}
          </option>
        ))}
      </select>
      <button type="button" className="btn btn-primary btn-sm" disabled={!valido || enviando} onClick={() => void guardar()}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={alCerrar}>
        Cancelar
      </button>
    </div>
  );
}

/**
 * El saldo en la ficha del cliente. Recibe la venta ya calculada; si no tiene
 * inscripciones vivas, no pinta nada.
 */
export function SaldoDeFicha({ v }: { v: VentaLead | undefined }) {
  if (!v) return null;
  return (
    <div className="saldo-ficha">
      <div className="saldo-ficha__cifras">
        <span>
          <small>Total</small>
          <b>{soles(v.saldo.total)}</b>
        </span>
        <span>
          <small>Pagó</small>
          <b>{soles(v.saldo.pagado)}</b>
        </span>
        <span className={v.saldo.saldo > 0 ? 'debe' : ''}>
          <small>Debe</small>
          <b>{soles(v.saldo.saldo)}</b>
        </span>
      </div>
      <ul className="saldo-ficha__lista">
        {v.inscripciones.map((c) => (
          <li key={c.id}>
            <span>
              {c.beneficiario ? <b>{c.beneficiario}</b> : null} {c.service}
            </span>
            <span className="muted">
              {c.status === 'pending_payment' ? 'sin cupo · ' : ''}
              {soles(v.precioDe.get(c.id) ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      {v.pagos.length > 0 && (
        <>
          <small className="saldo-ficha__sub">Comprobantes</small>
          <ul className="saldo-ficha__lista">
            {v.pagos.map((p) => (
              <li key={p.id}>
                <span className="muted">
                  {p.created_at ? new Date(p.created_at * 1000).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : '—'}
                  {p.operation_id ? ` · op. ${p.operation_id}` : ''}
                </span>
                <b>{soles(Number(p.amount))}</b>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
