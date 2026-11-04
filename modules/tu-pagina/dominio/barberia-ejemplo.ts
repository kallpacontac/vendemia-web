import { FOTOS_SERVICIOS_LUXURY } from './fotos';

export const SERVICIOS_BARBERIA = [
  { nombre: 'Corte de autor', descripcion: 'Un corte pensado para tu estilo, con acabado a detalle.', precio: 65, duracion: 45, foto: FOTOS_SERVICIOS_LUXURY.corte },
  { nombre: 'Perfilado de barba', descripcion: 'Diseño preciso, toalla tibia y cuidado de la piel.', precio: 45, duracion: 30, foto: FOTOS_SERVICIOS_LUXURY.barba },
  { nombre: 'Peinado de ocasión', descripcion: 'Textura, movimiento y un acabado hecho para durar.', precio: 75, duracion: 50, foto: FOTOS_SERVICIOS_LUXURY.peinado },
] as const;

export const HORAS_BARBERIA = ['09:00', '10:30', '12:00', '15:00', '16:30'] as const;

/** Personas y fotografías ilustrativas: no representan empleados de Atelier Norte. */
export const BARBEROS_EJEMPLO = [
  { nombre: 'Andrés', especialidad: 'Cortes clásicos', foto: '/assets/barberos-fotos/12946033.jpg' },
  { nombre: 'Mateo', especialidad: 'Barba y precisión', foto: '/assets/barberos-fotos/18483774.jpg' },
  { nombre: 'Diego', especialidad: 'Estilo contemporáneo', foto: '/assets/barberos-fotos/20302333.jpg' },
] as const;

export const HORAS_POR_BARBERO: readonly (readonly string[])[] = [
  ['09:00', '10:30', '15:00'],
  ['10:30', '12:00', '16:30'],
  ['09:00', '12:00', '15:00', '16:30'],
];
