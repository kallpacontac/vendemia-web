// La lógica vive en modules/avisos. Aquí solo la ruta y su configuración.
import { despachar } from '@/modules/avisos/servidor/rutas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export const POST = (req: Request) => despachar(req);
