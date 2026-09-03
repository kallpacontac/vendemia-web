/**
 * ══════════════════════════════════════════════════════════════════════════
 * FIRMAR UNA SUBIDA A CLOUDINARY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta es la ÚNICA pieza de servidor del proyecto entero. Todo lo demás del
 * panel habla directamente con Supabase desde el navegador. Existe porque
 * firmar necesita el `api_secret` de Cloudinary, y ese secreto no puede estar
 * en el bundle.
 *
 * ── Por qué el fichero NO pasa por aquí ───────────────────────────────────
 * El límite de cuerpo de petición de una función de Vercel son 4,5 MB, menos
 * que muchas fotos de móvil. Fallaría SOLO con las grandes: el peor modo de
 * fallo posible, porque parece que funciona hasta que un día no. Así que lo que
 * viaja por aquí es una firma de 40 caracteres, y el fichero va del navegador a
 * Cloudinary directamente.
 *
 * ── Por qué no un upload preset sin firmar ────────────────────────────────
 * Porque no necesitaría este endpoint, pero dejaría una credencial de subida
 * PÚBLICA en el JavaScript: cualquiera que lea el bundle escribe en la cuenta
 * de Cloudinary. Un preset sin firmar es cómodo exactamente igual para el dueño
 * de la tienda que para quien quiera llenarle la cuenta de basura.
 *
 * ── Qué se comprueba, y por qué las dos cosas ─────────────────────────────
 * 1 · Que haya sesión.  2 · Que esa sesión pertenezca a la compañía.
 * Sin lo segundo, cualquiera con una cuenta —y crearse una es gratis desde
 * /login— pediría firmas para la carpeta de otro negocio.
 */
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

/** `crypto` necesita Node, no el runtime Edge. Y esto nunca es estático. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const KEY = process.env.CLOUDINARY_API_KEY;
const SECRET = process.env.CLOUDINARY_API_SECRET;

/**
 * El id de compañía acaba dentro de la ruta de una carpeta. Se valida la forma
 * antes de concatenar: un id con `../` o con espacios escribiría fuera de
 * `catalog/`. Es barato y cierra la puerta entera.
 */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request) {
  /**
   * ⚠️ SIN `NEXT_PUBLIC_`. Si alguien las renombra con ese prefijo para "que
   * funcionen", el secreto acaba en el bundle y la cuenta de Cloudinary queda
   * abierta. Se comprueba aquí para que el fallo sea un mensaje claro y no un
   * `undefined` convertido en una firma que Cloudinary rechaza sin explicar.
   */
  if (!CLOUD || !KEY || !SECRET) {
    return Response.json(
      { error: 'Faltan CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET en el servidor.' },
      { status: 500 },
    );
  }

  let companyId: unknown;
  try {
    ({ companyId } = await req.json());
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!jwt || typeof companyId !== 'string' || !ID_VALIDO.test(companyId)) {
    return Response.json({ error: 'Faltan datos' }, { status: 400 });
  }

  /**
   * El cliente se crea CON el token del usuario y sin persistir sesión: así
   * cada petición se evalúa con sus permisos y nunca con los de otra. La clave
   * es la `anon`, o sea que el RLS sigue mandando — aquí no hay `service_role`
   * ni la puede haber.
   */
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
  );

  /**
   * `getUser()` va al servidor de auth y valida la sesión CONTRA LA BASE, no
   * solo la firma del token. Es la diferencia que importa: un token de una
   * sesión revocada tiene la firma perfecta y sigue pasando la verificación
   * local (ver SEGURIDAD.md § 3). Aquí no pasa.
   */
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'Sin sesión' }, { status: 401 });

  // El RLS filtra `memberships` por is_member: si no pertenece, vuelve vacío.
  const { data: miembro } = await sb
    .from('memberships')
    .select('company_id')
    .eq('company_id', companyId)
    .maybeSingle();
  if (!miembro) return Response.json({ error: 'No perteneces a esta compañía' }, { status: 403 });

  /**
   * Cloudinary firma los parámetros que se le mandan, ordenados
   * alfabéticamente, concatenados como query string y con el `api_secret`
   * pegado al final. Se firman TODOS los del POST menos el fichero, el
   * `api_key` y la propia firma.
   *
   * ⚠️ Si añades un parámetro a la subida (por ejemplo `public_id`), TIENES que
   * añadirlo aquí y en orden alfabético, o Cloudinary devuelve 401 con un
   * mensaje que no dice cuál falta.
   */
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `catalog/${companyId}`;
  const signature = createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${SECRET}`)
    .digest('hex');

  return Response.json({ timestamp, signature, folder, apiKey: KEY, cloudName: CLOUD });
}
