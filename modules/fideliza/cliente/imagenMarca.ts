'use client';

/**
 * Sube el logo o la foto de perfil directamente a Cloudinary. El fichero no
 * atraviesa Vercel: el servidor solo entrega una firma corta y Cloudinary lo
 * normaliza a un PNG cuadrado que sirve también para Google Wallet.
 */
import { supabase } from '@/lib/supabase/client';

const MAX = 12 * 1024 * 1024;

interface FirmaSubida {
  timestamp: number;
  signature: string;
  folder: string;
  format?: string;
  transformation?: string;
  apiKey: string;
  cloudName: string;
}

export function problemaImagenMarca(file: File): string | null {
  if (!file.type.startsWith('image/')) return 'Elige una foto o imagen, no otro tipo de archivo.';
  if (file.size > MAX) return `La imagen puede pesar como máximo 12 MB. Esta pesa ${(file.size / 1024 / 1024).toFixed(1)} MB.`;
  return null;
}

export async function subirImagenMarca(file: File, companyId: string): Promise<string> {
  const problema = problemaImagenMarca(file);
  if (problema) throw new Error(problema);

  const sesion = (await supabase().auth.getSession()).data.session;
  if (!sesion) throw new Error('Tu sesión caducó. Vuelve a entrar.');

  const firma = await fetch('/api/cloudinary/firma', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${sesion.access_token}` },
    body: JSON.stringify({ companyId, destino: 'brand' }),
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'No se pudo preparar la subida');
    return j as FirmaSubida;
  });

  const datos = new FormData();
  datos.append('file', file);
  datos.append('api_key', firma.apiKey);
  datos.append('timestamp', String(firma.timestamp));
  datos.append('folder', firma.folder);
  if (firma.format) datos.append('format', firma.format);
  if (firma.transformation) datos.append('transformation', firma.transformation);
  datos.append('signature', firma.signature);

  return fetch(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, {
    method: 'POST',
    body: datos,
  }).then(async (r) => {
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? 'No se pudo subir la imagen');
    if (typeof j.secure_url !== 'string') throw new Error('La subida no devolvió una imagen válida.');
    return j.secure_url as string;
  });
}
