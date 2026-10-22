/**
 * Las fotos de los ejemplos hacen de portada
 * mientras el negocio no sube la suya. Solo con un diseño elegido: las páginas
 * anteriores conservan su color hasta que el dueño elija uno.
 *
 * Se guarda la clave, no la ruta: `portada_url` exige https y es la foto del
 * negocio; la de la plantilla vive en `secciones.apariencia.fotoPlantilla`.
 */
import type { AparienciaPagina } from './apariencia';
import type { PlantillaGuardada, TipoPagina } from './plantillas';

export type FotoPlantilla = 'clinica' | 'cafeteria' | 'barberia';

export const FOTOS_SERVICIOS_LUXURY = {
  corte: '/assets/luxury-ejemplo/corte.webp',
  barba: '/assets/luxury-ejemplo/barba.webp',
  peinado: '/assets/luxury-ejemplo/peinado.webp',
} as const;

export function fotoServicioLuxury(nombre: string, indice: number): string {
  const n = nombre.toLocaleLowerCase('es');
  if (/barba|afeitado|perfilado/.test(n)) return FOTOS_SERVICIOS_LUXURY.barba;
  if (/peinado|brushing|color|tinte|salón|salon|maquillaje/.test(n)) return FOTOS_SERVICIOS_LUXURY.peinado;
  if (/corte|cabello|peluquería|peluqueria/.test(n)) return FOTOS_SERVICIOS_LUXURY.corte;
  return [FOTOS_SERVICIOS_LUXURY.corte, FOTOS_SERVICIOS_LUXURY.barba, FOTOS_SERVICIOS_LUXURY.peinado][indice % 3];
}

export const FOTOS_PLANTILLA: { id: FotoPlantilla; nombre: string; url: string }[] = [
  { id: 'clinica', nombre: 'Sonrisa Norte', url: '/assets/negocios-ejemplo/clinica-hero.webp' },
  { id: 'cafeteria', nombre: 'Grano de Barrio', url: '/assets/negocios-ejemplo/cafeteria-hero.webp' },
  { id: 'barberia', nombre: 'Atelier Norte', url: '/assets/luxury-ejemplo/portada.webp' },
];

/** `ninguna` = el dueño prefiere solo el color de portada. */
export const esFotoPlantilla = (v: unknown): v is FotoPlantilla | 'ninguna' =>
  v === 'ninguna' || FOTOS_PLANTILLA.some((f) => f.id === v);

/** La del ejemplo que enseña cada diseño (dominio/ejemplo.ts → urlEjemploPara). */
export const fotoPlantillaPorDefecto = (tipo: TipoPagina, plantilla?: PlantillaGuardada): FotoPlantilla =>
  plantilla === 'luxury' ? 'barberia' : tipo === 'tienda' ? 'cafeteria' : 'clinica';

/** La elegida, o la del diseño si no se eligió ninguna; null = solo color. */
export function fotoDePlantilla(a: AparienciaPagina, tipo: TipoPagina, plantilla?: PlantillaGuardada): string | null {
  if (!a.plantillaActiva || (a.fotoPlantilla === 'ninguna' && plantilla !== 'luxury')) return null;
  const id = a.fotoPlantilla !== 'ninguna' && esFotoPlantilla(a.fotoPlantilla) ? a.fotoPlantilla : fotoPlantillaPorDefecto(tipo, plantilla);
  return FOTOS_PLANTILLA.find((f) => f.id === id)?.url ?? null;
}
