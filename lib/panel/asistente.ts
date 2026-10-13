/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL ASISTENTE DEL DUEÑO · lo que no es pantalla
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El dueño le pregunta a Mia por SU negocio —caja, ventas, comisiones, quién le
 * debe— escribiendo o hablando. La pregunta va web → Supabase → el bot →
 * Supabase → web, por la misma cola que todo lo demás. No pasa por WhatsApp.
 *
 * ── Tres reglas que explican todo lo de aquí ─────────────────────────────
 *
 *   · NADA SE GUARDA EN EL NAVEGADOR. Preguntas, respuestas y audios viven en
 *     memoria. Ni localStorage, ni sessionStorage, ni caché.
 *   · NADA SE CALCULA. El panel pinta el texto y reproduce el audio que
 *     devuelve el bot; no suma, no compara y no «mejora» la respuesta.
 *   · NADA SE REGISTRA. Ni la pregunta, ni la respuesta, ni el audio van a un
 *     `console.log`. Aquí no hay ninguno, y que siga así.
 */
import { supabase } from '@/lib/supabase/client';
import {
  BotNoResponde,
  encolar,
  type AudioAsistente,
  type RespuestaAsistente,
} from '@/lib/supabase/commands';
import type { BusinessMode } from '@/lib/supabase/types';
import type { RolNegocio } from './roles';

/* ── Quién lo puede abrir ───────────────────────────────────────────────── */

/**
 * El asistente es del DUEÑO y del ADMINISTRADOR del negocio. El empleado
 * —barbero, estilista, profesor— no lo ve.
 *
 * Decisión del 13-oct-2026. Dentro, no son iguales: al dueño Mia le contesta
 * con importes y al administrador sin ellos. Eso no se decide aquí: lo impone
 * el bot, para quien las herramientas de dinero del administrador ni existen.
 *
 * El superadmin (equipo Vendemia) NO tiene pase propio: el bot mira su
 * membresía en ese negocio como la de cualquiera, y sin ella Postgres ni le
 * deja encolar la pregunta. Enseñarle un chat que le va a fallar no ayuda.
 *
 * ⚠️ Esto ESCONDE, no impide: la entrada del menú y la página lo usan para no
 * ofrecer lo que no toca, pero quien manda es el bot, que revalida el rol de
 * quien encola `preguntar_asistente` (`rolEnElAsistente`, en
 * src/services/owner/operadores.ts de su repo). Si cambia la regla, cambia en
 * los dos sitios. Si aun así no coinciden un instante —le cambian el rol con
 * la página abierta—, el bot contesta `sin_permiso` y la página enseña la
 * misma tarjeta que si no hubiera entrado.
 */
export const puedeUsarAsistente = (rol: RolNegocio | null): boolean => rol === 'dueno' || rol === 'admin';

/* ── Los números del contrato ───────────────────────────────────────────── */

/** El bot recorta la pregunta a esto; el panel no deja escribir más. */
export const MAX_PREGUNTA = 1000;

/** Una pregunta hablada se corta sola aquí, y se envía. */
export const MAX_GRABACION_S = 60;

/**
 * Lo máximo que se manda. La base rechaza un payload de más de 1,5 MB (0039)
 * y el bot un audio de más de 90 s, pero mucho antes —pasado 1 MB en base64—
 * el aviso en tiempo real puede no llegarle y la pregunta la recogería el
 * sondeo, 30 s tarde.
 */
export const MAX_AUDIO_BYTES = 700 * 1024;

/**
 * Para voz sobra, y un minuto pesa unos 240 KB. Con el valor por defecto de
 * algunos navegadores (128 kbps) ese mismo minuto no cabría.
 */
export const BITS_POR_SEGUNDO = 32000;

/** 3-5 s con el bot encendido; 8-12 s si hay que transcribir un audio. */
const ESPERA_RESPUESTA_MS = 45_000;

/** El audio llega 3-6 s después del texto. Se relee la fila cada segundo. */
const SONDEO_AUDIO_MS = 1000;
const INTENTOS_AUDIO = 25;

/* ── Preguntar ──────────────────────────────────────────────────────────── */

export type Pregunta =
  | { pregunta: string; con_voz?: boolean }
  | { audio: { base64: string; mime: string }; con_voz?: boolean };

/**
 * En qué acabó una pregunta. Los fallos van aquí como datos y no como
 * excepciones porque cada uno cambia la pantalla de una forma distinta, y un
 * `catch` genérico los habría juntado todos en «algo falló».
 */
export type Desenlace =
  | { tipo: 'respuesta'; r: RespuestaAsistente }
  /** El bot dice que este negocio no tiene asistente. Lo decide él, no el plan. */
  | { tipo: 'no_disponible' }
  /** El bot ya no reconoce a quien pregunta: se trata como sesión caducada. */
  | { tipo: 'sin_sesion' }
  /** Es del negocio, pero su rol no entra: un empleado. Ver puedeUsarAsistente. */
  | { tipo: 'sin_permiso' }
  /**
   * 45 s sin respuesta. ⚠️ La pregunta SIGUE EN LA COLA: si el bot estaba
   * apagado, la contestará al arrancar. Por eso no se reenvía sola.
   */
  | { tipo: 'sin_respuesta' }
  /** No llegó ni a la cola: sin red, o la base la rechazó. */
  | { tipo: 'no_enviada' }
  /**
   * La base no la dejó entrar porque la anterior sigue sin contestar (migración
   * 0039 del bot). Se ve tras un timeout: la pregunta de antes sigue `pending`
   * hasta un minuto, y mientras tanto no cabe otra.
   */
  | { tipo: 'en_curso'; mensaje: string }
  /** El payload pasa de 1,5 MB: un audio demasiado largo. */
  | { tipo: 'muy_grande' }
  /** Un error del bot, redactado para el dueño: se enseña tal cual. */
  | { tipo: 'error'; mensaje: string };

const NO_ACTIVO = 'El asistente no está activo para este negocio.';
/** Copia de ASISTENTE_SOLO_DUENO_Y_ADMIN del bot (src/services/owner/operadores.ts). */
const SOLO_DUENO_Y_ADMIN = 'El asistente es para el dueño y el administrador del negocio.';
/** El bot la recogió con más de un minuto de retraso —estaba apagado— y no la contestó. */
const CADUCO = /^La pregunta caducó/;

/**
 * Los rechazos AL ENCOLAR: el `insert` falla y no llega a haber comando.
 *
 * `encolar` los rechaza con el objeto de PostgREST tal cual, que no es un
 * `Error`: `{ code, hint, message }`. Se lee el `hint` (y el `code`), que son
 * estables; el `message` está escrito para el dueño y se enseña, pero no se
 * compara con nada.
 */
function rechazoAlEncolar(e: unknown): Desenlace {
  const pg = (e ?? {}) as { code?: unknown; hint?: unknown; message?: unknown };
  const mensaje = typeof pg.message === 'string' && pg.message ? pg.message : null;
  if (pg.hint === 'asistente_en_curso') {
    return { tipo: 'en_curso', mensaje: mensaje ?? 'Mia todavía está con tu pregunta anterior. Espera a que conteste.' };
  }
  if (pg.hint === 'asistente_ritmo') {
    return { tipo: 'error', mensaje: mensaje ?? 'Vas muy rápido. Espera un minuto y vuelve a preguntar.' };
  }
  // 23514 = check_violation: el tope de tamaño del payload.
  if (pg.code === '23514') return { tipo: 'muy_grande' };
  return { tipo: 'no_enviada' };
}

export async function preguntar(companyId: string, p: Pregunta): Promise<Desenlace> {
  try {
    const r = await encolar<RespuestaAsistente>(companyId, 'preguntar_asistente', p, ESPERA_RESPUESTA_MS);
    return { tipo: 'respuesta', r };
  } catch (e) {
    if (e instanceof BotNoResponde) return { tipo: 'sin_respuesta' };
    /**
     * `encolar` rechaza con un `Error` solo cuando la fila acabó en `error`:
     * eso es el bot hablando. Lo demás —el insert que falla— llega como el
     * objeto de PostgREST, que no es un `Error`.
     */
    if (!(e instanceof Error)) return rechazoAlEncolar(e);
    if (e.message === NO_ACTIVO) return { tipo: 'no_disponible' };
    if (e.message === SOLO_DUENO_Y_ADMIN) return { tipo: 'sin_permiso' };
    // Mismo trato que el timeout: nadie contestó, y no se reenvía sola.
    if (CADUCO.test(e.message)) return { tipo: 'sin_respuesta' };
    if (/no eres miembro|comando sin autor/i.test(e.message)) return { tipo: 'sin_sesion' };
    return { tipo: 'error', mensaje: e.message };
  }
}

/**
 * Espera el audio de una respuesta que llegó con `generando`.
 *
 * ⚠️ Solo se relee la fila AHORA, recién contestada. A los 5 minutos el bot le
 * borra el texto y el enlace (y a las 24 h, la fila): una pregunta antigua no
 * se puede volver a leer, y lo que hay en memoria es lo único.
 *
 * Devuelve el audio `listo`, o `null` si no va a haber: el bot dijo
 * `sin_audio`, se agotaron los 25 s, o `sigue()` dijo que ya no hace falta (la
 * página se bloqueó o se cerró). `null` no es un error: el texto ya está en
 * pantalla y es la respuesta.
 *
 * @returns `sinVoz: true` solo cuando es el BOT quien dice que no hay audio.
 *          Agotar la espera no cuenta: no dice nada de si el negocio tiene voz.
 */
export async function esperarAudio(
  id: string,
  sigue: () => boolean,
): Promise<{ audio: Extract<AudioAsistente, { estado: 'listo' }> | null; sinVoz: boolean }> {
  for (let i = 0; i < INTENTOS_AUDIO; i++) {
    await new Promise((r) => setTimeout(r, SONDEO_AUDIO_MS));
    if (!sigue()) break;
    const { data } = await supabase().from('commands').select('result').eq('id', id).maybeSingle();
    const audio = (data?.result as RespuestaAsistente | null | undefined)?.audio;
    if (audio?.estado === 'listo') return { audio, sinVoz: false };
    if (audio?.estado === 'sin_audio') return { audio: null, sinVoz: true };
  }
  return { audio: null, sinVoz: false };
}

/**
 * Baja el MP3 a memoria y devuelve una URL `blob:`.
 *
 * El enlace firmado caduca a los 10 minutos; el Blob no. Así se puede volver a
 * oír un cuarto de hora después, y la URL firmada no se guarda en ningún sitio.
 * `no-store` para que tampoco quede una copia en la caché del navegador.
 *
 * ⚠️ Quien la recibe tiene que llamar a `URL.revokeObjectURL` al soltarla.
 */
export async function descargarAudio(url: string): Promise<string | null> {
  try {
    // Solo del almacenamiento de ESTE proyecto. La URL viene en `commands.result`,
    // que escribe el bot; pero si un día algo consiguiera colar otra, el panel
    // no va a ir a buscarla con el navegador del dueño.
    const u = new URL(url);
    const propio = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    if (u.protocol !== 'https:' || u.origin !== propio.origin || !u.pathname.startsWith('/storage/v1/object/sign/')) return null;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

/** El Blob de MediaRecorder en base64, SIN el prefijo `data:…;base64,`. */
export function aBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(lector.error ?? new Error('No se pudo leer el audio'));
    lector.onload = () => {
      const url = String(lector.result ?? '');
      resolve(url.slice(url.indexOf(',') + 1));
    };
    lector.readAsDataURL(blob);
  });
}

/** 7 → «0:07». */
export function duracion(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/* ── Cómo se pinta el texto ─────────────────────────────────────────────── */

/**
 * La respuesta viene en formato de chat, no en Markdown, y puede CITAR MENSAJES
 * DE CLIENTES. Así que no se convierte a HTML: se trocea, y cada trozo lo pinta
 * React como texto. Un `<script>` sale escrito, no ejecutado.
 *
 * Solo se reconocen dos cosas: la negrita (`*así*`, y `**así**` por si acaso) y
 * los enlaces a WhatsApp. Cualquier otra URL se queda como texto: un enlace
 * pulsable a un sitio que escribió un cliente es una invitación al phishing.
 */
export type Trozo =
  | { tipo: 'texto'; texto: string; negrita: boolean }
  /**
   * `numero` es A QUIÉN abre el chat, con su `+`. Se enseña en el botón, y no es
   * adorno: el enlace lo redacta un modelo que ha leído mensajes de clientes, y
   * un botón que solo dijera «Escribirle por WhatsApp» mandaría lo que lleve
   * dentro —puede ser la caja del día— a un número que nadie ha visto.
   * `null` = sin destinatario fijo: WhatsApp deja elegir el contacto.
   */
  | { tipo: 'whatsapp'; url: string; numero: string | null };

const URL_RE = /https?:\/\/[^\s<>"']+/g;
/** Sin espacio pegado a los asteriscos por dentro: «2 * 3 * 4» no es negrita. */
const NEGRITA_RE = /\*\*(\S(?:[^*\n]*\S)?)\*\*|\*(\S(?:[^*\n]*\S)?)\*/g;
/** Lo que suele ir pegado detrás de un enlace y no es parte de él. */
const COLA_RE = /[.,;:!?)\]*]+$/;

/** `null` si no es un enlace de WhatsApp; si lo es, a qué número va. */
function whatsapp(url: string): { numero: string | null } | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const crudo =
      u.hostname === 'wa.me' ? u.pathname.slice(1) : u.hostname === 'api.whatsapp.com' ? (u.searchParams.get('phone') ?? '') : null;
    if (crudo === null) return null;
    const digitos = crudo.replace(/\D/g, '');
    return { numero: digitos ? `+${digitos}` : null };
  } catch {
    return null;
  }
}

function negritas(texto: string, salida: Trozo[]): void {
  let desde = 0;
  for (const m of texto.matchAll(NEGRITA_RE)) {
    const i = m.index ?? 0;
    if (i > desde) salida.push({ tipo: 'texto', texto: texto.slice(desde, i), negrita: false });
    salida.push({ tipo: 'texto', texto: m[1] ?? m[2], negrita: true });
    desde = i + m[0].length;
  }
  if (desde < texto.length) salida.push({ tipo: 'texto', texto: texto.slice(desde), negrita: false });
}

/** Una línea de la respuesta, troceada. Los saltos de línea los pone quien pinta. */
export function trocear(linea: string): Trozo[] {
  const salida: Trozo[] = [];
  let pendiente = '';
  let desde = 0;
  for (const m of linea.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    const cola = m[0].match(COLA_RE)?.[0] ?? '';
    const url = cola ? m[0].slice(0, -cola.length) : m[0];
    pendiente += linea.slice(desde, i);
    desde = i + m[0].length;
    const wa = whatsapp(url);
    if (!wa) {
      pendiente += m[0];
      continue;
    }
    // El texto se trocea de una vez, con la cola del enlace anterior dentro:
    // así `*https://wa.me/…*` no deja dos asteriscos sueltos a los lados.
    negritas(pendiente.replace(/\*+$/, ''), salida);
    salida.push({ tipo: 'whatsapp', url, numero: wa.numero });
    pendiente = cola.replace(/^\*+/, '');
  }
  negritas(pendiente + linea.slice(desde), salida);
  return salida;
}

/* ── Sugerencias ────────────────────────────────────────────────────────── */

interface Sugerencia {
  texto: string;
  /** Habla de importes: solo se le ofrece al dueño. */
  dinero?: boolean;
}

const PARA_TODOS: Sugerencia[] = [
  { texto: '¿Cuánto entró hoy en caja?', dinero: true },
  { texto: '¿Cuánto me queda este mes?', dinero: true },
  { texto: '¿Quién me debe?', dinero: true },
  { texto: '¿Qué me piden más y qué rota?' },
  { texto: '¿Cómo lo está haciendo Mia?' },
  { texto: '¿A quién le escribo hoy?' },
];

const POR_MODO: Record<BusinessMode, Sugerencia[]> = {
  appointment: [
    { texto: '¿Cuánto le debo a cada barbero esta semana?', dinero: true },
    { texto: '¿Cómo está mi agenda de mañana?' },
  ],
  recurring_appointment: [
    { texto: '¿Qué horarios tengo llenos?' },
    { texto: '¿A quién se le vence la mensualidad?' },
  ],
  ecommerce: [
    { texto: '¿Qué tallas se me están agotando?' },
    { texto: '¿Qué pedidos tengo en curso?' },
    { texto: '¿Qué margen me deja cada producto?', dinero: true },
  ],
};

/**
 * Las preguntas de ejemplo, según el negocio y quién pregunta.
 *
 * ⚠️ Quitarle a un empleado las de dinero es CORTESÍA, no el control: para
 * quien no es `owner` las herramientas de dinero ni existen en el bot. Esto
 * solo evita ofrecerle una pregunta que le van a contestar sin cifras.
 */
export function sugerencias(modo: BusinessMode | null | undefined, esDueno: boolean): string[] {
  return [...PARA_TODOS, ...(modo ? POR_MODO[modo] : [])]
    .filter((s) => esDueno || !s.dinero)
    .map((s) => s.texto);
}
