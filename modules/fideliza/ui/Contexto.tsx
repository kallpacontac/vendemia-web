'use client';

/**
 * Lo que todas las pantallas de Fideliza necesitan a la vez: el rol efectivo
 * del usuario en la compañía activa y los ajustes del negocio. El rol solo
 * ESCONDE botones; quien decide es Postgres (loyalty_require).
 */
import { createContext, useContext } from 'react';
import { useSesion } from '@/components/panel/Sesion';
import { useCargar } from '@/components/panel/useCargar';
import { lecturas, type Ajustes } from '@/modules/fideliza/cliente/api';

type Rol = 'platform_admin' | 'owner' | 'manager' | 'cashier' | 'analyst';

const PERMISOS: Record<Rol, string[] | '*'> = {
  platform_admin: '*',
  owner: '*',
  manager: [
    'program.read', 'program.edit', 'members.read', 'members.create', 'members.manage', 'contacts.read',
    'ops.record', 'ops.redeem', 'ops.refund', 'devices.manage', 'links.manage', 'campaigns.manage',
    'metrics.read', 'wallet.manage',
  ],
  cashier: ['program.read', 'members.read', 'members.create', 'ops.record', 'ops.redeem'],
  analyst: ['program.read', 'metrics.read'],
};

/**
 * Qué usa el negocio, deducido de sus datos (sin columna nueva):
 *   nuevo         → no ha configurado nada: se le pregunta qué quiere.
 *   enlaces       → tiene su página y ningún programa: solo ve lo de la página.
 *   fidelizacion  → creó un programa de puntos: ve caja, clientes, campañas…
 */
export type Modo = 'nuevo' | 'enlaces' | 'fidelizacion';

interface Estado {
  companyId: string | null;
  modo: Modo;
  rol: Rol | null;
  puede: (permiso: string) => boolean;
  ajustes: Ajustes | null;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
}

const Ctx = createContext<Estado | null>(null);

export function ProveedorFideliza({ children }: { children: React.ReactNode }) {
  const { companyId } = useSesion();
  const { datos, cargando, error, releer } = useCargar(async () => {
    if (!companyId) return null;
    const [rol, ajustes, programas] = await Promise.all([
      lecturas.rol(companyId),
      lecturas.ajustes(companyId),
      lecturas.programas(companyId).catch(() => []),
    ]);
    return { rol: rol as Rol | null, ajustes, hayPrograma: programas.length > 0 };
  }, [companyId]);

  const rol = datos?.rol ?? null;
  const valor: Estado = {
    companyId,
    modo: datos?.hayPrograma ? 'fidelizacion' : datos?.ajustes ? 'enlaces' : 'nuevo',
    rol,
    puede: (p) => {
      if (!rol) return false;
      const lista = PERMISOS[rol];
      return lista === '*' || lista.includes(p);
    },
    ajustes: datos?.ajustes ?? null,
    cargando,
    error,
    recargar: releer,
  };
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useFideliza(): Estado {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFideliza() solo dentro de <ProveedorFideliza>');
  return v;
}
