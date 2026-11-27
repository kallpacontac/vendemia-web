'use client';

/**
 * Lo que la tarjeta del cliente enseña aparte (sql/0028), en su propia llamada (`extras`):
 *
 *   · «Invita a un amigo»: su avance y el botón para mandar SU invitación por WhatsApp. La
 *     invitación (/n/<slug>/unirse?de=<código>) no abre esta tarjeta: solo dice quién invita.
 *   · «Guardar con Google»: para recuperarla si cambia de celular. Solo si el servidor tiene
 *     Google configurado. Dentro de Instagram/Facebook, Google no deja entrar: se avisa.
 *
 * Sin la 0028 (o apagado por el negocio), no pinta nada. Los nodos van sueltos (fragmento)
 * porque la tarjeta ordena sus cajas con `order` de flex (estilos/tarjeta.css).
 */
import { useEffect, useState } from 'react';
import { Check, Copy, Users } from 'lucide-react';

interface Amigos {
  codigo: string;
  cada: number;
  premio: string;
  regalo: boolean;
  invitados: number;
  vinieron: number;
  avance: number;
  ganados: number;
}
interface Extras {
  status: string;
  slug?: string;
  google?: boolean;
  google_disponible?: boolean;
  amigos?: Amigos | null;
}

/** Leído al cargar el módulo: la tarjeta limpia la URL y puede volver a montarse (ver Tarjeta.tsx). */
const GOOGLE_AL_CARGAR = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('google') : null;

const VUELTA: Record<string, { texto: string; bien: boolean }> = {
  ok: { texto: 'Listo: tu tarjeta quedó guardada con Google. Si cambias de celular, la recuperas desde la página del negocio.', bien: true },
  recuperada: { texto: '¡Recuperaste tu tarjeta! El enlace anterior ya no funciona: usa esta.', bien: true },
  cancelado: { texto: 'No se guardó con Google.', bien: false },
  error: { texto: 'No se pudo con Google. Inténtalo otra vez.', bien: false },
};

const dentroDeApp = () => typeof navigator !== 'undefined' && /Instagram|FBAN|FBAV|FB_IAB|Line\//.test(navigator.userAgent);
const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

export default function ExtrasTarjeta({ token, negocio, activa }: { token: string; negocio: string; activa: boolean }) {
  const [x, setX] = useState<Extras | null>(null);
  const [vuelta, setVuelta] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [enApp, setEnApp] = useState(false);

  useEffect(() => {
    setEnApp(dentroDeApp());
    if (GOOGLE_AL_CARGAR && VUELTA[GOOGLE_AL_CARGAR]) {
      setVuelta(GOOGLE_AL_CARGAR);
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete('google');
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
      } catch {
        /* sin limpiar: no pasa nada */
      }
    }
    let vivo = true;
    void fetch('/api/fideliza/publico/tarjeta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'extras', token }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Extras | null) => {
        if (vivo && j?.status === 'ok') setX(j);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [token]);

  async function guardarConGoogle() {
    setYendo(true);
    try {
      const r = await fetch('/api/fideliza/publico/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion: 'guardar', token }),
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && j.url) {
        window.location.href = j.url;
        return;
      }
      setVuelta('error');
    } catch {
      setVuelta('error');
    }
    setYendo(false);
  }

  const a = activa ? x?.amigos : null;
  const enlace = a && x?.slug ? `${window.location.origin}/n/${x.slug}/unirse?de=${a.codigo}` : '';
  const mensaje = a
    ? `¡Hola! Te invito al club de ${negocio}. Saca tu tarjeta con mi enlace${a.regalo ? ' y empiezas con 1 sello de regalo' : ''}: ${enlace}`
    : '';

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* el navegador no deja: queda el botón de WhatsApp */
    }
  }

  const faltan = a ? Math.max(a.cada - a.avance, 0) : 0;
  const enCamino = a ? Math.max(a.invitados - a.vinieron, 0) : 0;
  const v = vuelta ? VUELTA[vuelta] : null;

  return (
    <>
      {v && (
        <div className={`fz-caja ${v.bien ? 'fz-ok' : 'fz-alerta'}`} role="status">
          {v.texto}
        </div>
      )}

      {a && (
        <section className="fz-caja fz-caja--flujo fz-amigos" aria-label="Invita a un amigo">
          <p className="fz-amigos__titulo"><Users size={18} aria-hidden="true" /> Invita a un amigo</p>
          <p className="fz-nota">
            {a.invitados === 0
              ? <>Por cada {a.cada} {plural(a.cada, 'amigo que venga', 'amigos que vengan')} a {negocio}, ganas: <b>{a.premio}</b>.</>
              : <>Invitaste a {a.invitados} · {plural(a.vinieron, 'vino', 'vinieron')} {a.vinieron}. Te {plural(faltan, 'falta', 'faltan')} {faltan} para: <b>{a.premio}</b>.</>}
          </p>
          <div className="fz-amigos__cupos" role="img" aria-label={`${a.avance} de ${a.cada} amigos`}>
            {Array.from({ length: a.cada }, (_, i) =>
              i < a.avance ? <span key={i} className="vino">vino</span>
              : i < a.avance + enCamino ? <span key={i} className="espera">invitado</span>
              : <span key={i}>libre</span>,
            )}
          </div>
          <a className="fz-btn fz-amigos__wa" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer">
            Invitar por WhatsApp
          </a>
          <p className="fz-mini">
            Cuenta cuando tu amigo viene y le ponen su primer sello.{' '}
            <button type="button" className="fz-link" onClick={() => void copiar()}>
              {copiado ? <><Check size={13} aria-hidden="true" /> Enlace copiado</> : <><Copy size={13} aria-hidden="true" /> Copiar mi enlace</>}
            </button>
          </p>
        </section>
      )}

      {activa && x?.google_disponible && !x.google && (
        <section className="fz-caja fz-caja--flujo" aria-label="Guardar con Google">
          <p className="fz-nota"><b>¿Y si cambias de celular?</b> Guarda tu tarjeta con Google y la recuperas en cualquier teléfono. Solo te reconocemos: no vemos tu correo ni tus datos.</p>
          {enApp ? (
            <p className="fz-mini">Para usar Google, abre tu tarjeta en Chrome o Safari (menú ··· › Abrir en el navegador).</p>
          ) : (
            <button type="button" className="fz-btn fz-google-btn" onClick={() => void guardarConGoogle()} disabled={yendo}>
              {yendo ? 'Abriendo Google…' : 'Guardar con Google'}
            </button>
          )}
        </section>
      )}
      {activa && x?.google && vuelta !== 'ok' && (
        <p className="fz-mini fz-google-lista"><Check size={14} aria-hidden="true" /> Tu tarjeta está guardada con Google.</p>
      )}
    </>
  );
}
