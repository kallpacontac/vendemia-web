import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import MarcoGuia from '@/components/guias/MarcoGuia';
import Conversacion from '@/components/guias/Conversacion';
import { jsonLdRubro } from '@/lib/schema';
import { CONSULTADO_EN } from '@/lib/guias';
import { RUBROS, RUBRO_POR_SLUG } from '@/lib/rubros';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * /barberias · /clinicas-dentales · /tiendas-online · /gimnasios
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Una plantilla y cuatro contenidos, no cuatro páginas copiadas. Lo que
 * cambia entre rubros es el texto —y cambia entero, ver lib/rubros.ts—; lo
 * que no cambia es la forma, y tenerla en un solo sitio es lo que impide que
 * dentro de tres meses la de barberías tenga una sección que la de gimnasios
 * perdió.
 *
 * ── POR QUÉ UN SEGMENTO DINÁMICO EN LA RAÍZ, Y POR QUÉ NO ES PELIGROSO ───
 *
 * `[rubro]` en la raíz suena a que se va a tragar todas las rutas. No lo hace:
 * las rutas estáticas (/terminos, /precios-chatbot-whatsapp-peru…) ganan
 * siempre, y `dynamicParams = false` hace que cualquier slug que no esté en
 * generateStaticParams devuelva 404 en vez de renderizar una página vacía.
 *
 * Eso último importa para SEO más que para nada: sin ello, /lo-que-sea
 * respondería 200 con una página medio pintada, y un sitio que devuelve 200 a
 * cualquier cosa le dice a Google que sus 404 no son de fiar.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return RUBROS.map((r) => ({ rubro: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ rubro: string }>;
}): Promise<Metadata> {
  const { rubro: slug } = await params;
  const r = RUBRO_POR_SLUG.get(slug);
  if (!r) return {};
  return {
    title: r.metaTitulo,
    description: r.metaDescripcion,
    alternates: { canonical: `/${r.slug}` },
    openGraph: { url: `/${r.slug}` },
  };
}

export default async function Pagina({ params }: { params: Promise<{ rubro: string }> }) {
  const { rubro: slug } = await params;
  const r = RUBRO_POR_SLUG.get(slug);
  if (!r) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdRubro(r)) }}
      />

      <MarcoGuia titulo={r.h1} bajada={r.bajada} actualizado={CONSULTADO_EN}>
        <div className="space-y-12">
          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Lo que pasa hoy
            </h2>
            {r.problema.map((t) => (
              <p
                key={t.slice(0, 40)}
                className="mt-3 text-[15px] leading-[1.7]"
                style={{ color: 'var(--text-mid)' }}
              >
                {t}
              </p>
            ))}
          </section>

          {/* La conversación va ARRIBA del listado de tareas a propósito: es lo
              único de la página que se puede comprobar de un vistazo, y quien
              llega desde Google mira una prueba antes que una promesa. */}
          {r.demo && (
            <section>
              <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
                Así contesta
              </h2>
              <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
                Es la objeción más común del rubro, que es también la que peor se responde a las diez
                de la noche.
              </p>
              <Conversacion negocioId={r.demo} caso="objecion" />
            </section>
          )}

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Qué hace exactamente
            </h2>
            <div className="mt-6 space-y-7">
              {r.tareas.map((t) => (
                <div key={t.h}>
                  <h3 className="text-[16px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                    {t.h}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
                    {t.p}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              {r.cuenta.titulo}
            </h2>
            {r.cuenta.p.map((t) => (
              <p
                key={t.slice(0, 40)}
                className="mt-3 text-[15px] leading-[1.7]"
                style={{ color: 'var(--text-mid)' }}
              >
                {t}
              </p>
            ))}
            {/* Los supuestos van a la vista, no en letra pequeña al pie: una
                cuenta que no se puede rehacer es publicidad, no un argumento. */}
            <p className="mt-4 text-[13px] leading-[1.7]" style={{ color: 'var(--text-low)' }}>
              Es un escenario con los supuestos delante, no una estadística del sector. Cambia las
              cifras por las tuyas y la cuenta sigue funcionando.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Preguntas frecuentes
            </h2>
            <div className="mt-5 space-y-6">
              {r.faq.map((f) => (
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

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Lo que cuesta
            </h2>
            <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
              Desde S/89 al mes, sin costo de instalación, sin permanencia y con treinta días de
              devolución. Si quieres la comparación completa con lo que cobra el resto del mercado
              peruano, está en{' '}
              <a
                href="/precios-chatbot-whatsapp-peru"
                className="underline underline-offset-2"
                style={{ color: 'var(--orange-400)' }}
              >
                cuánto cuesta un chatbot de WhatsApp en Perú
              </a>
              .
            </p>
          </section>
        </div>
      </MarcoGuia>
    </>
  );
}
