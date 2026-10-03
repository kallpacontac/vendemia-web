import 'server-only';
import { entorno } from '../entorno';
import { rpc, servidor } from '../supabase';
import { urlNegocio } from '../../dominio/config';
import { cuerpoClase, cuerpoObjeto, huella, idClase, type DatosClase, type DatosObjeto } from '../../dominio/wallet-payload';
import { enlaceGuardar, ErrorWallet, upsert } from './google';
import { CredencialesInvalidas } from './credenciales';

/**
 * Clase por programa y objeto por miembro, con el estado apuntado en Postgres.
 * La base nunca espera a Google: estas funciones las llama el worker del
 * outbox (o el botón de guardar), DESPUÉS de que la operación ya se confirmó.
 */

interface FilaClase {
  class_id: string | null;
  is_demo: boolean;
  config_hash: string | null;
  state: string;
}

type DatosClaseRpc = Omit<DatosClase, 'logo_valido'> & {
  status: string;
  class: FilaClase | null;
};

export async function sincronizarClase(programId: string): Promise<{ classId: string; cambiado: boolean }> {
  const sb = servidor();
  const issuer = entorno.walletIssuer();
  const d = await rpc<DatosClaseRpc | null>(sb, 'loyalty_srv_wallet_class_data', { p_program: programId });
  if (!d) throw new Error('programa inexistente');
  const demo = Boolean(d.class?.is_demo);
  const classId = demo ? entorno.walletDemoClass() : idClase(issuer, programId);
  try {
    if (!issuer) throw new CredencialesInvalidas('Falta GOOGLE_WALLET_ISSUER_ID');
    if (demo && !classId.startsWith(`${issuer}.`)) throw new CredencialesInvalidas('GOOGLE_WALLET_DEMO_CLASS_ID no es de este emisor');
    const logoValido = await logoComprobado(d.brand.logo_url);
    const cuerpo = cuerpoClase(
      { ...d, logo_valido: logoValido },
      { urlNegocio: urlNegocio(d.brand.slug), logoVendemia: entorno.walletLogoVendemia(), demo },
    );
    const h = huella(cuerpo);
    if (d.class?.state === 'synced' && d.class.config_hash === h && d.class.class_id === classId) {
      return { classId, cambiado: false };
    }
    // reviewStatus solo al crear: una clase en DRAFT no admite objetos, y
    // volver a pedir revisión en cada cambio no aporta nada.
    const r = await upsert('loyaltyClass', classId, cuerpo, { reviewStatus: 'UNDER_REVIEW' });
    await rpc(sb, 'loyalty_srv_wallet_class_mark', {
      p_program: programId,
      p_ok: true,
      p_issuer: issuer,
      p_class_id: classId,
      p_review_status: (r.datos?.reviewStatus as string | undefined) ?? null,
      p_config_hash: h,
      p_error: null,
    });
    return { classId, cambiado: true };
  } catch (e) {
    await rpc(sb, 'loyalty_srv_wallet_class_mark', {
      p_program: programId,
      p_ok: false,
      p_issuer: issuer || null,
      p_class_id: classId || null,
      p_review_status: null,
      p_config_hash: null,
      p_error: sanear(e),
    });
    throw e;
  }
}

/** ¿El logo del comercio pasó la comprobación de 660×660 en su URL actual? */
async function logoComprobado(url: string | null): Promise<boolean> {
  if (!url) return false;
  const { comprobarLogo } = await import('../logo');
  return (await comprobarLogo(url)).ok;
}

interface DatosObjetoRpc extends DatosObjeto {
  pass: { id: string; object_id: string; class_id: string; desired_rev: number; synced_rev: number; state: string };
  class: FilaClase | null;
  member: DatosObjeto['member'] & { id: string; company_id: string };
}

/** Actualiza (o crea) el objeto de un miembro. Devuelve false si no tiene pase. */
export async function sincronizarObjeto(memberId: string): Promise<boolean> {
  const sb = servidor();
  const d = await rpc<DatosObjetoRpc | null>(sb, 'loyalty_srv_wallet_object_data', {
    p_member: memberId,
    p_card_token: null,
    p_issuer: entorno.walletIssuer(),
  });
  if (!d) return false;
  await subirObjeto(d);
  return true;
}

async function subirObjeto(d: DatosObjetoRpc) {
  const sb = servidor();
  const rev = d.pass.desired_rev;
  try {
    let classId = d.class?.class_id;
    if (!classId || d.class?.state !== 'synced') {
      ({ classId } = await sincronizarClase(programaDe(d)));
    }
    const cuerpo = cuerpoObjeto(d, classId!, { urlNegocio: urlNegocio(d.brand.slug) });
    await upsert('loyaltyObject', d.pass.object_id, cuerpo, { hasUsers: false });
    await rpc(sb, 'loyalty_srv_wallet_pass_mark', {
      p_member: d.member.id,
      p_ok: true,
      p_rev: rev,
      p_class_id: classId,
      p_inactive: d.member.status !== 'active',
      p_link_issued: false,
      p_error: null,
    });
  } catch (e) {
    await rpc(sb, 'loyalty_srv_wallet_pass_mark', {
      p_member: d.member.id,
      p_ok: false,
      p_rev: null,
      p_class_id: null,
      p_inactive: false,
      p_link_issued: false,
      p_error: sanear(e),
    });
    throw e;
  }
}

/** El program_id no viaja en el objeto: se saca de la fila de la clase. */
function programaDe(d: DatosObjetoRpc): string {
  const id = (d.class as unknown as { program_id?: string } | null)?.program_id;
  if (!id) throw new Error('El pase no tiene clase asociada');
  return id;
}

/**
 * El botón de la tarjeta web: asegura la fila del pase, crea/actualiza el
 * objeto en Google y firma el enlace. Emitir el enlace NO es «guardado»: eso
 * solo lo sabe Google, y por ahora no nos lo cuenta (ver README).
 */
export async function enlaceParaTarjeta(cardToken: string, origen: string): Promise<string> {
  const sb = servidor();
  const d = await rpc<DatosObjetoRpc | null>(sb, 'loyalty_srv_wallet_object_data', {
    p_member: null,
    p_card_token: cardToken,
    p_issuer: entorno.walletIssuer(),
  });
  if (!d) throw new Error('loyalty:not_found');
  await subirObjeto(d);
  const url = enlaceGuardar(d.pass.object_id, origen);
  await rpc(sb, 'loyalty_srv_wallet_pass_mark', {
    p_member: d.member.id,
    p_ok: true,
    p_rev: null,
    p_class_id: null,
    p_inactive: false,
    p_link_issued: true,
    p_error: null,
  });
  return url;
}

/** Lo que se guarda como último error: corto, sin tokens ni correos. */
export function sanear(e: unknown): string {
  const m = e instanceof ErrorWallet || e instanceof Error ? e.message : String(e);
  return m
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<jwt>')
    .replace(/[\w.+-]+@[\w.-]+/g, '<correo>')
    .slice(0, 300);
}

export const esPermanente = (e: unknown) =>
  (e instanceof ErrorWallet && e.permanente) || e instanceof CredencialesInvalidas;
