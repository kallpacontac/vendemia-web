import 'server-only';
import { log } from './http';
import { enviarPush, pushConfigurado, type Suscripcion } from './push';
import { rpc, servidor } from './supabase';
import { mensajeWallet } from './wallet/google';

/**
 * El aviso al cliente cuando gana o canjea un premio: push (si lo activó en su
 * tarjeta) y mensaje en su pase de Google Wallet (si lo guardó). Nunca hace
 * fallar la operación de la caja y no la retrasa más de unos segundos.
 */
interface DatosAviso {
  status: string;
  negocio?: string;
  logo?: string | null;
  subscriptions?: Suscripcion[];
  wallet_object_id?: string | null;
}

export type TipoAviso = 'ganado' | 'canjeado';

function textoAviso(tipo: TipoAviso, premio: string, negocio: string) {
  return tipo === 'canjeado'
    ? { titulo: '¡Premio canjeado!', cuerpo: `${premio} · Gracias por venir a ${negocio}.` }
    : { titulo: '¡Ganaste un premio!', cuerpo: `${premio} · Enseña tu tarjeta en ${negocio} para canjearlo.` };
}

async function enviar(companyId: string, memberId: string, tipo: TipoAviso, premio: string) {
  const sb = servidor();
  const d = await rpc<DatosAviso>(sb, 'loyalty_srv_aviso_datos', { p_company: companyId, p_member: memberId });
  if (d.status !== 'ok') return;
  const { titulo, cuerpo } = textoAviso(tipo, premio, d.negocio ?? 'tu negocio');
  const envios: Promise<unknown>[] = [];
  if (d.subscriptions?.length && pushConfigurado()) {
    envios.push(
      enviarPush(d.subscriptions, { title: titulo, body: cuerpo, icon: d.logo ?? undefined }).then((r) =>
        r.caducados.length || r.error
          ? rpc(sb, 'loyalty_srv_push_result', { p_member: memberId, p_campaign: null, p_accepted: 0, p_gone: r.caducados.length ? r.caducados : null, p_error: r.error })
          : null,
      ),
    );
  }
  if (d.wallet_object_id) envios.push(mensajeWallet(d.wallet_object_id, titulo, cuerpo));
  const r = await Promise.allSettled(envios);
  for (const x of r) if (x.status === 'rejected') log('aviso_premio_fallo', { tipo, mensaje: String(x.reason).slice(0, 160) });
}

export async function avisarPremio(companyId: string, memberId: string, tipo: TipoAviso, premio: string | null | undefined) {
  try {
    await Promise.race([
      enviar(companyId, memberId, tipo, premio?.trim() || 'Tu premio'),
      new Promise((listo) => setTimeout(listo, 3500)),
    ]);
  } catch (e) {
    log('aviso_premio_omitido', { tipo, mensaje: e instanceof Error ? e.message.slice(0, 160) : 'x' });
  }
}
