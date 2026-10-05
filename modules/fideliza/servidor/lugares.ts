import 'server-only';
import { FaltaConfiguracion } from './entorno';

/**
 * Buscar el negocio en Google (Places API New · Text Search) para sacar su
 * place_id. Con él se arman solos el enlace de reseñas y el de «cómo llegar»:
 * el dueño no tiene que buscar ni copiar nada.
 *
 * La clave GOOGLE_PLACES_API_KEY es de servidor (sin NEXT_PUBLIC_). Se piden
 * solo id, nombre y dirección: lo justo para que el dueño reconozca su local.
 */
export interface Lugar {
  id: string;
  nombre: string;
  direccion: string;
}

export async function buscarLugares(texto: string): Promise<Lugar[]> {
  const clave = (process.env.GOOGLE_PLACES_API_KEY ?? '').trim();
  if (!clave) throw new FaltaConfiguracion('GOOGLE_PLACES_API_KEY');
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': clave,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: texto, languageCode: 'es', regionCode: 'PE' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`loyalty:places_error`);
  const j = (await r.json()) as { places?: { id: string; displayName?: { text?: string }; formattedAddress?: string }[] };
  return (j.places ?? []).slice(0, 6).map((p) => ({
    id: p.id,
    nombre: p.displayName?.text ?? '',
    direccion: p.formattedAddress ?? '',
  }));
}
