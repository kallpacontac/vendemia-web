import 'server-only';
import { createPrivateKey, type KeyObject } from 'crypto';
import { entorno, FaltaConfiguracion } from '../entorno';

/**
 * La cuenta de servicio de Google Wallet.
 *
 * ⚠️ La clave privada NO se imprime, no se registra y no sale de este módulo
 * salvo como KeyObject para firmar. Los errores dicen QUÉ falta, nunca el valor.
 */
export interface Credenciales {
  clientEmail: string;
  keyId: string | undefined;
  clave: KeyObject;
}

let cache: Credenciales | null = null;

export class CredencialesInvalidas extends Error {}

export function credenciales(): Credenciales {
  if (cache) return cache;
  const b64 = entorno.walletCredencialesB64();
  if (!b64) throw new FaltaConfiguracion('GOOGLE_WALLET_CREDENTIALS_JSON_BASE64');
  if (!entorno.walletIssuer()) throw new FaltaConfiguracion('GOOGLE_WALLET_ISSUER_ID');

  let json: { client_email?: string; private_key?: string; private_key_id?: string; type?: string };
  try {
    json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new CredencialesInvalidas('GOOGLE_WALLET_CREDENTIALS_JSON_BASE64 no es un JSON en base64 válido');
  }
  if (json.type && json.type !== 'service_account') throw new CredencialesInvalidas('El JSON no es de una service account');
  if (!json.client_email || !json.private_key) {
    throw new CredencialesInvalidas('El JSON de la service account no trae client_email o private_key');
  }
  if (json.client_email !== entorno.walletCuentaEsperada()) {
    // Se dice cuál se esperaba (no es secreto), no cuál vino.
    throw new CredencialesInvalidas(`La service account no es la autorizada (${entorno.walletCuentaEsperada()})`);
  }
  // Las claves pegadas en paneles de variables suelen llegar con "\n" literales.
  const pem = json.private_key.includes('\\n') ? json.private_key.replace(/\\n/g, '\n') : json.private_key;
  let clave: KeyObject;
  try {
    clave = createPrivateKey({ key: pem, format: 'pem' });
  } catch {
    throw new CredencialesInvalidas('La private_key de la service account no se puede leer');
  }
  cache = { clientEmail: json.client_email, keyId: json.private_key_id, clave };
  return cache;
}
