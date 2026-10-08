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

function etiqueta(tag: 'link' | 'meta', attrs: Record<string, string>) {
  const clave = tag === 'link' ? `link[rel="${attrs.rel}"]` : `meta[name="${attrs.name}"]`;
  if (document.head.querySelector(clave)) return;
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
}

export default function Instalable() {
  useEffect(() => {
    etiqueta('link', { rel: 'manifest', href: '/panel.webmanifest' });
    etiqueta('meta', { name: 'theme-color', content: '#0B0B0B' });
    etiqueta('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
    etiqueta('meta', { name: 'mobile-web-app-capable', content: 'yes' });
    etiqueta('meta', { name: 'apple-mobile-web-app-title', content: 'Vendemia' });
    etiqueta('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'default' });

    navigator.serviceWorker?.register('/panel-sw.js', { scope: '/panel' }).catch(() => {});

    const alPoder = (e: Event) => {
      e.preventDefault(); // Que no salga el mini-banner de Chrome: lo ofrece Ajustes.
      pendiente = e as EventoInstalar;
      avisar();
    };
    const alInstalar = () => {
      pendiente = null;
      avisar();
    };
    window.addEventListener('beforeinstallprompt', alPoder);
    window.addEventListener('appinstalled', alInstalar);
    return () => {
      window.removeEventListener('beforeinstallprompt', alPoder);
      window.removeEventListener('appinstalled', alInstalar);
    };
  }, []);
  return null;
}
