'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIDELIZA · CAJA — de pie, con el móvil en una mano
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tres reglas que no se negocian:
 *
 * 1 · NADA SE PINTA COMO HECHO HASTA QUE POSTGRES LO CONFIRMA. El saldo que
 *     se enseña después es el que devuelve la RPC, no una suma en el navegador.
 * 2 · CADA INTENTO TIENE SU CLAVE. Si la red se cae a mitad, «Reintentar»
 *     reenvía la MISMA clave: si ya se había registrado, la base devuelve la
 *     misma operación («replayed») y no suma dos veces.
 * 3 · SIN CONEXIÓN NO SE OPERA. No hay canje offline: un premio canjeado sin
 *     confirmar podría canjearse otra vez en otra caja.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, CameraOff, Gift, Plus, Search, ShoppingBag } from 'lucide-react';
import { useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Qr, SinPermiso } from '@/modules/fideliza/ui/Estados';
import { useAvisar } from '@/components/panel/Avisos';
import { useCargar } from '@/components/panel/useCargar';
import { accion, ErrorFideliza, lecturas, mensaje, nuevaClave, sincronizarEnSegundoPlano } from '@/modules/fideliza/cliente/api';
import { urlTarjeta } from '@/modules/fideliza/dominio/config';
import { aCentimos, soles, unidades, type TipoRegla } from '@/modules/fideliza/dominio/formato';

interface MiembroCaja {
  id: string;
  public_code: string;
  alias: string | null;
  status: string;
  balance: number;
  rewards_available: number;
  rule_type: TipoRegla | null;
  threshold: number | null;
  reward_description: string | null;
  verified_contact: boolean;
  rewards: { id: string; description: string; expires_at: string | null }[];
}

interface Resultado {
  status: 'created' | 'replayed';
  kind?: string;
  units?: number;
  amount_cents?: number;
  rewards_issued?: number;
  description?: string;
  member: MiembroCaja;
}

type Pendiente = { tipo: 'registrar' | 'canjear'; clave: string; datos: Record<string, unknown> } | null;

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
  }
}

export default function Caja() {
  const { companyId, ajustes, puede } = useFideliza();
  const avisar = useAvisar();
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [candidatos, setCandidatos] = useState<MiembroCaja[]>([]);
  const [m, setM] = useState<MiembroCaja | null>(null);
  const [importe, setImporte] = useState('');
  const [ref, setRef] = useState('');
  const [sucursal, setSucursal] = useState<string>('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente>(null);
  const [ultimo, setUltimo] = useState<{ texto: string; tono: 'ok' | 'info' } | null>(null);
  const [camara, setCamara] = useState(false);
  const [alta, setAlta] = useState<null | { alias: string; phone: string; verificado: boolean; clave: string; creado?: { code: string; token: string | null } }>(null);
  const video = useRef<HTMLVideoElement>(null);

  const { datos: sucursales } = useCargar(async () => (companyId ? lecturas.sucursales(companyId) : []), [companyId]);
  const activas = (sucursales ?? []).filter((s) => s.is_active);

  useEffect(() => {
    if (!companyId) return;
    try {
      setSucursal(localStorage.getItem(`fz:sucursal:${companyId}`) ?? '');
    } catch {
      /* nada */
    }
  }, [companyId]);

  // ── Escáner ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!camara) return;
    let flujo: MediaStream | null = null;
    let vivo = true;
    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        const det = new window.BarcodeDetector!({ formats: ['qr_code'] });
        while (vivo) {
          const r = await det.detect(video.current).catch(() => []);
          if (r[0]?.rawValue) {
            setCamara(false);
            setQ(r[0].rawValue);
            void buscar(r[0].rawValue);
            break;
          }
          await new Promise((res) => setTimeout(res, 250));
        }
      } catch {
        avisar('No se pudo abrir la cámara. Escribe el código de la tarjeta.', 'error');
        setCamara(false);
      }
    })();
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camara]);

  if (!puede('ops.record')) return <SinPermiso que="la caja" />;
  if (!companyId) return <Cargando />;
  const escanerPosible = typeof window !== 'undefined' && Boolean(window.BarcodeDetector) && Boolean(navigator.mediaDevices);

  async function buscar(texto = q) {
    if (!texto.trim()) return;
    setBuscando(true);
    setCandidatos([]);
    try {
      const r = await accion<MiembroCaja[]>('caja.buscar', { companyId, q: texto.trim() });
      if (r.length === 1) elegir(r[0]);
      else if (r.length === 0) avisar('No hay ninguna tarjeta con ese código en este negocio.', 'espera');
      else setCandidatos(r);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setBuscando(false);
    }
  }

  function elegir(x: MiembroCaja) {
    setM(x);
    setCandidatos([]);
    setImporte('');
    setRef('');
    setPendiente(null);
  }

  function elegirSucursal(id: string) {
    setSucursal(id);
    try {
      localStorage.setItem(`fz:sucursal:${companyId}`, id);
    } catch {
      /* nada */
    }
  }

  async function enviar(p: NonNullable<Pendiente>) {
    setOcupado(true);
    setPendiente(p);
    try {
      const nombre = p.tipo === 'registrar' ? 'caja.registrar' : 'caja.canjear';
      const r = await accion<Resultado>(nombre, { ...p.datos, idempotencyKey: p.clave });
      setPendiente(null);
      setM(r.member);
      setImporte('');
      setRef('');
      const tipo = r.member.rule_type;
      const texto =
        p.tipo === 'canjear'
          ? `Canjeado: ${r.description ?? 'premio'}. Le quedan ${r.member.rewards_available} premio(s).`
          : `${r.units ? `+${unidades(r.units, tipo)}` : 'Registrada, sin sumar (por debajo del mínimo)'}. Saldo: ${unidades(r.member.balance, tipo)}.${r.rewards_issued ? ` ¡Premio conseguido! (${r.rewards_issued})` : ''}`;
      setUltimo({ texto: r.status === 'replayed' ? `Ya estaba registrado: ${texto}` : texto, tono: 'ok' });
      sincronizarEnSegundoPlano(companyId!);
    } catch (e) {
      const sinRespuesta = e instanceof ErrorFideliza && (e.status === 0 || e.status >= 500);
      if (!sinRespuesta) setPendiente(null);
      avisar(sinRespuesta ? 'No llegó la confirmación. Pulsa «Reintentar»: si ya se había registrado, no se suma dos veces.' : mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  function registrar() {
    if (!m) return;
    const tipo = m.rule_type;
    const centimos = importe.trim() ? aCentimos(importe) : 0;
    if (centimos === null) return avisar('Importe no válido. Ej.: 35 o 35,50', 'error');
    if (tipo === 'points' && !centimos) return avisar('Indica el importe de la compra.', 'error');
    if (ajustes?.require_external_ref && !ref.trim()) return avisar('Indica el número de comprobante.', 'error');
    void enviar({
      tipo: 'registrar',
      clave: nuevaClave(),
      datos: {
        companyId,
        memberId: m.id,
        kind: tipo === 'visits' ? 'visit' : 'purchase',
        amountCents: centimos,
        locationId: sucursal || null,
        externalRef: ref.trim() || null,
      },
    });
  }

  function canjear(rewardId: string | null) {
    if (!m) return;
    if (!window.confirm(`¿Entregar ahora el premio «${m.rewards.find((r) => r.id === rewardId)?.description ?? m.reward_description}»?`)) return;
    void enviar({
      tipo: 'canjear',
      clave: nuevaClave(),
      datos: { companyId, memberId: m.id, rewardId, locationId: sucursal || null },
    });
  }

  async function crearCliente() {
    if (!alta) return;
    setOcupado(true);
    try {
      const r = await accion<{ public_code: string; card_token: string | null; replayed: boolean }>('miembro.crear', {
        companyId,
        alias: alta.alias,
        phone: alta.phone,
        verified: alta.verificado,
        creationKey: alta.clave,
        via: 'caja',
      });
      setAlta({ ...alta, creado: { code: r.public_code, token: r.card_token } });
      const lista = await accion<MiembroCaja[]>('caja.buscar', { companyId, q: r.public_code });
      if (lista[0]) elegir(lista[0]);
    } catch (e) {
      avisar(mensaje(e), 'error');
    } finally {
      setOcupado(false);
    }
  }

  const umbral = m?.threshold ?? 0;
  return (
    <div className="fz-caja">
      {activas.length > 0 && (
        <div className="fz-campo">
          <label className="field-label" htmlFor="suc">
            Sucursal
          </label>
          <select id="suc" className="select" value={sucursal} onChange={(e) => elegirSucursal(e.target.value)}>
            <option value="">— Elige la sucursal —</option>
            {activas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {ultimo && (
        <div className={`fz-panel-aviso ${ultimo.tono === 'ok' ? 'fz-panel-aviso--ok' : ''}`} role="status" aria-live="polite">
          <b>Última operación:</b> {ultimo.texto}
        </div>
      )}

      <div className="card" style={{ marginBottom: 14 }}>
        {camara && <video ref={video} className="fz-video" playsInline muted aria-label="Cámara para leer el QR" />}
        <div className="fz-fila" style={{ marginTop: camara ? 10 : 0 }}>
          <input
            className="input fz-input-gran"
            style={{ flex: 1 }}
            placeholder="VDM-XXXXXX o teléfono"
            value={q}
            autoCapitalize="characters"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void buscar()}
            aria-label="Código de la tarjeta o teléfono"
          />
        </div>
        <div className="fz-col2" style={{ marginTop: 10 }}>
          <button className="fz-gran fz-gran--ghost" onClick={() => void buscar()} disabled={buscando || !q.trim()}>
            <Search size={18} /> {buscando ? 'Buscando…' : 'Buscar'}
          </button>
          {escanerPosible ? (
            <button className="fz-gran fz-gran--ghost" onClick={() => setCamara((c) => !c)}>
              {camara ? <CameraOff size={18} /> : <Camera size={18} />} {camara ? 'Cerrar cámara' : 'Escanear QR'}
            </button>
          ) : (
            <button className="fz-gran fz-gran--ghost" onClick={() => setAlta({ alias: '', phone: '', verificado: false, clave: nuevaClave() })}>
              <Plus size={18} /> Nuevo cliente
            </button>
          )}
        </div>
        {!escanerPosible && <p className="fz-def">Este navegador no lee QR con la cámara (iPhone): escribe el código que sale bajo el QR.</p>}
        {escanerPosible && (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setAlta({ alias: '', phone: '', verificado: false, clave: nuevaClave() })}>
            <Plus size={14} /> Nuevo cliente
          </button>
        )}
      </div>

      {candidatos.length > 1 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <b>Hay {candidatos.length} tarjetas con ese teléfono</b>
          <p className="fz-def">Elige la de la persona que tienes delante. No se unen solas: pueden ser dos personas.</p>
          <ul className="fz-lista">
            {candidatos.map((c) => (
              <li key={c.id}>
                <span>
                  <span className="fz-mono">{c.public_code}</span> {c.alias ?? ''}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => elegir(c)}>
                  Elegir
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {alta && (
        <div className="card" style={{ marginBottom: 14 }}>
          {alta.creado ? (
            <>
              <b>Tarjeta creada: <span className="fz-mono">{alta.creado.code}</span></b>
              {alta.creado.token ? (
                <>
                  <p className="fz-def">Que la persona escanee este QR con su teléfono para abrir y guardar su tarjeta. Solo se enseña ahora.</p>
                  <Qr valor={urlTarjeta(alta.creado.token)} tam={220} />
                </>
              ) : (
                <p className="fz-def">Ya estaba creada. Para darle el enlace, ábrela en Clientes y pulsa «Nuevo enlace de tarjeta».</p>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => setAlta(null)}>
                Cerrar
              </button>
            </>
          ) : (
            <>
              <b>Nuevo cliente</b>
              <div className="fz-campo" style={{ marginTop: 10 }}>
                <label className="field-label">Nombre (opcional)</label>
                <input className="input" maxLength={40} value={alta.alias} onChange={(e) => setAlta({ ...alta, alias: e.target.value })} />
              </div>
              <div className="fz-campo">
                <label className="field-label">Teléfono (opcional)</label>
                <input className="input" inputMode="tel" placeholder="+51 9…" value={alta.phone} onChange={(e) => setAlta({ ...alta, phone: e.target.value })} />
                <small>Sirve para encontrarle en caja. Dos personas pueden dar el mismo: no se unen.</small>
              </div>
              {alta.phone.trim() && (
                <label className="check-inline" style={{ display: 'block', marginBottom: 12 }}>
                  <input type="checkbox" checked={alta.verificado} onChange={(e) => setAlta({ ...alta, verificado: e.target.checked })} /> He comprobado en persona que el teléfono es suyo
                </label>
              )}
              <div className="fz-fila">
                <button className="btn btn-primary" disabled={ocupado} onClick={() => void crearCliente()}>
                  Crear tarjeta
                </button>
                <button className="btn btn-ghost" onClick={() => setAlta(null)}>
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {m && (
        <div className="card">
          <div className="fz-miembro">
            <div>
              <div className="fz-mono" style={{ fontWeight: 800 }}>
                {m.public_code}
              </div>
              <div className="muted">{m.alias ?? 'Sin nombre'}</div>
              {m.status !== 'active' && <span className="badge-pill b-hot">Suspendida</span>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="fz-saldo">{m.balance.toLocaleString('es-PE')}</div>
              <div className="muted">{m.rule_type ? unidades(m.balance, m.rule_type).replace(/^[-\d.,\s]+/, '') : ''}</div>
            </div>
          </div>
          {umbral > 0 && (
            <>
              <div className="fz-barra">
                <i style={{ width: `${Math.max(0, Math.min(1, m.balance / umbral)) * 100}%` }} />
              </div>
              <p className="fz-def">
                Premio con {umbral}: {m.reward_description}
              </p>
            </>
          )}

          {m.status === 'active' && (
            <>
              {m.rule_type !== 'visits' && (
                <div className="fz-campo" style={{ marginTop: 12 }}>
                  <label className="field-label" htmlFor="imp">
                    Importe (S/){m.rule_type === 'stamps' ? ' — opcional si no hay compra mínima' : ''}
                  </label>
                  <input id="imp" className="input fz-input-gran" inputMode="decimal" placeholder="0,00" value={importe} onChange={(e) => setImporte(e.target.value)} />
                  {importe && aCentimos(importe) !== null && <small>{soles(aCentimos(importe))}</small>}
                </div>
              )}
              <div className="fz-campo">
                <label className="field-label" htmlFor="ref">
                  N.º de comprobante {ajustes?.require_external_ref ? '' : '(opcional)'}
                </label>
                <input id="ref" className="input" maxLength={64} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="B001-000123" />
                <small>Si se pone, la misma venta no se puede registrar dos veces.</small>
              </div>
              <div className="fz-col2">
                <button className="fz-gran fz-gran--prim" disabled={ocupado || (activas.length > 0 && !sucursal)} onClick={registrar}>
                  <ShoppingBag size={20} /> {m.rule_type === 'visits' ? 'Registrar visita' : 'Registrar compra'}
                </button>
                <button
                  className="fz-gran fz-gran--sec"
                  disabled={ocupado || m.rewards_available === 0 || (activas.length > 0 && !sucursal)}
                  onClick={() => canjear(m.rewards[0]?.id ?? null)}
                >
                  <Gift size={20} /> Canjear{m.rewards_available ? ` (${m.rewards_available})` : ''}
                </button>
              </div>
              {activas.length > 0 && !sucursal && <p className="fz-def">Elige la sucursal arriba para poder operar.</p>}
              {m.rewards.length > 1 && (
                <ul className="fz-lista" style={{ marginTop: 10 }}>
                  {m.rewards.map((r) => (
                    <li key={r.id}>
                      <span>{r.description}</span>
                      <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => canjear(r.id)}>
                        Canjear este
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {pendiente && !ocupado && (
            <div className="fz-panel-aviso fz-panel-aviso--error" role="alert" style={{ marginTop: 12 }}>
              <span style={{ flex: 1 }}>No llegó la confirmación de la última operación. Nada se ha dado por hecho.</span>
              <button className="btn btn-primary btn-sm" onClick={() => void enviar(pendiente)}>
                Reintentar
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPendiente(null)}>
                Descartar
              </button>
            </div>
          )}
          {puede('members.read') && (
            <Link className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} href={`/panel/fideliza/clientes/${m.id}`}>
              Ver ficha
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
