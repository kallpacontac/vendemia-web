'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL AVISO DE ABAJO · instalar la app y activar los avisos, sin ir a Ajustes
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un dueño no va a ir a Ajustes a buscar «avisos». Así que se le ofrece aquí,
 * abajo, sin tapar nada, y en un solo toque. Lo que ofrece depende de dónde
 * está:
 *
 *   · Android, sin instalar  → «Instala Vendemia» (el diálogo nativo).
 *   · iPhone en Safari       → cómo añadirla a la pantalla de inicio, con una
 *                              flecha hacia el botón Compartir. En iPhone es
 *                              condición: sin instalar no hay avisos.
 *   · Instalada, o navegador que admite avisos y aún no los tiene
 *                            → «Activar avisos»: pide el permiso EN ESE TOQUE y
 *                              guarda todo con lo de por defecto.
 *
 * Mesura: aparece a los 4 s (no de golpe al entrar), «Ahora no» lo esconde 7
 * días y tras dos «Ahora no» no vuelve. Si lo hizo, no vuelve nunca. Ajustes
 * sigue teniendo la versión completa (qué avisos, silencio, prueba).
 */
import { useEffect, useState } from 'react';
import { Bell, Download, EllipsisVertical, Share, X } from 'lucide-react';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { enModoApp, plataforma, useInstalarAndroid } from './Instalable';
import { activarAvisos, soportaAvisos, suscripcionActual } from '@/lib/panel/suscribirAvisos';

type Variante = 'instalar' | 'ios' | 'android-manual' | 'activar';

const CLAVE = 'vm-banner-app';
const SIETE_DIAS = 7 * 24 * 3600 * 1000;

interface Memoria {
  veces: number;
  hasta: number;
  hecho?: boolean;
}

function leer(): Memoria {
  try {
    return { veces: 0, hasta: 0, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') };
  } catch {
    return { veces: 0, hasta: 0 };
  }
}
function escribir(m: Memoria) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(m));
  } catch {
    /* ventana privada: solo dura esta visita */
  }
}
/** ¿Puede salir hoy? */
const permitido = (m: Memoria) => !m.hecho && m.veces < 2 && Date.now() >= m.hasta;

export default function BannerApp() {
  const { companyId } = useSesion();
  const avisar = useAvisar();
  const instalar = useInstalarAndroid();
  const [variante, setVariante] = useState<Variante | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [so, setSo] = useState<'ios' | 'android' | 'otra'>('otra');

  useEffect(() => {
    // `?app=1`: borra lo recordado y lo enseña ya. Para probarlo, o para
    // mandárselo a un cliente que dijo «Ahora no» y luego sí lo quiere.
    const url = new URL(location.href);
    if (url.searchParams.has('app')) {
      escribir({ veces: 0, hasta: 0 });
      url.searchParams.delete('app');
      history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  useEffect(() => {
    if (!companyId || !permitido(leer())) return;
    let vivo = true;
    const reloj = setTimeout(async () => {
      const so = plataforma();
      setSo(so);
      const app = enModoApp();
      let v: Variante | null = null;
      // Primero instalar (es lo que la deja a mano), luego los avisos.
      if (so === 'ios' && !app) v = 'ios';
      // Chrome (Android o computadora) ofreció instalar: el diálogo nativo.
      else if (!app && instalar) v = 'instalar';
      // Android sin oferta de Chrome (la rechazó antes, u otro navegador): a mano.
      else if (so === 'android' && !app) v = 'android-manual';
      else if (soportaAvisos() && Notification.permission === 'default') {
        const actual = await suscripcionActual(companyId).catch(() => null);
        if (!actual?.fila) v = 'activar';
      }
      if (vivo) setVariante(v);
    }, 4000);
    return () => {
      vivo = false;
      clearTimeout(reloj);
    };
    // `instalar` llega tarde (el evento de Android): se vuelve a evaluar entonces.
  }, [companyId, instalar]);

  if (!variante) return null;

  const ahoraNo = () => {
    const m = leer();
    escribir({ ...m, veces: m.veces + 1, hasta: Date.now() + SIETE_DIAS });
    setVariante(null);
  };
  const hecho = () => {
    escribir({ ...leer(), hecho: true });
    setVariante(null);
  };

  async function principal() {
    if (variante === 'instalar' && instalar) {
      const ok = await instalar();
      // Instalada o no, lo siguiente que vale la pena es activar los avisos:
      // funcionan igual en el navegador y en la app.
      if (ok && soportaAvisos() && Notification.permission === 'default') setVariante('activar');
      else if (!ok) ahoraNo();
      return;
    }
    if (variante === 'activar' && companyId) {
      setOcupado(true);
      const r = await activarAvisos(companyId);
      setOcupado(false);
      if (r.ok) {
        avisar('Listo: te avisaremos de pagos y reservas. Puedes elegir qué avisos en Ajustes.', 'ok');
        hecho();
      } else if (r.motivo === 'denegado') {
        hecho(); // Rechazado: el navegador ya no deja volver a preguntar.
      } else {
        avisar(r.mensaje ?? 'No se pudieron activar los avisos.', 'error');
      }
    }
  }

  return (
    <div className={`banner-app banner-app--${variante}`} role="dialog" aria-live="polite" aria-label="Vendemia en tu celular">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/panel-192.png" alt="" className="banner-app__icono" />
      <div className="banner-app__texto">
        {variante === 'instalar' && (
          <>
            <b>{so === 'otra' ? 'Instala Vendemia en tu computadora' : 'Ten Vendemia como app'}</b>
            <small>
              {so === 'otra'
                ? 'Se abre en su propia ventana, como una app, y te avisa de pagos y reservas.'
                : 'Ábrela desde su icono y recibe tus pagos y reservas al instante.'}
            </small>
          </>
        )}
        {variante === 'android-manual' && (
          <>
            <b>Instala Vendemia en tu celular</b>
            <small>
              En Chrome, toca <EllipsisVertical size={13} aria-label="menú" /> y luego <b>«Instalar app»</b> o{' '}
              <b>«Agregar a pantalla principal»</b>.
            </small>
          </>
        )}
        {variante === 'ios' && (
          <>
            <b>Instala Vendemia en tu iPhone</b>
            <small>
              Toca <Share size={13} aria-label="Compartir" /> y luego <b>«Añadir a pantalla de inicio»</b>. Así te llegan los avisos de
              pagos y reservas.
            </small>
          </>
        )}
        {variante === 'activar' && (
          <>
            <b>Recibe tus pagos y reservas al instante</b>
            <small>Solo lo que pide que hagas algo. De noche, un resumen por la mañana.</small>
          </>
        )}
      </div>
      <div className="banner-app__acciones">
        {variante === 'ios' || variante === 'android-manual' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={ahoraNo}>
            Entendido
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void principal()}>
            {variante === 'instalar' ? <Download size={14} /> : <Bell size={14} />}
            {variante === 'instalar' ? 'Instalar' : ocupado ? 'Activando…' : 'Activar'}
          </button>
        )}
        {variante !== 'ios' && variante !== 'android-manual' && (
          <button type="button" className="banner-app__no" onClick={ahoraNo}>
            Ahora no
          </button>
        )}
      </div>
      <button type="button" className="banner-app__cerrar" onClick={ahoraNo} aria-label="Cerrar">
        <X size={16} />
      </button>
    </div>
  );
}
