'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AVISOS EN ESTE CELULAR · instalar el panel y elegir qué avisa
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Va en Ajustes. Es de ESTE dispositivo y de la compañía activa: un dueño con
 * dos negocios activa los avisos de cada uno por separado.
 *
 * Reglas para que no nos desinstalen:
 *   · El permiso del navegador se pide SOLO tras pulsar «Activar avisos». Nunca
 *     en frío al entrar: un «¿Permitir notificaciones?» sin contexto se rechaza
 *     y ya no se puede volver a preguntar.
 *   · Por defecto, solo lo que pide acción: pago, reserva/pedido, WhatsApp
 *     caído y plan. «Cliente pide una persona», apagado.
 *   · Silencio por defecto 22:00–07:00: lo de la noche llega como UN resumen.
 *
 * En iPhone los avisos SOLO funcionan desde la app instalada (iOS 16.4+): en
 * una pestaña de Safari no existe PushManager. Por eso allí primero se explica
 * cómo añadirla a la pantalla de inicio.
 *
 * La suscripción se guarda directo en `panel_push_subscriptions` con la sesión
 * del usuario (RLS: cada uno las suyas). No pasa por el bot.
 */
import { useEffect, useState } from 'react';
import { Bell, BellOff, Download, Share, Smartphone } from 'lucide-react';
import { useSesion } from './Sesion';
import { useAvisar } from './Avisos';
import { enModoApp, plataforma, useInstalarAndroid } from './Instalable';
import { supabase } from '@/lib/supabase/client';
import { activarAvisos, enviarPrueba, registroPanel, soportaAvisos, suscripcionActual } from '@/lib/panel/suscribirAvisos';

type Tipo = 'pago' | 'reserva' | 'whatsapp' | 'plan' | 'persona';

const TIPOS: { id: Tipo; titulo: string; detalle: string }[] = [
  { id: 'pago', titulo: 'Pagos', detalle: 'Un comprobante por revisar, o un pago que Mia verificó.' },
  { id: 'reserva', titulo: 'Reservas y pedidos nuevos', detalle: 'Cuando Mia cierra una venta.' },
  { id: 'whatsapp', titulo: 'WhatsApp desconectado', detalle: 'Si Mia deja de responder porque se cayó el número.' },
  { id: 'plan', titulo: 'Tu plan', detalle: 'Al 80 % y al 100 % de las conversaciones del mes.' },
  { id: 'persona', titulo: 'Cliente pide una persona', detalle: 'Cuando Mia deriva una conversación a tu equipo.' },
];

const PREFS_DEFECTO: Record<Tipo, boolean> = { pago: true, reserva: true, whatsapp: true, plan: true, persona: false };

interface Fila {
  id: string;
  prefs: Partial<Record<Tipo, boolean>>;
  silencio_desde: string | null;
  silencio_hasta: string | null;
}

const hhmm = (t: string | null | undefined) => (t ?? '').slice(0, 5);

export default function AvisosCelular() {
  const { companyId } = useSesion();
  const avisar = useAvisar();
  const instalar = useInstalarAndroid();
  const [listo, setListo] = useState(false);
  const [soporta, setSoporta] = useState(false);
  const [app, setApp] = useState(false);
  const [so, setSo] = useState<'ios' | 'android' | 'otra'>('otra');
  const [permiso, setPermiso] = useState<NotificationPermission>('default');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [fila, setFila] = useState<Fila | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Todo lo del navegador se lee después de montar (no existe en el servidor).
  useEffect(() => {
    setSo(plataforma());
    setApp(enModoApp());
    const ok = soportaAvisos();
    setSoporta(ok);
    if (!ok || !companyId) {
      setListo(true);
      return;
    }
    setPermiso(Notification.permission);
    void suscripcionActual(companyId)
      .then((r) => {
        if (r) {
          setEndpoint(r.endpoint);
          setFila(r.fila);
        }
      })
      .catch(() => {})
      .finally(() => setListo(true));
  }, [companyId]);

  async function activar() {
    if (!companyId) return;
    setOcupado(true);
    const r = await activarAvisos(companyId);
    setOcupado(false);
    setPermiso(Notification.permission);
    if (r.ok) {
      setEndpoint(r.endpoint);
      setFila(r.fila);
      avisar('Avisos activados. Te enviamos uno de prueba.', 'ok');
    } else if (r.motivo === 'denegado') {
      avisar('No diste permiso. Puedes activarlo después desde los ajustes del navegador.', 'espera');
    } else {
      avisar(r.mensaje ?? 'No se pudieron activar los avisos.', 'error');
    }
  }

  async function probar(ep = endpoint) {
    if (!ep) return;
    const ok = await enviarPrueba(ep);
    avisar(ok ? 'Te enviamos un aviso de prueba.' : 'No se pudo enviar el aviso de prueba.', ok ? 'ok' : 'error');
  }

  async function guardar(cambio: Partial<Fila>) {
    if (!fila) return;
    const nueva = { ...fila, ...cambio };
    setFila(nueva);
    const { error } = await supabase()
      .from('panel_push_subscriptions')
      .update({ prefs: nueva.prefs, silencio_desde: nueva.silencio_desde || null, silencio_hasta: nueva.silencio_hasta || null, updated_at: new Date().toISOString() })
      .eq('id', fila.id);
    if (error) avisar('No se pudo guardar el cambio.', 'error');
  }

  async function desactivar() {
    if (!fila) return;
    setOcupado(true);
    await supabase().from('panel_push_subscriptions').delete().eq('id', fila.id);
    // Se quita la suscripción del navegador solo si ya no la usa ningún otro
    // negocio de este usuario en este celular.
    const { count } = await supabase()
      .from('panel_push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', endpoint ?? '');
    if (!count) {
      await (await (await registroPanel()).pushManager.getSubscription())?.unsubscribe();
      setEndpoint(null);
    }
    setFila(null);
    setOcupado(false);
    avisar('Avisos desactivados en este celular.', 'ok');
  }

  if (!listo) return null;
  const activos = !!fila && permiso === 'granted';
  const prefs = { ...PREFS_DEFECTO, ...(fila?.prefs ?? {}) };

  return (
    <div className="card avisos-celular" id="avisos">
      <div className="card-mini-head">
        <h3>
          <Smartphone size={16} /> Avisos en este celular
        </h3>
        {activos && <span className="badge-pill" style={{ color: '#0FA968', background: '#E8FBF2' }}>Activados</span>}
      </div>

      {/* 1 · Instalar. En iPhone es condición para los avisos. */}
      {!app && so === 'ios' && (
        <div className="avisos-celular__paso">
          <b>Primero, instala el panel en tu iPhone</b>
          <p className="muted">
            En iPhone los avisos solo llegan desde la app instalada. En Safari pulsa <Share size={13} /> <b>Compartir</b> y
            luego <b>Añadir a pantalla de inicio</b>. Ábrela desde el icono y vuelve aquí. (Necesitas iOS 16.4 o posterior.)
          </p>
        </div>
      )}
      {!app && so !== 'ios' && instalar && (
        <div className="avisos-celular__paso">
          <b>Tenlo como app</b>
          <p className="muted">Se abre desde su icono, a pantalla completa, sin buscar la página.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void instalar()}>
            <Download size={14} /> Instalar Vendemia
          </button>
        </div>
      )}

      {/* 2 · Activar. */}
      {!soporta ? (
        so === 'ios' && !app ? null : (
          <p className="muted" style={{ fontSize: 13 }}>Este navegador no admite avisos. Prueba con Chrome, o desde la app instalada.</p>
        )
      ) : permiso === 'denied' ? (
        <p className="muted" style={{ fontSize: 13 }}>
          <BellOff size={13} /> Bloqueaste los avisos para Vendemia. Para activarlos, permítelos en los ajustes del navegador
          o del celular y vuelve aquí.
        </p>
      ) : !activos ? (
        <div className="avisos-celular__paso">
          <p className="muted" style={{ marginTop: 0 }}>
            Te avisamos solo de lo que pide que hagas algo: pagos, reservas y pedidos nuevos, y si Mia se desconecta. De noche, un
            resumen por la mañana.
          </p>
          <button type="button" className="btn btn-primary btn-sm" disabled={ocupado} onClick={() => void activar()}>
            <Bell size={14} /> {ocupado ? 'Activando…' : 'Activar avisos'}
          </button>
        </div>
      ) : (
        <>
          <ul className="avisos-celular__tipos">
            {TIPOS.map((t) => (
              <li key={t.id} className="toggle-row">
                <div className="t">
                  <b>{t.titulo}</b>
                  <small>{t.detalle}</small>
                </div>
                <div
                  className={`toggle ${prefs[t.id] ? 'on' : ''}`}
                  role="switch"
                  aria-checked={prefs[t.id]}
                  aria-label={t.titulo}
                  tabIndex={0}
                  onClick={() => void guardar({ prefs: { ...prefs, [t.id]: !prefs[t.id] } })}
                />
              </li>
            ))}
          </ul>
          <div className="avisos-celular__silencio">
            <b>Silencio</b>
            <small className="muted">Lo de estas horas llega como un solo resumen al terminar.</small>
            <div>
              de{' '}
              <input
                type="time"
                className="input"
                value={hhmm(fila?.silencio_desde)}
                onChange={(e) => void guardar({ silencio_desde: e.target.value || null })}
              />{' '}
              a{' '}
              <input
                type="time"
                className="input"
                value={hhmm(fila?.silencio_hasta)}
                onChange={(e) => void guardar({ silencio_hasta: e.target.value || null })}
              />
            </div>
          </div>
          <div className="avisos-celular__acciones">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void probar()}>
              <Bell size={14} /> Enviar aviso de prueba
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={ocupado} onClick={() => void desactivar()}>
              <BellOff size={14} /> Desactivar en este celular
            </button>
          </div>
        </>
      )}
    </div>
  );
}
