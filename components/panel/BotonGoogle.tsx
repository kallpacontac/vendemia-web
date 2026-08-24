'use client';

/**
 * «Continuar con Google».
 *
 * Un solo botón hace las dos cosas: si el correo de Google no tenía cuenta, la
 * crea; si la tenía, entra. OAuth no distingue alta de acceso, y está bien que
 * no lo haga — nadie que llega aquí quiere pensar en cuál de las dos es.
 *
 * La cuenta nueva llega SIN membresía, igual que un alta por correo, así que ve
 * la pantalla «tu cuenta todavía no tiene un negocio asignado». El aislamiento
 * lo sostiene el RLS, al que le da igual cómo entraste.
 *
 * ⚠️ El logotipo va como SVG en línea, no desde un CDN: la landing y el panel
 * no cargan recursos de terceros, y un `<img>` a servidores de Google en la
 * pantalla de acceso sería el único.
 */
import { useEffect, useState } from 'react';
import { googleActivado, supabase } from '@/lib/supabase/client';

export default function BotonGoogle({ alFallar }: { alFallar: (mensaje: string) => void }) {
  const [yendo, setYendo] = useState(false);
  /**
   * `null` = todavía no se sabe. Mientras tanto no se pinta nada: enseñar el
   * botón y quitarlo medio segundo después es peor que enseñarlo un poco tarde.
   */
  const [disponible, setDisponible] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    void googleActivado().then((si) => {
      if (vivo) setDisponible(si);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function entrar() {
    setYendo(true);
    try {
      const { error } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          /**
           * Tiene que estar en Authentication › URL Configuration › Redirect
           * URLs de Supabase, EXACTA. Si no, la vuelta acaba en el Site URL y
           * el usuario aterriza en la landing sin entender qué pasó.
           *
           * Con `location.origin` vale igual en localhost y en producción sin
           * otra variable de entorno que mantener — mismo criterio que en
           * `resetPasswordForEmail`.
           */
          redirectTo: `${window.location.origin}/callback`,
        },
      });
      if (error) throw error;
      // Si no hubo error, el navegador ya se está yendo a Google. No se quita
      // el "yendo": que el botón siga ocupado hasta que la página cambie.
    } catch (e) {
      setYendo(false);
      const m = e instanceof Error ? e.message : 'No se pudo abrir el acceso con Google';
      alFallar(
        /provider is not enabled/i.test(m)
          ? 'El acceso con Google todavía no está activado en Supabase.'
          : m,
      );
    }
  }

  if (!disponible) return null;

  return (
    <>
    <button type="button" className="btn-google" onClick={() => void entrar()} disabled={yendo}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34A853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#FBBC05"
          d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34A21.99 21.99 0 0 0 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#EA4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
      {yendo ? 'Abriendo Google…' : 'Continuar con Google'}
    </button>
    {/* El separador vive AQUÍ y no en la pantalla de acceso: si el botón no se
        pinta —Google sin activar—, un "o con tu correo" suelto encima del
        formulario no tendría ningún sentido. Los dos aparecen o ninguno. */}
    <div className="separador">o con tu correo</div>
    </>
  );
}
