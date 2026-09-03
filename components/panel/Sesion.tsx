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
import { misCompanias, type CompaniaAccesible } from '@/lib/supabase/queries';

interface Estado {
  session: Session | null;
  companias: CompaniaAccesible[];
  companyId: string | null;
  compania: CompaniaAccesible | null;
  esDueno: boolean;
  cargando: boolean;
  elegirCompania: (id: string) => void;
  salir: () => Promise<void>;
}

const Ctx = createContext<Estado | null>(null);

const CLAVE_COMPANIA = 'vendemia_company';

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [companias, setCompanias] = useState<CompaniaAccesible[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const sb = supabase();
    let vivo = true;

    // getSession() lee del almacenamiento local y NO va a la red, así que es lo
    // que evita el parpadeo de "no hay sesión" al recargar una página del panel.
    void sb.auth.getSession().then(({ data }) => {
      if (vivo) setSession(data.session);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_evento, s) => {
      if (!vivo) return;
      setSession(s);
      if (!s) {
        setCompanias([]);
        setCompanyId(null);
      }
    });

    return () => {
      vivo = false;
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

    void misCompanias()
      .then((lista) => {
        if (!vivo) return;
        setCompanias(lista);
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
      cargando,
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
        await supabase().auth.signOut();
        localStorage.removeItem(CLAVE_COMPANIA);
        setCompanias([]);
        setCompanyId(null);
        router.replace('/login');
      },
    };
  }, [session, companias, companyId, cargando, router]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSesion(): Estado {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSesion() solo se puede usar dentro de <ProveedorSesion>');
  return v;
}
