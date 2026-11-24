// La lógica vive en modules/lector. Aquí solo la ruta y su configuración.
import { vincular } from '@/modules/lector/servidor/rutas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export const POST = (req: Request) => vincular(req);
