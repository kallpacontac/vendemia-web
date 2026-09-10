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
        <div className="profile">
          <div className="avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logos/logo-mia.webp" alt="perfil" />
          </div>
          <div>
            <b>{email.split('@')[0] || 'Cuenta'}</b>
            <small>{pie}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
