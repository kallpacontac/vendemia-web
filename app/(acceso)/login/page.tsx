'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ENTRAR AL PANEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Cuatro caminos de entrada:
 *
 *   · Google        — signInWithOAuth. Entra y da de alta a la vez: OAuth no
 *     distingue las dos cosas. Vuelve por /callback. Ver BotonGoogle.tsx.
 *   · Login normal  — signInWithPassword.
 *   · Alta propia   — signUp. Crea el usuario, pero SIN membresía: todavía no
 *     ve ninguna compañía. La compañía se crea aparte (`npm run onboard`), y
 *     hasta entonces el panel se lo dice con todas las letras en vez de
 *     enseñar una pantalla vacía. Ver la guardia en (panel)/layout.tsx.
 *   · «Olvidé mi contraseña» — resetPasswordForEmail, que aterriza en
 *     /nueva-clave con una sesión temporal en la URL.
 *
 * Google va primero en la pantalla a propósito: es el único camino que no
 * depende del correo, y el correo es justo lo que falla con el SMTP por
 * defecto de Supabase.
 *
 * Al recepcionista lo da de alta el dueño desde Ajustes (comando `add_member`),
 * y entra por aquí con la contraseña temporal que el panel le enseñó en
 * pantalla.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { FALTAN_CLAVES, supabase } from '@/lib/supabase/client';
import BotonGoogle from '@/components/panel/BotonGoogle';

type Modo = 'entrar' | 'crear' | 'recuperar';

export default function Login() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Si ya hay sesión, no tiene sentido enseñar el formulario.
  useEffect(() => {
    if (FALTAN_CLAVES) return;
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace('/panel');
      });
  }, [router]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    setEnviando(true);

    try {
      const sb = supabase();
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email, password: clave });
        if (error) throw error;
        router.replace('/panel');
      } else if (modo === 'recuperar') {
        /**
         * `redirectTo` tiene que estar en la lista blanca de Supabase
         * (Authentication › URL Configuration › Redirect URLs) o el enlace del
         * correo acaba en el Site URL por defecto y la pantalla de cambiar la
         * contraseña nunca se abre.
         *
         * Se construye con `location.origin` a propósito: así vale igual en
         * localhost mientras se desarrolla y en el dominio en producción, sin
         * una variable más que mantener.
         */
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/nueva-clave`,
        });
        if (error) throw error;
        /**
         * ⚠️ El mensaje NO confirma que ese correo tenga cuenta, y es
         * deliberado: un "ese correo no existe" convierte el formulario en una
         * forma cómoda de averiguar quién es cliente. Supabase tampoco lo
         * distingue en la respuesta.
         */
        setOk(
          'Si ese correo tiene cuenta, le acaba de llegar un enlace para cambiar la contraseña. ' +
            'Revisa también la carpeta de spam.',
        );
        setModo('entrar');
      } else {
        const { error } = await sb.auth.signUp({ email, password: clave });
        if (error) throw error;
        /**
         * ⚠️ NO digas "cuenta creada". No sabes si lo está.
         *
         * Cuando el correo YA tiene cuenta, Supabase no devuelve error: contesta
         * con un usuario falso (`role: ""`, `identities: []`) para que nadie
         * pueda usar este formulario como buscador de clientes. Comprobado
         * contra el proyecto real. Así que aquí un "cuenta creada" sería mentira
         * la mitad de las veces, y encima la mitad mala: quien ya tenía cuenta
         * se quedaría esperando un correo de confirmación que no necesita.
         *
         * El texto cubre los dos casos sin distinguirlos, que es justo lo que
         * hay que hacer.
         */
        setOk(
          'Revisa tu correo (y la carpeta de spam) para confirmar la cuenta. Si ese correo ya tenía una, ' +
            'entra con tu contraseña de siempre. Después damos de alta tu negocio y ya ves datos.',
        );
        setModo('entrar');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? traducir(err.message)
          : 'No se pudo completar la operación. Inténtalo otra vez.',
      );
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
          <div className="acceso__error">
            Define <b>NEXT_PUBLIC_SUPABASE_URL</b> y <b>NEXT_PUBLIC_SUPABASE_ANON_KEY</b>. En local
            van en <b>.env.local</b> (copia <b>.env.example</b>); en Vercel, en Settings ›
            Environment Variables, y hay que volver a desplegar para que entren.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="acceso">
      <form className="acceso__card" onSubmit={enviar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="acceso__logo" src="/assets/logos/logo-principal.webp" alt="Vendemia" />
        <h1>
          {modo === 'entrar'
            ? 'Entra a tu panel'
            : modo === 'crear'
              ? 'Crea tu cuenta'
              : 'Recupera tu contraseña'}
        </h1>
        <p className="sub">
          {modo === 'entrar'
            ? 'Mia trabaja mientras tú miras los números.'
            : modo === 'crear'
              ? 'Después activamos tu negocio y ya tienes datos.'
              : 'Te mandamos un enlace para poner una nueva.'}
        </p>

        {/* Recuperando no pinta nada: quien pide un enlace ya eligió el correo
            como su forma de entrar. */}
        {modo !== 'recuperar' && <BotonGoogle alFallar={(m) => setError(m)} />}

        <label className="field-label" htmlFor="email">
          Correo
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@correo.com"
        />

        {/* Recuperando solo hace falta el correo: pedir una contraseña que no
            se va a usar confunde y hace pensar que hay que acertar la vieja. */}
        {modo !== 'recuperar' && (
          <>
            <label className="field-label" htmlFor="clave">
              Contraseña
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="clave"
                className="input"
                type={verClave ? 'text' : 'password'}
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                required
                minLength={6}
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
          </>
        )}

        {modo === 'entrar' && (
          <p className="acceso__alt" style={{ textAlign: 'right', marginTop: 10 }}>
            <button type="button" onClick={() => setModo('recuperar')}>
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        )}

        {error && <div className="acceso__error">{error}</div>}
        {ok && <div className="acceso__ok">{ok}</div>}

        <button className="btn btn-primary" type="submit" disabled={enviando}>
          {enviando
            ? 'Un momento…'
            : modo === 'entrar'
              ? 'Ingresar'
              : modo === 'crear'
                ? 'Crear cuenta'
                : 'Enviarme el enlace'}
          {!enviando && <ArrowRight size={18} />}
        </button>

        <p className="acceso__alt">
          {modo === 'entrar' ? (
            <>
              ¿Todavía no tienes cuenta?{' '}
              <button type="button" onClick={() => setModo('crear')}>
                Créala aquí
              </button>
            </>
          ) : (
            <>
              ¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => setModo('entrar')}>
                Entra
              </button>
            </>
          )}
        </p>
        <p className="acceso__alt">
          <Link href="/">← Volver a vendemia</Link>
        </p>
      </form>
    </div>
  );
}

/** Los mensajes de Supabase Auth vienen en inglés y de cara al cliente no valen. */
function traducir(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Tienes que confirmar el correo antes de entrar.';
  if (m.includes('user already registered')) return 'Ese correo ya tiene cuenta. Entra con tu contraseña.';
  if (m.includes('password should be at least'))
    return 'La contraseña es muy corta: mínimo 6 caracteres.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  if (m.includes('failed to fetch'))
    return 'No se pudo conectar con Supabase. Revisa tu conexión y que la URL del proyecto sea la correcta.';
  return msg;
}
