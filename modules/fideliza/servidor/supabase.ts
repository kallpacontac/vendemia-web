import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { entorno, FaltaConfiguracion } from './entorno';

/**
 * Dos clientes, y ninguno es la service_role.
 *
 * · deUsuario(jwt): la clave anon + el token del usuario. Postgres ve
 *   `authenticated` con su auth.uid(), y las RPC comprueban su permiso. Es el
 *   mismo poder que tiene desde el navegador: el servidor solo añade validación
 *   y límites, nunca privilegios.
 *
 * · servidor(): la clave anon + la cabecera x-fideliza-key. Solo abre las
 *   loyalty_srv_*, que validan cada argumento. Para lo público y el worker.
 */
const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function base() {
  const url = entorno.supabaseUrl();
  const anon = entorno.supabaseAnon();
  if (!url || !anon) throw new FaltaConfiguracion('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return { url, anon };
}

export function deUsuario(jwt: string): SupabaseClient {
  const { url, anon } = base();
  return createClient(url, anon, { ...opciones, global: { headers: { Authorization: `Bearer ${jwt}` } } });
}

let cache: SupabaseClient | null = null;

export function servidor(): SupabaseClient {
  const clave = entorno.claveServidor();
  if (clave.length < 32) throw new FaltaConfiguracion('FIDELIZA_SERVER_KEY');
  if (!cache) {
    const { url, anon } = base();
    cache = createClient(url, anon, { ...opciones, global: { headers: { 'x-fideliza-key': clave } } });
  }
  return cache;
}

/** Llama a una RPC y devuelve su `data`, o lanza un Error con el mensaje de Postgres. */
export async function rpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new ErrorRpc(error.message, error.code);
  return data as T;
}

export class ErrorRpc extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
