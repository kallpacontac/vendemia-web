import { BRAND, FAQ, FOOTER, PRICING, WHATSAPP, whatsappUrl } from '@/lib/content';

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
        '@type': 'Organization',
        '@id': `${SITIO}/#organization`,
        name: BRAND.name,
        url: SITIO,
        logo: `${SITIO}/brand/mia.svg`,
        description: FOOTER.description,
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
