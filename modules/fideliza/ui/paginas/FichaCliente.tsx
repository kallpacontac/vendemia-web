'use client';

/**
 * FIDELIZA · FICHA DE CLIENTE
 *
 * El historial NO se edita: una devolución o una corrección crean un
 * movimiento nuevo que compensa, y el libro conserva los dos.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, Qr, SinPermiso } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, mensaje, nuevaClave, sincronizarEnSegundoPlano } from '@/modules/fideliza/cliente/api';
import { urlTarjeta } from '@/modules/fideliza/dominio/config';
import { aCentimos, fechaHora, soles, unidades, type TipoRegla } from '@/modules/fideliza/dominio/formato';

interface Ficha {
  id: string;
  public_code: string;
  alias: string | null;
  status: 'active' | 'suspended' | 'deleted';
  balance: number;
  rewards_available: number;
  rule_type: TipoRegla | null;
  threshold: number | null;
  reward_description: string | null;
  created_at: string;
  joined_via: string;
  lifetime_units: number;
  can_see_contacts: boolean;
  contacts: { kind: 'phone' | 'email'; value?: string; verified_at: string | null; verified_method?: string }[] | null;
  consents: Record<string, { granted: boolean; at: string }>;
  push_devices: number;
  transactions: {
    id: string;
    kind: string;
    amount_cents: number;
    units: number;
    external_ref: string | null;
    reverses_id: string | null;
    reason: string | null;
    location_name: string | null;
    created_at: string;
  }[];
  ledger: { id: number; kind: string; units: number; balance_after: number; created_at: string }[];
  all_rewards: { id: string; description: string; status: string; issued_at: string; expires_at: string | null; redeemed_at: string | null }[];
  wallet: { state: string; desired_rev: number; synced_rev: number; save_links_issued: number; last_error: string | null; last_synced_at: string | null } | null;
}

const TX: Record<string, string> = { purchase: 'Compra', visit: 'Visita', refund: 'Devolución', adjustment: 'Corrección' };
const LIBRO: Record<string, string> = { earn: 'Suma', reverse: 'Devolución', reward_issue: 'Premio emitido', reward_revoke: 'Premio anulado', adjust: 'Corrección' };
const PREMIO: Record<string, string> = { available: 'Disponible', redeemed: 'Canjeado', expired: 'Vencido', revoked: 'Anulado' };

export default function FichaCliente() {
  const { memberId } = useParams<{ memberId: string }>();
  const { companyId, puede } = useFideliza();
  const avisar = useAvisar();
  const [enlace, setEnlace] = useState<string | null>(null);
  const [edicion, setEdicion] = useState<null | { alias: string; phone: string; email: string }>(null);
  const [devolucion, setDevolucion] = useState<null | { tx: Ficha['transactions'][number]; importe: string; motivo: string; clave: string }>(null);
  const [ajuste, setAjuste] = useState<null | { units: string; motivo: string; clave: string }>(null);

  const { datos: f, cargando, error, releer } = useCargar(
    async () => (companyId ? accion<Ficha>('miembro.ficha', { companyId, memberId }) : null),
    [companyId, memberId],
  );

  if (!puede('members.read')) return <SinPermiso que="las fichas de clientes" />;
  if (cargando && !f) return <Cargando texto="Cargando la ficha…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!f) return null;

  const hacer = async (nombre: string, datos: Record<string, unknown>, ok: string, wallet = true) => {
    try {
      const r = await accion<Record<string, unknown>>(nombre, { companyId, memberId, ...datos });
      avisar(ok);
      if (wallet) sincronizarEnSegundoPlano(companyId!);
      releer();
      return r;
    } catch (e) {
      avisar(mensaje(e), 'error');
      return null;
    }
  };

  async function rotar() {
    if (!window.confirm('Se crea un enlace nuevo y el anterior deja de funcionar. Hazlo solo con la persona delante. ¿Seguir?')) return;
    const r = await hacer('miembro.rotar', {}, 'Enlace nuevo creado', false);
    if (r?.card_token) setEnlace(urlTarjeta(String(r.card_token)));
  }

  async function exportar() {
    try {
      const r = await accion('miembro.exportar', { companyId, memberId });
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fideliza-${f!.public_code}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      avisar(mensaje(e), 'error');
    }
  }

  async function borrar() {
    const motivo = window.prompt('Se borran nombre, contactos y avisos; el historial de puntos queda sin datos personales. Motivo:');
    if (!motivo || motivo.trim().length < 3) return;
    await hacer('miembro.borrar', { reason: motivo.trim() }, 'Datos personales borrados');
  }

  async function devolver() {
    if (!devolucion) return;
    const centimos = devolucion.importe.trim() ? aCentimos(devolucion.importe) : null;
    if (devolucion.importe.trim() && centimos === null) return avisar('Importe no válido', 'error');
    const r = await hacer(
      'caja.devolver',
      { transactionId: devolucion.tx.id, amountCents: centimos, reason: devolucion.motivo, idempotencyKey: devolucion.clave },
      'Devolución registrada',
    );
    if (r) setDevolucion(null);
  }

  async function ajustar() {
    if (!ajuste) return;
    const n = Number(ajuste.units);
    if (!Number.isInteger(n) || n === 0) return avisar('Cantidad no válida (entero, positivo o negativo).', 'error');
    const r = await hacer('caja.ajustar', { units: n, reason: ajuste.motivo, idempotencyKey: ajuste.clave }, 'Corrección registrada');
    if (r) setAjuste(null);
  }

  /** Le queda algo por devolver: unidades o importe que ninguna devolución anterior compensó. */
  const reembolsable = (t: Ficha['transactions'][number]) => {
    if (t.kind !== 'purchase' && t.kind !== 'visit') return false;
    const previas = f.transactions.filter((x) => x.kind === 'refund' && x.reverses_id === t.id);
    const unidadesHechas = previas.reduce((s, x) => s - x.units, 0);
    const importeHecho = previas.reduce((s, x) => s + x.amount_cents, 0);
    return unidadesHechas < t.units || importeHecho < t.amount_cents;
  };

  return (
    <>
      <Link href="/panel/fideliza/clientes" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Clientes
      </Link>

      <div className="fz-col2">
        <div className="card">
          <div className="fz-miembro">
            <div>
              <div className="fz-mono" style={{ fontSize: 20, fontWeight: 800 }}>
                {f.public_code}
              </div>
              <div>{f.alias ?? <span className="muted">Sin nombre</span>}</div>
              <span className={`badge-pill ${f.status === 'active' ? 'b-new' : f.status === 'suspended' ? 'b-hot' : 'b-mute'}`}>
                {f.status === 'active' ? 'Activa' : f.status === 'suspended' ? 'Suspendida' : 'Borrada'}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fz-saldo">{f.balance}</div>
              <div className="muted">{f.rule_type ? unidades(f.balance, f.rule_type).replace(/^[-\d.,\s]+/, '') : ''}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {f.rewards_available} premio(s) disponible(s)
              </div>
            </div>
          </div>
          <p className="fz-def">
            Alta {fechaHora(f.created_at)} · desde {f.joined_via === 'public' ? 'la página pública' : f.joined_via} · acumulado histórico {f.lifetime_units}
          </p>

          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Contacto</h3>
          {!f.contacts?.length && <p className="muted" style={{ fontSize: 13 }}>Sin datos de contacto.</p>}
          <ul className="fz-lista">
            {(f.contacts ?? []).map((c) => (
              <li key={c.kind}>
                <span>
                  {c.kind === 'phone' ? 'Teléfono' : 'Correo'}: {f.can_see_contacts ? c.value : '•••'}
                </span>
                {c.verified_at ? (
                  <span className="badge-pill b-new">Verificado {c.verified_method === 'in_person' ? 'en persona' : ''}</span>
                ) : (
                  <span className="fz-fila">
                    <span className="badge-pill b-mute">Sin verificar</span>
                    {puede('members.create') && f.status === 'active' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => void hacer('miembro.verificar', { kind: c.kind }, 'Marcado como verificado en persona', false)}>
                        Verificar en persona
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Comunicaciones</h3>
          <p className="fz-def" style={{ marginTop: 0 }}>
            Avisos push: {f.consents.push?.granted ? `aceptados (${fechaHora(f.consents.push.at)})` : 'no aceptados'} · {f.push_devices} navegador(es)
          </p>
          {puede('members.manage') && f.consents.push?.granted && (
            <button className="btn btn-ghost btn-sm" onClick={() => void hacer('miembro.consentimiento', { channel: 'push', granted: false, source: 'panel' }, 'Baja de avisos registrada', false)}>
              Dar de baja de avisos
            </button>
          )}

          <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Google Wallet</h3>
          {f.wallet ? (
            <p className="fz-def" style={{ marginTop: 0 }}>
              {f.wallet.state === 'synced' && f.wallet.synced_rev >= f.wallet.desired_rev ? 'Al día' : f.wallet.state === 'error' ? `Error: ${f.wallet.last_error}` : 'Pendiente de actualizar'} ·
              enlaces emitidos: {f.wallet.save_links_issued} · última sincronización {fechaHora(f.wallet.last_synced_at)}
            </p>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>No ha pedido la tarjeta de Google Wallet.</p>
          )}
          {f.wallet && puede('wallet.manage') && (
            <button className="btn btn-ghost btn-sm" onClick={() => void hacer('wallet.resincronizar', {}, 'Actualización de Wallet en cola')}>
              Reintentar Wallet
            </button>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Acciones</h3>
          <div className="fz-fila">
            {puede('members.create') && f.status === 'active' && (
              <button className="btn btn-ghost btn-sm" onClick={() => void rotar()}>
                Nuevo enlace de tarjeta
              </button>
            )}
            {puede('members.manage') && f.status !== 'deleted' && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdicion({ alias: f.alias ?? '', phone: f.contacts?.find((c) => c.kind === 'phone')?.value ?? '', email: f.contacts?.find((c) => c.kind === 'email')?.value ?? '' })}>
                  Editar datos
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    const motivo = window.prompt(f.status === 'active' ? 'Motivo de la suspensión:' : 'Motivo de la reactivación:') ?? '';
                    if (motivo.trim()) void hacer('miembro.estado', { status: f.status === 'active' ? 'suspended' : 'active', reason: motivo.trim() }, f.status === 'active' ? 'Tarjeta suspendida' : 'Tarjeta reactivada');
                  }}
                >
                  {f.status === 'active' ? 'Suspender' : 'Reactivar'}
                </button>
              </>
            )}
            {puede('ops.refund') && f.status === 'active' && (
              <button className="btn btn-ghost btn-sm" onClick={() => setAjuste({ units: '', motivo: '', clave: nuevaClave() })}>
                Corregir saldo
              </button>
            )}
            {puede('members.export') && (
              <button className="btn btn-ghost btn-sm" onClick={() => void exportar()}>
                Exportar datos (JSON)
              </button>
            )}
            {puede('members.delete') && f.status !== 'deleted' && (
              <button className="btn btn-ghost btn-sm" style={{ color: '#B4232A' }} onClick={() => void borrar()}>
                Borrar datos personales
              </button>
            )}
          </div>

          {enlace && (
            <div style={{ marginTop: 14 }}>
              <p className="fz-def">Enlace nuevo (solo se enseña ahora). El anterior ya no funciona.</p>
              <Qr valor={enlace} tam={200} />
              <input className="input" readOnly value={enlace} onFocus={(e) => e.target.select()} style={{ marginTop: 8 }} />
            </div>
          )}

          {edicion && (
            <div style={{ marginTop: 14 }}>
              <input className="input" placeholder="Nombre" maxLength={40} value={edicion.alias} onChange={(e) => setEdicion({ ...edicion, alias: e.target.value })} style={{ marginBottom: 8 }} />
              <input className="input" placeholder="Teléfono" value={edicion.phone} onChange={(e) => setEdicion({ ...edicion, phone: e.target.value })} style={{ marginBottom: 8 }} />
              <input className="input" placeholder="Correo" value={edicion.email} onChange={(e) => setEdicion({ ...edicion, email: e.target.value })} style={{ marginBottom: 8 }} />
              <small className="muted">Cambiar un dato le quita la verificación.</small>
              <div className="fz-fila" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => void hacer('miembro.editar', edicion, 'Datos guardados').then((r) => r !== null && setEdicion(null))}>
                  Guardar
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdicion(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {ajuste && (
            <div style={{ marginTop: 14 }}>
              <p className="fz-def">Suma (positivo) o resta (negativo) unidades. Queda en el libro con tu usuario y el motivo.</p>
              <input className="input" inputMode="numeric" placeholder="Ej.: 2 o -1" value={ajuste.units} onChange={(e) => setAjuste({ ...ajuste, units: e.target.value })} style={{ marginBottom: 8 }} />
              <input className="input" placeholder="Motivo" maxLength={200} value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} />
              <div className="fz-fila" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => void ajustar()}>
                  Registrar corrección
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAjuste(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {devolucion && (
            <div style={{ marginTop: 14 }}>
              <p className="fz-def">
                Devolución de la {TX[devolucion.tx.kind]?.toLowerCase()} del {fechaHora(devolucion.tx.created_at)} ({soles(devolucion.tx.amount_cents)}, {devolucion.tx.units} u.). Deja el importe vacío para devolverla entera.
              </p>
              {f.rule_type === 'points' && (
                <input className="input" inputMode="decimal" placeholder="Importe devuelto (S/), vacío = todo" value={devolucion.importe} onChange={(e) => setDevolucion({ ...devolucion, importe: e.target.value })} style={{ marginBottom: 8 }} />
              )}
              <input className="input" placeholder="Motivo" maxLength={200} value={devolucion.motivo} onChange={(e) => setDevolucion({ ...devolucion, motivo: e.target.value })} />
              <div className="fz-fila" style={{ marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => void devolver()}>
                  Registrar devolución
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setDevolucion(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Operaciones</h3>
        {!f.transactions.length ? (
          <p className="muted">Sin operaciones.</p>
        ) : (
          <div className="table-card" style={{ boxShadow: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Importe</th>
                  <th>Unidades</th>
                  <th>Comprobante</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {f.transactions.map((t) => (
                  <tr key={t.id}>
                    <td>{fechaHora(t.created_at)}</td>
                    <td>
                      {TX[t.kind] ?? t.kind}
                      {t.reason && <div className="muted" style={{ fontSize: 12 }}>{t.reason}</div>}
                      {t.location_name && <div className="muted" style={{ fontSize: 12 }}>{t.location_name}</div>}
                    </td>
                    <td>{t.amount_cents ? soles(t.amount_cents) : '—'}</td>
                    <td>{t.units > 0 ? `+${t.units}` : t.units}</td>
                    <td className="fz-mono">{t.external_ref ?? '—'}</td>
                    <td>
                      {puede('ops.refund') && reembolsable(t) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setDevolucion({ tx: t, importe: '', motivo: '', clave: nuevaClave() })}>
                          Devolver
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fz-col2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Libro (últimos movimientos)</h3>
          <ul className="fz-lista">
            {f.ledger.map((l) => (
              <li key={l.id}>
                <span>
                  {LIBRO[l.kind] ?? l.kind} <span className="muted">{fechaHora(l.created_at)}</span>
                </span>
                <span>
                  {l.units > 0 ? `+${l.units}` : l.units} → <b>{l.balance_after}</b>
                </span>
              </li>
            ))}
            {!f.ledger.length && <li className="muted">Sin movimientos.</li>}
          </ul>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Premios</h3>
          <ul className="fz-lista">
            {f.all_rewards.map((r) => (
              <li key={r.id}>
                <span>
                  {r.description} <span className="muted">{fechaHora(r.issued_at)}</span>
                </span>
                <span className={`badge-pill ${r.status === 'available' ? 'b-new' : 'b-mute'}`}>
                  {PREMIO[r.status] ?? r.status}
                  {r.status === 'available' && r.expires_at ? ` · vence ${fechaHora(r.expires_at)}` : ''}
                </span>
              </li>
            ))}
            {!f.all_rewards.length && <li className="muted">Todavía no ha conseguido premios.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
