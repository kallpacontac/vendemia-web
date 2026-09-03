'use client';

import '../panel.css';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProveedorSesion, useSesion } from '@/components/panel/Sesion';
import { ProveedorAvisos } from '@/components/panel/Avisos';
import Sidebar from '@/components/panel/Sidebar';
import AvisoBot from '@/components/panel/AvisoBot';
import { ProveedorSalud } from '@/components/panel/Salud';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL PANEL · sesión, barra lateral y guardia de entrada
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todo el panel es cliente. No hay renderizado en servidor a propósito: la
 * sesión de Supabase vive en el navegador y cada consulta la manda con la clave
 * `anon`, que respeta RLS. Un panel que pintara datos en el servidor tendría
 * que llevar la sesión al servidor sin ganar nada — los datos son privados por
 * definición, no hay nada que cachear ni que indexar.
 *
 * ⚠️ Esta guardia es COMODIDAD, no seguridad. Lo que protege los datos es el
 * RLS de Postgres: sin sesión, `revoke all ... from anon` deja las consultas a
 * cero filas. Aquí solo evitamos enseñar una pantalla vacía a quien todavía no
 * ha entrado.
 */
function Guardia({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { session, cargando, companias, companyId } = useSesion();

  useEffect(() => {
    if (!cargando && !session) router.replace('/login');
  }, [cargando, session, router]);

  if (cargando || !session) {
    return (
      <div className="cargando">
        <div className="spin" />
        {cargando ? 'Cargando tu panel…' : 'Necesitas iniciar sesión…'}
      </div>
    );
  }

  /**
   * Cuenta sin membresía. Pasa siempre que alguien se da de alta por su cuenta
   * desde la landing: signUp() crea el usuario, pero la compañía la crea Alvaro
   * con `npm run onboard`. Sin este mensaje, el panel sería una pantalla en
   * blanco sin explicación — y las consultas devolverían cero filas, que es
   * exactamente lo que el RLS tiene que hacer.
   */
  if (!companias.length || !companyId) {
    return (
      <div className="cargando">
        <div className="vacio">
          <b>Tu cuenta todavía no tiene un negocio asignado</b>
          Ya está creada y la contraseña funciona. Falta que demos de alta tu negocio y te
          demos acceso; escríbenos y lo dejamos listo.
          <br />
          <br />
          <Link href="/" className="btn btn-ghost btn-sm">
            Volver a la web
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <AvisoBot />
      <Sidebar />
      {children}
    </>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorSesion>
      {/* Salud va DENTRO de Sesión (necesita la compañía activa) y FUERA de la
          guardia, para que la píldora de la barra superior y el aviso flotante
          lean la misma consulta en vez de hacer una cada uno.

          ⚠️ Y va POR ENCIMA de Avisos, no por debajo: useComando() consulta la
          salud para no hacerte esperar 15 segundos a un bot que ya sabemos que
          está apagado. Si se invierte el orden, ese useSalud() revienta. */}
      <ProveedorSalud>
        <ProveedorAvisos>
          <Guardia>{children}</Guardia>
        </ProveedorAvisos>
      </ProveedorSalud>
    </ProveedorSesion>
  );
}
