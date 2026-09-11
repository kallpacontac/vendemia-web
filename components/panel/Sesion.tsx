'use client';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA SESIÓN Y LA COMPAÑÍA ACTIVA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Un usuario puede pertenecer a varias compañías (`memberships`), así que
 * "quién eres" y "qué negocio estás mirando" son dos cosas distintas y las dos
 * viven aquí. Todo lo demás del panel se consulta con la compañía activa.
 *
 * El rol (`owner` | `member`) sirve para OCULTAR lo que un miembro no puede
 * hacer —dar de alta usuarios—, no para impedirlo: el bot revalida cada
 * comando de todas formas. El front oculta por comodidad, no por seguridad.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { misCompanias, soyAdminPlataforma, type CompaniaAccesible } from '@/lib/supabase/queries';
import {
  apuntarActividad,
  motivoDeCaducidad,
  olvidarActividad,
  type MotivoCaducidad,
} from '@/lib/panel/caducidad';

interface Estado {
  session: Session | null;
  companias: CompaniaAccesible[];
  companyId: string | null;
  compania: CompaniaAccesible | null;
  esDueno: boolean;
  /**
   * Admin de la plataforma (tabla `platform_admins`, migración 0020).
   *
   * ⚠️ NO es «dueño de todo»: es una condición ORTOGONAL a las membresías. Lo
   * normal es que esta cuenta no sea miembro de ninguna empresa, así que
   * `companias` viene VACÍA y `companyId` en null. Lo único que le abre son las
   * pantallas globales — hoy, Retargeting.
   */
  esAdminPlataforma: boolean;
  cargando: boolean;
  /**
   * Hay una sesión guardada pero ahora mismo no hay una viva: el token caducó
   * y el refresco todavía no ha respondido. NO es "no has entrado". Ver el
   * comentario largo de abajo.
   */
  reconectando: boolean;
  elegirCompania: (id: string) => void;
  salir: () => Promise<void>;
}

const Ctx = createContext<Estado | null>(null);

const CLAVE_COMPANIA = 'vendemia_company';

/**
 * Donde supabase-js guarda la sesión. Tiene que coincidir con el `storageKey`
 * de lib/supabase/client.ts: si alguien cambia uno y no el otro, esto deja de
 * detectar la sesión guardada y vuelve el rebote al login.
 */
const CLAVE_SESION = 'vendemia-auth';

/** ¿Queda una sesión guardada en este navegador, aunque no esté viva? */
function haySesionGuardada(): boolean {
  try {
    return localStorage.getItem(CLAVE_SESION) !== null;
  } catch {
    // Ventana privada o cookies bloqueadas: sin almacenamiento no hay nada que
    // recuperar, así que lo honesto es decir que no.
    return false;
  }
}

/**
 * Cuánto se le da al refresco antes de rendirse y mandar al login.
 *
 * Generoso a propósito: el caso real es un portátil que despierta después de
 * horas y cuya wifi tarda unos segundos en volver. Rendirse antes es
 * exactamente el bug que esto arregla.
 */
const ESPERA_RECONEXION_MS = 12000;

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [companias, setCompanias] = useState<CompaniaAccesible[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [esAdminPlataforma, setEsAdminPlataforma] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [reconectando, setReconectando] = useState(false);

  /**
   * La sesión de ahora, para los manejadores de eventos y el reloj de la
   * caducidad. Se cuelgan UNA vez por usuario y tienen que leer siempre la
   * sesión vigente —el token cambia en cada refresco—, no la del render en
   * el que se registraron.
   */
  const sesionRef = useRef<Session | null>(session);
  sesionRef.current = session;

  /** Que el reloj y un clic a la vez no cierren la sesión dos veces. */
  const cerrando = useRef(false);

  /**
   * La sesión caducó por la política del panel. Ver lib/panel/caducidad.ts.
   *
   * `scope: 'local'` REVOCA ESTA SESIÓN en el servidor: su refresh token deja
   * de valer aunque alguien lo hubiera copiado. Y solo esta: el dueño no pierde
   * la de su móvil porque caducara la del ordenador de recepción.
   *
   * ⚠️ Si la red falla, supabase-js devuelve el error SIN borrar la sesión
   * local (comprobado en GoTrueClient._signOut, auth-js 2.112.3). Por eso se
   * borra a mano: una caducidad que no caduca porque no había wifi no sirve de
   * nada. En ese caso el token no se revoca en el servidor, pero en este
   * navegador ya no queda.
   */
  async function caducar(motivo: MotivoCaducidad) {
    if (cerrando.current) return;
    cerrando.current = true;
    setReconectando(false);
    let fallo = false;
    try {
      const { error } = await supabase().auth.signOut({ scope: 'local' });
      fallo = Boolean(error);
    } catch {
      fallo = true;
    }
    try {
      if (fallo) localStorage.removeItem(CLAVE_SESION);
      localStorage.removeItem(CLAVE_COMPANIA);
    } catch {
      /* sin almacenamiento no hay nada que quitar */
    }
    olvidarActividad();
    setCompanias([]);
    setCompanyId(null);
    setEsAdminPlataforma(false);
    router.replace(`/login?caducada=${motivo}`);
  }

  useEffect(() => {
    const sb = supabase();
    let vivo = true;

    let relojReconexion: ReturnType<typeof setTimeout> | undefined;

    /**
     * ⚠️ getSession() SÍ VA A LA RED CUANDO EL TOKEN HA CADUCADO.
     *
     * Es la parte que no es obvia y la que producía el rebote «me manda al
     * login y vuelvo solo al panel». Comprobado en el código de auth-js
     * 2.112.3 (GoTrueClient, __loadSession): si `expires_at` ya pasó, llama a
     * _callRefreshToken() y espera. Solo devuelve `session: null` si ese
     * refresco FALLA.
     *
     * Y falla, sin que la sesión esté muerta, en el caso más común de todos:
     * un portátil que despierta después de horas y cuya red todavía no está
     * lista. Antes eso bajaba `cargando` a false con `session` en null, la
     * guardia leía "no ha entrado" y redirigía a /login — y un segundo después
     * el reintento automático de supabase-js funcionaba, emitía TOKEN_REFRESHED
     * y el usuario volvía al panel sin haber tocado nada.
     *
     * Así que null NO significa "no ha entrado": significa "ahora mismo no
     * tengo una sesión viva". Si queda una guardada en este navegador, lo
     * correcto es esperar al reintento, no echar a nadie.
     */
    void sb.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setSession(data.session);
      if (!data.session && haySesionGuardada()) {
        setReconectando(true);
        relojReconexion = setTimeout(() => {
          // Se acabó el margen. A partir de aquí la guardia sí manda al login,
          // que es lo correcto: sin sesión no hay panel que enseñar.
          if (vivo) setReconectando(false);
        }, ESPERA_RECONEXION_MS);
      }
    });

    const { data: sub } = sb.auth.onAuthStateChange((_evento, s) => {
      if (!vivo) return;
      setSession(s);
      if (s) {
        // Volvió: se cancela el margen y se sigue como si nada.
        setReconectando(false);
        if (relojReconexion) clearTimeout(relojReconexion);
        return;
      }
      /**
       * Sin sesión y sin nada guardado: esto es un cierre de sesión de verdad
       * —el botón de salir, o un refresh token revocado— y hay que soltarlo
       * inmediatamente. Distinguirlo del caso de arriba es justo lo que evita
       * que un logout real se quede 12 segundos fingiendo que reconecta.
       */
      setReconectando(false);
      if (relojReconexion) clearTimeout(relojReconexion);
      setCompanias([]);
      setCompanyId(null);
      setEsAdminPlataforma(false);
    });

    return () => {
      vivo = false;
      if (relojReconexion) clearTimeout(relojReconexion);
      sub.subscription.unsubscribe();
    };
  }, []);

  /**
   * ⚠️ LA DEPENDENCIA ES EL ID DEL USUARIO, NO EL OBJETO `session`.
   *
   * supabase-js renueva el token al volver a la pestaña, y cada renovación
   * emite un objeto `session` NUEVO aunque sea la misma persona. Con el objeto
   * como dependencia, ese cambio volvía a pedir las membresías y —peor— volvía
   * a poner `cargando` en true. La guardia de (panel)/layout.tsx enseña la
   * pantalla de carga mientras `cargando`, así que el panel entero se
   * DESMONTABA y se volvía a montar: todas las consultas de la pantalla se
   * repetían solas cada vez que alguien cambiaba de pestaña y volvía.
   *
   * Con el id, un token renovado no cambia nada. Un usuario distinto, sí.
   */
  const usuarioId = session?.user?.id ?? null;

  useEffect(() => {
    if (!usuarioId) {
      setCargando(false);
      return;
    }
    /**
     * ANTES de pedir nada: si la sesión ya caducó —el portátil que se abre
     * después de un fin de semana—, no se carga ni una fila del negocio.
     * `cargando` se queda en true, la guardia enseña la rueda y caducar()
     * lleva al login.
     */
    const motivo = motivoDeCaducidad(sesionRef.current);
    if (motivo) {
      void caducar(motivo);
      return;
    }
    let vivo = true;
    // Solo bloquea la primera vez. Al recargar por otro motivo no se vacía la
    // pantalla: ya hay datos buenos puestos.
    setCargando((c) => (companias.length ? c : true));

    /**
     * Las DOS cosas en la misma espera, no una detrás de otra.
     *
     * La guardia decide con las dos a la vez —sin membresías Y sin ser admin es
     * «cuenta sin negocio»—, así que si `cargando` bajara con solo una resuelta,
     * un admin de plataforma vería parpadear ese mensaje antes de entrar. Y ese
     * mensaje le dice que escriba a soporte: peor que un parpadeo cualquiera.
     */
    /**
     * ⚠️ `allSettled`, NO `all`, y esto era un fallo de verdad.
     *
     * Con `Promise.all`, un fallo en `misCompanias()` tiraba la promesa entera y
     * el `.catch` solo vaciaba las compañías: `esAdminPlataforma` se quedaba en
     * false sin haberse llegado a preguntar. O sea que el admin de la plataforma
     * —el único a quien le importa— acababa viendo «tu cuenta no tiene un
     * negocio asignado» por un error que no era el suyo, y sin rastro de cuál.
     *
     * Son dos preguntas independientes: que una falle no dice nada de la otra.
     */
    void Promise.allSettled([misCompanias(), soyAdminPlataforma()])
      .then(([resCompanias, resAdmin]) => {
        if (!vivo) return;

        if (resCompanias.status === 'fulfilled') {
          const lista = resCompanias.value;
          setCompanias(lista);
          const guardada = localStorage.getItem(CLAVE_COMPANIA);
          const valida = lista.find((c) => c.id === guardada)?.id ?? lista[0]?.id ?? null;
          setCompanyId(valida);
          if (valida) localStorage.setItem(CLAVE_COMPANIA, valida);
        } else {
          console.error('[sesion] no se pudieron leer las membresías:', resCompanias.reason);
          setCompanias([]);
        }

        setEsAdminPlataforma(resAdmin.status === 'fulfilled' && resAdmin.value);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  /**
   * La caducidad mientras el panel está abierto. Se mira:
   *
   *   · cada minuto, para la pestaña que se queda abierta toda la noche
   *     renovando el token sola — el caso que motivó todo esto;
   *   · al volver a la pestaña o a la ventana, para el portátil que se abre
   *     por la mañana (con la tapa cerrada, los relojes del navegador se paran);
   *   · en cada gesto de la persona, que es además lo ÚNICO que cuenta como
   *     actividad. El refresco del token no cuenta: ocurre sin nadie delante.
   *
   * ⚠️ SIEMPRE se comprueba antes de apuntar. Si el primer clic de la mañana
   * contara como actividad antes de mirar, reiniciaría el reloj y ninguna
   * sesión caducaría nunca.
   */
  useEffect(() => {
    if (!usuarioId) return;

    const revisar = (esGesto: boolean) => {
      const s = sesionRef.current;
      const motivo = motivoDeCaducidad(s);
      if (motivo) void caducar(motivo);
      else if (esGesto) apuntarActividad(s);
    };
    const gesto = () => revisar(true);
    const mirar = () => revisar(false);
    const alVolver = () => {
      if (document.visibilityState === 'visible') mirar();
    };

    const GESTOS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const e of GESTOS) window.addEventListener(e, gesto, { passive: true });
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', mirar);
    const reloj = setInterval(mirar, 60 * 1000);

    return () => {
      for (const e of GESTOS) window.removeEventListener(e, gesto);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', mirar);
      clearInterval(reloj);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId]);

  const valor = useMemo<Estado>(() => {
    const compania = companias.find((c) => c.id === companyId) ?? null;
    return {
      session,
      companias,
      companyId,
      compania,
      esDueno: compania?.rol === 'owner',
      esAdminPlataforma,
      cargando,
      reconectando,
      /**
       * ⚠️ Comprueba SIEMPRE que la compañía esté en la lista del usuario.
       *
       * La lista sale de `memberships`, que por RLS solo devuelve las suyas. Un
       * id que no esté ahí se ignora, venga de donde venga: de un localStorage
       * manipulado, de la consola del navegador o de un futuro selector que se
       * despiste. No es la barrera —esa es el RLS, que devolvería cero filas
       * igualmente— pero evita que el panel llegue a pedir datos ajenos y se
       * quede con la cabecera de otro negocio puesta.
       */
      elegirCompania: (id) => {
        if (!companias.some((c) => c.id === id)) return;
        localStorage.setItem(CLAVE_COMPANIA, id);
        setCompanyId(id);
      },
      /**
       * Cerrar sesión limpia TAMBIÉN la compañía elegida. Si se quedara, la
       * siguiente persona que entrase en el mismo navegador —un ordenador
       * compartido en recepción es el caso normal aquí— vería el nombre del
       * negocio anterior mientras carga el suyo.
       */
      salir: async () => {
        // Antes que nada: salir es una decisión, no una desconexión. Sin esto,
        // el margen de reconexión podría estar activo y la guardia se quedaría
        // enseñando "Reconectando…" en vez de irse al login.
        setReconectando(false);
        /**
         * `scope: 'local'`, y no el `'global'` que usa supabase-js por defecto:
         * con global, salir en el ordenador de recepción echaba también al
         * dueño de su móvil y de cualquier otro dispositivo. Para cerrar todas
         * las sesiones a la vez está el cambio de contraseña, que usa 'others'
         * a propósito (ver /nueva-clave).
         */
        const { error } = await supabase().auth.signOut({ scope: 'local' });
        // Sin red, supabase-js NO borra la sesión local: salir tiene que salir igual.
        if (error) localStorage.removeItem(CLAVE_SESION);
        olvidarActividad();
        localStorage.removeItem(CLAVE_COMPANIA);
        setCompanias([]);
        setCompanyId(null);
        setEsAdminPlataforma(false);
        router.replace('/login');
      },
    };
  }, [session, companias, companyId, esAdminPlataforma, cargando, reconectando, router]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): Estado {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSesion() solo se puede usar dentro de <ProveedorSesion>');
  return v;
}
