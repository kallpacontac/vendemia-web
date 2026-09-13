import type { Metadata } from 'next';
import MarcoGuia from '@/components/guias/MarcoGuia';
import { jsonLdPrecios } from '@/lib/schema';
import {
  CONSULTADO_EN,
  FAQ_PRECIOS,
  NUESTRO_PRECIO,
  OCULTOS,
  PREGUNTAS_ANTES,
  RANGOS,
  REENCUADRE,
} from '@/lib/guias';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * /precios-chatbot-whatsapp-peru
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La primera página del sitio que existe para RANKEAR, no para convertir.
 *
 * ── POR QUÉ ESTA BÚSQUEDA Y NO OTRA ──────────────────────────────────────
 *
 * De los resultados que Google enseña hoy para los términos de esta categoría
 * en Perú, la mayoría son posts de blog de la competencia sobre precios, no
 * portadas. La portada de vendemias.com competía sola contra todos ellos, y
 * una página no rankea para veinte búsquedas por muy bien escrita que esté.
 *
 * De todas las búsquedas del sector, "cuánto cuesta" es la que más intención
 * de compra tiene y la única donde salimos ganando por decir la verdad: el
 * mercado peruano publica entre S/550 y S/1.500 al mes, y aquí el plan de
 * entrada son S/89 sin instalación. No hace falta adornar nada.
 *
 * ── LA REGLA DE ESTA PÁGINA ──────────────────────────────────────────────
 *
 * ⚠️ Primero se es útil, y vender es lo último. La respuesta completa está en
 * el primer párrafo, antes de nombrarnos: quien busca un precio quiere el
 * precio, y una guía que lo esconde hasta el final es un anuncio disfrazado
 * —el lector lo huele, se va, y Google aprende que esta página no resuelve—.
 *
 * Los rangos de mercado, el porqué del "chatbot" en el título y cuándo hay que
 * revisar los datos están explicados en lib/guias.ts, que es donde vive el
 * texto. Aquí solo se pinta.
 */

const TITULO = '¿Cuánto cuesta un chatbot de WhatsApp en Perú?';

export const metadata: Metadata = {
  /**
   * "Precios 2026" va en el título a propósito: es parte de lo que la gente
   * escribe y, sobre todo, es lo que hace que el resultado parezca vigente en
   * una lista donde compite con guías de hace dos años.
   */
  title: '¿Cuánto cuesta un chatbot de WhatsApp en Perú? Precios 2026 · Vendemia',
  description:
    'Lo que cuesta de verdad automatizar tu WhatsApp en Perú: rangos del mercado, los costos que no salen en la cotización y qué preguntar antes de firmar. Desde S/89 al mes.',
  alternates: { canonical: '/precios-chatbot-whatsapp-peru' },
  openGraph: { url: '/precios-chatbot-whatsapp-peru' },
};

export default function Pagina() {
  return (
    <>
      <script
        type="application/ld+json"
        // Mismo patrón que la landing: el JSON-LD sale del contenido que se
        // pinta debajo, nunca escrito a mano. Ver lib/schema.ts.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdPrecios()) }}
      />

      <MarcoGuia
        titulo={TITULO}
        bajada="La respuesta corta: entre S/89 y S/1.500 al mes. La larga —que es la que te ahorra dinero— tiene que ver con la instalación, con lo que Meta cobra aparte y con quién puede cambiar tus precios."
        actualizado={CONSULTADO_EN}
      >
        <div className="space-y-12">
          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              La respuesta corta
            </h2>
            <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
              En Perú, automatizar el WhatsApp de un negocio cuesta entre S/89 y S/1.500 al mes. La
              diferencia no está en la tecnología —por dentro casi todos usan los mismos modelos—,
              sino en tres cosas: si te cobran instalación, si pagas aparte por cada conversación y
              si necesitas a alguien que lo programe cada vez que cambias un precio.
            </p>

            {/* La tabla scrollea sola en móvil en vez de encoger a ilegible:
                son cuatro columnas de cifras y una cifra cortada no sirve. */}
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[14px]">
                <thead>
                  <tr style={{ color: 'var(--text-low)' }}>
                    <th className="border-b py-3 pr-4 font-semibold" style={{ borderColor: 'var(--border-dark)' }}>
                      Cómo lo contratas
                    </th>
                    <th className="border-b py-3 pr-4 font-semibold" style={{ borderColor: 'var(--border-dark)' }}>
                      Al mes
                    </th>
                    <th className="border-b py-3 font-semibold" style={{ borderColor: 'var(--border-dark)' }}>
                      Instalación
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RANGOS.map((r) => (
                    <tr key={r.modo} className="align-top">
                      <td className="border-b py-4 pr-4" style={{ borderColor: 'var(--border-dark)' }}>
                        <b style={{ color: 'var(--text-hi)' }}>{r.modo}</b>
                        <span className="mt-1 block text-[13px]" style={{ color: 'var(--text-low)' }}>
                          {r.quien}
                        </span>
                        <span className="mt-2 block text-[13.5px] leading-[1.6]" style={{ color: 'var(--text-mid)' }}>
                          {r.detalle}
                        </span>
                      </td>
                      <td
                        className="border-b py-4 pr-4 font-semibold"
                        style={{ borderColor: 'var(--border-dark)', color: 'var(--text-hi)' }}
                      >
                        {r.mensual}
                      </td>
                      <td
                        className="border-b py-4 font-semibold"
                        style={{ borderColor: 'var(--border-dark)', color: 'var(--text-hi)' }}
                      >
                        {r.instalacion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-[13px] leading-[1.7]" style={{ color: 'var(--text-low)' }}>
              Rangos de lo que publican los proveedores peruanos, consultados en {CONSULTADO_EN}. Son
              rangos y no precios de empresas concretas a propósito: un importe ajeno envejece en
              semanas y entonces esta página estaría mintiendo.
            </p>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Los cuatro costos que no salen en la cotización
            </h2>
            <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
              El precio mensual es el que se compara y casi nunca es el que decide. Estos cuatro
              cambian el total del primer año mucho más:
            </p>
            <div className="mt-6 space-y-7">
              {OCULTOS.map((o) => (
                <div key={o.h}>
                  <h3 className="text-[16px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                    {o.h}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
                    {o.p}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Qué preguntar antes de firmar
            </h2>
            <p className="mt-3 text-[15px] leading-[1.7]" style={{ color: 'var(--text-mid)' }}>
              Siete preguntas. Sirven con nosotros y con cualquiera; llévatelas a la reunión.
            </p>
            <ul className="mt-5 space-y-3">
              {PREGUNTAS_ANTES.map((p) => (
                <li
                  key={p.slice(0, 40)}
                  className="flex gap-3 text-[15px] leading-[1.7]"
                  style={{ color: 'var(--text-mid)' }}
                >
                  <span aria-hidden className="select-none" style={{ color: 'var(--orange-500)' }}>
                    ·
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>

          {NUESTRO_PRECIO.map((b) => (
            <section key={b.h}>
              <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
                {b.h}
              </h2>
              {b.p?.map((t) => (
                <p
                  key={t.slice(0, 40)}
                  className="mt-3 text-[15px] leading-[1.7]"
                  style={{ color: 'var(--text-mid)' }}
                >
                  {t}
                </p>
              ))}
            </section>
          ))}

          <section>
            <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
              Preguntas frecuentes sobre el precio
            </h2>
            <div className="mt-5 space-y-6">
              {FAQ_PRECIOS.map((f) => (
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

          {REENCUADRE.map((b) => (
            <section key={b.h}>
              <h2 className="text-[19px] font-semibold leading-snug" style={{ color: 'var(--text-hi)' }}>
                {b.h}
              </h2>
              {b.p?.map((t) => (
                <p
                  key={t.slice(0, 40)}
                  className="mt-3 text-[15px] leading-[1.7]"
                  style={{ color: 'var(--text-mid)' }}
                >
                  {t}
                </p>
              ))}
            </section>
          ))}
        </div>
      </MarcoGuia>
    </>
  );
}
