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
  Percent,
  Receipt,
  Send,
  Settings,
  Sparkles,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { useSesion } from './Sesion';
import { esRutaGlobal } from '@/lib/panel/rutas';
import { esAppointmentFamily, esCita, esEcommerce } from '@/lib/panel/modo';
import { vocabulario } from '@/lib/panel/vocabulario';
import type { BusinessMode } from '@/lib/supabase/types';

const NAV = [
  { href: '/panel', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/panel/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { href: '/panel/leads', icon: Users, label: 'Leads' },
  { href: '/panel/retargeting', icon: Send, label: 'Retargeting' },
  // Agenda es de todo negocio que agenda: citas Y grupos recurrentes.
  { href: '/panel/agenda', icon: CalendarDays, label: 'Agenda', sirveA: esAppointmentFamily },
  // Equipo es solo de `appointment`, no de toda la familia: es donde Mia
  // reparte reservas entre profesionales (ask_employee), y eso no existe en
  // recurring_appointment — sus grupos van por schedule_slots, sin asignar
  // persona. Mismo criterio que ya aplicaba equipo/page.tsx:235.
  { href: '/panel/equipo', icon: UserCog, label: 'Equipo', sirveA: esCita },
  { href: '/panel/comisiones', icon: Percent, label: 'Comisiones', sirveA: esCita },
  // Pedidos es del negocio que vende productos: una barbería no crea pedidos.
  { href: '/panel/pedidos', icon: Receipt, label: 'Pedidos', sirveA: esEcommerce },
  { href: '/panel/caja', icon: Wallet, label: 'Caja' },
  { href: '/panel/catalogo', icon: Package, label: 'Catálogo' },
  { href: '/panel/metricas', icon: BarChart2, label: 'Métricas' },
  { href: '/panel/configuracion', icon: Settings, label: 'Ajustes' },
];

/**
 * @param soloGlobal admin de plataforma sin membresías: solo puede abrir las
 *        pantallas que no dependen de una compañía. Enseñarle las otras siete
 *        sería ofrecerle siete pantallas en blanco. Ver lib/panel/rutas.ts.
 * @param modo `business_mode` de la compañía activa. `undefined` mientras
 *        `useSesion()` todavía no lo trae —el primer render— y se enseñan
 *        los diez ítems: es un parpadeo de un instante, no un hueco de
 *        seguridad, así que la duda se resuelve mostrando de más y no de
 *        menos. `null` si la compañía no tiene modo asignado: mismo criterio.
 */
export default function Sidebar({
  pendientes = 0,
  soloGlobal = false,
  modo,
}: {
  pendientes?: number;
  soloGlobal?: boolean;
  modo?: BusinessMode | null;
}) {
  const ruta = usePathname();
  const { salir } = useSesion();

  const nav = NAV.filter((n) => {
    if (soloGlobal) return esRutaGlobal(n.href);
    // modo == null cubre undefined (primer render) Y null (compañía sin modo
    // asignado): en los dos casos se enseña de más, nunca de menos.
    if (!n.sirveA || modo == null) return true;
    return n.sirveA(modo);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/logos/logo-naranja.webp" alt="Vendemia" />
      </div>

      <nav className="sidebar__nav">
        {nav.map(({ href, icon: Icono, label: fijo }) => {
          // «Agenda» en una barbería, «Clases» en una academia. Ver lib/panel/vocabulario.
          const label = href === '/panel/agenda' ? vocabulario(modo).agenda : fijo;
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
