'use client';

/**
 * «Avísame al celular», dentro de Mi agenda: los avisos del EMPLEADO.
 *
 * El dueño los activa en Ajustes (AvisosCelular), con sus tipos y su silencio.
 * El empleado no entra a Ajustes, y lo suyo es más simple: le llega lo de SU
 * agenda —una cita nueva o asignada, movida o cancelada, y el recordatorio 15
 * min antes— (modules/avisos/sql/0004). Por eso aquí no hay interruptores: un
 * botón para activarlos y, una vez activos, una línea que lo confirma.
 *
 * La suscripción es la misma tabla y el mismo paso (activarAvisos): qué le
 * llega a cada uno lo decide el despachador, no el celular.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Share } from 'lucide-react';
import { useAvisar } from './Avisos';
import { enModoApp, plataforma } from './Instalable';
import { activarAvisos, enviarPrueba, soportaAvisos, suscripcionActual } from '@/lib/panel/suscribirAvisos';

type Estado = 'cargando' | 'activos' | 'apagados' | 'denegado' | 'ios-instalar' | 'no-soporta';

/** `academia`: los grupos no tienen hora por persona; lo que avisa es un alumno nuevo. */
export default function AvisosDelEquipo({ companyId, academia = false }: { companyId: string; academia?: boolean }) {
  const avisar = useAvisar();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Todo lo del navegador se lee después de montar (no existe en el servidor).
  useEffect(() => {
    let vivo = true;
    if (!soportaAvisos()) {
      setEstado(plataforma() === 'ios' && !enModoApp() ? 'ios-instalar' : 'no-soporta');
      return;
    }
    if (Notification.permission === 'denied') {
      setEstado('denegado');
      return;
    }
    void suscripcionActual(companyId)
      .then((r) => {
        if (!vivo) return;
        setEndpoint(r?.endpoint ?? null);
        setEstado(r?.fila && Notification.permission === 'granted' ? 'activos' : 'apagados');
      })
      .catch(() => vivo && setEstado('apagados'));
    return () => {
      vivo = false;
    };
  }, [companyId]);

  async function activar() {
    setOcupado(true);
    const r = await activarAvisos(companyId);
    setOcupado(false);
    if (r.ok) {
      setEndpoint(r.endpoint);
      setEstado('activos');
      avisar('Listo. Te enviamos un aviso de prueba.', 'ok');
    } else if (r.motivo === 'denegado') {
      setEstado('denegado');
    } else {
      avisar(r.mensaje ?? 'No se pudieron activar los avisos.', 'error');
    }
  }

  async function probar() {
    if (!endpoint) return;
    const ok = await enviarPrueba(endpoint);
    avisar(ok ? 'Te enviamos un aviso de prueba.' : 'No se pudo enviar el aviso de prueba.', ok ? 'ok' : 'error');
  }

  if (estado === 'cargando' || estado === 'no-soporta') return null;

  if (estado === 'activos') {
    return (
      <p className="mag-avisos--ok">
        <span className="badge-pill b-new">
          <BellRing size={12} aria-hidden /> Avisos activados
        </span>
        {academia ? 'Cuando entre un alumno nuevo.' : 'Citas nuevas, cambios y 15 min antes de cada una.'}
        <button type="button" className="mag-avisos__link" onClick={() => void probar()}>
          Probar
        </button>
      </p>
    );
  }

  return (
    <div className="card mag-avisos">
      <span className="mag-avisos__ico" aria-hidden>
        {estado === 'denegado' ? <BellOff size={18} /> : <Bell size={18} />}
      </span>
      <div className="mag-avisos__txt">
        <b>{academia ? 'Entérate de tus alumnos nuevos' : 'Recibe tus citas en el celular'}</b>
        {estado === 'ios-instalar' ? (
          <small>
            En iPhone, primero instala el panel: en Safari toca <Share size={12} aria-label="Compartir" /> <b>Compartir</b> ›{' '}
            <b>Añadir a pantalla de inicio</b>, y ábrelo desde el icono.
          </small>
        ) : estado === 'denegado' ? (
          <small>Los avisos están bloqueados. Permítelos en los ajustes del navegador o del celular y vuelve aquí.</small>
        ) : (
          <small>
            {academia
              ? 'Un aviso al celular cuando alguien se inscriba en un grupo.'
              : 'Cuando te asignen una cita, si se mueve o se cancela, y 15 min antes de cada una.'}
          </small>
        )}
      </div>
      {estado === 'apagados' && (
        <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void activar()}>
          {ocupado ? 'Activando…' : 'Activar'}
        </button>
      )}
    </div>
  );
}
