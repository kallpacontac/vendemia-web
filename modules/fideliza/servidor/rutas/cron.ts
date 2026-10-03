/**
 * El cron de Fideliza: mantenimiento, campañas y un lote del outbox.
 *
 * Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`. Sin ese secreto no
 * se hace nada. No acepta company_id: drena todas las compañías.
 *
 * ⚠️ Vercel Hobby solo permite cron diario (vercel.json). La entrega rápida no
 * depende de él: el panel drena su compañía tras cada operación. Ver el README
 * de modules/fideliza/sql para programarlo cada 5 minutos.
 */
import { timingSafeEqual } from 'crypto';
import { entorno } from '@/modules/fideliza/servidor/entorno';
import { desdeError, fallo, log, ok } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { drenar } from '@/modules/fideliza/servidor/worker';


function autorizado(req: Request): boolean {
  const secreto = entorno.cronSecret();
  const dado = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (secreto.length < 16 || dado.length !== secreto.length) return false;
  return timingSafeEqual(Buffer.from(dado), Buffer.from(secreto));
}

export async function GET(req: Request) {
  if (!autorizado(req)) return fallo('forbidden', 401);
  try {
    const sb = servidor();
    const limpieza = await rpc(sb, 'loyalty_srv_housekeeping', {});
    const campanas = await rpc(sb, 'loyalty_srv_campaign_scan', {});
    const cola = await drenar({ lote: 20, tiempoMaxMs: 40_000 });
    log('cron', { limpieza, campanas, cola });
    return ok({ limpieza, campanas, cola });
  } catch (e) {
    return desdeError(e, 'cron');
  }
}
