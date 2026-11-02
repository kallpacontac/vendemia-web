'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL AVISO DE ABAJO · activar los avisos de la tarjeta
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Los avisos son PERSONALES: la suscripción queda atada a esta tarjeta y a este
 * teléfono (loyalty_push_subscriptions.member_id). «Ganaste» y «canjeado» le
 * llegan solo a este cliente, ni al resto de clientes ni al equipo del negocio.
 *
 * Ningún navegador deja activarlos solos: el permiso exige un toque, y en iPhone
 * además la app instalada. Por eso se ofrece este botón, en este orden:
 *
 *   · En el navegador, primero se ofrece INSTALAR: si ese aviso está en pantalla,
 *     este no sale en esa visita.
 *   · Sale justo después de instalar y la primera vez que se abre desde el icono.
 *   · «Ahora no» descansa 1, 3 y 7 días, y desde ahí 14. No deja de volver.
 *   · Si el permiso está bloqueado, el navegador ya no lo vuelve a pedir: se
 *     explica dónde quitar el bloqueo.
 *   · Mientras está este aviso no sale el de instalar: uno a la vez. En iPhone no
 *     hay conflicto, sin instalar no llega a montarse.
 *
 * La memoria es por negocio, como la de AvisoInstalar.
 *
 * Para probarlo: `?avisos=1` olvida lo recordado y `?avisos=bloqueado` enseña esa
 * variante. Con `?app=` (AvisoInstalar) no sale, para no taparle la prueba.
 */
import { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';

const DIA = 24 * 3600 * 1000;
const DESCANSOS = [1, 3, 7, 14];

interface Memoria {
  veces: number;
  hasta: number;
  /** Ya salió la primera vez abierta desde el icono. */
  enApp?: boolean;
}

const clave = (slug: string) => `fz:aviso-activar:${slug}`;
function leer(slug: string): Memoria {
  try {
    return { veces: 0, hasta: 0, ...JSON.parse(localStorage.getItem(clave(slug)) ?? '{}') };
  } catch {
    return { veces: 0, hasta: 0 };
  }
}
function escribir(slug: string, m: Memoria) {
  try {
    localStorage.setItem(clave(slug), JSON.stringify(m));
  } catch {
    /* ventana privada: solo dura esta visita */
  }
}

// Se lee al cargar, antes de que Tarjeta limpie la URL.
const PARAMS = typeof window === 'undefined' ? null : new URLSearchParams(location.search);
const FORZADO = PARAMS?.get('avisos') ?? null;
const PROBANDO_INSTALAR = PARAMS?.has('app') ?? false;

export default function AvisoActivar(props: {
  slug: string;
  negocio: string;
  enApp: boolean;
  permiso: NotificationPermission;
  ocupado: boolean;
  activar: () => Promise<void>;
  alOcupar: (ocupa: boolean) => void;
  /** El aviso de instalar está en pantalla: tiene prioridad en el navegador. */
  instalarVisible: boolean;
}) {
  const { slug, enApp, alOcupar } = props;
  const [visible, setVisible] = useState(false);
  const bloqueado = props.permiso === 'denied' || FORZADO === 'bloqueado';
  const instalando = useRef(props.instalarVisible);
  instalando.current = props.instalarVisible;

  useEffect(() => {
    if (PROBANDO_INSTALAR) return;
    if (FORZADO === '1') escribir(slug, { veces: 0, hasta: 0 });
    const m = leer(slug);
    const primeraEnApp = enApp && !m.enApp;
    if (!FORZADO && !primeraEnApp && Date.now() < m.hasta) return;
    // En el navegador espera a que salga el de instalar (2,5 s) y, si salió, le cede la visita.
    const reloj = setTimeout(() => {
      if (!enApp && !FORZADO && instalando.current) return;
      // Al enseñarlo, no antes: si cierra la app en este rato, sigue siendo la primera vez.
      if (primeraEnApp) escribir(slug, { ...m, enApp: true });
      alOcupar(true);
      setVisible(true);
    }, enApp || FORZADO ? 600 : 4000);
    return () => clearTimeout(reloj);
  }, [slug, enApp, alOcupar]);

  // Desmontado es que ya los activó: le toca al aviso de instalar.
  useEffect(() => () => alOcupar(false), [alOcupar]);

  // Acaba de instalarla: es el momento, aunque estuviera descansando.
  useEffect(() => {
    if (PROBANDO_INSTALAR) return;
    const alInstalar = () => {
      alOcupar(true);
      setVisible(true);
    };
    window.addEventListener('appinstalled', alInstalar);
    return () => window.removeEventListener('appinstalled', alInstalar);
  }, [alOcupar]);

  if (!visible) return null;

  const ahoraNo = () => {
    const m = leer(slug);
    const dias = DESCANSOS[Math.min(m.veces, DESCANSOS.length - 1)];
    escribir(slug, { ...m, veces: m.veces + 1, hasta: Date.now() + dias * DIA });
    setVisible(false);
  };

  async function activar() {
    await props.activar();
    // Si los activó, Tarjeta ya desmontó esto. Si dijo que no, descansa como un «Ahora no».
    ahoraNo();
  }

  return (
    <div className="fz-aviso-app" role="dialog" aria-live="polite" aria-label="Activar avisos">
      <div className="fz-aviso-app__tx">
        {bloqueado ? (
          <>
            <b>Tus avisos están bloqueados</b>
            <small>
              {enApp
                ? 'En los ajustes del teléfono, busca esta app y permite sus notificaciones.'
                : 'Toca el icono junto a la dirección, entra en Permisos y permite las notificaciones.'}
            </small>
          </>
        ) : (
          <>
            <b>Activa tus avisos</b>
            <small>Te llegará solo a ti: tus premios y promociones de {props.negocio}. Puedes darte de baja cuando quieras.</small>
          </>
        )}
      </div>
      {bloqueado ? (
        <button type="button" className="fz-aviso-app__ir" onClick={ahoraNo}>
          Entendido
        </button>
      ) : (
        <button type="button" className="fz-aviso-app__ir" disabled={props.ocupado} onClick={() => void activar()}>
          <Bell size={15} aria-hidden="true" /> Activar
        </button>
      )}
      <button type="button" className="fz-aviso-app__x" onClick={ahoraNo} aria-label="Ahora no">
        <X size={16} />
      </button>
    </div>
  );
}
