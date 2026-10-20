/**
 * Las fotos de los ejemplos (Sonrisa Norte y Grano de Barrio) hacen de portada
 * mientras el negocio no sube la suya. Solo con un diseño elegido: las páginas
 * anteriores conservan su color hasta que el dueño elija uno.
 *
 * Se guarda la clave, no la ruta: `portada_url` exige https y es la foto del
 * negocio; la de la plantilla vive en `secciones.apariencia.fotoPlantilla`.
 */
import type { AparienciaPagina } from './apariencia';
import type { TipoPagina } from './plantillas';

export type FotoPlantilla = 'clinica' | 'cafeteria';

export const FOTOS_PLANTILLA: { id: FotoPlantilla; nombre: string; url: string }[] = [
  { id: 'clinica', nombre: 'Sonrisa Norte', url: '/assets/negocios-ejemplo/clinica-hero.webp' },
  { id: 'cafeteria', nombre: 'Grano de Barrio', url: '/assets/negocios-ejemplo/cafeteria-hero.webp' },
];

/** `ninguna` = el dueño prefiere solo el color de portada. */
export const esFotoPlantilla = (v: unknown): v is FotoPlantilla | 'ninguna' =>
  v === 'ninguna' || FOTOS_PLANTILLA.some((f) => f.id === v);

/** La del ejemplo que enseña cada diseño (dominio/ejemplo.ts → urlEjemploPara). */
export const fotoPlantillaPorDefecto = (tipo: TipoPagina): FotoPlantilla =>
  tipo === 'tienda' ? 'cafeteria' : 'clinica';

/** La elegida, o la del diseño si no se eligió ninguna; null = solo color. */
export function fotoDePlantilla(a: AparienciaPagina, tipo: TipoPagina): string | null {
  if (!a.plantillaActiva || a.fotoPlantilla === 'ninguna') return null;
  const id = esFotoPlantilla(a.fotoPlantilla) ? a.fotoPlantilla : fotoPlantillaPorDefecto(tipo);
  return FOTOS_PLANTILLA.find((f) => f.id === id)?.url ?? null;
}
