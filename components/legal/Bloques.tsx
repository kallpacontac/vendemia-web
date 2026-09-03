import type { Bloque } from '@/lib/legal';

/** Pinta los bloques de una página legal: título, párrafos y viñetas. */
export default function Bloques({ bloques }: { bloques: readonly Bloque[] }) {
  return (
    <div className="space-y-9">
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
            <ul className="mt-3 space-y-2">
              {b.li.map((t) => (
                <li
                  key={t.slice(0, 40)}
                  className="flex gap-3 text-[15px] leading-[1.7]"
                  style={{ color: 'var(--text-mid)' }}
                >
                  {/* El punto va en su propio span con `select-none`: dentro
                      del <li> con list-style, copiar y pegar el documento se
                      llevaba las viñetas y descuadraba el texto pegado. */}
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
    </div>
  );
}
