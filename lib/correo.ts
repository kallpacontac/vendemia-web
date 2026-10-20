import 'server-only';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * CORREO · Resend, para todo Vendemia
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El SMTP por defecto de Supabase solo manda los correos de acceso, unos pocos
 * por hora y a menudo a spam (SEGURIDAD.md): no sirve para avisar a nadie. Los
 * correos propios salen por Resend con su API HTTP (sin SDK).
 *
 * Variables (Vercel, Production):
 *   RESEND_API_KEY   la clave de Resend. Sin ella no se manda nada y no falla
 *                    nada: enviarCorreo devuelve false y quien llama sigue.
 *   CORREO_DE        el remitente, de un dominio verificado en Resend.
 *                    Por defecto «avisos@vendemias.com».
 *
 * Nunca lanza: un correo que no sale no puede tumbar lo que lo provocó (una
 * hoja de reclamación guardada sigue guardada).
 */

export interface Correo {
  para: string | string[];
  asunto: string;
  html: string;
  texto: string;
  /** El nombre que ve quien lo recibe: «Barbería Demo vía Vendemia». */
  nombre?: string;
  responderA?: string;
}

const ESPERA_MS = 8_000;

export const correoActivo = () => Boolean(process.env.RESEND_API_KEY);

export async function enviarCorreo(c: Correo): Promise<boolean> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) return false;
  const para = (Array.isArray(c.para) ? c.para : [c.para]).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0, 20);
  if (para.length === 0) return false;
  const de = process.env.CORREO_DE || 'avisos@vendemias.com';
  // El nombre va entre comillas y sin lo que rompería la cabecera.
  const nombre = (c.nombre || 'Vendemia').replace(/["<>\r\n]/g, '').slice(0, 60);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `"${nombre}" <${de}>`,
        to: para,
        subject: c.asunto.slice(0, 200),
        html: c.html,
        text: c.texto,
        ...(c.responderA ? { reply_to: c.responderA } : {}),
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!r.ok) console.warn(JSON.stringify({ ev: 'correo_rechazado', status: r.status, cuerpo: (await r.text()).slice(0, 200) }));
    return r.ok;
  } catch (e) {
    console.warn(JSON.stringify({ ev: 'correo_error', mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' }));
    return false;
  }
}

/** Para meter texto del usuario en el HTML de un correo. */
export const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
