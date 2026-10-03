'use client';

import { useEffect, useState } from 'react';
import { UNIDAD, fechaHora, type TipoRegla } from '@/modules/fideliza/dominio/formato';

export interface DatosTarjeta {
  status: 'ok' | 'not_found';
  member: { public_code: string; alias: string | null; status: string; balance: number; rewards_available: number; qr_token: string };
  brand: { slug: string; display_name: string; tagline: string; logo_url: string | null; bg_color: string; support_url: string | null };
  program: { name: string; description: string; status: string; rule_type: TipoRegla | null; threshold: number | null; reward: string | null } | null;
  rewards: { description: string; expires_at: string | null }[];
  movements: { kind: string; units: number; at: string }[];
  wallet: { state: string; pending: boolean; links_issued: number } | null;
  push: { consent: boolean; devices: number };
  contacts: { kind: 'phone' | 'email'; verified: boolean }[];
}

const MOV: Record<string, string> = {
  earn: 'Acumulaste',
  reverse: 'Devolución',
  reward_issue: 'Premio conseguido',
  reward_revoke: 'Premio anulado',
  adjust: 'Corrección',
};

async function pedir<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/fideliza/publico/tarjeta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? 'No se pudo completar.');
  return j as T;
}

const b64 = (s: string) => {
  const p = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
};

export default function Tarjeta(props: {
  token: string;
  inicial: DatosTarjeta;
  leidoEn: string;
  qrSvg: string;
  vapid: string | null;
  walletDisponible: boolean;
  walletDemo: boolean;
}) {
  const { token } = props;
  const [d, setD] = useState(props.inicial);
  const [leido, setLeido] = useState(props.leidoEn);
  const [enLinea, setEnLinea] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [plataforma, setPlataforma] = useState<'ios' | 'android' | 'otra'>('otra');
  const [pushPosible, setPushPosible] = useState(false);
  const [quiereAvisos, setQuiereAvisos] = useState(false);
  const [alias, setAlias] = useState(props.inicial.member.alias ?? '');
  const [borrado, setBorrado] = useState(false);

  const tipo = d.program?.rule_type ?? 'stamps';
  const umbral = d.program?.threshold ?? 0;
  const progreso = umbral ? Math.max(0, Math.min(d.member.balance, umbral)) : 0;

  useEffect(() => {
    const ua = navigator.userAgent;
    setPlataforma(/iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'otra');
    setPushPosible(Boolean(props.vapid) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    try {
      localStorage.setItem(`fz:card:${props.inicial.brand.slug}`, token);
    } catch {
      /* sin almacenamiento: la tarjeta sigue funcionando por su enlace */
    }
    const url = new URL(location.href);
    if (url.searchParams.get('nueva')) setNueva(true);
    const campana = url.searchParams.get('c');
    if (campana && /^[0-9a-f-]{36}$/.test(campana)) void pedir({ accion: 'clic', token, campaignId: campana }).catch(() => {});
    if (url.search) history.replaceState(null, '', url.pathname);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/m/sw.js', { scope: '/m/' })
        .then((reg) => (reg.active ?? reg.waiting ?? reg.installing)?.postMessage({ tipo: 'tarjeta', url: url.pathname }))
        .catch(() => {});
    }
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    setEnLinea(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [token, props.vapid, props.inicial.brand.slug]);

  async function actualizar() {
    setOcupado('ver');
    try {
      const r = await pedir<DatosTarjeta>({ accion: 'ver', token });
      if (r.status === 'ok') {
        setD(r);
        setLeido(new Date().toISOString());
        setAviso(null);
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo actualizar.');
    } finally {
      setOcupado(null);
    }
  }

  async function wallet() {
    setOcupado('wallet');
    setAviso(null);
    try {
      const r = await pedir<{ url: string }>({ accion: 'wallet', token });
      location.href = r.url;
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo preparar la tarjeta de Google Wallet.');
      setOcupado(null);
    }
  }

  async function activarAvisos() {
    if (!props.vapid) return;
    setOcupado('push');
    setAviso(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setAviso('No diste permiso de notificaciones. Tu tarjeta funciona igual.');
        return;
      }
      await pedir({ accion: 'consentimiento', token, granted: true, textVersion: 'push-v1' });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(props.vapid) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await pedir({ accion: 'push', token, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      await actualizar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudieron activar los avisos.');
    } finally {
      setOcupado(null);
    }
  }

  async function quitarAvisos() {
    setOcupado('push');
    try {
      await pedir({ accion: 'consentimiento', token, granted: false, textVersion: 'push-v1' });
      const reg = await navigator.serviceWorker?.getRegistration('/m/');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await actualizar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      setOcupado(null);
    }
  }

  async function guardarAlias() {
    setOcupado('alias');
    try {
      await pedir({ accion: 'alias', token, alias });
      await actualizar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setOcupado(null);
    }
  }

  async function borrar() {
    if (!window.confirm('Se borrarán tu nombre, tus datos de contacto y tus avisos, y esta tarjeta dejará de funcionar. Tus premios sin canjear se pierden. ¿Continuar?')) return;
    setOcupado('borrar');
    try {
      await pedir({ accion: 'borrar', token, confirmo: true });
      try {
        localStorage.removeItem(`fz:card:${d.brand.slug}`);
      } catch {
        /* nada */
      }
      setBorrado(true);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo borrar.');
    } finally {
      setOcupado(null);
    }
  }

  const estilo = { '--marca': /^#[0-9A-Fa-f]{6}$/.test(d.brand.bg_color) ? d.brand.bg_color : '#FF4900' } as React.CSSProperties;

  if (borrado) {
    return (
      <main className="fz" style={estilo}>
        <div className="fz-caja" role="status">
          <p className="fz-grande">Tus datos se borraron.</p>
          <p className="fz-nota">Esta tarjeta ya no funciona. Si vuelves, puedes crear una nueva.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="fz" style={estilo}>
      <header className="fz-cab">
        {d.brand.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="fz-logo" src={d.brand.logo_url} alt="" width={72} height={72} />
        )}
        <h1>{d.brand.display_name}</h1>
        {d.program && <p>{d.program.name}</p>}
      </header>

      {nueva && (
        <div className="fz-caja fz-ok" role="status">
          <b>¡Listo! Tu tarjeta está creada.</b> Guárdala en tu teléfono para no perderla.
        </div>
      )}
      {!enLinea && (
        <div className="fz-caja fz-alerta" role="alert">
          Sin conexión. Lo que ves se leyó el {fechaHora(leido)} y puede no estar al día.
        </div>
      )}
      {d.member.status !== 'active' && (
        <div className="fz-caja fz-alerta" role="alert">
          Esta tarjeta está suspendida. Pregunta en el local.
        </div>
      )}
      {aviso && (
        <div className="fz-caja fz-alerta" role="alert">
          {aviso}
        </div>
      )}

      <section className="fz-caja fz-centro" aria-label="Tu tarjeta">
        {d.member.alias && <p className="fz-nota">Hola, {d.member.alias}</p>}
        <p className="fz-saldo">
          {d.member.balance.toLocaleString('es-PE')} <span>{UNIDAD[tipo].varias}</span>
        </p>
        {umbral > 0 && (
          <>
            <div className="fz-barra" role="progressbar" aria-valuemin={0} aria-valuemax={umbral} aria-valuenow={progreso}>
              <i style={{ width: `${(progreso / umbral) * 100}%` }} />
            </div>
            <p className="fz-nota">
              {d.member.balance >= umbral
                ? 'Premio a punto de salir'
                : `Te faltan ${(umbral - d.member.balance).toLocaleString('es-PE')} para: ${d.program?.reward}`}
            </p>
          </>
        )}
        {d.rewards.length > 0 && (
          <div className="fz-premio">
            <b>
              Tienes {d.rewards.length} premio{d.rewards.length > 1 ? 's' : ''} para canjear
            </b>
            {d.rewards.map((r, i) => (
              <p key={i}>
                {r.description}
                {r.expires_at ? ` · vence el ${fechaHora(r.expires_at)}` : ''}
              </p>
            ))}
          </div>
        )}
        <div className="fz-qr" aria-label="Código QR para mostrar en caja" dangerouslySetInnerHTML={{ __html: props.qrSvg }} />
        <p className="fz-codigo">{d.member.public_code}</p>
        <p className="fz-nota">Enséñalo en caja para acumular o canjear.</p>
        <p className="fz-mini">
          Leído el {fechaHora(leido)} ·{' '}
          <button type="button" className="fz-link" onClick={() => void actualizar()} disabled={ocupado === 'ver'}>
            {ocupado === 'ver' ? 'Actualizando…' : 'Actualizar'}
          </button>
        </p>
      </section>

      {d.member.status === 'active' && (
        <section className="fz-caja" aria-label="Guardar la tarjeta">
          {plataforma !== 'ios' && props.walletDisponible && (
            <>
              <button
                type="button"
                className="fz-wallet"
                onClick={() => void wallet()}
                disabled={ocupado === 'wallet'}
                aria-label="Agregar a Google Wallet"
              >
                {/* Recurso oficial de Google, sin modificar (public/wallet). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/wallet/es419_add_to_google_wallet_wallet-button.svg" alt="Agregar a Google Wallet" height={50} />
              </button>
              {d.wallet && (
                <p className="fz-nota">
                  {d.wallet.state === 'error'
                    ? 'Estamos actualizando tu tarjeta de Google Wallet. Tu saldo de aquí es el bueno.'
                    : d.wallet.pending
                      ? 'Tu tarjeta de Google Wallet se está poniendo al día.'
                      : 'Tu tarjeta de Google Wallet está al día.'}
                </p>
              )}
              {props.walletDemo && (
                <p className="fz-mini">Google Wallet está en pruebas: por ahora solo funciona con cuentas de prueba autorizadas.</p>
              )}
            </>
          )}
          {plataforma === 'ios' && (
            <p className="fz-nota">
              <b>En iPhone:</b> pulsa <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>. Tu tarjeta quedará como una app.
            </p>
          )}
          {plataforma === 'otra' && !props.walletDisponible && (
            <p className="fz-nota">Guarda esta página en tus favoritos o en la pantalla de inicio.</p>
          )}
        </section>
      )}

      {pushPosible && d.member.status === 'active' && (
        <section className="fz-caja" aria-label="Avisos">
          {d.push.consent && d.push.devices > 0 ? (
            <>
              <p className="fz-nota">Recibes avisos de {d.brand.display_name} en este teléfono.</p>
              <button type="button" className="fz-btn" onClick={() => void quitarAvisos()} disabled={ocupado === 'push'}>
                Dejar de recibir avisos
              </button>
            </>
          ) : (
            <>
              <label className="fz-check">
                <input type="checkbox" checked={quiereAvisos} onChange={(e) => setQuiereAvisos(e.target.checked)} />
                Quiero que {d.brand.display_name} me avise de mis premios y promociones. Puedo darme de baja cuando quiera.
              </label>
              <button
                type="button"
                className="fz-btn"
                onClick={() => void activarAvisos()}
                disabled={!quiereAvisos || ocupado === 'push'}
              >
                Activar avisos
              </button>
              <p className="fz-mini">Opcional. Sin avisos sigues acumulando y canjeando igual.</p>
            </>
          )}
        </section>
      )}

      {d.movements.length > 0 && (
        <section className="fz-caja" aria-label="Últimos movimientos">
          <h2>Últimos movimientos</h2>
          <ul className="fz-movs">
            {d.movements.map((m, i) => (
              <li key={i}>
                <span>{MOV[m.kind] ?? m.kind}</span>
                <span className="fz-nota">{fechaHora(m.at)}</span>
                <b>{m.units > 0 ? `+${m.units}` : m.units}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="fz-caja">
        <summary>Mis datos</summary>
        <label className="fz-label" htmlFor="alias">
          Tu nombre en la tarjeta
        </label>
        <input id="alias" className="fz-input" maxLength={40} value={alias} onChange={(e) => setAlias(e.target.value)} />
        <button type="button" className="fz-btn" onClick={() => void guardarAlias()} disabled={ocupado === 'alias'}>
          Guardar nombre
        </button>
        <p className="fz-nota">
          ¿Cambias de teléfono? Pide en el local que te den un enlace nuevo: comprobarán que eres tú en persona.
          {d.contacts.some((c) => c.verified) ? ' Tu contacto ya está verificado.' : ''}
        </p>
        <button type="button" className="fz-btn fz-peligro" onClick={() => void borrar()} disabled={ocupado === 'borrar'}>
          Borrar mis datos y esta tarjeta
        </button>
      </details>
    </main>
  );
}
