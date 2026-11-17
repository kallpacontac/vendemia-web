// La lógica vive en modules/agenda-google. Aquí solo la ruta y su configuración.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export { vuelta as GET } from '@/modules/agenda-google/servidor/rutas';
