/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL SONIDO DE «LLEGÓ UNA RESERVA» CON EL PANEL ABIERTO (21-nov-2026)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El aviso push ya suena en el celular con el sonido del sistema (la web no
 * puede elegir otro: el `sound` de las notificaciones no lo cumple ningún
 * navegador). Esto es para el panel ABIERTO, sobre todo la computadora o la
 * tablet del mostrador que no tiene los avisos activados.
 *
 * El sonido es un archivo del banco de sonidos de Vendemia, copiado en
 * public/sonidos/reserva-nueva.mp3: «glass/notification» de UI SFX (romainsimon,
 * uisfx.com, CC0, sin crédito), elegido por Alvaro el 21-nov-2026. Se descarga y se decodifica una sola vez, al
 * primer toque. Si falta o no se puede leer, suena el «din-don» hecho con Web
 * Audio de abajo.
 *
 * Los navegadores no dejan sonar nada hasta que la persona toca la página una
 * vez: el contexto de audio se crea y se despierta en el primer toque o tecla.
 * Si aún no hubo ninguno, no suena (y lo dice la pestaña, ver SonidoReservas).
 *
 * Lo que agenda el propio panel no suena: commands.ts avisa con
 * `marcarPropias()` de las citas que acaba de crear.
 */

const CLAVE = 'vm-sonido-reservas';
export const EVENTO_PREF = 'vm-sonido-reservas';

/** Apagado solo si la persona lo apagó en este dispositivo. */
export function sonidoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== '0';
  } catch {
    return true;
  }
}

export function guardarSonido(activo: boolean): void {
  try {
    localStorage.setItem(CLAVE, activo ? '1' : '0');
  } catch {
    /* sin almacenamiento: queda como estaba */
  }
  window.dispatchEvent(new Event(EVENTO_PREF));
}

/* ── El audio ──────────────────────────────────────────────────────────── */

const ARCHIVO = '/sonidos/reserva-nueva.mp3';
/** El archivo ya suena fuerte: esto lo deja a la altura de un aviso, no de una alarma. */
const VOLUMEN_ARCHIVO = 0.8;

let ctx: AudioContext | null = null;
let escuchando = false;
let buffer: AudioBuffer | null = null;
let cargando: Promise<void> | null = null;

/** Descarga y decodifica el archivo una vez (con el contexto ya creado). */
function cargarArchivo(c: AudioContext): Promise<void> {
  if (cargando) return cargando;
  cargando = (async () => {
    try {
      const r = await fetch(ARCHIVO, { cache: 'force-cache' });
      if (!r.ok) return;
      const datos = await r.arrayBuffer();
      buffer = await new Promise<AudioBuffer>((ok, mal) => c.decodeAudioData(datos, ok, mal));
    } catch {
      buffer = null; // sin archivo: el din-don sintetizado
    }
  })();
  return cargando;
}

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Despierta el audio en el primer toque: sin eso, el navegador lo deja mudo. */
export function prepararAudio(): void {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  const despertar = () => {
    const c = contexto();
    if (!c) return;
    if (c.state === 'suspended') void c.resume().catch(() => {});
    void cargarArchivo(c);
  };
  window.addEventListener('pointerdown', despertar, { capture: true, passive: true });
  window.addEventListener('keydown', despertar, { capture: true });
}

/** ¿Puede sonar ya? (hubo un toque y el navegador lo permite) */
export const audioListo = (): boolean => ctx?.state === 'running';

/** Una nota con ataque corto y caída larga, como una campanilla. */
function nota(c: AudioContext, frecuencia: number, empieza: number, dura: number, volumen: number) {
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = frecuencia;
  env.gain.setValueAtTime(0.0001, empieza);
  env.gain.exponentialRampToValueAtTime(volumen, empieza + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, empieza + dura);
  osc.connect(env).connect(c.destination);
  osc.start(empieza);
  osc.stop(empieza + dura + 0.05);
  // El armónico le da el brillo de campana sin ser chillón.
  const arm = c.createOscillator();
  const envArm = c.createGain();
  arm.type = 'sine';
  arm.frequency.value = frecuencia * 2.01;
  envArm.gain.setValueAtTime(0.0001, empieza);
  envArm.gain.exponentialRampToValueAtTime(volumen * 0.25, empieza + 0.01);
  envArm.gain.exponentialRampToValueAtTime(0.0001, empieza + dura * 0.5);
  arm.connect(envArm).connect(c.destination);
  arm.start(empieza);
  arm.stop(empieza + dura);
}

/** Suena el aviso: el archivo si ya está cargado, si no el «din-don». false si el navegador no deja. */
export function sonarAviso(): boolean {
  const c = contexto();
  if (!c || c.state !== 'running') return false;
  if (buffer) {
    const src = c.createBufferSource();
    const vol = c.createGain();
    vol.gain.value = VOLUMEN_ARCHIVO;
    src.buffer = buffer;
    src.connect(vol).connect(c.destination);
    src.start();
  } else {
    void cargarArchivo(c);
    const t = c.currentTime + 0.02;
    nota(c, 1318.5, t, 0.9, 0.35); // mi6
    nota(c, 987.8, t + 0.22, 1.3, 0.35); // si5
  }
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* sin vibración */
  }
  return true;
}

/** «Probar el sonido» en Ajustes: espera al archivo (es el primer toque) y suena. */
export async function probarSonido(): Promise<boolean> {
  const c = contexto();
  if (!c) return false;
  if (c.state === 'suspended') await c.resume().catch(() => {});
  await cargarArchivo(c);
  return sonarAviso();
}

/* ── Lo que agenda este mismo panel no suena ───────────────────────────── */

const propias = new Set<string>();

export function marcarPropias(ids: (string | null | undefined)[]): void {
  for (const id of ids) if (id) propias.add(id);
}

export const esPropia = (id: string): boolean => propias.has(id);
