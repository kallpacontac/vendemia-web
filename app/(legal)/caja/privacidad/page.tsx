import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import Bloques from '@/components/legal/Bloques';
import { CAJA_PRIVACIDAD } from '@/lib/legal';

/**
 * ⚠️ ESTA URL VA EN GOOGLE PLAY (ficha de Vendemia Caja) Y DENTRO DE LA APP.
 * Si cambia la ruta, hay que cambiarla en los dos sitios, o Play retira la app.
 */
export const metadata: Metadata = {
  title: 'Privacidad de Vendemia Caja · Vendemia',
  description: 'Qué lee la app Vendemia Caja en el celular de tu negocio, qué hace con eso y qué nunca toca.',
  alternates: { canonical: '/caja/privacidad' },
};

export default function Pagina() {
  return (
    <Marco titulo={CAJA_PRIVACIDAD.titulo} bajada={CAJA_PRIVACIDAD.bajada}>
      <Bloques bloques={CAJA_PRIVACIDAD.bloques} />
    </Marco>
  );
}
