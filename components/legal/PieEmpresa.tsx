import Link from 'next/link';
import LineaLegal from './LineaLegal';

/**
 * El pie de las páginas que NO llevan el footer grande de la landing: las
 * legales, las guías y las de empresa (nosotros, contacto, eliminación de
 * datos).
 *
 * Dos cosas y nada más: quién está detrás (LineaLegal) y el camino a las
 * páginas que un revisor de Meta —o un cliente con dudas— busca. El footer de
 * la landing no se reutiliza porque es una pieza de venta, con su CTA naranja
 * y sus columnas de producto; aquí estorbaría.
 */
const ENLACES = [
  { href: '/nosotros', label: 'Sobre nosotros' },
  { href: '/contacto', label: 'Contacto' },
  { href: '/terminos', label: 'Términos' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: '/eliminacion-de-datos', label: 'Eliminación de datos' },
  { href: '/reclamaciones', label: 'Libro de reclamaciones' },
];

export default function PieEmpresa() {
  return (
    <footer className="mt-12 border-t pt-6" style={{ borderColor: 'var(--border-dark)' }}>
      <nav aria-label="Empresa y legal" className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
        {ENLACES.map((e) => (
          <Link key={e.href} href={e.href} className="hover:text-white" style={{ color: 'var(--text-mid)' }}>
            {e.label}
          </Link>
        ))}
      </nav>
      <LineaLegal className="mt-4" />
    </footer>
  );
}
