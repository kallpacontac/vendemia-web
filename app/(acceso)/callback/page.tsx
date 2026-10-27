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
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSesionDeLaUrl } from '@/components/panel/useSesionDeLaUrl';
import { tomarDestino } from '@/lib/panel/destino';
import { rutaActivacionPlaca, type FuentePlaca } from '@/modules/fideliza/dominio/activacion';

export default function Callback() {
  const router = useRouter();
  const { estado, error } = useSesionDeLaUrl();
  /**
   * ¿Llegó con un `?code=`? Se mira al montar: si el canje sale bien,
   * supabase-js limpia la URL; si no sale, la deja como estaba.
   */
  const [traiaCodigo] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code'),
  );

  useEffect(() => {
    // Vuelta de Google o del correo de confirmación: retoma lo que se pidió. Ver lib/panel/destino.ts.
    if (estado === 'con-sesion') {
      const params = new URLSearchParams(window.location.search);
      const fuente: FuentePlaca = params.get('fuente') === 'qr' ? 'qr' : 'nfc';
      const respaldo = params.get('origen') === 'placa' ? rutaActivacionPlaca(fuente) : '/panel';
      router.replace(tomarDestino() ?? respaldo);
    }
  }, [estado, router]);

  /**
   * ⚠️ EL CORREO SÍ QUEDÓ CONFIRMADO, AUNQUE AQUÍ NO HAYA SESIÓN.
   *
   * El enlace de «confirma tu correo» pasa primero por Supabase, que marca la
   * cuenta como confirmada, y DESPUÉS vuelve aquí con un `?code=`. Ese código
   * solo se canjea con el verificador PKCE que guardó el navegador donde se
   * hizo el alta (ver flowType en lib/supabase/client.ts). Abierto desde la app
   * del correo en el celular, o en otro navegador, no hay verificador:
   * supabase-js ni lo intenta y no deja error. Antes eso acababa en «No se pudo
   * entrar», con la cuenta ya lista. Lo único que falta es entrar.
   *
   * Google no cae aquí: empieza y acaba en el mismo navegador.
   */
  if (estado === 'sin-sesion' && !error && traiaCodigo) {
    return (
      <div className="acceso">
        <div className="acceso__card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="acceso__logo" src="/assets/logos/logo-naranja.webp" alt="Vendemia" />
          <h1>Tu correo está confirmado</h1>
          <p className="sub">Ya puedes entrar con tu correo y tu contraseña.</p>
          <Link
            href="/login"
            className="btn btn-primary"
            style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}
          >
            Entrar
          </Link>
        </div>
      </div>
    );
  }

  if (estado === 'sin-sesion') {
    return (
      <div className="acceso">
        <div className="acceso__card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="acceso__logo" src="/assets/logos/logo-naranja.webp" alt="Vendemia" />
          <h1>No se pudo entrar</h1>
          <p className="sub">El enlace no traía una sesión válida.</p>
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
