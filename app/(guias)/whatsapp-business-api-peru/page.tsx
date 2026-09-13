import type { Metadata } from 'next';
import MarcoGuia from '@/components/guias/MarcoGuia';
import Secciones from '@/components/guias/Secciones';
import { jsonLdGuia } from '@/lib/schema';
import { CONSULTADO_EN } from '@/lib/guias';
import { API_PERU } from '@/lib/guias-extra';

/**
 * ⚠️ ESTA PÁGINA DICE CUÁNDO NO NOS NECESITAS, Y ESO ES EL PUNTO.
 *
 * Quien busca "whatsapp business api perú" casi nunca necesita la API: se la
 * nombraron y vino a enterarse. Una página que le empuje hacia ella para
 * parecer completa le hace perder dinero; una que le diga "si tu problema es
 * no contestar a tiempo, no la mires todavía" se gana el siguiente clic.
 *
 * Por eso no lleva cifras de las tarifas de Meta: las cambia, las publica por
 * país, y una guía con la tarifa del año pasado es peor que una sin ninguna.
 */
export const metadata: Metadata = {
  title: API_PERU.metaTitulo,
  description: API_PERU.metaDescripcion,
  alternates: { canonical: '/whatsapp-business-api-peru' },
  openGraph: { url: '/whatsapp-business-api-peru' },
};

export default function Pagina() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGuia({
              slug: 'whatsapp-business-api-peru',
              titulo: API_PERU.h1,
              descripcion: API_PERU.metaDescripcion,
              faq: API_PERU.faq,
            }),
          ),
        }}
      />
      <MarcoGuia titulo={API_PERU.h1} bajada={API_PERU.bajada} actualizado={CONSULTADO_EN}>
        <Secciones bloques={API_PERU.bloques} faq={API_PERU.faq} />
      </MarcoGuia>
    </>
  );
}
