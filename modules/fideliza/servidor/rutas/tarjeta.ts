/**
 * Lo que el titular hace con SU tarjeta: ver el saldo actualizado, su nombre,
 * contacto, consentimiento, avisos push, borrar sus datos, y pedir el enlace de
 * Google Wallet. Nada cambia saldos.
 *
 * El token va en el CUERPO, no en la URL de esta llamada: así no acaba en los
 * logs de acceso de cada petición.
 */
import { z } from 'zod';
import { cuerpo, desdeError, fallo, huellaIp, limitar, ok } from '@/modules/fideliza/servidor/http';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { enlaceParaTarjeta } from '@/modules/fideliza/servidor/wallet/sincronizar';
import { FIDELIZA_URL } from '@/modules/fideliza/dominio/config';


const token = z.string().regex(/^[A-Za-z0-9_-]{30,64}$/);
const esquema = z.discriminatedUnion('accion', [
  z.object({ accion: z.literal('ver'), token }),
  z.object({ accion: z.literal('wallet'), token }),
  z.object({ accion: z.literal('alias'), token, alias: z.string().trim().max(40) }),
  z.object({
    accion: z.literal('contacto'),
    token,
    phone: z.string().trim().max(20).optional(),
    email: z.string().trim().max(120).optional(),
  }),
  z.object({ accion: z.literal('consentimiento'), token, granted: z.boolean(), textVersion: z.string().max(20) }),
  z.object({
    accion: z.literal('push'),
    token,
    endpoint: z.string().url().max(800).regex(/^https:\/\//),
    p256dh: z.string().min(20).max(200),
    auth: z.string().min(8).max(100),
    installationId: z.string().max(64).optional(),
  }),
  z.object({ accion: z.literal('push_baja'), token, endpoint: z.string().max(800) }),
  z.object({ accion: z.literal('clic'), token, campaignId: z.string().uuid() }),
  z.object({ accion: z.literal('borrar'), token, confirmo: z.literal(true) }),
]);

export async function POST(req: Request) {
  try {
    const e = esquema.safeParse(await cuerpo(req, 4000));
    if (!e.success) return fallo('invalid_input');
    const d = e.data;
    const ip = huellaIp(req);
    const [cubo, max] = d.accion === 'wallet' ? ['w', 10] : d.accion === 'ver' ? ['v', 60] : ['a', 30];
    if (!(await limitar(`ip:${ip}:card:${cubo}`, max, 60))) return fallo('rate_limited', 429);

    const sb = servidor();
    if (d.accion === 'ver') {
      return ok(await rpc(sb, 'loyalty_srv_card', { p_card_token: d.token, p_log: false }));
    }
    if (d.accion === 'wallet') {
      const url = await enlaceParaTarjeta(d.token, new URL(FIDELIZA_URL).origin);
      return ok({ url });
    }
    const [accion, args] = (() => {
      switch (d.accion) {
        case 'alias':
          return ['alias', { alias: d.alias }];
        case 'contacto':
          return ['contact', { phone: d.phone || null, email: d.email || null }];
        case 'consentimiento':
          return ['consent', { channel: 'push', granted: d.granted, text_version: d.textVersion }];
        case 'push':
          return ['push_subscribe', { endpoint: d.endpoint, p256dh: d.p256dh, auth: d.auth, installation_id: d.installationId }];
        case 'push_baja':
          return ['push_unsubscribe', { endpoint: d.endpoint }];
        case 'clic':
          return ['campaign_click', { campaign_id: d.campaignId }];
        case 'borrar':
          return ['erase', {}];
      }
    })();
    const r = await rpc(sb, 'loyalty_srv_card_action', { p_card_token: d.token, p_action: accion, p_args: args });
    return ok(r);
  } catch (e) {
    return desdeError(e, 'publico/tarjeta');
  }
}

// Que nadie construya enlaces a esta ruta con GET y el token en la URL.
export async function GET() {
  return fallo('invalid_action', 405);
}

