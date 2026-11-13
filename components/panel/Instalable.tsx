'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL PANEL COMO APP · manifest, service worker y el «Instalar» de Android
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El layout del panel es cliente, así que no puede declarar `metadata`: el
 * manifest y las etiquetas de iPhone se ponen aquí al montar. Safari y Chrome
 * los leen en el momento de instalar, no al cargar, así que llegan a tiempo.
 * Solo en el panel: la landing no ofrece instalar nada.
 *
 * El service worker (public/panel-sw.js) solo recibe avisos: no cachea.
 *
 * Android avisa UNA vez, al cargar, de que la app se puede instalar
 * (`beforeinstallprompt`). Se guarda aquí para que el botón «Instalar» de
 * Ajustes pueda usarlo minutos después. iPhone no tiene ese evento: allí se
 * explica a mano (Compartir → Añadir a pantalla de inicio).
 */
import { useEffect, useSyncExternalStore } from 'react';

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pendiente: EventoInstalar | null = null;
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach((f) => f());

/**
 * El aviso de Chrome lo guarda el script del <head> (app/layout.tsx) en
 * window.__vmInstalar, desde antes de que monte React: si se esperaba al
 * montar, a veces ya había pasado y no salía el botón «Instalar».
 */
type ConInstalar = { __vmInstalar?: EventoInstalar | null };
export const instalarGuardado = <T,>(): T | null =>
  typeof window === 'undefined' ? null : (((window as unknown as ConInstalar).__vmInstalar ?? null) as T | null);
export const soltarInstalarGuardado = () => {
  if (typeof window !== 'undefined') (window as unknown as ConInstalar).__vmInstalar = null;
};

/** ¿Hay un «Instalar» de Android esperando? */
export function useInstalarAndroid(): (() => Promise<boolean>) | null {
  const hay = useSyncExternalStore(
    (f) => (oyentes.add(f), () => oyentes.delete(f)),
    () => pendiente !== null,
    () => false,
  );
  if (!hay) return null;
  return async () => {
    const e = pendiente;
    if (!e) return false;
    await e.prompt();
    const r = await e.userChoice;
    pendiente = null;
    soltarInstalarGuardado(); // Sirve una sola vez.
    avisar();
    return r.outcome === 'accepted';
  };
}

/** ¿Está abierto como app (desde el icono), no en una pestaña? */
export const enModoApp = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true);

export const plataforma = (): 'ios' | 'android' | 'otra' => {
  if (typeof navigator === 'undefined') return 'otra';
  const ua = navigator.userAgent;
  // iPadOS se presenta como Mac: se distingue por la pantalla táctil.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return /Android/i.test(ua) ? 'android' : 'otra';
};

/**
 * ¿Chrome tiene puesto «Sitio de escritorio» para el panel?
 *
 * Con eso activado el celular finge una pantalla de 980 px, ignora el
 * `viewport` y se pinta el panel de computadora en miniatura. Desde aquí no se
 * puede desactivar: solo detectarlo y decir dónde se quita. La app instalada
 * hereda el ajuste de Chrome para el sitio.
 */
export const vistaDeEscritorio = (): boolean =>
  typeof window !== 'undefined' &&
  navigator.maxTouchPoints > 0 &&
  screen.width <= 820 &&
  document.documentElement.clientWidth > screen.width * 1.5;

function etiqueta(tag: 'link' | 'meta', attrs: Record<string, string>) {
  const clave = tag === 'link' ? `link[rel="${attrs.rel}"]` : `meta[name="${attrs.name}"]`;
  const existente = document.head.querySelector(clave);
  if (existente) {
    Object.entries(attrs).forEach(([k, v]) => existente.setAttribute(k, v));
    return;
  }
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
}

export default function Instalable() {
  useEffect(() => {
    etiqueta('link', { rel: 'manifest', href: '/panel.webmanifest' });
    // Android usa este color para la barra superior cuando el navegador o la
    // app instalada lo permiten. Se actualiza aunque el layout raíz ya haya
    // creado la etiqueta, para que la barra continúe el fondo del dashboard.
    etiqueta('meta', { name: 'theme-color', content: '#EAEAE8' });
    etiqueta('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    etiqueta('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    etiqueta('meta', { name: 'apple-mobile-web-app-title', content: 'Vendemia' });
    etiqueta('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });

    navigator.serviceWorker?.register('/panel-sw.js', { scope: '/panel' }).catch(() => {});

    // El script del <head> ya le quitó a Chrome su mini-banner y guardó el aviso
    // (aunque llegara antes de montar). Aquí solo se recoge.
    const alPoder = () => {
      pendiente = instalarGuardado<EventoInstalar>();
      avisar();
    };
    alPoder();
    window.addEventListener('vm:instalar', alPoder);
    return () => window.removeEventListener('vm:instalar', alPoder);
  }, []);
  return null;
}
