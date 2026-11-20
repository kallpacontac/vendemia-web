'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL AVISO DE ABAJO · instalar la app y activar los avisos, sin ir a Ajustes
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nadie va a ir a Ajustes a buscar «avisos». Así que se ofrece aquí, abajo,
 * sin tapar nada, y en un solo toque. A TODOS los del negocio: dueño,
 * administrador y equipo (al barbero le llega lo de su agenda, avisos 0004).
 *
 * Mira el estado REAL cada vez que se entra (no lo que se recuerda): si borró
 * la app, si se perdió la suscripción o si es la app nueva con el logo del
 * negocio, vuelve a ofrecerlo. Lo que ofrece depende de dónde está:
 *
 *   · Chrome con «Sitio de escritorio» → cómo quitarlo. Va antes que todo: con
 *                              eso puesto el panel se ve en miniatura.
 *   · iPhone sin instalar    → cómo añadirla a la pantalla de inicio. En iPhone
 *                              es condición: sin instalar no hay avisos.
 *   · Chrome ofrece instalar → «Instalar» (el diálogo nativo).
 *   · Avisos sin activar     → «Activar»: pide el permiso EN ESE TOQUE. También
 *                              si el permiso ya estaba dado pero este negocio no
 *                              tiene la suscripción (p. ej. la app nueva).
 *   · Avisos bloqueados      → dónde desbloquearlos.
 *   · Android sin la oferta de Chrome y fuera de la app → «Ábrela desde su
 *                              ícono, o instálala así». Chrome no la ofrece
 *                              cuando ya está instalada: casi siempre es eso.
 *
 * Mesura: aparece a los 4 s (no de golpe al entrar) y «Ahora no» lo esconde
 * un día. Cuando ya está todo (instalada y con avisos), no sale. Ajustes sigue
 * teniendo la versión completa (qué avisos, silencio, prueba).
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, EllipsisVertical, Share, X } from 'lucide-react';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { enModoApp, plataforma, useInstalarAndroid, vistaDeEscritorio } from './Instalable';
import { activarAvisos, soportaAvisos, suscripcionActual } from '@/lib/panel/suscribirAvisos';
import { iconoApp, nombreApp } from '@/lib/panel/marcaPropia';

type Variante = 'escritorio' | 'instalar' | 'ios' | 'android-manual' | 'activar' | 'bloqueados';

/*
 * Clave nueva (antes `vm-banner-app`): la vieja guardaba «hecho» y «dos veces
 * Ahora no» para siempre, y dejaba sin aviso a quien luego lo necesitaba.
 */
const CLAVE = 'vm-banner-app-2';
const UN_DIA = 24 * 3600 * 1000;

function hastaGuardado(): number {
  try {
    return Number(JSON.parse(localStorage.getItem(CLAVE) ?? '{}').hasta) || 0;
  } catch {
    return 0;
  }
}
function guardarHasta(hasta: number) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ hasta }));
  } catch {
    /* ventana privada: solo dura esta visita */
  }
}

/** ¿Qué falta en ESTE celular para este negocio? null = nada. */
async function queFalta(companyId: string, hayDialogo: boolean): Promise<Variante | null> {
  const so = plataforma();
  const app = enModoApp();
  // iPhone: sin instalar no hay avisos, así que lo primero es instalar.
  if (so === 'ios' && !app) return 'ios';
  // Chrome (Android o computadora) ofrece instalar: el diálogo nativo.
  if (!app && hayDialogo) return 'instalar';
  if (soportaAvisos()) {
    if (Notification.permission === 'denied') return 'bloqueados';
    const actual = await suscripcionActual(companyId).catch(() => null);
    if (!actual?.fila || Notification.permission !== 'granted') return 'activar';
  }
  // Android en el navegador sin oferta de Chrome: casi siempre ya está instalada.
  if (so === 'android' && !app) return 'android-manual';
  return null;
}

export default function BannerApp() {
  const { companyId, rol } = useSesion();
  // Con marca propia, la app se llama como el negocio (lib/panel/marcaPropia.ts).
  const app = nombreApp(companyId);
  const delEquipo = rol === 'empleado';
  const avisar = useAvisar();
  const instalar = useInstalarAndroid();
  const [variante, setVariante] = useState<Variante | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /** iPhone, o Android sin la oferta de Chrome: tras tocar «Instalar», los 2 pasos. */
  const [pasos, setPasos] = useState(false);
  const [so, setSo] = useState<'ios' | 'android' | 'otra'>('otra');

  useEffect(() => {
    // `?app=1`: lo enseña ya, aunque haya dicho «Ahora no». Para probarlo, o
    // para mandárselo a alguien que dijo «Ahora no» y luego sí lo quiere.
    const url = new URL(location.href);
    if (url.searchParams.has('app')) {
      guardarHasta(0);
      url.searchParams.delete('app');
      history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  /** «Entendido» en el aviso de escritorio: no vuelve hasta la próxima visita. */
  const [escritorioVisto, setEscritorioVisto] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const conVista = !escritorioVisto && vistaDeEscritorio();
    if (!conVista && Date.now() < hastaGuardado()) return;
    let vivo = true;
    const reloj = setTimeout(async () => {
      setSo(plataforma());
      const v = conVista ? 'escritorio' : await queFalta(companyId, Boolean(instalar));
      if (vivo) setVariante(v);
    }, 4000);
    return () => {
      vivo = false;
      clearTimeout(reloj);
    };
    // `instalar` llega tarde (el evento de Android): se vuelve a evaluar entonces.
  }, [companyId, instalar, escritorioVisto]);

  if (!variante) return null;

  /** Se esconde un día. Al volver, se mira otra vez qué falta. */
  const ahoraNo = () => {
    guardarHasta(Date.now() + UN_DIA);
    setPasos(false);
    setVariante(null);
  };
  const entendidoEscritorio = () => {
    setEscritorioVisto(true);
    setVariante(null);
  };
  /** Tras instalar o activar: ¿falta algo más? (p. ej. los avisos después de instalar). */
  const siguiente = async () => {
    setPasos(false);
    setVariante(companyId ? await queFalta(companyId, false) : null);
  };

  async function principal() {
    const manual = variante === 'ios' || variante === 'android-manual';
    // El botón siempre dice «Instalar»: sin el diálogo de Chrome, enseña los pasos.
    if (manual && !instalar) return setPasos(true);
    if ((variante === 'instalar' || manual) && instalar) {
      setPasos(false);
      const ok = await instalar();
      // Instalada o no, lo siguiente que vale la pena es activar los avisos:
      // funcionan igual en el navegador y en la app.
      if (ok) await siguiente();
      else ahoraNo();
      return;
    }
    if (variante === 'activar' && companyId) {
      setOcupado(true);
      const r = await activarAvisos(companyId);
      setOcupado(false);
      if (r.ok) {
        avisar(
          delEquipo
            ? 'Listo: te avisaremos de tus citas nuevas y antes de cada una.'
            : 'Listo: te avisaremos de pagos y reservas. Puedes elegir qué avisos en Ajustes.',
          'ok',
        );
        await siguiente();
      } else if (r.motivo === 'denegado') {
        // Lo rechazó en el diálogo: ahora se explica cómo desbloquearlo.
        setVariante(Notification.permission === 'denied' ? 'bloqueados' : null);
      } else {
        avisar(r.mensaje ?? 'No se pudieron activar los avisos.', 'error');
      }
    }
  }

  const loQueGana = delEquipo ? 'tus citas nuevas y un aviso antes de cada una' : 'tus pagos y reservas al instante';

  return (
    <div className={`banner-app banner-app--${variante}`} role="dialog" aria-live="polite" aria-label={`${app} en tu celular`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconoApp(companyId)} alt="" className="banner-app__icono" />
      <div className="banner-app__texto">
        {variante === 'instalar' && (
          <>
            <b>{so === 'otra' ? `Instala ${app} en tu computadora` : `Ten ${app} como app`}</b>
            <small>
              {so === 'otra'
                ? `Se abre en su propia ventana, como una app, y te avisa de ${delEquipo ? 'tus citas' : 'pagos y reservas'}.`
                : `Ábrela desde su ícono y recibe ${loQueGana}.`}
            </small>
          </>
        )}
        {variante === 'escritorio' && (
          <>
            <b>Estás viendo la versión de computadora</b>
            <small>
              {enModoApp() ? (
                <>
                  Abre Chrome, toca <EllipsisVertical size={13} aria-label="menú" /> → <b>Configuración</b> →{' '}
                  <b>Configuración de sitios</b> → <b>Sitio de escritorio</b> y desactívalo. Luego cierra {app} y vuelve a
                  abrirla.
                </>
              ) : (
                <>
                  Toca <EllipsisVertical size={13} aria-label="menú" /> arriba a la derecha y desmarca{' '}
                  <b>«Sitio de escritorio»</b>.
                </>
              )}
            </small>
          </>
        )}
        {variante === 'android-manual' && (
          <>
            <b>Usa {app} desde su ícono</b>
            {pasos ? (
              <small>
                1. Toca <EllipsisVertical size={13} aria-label="menú" /> arriba a la derecha.
                <br />
                2. Elige <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b>.
              </small>
            ) : (
              <small>Si ya la tienes, ábrela desde el ícono de {app}. Si no, instálala en 2 pasos.</small>
            )}
          </>
        )}
        {variante === 'ios' && (
          <>
            <b>Instala {app} en tu iPhone</b>
            {pasos ? (
              <small>
                1. Toca <Share size={13} aria-label="Compartir" /> <b>Compartir</b>, abajo.
                <br />
                2. Elige <b>«Añadir a pantalla de inicio»</b> y ábrela desde el ícono.
              </small>
            ) : (
              <small>En iPhone los avisos solo llegan desde la app. Así recibes {loQueGana}.</small>
            )}
          </>
        )}
        {variante === 'activar' && (
          <>
            <b>{delEquipo ? 'Activa los avisos de tus citas' : 'Recibe tus pagos y reservas al instante'}</b>
            <small>
              {delEquipo
                ? 'Te avisamos de cada cita nueva, si te la mueven o cancelan, y 15 min antes.'
                : 'Solo lo que pide que hagas algo. De noche, un resumen por la mañana.'}
            </small>
          </>
        )}
        {variante === 'bloqueados' && (
          <>
            <b>
              <BellOff size={14} style={{ verticalAlign: -2 }} /> Los avisos de {app} están bloqueados
            </b>
            <small>
              {so === 'ios' ? (
                <>
                  Abre <b>Ajustes</b> del iPhone → <b>Notificaciones</b> → <b>{app}</b> y activa{' '}
                  <b>Permitir notificaciones</b>.
                </>
              ) : enModoApp() ? (
                <>
                  Mantén presionado el ícono de {app} → <b>Información de la app</b> → <b>Notificaciones</b> y actívalas.
                </>
              ) : (
                <>
                  Toca el candado o el ícono junto a la dirección, arriba → <b>Permisos</b> → <b>Notificaciones</b> →{' '}
                  <b>Permitir</b>. Luego recarga.
                </>
              )}
            </small>
          </>
        )}
      </div>
      <div className="banner-app__acciones">
        {variante === 'escritorio' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={entendidoEscritorio}>
            Entendido
          </button>
        ) : variante === 'bloqueados' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={ahoraNo}>
            Entendido
          </button>
        ) : (variante === 'ios' || variante === 'android-manual') && pasos && !instalar ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={ahoraNo}>
            Listo
          </button>
        ) : variante === 'ios' || variante === 'android-manual' ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void principal()}>
            <Download size={14} /> Instalar
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void principal()}>
            {variante === 'instalar' ? <Download size={14} /> : <Bell size={14} />}
            {variante === 'instalar' ? 'Instalar' : ocupado ? 'Activando…' : 'Activar'}
          </button>
        )}
        {variante !== 'escritorio' && variante !== 'bloqueados' && !pasos && (
          <button type="button" className="banner-app__no" onClick={ahoraNo}>
            Ahora no
          </button>
        )}
      </div>
      <button
        type="button"
        className="banner-app__cerrar"
        onClick={variante === 'escritorio' ? entendidoEscritorio : ahoraNo}
        aria-label="Cerrar"
      >
        <X size={16} />
      </button>
    </div>
  );
}
