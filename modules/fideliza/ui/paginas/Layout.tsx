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
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Topbar from '@/components/panel/Topbar';
import { ProveedorFideliza, useFideliza } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinConexion, SinPermiso } from '@/modules/fideliza/ui/Estados';
import '@/modules/fideliza/estilos/panel.css';

const PESTANAS = [
  { href: '/panel/fideliza', label: 'Resumen', permiso: 'program.read' },
  { href: '/panel/fideliza/caja', label: 'Caja', permiso: 'ops.record' },
  { href: '/panel/fideliza/clientes', label: 'Clientes', permiso: 'members.read' },
  { href: '/panel/fideliza/programa', label: 'Programa', permiso: 'program.read' },
  { href: '/panel/fideliza/placas', label: 'Placas', permiso: 'program.read' },
  { href: '/panel/fideliza/enlaces', label: 'Enlaces', permiso: 'program.read' },
  { href: '/panel/fideliza/campanas', label: 'Campañas', permiso: 'program.read' },
  { href: '/panel/fideliza/ajustes', label: 'Ajustes', permiso: 'program.read' },
];

function Marco({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const { rol, puede, cargando, error, recargar, companyId } = useFideliza();
  const activa = (h: string) => (h === '/panel/fideliza' ? ruta === h : ruta.startsWith(h));

  return (
    <main className="main">
      <div className="wrap">
        <Topbar titulo="Fideliza" sub="Tarjetas de cliente, placas NFC/QR y Google Wallet" />
        <nav className="fz-tabs" aria-label="Secciones de Fideliza">
          {PESTANAS.filter((p) => !rol || puede(p.permiso)).map((p) => (
            <Link key={p.href} href={p.href} className={activa(p.href) ? 'active' : ''} aria-current={activa(p.href) ? 'page' : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
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
