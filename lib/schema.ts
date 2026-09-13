import { BRAND, FAQ, FOOTER, PRICING, WHATSAPP, whatsappUrl } from '@/lib/content';
import { EMPRESA } from '@/lib/legal';
import { FAQ_PRECIOS, GUIAS_ACTUALIZADAS_ISO } from '@/lib/guias';

/**
 * ══════════════════════════════════════════════════════════════════════════
 * DATOS ESTRUCTURADOS (JSON-LD) — lo que Google lee y la página no enseña
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La landing no tenía ninguno. No es un olvido menor: sin esto Google ve un
 * muro de texto y tiene que adivinar qué es esto, quién lo vende, cuánto
 * cuesta y en qué país. Con esto se lo decimos en el formato en el que lo
 * pregunta.
 *
 * De los tres bloques, el que más se nota es FAQPage: es el que puede sacar
 * las preguntas desplegables debajo del resultado. Ocupan el triple de alto en
 * la página de resultados que un enlace normal, y las respuestas ya están
 * escritas — o sea que es superficie de búsqueda gratis a cambio de nada.
 *
 * ── TRES REGLAS, Y LAS TRES SON DE FONDO ─────────────────────────────────
 *
 * 1 · SE GENERA DEL MISMO `content.ts` QUE PINTA LA PÁGINA. Nunca a mano.
 *     Un JSON-LD copiado se queda viejo a la primera vez que alguien cambia un
 *     precio, y entonces le estamos diciendo a Google un precio y al cliente
 *     otro. Google llama a eso "structured data mismatch" y lo penaliza; el
 *     cliente lo llama otra cosa.
 *
 * 2 · SOLO SE DECLARA LO QUE SE VE EN PANTALLA. Las políticas de Google piden
 *     que el contenido marcado esté visible, y las FAQ y los precios lo están.
 *
 * 3 · NI UNA ESTRELLA. Falta a propósito `aggregateRating`, que es lo que pinta
 *     las estrellitas doradas en el resultado y lo primero que pide todo el
 *     mundo. Marcar valoraciones que no existen es inventarse reseñas: Google
 *     retira el resultado enriquecido del dominio entero cuando lo detecta, y
 *     en Perú es publicidad engañosa. Cuando haya reseñas reales, se añade.
 */

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vendemias.com';

/** "Starter · para el que atiende solo" → "Starter". */
function nombrePlan(header: string): string {
  return header.split('·')[0].trim();
}

export function jsonLdLanding() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        /**
         * ⚠️ ESTE BLOQUE NO ES DECORATIVO: ES QUIÉN ERES PARA GOOGLE.
         *
         * "Vendemia" choca con "vendimia" —la cosecha de la uva— y se parece a
         * marcas que ya existen. Buscando la propia marca, Google devolvía
         * cualquier cosa menos este sitio, y no es un problema de contenido:
         * es que no había forma de saber que aquí detrás hay una empresa
         * concreta, con un RUC, una dirección y un nombre legal.
         *
         * Eso es lo que arreglan legalName, taxID y address. Son los datos que
         * Google cruza con fuentes de fuera —registros, directorios, la ficha
         * de Google Business— para decidir que esto es UNA ENTIDAD y no una
         * palabra suelta. Sin esto no hay panel de marca ni enlaces de sitio,
         * por bien escrita que esté la página.
         *
         * Salen de lib/legal.ts, que es donde ya estaban por obligación legal:
         * a un solo sitio que mantener.
         */
        '@type': 'Organization',
        '@id': `${SITIO}/#organization`,
        name: BRAND.name,
        legalName: EMPRESA.razonSocial,
        /** El RUC. Para una empresa peruana es el identificador que la hace única. */
        taxID: EMPRESA.ruc,
        url: SITIO,
        logo: `${SITIO}/brand/mia.svg`,
        image: `${SITIO}/opengraph-image.png`,
        description: FOOTER.description,
        email: EMPRESA.email,
        telephone: `+${WHATSAPP.phone}`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: EMPRESA.domicilio,
          addressLocality: 'Jesús María',
          addressRegion: 'Lima',
          addressCountry: 'PE',
        },
        /**
         * ⚠️ VACÍO, Y ES LO QUE MÁS FALTA DE TODO ESTE FICHERO.
         *
         * `sameAs` es la lista de perfiles que son la misma entidad: Instagram,
         * Facebook, LinkedIn, la ficha de Google Business. Es la señal más
         * fuerte que existe para desambiguar una marca, justo el problema que
         * tenemos.
         *
         * Está vacío porque FOOTER.social no tiene ni una URL todavía (ver la
         * nota de ahí: se pintan como texto porque un icono sin perfil es una
         * promesa incumplida). En cuanto haya perfiles reales, se les pone la
         * `url` allí y aparecen aquí solos.
         *
         * NO se inventan. Un `sameAs` que apunta a un perfil que no es tuyo o
         * que no existe es peor que no tener ninguno.
         */
        sameAs: FOOTER.social.flatMap((r) => ('url' in r && r.url ? [r.url as string] : [])),
        areaServed: { '@type': 'Country', name: 'Perú' },
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'sales',
          // El mismo número que abren todos los botones. Si cambia en
          // content.ts, cambia aquí solo.
          telephone: `+${WHATSAPP.phone}`,
          url: whatsappUrl(),
          availableLanguage: 'es',
        },
      },
      {
        /**
         * El sitio como cosa distinta de la empresa. Sirve para dos cosas:
         * decir en qué idioma está —es-PE, no "español" a secas, que es lo que
         * separa este resultado de las webs mexicanas y españolas del mismo
         * rubro— y dar el `alternateName` por el que también se nos escribe.
         */
        '@type': 'WebSite',
        '@id': `${SITIO}/#website`,
        url: SITIO,
        name: BRAND.name,
        alternateName: 'Vendemia',
        inLanguage: 'es-PE',
        publisher: { '@id': `${SITIO}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITIO}/#producto`,
        name: `${BRAND.name} · Mia`,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'WhatsApp',
        description: FOOTER.description,
        publisher: { '@id': `${SITIO}/#organization` },
        // Un `Offer` por plan, con el precio que pinta la tabla. `PEN` y no
        // `S/`: schema.org quiere el código ISO, y con el símbolo Google
        // descarta el bloque entero sin avisar.
        offers: PRICING.plans.map((plan) => ({
          '@type': 'Offer',
          name: nombrePlan(plan.header),
          price: String(plan.price),
          priceCurrency: 'PEN',
          url: `${SITIO}/#pricing`,
          availability: 'https://schema.org/InStock',
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITIO}/#faq`,
        mainEntity: FAQ.items.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            // Las respuestas son arrays de párrafos; aquí van unidas porque
            // `text` es un solo campo.
            text: item.a.join(' '),
          },
        })),
      },
    ],
  };
}

/**
 * El JSON-LD de /precios-chatbot-whatsapp-peru.
 *
 * Dos bloques y ninguno es decorativo:
 *
 * · FAQPage — las seis preguntas de la guía. Es lo que puede sacar las
 *   desplegables debajo del resultado, y en una búsqueda de precios eso es
 *   media pantalla contestando antes de que nadie entre.
 *
 * · Article — le dice a Google que esto es contenido editorial con fecha y
 *   autor, no una página de producto más. `dateModified` importa de verdad
 *   aquí: en "precios 2026" compites contra guías viejas, y la fecha es lo
 *   que separa un resultado vigente de uno que nadie pulsa.
 *
 * ⚠️ `dateModified` sale de GUIAS_ACTUALIZADAS_ISO, escrito a mano, por el
 * mismo motivo que el `lastmod` del sitemap: con `new Date()` sería la hora
 * del build y cada despliegue del panel le diría a Google que la guía cambió.
 * Súbelo cuando revises los precios de verdad.
 */
export function jsonLdPrecios() {
  const url = `${SITIO}/precios-chatbot-whatsapp-peru`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: '¿Cuánto cuesta un chatbot de WhatsApp en Perú? Precios 2026',
        description:
          'Rangos reales del mercado peruano, los costos que no salen en la cotización y qué preguntar antes de firmar.',
        inLanguage: 'es-PE',
        datePublished: GUIAS_ACTUALIZADAS_ISO,
        dateModified: GUIAS_ACTUALIZADAS_ISO,
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: BRAND.name, url: SITIO },
        publisher: { '@type': 'Organization', name: BRAND.name, url: SITIO },
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: FAQ_PRECIOS.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}
