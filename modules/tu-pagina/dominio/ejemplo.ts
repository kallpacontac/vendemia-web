import type { PlantillaGuardada } from './plantillas';

export type PlantillaEjemplo = Extract<PlantillaGuardada, 'vitrina' | 'lista' | 'carta' | 'agenda'>;

export const PLANTILLAS_EJEMPLO: { id: PlantillaEjemplo; nombre: string; detalle: string }[] = [
  { id: 'vitrina', nombre: 'Minimalista', detalle: 'Fotografías protagonistas y tarjetas limpias' },
  { id: 'lista', nombre: 'Editorial', detalle: 'Lectura rápida y productos fáciles de comparar' },
  { id: 'carta', nombre: 'Clásico cálido', detalle: 'Tonos crema y una carta por categorías' },
  { id: 'agenda', nombre: 'Nocturna', detalle: 'Contraste oscuro y acentos luminosos' },
];

export const esPlantillaEjemplo = (valor: unknown): valor is PlantillaEjemplo =>
  PLANTILLAS_EJEMPLO.some((p) => p.id === valor);

export const urlEjemplo = (plantilla: PlantillaEjemplo = 'vitrina') =>
  `/ejemplos/catalogo?plantilla=${plantilla}`;
