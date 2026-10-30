'use client';

/**
 * La barra lateral del panel. Es el mismo marcado que generaba
 * public/assets/data.js (renderSidebar), pero con rutas de Next, el ítem
 * activo resuelto desde la URL y el logout de verdad.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart2,
  CalendarDays,
  Gift,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Package,
  Percent,
  Receipt,
  Send,
  Factory,
  Settings,
  Sparkles,
  Store,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { useSesion } from './Sesion';
import MarcaMia from './MarcaMia';
import { useCargar } from './useCargar';
import { RUTA_MI_AGENDA, RUTA_MI_CATALOGO, RUTA_MI_COMISION, esRutaGlobal, rutaPermitida } from '@/lib/panel/rutas';
import { puedeUsarAsistente } from '@/lib/panel/asistente';
import { puedeVer, rolDeNegocio } from '@/lib/panel/roles';
import { esAppointmentFamily, esCita, esEcommerce, esRecurrente } from '@/lib/panel/modo';
import { vocabulario } from '@/lib/panel/vocabulario';
import { estadoConsumo } from '@/lib/panel/consumo';
import { PLANES, miles } from '@/lib/planes';
import { getConsumo } from '@/lib/supabase/queries';
import type { BusinessMode } from '@/lib/supabase/types';
import { useLoQueHaceLaPagina } from '@/modules/tu-pagina/ui/secciones';

const NAV = [
  { href: '/panel', icon: LayoutDashboard, label: 'Dashboard' },
  // Las dos pantallas del empleado. Solo existen tras el corte de roles, y solo
  // para él: quién ve cada entrada lo decide `rutaPermitida` (lib/panel/rutas.ts).
  { href: RUTA_MI_AGENDA, icon: CalendarDays, label: 'Mi agenda', sirveA: esAppointmentFamily },
  { href: RUTA_MI_COMISION, icon: Percent, label: 'Mi comisión', sirveA: esCita },
  { href: RUTA_MI_CATALOGO, icon: Package, label: 'Catálogo' },
  // El dueño le pregunta a Mia por su negocio. Se enseña en cualquier plan
  // —quien decide si hay asistente es el bot—, pero no al empleado: ver
  // puedeUsarAsistente en lib/panel/asistente.ts.
  // «Mia Gerente»: el nombre comercial del asistente del dueño (Alvaro, 14-oct-2026).
  { href: '/panel/asistente', icon: Sparkles, label: 'Mia Gerente', sinEmpleado: true },
  { href: '/panel/mensajes', icon: MessageCircle, label: 'Mensajes' },
  { href: '/panel/leads', icon: Users, label: 'Leads' },
  { href: '/panel/retargeting', icon: Send, label: 'Retargeting' },
  // Agenda es de todo negocio que agenda: citas Y grupos recurrentes.
  { href: '/panel/agenda', icon: CalendarDays, label: 'Agenda', sirveA: esAppointmentFamily },
  // Alumnos es de la academia: quién está inscrito, hasta cuándo y si debe.
  { href: '/panel/alumnos', icon: GraduationCap, label: 'Alumnos', sirveA: esRecurrente },
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
  // Tarjetas de cliente, placas NFC/QR y Google Wallet. Tiene sus pestañas
  // dentro (app/(panel)/panel/fideliza/layout.tsx). En el móvil va en «Más».
  { href: '/panel/fideliza', icon: Gift, label: 'Fideliza' },
  // La página pública del negocio (tienda.* o agenda.*, según el modo). Lo que se
  // pide por ella (pedidos y envíos) está en Pedidos. Vive en modules/tu-pagina.
  { href: '/panel/tu-pagina', icon: Store, label: 'Mi página' },
  { href: '/panel/metricas', icon: BarChart2, label: 'Métricas' },
  // Stock de placas sin dueño. Solo el superadmin (platform_admins); la base lo
  // exige igual en loyalty_admin_device_batch/order.
  { href: '/panel/fabrica', icon: Factory, label: 'Fábrica de placas', soloAdmin: true },
  { href: '/panel/configuracion', icon: Settings, label: 'Ajustes' },
];

/**
 * ══════════════════════════════════════════════════════════════════════════
 * MÓVIL · cuatro fijas y «Más»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * En el teléfono la barra baja al pie. Con las once entradas en fila tocaban a
 * 35 px cada una, con rótulos de 9 px, y Caja, Catálogo, Métricas y Ajustes
 * quedaban fuera de la pantalla detrás de un scroll lateral que nada indicaba.
 *
 * Se quedan a la vista las cuatro que se usan de pie en el local, y el resto
 * va en una hoja que abre «Más». En escritorio no cambia nada: la hoja y el
 * botón solo se ven por debajo de 820 px (panel.css).
 *
 * La tercera es Agenda o, en una tienda (que no tiene agenda), Pedidos.
 */
// En una academia, Alumnos va antes que Caja: es lo que se mira a diario.
const FIJAS_MOVIL = ['/panel', RUTA_MI_AGENDA, RUTA_MI_COMISION, '/panel/mensajes', '/panel/agenda', '/panel/pedidos', '/panel/alumnos', '/panel/caja'];
const MAX_FIJAS_MOVIL = 4;

type Entrada = (typeof NAV)[number];

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
  const { salir, compania, esAdminPlataforma, companyId, canchas } = useSesion();
  // Mi página puede reservar, vender o agendar envíos aunque el negocio sea de otro
  // tipo: entonces también le toca la Agenda o Pedidos, que es donde entra lo de la página.
  const pagina = useLoQueHaceLaPagina(soloGlobal ? null : companyId);
  const [masAbierto, setMasAbierto] = useState(false);

  // Al cambiar de pantalla la hoja se cierra: ya cumplió.
  useEffect(() => setMasAbierto(false), [ruta]);

  const nav = NAV.filter((n) => {
    if ('soloAdmin' in n && n.soloAdmin && !esAdminPlataforma) return false;
    if (soloGlobal) return esRutaGlobal(n.href);
    if ('sinEmpleado' in n && n.sinEmpleado && !puedeUsarAsistente(rolDeNegocio(compania?.rol))) return false;
    // Lo que no es de su rol no se le ofrece. Antes del corte, sí a todo.
    if (!rutaPermitida(n.href, rolDeNegocio(compania?.rol))) return false;
    // modo == null cubre undefined (primer render) Y null (compañía sin modo
    // asignado): en los dos casos se enseña de más, nunca de menos.
    if (!n.sirveA || modo == null) return true;
    if (n.href === '/panel/agenda' && pagina.reserva) return true;
    if (n.href === '/panel/pedidos' && (pagina.vende || pagina.envios)) return true;
    return n.sirveA(modo);
  });

  const fijas = new Set(
    nav
      .filter((n) => FIJAS_MOVIL.includes(n.href))
      .slice(0, MAX_FIJAS_MOVIL)
      .map((n) => n.href),
  );
  const extra = nav.filter((n) => !fijas.has(n.href));
  // El dashboard es prefijo de todo lo demás: solo coincide exacto.
  const esActivo = (href: string) => (href === '/panel' ? ruta === '/panel' : ruta.startsWith(href));
  // Estando en una de las de «Más», es «Más» la que se ilumina: si no, en la
  // barra del teléfono no se vería dónde estás.
  const extraActiva = extra.some((n) => esActivo(n.href));

  const rutaOperacion = esEcommerce(modo) ? '/panel/pedidos' : '/panel/agenda';
  const rail = nav.filter((n) =>
    ['/panel', RUTA_MI_AGENDA, RUTA_MI_COMISION, RUTA_MI_CATALOGO, '/panel/asistente', '/panel/mensajes', rutaOperacion, '/panel/leads', '/panel/caja', '/panel/configuracion'].includes(n.href),
  );
  const railExtra = nav.filter((n) => !rail.some((r) => r.href === n.href));
  const railExtraActiva = railExtra.some((n) => esActivo(n.href));

  const pintar = ({ href, icon: Icono, label: fijo }: Entrada, enHoja = false) => {
    // «Agenda» en una barbería, «Clases» en una academia. Ver lib/panel/vocabulario.
    const label =
      href === '/panel/agenda' ? vocabulario(modo, { canchas }).agenda : href === RUTA_MI_AGENDA && esRecurrente(modo) ? 'Mis clases' : fijo;
    const clases = [
      'nav-item',
      esActivo(href) ? 'active' : '',
      // En la barra del teléfono solo se ven las fijas; el resto, en la hoja.
      !enHoja && !fijas.has(href) ? 'nav-item--extra' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Link key={href} href={href} className={clases} title={label}>
        <span className="ico">
          <Icono size={18} />
        </span>
        <span>{label}</span>
        {href === '/panel/mensajes' && pendientes > 0 && <span className="badge">{pendientes}</span>}
      </Link>
    );
  };

  return (
    <aside className="sidebar">
      <Link href="/panel" className="sidebar__brand sidebar__brand--mia" aria-label="Mia · Ir al resumen">
        <MarcaMia />
      </Link>

      <nav className="sidebar__nav sidebar__nav--desktop" aria-label="Navegación principal">
        {rail.map((n) => pintar(n))}
        {railExtra.length > 0 && (
          <button
            type="button"
            className={`nav-item nav-mas nav-mas--desktop ${railExtraActiva || masAbierto ? 'active' : ''}`}
            aria-expanded={masAbierto}
            aria-controls="nav-hoja"
            title="Más módulos"
            onClick={() => setMasAbierto((v) => !v)}
          >
            <span className="ico"><MoreHorizontal size={18} /></span>
            <span>Más</span>
          </button>
        )}
      </nav>

      <nav className="sidebar__nav sidebar__nav--mobile" aria-label="Navegación móvil">
        {nav.map((n) => pintar(n))}
        {extra.length > 0 && (
          <button
            type="button"
            className={`nav-item nav-mas ${extraActiva || masAbierto ? 'active' : ''}`}
            aria-expanded={masAbierto}
            aria-controls="nav-hoja"
            onClick={() => setMasAbierto((v) => !v)}
          >
            <span className="ico">
              <MoreHorizontal size={18} />
            </span>
            <span>Más</span>
          </button>
        )}
      </nav>

      {masAbierto && (
        <>
          <div className="nav-velo" onClick={() => setMasAbierto(false)} aria-hidden="true" />
          <nav id="nav-hoja" className="nav-hoja" aria-label="Más secciones">
            {extra.map((n) => pintar(n, true))}
          </nav>
        </>
      )}

      <div className="sidebar__foot">
        {/* El admin de plataforma no tiene plan propio: no se le enseña. */}
        {!soloGlobal && puedeVer(rolDeNegocio(compania?.rol), 'plan.ver') && <TuPlan />}
        <button type="button" className="sidebar__logout" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={() => void salir()}>
          <LogOut size={18} /><span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * TU PLAN · donde estaba el anuncio de «Vendemia Pro»
 * ══════════════════════════════════════════════════════════════════════════
 *
 * «Vendemia Pro» no existe: los planes son Starter, Seller y Best Seller. El
 * hueco se usa para lo que sí le sirve al dueño a diario: qué plan tiene y
 * cuánto lleva del mes. Mismo cálculo que la tarjeta del dashboard
 * (lib/panel/consumo.ts), así que no pueden contar cosas distintas.
 *
 * Mientras el bot no cree `consumo_mensual`, getConsumo devuelve null y aquí no
 * se pinta nada: mejor un hueco que otro anuncio de algo que no existe.
 */
function TuPlan() {
  const { companyId } = useSesion();
  const { datos } = useCargar(
    async () => (companyId ? getConsumo(companyId).catch(() => null) : null),
    [companyId],
  );
  if (!datos) return null;
  const e = estadoConsumo(datos);

  return (
    <Link href="/panel" className={`sidebar__plan ${e.nivel !== 'ok' ? 'sidebar__plan--alerta' : ''}`}>
      <small>Tu plan</small>
      <b>{PLANES[datos.plan].nombre}</b>
      <span className="sidebar__plan-barra" aria-hidden="true">
        <i style={{ width: `${e.pct}%` }} />
      </span>
      <small>
        {miles(e.delPlan)} de {miles(e.tope)} conversaciones
      </small>
    </Link>
  );
}
