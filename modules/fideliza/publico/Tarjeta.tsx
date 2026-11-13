'use client';

import { fotoEnCirculo } from '@/modules/fideliza/dominio/encuadre';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Gift, Sparkles } from 'lucide-react';
import { UNIDAD, fechaHora, type TipoRegla } from '@/modules/fideliza/dominio/formato';
import { colorValido, mezcla, resolverEstilo, tintaSobre, type Estilo } from '@/modules/fideliza/dominio/estilo';
import { urlNegocio } from '@/modules/fideliza/dominio/config';
import { selloValido, trazoSello } from '@/modules/fideliza/dominio/sellos';
import AvisoActivar from './AvisoActivar';
import AvisoInstalar, { type EventoInstalar } from './AvisoInstalar';
import { instalarGuardado, soltarInstalarGuardado } from '@/components/panel/Instalable';

export interface DatosTarjeta {
  status: 'ok' | 'not_found';
  member: { public_code: string; alias: string | null; status: string; balance: number; rewards_available: number; qr_token: string };
  brand: { slug: string; display_name: string; tagline: string; logo_url: string | null; bg_color: string; support_url: string | null; style?: Partial<Estilo> | null };
  /** Con period 'month' (0015) el saldo es el del mes y threshold/reward son el SIGUIENTE nivel. */
  program: { name: string; description: string; status: string; rule_type: TipoRegla | null; threshold: number | null; reward: string | null; period?: 'none' | 'month' } | null;
  rewards: { description: string; expires_at: string | null }[];
  movements: { kind: string; units: number; at: string }[];
  wallet: { state: string; pending: boolean; links_issued: number } | null;
  push: { consent: boolean; devices: number };
  contacts: { kind: 'phone' | 'email'; verified: boolean }[];
  /**
   * 0017: las líneas de la tarjeta, la principal primero (Kallpa: «Asistencia» y
   * «Compra»). Con una sola, la tarjeta es la de siempre.
   */
  lines?: {
    label: string;
    main: boolean;
    rule_type: TipoRegla | null;
    balance: number;
    threshold: number | null;
    reward: string | null;
    period: 'none' | 'month';
    rewards: { description: string; expires_at: string | null }[];
  }[];
}

const MOV: Record<string, string> = {
  earn: 'Acumulaste',
  reverse: 'Devolución',
  reward_issue: 'Premio conseguido',
  reward_revoke: 'Premio anulado',
  adjust: 'Corrección',
  period_reset: 'Empezó un mes nuevo',
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
  /** La pantalla de celebración: el premio cambió mientras la tarjeta estaba abierta. */
  const [fiesta, setFiesta] = useState<null | { tipo: 'ganado' | 'canjeado'; premio: string }>(null);
  const ultimo = useRef(props.inicial);
  const [enLinea, setEnLinea] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [walletGuardada, setWalletGuardada] = useState(false);
  const [walletVerificada, setWalletVerificada] = useState(false);
  const comprobandoWallet = useRef(false);
  const volviendoDeWallet = useRef(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [plataforma, setPlataforma] = useState<'ios' | 'android' | 'otra'>('otra');
  const [pushPosible, setPushPosible] = useState(false);
  const [quiereAvisos, setQuiereAvisos] = useState(false);
  const [permisoAvisos, setPermisoAvisos] = useState<NotificationPermission>('default');
  // Mientras se ofrece activar los avisos no sale el de instalar: uno por visita.
  const [cederInstalar, setCederInstalar] = useState(false);
  const [alias, setAlias] = useState(props.inicial.member.alias ?? '');
  const [borrado, setBorrado] = useState(false);
  // El «Instalar» de Android llega una sola vez al cargar: se guarda para el aviso y el botón.
  const [instalar, setInstalar] = useState<EventoInstalar | null>(null);
  const [avisoVisible, setAvisoVisible] = useState(false);
  const soltarInstalar = useCallback(() => {
    soltarInstalarGuardado(); // El aviso de Chrome sirve una sola vez.
    setInstalar(null);
  }, []);
  // Abierta desde el icono (ya instalada): no se vuelve a explicar cómo instalarla.
  const [enApp, setEnApp] = useState(false);

  const tipo = d.program?.rule_type ?? 'stamps';
  const umbral = d.program?.threshold ?? 0;
  const progreso = umbral ? Math.max(0, Math.min(d.member.balance, umbral)) : 0;
  const sellos = tipo === 'stamps' && umbral > 0 && umbral <= 12;
  // 0017: las demás líneas (la principal es la tarjeta de arriba) y todos los premios por canjear.
  const otras = d.lines && d.lines.length > 1 ? d.lines.filter((l) => !l.main) : [];
  const premios = [...d.rewards, ...otras.flatMap((l) => l.rewards)];

  useEffect(() => {
    if (!props.walletDisponible) return;
    const comprobar = async () => {
      if (comprobandoWallet.current) return;
      comprobandoWallet.current = true;
      try {
        const r = await pedir<{ guardada: boolean }>({ accion: 'wallet_estado', token });
        setWalletGuardada(r.guardada);
        if (r.guardada) volviendoDeWallet.current = false;
      } catch {
        // Si Google no responde, conservamos el botón y no afirmamos que se guardó.
      } finally {
        setWalletVerificada(true);
        setOcupado((actual) => actual === 'wallet' ? null : actual);
        comprobandoWallet.current = false;
      }
    };
    let segundoIntento: number | undefined;
    const alVolver = () => {
      void comprobar();
      if (volviendoDeWallet.current) {
        window.clearTimeout(segundoIntento);
        segundoIntento = window.setTimeout(() => { if (volviendoDeWallet.current) void comprobar(); }, 2800);
      }
    };
    const alVisibilizar = () => { if (document.visibilityState === 'visible') alVolver(); };
    void comprobar();
    window.addEventListener('pageshow', alVolver);
    document.addEventListener('visibilitychange', alVisibilizar);
    return () => {
      window.removeEventListener('pageshow', alVolver);
      document.removeEventListener('visibilitychange', alVisibilizar);
      window.clearTimeout(segundoIntento);
    };
  }, [token, props.walletDisponible]);

  /**
   * Con la tarjeta abierta en el mostrador, lo que hace el empleado se ve solo:
   * se relee cada 12 s (y al volver a la pestaña). Si baja el número de premios
   * y no fue por vencimiento ni por una devolución (que devuelve las unidades),
   * es que se canjeó; si sube, lo acaba de ganar.
   */
  useEffect(() => {
    const leer = async () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      try {
        const r = await pedir<DatosTarjeta>({ accion: 'ver', token });
        if (r.status !== 'ok') return;
        const antes = ultimo.current;
        ultimo.current = r;
        setD(r);
        setLeido(new Date().toISOString());
        if (r.rewards.length > antes.rewards.length) {
          // El más nuevo va al final (orden de emisión).
          setFiesta({ tipo: 'ganado', premio: r.rewards[r.rewards.length - 1]?.description ?? r.program?.reward ?? 'Tu premio' });
        } else if (r.rewards.length < antes.rewards.length && r.member.balance <= antes.member.balance) {
          const ido = antes.rewards.find((x) => !r.rewards.some((y) => y.description === x.description && y.expires_at === x.expires_at)) ?? antes.rewards[0];
          const vencio = ido?.expires_at && new Date(ido.expires_at).getTime() <= Date.now();
          if (!vencio) setFiesta({ tipo: 'canjeado', premio: ido?.description ?? 'Tu premio' });
        } else return;
        navigator.vibrate?.(200);
      } catch {
        /* sin respuesta: se reintenta en la siguiente vuelta */
      }
    };
    const reloj = window.setInterval(() => void leer(), 12_000);
    const alVisibilizar = () => {
      if (document.visibilityState !== 'visible') return;
      void leer();
      // Puede volver de los ajustes del teléfono con el permiso cambiado.
      if ('Notification' in window) setPermisoAvisos(Notification.permission);
    };
    document.addEventListener('visibilitychange', alVisibilizar);
    return () => {
      window.clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVisibilizar);
    };
  }, [token]);

  useEffect(() => {
    const ua = navigator.userAgent;
    setPlataforma(/iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'otra');
    setPushPosible(Boolean(props.vapid) && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
    if ('Notification' in window) setPermisoAvisos(Notification.permission);
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
    setEnApp(
      window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    );
    // El aviso de Chrome lo guarda el script del <head> (app/layout.tsx) aunque
    // llegue antes de montar; aquí se recoge, ahora y cuando cambie.
    const alPoder = () => setInstalar(instalarGuardado<EventoInstalar>());
    alPoder();
    window.addEventListener('vm:instalar', alPoder);
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    setEnLinea(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('vm:instalar', alPoder);
    };
  }, [token, props.vapid, props.inicial.brand.slug]);

  async function actualizar() {
    setOcupado('ver');
    try {
      const r = await pedir<DatosTarjeta>({ accion: 'ver', token });
      if (r.status === 'ok') {
        ultimo.current = r;
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
      volviendoDeWallet.current = true;
      location.href = r.url;
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo preparar la tarjeta de Google Wallet.');
      setOcupado(null);
    }
  }

  /** `textVersion`: qué texto aceptó, el de la casilla o el del aviso de abajo. */
  async function activarAvisos(textVersion = 'push-v1') {
    if (!props.vapid) return;
    setOcupado('push');
    setAviso(null);
    try {
      const permiso = await Notification.requestPermission();
      setPermisoAvisos(permiso);
      if (permiso !== 'granted') {
        setAviso('No diste permiso de notificaciones. Tu tarjeta funciona igual.');
        return;
      }
      await pedir({ accion: 'consentimiento', token, granted: true, textVersion });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(props.vapid) });
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await pedir({ accion: 'push', token, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
      await actualizar();
      // Como el aviso de prueba del panel: lo ve al momento y sabe que funciona. Solo en este teléfono.
      await reg
        .showNotification('¡Avisos activados!', {
          body: `Te avisaremos cuando ganes o canjees un premio de ${d.brand.display_name}.`,
          icon: d.brand.logo_url ?? '/wallet/logo-vendemia-1024.png',
        })
        .catch(() => {});
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

  // Lo de instalar va en el aviso de abajo; la caja lo repite solo si el aviso no está a la vista.
  const conWallet = plataforma !== 'ios' && props.walletDisponible && (walletVerificada || !d.wallet?.links_issued);
  // Sin el permiso del teléfono no llega nada, aunque la base diga que sí los quiere.
  const avisosActivos = d.push.consent && d.push.devices > 0 && permisoAvisos === 'granted';
  const respaldoIos = plataforma === 'ios' && !enApp && !avisoVisible;
  const respaldoInstalar = plataforma !== 'ios' && !enApp && instalar !== null && !avisoVisible;
  const notaFavoritos = plataforma === 'otra' && !props.walletDisponible && !enApp;

  const marca = colorValido(d.brand.bg_color);
  const plantilla = resolverEstilo(d.brand.style);
  const sello = selloValido(d.brand.style?.sello);
  const fondoOscuro = plantilla.plantilla === 'oscura' || plantilla.plantilla === 'vidrio' || plantilla.plantilla === 'foto';
  const fondo = fondoOscuro ? mezcla(marca, '#101014', .87) : plantilla.plantilla === 'color' ? mezcla(marca, '#FFFFFF', .86) : '#F9F9F6';
  const estilo = {
    '--marca': marca,
    '--sobre-marca': tintaSobre(marca),
    '--fondo': fondo,
    '--superficie': fondoOscuro ? '#252428' : '#FFFFFF',
    '--tinta': fondoOscuro ? '#FFFFFF' : '#171716',
    '--suave': fondoOscuro ? '#C7C5C6' : '#666661',
    '--borde': fondoOscuro ? '#48464B' : '#E9E8E4',
  } as React.CSSProperties;

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
    <main className="fz" style={estilo} data-plantilla={plantilla.plantilla} data-tarjeta={plantilla.tarjeta}>
      <header className="fz-cab">
        <div className="fz-cab__marca">
          {d.brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="fz-logo" src={fotoEnCirculo(d.brand.logo_url)} alt="" width={48} height={48} />
          ) : <span className="fz-logo fz-logo--letra" aria-hidden="true">{d.brand.display_name.slice(0, 1).toUpperCase()}</span>}
          <div><h1>{d.brand.display_name}</h1><p>{d.brand.tagline || 'Tu programa de fidelidad'}</p></div>
        </div>
        <span className="fz-cab__etiqueta">Mi tarjeta</span>
      </header>

      {nueva && (
        <div className="fz-caja fz-ok" role="status">
          <span className="fz-ok__icono"><Check aria-hidden="true" /></span>
          <div><b>¡Ya eres parte de {d.brand.display_name}!</b><p>Tu tarjeta está lista. Muéstrala en caja para empezar a sumar {UNIDAD[tipo].varias}.</p></div>
          <Sparkles className="fz-ok__brillo" aria-hidden="true" />
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

      {d.member.status === 'active' && !walletGuardada && (conWallet || respaldoIos || respaldoInstalar || notaFavoritos) && (
        <section className="fz-caja fz-caja--flujo fz-wallet-caja" aria-label="Guardar la tarjeta">
          {conWallet && (
            <>
              <div>
                <p className="fz-grande">Lleva tu tarjeta siempre contigo</p>
                <p className="fz-nota">Agrégala a tu teléfono para encontrarla rápido cuando visites el local.</p>
              </div>
              <button
                type="button"
                className="fz-wallet"
                onClick={() => void wallet()}
                disabled={ocupado === 'wallet'}
                aria-label="Agregar a Google Wallet"
              >
                {ocupado === 'wallet' ? 'Preparando…' : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/wallet/es419_add_to_google_wallet_wallet-button.svg" alt="" width={378} height={50} />
                )}
              </button>
              {d.wallet?.state === 'error' && <p className="fz-nota">Estamos actualizando tu tarjeta de Google Wallet. Tu saldo de aquí es el bueno.</p>}
              {props.walletDemo && (
                <p className="fz-mini">Google Wallet está en pruebas: por ahora solo funciona con cuentas de prueba autorizadas.</p>
              )}
            </>
          )}
          {respaldoIos && (
            <p className="fz-nota">
              <b>Guárdala en tu iPhone:</b> pulsa <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>. Tu tarjeta quedará como una app
              {props.vapid ? ' y, desde ahí, podrás recibir avisos de tus premios' : ''}.
            </p>
          )}
          {respaldoInstalar && instalar && (
            <button
              type="button"
              className="fz-btn"
              onClick={() => void instalar.prompt().finally(soltarInstalar)}
            >
              Instalar mi tarjeta como app
            </button>
          )}
          {notaFavoritos && (
            <p className="fz-nota">Guarda esta página en tus favoritos o en la pantalla de inicio.</p>
          )}
        </section>
      )}
      {walletGuardada && <div className="fz-caja fz-wallet-lista" role="status"><Check aria-hidden="true" /><span>Tu tarjeta ya está en Google Wallet.</span></div>}

      <section className="fz-caja fz-centro" aria-label="Tu tarjeta">
        <div className={premios.length > 0 ? 'fz-aura' : undefined}>
        {premios.length > 0 && (
          <div className="fz-gano" role="status">
            <span className="fz-gano__icono"><Gift aria-hidden="true" /></span>
            <small>{premios.length > 1 ? `¡Tienes ${premios.length} premios!` : '¡Ganaste un premio!'}</small>
            {premios.map((r, i) => (
              <b key={i}>
                {r.description}
                {r.expires_at && <em>Vence el {fechaHora(r.expires_at)}</em>}
              </b>
            ))}
            <p>Muestra tu código al personal para canjearlo.</p>
          </div>
        )}
        <div className="fz-carnet">
          {plantilla.fondo && <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="fz-carnet__foto" src={plantilla.fondo} alt="" />
          </>}
          <div className="fz-carnet__contenido">
            <div className="fz-carnet__arriba">
              <span className="fz-carnet__marca">
                {d.brand.logo_url ? <img src={fotoEnCirculo(d.brand.logo_url)} alt="" /> : <i aria-hidden="true">{d.brand.display_name.slice(0, 1).toUpperCase()}</i>}
                <b>{d.brand.display_name}</b>
              </span>
              <span>FIDELIDAD</span>
            </div>
            <div className="fz-carnet__programa">
              {d.program?.name || 'Tu programa'}
              {otras.length > 0 && d.lines?.[0] && <> · {d.lines[0].label}</>}
            </div>
            <div className="fz-carnet__saludo">{d.member.alias ? `Hola, ${d.member.alias}` : 'Tu tarjeta'}</div>
            <div className="fz-carnet__saldo"><b>{d.member.balance.toLocaleString('es-PE')}</b><span>{d.member.balance === 1 ? UNIDAD[tipo].una : UNIDAD[tipo].varias}</span></div>
            {sellos ? (
              <div className="fz-sellos" role="img" aria-label={`${progreso} de ${umbral} sellos`}>
                {Array.from({ length: umbral }, (_, i) => <span key={i} className={i < progreso ? 'fz-sello fz-sello--lleno' : 'fz-sello'}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: trazoSello(i === umbral - 1 ? 'regalo' : sello) }} /></span>)}
              </div>
            ) : umbral > 0 ? (
              <div className="fz-barra" role="progressbar" aria-label={`Progreso de ${UNIDAD[tipo].varias}`} aria-valuemin={0} aria-valuemax={umbral} aria-valuenow={progreso}>
                <i style={{ width: `${(progreso / umbral) * 100}%` }} />
              </div>
            ) : null}
            {umbral > 0 && (
              <p className="fz-carnet__meta">
                {d.program?.period === 'month'
                  ? `${progreso} de ${umbral} ${UNIDAD[tipo].varias} este mes para tu siguiente nivel`
                  : `${progreso} de ${umbral} ${UNIDAD[tipo].varias} para tu ${d.rewards.length > 0 ? 'siguiente' : 'próximo'} premio`}
              </p>
            )}
            <div className="fz-carnet__qr">
              <div className="fz-qr" aria-label="Código QR para mostrar en caja" dangerouslySetInnerHTML={{ __html: props.qrSvg }} />
              <span>{d.member.public_code}</span>
            </div>
          </div>
        </div>
        </div>
        {d.program?.reward && (d.rewards.length === 0 || d.program.period === 'month') && (
          <div className="fz-meta-premio">
            <Gift aria-hidden="true" />
            <span>
              {d.program.period === 'month'
                ? d.member.balance >= umbral && umbral > 0 ? 'Llegaste al nivel más alto del mes' : 'Tu siguiente nivel este mes'
                : d.member.balance >= umbral && umbral > 0 ? 'Premio alcanzado' : 'Tu próximo premio'}
              <b>{d.program.reward}</b>
            </span>
          </div>
        )}
        {otras.map((l, i) => {
          const meta = l.threshold ?? 0;
          const va = meta ? Math.max(0, Math.min(l.balance, meta)) : l.balance;
          return (
            <div key={i} className="fz-linea-tarjeta" aria-label={`${l.label}: ${va} de ${meta}`}>
              <div className="fz-linea-tarjeta__cab">
                <b>{l.label}</b>
                <span>
                  {va} de {meta || '—'}
                  {l.period === 'month' ? ' este mes' : ''}
                </span>
              </div>
              {meta > 0 && (
                <div className="fz-barra" role="progressbar" aria-valuemin={0} aria-valuemax={meta} aria-valuenow={va}>
                  <i style={{ width: `${(va / meta) * 100}%` }} />
                </div>
              )}
              {l.reward && (
                <small>
                  {l.period === 'month' ? 'Siguiente nivel: ' : `Con ${meta}: `}
                  <b>{l.reward}</b>
                </small>
              )}
            </div>
          );
        })}
        <p className="fz-nota">{premios.length > 0 ? 'Enséñalo en caja para canjear tu premio o seguir sumando.' : 'Enséñalo en caja para acumular o canjear.'}</p>
        <p className="fz-mini">
          Leído el {fechaHora(leido)} ·{' '}
          <button type="button" className="fz-link" onClick={() => void actualizar()} disabled={ocupado === 'ver'}>
            {ocupado === 'ver' ? 'Actualizando…' : 'Actualizar'}
          </button>
        </p>
      </section>
      <a className="fz-volver" href={urlNegocio(d.brand.slug)}><ArrowLeft size={18} aria-hidden="true" /> Volver a la página de enlaces</a>

      {pushPosible && d.member.status === 'active' && (
        <section className="fz-caja fz-caja--flujo" aria-label="Avisos">
          {avisosActivos ? (
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

      {fiesta && (
        <div className={`fz-fiesta fz-fiesta--${fiesta.tipo}`} role="alertdialog" aria-modal="true" aria-labelledby="fz-fiesta-t">
          <div className="fz-fiesta__caja">
            <span className="fz-fiesta__icono">{fiesta.tipo === 'canjeado' ? <Check aria-hidden="true" /> : <Gift aria-hidden="true" />}</span>
            <h2 id="fz-fiesta-t">{fiesta.tipo === 'canjeado' ? '¡Premio canjeado!' : '¡Ganaste un premio!'}</h2>
            <b>{fiesta.premio}</b>
            <p>{fiesta.tipo === 'canjeado' ? `Gracias por venir a ${d.brand.display_name}. ¡Disfrútalo!` : 'Muestra tu código al personal para canjearlo, ahora o en tu próxima visita.'}</p>
            <button type="button" className="fz-fiesta__ok" onClick={() => setFiesta(null)}>{fiesta.tipo === 'canjeado' ? 'Genial' : 'Ver mi tarjeta'}</button>
          </div>
        </div>
      )}

      {pushPosible && d.member.status === 'active' && !avisosActivos && (
        <AvisoActivar
          slug={d.brand.slug}
          negocio={d.brand.display_name}
          enApp={enApp}
          permiso={permisoAvisos}
          ocupado={ocupado === 'push'}
          activar={() => activarAvisos('push-aviso-v1')}
          alOcupar={setCederInstalar}
          instalarVisible={avisoVisible}
        />
      )}

      {d.member.status === 'active' && !cederInstalar && (
        <AvisoInstalar
          slug={d.brand.slug}
          plataforma={plataforma}
          enApp={enApp}
          instalar={instalar}
          conAvisos={Boolean(props.vapid)}
          alCambiar={setAvisoVisible}
          alUsarInstalar={soltarInstalar}
        />
      )}
    </main>
  );
}
