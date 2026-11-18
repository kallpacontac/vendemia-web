'use client';

/**
 * Caja y Boletas y facturas, juntas (The 24/7, 17-nov: «boletas y facturas en caja, unifícalo
 * excepto su configuración»). Dos pestañas arriba de las dos pantallas; la configuración de SUNAT
 * vive en Ajustes › «Boletas y facturas».
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSesion } from '@/components/panel/Sesion';
import { esCita } from '@/lib/panel/modo';
import { puedeVer } from '@/lib/panel/roles';

const PESTANAS = [
  { href: '/panel/caja', label: 'Caja del día' },
  { href: '/panel/comprobantes', label: 'Boletas y facturas' },
];

export default function SubnavCaja() {
  const ruta = usePathname();
  const { rol, compania } = useSesion();
  // Comisiones, junto a la caja (18-nov-2026: «¿dónde ve el dueño las comisiones?»). Antes solo
  // estaban en «Más» del menú lateral. Solo en negocios de citas y para quien las puede ver.
  const pestanas = esCita(compania?.business_mode) && puedeVer(rol, 'comisiones.ver')
    ? [...PESTANAS, { href: '/panel/comisiones', label: 'Comisiones' }]
    : PESTANAS;
  return (
    <nav className="chip-tabs" aria-label="Caja" style={{ margin: '0 0 14px' }}>
      {pestanas.map((p) => {
        const activa = ruta.startsWith(p.href);
        return (
          <Link key={p.href} href={p.href} className={activa ? 'active' : ''} aria-current={activa ? 'page' : undefined}
            style={{ padding: '6px 14px', borderRadius: 999, fontWeight: 700, fontSize: 12.5, ...(activa ? { background: 'var(--brand)', color: 'var(--on-brand)' } : { color: 'var(--ink-soft)' }) }}>
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
