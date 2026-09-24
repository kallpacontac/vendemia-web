/**
 * ══════════════════════════════════════════════════════════════════════════
 * ADJUNTOS DEL CHAT · lo que se manda por WhatsApp desde el buzón
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El fichero va del navegador DIRECTO a Cloudinary con una firma del servidor,
 * igual que las fotos del catálogo (ver app/api/cloudinary/firma/route.ts), y
 * al bot solo le llega la URL: una cola de comandos no es sitio para 5 MB.
 *
 * ── Los límites son los de WhatsApp, no los de Cloudinary ─────────────────
 * Un fichero que Cloudinary acepta y WhatsApp rechaza falla en el peor sitio:
 * después de subirlo, en el bot, con el cliente sin recibir nada. Se corta
 * aquí, antes de subir, con un motivo que el dueño entiende.
 *
 * ── Por qué los documentos van como `raw` ─────────────────────────────────
 * Cloudinary acepta un PDF como `image`, pero por defecto BLOQUEA servir PDF
 * desde esa ruta («PDF and ZIP files delivery» viene apagado en las cuentas
 * nuevas): la subida funciona y la URL devuelve 401. Como `raw` se sirve tal
 * cual, que es lo que necesita WhatsApp para descargarlo.
 */
import { supabase } from '@/lib/supabase/client';

export type TipoAdjunto = 'image' | 'video' | 'audio' | 'document';

export interface Adjunto {
  url: string;
  tipo: TipoAdjunto;
  /** El nombre con el que lo verá el cliente. En documentos es lo que sale en WhatsApp. */
  nombre: string;
}

const MB = 1024 * 1024;

/** Límites de WhatsApp para cada tipo. Los documentos, además, el de `raw` en Cloudinary gratis. */
const LIMITE: Record<TipoAdjunto, number> = {
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  document: 10 * MB,
};

export function tipoDeArchivo(file: File): TipoAdjunto {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

/** El motivo por el que no se puede mandar, o null si se puede. */
export function problemaDeArchivo(file: File): string | null {
  const tipo = tipoDeArchivo(file);
  if (file.size > LIMITE[tipo]) {
    const nombre = { image: 'Una foto', video: 'Un vídeo', audio: 'Un audio', document: 'Un documento' }[tipo];
    return `${nombre} puede pesar como mucho ${LIMITE[tipo] / MB} MB para WhatsApp. Este pesa ${(file.size / MB).toFixed(1)} MB.`;
  }
  return null;
}

export async function subirAdjunto(file: File, companyId: string): Promise<Adjunto> {
  const problema = problemaDeArchivo(file);
  if (problema) throw new Error(problema);
  const tipo = tipoDeArchivo(file);

  const sesion = (await supabase().auth.getSession()).data.session;
  if (!sesion) throw new Error('Tu sesión caducó. Vuelve a entrar.');

  const firma = await fetch('/api/cloudinary/firma', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` },
    body: JSON.stringify({ companyId, destino: 'chat' }),
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'No se pudo firmar la subida');
    return j as { timestamp: number; signature: string; folder: string; apiKey: string; cloudName: string };
  });

  const fd = new FormData();
  fd.append('file', file);
  fd.append('api_key', firma.apiKey);
  fd.append('timestamp', String(firma.timestamp));
  fd.append('folder', firma.folder);
  fd.append('signature', firma.signature);

  // Cloudinary guarda el audio bajo `video`.
  const recurso = tipo === 'image' ? 'image' : tipo === 'document' ? 'raw' : 'video';
  const subida = await fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/${recurso}/upload`, {
    method: 'POST',
    body: fd,
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? 'Cloudinary rechazó el fichero');
    return j as { secure_url: string };
  });

  return { url: subida.secure_url, tipo, nombre: file.name };
}
