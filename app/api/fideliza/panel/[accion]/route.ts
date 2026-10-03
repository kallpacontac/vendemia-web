// La lógica vive en modules/fideliza. Aquí solo la ruta y su configuración,
// que Next exige leer en este fichero.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { POST } from '@/modules/fideliza/servidor/rutas/panel';
