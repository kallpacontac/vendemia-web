import type { PlantillaGuardada, TipoPagina } from './plantillas';

export type PlantillaEjemplo = Extract<PlantillaGuardada, 'vitrina' | 'lista' | 'carta' | 'agenda' | 'impulso'>;

export const PLANTILLAS_EJEMPLO: { id: PlantillaEjemplo; nombre: string; detalle: string }[] = [
  { id: 'vitrina', nombre: 'Minimalista', detalle: 'Fotografías protagonistas y tarjetas limpias' },
  { id: 'lista', nombre: 'Editorial', detalle: 'Lectura rápida y productos fáciles de comparar' },
  { id: 'carta', nombre: 'Clásico cálido', detalle: 'Tonos crema y una carta por categorías' },
  { id: 'agenda', nombre: 'Nocturna', detalle: 'Contraste oscuro y acentos luminosos' },
  { id: 'impulso', nombre: 'Impulso', detalle: 'Deporte, fotografía editorial y productos en primer plano' },
];

export const esPlantillaEjemplo = (valor: unknown): valor is PlantillaEjemplo =>
  PLANTILLAS_EJEMPLO.some((p) => p.id === valor);

export const urlEjemplo = (plantilla: PlantillaEjemplo = 'vitrina') =>
  `/ejemplos/catalogo?plantilla=${plantilla}`;

export const urlEjemploPara = (tipo: TipoPagina, plantilla: PlantillaGuardada, vistaServicios: 'vertical' | 'horizontal' = 'vertical') => {
  if (plantilla === 'luxury') return `/ejemplos/barberia?tipo=${tipo}&servicios=${vistaServicios}`;
  if (tipo === 'agenda') return `/ejemplos/clinica-dental?diseno=${plantilla === 'lista' ? 'editorial' : 'clara'}`;
  if (tipo === 'tienda' && plantilla === 'agenda') return '/ejemplos/cafeteria';
  return urlEjemplo(esPlantillaEjemplo(plantilla) ? plantilla : 'vitrina');
};
