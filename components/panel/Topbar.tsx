'use client';

/**
 * La barra superior: título de la pantalla, aviso de WhatsApp y selector de
 * compañía.
 *
 * El aviso está callado el 99% del tiempo, y eso es la funcionalidad. Aquí
 * había una píldora permanente con el estado del proceso: «WhatsApp
 * conectado» en verde, «El bot no está en línea» en rojo. Se quitó porque el
 * proceso corre en un portátil nuestro, no del cliente: los baches los
 * arreglamos nosotros y contárselos solo enseña a ignorar la barra.
 *
 * Queda el único caso que el cliente sí tiene que saber, porque sin él no se
 * puede arreglar: hay que re-emparejar el WhatsApp y eso se hace con su
 * teléfono delante.
 */
import { Bell } from 'lucide-react';
import CuentaPanel from './CuentaPanel';
import ComboPanel from './ComboPanel';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSesion } from './Sesion';
import { necesitaEmparejar, useSalud } from './Salud';
import { BotonDemo, useDemo } from './Demo';
import { alternarDemo } from '@/lib/panel/demo';
import { esEcommerce, esRecurrente } from '@/lib/panel/modo';

/**
 * Silencio mientras todo va bien: devuelve `null` en todos los casos menos
 * uno. Ni "conectado" en verde —el cliente no necesita que le confirmemos
 * cada minuto que su negocio funciona— ni "cargando", que solo produce un
 * parpadeo en cada carga de pantalla.
 *
 * El texto lo escribimos aquí y NO se toma de `salud.diagnostico`: ese campo
 * lo redacta el backend y dice cosas como «La instancia no da señales», que
 * es ruido nuestro colado en la pantalla del cliente.
 */
function AvisoWhatsApp() {
  const { salud } = useSalud();
  if (!necesitaEmparejar(salud)) return null;

  return (
    <div className="wa-pill wa-pill--aviso" title="Escríbenos y lo dejamos vinculado en un minuto.">
      Hay que volver a vincular el WhatsApp
    </div>
  );
}

function SelectorCompania() {
  const { companias, companyId, elegirCompania } = useSesion();
  // Con una sola compañía el selector es ruido: casi todos los clientes tienen una.
  if (companias.length < 2) return null;
  return <ComboPanel className="topbar__company panel-combo--header" tipo="negocio"
    etiqueta="Negocio activo" tituloMenu="Cambiar negocio" value={companyId ?? ''}
    opciones={companias.map((c) => ({ value: c.id, label: c.nombre }))} alCambiar={elegirCompania} />;
}

function NavegacionPanel() {
  const ruta = usePathname();
  const { compania, esAdminPlataforma } = useSesion();
  const modo = compania?.business_mode;

  if (!compania && esAdminPlataforma) {
    return (
      <nav className="panel-tabs" aria-label="Secciones del panel">
        <Link href="/panel/retargeting" className="active">Retargeting</Link>
      </nav>
    );
  }

  const operacion = esEcommerce(modo) ? '/panel/pedidos' : '/panel/agenda';
  const operacionLabel = esEcommerce(modo) ? 'Pedidos' : esRecurrente(modo) ? 'Clases' : 'Agenda';
  const tabs = [
    { href: '/panel', label: 'Resumen', rutas: ['/panel'] },
    { href: '/panel/mensajes', label: 'Actividad', rutas: ['/panel/mensajes'] },
    { href: operacion, label: operacionLabel, rutas: [operacion] },
    { href: '/panel/leads', label: 'Clientes', rutas: ['/panel/leads', '/panel/alumnos', '/panel/retargeting', '/panel/fideliza'] },
    { href: '/panel/caja', label: 'Gestión', rutas: ['/panel/caja', '/panel/catalogo', '/panel/equipo', '/panel/comisiones'] },
    { href: '/panel/metricas', label: 'Reportes', rutas: ['/panel/metricas'] },
  ];
  const activa = (rutas: string[]) => rutas.some((r) => (r === '/panel' ? ruta === r : ruta.startsWith(r)));

  return (
    <nav className="panel-tabs" aria-label="Secciones del panel">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className={activa(tab.rutas) ? 'active' : ''}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL MENÚ DE LA CUENTA · colgado del icono de Mia
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ EN MÓVIL ES LA ÚNICA FORMA DE CERRAR SESIÓN. Por debajo de 820px la
 * navegación se va a una barra inferior y su pie —donde vive «Cerrar sesión»—
 * se oculta entero: hasta ahora, desde un teléfono no se podía salir.
 *
 * El icono ya parecía pulsable (tiene `cursor:pointer` desde el primer día) y
 * no hacía nada, que es peor que no parecerlo.
 */
function MenuCuenta({ email, pie }: { email: string; pie: string }) {
  const { salir } = useSesion();
  const demo = useDemo();
  return <CuentaPanel email={email} pie={pie} demo={demo ?? false} alDemo={alternarDemo} alSalir={() => void salir()} />;
}

export default function Topbar({
  titulo,
  sub,
  children,
  accionesTitulo,
}: {
  titulo: string;
  sub?: string;
  children?: React.ReactNode;
  accionesTitulo?: React.ReactNode;
}) {
  const { session, compania, esAdminPlataforma } = useSesion();
  const email = session?.user.email ?? '';
  /* El admin de plataforma no tiene compañía activa, y un guion ahí se lee como
     "algo no cargó". Lo que mira son todos los negocios a la vez: que lo diga. */
  const pie = compania?.nombre ?? (esAdminPlataforma ? 'Todos los negocios' : '—');

  return (
    <CabeceraPanel titulo={titulo} sub={sub} accionesTitulo={accionesTitulo}
      navegacion={<NavegacionPanel />}
      avisos={<>{children}<BotonDemo /><AvisoWhatsApp /></>}
      cuenta={<><SelectorCompania /><div className="icon-btn" aria-hidden="true"><Bell size={18} /></div><MenuCuenta email={email} pie={pie} /></>}
    />
  );
}

/** Estructura única para todas las rutas, independiente de sesión y consultas. */
export function CabeceraPanel({ titulo, sub, accionesTitulo, navegacion, cuenta, avisos }: {
  titulo: string; sub?: string; accionesTitulo?: React.ReactNode;
  navegacion: React.ReactNode; cuenta: React.ReactNode; avisos?: React.ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="topbar">
        {navegacion}
        <div className="topbar__actions">{cuenta}</div>
      </div>
      <div className="topbar__notices">{avisos}</div>
      <div className={`topbar__title${accionesTitulo ? ' topbar__title--with-actions' : ''}`}>
        <div><h1>{titulo}</h1>{sub && <p>{sub}</p>}</div>
        {accionesTitulo}
      </div>
    </header>
  );
}
