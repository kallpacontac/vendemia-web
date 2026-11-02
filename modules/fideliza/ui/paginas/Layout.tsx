'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIDELIZA · el módulo de fidelización dentro del panel
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una entrada en la barra lateral y, dentro, sus propias pestañas. Comparte
 * sesión, compañía activa, avisos y estilos con el resto del panel; lo que
 * cambia es de dónde salen los datos: tablas loyalty_* (Postgres es la verdad)
 * en vez del espejo del bot. Ver modules/fideliza/cliente/api.ts.
 */
import { usePathname } from 'next/navigation';
import Topbar from '@/components/panel/Topbar';
import { ProveedorFideliza, useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinConexion, SinPermiso } from '@/modules/fideliza/ui/Estados';
import NavSecciones from '@/modules/fideliza/ui/NavSecciones';
import { seccionesDe } from '@/modules/fideliza/ui/secciones';
import '@/modules/fideliza/estilos/panel.css';

function Marco({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const { rol, puede, cargando, error, recargar, companyId, modo } = useFideliza();

  return (
    <main className="main main--fideliza">
      <div className="wrap">
        <Topbar
          titulo="Fideliza"
          sub={modo === 'fidelizacion' ? 'Tu página, tarjeta de puntos, placas NFC/QR y Google Wallet' : 'Tu página de enlaces y tus placas NFC/QR'}
        />
        <NavSecciones secciones={seccionesDe(modo, (permiso) => !rol || puede(permiso))} ruta={ruta} />
        <SinConexion />
        {!companyId || (cargando && !rol) ? (
          <Cargando texto="Cargando Fideliza…" />
        ) : error ? (
          <Fallo
            texto={
              /loyalty_role|function|relation/i.test(error)
                ? 'Fideliza todavía no está instalado en la base de datos (faltan las migraciones de modules/fideliza/sql).'
                : 'No se pudo cargar Fideliza.'
            }
            reintentar={recargar}
          />
        ) : !rol ? (
          <SinPermiso que="Fideliza" />
        ) : (
          children
        )}
      </div>
    </main>
  );
}

export default function FidelizaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProveedorFideliza>
      <Marco>{children}</Marco>
    </ProveedorFideliza>
  );
}
