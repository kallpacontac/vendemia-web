// La lógica vive en modules/agenda-google. Aquí solo la ruta y su configuración.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { desconectar as POST } from '@/modules/agenda-google/servidor/rutas';
