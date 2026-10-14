'use client';

/**
 * La barra superior: título de la pantalla, avisos y selector de compañía.
 *
 * Aquí no se cuenta el estado del WhatsApp. Hubo una píldora permanente
 * («WhatsApp conectado», «El bot no está en línea») y luego una que solo salía
 * para «Hay que volver a vincular el WhatsApp»; Alvaro pidió quitar también esa
 * (14-oct-2026). El estado sigue en Ajustes › Conexión de WhatsApp, y el
 * re-emparejado lo gestionamos nosotros, con el dueño.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import CuentaPanel from './CuentaPanel';
import ComboPanel from './ComboPanel';
import Confirmar from './Confirmar';
import { useAvisar } from './Avisos';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSesion } from './Sesion';
import { BotonDemo, useDemo } from './Demo';
import { alternarDemo } from '@/lib/panel/demo';
import { esAppointmentFamily, esCita, esEcommerce, esRecurrente } from '@/lib/panel/modo';
import { CORTE_DE_ROLES, corteDeRoles } from '@/lib/panel/roles';
import { RUTA_MI_AGENDA, RUTA_MI_COMISION, rutaPermitida } from '@/lib/panel/rutas';
import { getEquipo } from '@/lib/supabase/queries';
import { useCargar } from './useCargar';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL AVISO DEL CORTE DE ROLES · solo al dueño, y solo si tiene a quién clasificar
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La explicación entera está en Ajustes › «Acceso del equipo»
 * (components/panel/Equipo.tsx), pero esa sección vive plegada en el tercer
 * paso de Ajustes: sin esto, el dueño se enteraría del cambio el día que su
 * recepcionista le dijera que ya no ve la caja.
 *
 * Rompe a propósito la regla de esta barra —callada mientras todo va bien—
 * porque es justo el otro caso que el cliente tiene que saber y que sin él no
 * se puede arreglar. Y por eso se puede cerrar: una vez leído, no vuelve.
 *
 * Solo sale si en el negocio entra alguien más que el dueño: quien trabaja solo
 * no tiene nada que clasificar.
 */
const CLAVE_AVISO_CORTE = 'vendemia_aviso_corte';

function AvisoCorteDeRoles() {
  const { companyId, rol } = useSesion();
  const demo = useDemo();
  const corte = corteDeRoles();
  const pregunto = rol === 'dueno' && corte !== null && !corte.pasado && !demo;
  const { datos: acompanado } = useCargar(
    async () => (pregunto && companyId ? ((await getEquipo(companyId).catch(() => null)) ?? []).length > 1 : false),
    [pregunto, companyId],
  );
  const [cerrado, setCerrado] = useState(true);
  useEffect(() => {
    try {
      setCerrado(localStorage.getItem(CLAVE_AVISO_CORTE) === CORTE_DE_ROLES);
    } catch {
      setCerrado(false);
    }
  }, []);

  if (!pregunto || !corte || !acompanado || cerrado) return null;

  return (
    <div className="wa-pill wa-pill--aviso">
      <Link href="/panel/configuracion?paso=3&equipo=1">
        El {corte.dia} cambia lo que ve tu equipo · <u>Revísalo</u>
      </Link>
      <button
        type="button"
        className="wa-pill__cerrar"
        aria-label="Cerrar este aviso"
        onClick={() => {
          setCerrado(true);
          try {
            // Atado a la fecha: si el corte se mueve, el aviso vuelve a salir.
            localStorage.setItem(CLAVE_AVISO_CORTE, CORTE_DE_ROLES ?? '');
          } catch {
            /* sin almacenamiento, se cierra solo hasta recargar */
          }
        }}
      >
        ×
      </button>
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
  const { compania, esAdminPlataforma, rol } = useSesion();
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
  /**
   * Las pestañas, según el rol (fase 4 del plan de roles; antes del corte no
   * cambia nada). El empleado tiene las suyas; a los demás se les quita la que
   * no pueden abrir, y si su primera pantalla no es la suya, la pestaña apunta
   * a la primera del grupo que sí lo es.
   */
  const delEmpleado = [
    ...(esAppointmentFamily(modo)
      ? [{ href: RUTA_MI_AGENDA, label: esRecurrente(modo) ? 'Mis clases' : 'Mi agenda', rutas: [RUTA_MI_AGENDA] }]
      : []),
    // Las comisiones son de los negocios de citas, igual que en el menú.
    ...(esCita(modo) ? [{ href: RUTA_MI_COMISION, label: 'Mi comisión', rutas: [RUTA_MI_COMISION] }] : []),
    { href: '/panel/fideliza', label: 'Fideliza', rutas: ['/panel/fideliza'] },
  ];
  const visibles = rutaPermitida(RUTA_MI_AGENDA, rol)
    ? delEmpleado
    : tabs.flatMap((t) => {
        const href = [t.href, ...t.rutas].find((r) => rutaPermitida(r, rol));
        return href ? [{ ...t, href }] : [];
      });

  return (
    <nav className="panel-tabs" aria-label="Secciones del panel">
      {visibles.map((tab) => (
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
  const { salir, salirDeTodos } = useSesion();
  const avisar = useAvisar();
  const demo = useDemo();
  /** null = cerrado · 'pregunta' = el «¿seguro?» · 'yendo' = cerrando sesiones. */
  const [deTodos, setDeTodos] = useState<null | 'pregunta' | 'yendo'>(null);

  /**
   * Es lo primero que hace el dueño si le roban el equipo, así que tiene que
   * estar a mano —aquí, en el único menú que hay también en el móvil— y no
   * puede fallar en silencio: si no se pudo, se dice, porque salir solo de
   * ESTE equipo no es lo que pidió.
   */
  async function cerrarEnTodos() {
    setDeTodos('yendo');
    if (await salirDeTodos()) return; // ya va camino del login
    setDeTodos(null);
    avisar('No se pudo cerrar la sesión en los otros dispositivos. Revisa tu conexión y vuelve a intentarlo.', 'error');
  }

  return (
    <>
      <CuentaPanel email={email} pie={pie} demo={demo ?? false} alDemo={alternarDemo} alSalir={() => void salir()}
        alSalirDeTodos={() => setDeTodos('pregunta')} />
      {/* En el <body>, no aquí: la cabecera lleva `container-type`, que convierte
          cualquier `position:fixed` de dentro en relativo A ELLA. El cuadro
          saldría encajado en la barra superior en vez de tapar la pantalla. */}
      {deTodos && createPortal(
        <Confirmar
          titulo="¿Cerrar sesión en todos los dispositivos?"
          detalle={
            <>
              <p>Se cierra la sesión de <b>{email}</b> en este equipo y en cualquier otro donde esté abierta: tu celular, el ordenador de recepción.</p>
              <p className="muted">Habrá que volver a entrar en cada uno. Un equipo que ya tenga el panel abierto puede tardar hasta una hora en quedarse fuera.</p>
            </>
          }
          textoConfirmar="Cerrar en todos"
          peligro
          ocupado={deTodos === 'yendo'}
          alConfirmar={() => void cerrarEnTodos()}
          alCerrar={() => { if (deTodos !== 'yendo') setDeTodos(null); }}
        />,
        document.body,
      )}
    </>
  );
}

export default function Topbar({
  titulo,
  sub,
  children,
  accionesTitulo,
}: {
  /** Sin título, la cabecera no pinta esa fila (la pantalla del asistente). */
  titulo?: string;
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
      avisos={<>{children}<BotonDemo /><AvisoCorteDeRoles /></>}
      cuenta={<><SelectorCompania /><div className="icon-btn" aria-hidden="true"><Bell size={18} /></div><MenuCuenta email={email} pie={pie} /></>}
    />
  );
}

/** Estructura única para todas las rutas, independiente de sesión y consultas. */
export function CabeceraPanel({ titulo, sub, accionesTitulo, navegacion, cuenta, avisos }: {
  titulo?: string; sub?: string; accionesTitulo?: React.ReactNode;
  navegacion: React.ReactNode; cuenta: React.ReactNode; avisos?: React.ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="topbar">
        {navegacion}
        <div className="topbar__actions">{cuenta}</div>
      </div>
      <div className="topbar__notices">{avisos}</div>
      {(titulo || accionesTitulo) && (
        <div className={`topbar__title${accionesTitulo ? ' topbar__title--with-actions' : ''}`}>
          <div>{titulo && <h1>{titulo}</h1>}{sub && <p>{sub}</p>}</div>
          {accionesTitulo}
        </div>
      )}
    </header>
  );
}
