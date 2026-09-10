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
  Package,
  Receipt,
  Send,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { useSesion } from './Sesion';
import { esRutaGlobal } from '@/lib/panel/rutas';

const NAV = [
  { href: '/panel', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/panel/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { href: '/panel/leads', icon: Users, label: 'Leads' },
  { href: '/panel/retargeting', icon: Send, label: 'Retargeting' },
  { href: '/panel/agenda', icon: CalendarDays, label: 'Agenda' },
  { href: '/panel/pedidos', icon: Receipt, label: 'Pedidos' },
  { href: '/panel/catalogo', icon: Package, label: 'Catálogo' },
  { href: '/panel/metricas', icon: BarChart2, label: 'Métricas' },
  { href: '/panel/configuracion', icon: Settings, label: 'Ajustes' },
];

/**
 * @param soloGlobal admin de plataforma sin membresías: solo puede abrir las
 *        pantallas que no dependen de una compañía. Enseñarle las otras siete
 *        sería ofrecerle siete pantallas en blanco. Ver lib/panel/rutas.ts.
 */
export default function Sidebar({
  pendientes = 0,
  soloGlobal = false,
}: {
  pendientes?: number;
  soloGlobal?: boolean;
}) {
  const ruta = usePathname();
  const { salir } = useSesion();

  const nav = soloGlobal ? NAV.filter((n) => esRutaGlobal(n.href)) : NAV;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logos/logo-naranja.webp" alt="Vendemia" />
      </div>

      <nav className="sidebar__nav">
        {nav.map(({ href, icon: Icono, label }) => {
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
        {/* El anuncio lleva a /panel/metricas, que el admin de plataforma no
            puede abrir: sería un botón que devuelve a esta misma pantalla. Y de
            todas formas el reclamo comercial no es para él. */}
        {!soloGlobal && (
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
        )}
        <div className="sidebar__logout" onClick={() => void salir()}>
          <LogOut size={18} /> Cerrar sesión
        </div>
      </div>
    </aside>
  );
}
