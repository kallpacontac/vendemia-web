'use client';

/**
 * FIDELIZA · AJUSTES — equipo y permisos, estado de Google Wallet, la cola
 * de sincronización y la conciliación del saldo contra el libro.
 */
import { useState } from 'react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, lecturas, mensaje } from '@/modules/fideliza/cliente/api';
import { ROL, fechaHora } from '@/modules/fideliza/dominio/formato';

interface Miembro {
  auth_user_id: string;
  email: string | null;
  membership_role: string;
  role: string;
  location_ids: string[] | null;
}

const TRABAJO: Record<string, string> = {
  'wallet.class.sync': 'Tarjeta de Wallet del programa',
  'wallet.object.sync': 'Tarjeta de Wallet de un cliente',
  'push.send': 'Aviso push',
};
const ESTADO: Record<string, string> = { pending: 'En cola', retry: 'Reintentará', processing: 'Procesando', dead: 'Falló', done: 'Hecho' };

export default function Ajustes() {
  const { companyId, puede, ajustes, recargar: recargarCtx, rol } = useFideliza();
  const avisar = useAvisar();
  const [conciliacion, setConciliacion] = useState<{ mismatches: unknown[]; fixed: boolean } | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [config, clases, cola, sucursales, equipo] = await Promise.all([
      accion<{ servidor: boolean; wallet: boolean; push: boolean; cron: boolean }>('config.estado', {}),
      lecturas.clases(companyId),
      puede('wallet.manage') ? lecturas.cola(companyId) : Promise.resolve([]),
      lecturas.sucursales(companyId),
      puede('team.manage') ? accion<Miembro[]>('equipo.listar', { companyId }) : Promise.resolve([] as Miembro[]),
    ]);
    return { config, clases, cola, sucursales, equipo };
  }, [companyId]);

  if (cargando && !datos) return <Cargando texto="Cargando ajustes…" />;
  if (error) return <Fallo texto={error} reintentar={releer} />;
  if (!datos) return null;

  const hacer = async (nombre: string, d: Record<string, unknown>, ok: string) => {
    try {
      const r = await accion(nombre, { companyId, ...d });
      avisar(ok);
      releer();
      return r;
    } catch (e) {
      avisar(mensaje(e), 'error');
      return null;
    }
  };

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await accion<{ procesados: number; ok: number; fallidos: number }>('sincronizar', { companyId });
      avisar(r.procesados ? `Procesados ${r.procesados}: ${r.ok} bien, ${r.fallidos} con error.` : 'No había nada pendiente.');
      releer();
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setSincronizando(false);
    }
  }

  const Estado = ({ ok, si, no }: { ok: boolean; si: string; no: string }) => (
    <span className={`badge-pill ${ok ? 'b-new' : 'b-hot'}`}>{ok ? si : no}</span>
  );

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Servicios</h3>
        <ul className="fz-lista">
          <li>
            <span>Servidor de Fideliza (páginas públicas, placas)</span>
            <Estado ok={datos.config.servidor} si="Configurado" no="No configurado" />
          </li>
          <li>
            <span>Google Wallet</span>
            <Estado ok={datos.config.wallet} si="Configurado" no="No configurado" />
          </li>
          <li>
            <span>Avisos push (Web Push)</span>
            <Estado ok={datos.config.push} si="Configurado" no="No configurado" />
          </li>
          <li>
            <span>Tareas automáticas (cron)</span>
            <Estado ok={datos.config.cron} si="Configurado" no="No configurado" />
          </li>
        </ul>
        {datos.clases.map((c) => (
          <div key={c.program_id} className={`fz-panel-aviso ${c.state === 'synced' ? 'fz-panel-aviso--ok' : c.state === 'error' ? 'fz-panel-aviso--error' : ''}`} style={{ marginTop: 12 }}>
            <span style={{ flex: 1 }}>
              Tarjeta de Google Wallet del programa{c.is_demo ? ' (clase de demostración de Vendemia)' : ''}:{' '}
              {c.state === 'synced' ? `al día (${c.review_status ?? 'sin estado de revisión'})` : c.state === 'error' ? `error — ${c.last_error}` : 'pendiente de crear'}
              {c.last_synced_at ? ` · ${fechaHora(c.last_synced_at)}` : ''}
            </span>
            {puede('wallet.manage') && (
              <button className="btn btn-ghost btn-sm" onClick={() => void hacer('wallet.resincronizar', { memberId: null }, 'En cola').then(() => sincronizar())}>
                Reintentar
              </button>
            )}
          </div>
        ))}
        {rol === 'platform_admin' && ajustes && (
          <label className="check-inline" style={{ display: 'block', marginTop: 12 }}>
            <input
              type="checkbox"
              checked={ajustes.wallet_use_demo_class}
              onChange={(e) =>
                void hacer('ajustes.guardar', { datos: { wallet_use_demo_class: e.target.checked } }, 'Guardado').then(() => recargarCtx())
              }
            />{' '}
            Usar la clase de demostración de Vendemia (solo para el negocio demo; lleva la marca de Vendemia)
          </label>
        )}
      </div>

      {puede('wallet.manage') && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="fz-fila" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ fontSize: 15 }}>Cola de sincronización</h3>
            <div className="fz-fila">
              <button className="btn btn-primary btn-sm" disabled={sincronizando} onClick={() => void sincronizar()}>
                {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const r = await hacer('conciliar', { fix: false }, 'Conciliación hecha');
                  if (r) setConciliacion(r as { mismatches: unknown[]; fixed: boolean });
                }}
              >
                Conciliar saldos
              </button>
            </div>
          </div>
          {conciliacion && (
            <div className={`fz-panel-aviso ${conciliacion.mismatches.length ? 'fz-panel-aviso--error' : 'fz-panel-aviso--ok'}`}>
              <span style={{ flex: 1 }}>
                {conciliacion.mismatches.length
                  ? `${conciliacion.mismatches.length} tarjeta(s) con el saldo distinto del libro.`
                  : 'Todos los saldos cuadran con el libro.'}
              </span>
              {conciliacion.mismatches.length > 0 && puede('team.manage') && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={async () => {
                    if (!window.confirm('El saldo de esas tarjetas pasará a ser el que dice el libro. ¿Corregir?')) return;
                    const r = await hacer('conciliar', { fix: true }, 'Saldos corregidos según el libro');
                    if (r) setConciliacion(r as { mismatches: unknown[]; fixed: boolean });
                  }}
                >
                  Corregir según el libro
                </button>
              )}
            </div>
          )}
          {!datos.cola.length ? (
            <p className="muted" style={{ fontSize: 13 }}>Nada pendiente.</p>
          ) : (
            <ul className="fz-lista">
              {datos.cola.map((t) => (
                <li key={t.id}>
                  <span>
                    {TRABAJO[t.kind] ?? t.kind} · <b>{ESTADO[t.status] ?? t.status}</b> · intento {t.attempts}/{t.max_attempts}
                    {t.last_error && <div className="muted" style={{ fontSize: 12 }}>{t.last_error}</div>}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {t.status === 'retry' ? `Próximo intento ${fechaHora(t.next_attempt_at)}` : `Creado ${fechaHora(t.created_at)}`}
                    </div>
                  </span>
                  {(t.status === 'dead' || t.status === 'retry') && (
                    <button className="btn btn-ghost btn-sm" onClick={() => void hacer('outbox.reintentar', { id: t.id }, 'Vuelve a la cola').then(() => sincronizar())}>
                      Reintentar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {puede('team.manage') && (
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Equipo y permisos en Fideliza</h3>
          <p className="fz-def" style={{ marginTop: 0 }}>
            Las cuentas del equipo se dan de alta en Ajustes del panel. Aquí solo se decide qué pueden hacer en Fideliza. Cajero: buscar, registrar y canjear. Gerente: además programa, placas, devoluciones y campañas. Analista: solo métricas.
          </p>
          <ul className="fz-lista">
            {datos.equipo.map((m) => (
              <li key={m.auth_user_id}>
                <span>{m.email ?? m.auth_user_id.slice(0, 8)}</span>
                {m.membership_role === 'owner' ? (
                  <span className="badge-pill b-info">{ROL.owner}</span>
                ) : (
                  <span className="fz-fila">
                    <select
                      className="select"
                      style={{ width: 'auto' }}
                      value={m.role}
                      onChange={(e) => void hacer('equipo.rol', { userId: m.auth_user_id, role: e.target.value, locations: m.location_ids }, 'Permiso actualizado')}
                      aria-label="Rol en Fideliza"
                    >
                      <option value="cashier">{ROL.cashier}</option>
                      <option value="manager">{ROL.manager}</option>
                      <option value="analyst">{ROL.analyst}</option>
                    </select>
                    {datos.sucursales.length > 0 && (
                      <select
                        className="select"
                        style={{ width: 'auto' }}
                        value={m.location_ids?.[0] ?? ''}
                        onChange={(e) => void hacer('equipo.rol', { userId: m.auth_user_id, role: m.role, locations: e.target.value ? [e.target.value] : null }, 'Sucursal actualizada')}
                        aria-label="Sucursal"
                      >
                        <option value="">Todas las sucursales</option>
                        {datos.sucursales.map((s) => (
                          <option key={s.id} value={s.id}>
                            Solo {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
