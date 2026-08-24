'use client';

/**
 * La barra superior: título de la pantalla, estado real del bot y selector de
 * compañía.
 *
 * La píldora de WhatsApp sale de `v_instance_health`, no de un adorno fijo:
 * `vivo` y `wa_connected` son cosas distintas —el proceso puede estar
 * perfectamente vivo con la sesión de WhatsApp caída— y el `diagnostico` viene
 * ya redactado desde la vista, así que se enseña tal cual.
 */
import { Bell } from 'lucide-react';
import { useSesion } from './Sesion';
import { botOperativo, useSalud } from './Salud';

export function PildoraBot() {
  const { salud, cargando, desconocido } = useSalud();

  if (cargando) return <div className="wa-pill">Comprobando…</div>;

  // Sin instancia registrada no hay nada que afirmar. Gris y en pasado: ni
  // "conectado" (mentira) ni rojo de alarma (tampoco es verdad).
  if (desconocido || !salud) {
    return (
      <div
        className="wa-pill"
        title="Esta compañía todavía no tiene una instancia del bot registrada."
        style={{ background: 'var(--bg-input)', color: 'var(--ink-soft)', borderColor: 'var(--line-2)' }}
      >
        Bot sin registrar
      </div>
    );
  }

  const ok = botOperativo(salud);

  return (
    <div
      className="wa-pill"
      title={salud.diagnostico ?? ''}
      style={
        ok
          ? undefined
          : {
              background: 'rgba(255,91,121,.12)',
              color: '#E5484D',
              borderColor: 'rgba(255,91,121,.2)',
            }
      }
    >
      {/* `vivo` y `wa_connected` son dos problemas distintos, y el diagnóstico
          de la vista ya distingue cuál de los dos es. */}
      {ok ? (
        <>
          <span className="live" /> WhatsApp conectado
        </>
      ) : (
        (salud.diagnostico ?? (salud.vivo ? 'WhatsApp desvinculado' : 'El bot no está en línea'))
      )}
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
  const { session, compania } = useSesion();
  const email = session?.user.email ?? '';

  return (
    <div className="topbar">
      <div className="topbar__title">
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      <div className="topbar__actions">
        {children}
        <SelectorCompania />
        <PildoraBot />
        <div className="icon-btn">
          <Bell size={18} />
        </div>
        <div className="profile">
          <div className="avatar">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/logos/logo-azul.webp" alt="perfil" />
          </div>
          <div>
            <b>{email.split('@')[0] || 'Cuenta'}</b>
            <small>{compania?.nombre ?? '—'}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
