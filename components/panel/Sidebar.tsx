'use client';

/**
 * La barra lateral del panel. Es el mismo marcado que generaba
 * public/assets/data.js (renderSidebar), pero con rutas de Next, el ítem
 * activo resuelto desde la URL y el logout de verdad.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart2,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { useSesion } from './Sesion';

const NAV = [
  { href: '/panel', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/panel/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { href: '/panel/leads', icon: Users, label: 'Leads' },
  { href: '/panel/agenda', icon: CalendarDays, label: 'Agenda' },
  { href: '/panel/metricas', icon: BarChart2, label: 'Métricas' },
  { href: '/panel/configuracion', icon: Settings, label: 'Ajustes' },
];

export default function Sidebar({ pendientes = 0 }: { pendientes?: number }) {
  const ruta = usePathname();
  const { salir } = useSesion();

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logos/logo-principal.webp" alt="Vendemia" />
      </div>

      <nav className="sidebar__nav">
        {NAV.map(({ href, icon: Icono, label }) => {
          // El dashboard es prefijo de todo lo demás: solo coincide exacto.
          const activo = href === '/panel' ? ruta === '/panel' : ruta.startsWith(href);
          return (
            <Link key={href} href={href} className={`nav-item ${activo ? 'active' : ''}`}>
              <span className="ico">
                <Icono size={18} />
              </span>
              <span>{label}</span>
              {href === '/panel/mensajes' && pendientes > 0 && (
                <span className="badge">{pendientes}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar__foot">
        <div className="sidebar__promo">
          <div className="ic">
            <Sparkles size={22} />
          </div>
          <p>
            Desbloquea reportes y automatizaciones con <b>Vendemia Pro</b>
          </p>
          <Link href="/panel/metricas">
            <button type="button">Descubrir Pro</button>
          </Link>
        </div>
        <div className="sidebar__logout" onClick={() => void salir()}>
          <LogOut size={18} /> Cerrar sesión
        </div>
      </div>
    </aside>
  );
}
