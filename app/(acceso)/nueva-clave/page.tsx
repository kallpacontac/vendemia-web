'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * PONER UNA CONTRASEÑA NUEVA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aquí aterriza el enlace del correo de recuperación. Cómo funciona:
 *
 *   1 · /login (modo recuperar) llama a resetPasswordForEmail con
 *       redirectTo = <origen>/nueva-clave
 *   2 · Supabase manda un correo con un enlace a su propio /auth/v1/verify,
 *       que valida el token y redirige AQUÍ con una sesión temporal en la URL
 *       (`#access_token=…` o `?code=…`, según el flujo configurado).
 *   3 · supabase-js la lee sola —por eso `detectSessionInUrl: true` en
 *       client.ts— y dispara PASSWORD_RECOVERY.
 *   4 · Con esa sesión, `updateUser({ password })` cambia la contraseña.
 *
 * ⚠️ Esa sesión temporal ES una sesión: quien abra el enlace está dentro. Por
 * eso el enlace caduca, se usa una vez, y esta pantalla no enseña ningún dato
 * del negocio — solo el formulario.
 *
 * Si alguien llega aquí a pelo, sin enlace, no hay nada que hacer y se le dice,
 * en vez de enseñarle un formulario que fallaría al enviar.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { FALTAN_CLAVES, supabase } from '@/lib/supabase/client';
import { useSesionDeLaUrl } from '@/components/panel/useSesionDeLaUrl';

/** Lo mismo que exige Supabase por defecto. Si lo subes allí, súbelo aquí. */
const MINIMO = 6;

export default function NuevaClave() {
  const router = useRouter();
  // Esperar a la sesión que trae el enlace es exactamente lo mismo que hace
  // /callback con la vuelta de Google, así que vive en un sitio solo.
  const { estado: listo, error: errorUrl } = useSesionDeLaUrl();
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorPropio, setErrorPropio] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  const error = errorPropio ?? errorUrl;
  const setError = setErrorPropio;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (clave.length < MINIMO) {
      setError(`La contraseña tiene que tener al menos ${MINIMO} caracteres.`);
      return;
    }
    // Se comprueba aquí y no solo con `required`: escribir una contraseña que
    // no ves y equivocarte al teclearla te deja fuera de tu propio panel.
    if (clave !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setEnviando(true);
    try {
      const { error } = await supabase().auth.updateUser({ password: clave });
      if (error) throw error;
      setHecho(true);
      // Ya hay sesión válida: entrar directo es lo que espera quien acaba de
      // cambiarla, y evita pedirle la contraseña que acaba de escribir.
      setTimeout(() => router.replace('/panel'), 1200);
    } catch (err) {
      setError(traducir(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña'));
    } finally {
      setEnviando(false);
    }
  }

  if (FALTAN_CLAVES) {
    return (
      <div className="acceso">
        <div className="acceso__card">
          <h1>Falta configurar Supabase</h1>
          <p className="sub">Este despliegue no tiene las claves puestas.</p>
        </div>
      </div>
    );
  }

  if (listo === 'esperando') {
    return (
      <div className="acceso">
        <div className="acceso__card" style={{ textAlign: 'center' }}>
          <div className="spin" style={{ margin: '0 auto 16px' }} />
          <p className="sub">Comprobando el enlace…</p>
        </div>
      </div>
    );
  }

  if (listo === 'sin-sesion') {
    return (
      <div className="acceso">
        <div className="acceso__card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="acceso__logo" src="/assets/logos/logo-principal.webp" alt="Vendemia" />
          <h1>Este enlace ya no vale</h1>
          <p className="sub">
            Los enlaces de recuperación caducan y solo se pueden usar una vez.
          </p>
          {error && <div className="acceso__error">{error}</div>}
          <Link href="/login" className="btn btn-primary" style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>
            Pedir uno nuevo <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="acceso">
      <form className="acceso__card" onSubmit={guardar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="acceso__logo" src="/assets/logos/logo-principal.webp" alt="Vendemia" />
        <h1>Nueva contraseña</h1>
        <p className="sub">Escríbela dos veces y entras directo.</p>

        <label className="field-label" htmlFor="clave">
          Contraseña nueva
        </label>
        <div style={{ position: 'relative' }}>
          <input
            id="clave"
            className="input"
            type={verClave ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={MINIMO}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            placeholder="••••••••"
            style={{ paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setVerClave((v) => !v)}
            aria-label={verClave ? 'Ocultar contraseña' : 'Ver contraseña'}
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-soft)',
              display: 'grid',
            }}
          >
            {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <label className="field-label" htmlFor="repetida">
          Repítela
        </label>
        <input
          id="repetida"
          className="input"
          type={verClave ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={MINIMO}
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          placeholder="••••••••"
        />

        {error && <div className="acceso__error">{error}</div>}
        {hecho && <div className="acceso__ok">Contraseña cambiada. Entrando a tu panel…</div>}

        <button className="btn btn-primary" type="submit" disabled={enviando || hecho}>
          {enviando ? 'Guardando…' : 'Guardar y entrar'}
          {!enviando && !hecho && <ArrowRight size={18} />}
        </button>

        <p className="acceso__alt">
          <Link href="/login">← Volver al acceso</Link>
        </p>
      </form>
    </div>
  );
}

function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('should be different') || m.includes('same as the old'))
    return 'Esa es la contraseña que ya tenías. Escribe una distinta.';
  if (m.includes('password should be at least'))
    return `La contraseña es muy corta: mínimo ${MINIMO} caracteres.`;
  if (m.includes('session') || m.includes('jwt') || m.includes('expired'))
    return 'La sesión del enlace caducó. Pide otro enlace desde el acceso.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  return msg;
}
