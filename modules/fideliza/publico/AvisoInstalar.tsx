'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL AVISO DE ABAJO · instalar la tarjeta como app (gemelo de BannerApp)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El mismo aviso tipo notificación que el panel, con el aspecto del de «Tu
 * tarjeta de puntos» de la página del negocio (paginaPublica.ts, `.mt`): así
 * el cliente reconoce las dos notificaciones como de la misma tarjeta.
 *
 *   · Chrome ofreció instalar (Android o computadora) → «Instalar» (diálogo nativo).
 *   · iPhone sin instalar → Compartir → «Añadir a pantalla de inicio».
 *   · Android sin oferta de Chrome → a mano, desde el menú ⋮.
 *
 * Mesura como el panel: sale a los 2,5 s, «Ahora no» lo esconde 7 días y
 * tras dos «Ahora no» (la ×) no vuelve; instalada, nunca. En iPhone sí vuelve cada
 * 7 días: sin instalar no hay avisos, y sin esto AvisoActivar nunca llegaría a salir.
 * Lo recordado sobrevive a desinstalar: si Chrome vuelve a ofrecerla es que ya no está
 * instalada, y `hecho` no cuenta. La memoria es por negocio: cada tarjeta es su propia app.
 *
 * Para probarlo (scripts/fideliza-aviso-instalar.mjs):
 *   · `?app=1`                      → olvida lo recordado y lo evalúa ya.
 *   · `?app=ios|android|instalar`   → enseña esa variante en cualquier equipo.
 *   · consola: dispatchEvent(new CustomEvent('fz:aviso-instalar', { detail: 'ios' }))
 */
import { useEffect, useState } from 'react';
import { Download, EllipsisVertical, Share, X } from 'lucide-react';

export type Variante = 'instalar' | 'ios' | 'android-manual';
export interface EventoInstalar {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SIETE_DIAS = 7 * 24 * 3600 * 1000;
export const EVENTO = 'fz:aviso-instalar';

interface Memoria {
  veces: number;
  hasta: number;
  hecho?: boolean;
}

const clave = (slug: string) => `fz:aviso-instalar:${slug}`;
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
const permitido = (m: Memoria, sinTope: boolean, ofrecida: boolean) =>
  (!m.hecho || ofrecida) && (sinTope || m.veces < 2) && Date.now() >= m.hasta;

/** `?app=` → variante forzada, o 'evaluar' para olvidar lo recordado. */
function leerForzado(valor: string | null): Variante | 'evaluar' | null {
  if (valor === null) return null;
  if (valor === 'ios' || valor === 'instalar') return valor;
  if (valor === 'android') return 'android-manual';
  return 'evaluar';
}
// Se lee al cargar, antes de que Tarjeta limpie la URL: si React vuelve a
// montar la tarjeta (p. ej. tras un error de hidratación), no se pierde.
const FORZADO = typeof window === 'undefined' ? null : leerForzado(new URLSearchParams(location.search).get('app'));

export default function AvisoInstalar(props: {
  slug: string;
  plataforma: 'ios' | 'android' | 'otra';
  enApp: boolean;
  instalar: EventoInstalar | null;
  conAvisos: boolean;
  alCambiar: (visible: boolean) => void;
  /** El evento de Chrome sirve una sola vez: tras usarlo se suelta. */
  alUsarInstalar: () => void;
}) {
  const { slug, plataforma, enApp, instalar, alCambiar } = props;
  const forzado = FORZADO;
  const [variante, setVariante] = useState<Variante | null>(null);
  /** Sin el «Instalar» de un toque (iPhone, o Chrome que no lo ofreció): tras tocar Instalar, los pasos. */
  const [pasos, setPasos] = useState(false);

  useEffect(() => alCambiar(variante !== null), [variante, alCambiar]);

  // Disparo a mano desde la consola, sin recargar.
  useEffect(() => {
    const alPedir = (e: Event) => {
      const v = leerForzado(String((e as CustomEvent).detail ?? '1'));
      if (v === 'evaluar') escribir(slug, { veces: 0, hasta: 0 });
      setVariante(v === 'evaluar' ? elegir() ?? 'instalar' : v);
    };
    window.addEventListener(EVENTO, alPedir);
    return () => window.removeEventListener(EVENTO, alPedir);
  });

  function elegir(): Variante | null {
    if (enApp) return null;
    if (plataforma === 'ios') return 'ios';
    if (instalar) return 'instalar';
    if (plataforma === 'android') return 'android-manual';
    return null;
  }

  useEffect(() => {
    if (forzado && forzado !== 'evaluar') {
      const reloj = setTimeout(() => setVariante(forzado), 600);
      return () => clearTimeout(reloj);
    }
    if (forzado === 'evaluar') escribir(slug, { veces: 0, hasta: 0 });
    if (!permitido(leer(slug), plataforma === 'ios' && props.conAvisos, instalar !== null)) return;
    const reloj = setTimeout(() => setVariante(elegir()), forzado ? 600 : 2500);
    return () => clearTimeout(reloj);
    // `instalar` llega tarde (el evento de Chrome): se vuelve a evaluar entonces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, plataforma, enApp, instalar]);

  if (!variante) return null;

  /** «Listo» tras los pasos: vuelve en 7 días si no la instaló, sin contar como un «Ahora no». */
  const listo = () => {
    escribir(slug, { ...leer(slug), hasta: Date.now() + SIETE_DIAS });
    setPasos(false);
    setVariante(null);
  };
  const ahoraNo = () => {
    const m = leer(slug);
    escribir(slug, { ...m, veces: m.veces + 1, hasta: Date.now() + SIETE_DIAS });
    setVariante(null);
  };

  async function principal() {
    // El botón siempre dice «Instalar». Si el navegador no deja hacerlo de un
    // toque (iPhone nunca; Android si Chrome no lo ofreció), enseña los 2 pasos.
    if (!instalar) return setPasos(true);
    await instalar.prompt().catch(() => {});
    const r = await instalar.userChoice?.catch(() => null);
    props.alUsarInstalar();
    if (r?.outcome === 'dismissed') ahoraNo();
    else {
      escribir(slug, { ...leer(slug), hecho: true });
      setVariante(null);
    }
  }

  // Si Chrome ofrece instalar mientras se leen los pasos, el botón vuelve a ser de un toque.
  const enPasos = pasos && !instalar;

  return (
    <div className="fz-aviso-app" role="dialog" aria-live="polite" aria-label="Instalar tu tarjeta">
      <div className="fz-aviso-app__tx">
        <b>Instala tu tarjeta</b>
        {!enPasos && (
          <small>Tenla en tu pantalla de inicio, como una app{props.conAvisos ? ', con avisos de tus premios' : ''}.</small>
        )}
        {enPasos && plataforma === 'ios' && (
          <small>
            1. Toca <Share size={13} aria-label="Compartir" /> <b>Compartir</b>, abajo.
            <br />
            2. Elige <b>«Añadir a pantalla de inicio»</b>.
          </small>
        )}
        {enPasos && plataforma !== 'ios' && (
          <small>
            1. Toca <EllipsisVertical size={13} aria-label="menú" /> arriba a la derecha.
            <br />
            2. Elige <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b>.
          </small>
        )}
      </div>
      {enPasos ? (
        <button type="button" className="fz-aviso-app__ir" onClick={listo}>
          Listo
        </button>
      ) : (
        <button type="button" className="fz-aviso-app__ir" onClick={() => void principal()}>
          <Download size={15} aria-hidden="true" /> Instalar
        </button>
      )}
      <button type="button" className="fz-aviso-app__x" onClick={ahoraNo} aria-label="Ahora no">
        <X size={16} />
      </button>
    </div>
  );
}
