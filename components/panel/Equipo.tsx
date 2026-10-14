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
 * ── Quién puede qué ──────────────────────────────────────────────────────
 *
 *                        Dueño                  Administrador      Empleado
 *   Ver el equipo        sí                     sí                 no
 *   Dar acceso           empleado o admin       solo empleado      no
 *   Quitar el acceso     a todos menos a él     solo a empleados   no
 *   Enlazar una ficha    a cualquiera           solo a empleados   no
 *   Cambiar el rol       sí                     no                 no
 *
 * Por eso los botones de una fila dependen de DOS cosas: quién mira y de quién
 * es la fila. Que la lista llegue no basta para saber qué pintar: al
 * administrador le llega entera, con el dueño y los demás administradores.
 *
 * ── La ficha ─────────────────────────────────────────────────────────────
 *
 * Es lo que une a una persona con sesión con su fila de `employees`, y lo que
 * hará que una cita sea «suya». Una ficha, una persona: las que ya tienen a
 * alguien no se ofrecen. Un empleado sin ficha solo verá las citas sin asignar.
 *
 * ── Cuatro operaciones, y cómo se entera la pantalla ─────────────────────
 *
 *   · Dar acceso    → la membresía sube por el espejo: tarda unos segundos. Se
 *                     relee con la ráfaga de `recargar()`.
 *   · Cambiar rol   ┐ se pinta lo que DEVUELVE el comando y NO se relee: una
 *   · Enlazar ficha ┘ relectura inmediata puede traer lo viejo.
 *   · Quitar acceso → el bot borra primero en Postgres y contesta después: al
 *                     llegar el `done` ya no está. Se relee una vez.
 *
 * ⚠️ Ocultar los botones es comodidad. El error puede llegar igual —el bot
 * revalida cada comando— y se enseña tal cual.
 */
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus } from 'lucide-react';
import Confirmar from './Confirmar';
import { useSesion } from './Sesion';
import { useComando } from './Avisos';
import { useCargar } from './useCargar';
import { corteDeRoles, nombreDeRol, rolDeNegocio } from '@/lib/panel/roles';
import { getEquipo, getTrabajadores, type Miembro } from '@/lib/supabase/queries';
import type {
  ResultadoAddMember,
  ResultadoBaja,
  ResultadoCambioDeRol,
  ResultadoEnlace,
} from '@/lib/supabase/commands';

/** Los dos roles que se pueden dar desde el panel. `member` es el empleado. */
type RolDeAlta = 'member' | 'admin';

/** `agent` es un empleado antiguo: en el selector es «Empleado», como `member`. */
const enSelector = (rol: string): RolDeAlta => (rol === 'admin' ? 'admin' : 'member');

interface Ficha {
  id: string;
  nombre: string;
}

export default function Equipo({ sinLista }: { sinLista: number }) {
  const { companyId, compania, rol: miRol } = useSesion();
  const comando = useComando();
  const soyDueno = miRol === 'dueno';
  /** Dueño o administrador: los únicos que gestionan a alguien. */
  const gestiono = soyDueno || miRol === 'admin';

  const { datos, recargar, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [equipo, trabajadores] = await Promise.all([
      getEquipo(companyId),
      // Las fichas son un extra: si fallan, la lista del equipo se ve igual.
      getTrabajadores(companyId).catch(() => []),
    ]);
    return { equipo, fichas: trabajadores.filter((t) => t.activo).map((t) => ({ id: t.id, nombre: t.name })) };
  }, [companyId]);

  /** Lo que devolvieron los comandos, por persona. Manda sobre la lista. */
  const [roles, setRoles] = useState<Record<string, RolDeAlta>>({});
  const [enlaces, setEnlaces] = useState<Record<string, string | null>>({});
  /** La fila con un comando en vuelo: sus controles se apagan hasta que resuelva. */
  const [enVuelo, setEnVuelo] = useState<string | null>(null);
  const [porQuitar, setPorQuitar] = useState<Miembro | null>(null);

  const lista = useMemo(() => datos?.equipo ?? [], [datos]);
  const fichas: Ficha[] = datos?.fichas ?? [];
  const cuantos = lista.length || sinLista;

  const rolDe = (m: Miembro) => roles[m.auth_user_id] ?? m.role;
  const fichaDe = (m: Miembro) =>
    m.auth_user_id in enlaces ? enlaces[m.auth_user_id] : (m.employee_id ?? null);

  /** Las fichas que ya tienen a alguien: una ficha, una persona. */
  const ocupadas = new Set(lista.map(fichaDe).filter((f): f is string => Boolean(f)));
  const libres = fichas.filter((f) => !ocupadas.has(f.id));

  async function cambiarRol(m: Miembro, role: RolDeAlta) {
    setEnVuelo(m.auth_user_id);
    const r = await comando<ResultadoCambioDeRol>(
      'cambiar_rol_miembro',
      { user_id: m.auth_user_id, role },
      `${m.email ?? 'Esa persona'} ahora entra como ${nombreDeRol(role).toLowerCase()}.`,
    );
    if (r) setRoles((c) => ({ ...c, [m.auth_user_id]: r.ahora }));
    setEnVuelo(null);
  }

  async function enlazar(m: Miembro, employee_id: string | null) {
    setEnVuelo(m.auth_user_id);
    const r = await comando<ResultadoEnlace>(
      'enlazar_ficha',
      { user_id: m.auth_user_id, employee_id },
      employee_id ? 'Ficha enlazada.' : 'Ficha quitada.',
    );
    if (r) setEnlaces((c) => ({ ...c, [m.auth_user_id]: r.employee_id }));
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

  return (
    <div className="sec">
      <h4>
        <UserPlus /> Quién puede entrar
      </h4>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
        {cuantos} {cuantos === 1 ? 'persona tiene' : 'personas tienen'} acceso a este negocio.
        {fichas.length > 0 && lista.length > 0 && ' La ficha dice quién es cada uno en el equipo: es lo que hace que una cita sea suya.'}
      </p>

      {gestiono && lista.length > 1 && (
        <AvisoDelCorte
          soyDueno={soyDueno}
          hayFichas={fichas.length > 0}
          empleados={lista.filter((m) => rolDeNegocio(rolDe(m)) === 'empleado').length}
          sinFicha={lista.filter((m) => rolDeNegocio(rolDe(m)) === 'empleado' && !fichaDe(m)).length}
        />
      )}

      {lista.length > 0 && (
        <ul className="equipo">
          {lista.map((m) => {
            const suRol = rolDeNegocio(rolDe(m));
            const ficha = fichaDe(m);
            const ocupado = enVuelo === m.auth_user_id;
            // Al dueño no se le toca. Al administrador, solo el dueño. Al
            // empleado, el dueño y el administrador.
            const loGestiono = suRol === 'empleado' ? gestiono : suRol === 'admin' ? soyDueno : false;
            const cambioSuRol = loGestiono && soyDueno;
            return (
              <li key={m.auth_user_id} className="equipo__fila">
                <span className="equipo__quien">
                  <b>{m.email ?? 'Cuenta eliminada'}</b>
                  {m.eres_tu && <small> · tú</small>}
                  {/* Lo que queda por clasificar antes del corte. */}
                  {suRol === 'empleado' && !ficha && fichas.length > 0 && corteDeRoles() && (
                    <small className="equipo__pendiente"> · sin ficha: solo verá las citas sin asignar</small>
                  )}
                </span>

                {cambioSuRol ? (
                  <select
                    value={enSelector(rolDe(m))}
                    disabled={ocupado}
                    aria-label={`Rol de ${m.email ?? 'esta persona'}`}
                    onChange={(e) => void cambiarRol(m, enSelector(e.target.value))}
                  >
                    <option value="member">Empleado</option>
                    <option value="admin">Administrador</option>
                  </select>
                ) : (
                  <span className="equipo__rol">{nombreDeRol(rolDe(m))}</span>
                )}

                {fichas.length > 0 &&
                  (loGestiono ? (
                    <select
                      value={ficha ?? ''}
                      disabled={ocupado}
                      aria-label={`Ficha de ${m.email ?? 'esta persona'}`}
                      onChange={(e) => void enlazar(m, e.target.value || null)}
                    >
                      <option value="">Sin ficha</option>
                      {fichas
                        .filter((f) => f.id === ficha || !ocupadas.has(f.id))
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.nombre}
                          </option>
                        ))}
                    </select>
                  ) : (
                    suRol !== 'dueno' && (
                      <span className="equipo__rol">{fichas.find((f) => f.id === ficha)?.nombre ?? 'Sin ficha'}</span>
                    )
                  ))}

                {loGestiono && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={ocupado}
                    onClick={() => setPorQuitar(m)}
                  >
                    {ocupado ? 'Aplicando…' : 'Quitar acceso'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {gestiono && <DarAcceso soyDueno={soyDueno} fichasLibres={libres} alDarlo={recargar} />}

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
 * ══════════════════════════════════════════════════════════════════════════
 * EL AVISO DEL CORTE · la fase 3 del plan de roles
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hoy todo el que entra ve lo mismo que el dueño. El día del corte deja de ser
 * así, y quien no esté bien clasificado se queda sin poder trabajar: un
 * administrador marcado como empleado pierde la caja; un barbero sin ficha no
 * ve ninguna de sus citas.
 *
 * Por eso el aviso no explica el sistema de roles: dice QUÉ deja de ver cada
 * uno, CUÁNDO, y las dos cosas que hay que hacer antes, que son justo los dos
 * controles de la lista de debajo (el rol y la ficha).
 *
 * Al administrador se le dice solo lo de las fichas: el rol no lo cambia él.
 *
 * Solo sale si hay a quién clasificar —un negocio donde entra el dueño y nadie
 * más no tiene nada que hacer— y mientras haya corte anunciado
 * (`CORTE_DE_ROLES` en lib/panel/roles.ts).
 */
function AvisoDelCorte({
  soyDueno,
  hayFichas,
  empleados,
  sinFicha,
}: {
  soyDueno: boolean;
  hayFichas: boolean;
  empleados: number;
  sinFicha: number;
}) {
  const corte = corteDeRoles();
  if (!corte) return null;
  const cuando = corte.pasado ? 'Muy pronto' : `A partir del ${corte.dia}`;

  return (
    <div className="equipo-aviso" role="note">
      <b>{cuando}, cada persona verá solo lo que le toca.</b>
      <p>Hoy todos los que entran ven lo mismo que {soyDueno ? 'tú' : 'el dueño'}. Desde ese día:</p>
      <ul>
        <li>
          <b>El empleado</b> verá sus citas y las que no tienen a nadie asignado, con el nombre y las notas
          del cliente (sin su teléfono), y su comisión. Deja de ver la caja, los mensajes, las métricas y los
          ajustes.
        </li>
        <li>
          <b>El administrador</b> lleva el día a día: agenda, clientes, mensajes, caja y catálogo, y ve las
          comisiones sin poder cambiarlas. No ve las métricas ni cambia los métodos de pago.
        </li>
      </ul>
      <p>
        <b>Antes de ese día, revisa la lista de abajo:</b>{' '}
        {soyDueno && 'pasa a Administrador a quien lleve el negocio contigo. '}
        {hayFichas
          ? `${soyDueno ? 'Y a' : 'A'} cada empleado ponle su ficha: quien se quede sin ella solo verá las citas sin asignar.`
          : soyDueno
            ? 'Los demás quedan como empleados.'
            : 'Los empleados verán todas las clases, sin importes.'}
      </p>
      {empleados > 0 && (
        <p className="equipo-aviso__cuenta">
          Ahora mismo: {empleados} {empleados === 1 ? 'empleado' : 'empleados'}
          {hayFichas && `, ${sinFicha === 0 ? 'todos con su ficha' : `${sinFicha} sin ficha`}`}.
        </p>
      )}
    </div>
  );
}

/**
 * Dar acceso a otra persona.
 *
 * El dueño elige el rol a mano. El administrador no elige nada: solo puede dar
 * acceso a un empleado, así que no se le pinta un selector de una sola opción.
 *
 * La contraseña temporal se ENSEÑA EN PANTALLA, no se manda por correo: el SMTP
 * por defecto de Supabase va limitadísimo y cae en spam, y un alta que depende
 * de un email falla justo cuando hay alguien delante esperando. Esa fila del
 * comando es reservada y la contraseña se borra de ella a los 15 minutos: se
 * enseña al recibirla y no se relee.
 */
function DarAcceso({
  soyDueno,
  fichasLibres,
  alDarlo,
}: {
  soyDueno: boolean;
  fichasLibres: Ficha[];
  alDarlo: () => void;
}) {
  const comando = useComando();
  const [email, setEmail] = useState('');
  /**
   * Nace SIN elegir, a propósito: con un rol puesto por defecto, el dueño le
   * daría a «Dar acceso» sin mirarlo y nadie habría decidido nada. El bot,
   * además, rechaza el alta sin rol.
   */
  const [elegido, setElegido] = useState<'' | RolDeAlta>('');
  const [ficha, setFicha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<ResultadoAddMember | null>(null);

  const rol: '' | RolDeAlta = soyDueno ? elegido : 'member';

  async function invitar() {
    if (!email.trim() || !rol) return;
    setEnviando(true);
    const r = await comando<ResultadoAddMember>('add_member', {
      email: email.trim(),
      role: rol,
      ...(ficha && { employee_id: ficha }),
    });
    setEnviando(false);
    /**
     * Sin respuesta del bot no hay contraseña que enseñar. Consecuencia
     * conocida: si el bot tarda más de la cuenta, la persona se crea igual —el
     * comando está encolado— pero su contraseña temporal se pierde.
     */
    if (!r) return;
    setHecho(r);
    setEmail('');
    setElegido('');
    setFicha('');
    if (!r.ya_era_miembro) alDarlo();
  }

  const columnas = ['minmax(0,1fr)', soyDueno && 'auto', fichasLibres.length > 0 && 'auto', 'auto']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className="pay-item" style={{ gridTemplateColumns: columnas }}>
        <input
          placeholder="correo@dequien-va-a-entrar.com"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {soyDueno && (
          <select
            value={elegido}
            onChange={(e) =>
              setElegido(e.target.value === 'admin' ? 'admin' : e.target.value === 'member' ? 'member' : '')
            }
            aria-label="Con qué rol entra"
          >
            <option value="" disabled>
              Elige su rol…
            </option>
            <option value="member">Empleado</option>
            <option value="admin">Administrador</option>
          </select>
        )}
        {fichasLibres.length > 0 && (
          <select value={ficha} onChange={(e) => setFicha(e.target.value)} aria-label="Su ficha en el equipo">
            <option value="">Sin ficha</option>
            {fichasLibres.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        )}
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
        {soyDueno
          ? 'El administrador puede, además, dar acceso a empleados y usar Mia Gerente (sin ver importes). Por ahora, el resto del panel lo ven los dos.'
          : 'Entra como empleado. Nombrar a un administrador lo hace el dueño.'}
      </p>

      {hecho &&
        (hecho.ya_era_miembro ? (
          // El bot no le cambia ni el rol ni la ficha a quien ya era del negocio.
          <div className="clave-temporal">
            <b>{hecho.email}</b> ya tenía acceso a este negocio, como {nombreDeRol(hecho.role).toLowerCase()}. No
            se ha cambiado nada: su rol y su ficha se cambian en la lista de arriba.
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
