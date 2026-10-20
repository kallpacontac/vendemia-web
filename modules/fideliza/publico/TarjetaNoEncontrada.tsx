'use client';

/**
 * /m/<token> que ya no existe (tarjeta borrada, negocio reiniciado o enlace
 * mal copiado). El teléfono puede recordarla en localStorage (`fz:card:<slug>`)
 * y el alta enseñaba «Ya tienes una tarjeta aquí» → 404 para siempre.
 *
 * Aquí se olvida y, si se sabe de qué negocio era, se ofrece crear otra.
 */
import { useEffect, useState } from 'react';

export default function TarjetaNoEncontrada() {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    const token = decodeURIComponent(window.location.pathname.split('/m/')[1]?.split('/')[0] ?? '');
    if (!token) return;
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith('fz:card:') && localStorage.getItem(k) === token) {
          localStorage.removeItem(k);
          const s = k.slice('fz:card:'.length);
          if (/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(s)) setSlug(s);
        }
      }
    } catch {
      /* sin almacenamiento: no hay nada que olvidar */
    }
  }, []);

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#F7F5F2', fontFamily: 'system-ui, sans-serif', color: '#14110F' }}>
      <section style={{ maxWidth: 380, width: '100%', background: '#fff', borderRadius: 20, padding: 28, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,.08)' }}>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Esta tarjeta ya no existe</h1>
        <p style={{ margin: '0 0 20px', color: '#5b5651', lineHeight: 1.5 }}>
          Puede que el negocio la haya dado de baja o que el enlace esté incompleto.
          {slug ? ' Puedes crear una nueva en un momento.' : ' Pide en el local el enlace o el QR para crear una nueva.'}
        </p>
        {slug && (
          <a
            href={`/n/${slug}/unirse`}
            style={{ display: 'block', padding: '14px 18px', borderRadius: 14, background: '#FF4900', color: '#fff', fontWeight: 700, textDecoration: 'none' }}
          >
            Crear mi tarjeta nueva
          </a>
        )}
      </section>
    </main>
  );
}
