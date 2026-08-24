'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ESPERAR A LA SESIÓN QUE VIENE EN LA URL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Dos caminos del panel acaban volviendo de fuera con una sesión metida en la
 * URL, y los dos necesitan exactamente lo mismo:
 *
 *   · /nueva-clave — el enlace del correo de recuperación.
 *   · /callback    — la vuelta de Google.
 *
 * `detectSessionInUrl: true` (ver lib/supabase/client.ts) hace el trabajo sucio:
 * lee el fragmento `#access_token=…` —el cliente usa flujo `implicit`— o el
 * `?code=` si algún día se pasa a PKCE, lo canjea y limpia la URL. Lo que falta
 * es saber CUÁNDO terminó, y eso es lo que resuelve este hook.
 *
 * ⚠️ Hay tres estados, no dos. Mientras `esperando`, no enseñes ni un error ni
 * un formulario: la mitad de las veces la sesión llega 300 ms después.
 */
import { useEffect, useState } from 'react';
import { FALTAN_CLAVES, supabase } from '@/lib/supabase/client';

export type EstadoUrl = 'esperando' | 'con-sesion' | 'sin-sesion';

/** Cuánto esperar antes de dar por hecho que no venía ninguna sesión. */
const RENDIRSE_MS = 5000;

export function useSesionDeLaUrl(): { estado: EstadoUrl; error: string | null } {
  const [estado, setEstado] = useState<EstadoUrl>('esperando');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (FALTAN_CLAVES) {
      setEstado('sin-sesion');
      return;
    }
    const sb = supabase();
    let vivo = true;

    /**
     * Los fallos vuelven en el fragmento de la URL
     * (`#error=access_denied&error_code=otp_expired`), NO como código HTTP.
     * Sin mirarlos, un enlace caducado o un consentimiento denegado se leerían
     * como "no hay sesión" a secas y nadie sabría por qué.
     */
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const codigo = hash.get('error_code') ?? query.get('error_code');
    const descripcion =
      hash.get('error_description') ??
      query.get('error_description') ??
      hash.get('error') ??
      query.get('error');

    if (descripcion) {
      setError(traducirFallo(codigo, decodeURIComponent(descripcion.replace(/\+/g, ' '))));
      setEstado('sin-sesion');
      return;
    }

    // El evento llega cuando la librería termina de canjear lo que traía la
    // URL; getSession() cubre el caso de que ya lo hubiera hecho antes de que
    // este efecto se montara.
    const { data: sub } = sb.auth.onAuthStateChange((evento, s) => {
      if (!vivo) return;
      if (s && (evento === 'PASSWORD_RECOVERY' || evento === 'SIGNED_IN' || evento === 'INITIAL_SESSION')) {
        setEstado('con-sesion');
      }
    });

    void sb.auth.getSession().then(({ data }) => {
      if (vivo && data.session) setEstado('con-sesion');
    });

    const reloj = setTimeout(() => {
      if (vivo) setEstado((e) => (e === 'esperando' ? 'sin-sesion' : e));
    }, RENDIRSE_MS);

    return () => {
      vivo = false;
      clearTimeout(reloj);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { estado, error };
}

function traducirFallo(codigo: string | null, mensaje: string): string {
  if (codigo === 'otp_expired')
    return 'Ese enlace ya caducó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';
  if (codigo === 'access_denied' || /denied/i.test(mensaje))
    return 'Cancelaste el acceso, o Google no dio permiso. Puedes intentarlo otra vez.';
  if (/provider is not enabled/i.test(mensaje))
    return 'El acceso con Google no está activado en Supabase todavía.';
  return mensaje;
}
