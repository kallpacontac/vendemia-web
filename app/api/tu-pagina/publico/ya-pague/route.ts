// La lógica vive en modules/tu-pagina. Aquí solo la ruta y su configuración.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
export { GET, POST } from '@/modules/tu-pagina/servidor/rutas/yaPague';
