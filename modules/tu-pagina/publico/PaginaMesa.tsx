/**
 * tienda.vendemias.com/<negocio>/mesa/<token> · lo que abre el QR de una mesa.
 *
 * Funciona con cualquier plantilla: las mesas son del negocio, y el dueño puede haberlas
 * impreso antes de cambiar el diseño de su página. No se indexa: es de quien está sentado.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Marco from '@/modules/tu-pagina/publico/Marco';
import AtencionEnMesa from '@/modules/tu-pagina/publico/AtencionEnMesa';
import { TOKEN_MESA } from '@/modules/tu-pagina/dominio/mesa';
import { paginaDe } from '@/modules/tu-pagina/servidor/pagina';
import { escaparateDe } from '@/modules/tu-pagina/servidor/escaparate';
import { rpc, servidor } from '@/modules/tu-pagina/servidor/supabase';

export const metadata: Metadata = { title: 'Atención en mesa', robots: { index: false, follow: false } };

type Props = { params: { slug: string; token: string } };
type Leida = { status: string; salon: string; numero: string; equipo: { id: string; nombre: string }[] };

export default async function PaginaMesa({ params }: Props) {
  if (!TOKEN_MESA.test(params.token)) notFound();
  const pagina = await paginaDe(params.slug);
  if (!pagina) notFound();
  const mesa = await rpc<Leida>(servidor(), 'mesa_srv_leer', { p_slug: params.slug, p_token: params.token });
  if (mesa.status !== 'ok') notFound();
  const esc = pagina.secciones.catalogo ? await escaparateDe(pagina.slug, pagina.secciones) : null;
  const items = (esc?.items ?? []).filter((i) => i.tipo === 'producto');
  return (
    <Marco pagina={pagina}>
      <AtencionEnMesa
        negocio={pagina.titulo}
        logo={pagina.logo_url}
        whatsapp={pagina.whatsapp}
        token={params.token}
        mesa={{ salon: mesa.salon, numero: mesa.numero }}
        equipo={mesa.equipo}
        items={items}
        ajustes={pagina.secciones.carta ?? {}}
      />
    </Marco>
  );
}
