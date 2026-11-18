'use client';

/**
 * Las pestañas de la Caja, cada una con UN propósito (18-nov-2026, Alvaro: «la caja tiene varias
 * funciones; lo más práctico y menos engorroso posible»):
 *
 *   Cobrar          lo que se hace con el cliente delante: cobrar ticket, escanear tarjeta,
 *                   apuntar un gasto, y la cola de «Listos para cobrar». Se abre por defecto.
 *   Cierre del día  cuadrar la caja: lo que entró por método, gastos y adelantos, a cuenta,
 *                   comprobantes y saldos. Es /panel/caja?ver=cierre (la misma pantalla).
 *   Boletas         Boletas y facturas (SUNAT); su configuración, en Ajustes.
 *   Comisiones      lo que le toca a cada barbero (solo negocios de citas y quien las ve).
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSesion } from '@/components/panel/Sesion';
import { esCita } from '@/lib/panel/modo';
import { puedeVer } from '@/lib/panel/roles';

export default function SubnavCaja() {
  return (
    <Suspense fallback={<nav className="chip-tabs" aria-label="Caja" style={{ margin: '0 0 14px', minHeight: 40 }} />}>
      <Pestanas />
    </Suspense>
  );
}

function Pestanas() {
  const ruta = usePathname();
  const cierre = useSearchParams().get('ver') === 'cierre';
  const { rol, compania } = useSesion();
  const pestanas = [
    { href: '/panel/caja', label: 'Cobrar', activa: ruta.startsWith('/panel/caja') && !cierre },
    { href: '/panel/caja?ver=cierre', label: 'Cierre del día', activa: ruta.startsWith('/panel/caja') && cierre },
    { href: '/panel/comprobantes', label: 'Boletas', activa: ruta.startsWith('/panel/comprobantes') },
    ...(esCita(compania?.business_mode) && puedeVer(rol, 'comisiones.ver')
      ? [{ href: '/panel/comisiones', label: 'Comisiones', activa: ruta.startsWith('/panel/comisiones') }]
      : []),
  ];
  return (
    <nav className="chip-tabs subnav-caja" aria-label="Caja" style={{ margin: '0 0 14px' }}>
      {pestanas.map((p) => (
        <Link key={p.href} href={p.href} className={p.activa ? 'active' : ''} aria-current={p.activa ? 'page' : undefined}
          style={{ padding: '6px 14px', borderRadius: 999, fontWeight: 700, fontSize: 12.5, ...(p.activa ? { background: 'var(--brand)', color: 'var(--on-brand)' } : { color: 'var(--ink-soft)' }) }}>
          {p.label}
        </Link>
      ))}
    </nav>
  );
}
