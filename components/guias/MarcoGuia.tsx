import Link from 'next/link';
import Mark from '@/components/Mark';
import CtaGuia from '@/components/guias/CtaGuia';
import { BRAND } from '@/lib/content';

/**
 * El marco de las guías: las páginas que existen para que Google nos traiga
 * gente que todavía no sabe que existimos.
 *
 * ── NO ES EL LAYOUT DE LA LANDING, Y NO ES EL DE LEGALES ─────────────────
 *
 * De la landing se descarta BrandIntro. A la landing se llega casi siempre por
 * un enlace que alguien mandó, y ahí 2,7 segundos de marca sitúan. Aquí se
 * llega desde un resultado de búsqueda, con la pregunta a medio escribir y
 * otras nueve pestañas abiertas: cualquier cosa entre el clic y la respuesta
 * es una razón para volver atrás. El texto empieza arriba y ya.
 *
 * Del marco legal se descarta la sobriedad. Allí la cabecera no vende a
 * propósito, porque nadie quiere que le vendan mientras lee un reclamo. Aquí
 * el lector está comparando proveedores por voluntad propia: esconderle el
 * botón no le hace un favor, se lo hace a la competencia.
 *
 * ── EL ANCHO ─────────────────────────────────────────────────────────────
 *
 * 72 caracteres. Más que los 68 de las legales, porque este texto se salta y
 * se escanea por titulares en vez de leerse entero; menos que la landing,
 * porque sigue siendo prosa y no bloques.
 */
export default function MarcoGuia({
  titulo,
  bajada,
  actualizado,
  children,
}: {
  titulo: string;
  bajada: string;
  /** Cuándo se revisaron los datos. En una guía de precios esto ES el dato. */
  actualizado: string;
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
          <CtaGuia
            label="Probar Mia"
            className="-mr-1 flex h-11 items-center rounded-full px-5 text-[14px] font-semibold"
            style={{ background: 'var(--orange-cta)', color: '#fff' }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-container px-6 py-12 md:py-16">
        <article className="max-w-[72ch]">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[40px]">
            {titulo}
          </h1>
          <p className="mt-4 text-[17px] leading-[1.6]" style={{ color: 'var(--text-mid)' }}>
            {bajada}
          </p>
          {/* Quien compara precios mira la fecha antes que la cifra, y hace
              bien: una guía de precios sin fecha no vale nada. */}
          <p className="mt-6 text-[13px]" style={{ color: 'var(--text-low)' }}>
            Precios de mercado consultados en {actualizado}.
          </p>

          <hr className="my-10 border-0 border-t" style={{ borderColor: 'var(--border-dark)' }} />

          {children}
        </article>

        <div
          className="mx-auto mt-14 max-w-[72ch] rounded-2xl border p-7"
          style={{ borderColor: 'var(--border-dark)', background: 'var(--surface-800)' }}
        >
          <p className="text-[18px] font-semibold leading-snug">
            ¿Quieres ver cuánto de esto te ahorra a ti?
          </p>
          <p className="mt-2 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
            Escríbenos y te decimos en la misma conversación si Mia le sirve a tu negocio. Si no le
            sirve, te lo decimos también.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <CtaGuia
              label="Escribir por WhatsApp"
              className="flex h-12 items-center rounded-full px-6 text-[15px] font-semibold"
              style={{ background: 'var(--orange-cta)', color: '#fff' }}
            />
            <Link
              href="/"
              className="flex h-12 items-center rounded-full border px-6 text-[15px]"
              style={{ borderColor: 'var(--border-dark)', color: 'var(--text-mid)' }}
            >
              Ver qué hace Mia
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
