/**
 * ══════════════════════════════════════════════════════════════════════════
 * EL ÚNICO CLIENTE DE SUPABASE DEL PANEL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todo el panel habla SOLO con Supabase. Nunca con el bot: vive en una máquina
 * doméstica detrás de un router, sin IP fija ni puertos abiertos, y no es
 * alcanzable desde internet. Ver docs/contrato-backend.md.
 *
 * ── Qué clave va aquí ────────────────────────────────────────────────────
 * La `anon` (sb_publishable_…). Viaja al navegador a propósito: respeta RLS,
 * y sin sesión no devuelve ni una fila de negocio.
 *
 * ⚠️ NUNCA la `service_role` (sb_secret_…). Se salta el RLS entero: con esa
 * clave en el bundle cualquiera lee y escribe TODAS las compañías. No va en el
 * navegador, ni en Vercel, ni en el repo. Solo el bot la usa.
 *
 * ── Por qué es una función y no una constante exportada ──────────────────
 * Porque `createClient` con una URL vacía revienta en el import, y ese error
 * ocurre al construir la página entera: pantalla en blanco sin pista de qué
 * falta. Así el fallo llega donde se puede explicar — ver FALTAN_CLAVES, que
 * el login usa para enseñar el aviso en vez de romperse.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** true si el despliegue no tiene configuradas las variables de entorno. */
export const FALTAN_CLAVES = !URL_SUPABASE || !CLAVE_ANON;

let cliente: SupabaseClient | null = null;

/**
 * ¿Está activado el acceso con Google en este proyecto de Supabase?
 *
 * `/auth/v1/settings` es público —no necesita sesión— y dice qué proveedores
 * hay encendidos. Sirve para no enseñar un botón que no lleva a ninguna parte:
 * con el proveedor apagado, `/auth/v1/authorize` NO redirige, devuelve un JSON
 * 400 crudo, y el usuario se queda mirando `{"code":400,…}` en la barra de
 * direcciones. Comprobado.
 *
 * Así el botón aparece solo cuando de verdad funciona, y aparece SIN volver a
 * desplegar: en cuanto se active en el panel de Supabase.
 *
 * Ante la duda devuelve `false`: es mejor no ofrecer algo que ofrecerlo roto.
 */
export async function googleActivado(): Promise<boolean> {
  if (!URL_SUPABASE || !CLAVE_ANON) return false;
  try {
    const r = await fetch(`${URL_SUPABASE}/auth/v1/settings`, {
      headers: { apikey: CLAVE_ANON },
    });
    if (!r.ok) return false;
    const ajustes = (await r.json()) as { external?: Record<string, boolean> };
    return ajustes.external?.google === true;
  } catch {
    return false;
  }
}

export function supabase(): SupabaseClient {
  if (!URL_SUPABASE || !CLAVE_ANON) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'En local van en .env.local (copia .env.example); en Vercel, en Settings › Environment Variables.',
    );
  }
  if (!cliente) {
    cliente = createClient(URL_SUPABASE, CLAVE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /**
         * ⚠️ TIENE QUE ESTAR EN true, o «olvidé mi contraseña» no funciona.
         *
         * El enlace del correo de recuperación vuelve al sitio con la sesión
         * temporal en la URL —en el fragmento (`#access_token=…`) o como
         * `?code=` según el flujo—. Esto es lo que hace que supabase-js la lea,
         * la canjee y dispare el evento PASSWORD_RECOVERY. En false, el enlace
         * abre /nueva-clave sin sesión y no hay forma de cambiar la contraseña.
         *
         * Efecto secundario asumido: en cada carga de página la librería mira
         * la URL por si trae credenciales. Es barato y no toca nada más.
         */
        detectSessionInUrl: true,
        // Nombre propio para no chocar con otro proyecto de Supabase abierto
        // en el mismo navegador durante el desarrollo.
        storageKey: 'vendemia-auth',
      },
    });
  }
  return cliente;
}
