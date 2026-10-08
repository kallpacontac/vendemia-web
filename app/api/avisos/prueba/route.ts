// La lógica vive en modules/avisos. Aquí solo la ruta y su configuración.
import { prueba } from '@/modules/avisos/servidor/rutas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = (req: Request) => prueba(req);
