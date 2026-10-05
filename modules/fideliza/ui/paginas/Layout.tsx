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
import { ProveedorFideliza, useFideliza, type Modo } from '@/modules/fideliza/ui/Contexto';
import { Cargando, Fallo, SinConexion, SinPermiso } from '@/modules/fideliza/ui/Estados';
import '@/modules/fideliza/estilos/panel.css';

/**
 * Las pestañas según el modo (ver Contexto). Quien solo quiere su página de
 * enlaces no tiene por qué ver caja, clientes ni campañas: tres pestañas y ya.
 */
const PESTANAS: { href: string; label: string; permiso: string; modos: Modo[] }[] = [
  { href: '/panel/fideliza', label: 'Inicio', permiso: 'program.read', modos: ['nuevo', 'enlaces', 'fidelizacion'] },
  { href: '/panel/fideliza/caja', label: 'Caja', permiso: 'ops.record', modos: ['fidelizacion'] },
  { href: '/panel/fideliza/clientes', label: 'Clientes', permiso: 'members.read', modos: ['fidelizacion'] },
  { href: '/panel/fideliza/mi-pagina', label: 'Mi página', permiso: 'program.read', modos: ['enlaces', 'fidelizacion'] },
  { href: '/panel/fideliza/programa', label: 'Programa de puntos', permiso: 'program.read', modos: ['fidelizacion'] },
  { href: '/panel/fideliza/placas', label: 'Placas y QR', permiso: 'program.read', modos: ['enlaces', 'fidelizacion'] },
  { href: '/panel/fideliza/enlaces', label: 'Perfiles de placas', permiso: 'links.manage', modos: ['fidelizacion'] },
  { href: '/panel/fideliza/campanas', label: 'Campañas', permiso: 'program.read', modos: ['fidelizacion'] },
  { href: '/panel/fideliza/ajustes', label: 'Ajustes', permiso: 'program.read', modos: ['fidelizacion'] },
];

function Marco({ children }: { children: React.ReactNode }) {
  const ruta = usePathname();
  const { rol, puede, cargando, error, recargar, companyId, modo } = useFideliza();
  const activa = (h: string) => (h === '/panel/fideliza' ? ruta === h : ruta.startsWith(h));

  return (
    <main className="main">
      <div className="wrap">
        <Topbar
          titulo="Fideliza"
          sub={modo === 'fidelizacion' ? 'Tu página, tarjeta de puntos, placas NFC/QR y Google Wallet' : 'Tu página de enlaces y tus placas NFC/QR'}
        />
        <nav className="fz-tabs" aria-label="Secciones de Fideliza">
          {PESTANAS.filter((p) => (!rol || puede(p.permiso)) && p.modos.includes(modo)).map((p) => (
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
