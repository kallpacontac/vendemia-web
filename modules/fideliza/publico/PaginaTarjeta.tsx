/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA TARJETA WEB · fideliza.vendemias.com/m/<token>
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Se pinta en el servidor con el saldo leído EN ESTE MOMENTO de Postgres y sin
 * caché (force-dynamic + Cache-Control privado). El service worker no guarda
 * esta página: sin conexión enseña un aviso, nunca un saldo viejo como bueno.
 *
 * El token de la URL solo deja LEER esta tarjeta y gestionar sus datos. No
 * suma ni canjea: eso exige a un empleado con sesión en la caja.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import '@/modules/fideliza/estilos/tarjeta.css';
import Tarjeta, { type DatosTarjeta } from './Tarjeta';
import { entorno } from '@/modules/fideliza/servidor/entorno';
import { rpc, servidor } from '@/modules/fideliza/servidor/supabase';
import { log } from '@/modules/fideliza/servidor/http';


export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  return {
    title: 'Mi tarjeta',
    robots: { index: false, follow: false },
    manifest: `/m/${params.token}/manifest.webmanifest`,
    // Que el token no viaje a terceros al pulsar un enlace del negocio.
    referrer: 'no-referrer',
  };
}

export default async function Pagina({ params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{30,64}$/.test(params.token)) notFound();
  let datos: DatosTarjeta;
  try {
    datos = await rpc<DatosTarjeta>(servidor(), 'loyalty_srv_card', { p_card_token: params.token, p_log: true });
  } catch (e) {
    log('card_error', { mensaje: e instanceof Error ? e.message.slice(0, 120) : 'x' });
    return (
      <main className="fz">
        <div className="fz-caja">
          <p className="fz-grande">No pudimos cargar tu tarjeta ahora.</p>
          <p className="fz-nota">Tu saldo está a salvo. Vuelve a intentarlo en un momento.</p>
        </div>
      </main>
    );
  }
  if (datos.status !== 'ok') notFound();

  const qr = await QRCode.toString(datos.member.qr_token, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return (
    <Tarjeta
      token={params.token}
      inicial={datos}
      leidoEn={new Date().toISOString()}
      qrSvg={qr}
      vapid={entorno.vapidPublica() || null}
      walletDisponible={Boolean(entorno.walletIssuer() && entorno.walletCredencialesB64())}
      walletDemo={(process.env.GOOGLE_WALLET_MODE ?? 'demo') !== 'production'}
    />
  );
}
