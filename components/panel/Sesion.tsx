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
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { misCompanias, soyAdminPlataforma, type CompaniaAccesible } from '@/lib/supabase/queries';

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
    void Promise.all([misCompanias(), soyAdminPlataforma()])
      .then(([lista, admin]) => {
        if (!vivo) return;
        setCompanias(lista);
        setEsAdminPlataforma(admin);
        const guardada = localStorage.getItem(CLAVE_COMPANIA);
        const valida = lista.find((c) => c.id === guardada)?.id ?? lista[0]?.id ?? null;
        setCompanyId(valida);
        if (valida) localStorage.setItem(CLAVE_COMPANIA, valida);
      })
      .catch(() => {
        if (vivo) setCompanias([]);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });

    return () => {
      vivo = false;
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
        await supabase().auth.signOut();
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
