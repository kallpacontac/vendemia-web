/**
 * ══════════════════════════════════════════════════════════════════════════
 * CUÁNTO DURA UNA SESIÓN DEL PANEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ POR DEFECTO, EN SUPABASE UNA SESIÓN NO CADUCA NUNCA.
 *
 * Literal de su documentación (Auth › Sessions): las sesiones «last
 * indefinitely», y los refresh tokens «never expire but can only be used
 * once». Con `autoRefreshToken: true`, una pestaña abierta en el ordenador de
 * recepción renueva el token cada hora para siempre, y un portátil cerrado un
 * mes vuelve a entrar solo al abrirlo.
 *
 * Los dos ajustes que lo cortan en el servidor —Time-box user sessions e
 * Inactivity timeout, con los valores de SEGURIDAD.md §2.6— son **solo del plan
 * Pro**: «This feature is only available on Pro Plans and up». En Free no se
 * pueden activar, y por eso las sesiones se renovaban indefinidamente.
 *
 * Así que el panel aplica él mismo esos dos valores, en cualquier plan:
 *
 *   · TOPE:        7 días desde que la persona ENTRÓ, pase lo que pase.
 *   · INACTIVIDAD: 1 hora sin que nadie toque el panel.
 *
 * ── Lo que esto protege y lo que NO ──────────────────────────────────────
 *
 * Protege el navegador donde vive la sesión, que es el caso real: el ordenador
 * de recepción que nadie cierra, el portátil que se queda en el mostrador.
 * Cuando salta, `signOut({ scope: 'local' })` REVOCA ESTA SESIÓN EN EL
 * SERVIDOR: el refresh token muere y no sirve aunque alguien lo hubiera copiado.
 *
 * NO protege un refresh token copiado a otra máquina ANTES de caducar: allí no
 * corre este código, y el servidor seguirá renovándolo. Eso solo lo corta
 * Supabase, con los ajustes de Pro. Está en SEGURIDAD.md §3 como riesgo
 * aceptado mientras el proyecto siga en Free.
 *
 * ── Qué cuenta como actividad ────────────────────────────────────────────
 *
 * Una PERSONA tocando el panel: tecla, clic, toque, rueda. NO el refresco del
 * token, que ocurre solo con la pestaña abierta y sin nadie delante — contarlo
 * sería exactamente el fallo que esto viene a arreglar.
 *
 * Se guarda en localStorage, que comparten todas las pestañas del panel: estar
 * trabajando en una mantiene vivas las demás, que es lo esperable.
 */
import type { Session } from '@supabase/supabase-js';

/** 7 días. El `Time-box user sessions` de SEGURIDAD.md §2.6 (168 h). */
export const TOPE_SESION_MS = 168 * 60 * 60 * 1000;

/**
 * 1 hora sin que nadie toque el panel.
 *
 * Decisión de producto del 2026-09-11: las 8 h que fijaba SEGURIDAD.md eran
 * demasiado para un ordenador de recepción al que se acerca cualquiera.
 *
 * ⚠️ Consecuencia asumida: una pantalla que solo se MIRA —la agenda puesta en
 * un monitor, alguien leyendo el chat sin escribir— no genera actividad y
 * también se cierra a la hora.
 */
export const TOPE_INACTIVIDAD_MS = 60 * 60 * 1000;

/** Cada cuánto, como mucho, se apunta actividad: un clic por segundo no son sesenta escrituras. */
const APUNTAR_CADA_MS = 30 * 1000;

const CLAVE = 'vendemia_actividad';

export type MotivoCaducidad = 'inactividad' | 'tope';

/** Lo que se lee del access token. Sin verificar la firma: esto es comodidad, no control. */
interface Claims {
  session_id?: string;
  /** Cómo y CUÁNDO se autenticó la persona en esta sesión. Sobrevive a los refrescos. */
  amr?: { method?: string; timestamp?: number }[];
}

function claimsDe(s: Session): Claims | null {
  const trozo = s.access_token?.split('.')[1];
  if (!trozo) return null;
  try {
    const b64 = trozo.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as Claims;
  } catch {
    return null;
  }
}

/** Lo guardado de ESTA sesión: cuándo empezó y la última vez que alguien tocó algo. */
interface Registro {
  sid: string;
  inicio: number;
  t: number;
}

function leer(): Registro | null {
  try {
    const r = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as Registro | null;
    return r && typeof r.sid === 'string' && typeof r.t === 'number' ? r : null;
  } catch {
    return null;
  }
}

function escribir(r: Registro): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(r));
  } catch {
    /* sin almacenamiento no hay nada que recordar */
  }
}

/** Se llama al cerrar sesión: el registro de una sesión muerta no le sirve a la siguiente. */
export function olvidarActividad(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada */
  }
}

/**
 * El registro de la sesión actual. Si lo guardado es de OTRA sesión —la de
 * antes de cerrar y volver a entrar—, se empieza de cero.
 *
 * ⚠️ Por eso va atado al `session_id` del token y no solo al usuario: con el
 * usuario, volver a entrar a las 9 de la mañana heredaría la inactividad de la
 * sesión de ayer y te echaría nada más entrar.
 *
 * El inicio sale de `amr[].timestamp` —cuándo se autenticó de verdad—, no de
 * la primera vez que este navegador vio la sesión: así el tope de 7 días no se
 * reinicia por abrir el panel en otra pestaña o borrar el registro a mano.
 */
function registroDe(s: Session, ahora: number): Registro | null {
  const c = claimsDe(s);
  const autenticado = (c?.amr ?? []).map((a) => a.timestamp ?? 0).filter((t) => t > 0);
  const inicio = autenticado.length ? Math.min(...autenticado) * 1000 : ahora;
  const sid = c?.session_id ?? (s.user?.id ? `u:${s.user.id}:${inicio}` : null);
  if (!sid) return null;

  const r = leer();
  if (r && r.sid === sid) return r;

  const nuevo: Registro = { sid, inicio, t: ahora };
  escribir(nuevo);
  return nuevo;
}

/**
 * ¿Ha caducado esta sesión? `null` si sigue viva.
 *
 * ⚠️ Hay que mirarlo ANTES de apuntar actividad, nunca después: si el clic con
 * el que alguien vuelve al ordenador a la mañana siguiente contara primero como
 * actividad, reiniciaría el reloj y la sesión no caducaría nunca.
 */
export function motivoDeCaducidad(s: Session | null, ahora = Date.now()): MotivoCaducidad | null {
  if (!s) return null;
  const r = registroDe(s, ahora);
  if (!r) return null;
  if (ahora - r.inicio > TOPE_SESION_MS) return 'tope';
  if (ahora - r.t > TOPE_INACTIVIDAD_MS) return 'inactividad';
  return null;
}

/** Una persona ha tocado el panel. Solo llamar tras comprobar que no ha caducado. */
export function apuntarActividad(s: Session | null, ahora = Date.now()): void {
  if (!s) return;
  const r = registroDe(s, ahora);
  if (!r || ahora - r.t < APUNTAR_CADA_MS) return;
  escribir({ ...r, t: ahora });
}

/** El texto que se enseña en /login después. */
export const MENSAJE_CADUCIDAD: Record<MotivoCaducidad, string> = {
  inactividad: 'Tu sesión se cerró tras 1 hora sin actividad. Vuelve a entrar para seguir.',
  tope: 'Por seguridad, una sesión dura como máximo 7 días. Vuelve a entrar para seguir.',
};
