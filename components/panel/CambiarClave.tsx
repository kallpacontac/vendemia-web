'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CAMBIAR LA CONTRASEÑA · desde dentro del panel
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pedido por Alvaro el 14-nov-2026: a los clientes se les da de alta con una contraseña temporal
 * (scripts/*-alta.sql) y hasta hoy la única forma de cambiarla era salir y usar «olvidé mi
 * contraseña», que depende de que llegue un correo. Aquí no hace falta correo:
 *
 *   1 · Si la cuenta ya tiene contraseña, se pide la actual y se comprueba entrando con ella
 *       (signInWithPassword). Quien encuentra un panel abierto en un equipo ajeno no puede
 *       cambiarla sin saberla.
 *   2 · Quien entra solo con Google no tiene contraseña que comprobar: Google ya lo identificó.
 *       Con esto queda una para entrar también con el correo.
 *   3 · updateUser({ password }) y, si se deja marcado (por defecto), se cierran las DEMÁS
 *       sesiones —como en /nueva-clave— porque cambiar la contraseña no echa a nadie solo.
 *
 * Mínimo 6 caracteres, como Supabase por defecto (y /nueva-clave).
 */
import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

const MINIMO = 6;

export default function CambiarClave({ alCerrar }: { alCerrar: () => void }) {
  const [email, setEmail] = useState('');
  /** null = aún no se sabe; false = solo entra con Google. */
  const [tieneClave, setTieneClave] = useState<boolean | null>(null);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [cerrarOtras, setCerrarOtras] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);

  useEffect(() => {
    void supabase().auth.getUser().then(({ data }) => {
      const u = data.user;
      setEmail(u?.email ?? '');
      setTieneClave(Boolean(u?.identities?.some((i) => i.provider === 'email')));
    });
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || enviando) return;
      e.stopPropagation();
      alCerrar();
    };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [alCerrar, enviando]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tieneClave && !actual) return setError('Escribe tu contraseña actual.');
    if (nueva.length < MINIMO) return setError(`La contraseña nueva tiene que tener al menos ${MINIMO} caracteres.`);
    if (nueva !== repetida) return setError('Las dos contraseñas nuevas no coinciden.');
    if (tieneClave && nueva === actual) return setError('La nueva es igual a la actual. Escribe una distinta.');

    setEnviando(true);
    try {
      const sb = supabase();
      if (tieneClave) {
        const { error: malActual } = await sb.auth.signInWithPassword({ email, password: actual });
        if (malActual) {
          setError(malActual.message.toLowerCase().includes('invalid') ? 'La contraseña actual no es correcta.' : traducir(malActual.message));
          return;
        }
      }
      const { error: errCambio } = await sb.auth.updateUser({ password: nueva });
      if (errCambio) {
        setError(traducir(errCambio.message));
        return;
      }
      if (cerrarOtras) {
        const { error: errOtras } = await sb.auth.signOut({ scope: 'others' });
        setHecho(errOtras
          ? 'Contraseña cambiada. No pudimos cerrar la sesión en tus otros dispositivos: si crees que alguien más entra a tu cuenta, escríbenos.'
          : 'Contraseña cambiada y cerrada la sesión en tus otros dispositivos.');
      } else {
        setHecho('Contraseña cambiada.');
      }
    } catch (err) {
      setError(traducir(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.'));
    } finally {
      setEnviando(false);
    }
  }

  const tipo = ver ? 'text' : 'password';

  return (
    <div className="modal-fondo" role="presentation" onClick={(e) => { if (e.target === e.currentTarget && !enviando) alCerrar(); }}>
      <form className="modal" role="dialog" aria-modal="true" aria-label="Cambiar contraseña" onSubmit={guardar}>
        <div className="modal__cab">
          <KeyRound size={16} />
          <b>Cambiar contraseña</b>
        </div>
        <div className="modal__cuerpo" style={{ display: 'grid', gap: 10 }}>
          {email && <p className="muted" style={{ margin: 0 }}>Cuenta: <b>{email}</b></p>}
          {tieneClave === false && (
            <p className="muted" style={{ margin: 0 }}>Entras con Google. Con esto también podrás entrar con tu correo y esta contraseña.</p>
          )}
          {hecho ? (
            <div className="acceso__ok" role="status">{hecho}</div>
          ) : (
            <>
              {tieneClave && (
                <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                  Contraseña actual
                  <input className="input" type={tipo} autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus />
                </label>
              )}
              <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                Contraseña nueva
                <div style={{ position: 'relative' }}>
                  <input className="input" type={tipo} autoComplete="new-password" minLength={MINIMO} value={nueva} onChange={(e) => setNueva(e.target.value)}
                    style={{ paddingRight: 44, width: '100%' }} autoFocus={tieneClave === false} />
                  <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseñas' : 'Ver contraseñas'}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-soft)', display: 'grid' }}>
                    {ver ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              <label className="field-label" style={{ display: 'grid', gap: 4 }}>
                Repítela
                <input className="input" type={tipo} autoComplete="new-password" minLength={MINIMO} value={repetida} onChange={(e) => setRepetida(e.target.value)} />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5 }}>
                <input type="checkbox" checked={cerrarOtras} onChange={(e) => setCerrarOtras(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Cerrar la sesión en mis otros dispositivos (recomendado si alguien más conocía la contraseña).</span>
              </label>
              {error && <div className="acceso__error" role="alert">{error}</div>}
            </>
          )}
        </div>
        <div className="modal__pie">
          <button type="button" className="btn btn-ghost" onClick={alCerrar} disabled={enviando}>{hecho ? 'Cerrar' : 'Dejarlo'}</button>
          {!hecho && <button type="submit" className="btn btn-primary" disabled={enviando || tieneClave === null}>{enviando ? 'Guardando…' : 'Cambiar contraseña'}</button>}
        </div>
      </form>
    </div>
  );
}

function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('should be different') || m.includes('same as the old')) return 'Esa es la contraseña que ya tenías. Escribe una distinta.';
  if (m.includes('password should be at least')) return `La contraseña es muy corta: mínimo ${MINIMO} caracteres.`;
  if (m.includes('reauthentication') || m.includes('nonce')) return 'Por seguridad, cierra sesión, vuelve a entrar y cámbiala enseguida.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  if (m.includes('weak') || m.includes('pwned')) return 'Esa contraseña es muy fácil de adivinar. Elige otra más larga.';
  return msg;
}
