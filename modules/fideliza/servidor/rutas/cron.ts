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
import { avisarCumple, pedirResena, type PedidoResena } from '@/modules/fideliza/servidor/avisos';


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
    // Niveles del mes (0015): pone a 0 el saldo de quien aún no vino este mes. Si la
    // migración no está aplicada, no rompe el resto del cron.
    const mes = await rpc(sb, 'loyalty_srv_period_roll', {}).catch((e: unknown) => ({ omitido: String(e).slice(0, 120) }));
    // Cumpleaños (0019): quienes cumplen hoy reciben su saludo con el regalo. Corre a las 9:00
    // de Lima (vercel.json). Sin la migración, se omite sin tocar lo demás.
    const cumpleaneros = await rpc<{ company_id: string; member_id: string; regalo: string }[]>(sb, 'loyalty_srv_cumple_hoy', {})
      .catch((e: unknown) => { log('cron_cumple_omitido', { mensaje: String(e).slice(0, 120) }); return []; });
    for (const c of Array.isArray(cumpleaneros) ? cumpleaneros : []) await avisarCumple(c.company_id, c.member_id, c.regalo);
    const cumple = Array.isArray(cumpleaneros) ? cumpleaneros.length : 0;
    // Reseñas (0026): una vez por cliente, al día siguiente de su 1.ª (o 2.ª) visita. Sin la
    // migración, se omite sin tocar lo demás.
    const pedidos = await rpc<PedidoResena[]>(sb, 'loyalty_srv_resenas_hoy', {})
      .catch((e: unknown) => { log('cron_resenas_omitido', { mensaje: String(e).slice(0, 120) }); return []; });
    const resenas = { pedidas: 0, push: 0, correo: 0 };
    const lista = Array.isArray(pedidos) ? pedidos : [];
    for (let i = 0; i < lista.length; i += 5) {
      for (const r of await Promise.all(lista.slice(i, i + 5).map(pedirResena))) {
        resenas.pedidas++;
        if (r.push) resenas.push++;
        if (r.correo) resenas.correo++;
      }
    }
    const cola = await drenar({ lote: 20, tiempoMaxMs: 40_000 });
    log('cron', { limpieza, campanas, mes, cumple, resenas, cola });
    return ok({ limpieza, campanas, mes, cumple, resenas, cola });
  } catch (e) {
    return desdeError(e, 'cron');
  }
}
