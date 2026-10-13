'use client';

/**
 * La tarjeta que tapa el asistente cuando se bloquea. Ver useBloqueo.ts.
 *
 * Se pinta EN LUGAR de la conversación, no encima: mientras está, en la página
 * no queda ni una burbuja ni un audio que tapar. Y no cubre el menú: el resto
 * del panel no está bajo este bloqueo, y quien no quiera confirmar tiene que
 * poder irse a la agenda.
 *
 * ── Cómo se comprueba ────────────────────────────────────────────────────
 *
 * `signInWithPassword` con el correo de la sesión. Si acierta, supabase-js
 * cambia la sesión por una nueva DE LA MISMA PERSONA: el panel no se recarga
 * (Sesion.tsx depende del id del usuario, no del objeto) y el tope de 7 días
 * empieza de nuevo, que es lo justo: acaba de autenticarse. Si falla, la
 * sesión que había no se toca.
 *
 * ⚠️ Quien entra con Google no tiene contraseña que pedir. A esas cuentas se
 * les ofrece volver a pasar por Google, que prueba menos: si el navegador
 * sigue con la sesión de Google abierta, es elegir la cuenta y ya. Es lo que
 * hay sin obligarles a crear una contraseña.
 */
import { useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { guardarDestino } from '@/lib/panel/destino';

export default function Bloqueo({
  email,
  conGoogle,
  alDesbloquear,
  alSalir,
}: {
  email: string;
  /** La cuenta tiene Google enlazado. */
  conGoogle: boolean;
  alDesbloquear: () => void;
  alSalir: () => void;
}) {
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!clave || ocupado) return;
    setOcupado(true);
    setFallo(null);
    try {
      const { error } = await supabase().auth.signInWithPassword({ email, password: clave });
      if (error) {
        setFallo(
          /invalid login credentials/i.test(error.message)
            ? 'Esa no es la contraseña de esta cuenta.'
            : 'No se pudo comprobar ahora mismo. Revisa tu conexión y vuelve a intentarlo.',
        );
        return;
      }
      setClave('');
      alDesbloquear();
    } catch {
      setFallo('No se pudo comprobar ahora mismo. Revisa tu conexión y vuelve a intentarlo.');
    } finally {
      setOcupado(false);
    }
  }

  async function porGoogle() {
    setOcupado(true);
    setFallo(null);
    // La vuelta de Google pasa por /callback, que lee este destino.
    guardarDestino('/panel/asistente');
    try {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/callback`,
          // Que al menos tenga que elegir la cuenta, en vez de pasar de largo.
          queryParams: { prompt: 'select_account', login_hint: email },
        },
      });
      if (error) throw error;
    } catch {
      setOcupado(false);
      setFallo('No se pudo abrir Google. Vuelve a intentarlo.');
    }
  }

  return (
    <section className="asis-tarjeta" aria-labelledby="asis-bloqueo">
      <span className="asis-tarjeta__ico">
        <Lock size={22} />
      </span>
      <h2 id="asis-bloqueo">Por seguridad, confirma que eres tú</h2>
      <p>
        Aquí Mia contesta con los números de tu negocio. Tras 10 minutos sin actividad se borra la
        conversación de la pantalla y se pide confirmar.
      </p>

      {conGoogle && (
        <>
          <button type="button" className="btn btn-dark asis-tarjeta__ancho" onClick={() => void porGoogle()} disabled={ocupado}>
            Confirmar con Google
          </button>
          <div className="separador">o con tu contraseña</div>
        </>
      )}

      <form onSubmit={(e) => void confirmar(e)} className="asis-tarjeta__form">
        {/* Para que el gestor de contraseñas sepa de qué cuenta es. */}
        <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
        <label htmlFor="asis-clave">Contraseña de {email}</label>
        <input
          id="asis-clave"
          className="input"
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus={!conGoogle}
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          disabled={ocupado}
        />
        {fallo && (
          <p className="asis-tarjeta__fallo" role="alert">
            {fallo}
          </p>
        )}
        <button type="submit" className="btn btn-primary asis-tarjeta__ancho" disabled={ocupado || !clave}>
          {ocupado ? 'Comprobando…' : 'Confirmar'}
        </button>
      </form>

      <button type="button" className="asis-tarjeta__enlace" onClick={alSalir}>
        Cerrar sesión
      </button>
    </section>
  );
}
