import 'server-only';

/**
 * Las variables de servidor de Fideliza, leídas en UN sitio.
 *
 * ⚠️ Ninguna lleva NEXT_PUBLIC_. Si alguien se la pone «para que funcione», la
 * clave acaba en el bundle del navegador. `server-only` hace que importar este
 * fichero desde un componente de cliente rompa el build: es la barrera.
 */
export class FaltaConfiguracion extends Error {
  constructor(public variable: string) {
    super(`Falta la variable de servidor ${variable}`);
  }
}

const leer = (n: string) => (process.env[n] ?? '').trim();

export const entorno = {
  supabaseUrl: () => leer('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnon: () => leer('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  /** Abre las RPC loyalty_srv_*. En la base solo está su SHA-256. */
  claveServidor: () => leer('FIDELIZA_SERVER_KEY'),
  cronSecret: () => leer('CRON_SECRET'),
  walletIssuer: () => leer('GOOGLE_WALLET_ISSUER_ID'),
  walletDemoClass: () => leer('GOOGLE_WALLET_DEMO_CLASS_ID'),
  walletCredencialesB64: () => leer('GOOGLE_WALLET_CREDENTIALS_JSON_BASE64'),
  walletCuentaEsperada: () =>
    leer('GOOGLE_WALLET_SERVICE_ACCOUNT') || 'vendemia-wallet@vendemia-505020.iam.gserviceaccount.com',
  walletLogoVendemia: () => leer('GOOGLE_WALLET_PROGRAM_LOGO_URL'),
  vapidPublica: () => leer('WEB_PUSH_VAPID_PUBLIC_KEY'),
  vapidPrivada: () => leer('WEB_PUSH_VAPID_PRIVATE_KEY'),
  vapidSujeto: () => leer('WEB_PUSH_SUBJECT') || 'mailto:contacto@vendemias.com',
  /** Sal para el hash de IP de los límites. Si falta, se usa la clave del servidor. */
  salIp: () => leer('FIDELIZA_IP_SALT') || leer('FIDELIZA_SERVER_KEY'),
};

/** Qué está configurado, sin enseñar ningún valor. Lo pinta el panel. */
export function estadoConfiguracion() {
  return {
    servidor: entorno.claveServidor().length >= 32,
    wallet: Boolean(entorno.walletIssuer() && entorno.walletCredencialesB64()),
    push: Boolean(entorno.vapidPublica() && entorno.vapidPrivada()),
    cron: Boolean(entorno.cronSecret()),
  };
}
