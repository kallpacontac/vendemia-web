'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * GOOGLE CALENDAR · conectar el calendario del negocio (tipo Calendly)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Va en Configuración, solo para el dueño o el administrador. Al conectar:
 *   · lo que tenga ocupado en Google Calendar deja de ofrecerse en su página;
 *   · cada cita que entra por la página aparece en su calendario, y con enlace
 *     de Google Meet si lo enciende aquí.
 *
 * Es un permiso aparte del «Entrar con Google» (ese solo comparte nombre y
 * correo). La lógica está en modules/agenda-google; la base, en sql/0028.
 */
import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CalendarX, Video } from 'lucide-react';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { supabase } from '@/lib/supabase/client';

interface Estado {
  conectado: boolean;
  cuenta?: string;
  con_meet?: boolean;
  error?: string | null;
}

const VUELTA: Record<string, [string, 'ok' | 'error']> = {
  ok: ['Google Calendar conectado. Las citas de tu página ya caen en tu calendario.', 'ok'],
  cancelado: ['No se conectó: cancelaste en la pantalla de Google.', 'error'],
  'sin-permiso': ['Falta marcar el permiso del calendario en la pantalla de Google. Vuelve a conectar y déjalo marcado.', 'error'],
  caducado: ['La conexión tardó demasiado. Vuelve a intentarlo.', 'error'],
  error: ['No se pudo conectar con Google. Vuelve a intentarlo.', 'error'],
};

async function llamar(ruta: string, companyId: string): Promise<{ url?: string; ok?: boolean; error?: string }> {
  const { data } = await supabase().auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { error: 'Vuelve a entrar al panel.' };
  const r = await fetch(ruta, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ companyId }),
  }).catch(() => null);
  if (!r) return { error: 'Sin conexión. Revisa tu internet.' };
  return (await r.json().catch(() => ({ error: 'Respuesta inesperada.' }))) as { url?: string; ok?: boolean; error?: string };
}

export default function GoogleCalendar() {
  const { companyId } = useSesion();
  const avisar = useAvisar();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [falta, setFalta] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const leer = useCallback(async () => {
    if (!companyId) return;
    const { data, error } = await supabase().rpc('gcal_panel', { p_company: companyId });
    if (error) {
      setFalta(/gcal_panel|schema cache|could not find/i.test(error.message) ? 'Falta aplicar sql/0028_google_calendar.sql en la base.' : error.message);
      return;
    }
    setFalta('');
    setEstado(data as Estado);
  }, [companyId]);

  useEffect(() => {
    void leer();
  }, [leer]);

  // La vuelta de Google trae ?google=ok|cancelado|…: se avisa una vez y se limpia la URL.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get('google');
    if (!r) return;
    const v = VUELTA[r] ?? VUELTA.error;
    avisar(v[0], v[1]);
    q.delete('google');
    history.replaceState(null, '', `${window.location.pathname}${q.size ? `?${q}` : ''}#google-calendar`);
    document.getElementById('google-calendar')?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    if (!companyId) return;
    setOcupado(true);
    const r = await llamar('/api/google-calendar/conectar', companyId);
    if (r.url) {
      window.location.href = r.url;
      return;
    }
    setOcupado(false);
    avisar(r.error ?? 'No se pudo abrir Google.', 'error');
  }

  async function desconectar() {
    if (!companyId || !window.confirm('¿Desconectar tu Google Calendar? Las citas nuevas ya no se copiarán allí.')) return;
    setOcupado(true);
    const r = await llamar('/api/google-calendar/desconectar', companyId);
    setOcupado(false);
    if (!r.ok) return avisar(r.error ?? 'No se pudo desconectar.', 'error');
    avisar('Google Calendar desconectado.');
    void leer();
  }

  async function meet(si: boolean) {
    if (!companyId) return;
    setEstado((e) => (e ? { ...e, con_meet: si } : e));
    const { error } = await supabase().rpc('gcal_meet', { p_company: companyId, p_si: si });
    if (error) {
      avisar(error.message, 'error');
      void leer();
    }
  }

  return (
    <section className="card" id="google-calendar" style={{ marginTop: 16 }}>
      <div className="card-mini-head">
        <h3>Google Calendar</h3>
      </div>
      <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 12px' }}>
        Como Calendly: lo que tengas ocupado en tu Google Calendar no se ofrece en tu página, y cada cita que te agenden aparece allí sola.
      </p>
      {falta ? (
        <p className="muted" style={{ fontSize: 13 }}>{falta}</p>
      ) : !estado ? (
        <p className="muted" style={{ fontSize: 13 }}>Cargando…</p>
      ) : estado.conectado ? (
        <>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
            <CalendarCheck size={18} /> Conectado{estado.cuenta ? <> a <b>{estado.cuenta}</b></> : ''}
          </p>
          {estado.error && (
            <p role="alert" style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#FFF1EC', color: '#9A2E12', fontSize: 13 }}>
              {estado.error}
            </p>
          )}
          <label className="check-inline" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={Boolean(estado.con_meet)} disabled={ocupado} onChange={(ev) => void meet(ev.target.checked)} />
            <Video size={14} /> Crear un enlace de Google Meet en cada cita (para reuniones por videollamada)
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {estado.error && (
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void conectar()}>
                Volver a conectar
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void desconectar()}>
              <CalendarX size={15} /> Desconectar
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn-primary" disabled={ocupado || !companyId} onClick={() => void conectar()}>
          {ocupado ? <span className="spin" /> : <CalendarCheck size={16} />} Conectar Google Calendar
        </button>
      )}
    </section>
  );
}
