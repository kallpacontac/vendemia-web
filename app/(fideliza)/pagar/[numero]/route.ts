// La lógica vive en modules/fideliza. Aquí solo la ruta pública de copiado.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export { GET } from '@/modules/fideliza/servidor/rutas/pago-movil';
