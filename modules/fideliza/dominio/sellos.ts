/**
 * El icono del sello de la tarjeta (Wallet y vista previa). Trazos de 24×24
 * tomados de Lucide (licencia ISC), para pintarlos dentro de un SVG propio.
 * Son constantes: nunca llevan datos de fuera.
 */
export type Sello = 'check' | 'corazon' | 'estrella' | 'cafe' | 'tijera' | 'regalo';

export const SELLOS: { id: Sello; nombre: string; trazo: string }[] = [
  { id: 'check', nombre: 'Check', trazo: '<path d="M20 6 9 17l-5-5"/>' },
  {
    id: 'corazon',
    nombre: 'Corazón',
    trazo: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  },
  { id: 'estrella', nombre: 'Estrella', trazo: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
  {
    id: 'cafe',
    nombre: 'Café',
    trazo: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  },
  {
    id: 'tijera',
    nombre: 'Tijera',
    trazo: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
  },
  {
    id: 'regalo',
    nombre: 'Regalo',
    trazo: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  },
];

export const SELLO_POR_DEFECTO: Sello = 'check';
export const selloValido = (s: unknown): Sello => (SELLOS.some((x) => x.id === s) ? (s as Sello) : SELLO_POR_DEFECTO);
export const trazoSello = (s: Sello) => SELLOS.find((x) => x.id === s)!.trazo;
