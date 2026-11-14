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
  return enviarTexto(companyId, memberId, tipo, (negocio) => textoAviso(tipo, premio, negocio), true);
}

/**
 * Manda el texto por push y, si `conWallet`, también como mensaje del pase.
 * Los sellos van sin Wallet: el pase ya enseña el saldo nuevo solo, y Google
 * limita los mensajes por pase (uno por sello los gastaría).
 */
async function enviarTexto(
  companyId: string,
  memberId: string,
  tipo: string,
  texto: (negocio: string) => { titulo: string; cuerpo: string },
  conWallet: boolean,
) {
  const sb = servidor();
  const d = await rpc<DatosAviso>(sb, 'loyalty_srv_aviso_datos', { p_company: companyId, p_member: memberId });
  if (d.status !== 'ok') return;
  if (!conWallet && !d.subscriptions?.length) return;
  const { titulo, cuerpo } = texto(d.negocio ?? 'tu negocio');
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
  if (conWallet && d.wallet_object_id) envios.push(mensajeWallet(d.wallet_object_id, titulo, cuerpo));
  const r = await Promise.allSettled(envios);
  for (const x of r) if (x.status === 'rejected') log('aviso_premio_fallo', { tipo, mensaje: String(x.reason).slice(0, 160) });
}

/**
 * 13-nov-2026 (Kallpa): el aviso de CADA sello o visita, con lo que lleva y lo que
 * le falta. Solo push y solo a quien activó los avisos en su tarjeta. Es de la
 * operación, no una campaña: no cuenta para el tope de avisos al mes.
 */
export async function avisarSello(companyId: string, memberId: string, titulo: string, cuerpo: string) {
  try {
    await Promise.race([
      enviarTexto(companyId, memberId, 'sello', (negocio) => ({ titulo: `${titulo} · ${negocio}`, cuerpo }), false),
      new Promise((listo) => setTimeout(listo, 3500)),
    ]);
  } catch (e) {
    log('aviso_sello_omitido', { mensaje: e instanceof Error ? e.message.slice(0, 160) : 'x' });
  }
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

/**
 * 14-nov-2026 (The 24/7): el saludo de cumpleaños con el regalo del negocio (sql/0019). Lo manda
 * el cron una vez al año por persona: push (si activó los avisos) y mensaje en su pase de Google
 * Wallet (si lo guardó). Es de la tarjeta, no una campaña: no cuenta para el tope de avisos.
 */
export async function avisarCumple(companyId: string, memberId: string, regalo: string) {
  try {
    await Promise.race([
      enviarTexto(companyId, memberId, 'cumple', (negocio) => ({
        titulo: `🎂 ¡Feliz cumpleaños! · ${negocio}`,
        cuerpo: `Hoy te toca: ${regalo.trim().replace(/[.!]+$/, '')}. Enseña tu tarjeta al llegar. ¡Te esperamos!`,
      }), true),
      new Promise((listo) => setTimeout(listo, 5000)),
    ]);
  } catch (e) {
    log('aviso_cumple_omitido', { mensaje: e instanceof Error ? e.message.slice(0, 160) : 'x' });
  }
}
