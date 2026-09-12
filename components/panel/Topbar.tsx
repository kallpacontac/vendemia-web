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
import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, LogOut } from 'lucide-react';
import { useSesion } from './Sesion';
import { necesitaEmparejar, useSalud } from './Salud';
import { BotonDemo } from './Demo';

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
  return (
    <select
      className="select"
      style={{ maxWidth: 200 }}
      value={companyId ?? ''}
      onChange={(e) => elegirCompania(e.target.value)}
    >
      {companias.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nombre}
        </option>
      ))}
    </select>
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
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  /* Se cierra al pulsar fuera o con Escape: un menú que solo se cierra con su
     propio botón se queda abierto encima de lo que quieras mirar después. */
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  return (
    <div className="profile-wrap" ref={caja}>
      <button
        type="button"
        className="profile"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        <div className="avatar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logos/logo-mia.webp" alt="" />
        </div>
        <div>
          <b>{email.split('@')[0] || 'Cuenta'}</b>
          <small>{pie}</small>
        </div>
        <ChevronDown size={15} className="profile__flecha" />
      </button>

      {abierto && (
        <div className="menu-cuenta" role="menu">
          {/* El correo entero, que es lo que resuelve la duda de «¿con qué
              cuenta estoy?» cuando alguien lleva varias. */}
          <div className="menu-cuenta__quien">
            <b>{email || 'Cuenta'}</b>
            <small>{pie}</small>
          </div>
          <button
            type="button"
            role="menuitem"
            className="menu-cuenta__salir"
            onClick={() => {
              setAbierto(false);
              void salir();
            }}
          >
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export default function Topbar({
  titulo,
  sub,
  children,
}: {
  titulo: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  const { session, compania, esAdminPlataforma } = useSesion();
  const email = session?.user.email ?? '';
  /* El admin de plataforma no tiene compañía activa, y un guion ahí se lee como
     "algo no cargó". Lo que mira son todos los negocios a la vez: que lo diga. */
  const pie = compania?.nombre ?? (esAdminPlataforma ? 'Todos los negocios' : '—');

  return (
    <div className="topbar">
      <div className="topbar__title">
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="topbar__actions">
        {children}
        <BotonDemo />
        <SelectorCompania />
        <AvisoWhatsApp />
        <div className="icon-btn">
          <Bell size={18} />
        </div>
        <MenuCuenta email={email} pie={pie} />
      </div>
    </div>
  );
}
