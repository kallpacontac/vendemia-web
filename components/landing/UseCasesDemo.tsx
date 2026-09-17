'use client';

import Reveal from '@/components/Reveal';
import Image from 'next/image';
import { USE_CASES } from '@/lib/content';
const CASE_IMAGES: Record<string, string> = {
  'useCases.it': 'barberia',
  'useCases.retail': 'clinica',
  'useCases.auto': 'tienda',
  'useCases.gaming': 'gimnasio',
  'useCases.laundry': 'lavanderia',
  'useCases.manufacturing': 'inmobiliaria',
};

const DEMO_CASES = [
  USE_CASES.items[0],
  { assetId: 'useCases.laundry', title: 'Lavanderías', bullets: ['Cotiza el lavado y coordina el recojo', 'Confirma la entrega y hace seguimiento'] },
  USE_CASES.items[3],
  USE_CASES.items[1],
  USE_CASES.items[2],
  USE_CASES.items[5],
];

/**
 * 7 · CASOS DE USO — cream (#F9F9F6)
 *
 * Grid 3×2, gap-x 48px, gap-y 64px. La entrada sigue el ORDEN DE LECTURA
 * (izq→der, arriba→abajo) con stagger de 0.08s. Es lo que hace que la retícula
 * se lea como una retícula y no como seis cosas sueltas apareciendo.
 */
export default function UseCases() {
  return (
    <section
      id="use-cases"
      className="cv-auto relative"
      style={{ background: 'var(--bg-cream)', color: 'var(--text-dark)' }}
    >
      <div className="mx-auto w-full max-w-container px-6 pb-[64px] md:pb-[120px]">
        {/* ⚠️ ESTO YA NO ABRE SECCIÓN: ES LA COLA DE LA DEMO.
            Tenía badge y un H2 de 40px ("Funciona igual de bien en una
            barbería que en una clínica") justo después de que el visitante
            eligiera su rubro en la demo y viera a Mia trabajando en él. Un
            titular de ese tamaño anuncia un capítulo nuevo; aquí no empieza
            ninguno, solo continúa el mismo argumento con los rubros que no
            caben en el selector. Una línea basta. */}
        <p
          className="mx-auto max-w-[560px] text-center text-[17px] font-medium"
          style={{ color: 'var(--text-dark)' }}
        >
          {USE_CASES.h2}
        </p>

        <Reveal
          from="up"
          stagger={0.08}
          childSelector="[data-case]"
          className="mt-12 grid grid-cols-1 gap-x-12 gap-y-14 md:grid-cols-2 lg:grid-cols-3"
        >
          {DEMO_CASES.map((item) => (
            <article key={item.title} data-case data-reveal="up">
              <div className="relative aspect-[3/2] w-full overflow-hidden rounded-card">
                <Image
                  src={`/assets/demo-negocios/${CASE_IMAGES[item.assetId]}.webp`}
                  alt={`Mario de Vendemia · ${item.title}`}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <h3 className="mt-5 text-h3">{item.title}</h3>
              <ul className="mt-3 space-y-2">
                {item.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex gap-3 text-[14px] leading-[1.6]"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span
                      className="mt-[9px] h-1 w-1 shrink-0 rounded-full"
                      style={{ background: 'var(--orange-500)' }}
                      aria-hidden
                    />
                    {b}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
