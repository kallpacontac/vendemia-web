// Boletas y facturas electrónicas: modules/facturacion. Aquí solo la ruta.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// SUNAT a veces tarda; el proveedor espera su respuesta antes de contestar.
export const maxDuration = 45;
export { POST } from '@/modules/facturacion/servidor/ruta';
