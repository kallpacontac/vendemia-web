// La lógica vive en modules/pide. Aquí solo la ruta y su configuración.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { POST } from '@/modules/pide/servidor/rutas/publicar';
