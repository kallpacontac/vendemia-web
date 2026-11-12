// La foto del comprobante al cobrar desde el panel (Configuración › Negocio › Comprobante al cobrar).
// La lógica vive en modules/tu-pagina; es la misma que /api/canchas/evidencia.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Leer la foto con IA puede tardar varios segundos; el valor por defecto se queda corto.
export const maxDuration = 45;
export { POST } from '@/modules/tu-pagina/servidor/rutas/evidencia';
