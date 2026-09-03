'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA VUELTA DE GOOGLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Google devuelve al usuario aquí con la sesión en la URL. Esta pantalla solo
 * espera a que supabase-js la canjee y manda a /panel.
 *
 * ── POR QUÉ EXISTE, EN VEZ DE VOLVER DIRECTO A /panel ────────────────────
 * La guardia de app/(panel)/layout.tsx hace `router.replace('/login')` en
 * cuanto ve `!cargando && !session`, y el canje del token es asíncrono. Volver
 * a /panel abre una carrera que unas veces entra y otras rebota al login sin
 * explicación. Aquí no hay nada que proteger todavía, así que se puede esperar
 * con calma.
 *
 * ── ⚠️ LA TRAMPA QUE HAY QUE CONOCER ─────────────────────────────────────
 * El cliente usa flujo `implicit` (el que trae @supabase/auth-js por defecto),
 * así que la sesión viaja en el FRAGMENTO de la URL: `#access_token=…`.
 *
 * Y resulta que el script bloqueante de app/layout.tsx BORRA `location.hash`
 * —lo necesita la landing, que es de una sola página—. Hoy no rompe nada porque
 * ese script sale por la puerta de atrás en cuanto `location.pathname !== '/'`.
 * Si alguien quita esa guarda, el acceso con Google deja de funcionar y el
 * síntoma —vuelve al login sin decir nada— no apunta ni de lejos al script de
 * la intro. Queda avisado en los dos sitios.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSesionDeLaUrl } from '@/components/panel/useSesionDeLaUrl';

export default function Callback() {
  const router = useRouter();
  const { estado, error } = useSesionDeLaUrl();

  useEffect(() => {
    if (estado === 'con-sesion') router.replace('/panel');
  }, [estado, router]);

  if (estado === 'sin-sesion') {
    return (
      <div className="acceso">
        <div className="acceso__card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="acceso__logo" src="/assets/logos/logo-naranja.webp" alt="Vendemia" />
          <h1>No se pudo entrar</h1>
          <p className="sub">La vuelta de Google no traía una sesión válida.</p>
          {error && <div className="acceso__error">{error}</div>}
          <Link
            href="/login"
            className="btn btn-primary"
            style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
          >
            Volver a intentarlo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="acceso">
      <div className="acceso__card" style={{ textAlign: 'center' }}>
        <div className="spin" style={{ margin: '0 auto 16px' }} />
        <p className="sub">Entrando…</p>
      </div>
    </div>
  );
}
