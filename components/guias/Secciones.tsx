import type { Bloque } from '@/lib/guias';

/**
 * Pinta los bloques de una guía: h2, párrafos y viñetas.
 *
 * Es el gemelo de components/legal/Bloques.tsx y NO se reutilizó aquel a
 * propósito: allí los <h2> son de documento legal —19px, densos, pegados— y
 * aquí hay que dejar aire entre secciones porque esto se lee saltando. Si
 * mañana cambia la tipografía de las legales, no debería cambiar la de las
 * guías, y compartir el componente era garantizar que sí.
 */
export default function Secciones({
  bloques,
  faq,
}: {
  bloques: readonly Bloque[];
  /** Las preguntas van al final y con h3, porque cuelgan de un solo h2. */
  faq?: readonly { q: string; a: string }[];
}) {
  return (
    <div className="space-y-12">
      {bloques.map((b, i) => (
        <section key={b.h ?? i}>
          {b.h && (
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              {b.h}
            </h2>
          )}
          {b.p?.map((t) => (
            <p
              key={t.slice(0, 40)}
              className="mt-3 text-[15px] leading-[1.7]"
              style={{ color: 'var(--text-mid)' }}
            >
              {t}
            </p>
          ))}
          {b.li && (
            <ul className="mt-4 space-y-3">
              {b.li.map((t) => (
                <li
                  key={t.slice(0, 40)}
                  className="flex gap-3 text-[15px] leading-[1.7]"
                  style={{ color: 'var(--text-mid)' }}
                >
                  <span aria-hidden className="select-none" style={{ color: 'var(--orange-500)' }}>
                    ·
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {faq && faq.length > 0 && (
        <section>
          <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
            Preguntas frecuentes
          </h2>
          <div className="mt-5 space-y-6">
            {faq.map((f) => (
              <div key={f.q}>
                <h3 className="text-[16px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                  {f.q}
                </h3>
                <p className="mt-2 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
