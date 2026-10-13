'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ACCESO DEL EQUIPO · quién entra al panel de un negocio, y como qué
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Las reglas (Alvaro, 13-oct-2026). Las APLICA el bot; aquí solo se reflejan:
 *
 *   1. Un negocio tiene UN dueño. Ni cero, ni dos.
 *   2. Al dueño no se le da de baja ni se le cambia el rol. A los demás, sí.
 *   3. Al dar acceso hay que elegir el rol. No hay rol por defecto.
 *   4. Desde aquí no se crea un dueño.
 *
 * Todo lo hace SOLO el dueño. Por eso el dueño sale el primero y sin botones,
 * y por eso «Dueño» no está en ningún selector.
 *
 * ── Tres operaciones, tres formas de enterarse del resultado ─────────────
 *
 *   · Dar acceso   → la membresía nueva sube por el espejo: tarda unos
 *                    segundos. Se relee con la ráfaga de `recargar()`.
 *   · Cambiar rol  → se pinta lo que DEVUELVE el comando y NO se relee: una
 *                    relectura inmediata puede traer el rol viejo, y la
 *                    pantalla diría que no cambió.
 *   · Quitar acceso→ el bot borra primero en Postgres y contesta después: al
 *                    llegar el `done` ya no está. Se relee una vez, sin ráfaga.
 *
 * ⚠️ Ocultar los botones a quien no es dueño es comodidad. El error puede
 * llegar igual —el bot revalida cada comando— y se enseña tal cual.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus } from 'lucide-react';
import Confirmar from './Confirmar';
import { useSesion } from './Sesion';
import { useComando } from './Avisos';
import { useCargar } from './useCargar';
import { nombreDeRol } from '@/lib/panel/roles';
import { getEquipo, type Miembro } from '@/lib/supabase/queries';
import type { ResultadoAddMember, ResultadoBaja, ResultadoCambioDeRol } from '@/lib/supabase/commands';

/** Los dos roles que se pueden dar desde el panel. `member` es el empleado. */
type RolDeAlta = 'member' | 'admin';

/** `agent` es un empleado antiguo: en el selector es «Empleado», como `member`. */
const enSelector = (rol: string): RolDeAlta => (rol === 'admin' ? 'admin' : 'member');

export default function Equipo({ sinLista }: { sinLista: number }) {
  const { companyId, compania, esDueno } = useSesion();
  const comando = useComando();

  const { datos: equipo, recargar, releer } = useCargar(
    async () => (companyId ? getEquipo(companyId) : null),
    [companyId],
  );

  /** El rol que devolvió `cambiar_rol_miembro`, por persona. Manda sobre la lista. */
  const [cambiados, setCambiados] = useState<Record<string, RolDeAlta>>({});
  /** La fila con un comando en vuelo: sus controles se apagan hasta que resuelva. */
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [porQuitar, setPorQuitar] = useState<Miembro | null>(null);

  async function cambiarRol(m: Miembro, role: RolDeAlta) {
    setEnVuelo(m.auth_user_id);
    const r = await comando<ResultadoCambioDeRol>(
      'cambiar_rol_miembro',
      { user_id: m.auth_user_id, role },
      `${m.email ?? 'Esa persona'} ahora entra como ${nombreDeRol(role).toLowerCase()}.`,
    );
    if (r) setCambiados((c) => ({ ...c, [m.auth_user_id]: r.ahora }));
    setEnVuelo(null);
  }

  async function quitar(m: Miembro) {
    setEnVuelo(m.auth_user_id);
    // `quitado: false` —ya no estaba: un doble clic— no es un error, y el
    // resultado en pantalla es el mismo: ya no tiene acceso.
    await comando<ResultadoBaja>(
      'quitar_miembro',
      { user_id: m.auth_user_id },
      `${m.email ?? 'Esa persona'} ya no tiene acceso a este negocio.`,
      releer,
    );
    setEnVuelo(null);
    setPorQuitar(null);
  }

  const lista = equipo ?? [];
  const cuantos = lista.length || sinLista;

  return (
    <div className="sec">
      <h4>
        <UserPlus /> Quién puede entrar
      </h4>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {cuantos} {cuantos === 1 ? 'persona tiene' : 'personas tienen'} acceso a este negocio.
      </p>

      {lista.length > 0 && (
        <ul className="equipo">
          {lista.map((m) => {
            const rol = cambiados[m.auth_user_id] ?? m.role;
            const ocupado = enVuelo === m.auth_user_id;
            // El dueño, sin botones: ni se le cambia el rol ni se le da de baja.
            const gestionable = esDueno && m.role !== 'owner';
            return (
              <li key={m.auth_user_id} className="equipo__fila">
                <span className="equipo__quien">
                  <b>{m.email ?? 'Cuenta eliminada'}</b>
                  {m.eres_tu && <small> · tú</small>}
                </span>
                {gestionable ? (
                  <>
                    <select
                      value={enSelector(rol)}
                      disabled={ocupado}
                      aria-label={`Rol de ${m.email ?? 'esta persona'}`}
                      onChange={(e) => void cambiarRol(m, enSelector(e.target.value))}
                    >
                      <option value="member">Empleado</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={ocupado}
                      onClick={() => setPorQuitar(m)}
                    >
                      {ocupado ? 'Aplicando…' : 'Quitar acceso'}
                    </button>
                  </>
                ) : (
                  <span className="equipo__rol">{nombreDeRol(rol)}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {esDueno && <DarAcceso alDarlo={recargar} />}

      {/* En el <body>: un `position:fixed` dentro de la tarjeta de Ajustes se
          quedaría encajado en ella en vez de tapar la pantalla. */}
      {porQuitar &&
        createPortal(
          <Confirmar
            titulo="¿Quitarle el acceso?"
            detalle={
              <>
                <p>
                  ¿Quitarle el acceso a <b>{porQuitar.email ?? 'esta persona'}</b>? Dejará de ver el panel de{' '}
                  {compania?.nombre ?? 'este negocio'} en el acto.
                </p>
                <p className="muted">Su cuenta no se borra. Si hace falta, puedes volver a darle acceso.</p>
              </>
            }
            textoConfirmar="Quitar acceso"
            peligro
            ocupado={enVuelo === porQuitar.auth_user_id}
            alConfirmar={() => void quitar(porQuitar)}
            alCerrar={() => {
              if (enVuelo !== porQuitar.auth_user_id) setPorQuitar(null);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/**
 * Dar acceso a otra persona.
 *
 * La contraseña temporal se ENSEÑA EN PANTALLA, no se manda por correo: el SMTP
 * por defecto de Supabase va limitadísimo y cae en spam, y un alta que depende
 * de un email falla justo cuando hay alguien delante esperando. El dueño la lee
 * y se la dicta. Esa fila del comando es reservada y la contraseña se borra de
 * ella a los 15 minutos: se enseña al recibirla y no se relee.
 */
function DarAcceso({ alDarlo }: { alDarlo: () => void }) {
  const comando = useComando();
  const [email, setEmail] = useState('');
  /**
   * Nace SIN elegir, a propósito: con un rol puesto por defecto, el dueño le
   * daría a «Dar acceso» sin mirarlo y nadie habría decidido nada. El bot,
   * además, rechaza el alta sin rol.
   */
  const [rol, setRol] = useState<'' | RolDeAlta>('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<ResultadoAddMember | null>(null);

  async function invitar() {
    if (!email.trim() || !rol) return;
    setEnviando(true);
    const r = await comando<ResultadoAddMember>('add_member', { email: email.trim(), role: rol });
    setEnviando(false);
    /**
     * Sin respuesta del bot no hay contraseña que enseñar. Consecuencia
     * conocida: si el bot tarda más de la cuenta, la persona se crea igual —el
     * comando está encolado— pero su contraseña temporal se pierde.
     */
    if (!r) return;
    setHecho(r);
    setEmail('');
    setRol('');
    if (!r.ya_era_miembro) alDarlo();
  }

  return (
    <>
      <div className="pay-item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}>
        <input
          placeholder="correo@dequien-va-a-entrar.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value === 'admin' ? 'admin' : e.target.value === 'member' ? 'member' : '')}
          aria-label="Con qué rol entra"
        >
          <option value="" disabled>
            Elige su rol…
          </option>
          <option value="member">Empleado</option>
          <option value="admin">Administrador</option>
        </select>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void invitar()}
          disabled={enviando || !email.trim() || !rol}
        >
          <UserPlus size={15} /> {enviando ? 'Creando…' : 'Dar acceso'}
        </button>
      </div>

      {/* Lo que cambia HOY entre uno y otro, y nada más: prometer que el empleado
          «no ve la caja» sería mentira mientras el panel se la siga enseñando. */}
      <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        El administrador puede, además, preguntarle a Mia en el Asistente (sin ver importes). Por ahora,
        el resto del panel lo ven los dos.
      </p>

      {hecho &&
        (hecho.ya_era_miembro ? (
          // El bot no le cambia el rol a quien ya era del negocio: se dice el que TIENE.
          <div className="clave-temporal">
            <b>{hecho.email}</b> ya tenía acceso a este negocio, como {nombreDeRol(hecho.role).toLowerCase()}. No
            se ha cambiado nada: su rol se cambia en la lista de arriba.
          </div>
        ) : hecho.password_temporal ? (
          <div className="clave-temporal">
            Cuenta creada para <b>{hecho.email}</b>, como {nombreDeRol(hecho.role).toLowerCase()}. Dile esta
            contraseña de viva voz —no se envía por correo y no vuelve a aparecer:
            <br />
            <code>{hecho.password_temporal}</code>
          </div>
        ) : (
          <div className="clave-temporal">
            <b>{hecho.email}</b> ya tenía cuenta: ahora también entra a este negocio, como{' '}
            {nombreDeRol(hecho.role).toLowerCase()}. Su contraseña no ha cambiado.
          </div>
        ))}
    </>
  );
}
