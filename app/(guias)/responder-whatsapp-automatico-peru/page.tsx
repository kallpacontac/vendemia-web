import type { Metadata } from 'next';
import MarcoGuia from '@/components/guias/MarcoGuia';
import Secciones from '@/components/guias/Secciones';
import { jsonLdGuia } from '@/lib/schema';
import { CONSULTADO_EN } from '@/lib/guias';
import { AUTOMATICO } from '@/lib/guias-extra';

/**
 * La comparativa. Compara las CUATRO FORMAS de resolver el problema y no
 * nombra a ninguna empresa: el porqué está explicado en lib/guias-extra.ts y
 * no es de estilo, es que no se pueden verificar los precios de un tercero.
 */
export const metadata: Metadata = {
  title: AUTOMATICO.metaTitulo,
  description: AUTOMATICO.metaDescripcion,
  alternates: { canonical: '/responder-whatsapp-automatico-peru' },
  openGraph: { url: '/responder-whatsapp-automatico-peru' },
};

export default function Pagina() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            jsonLdGuia({
              slug: 'responder-whatsapp-automatico-peru',
              titulo: AUTOMATICO.h1,
              descripcion: AUTOMATICO.metaDescripcion,
              faq: AUTOMATICO.faq,
            }),
          ),
        }}
      />
      <MarcoGuia titulo={AUTOMATICO.h1} bajada={AUTOMATICO.bajada} actualizado={CONSULTADO_EN}>
        <Secciones bloques={AUTOMATICO.bloques} faq={AUTOMATICO.faq} />
      </MarcoGuia>
    </>
  );
}
