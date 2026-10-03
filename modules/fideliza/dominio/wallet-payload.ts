/**
 * ══════════════════════════════════════════════════════════════════════════
 * QUÉ LE MANDAMOS A GOOGLE WALLET · funciones puras, sin red ni secretos
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Separadas del adaptador para poder probarlas sin credenciales.
 *
 * · UNA clase por programa (`<issuer>.vf_<programa>`), con la marca del
 *   comercio. La de demo de Vendemia solo la usa quien el admin marque.
 * · UN objeto por miembro (`<issuer>.vf_<id de la emisión>`). El id sale de la
 *   fila de loyalty_wallet_passes, no del miembro: el UUID interno no viaja.
 * · El QR lleva `qr_token`, opaco. El código VDM-… va como texto alternativo.
 * · El saldo va en loyaltyPoints; los premios en secondaryLoyaltyPoints. No se
 *   usa «rewards tier» para fingir saldos: los niveles no existen en el MVP.
 */
import { createHash } from 'crypto';
import { UNIDAD, type TipoRegla } from './formato';

export interface Marca {
  slug: string;
  display_name: string;
  tagline?: string;
  logo_url: string | null;
  bg_color: string;
  support_url: string | null;
}

export interface DatosClase {
  program_id: string;
  program_name: string;
  reward: string | null;
  threshold: number | null;
  rule_type: TipoRegla | null;
  brand: Marca;
  /** Logo del comercio solo si pasó la comprobación de 660×660. */
  logo_valido: boolean;
}

export const idClase = (issuer: string, programId: string) => `${issuer}.vf_${programId.replace(/-/g, '')}`;
export const idObjeto = (issuer: string, passId: string) => `${issuer}.vf_${passId.replace(/-/g, '')}`;

const texto = (valor: string) => ({ defaultValue: { language: 'es-PE', value: valor } });

export function cuerpoClase(
  d: DatosClase,
  opciones: { urlNegocio: string; logoVendemia: string; demo: boolean },
): Record<string, unknown> {
  const demo = opciones.demo;
  const logo = !demo && d.logo_valido && d.brand.logo_url ? d.brand.logo_url : opciones.logoVendemia;
  const nombreEmisor = demo ? 'Vendemia' : d.brand.display_name;
  const programa = demo ? 'Vendemia Fideliza' : d.program_name;
  return {
    issuerName: nombreEmisor.slice(0, 40),
    programName: programa.slice(0, 40),
    programLogo: { sourceUri: { uri: logo }, contentDescription: texto(`Logo de ${nombreEmisor}`) },
    hexBackgroundColor: demo ? '#FF4900' : d.brand.bg_color,
    countryCode: 'PE',
    accountIdLabel: 'Código',
    accountNameLabel: 'Cliente',
    homepageUri: { uri: opciones.urlNegocio, description: nombreEmisor.slice(0, 40) },
    multipleDevicesAndHoldersAllowedStatus: 'ONE_USER_ALL_DEVICES',
  };
}

/** Huella de la configuración enviada: si no cambia, no hace falta volver a mandarla. */
export const huella = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 32);

export interface DatosObjeto {
  member: {
    public_code: string;
    alias: string | null;
    status: 'active' | 'suspended' | 'deleted';
    balance: number;
    rewards_available: number;
    qr_token: string;
  };
  program: { name: string; status: string; rule_type: TipoRegla | null; threshold: number | null; reward: string | null } | null;
  brand: Marca;
}

export function cuerpoObjeto(d: DatosObjeto, classId: string, opciones: { urlNegocio: string }): Record<string, unknown> {
  const activo = d.member.status === 'active';
  const tipo = d.program?.rule_type ?? 'stamps';
  const premios = d.member.rewards_available;
  const frase =
    premios > 0
      ? `Tienes ${premios} premio${premios > 1 ? 's' : ''} para canjear: ${d.program?.reward ?? ''}`
      : d.program?.threshold
        ? `Con ${d.program.threshold} ${UNIDAD[tipo].varias}: ${d.program.reward ?? ''}`
        : '';
  return {
    classId,
    state: activo ? 'ACTIVE' : 'INACTIVE',
    accountId: d.member.public_code,
    accountName: (d.member.status === 'deleted' ? 'Tarjeta dada de baja' : d.member.alias || 'Cliente').slice(0, 40),
    loyaltyPoints: { label: UNIDAD[tipo].corta, balance: { int: d.member.balance } },
    secondaryLoyaltyPoints: { label: 'Premios', balance: { int: premios } },
    barcode: activo
      ? { type: 'QR_CODE', value: d.member.qr_token, alternateText: d.member.public_code }
      : undefined,
    textModulesData: frase ? [{ id: 'premio', header: 'Tu premio', body: frase.slice(0, 200) }] : [],
    linksModuleData: {
      uris: [
        { id: 'negocio', uri: opciones.urlNegocio, description: d.brand.display_name.slice(0, 40) },
        ...(d.brand.support_url ? [{ id: 'soporte', uri: d.brand.support_url, description: 'Ayuda' }] : []),
      ],
    },
  };
}
