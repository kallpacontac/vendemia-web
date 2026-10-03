/**
 * Las acciones del panel de Fideliza. Ver modules/fideliza/servidor/acciones.ts.
 *
 * Exige el JWT del usuario en Authorization. El permiso lo decide Postgres con
 * ese mismo JWT; esta ruta no tiene ni la service_role ni otra forma de saltarlo.
 */
import { ACCIONES, type NombreAccion } from '@/modules/fideliza/servidor/acciones';
import { cuerpo, desdeError, fallo, jwtDe, limitar, ok, subDe } from '@/modules/fideliza/servidor/http';
import { deUsuario } from '@/modules/fideliza/servidor/supabase';


export async function POST(req: Request, { params }: { params: { accion: string } }) {
  const nombre = params.accion as NombreAccion;
  const def = ACCIONES[nombre];
  if (!def) return fallo('invalid_action', 404);

  const jwt = jwtDe(req);
  if (!jwt) return fallo('unauthenticated', 401);

  try {
    const entrada = def.esquema.safeParse(await cuerpo(req));
    if (!entrada.success) {
      return fallo('invalid_input', 400, { campos: entrada.error.issues.map((i) => i.path.join('.')).slice(0, 5) });
    }
    const lim = 'limite' in def ? def.limite : undefined;
    const [cubo, maximo] = lim ?? ['panel', 240];
    if (!(await limitar(`u:${subDe(jwt)}:${cubo}`, maximo, 60))) return fallo('rate_limited', 429);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datos = await (def.ejecutar as (d: any, c: any) => Promise<unknown>)(entrada.data, { sb: deUsuario(jwt) });
    return ok({ datos: datos ?? null });
  } catch (e) {
    return desdeError(e, `panel/${nombre}`);
  }
}
