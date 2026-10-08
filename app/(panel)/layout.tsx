'use client';

import '../panel.css';
import '../panel-shared.css';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ProveedorSesion, useSesion } from '@/components/panel/Sesion';
import { ProveedorAvisos } from '@/components/panel/Avisos';
import Sidebar from '@/components/panel/Sidebar';
import { ProveedorSalud } from '@/components/panel/Salud';
import { BandaDemo } from '@/components/panel/Demo';
import { RUTA_GLOBAL_POR_DEFECTO, esRutaGlobal } from '@/lib/panel/rutas';
import { guardarDestino, rutaActual } from '@/lib/panel/destino';
import AltaNegocio from '@/components/panel/AltaNegocio';
import Instalable from '@/components/panel/Instalable';
import BannerApp from '@/components/panel/BannerApp';

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
  const ruta = usePathname();
  const { session, cargando, reconectando, companias, companyId, esAdminPlataforma, compania, salir } = useSesion();

  /** Sin compañía activa: o es una cuenta recién creada, o es el admin de plataforma. */
  const sinCompania = !companias.length || !companyId;
  /**
   * Admin de la plataforma sin membresías. Entra, pero SOLO a lo global: el
   * resto de pantallas empiezan por `if (!companyId) return null` y se quedarían
   * en blanco o cargando para siempre. Ver lib/panel/rutas.ts.
   */
  const soloGlobal = sinCompania && esAdminPlataforma;

  /**
   * ⚠️ `reconectando` es la diferencia entre "no has entrado" y "ahora mismo no
   * llego al servidor". Sin ella, despertar el portátil después de unas horas
   * te mandaba al login y, un segundo después, de vuelta al panel: el refresco
   * había fallado por la red y luego funcionó. Ver Sesion.tsx.
   */
  useEffect(() => {
    if (!cargando && !reconectando && !session) {
      // Al volver del login (o de Google) se retoma esta pantalla. Ver lib/panel/destino.ts.
      guardarDestino(rutaActual());
      router.replace('/login');
    }
  }, [cargando, reconectando, session, router]);

  /**
   * El admin que abre `/panel` a pelo —o que tiene el dashboard en marcadores—
   * acaba en la única pantalla que puede usar, en vez de en una en blanco.
   */
  useEffect(() => {
    if (!cargando && soloGlobal && !esRutaGlobal(ruta)) router.replace(RUTA_GLOBAL_POR_DEFECTO);
  }, [cargando, soloGlobal, ruta, router]);

  if (cargando || reconectando || !session) {
    return (
      <div className="cargando">
        <div className="spin" />
        {cargando
          ? 'Cargando tu panel…'
          : reconectando
            ? 'Reconectando…'
            : 'Necesitas iniciar sesión…'}
      </div>
    );
  }

  /**
   * Cuenta sin membresía: se da de alta desde la landing, con Google o desde
   * una placa nueva. Ya no es un «escríbenos»: crea su negocio aquí mismo
   * (AltaNegocio → loyalty_business_create) y entra.
   */
  if (sinCompania && !esAdminPlataforma) {
    return <AltaNegocio salir={salir} />;
  }

  /*
    Aquí vivía <AvisoBot />, un aviso fijo con el diagnóstico del bot.

    Se quita porque decía por tercera vez lo que ya dicen la píldora de la barra
    superior y la tarjeta "Estado del bot" del dashboard. Y estaba flotando
    sobre el contenido: un mensaje que no se puede cerrar, tapando pantalla, con
    información que está dos clics más arriba, es de las cosas que enseñan a la
    gente a ignorar los avisos.

    Si alguna vez hace falta un aviso realmente bloqueante —el bot lleva días
    caído y el dueño no se ha enterado—, que sea uno que se pueda cerrar y que
    diga algo que no esté ya en pantalla.
  */
  /* El `router.replace` de arriba está en camino: no se pinta una pantalla que
     va a desaparecer, ni la de "sin negocio" que aquí sería mentira. */
  if (soloGlobal && !esRutaGlobal(ruta)) {
    return (
      <div className="cargando">
        <div className="spin" />
        Abriendo Retargeting…
      </div>
    );
  }

  return (
    <>
      <BandaDemo />
      <Sidebar soloGlobal={soloGlobal} modo={compania?.business_mode} />
      {children}
      {/* Instalar la app y activar los avisos, abajo y sin ir a Ajustes. */}
      {!soloGlobal && <BannerApp />}
    </>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorSesion>
      {/* Manifest, service worker y el «Instalar» de Android: el panel como app. */}
      <Instalable />
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
