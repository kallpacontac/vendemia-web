import Link from 'next/link';
import Mark from '@/components/Mark';
import { BRAND } from '@/lib/content';
import { ACTUALIZADO, EMPRESA } from '@/lib/legal';

/**
 * El marco común de las cuatro páginas legales.
 *
 * ── POR QUÉ NO REUTILIZA EL <Navbar/> DE LA LANDING ──────────────────────
 * El navbar es una pieza de venta: lleva "Precios", "FAQ" y el botón naranja.
 * Encima de unos términos o de un libro de reclamaciones se lee como si te
 * intentaran vender mientras lees la letra pequeña. Aquí la cabecera hace un
 * solo trabajo: decir dónde estás y dejarte volver.
 *
 * ── ANCHO DE LÍNEA ───────────────────────────────────────────────────────
 * 68 caracteres (`max-w-[68ch]`), no el `max-w-prose` de la landing. Un texto
 * legal se lee de arriba abajo y entero; a más de ~75 caracteres por línea el
 * ojo pierde el salto de renglón y hay que releer. Es la diferencia entre un
 * documento que se lee y uno que se firma sin leer.
 */
export default function Marco({
  titulo,
  bajada,
  children,
}: {
  titulo: string;
  bajada: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-900)' }}>
      <header
        className="border-b"
        style={{ borderColor: 'var(--border-dark)', background: 'var(--surface-800)' }}
      >
        <div className="mx-auto flex h-16 w-full max-w-container items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2" aria-label={BRAND.name}>
            <Mark size={22} variant="plane" />
            <span className="text-[16px] font-semibold tracking-[0.06em]">{BRAND.name}</span>
          </Link>
          {/* 44px de zona táctil: esto se abre desde el móvil casi siempre. */}
          <Link
            href="/"
            className="-mr-3 flex h-11 items-center px-3 text-[14px]"
            style={{ color: 'var(--text-mid)' }}
          >
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-container px-6 py-12 md:py-16">
        <div className="max-w-[68ch]">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[40px]">
            {titulo}
          </h1>
          <p className="mt-4 text-[17px] leading-[1.6]" style={{ color: 'var(--text-mid)' }}>
            {bajada}
          </p>
          <p className="mt-6 text-[13px]" style={{ color: 'var(--text-low)' }}>
            Última actualización: {ACTUALIZADO}
          </p>

          <hr className="my-10 border-0 border-t" style={{ borderColor: 'var(--border-dark)' }} />

          {children}

          <hr className="my-10 border-0 border-t" style={{ borderColor: 'var(--border-dark)' }} />

          <p className="text-[13px] leading-[1.7]" style={{ color: 'var(--text-low)' }}>
            {EMPRESA.razonSocial} · RUC {EMPRESA.ruc} · {EMPRESA.domicilio} · {EMPRESA.ciudad}
            <br />
            ¿Dudas sobre este documento? Escríbenos a {EMPRESA.email} o al {EMPRESA.whatsapp}.
          </p>
        </div>
      </main>
    </div>
  );
}
