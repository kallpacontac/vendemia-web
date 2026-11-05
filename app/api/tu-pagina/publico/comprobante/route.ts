// La lógica vive en modules/tu-pagina. Aquí solo la ruta y su configuración.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leer la captura con IA puede tardar varios segundos; el valor por defecto se queda corto.
export const maxDuration = 45;
export { POST } from '@/modules/tu-pagina/servidor/rutas/comprobante';
