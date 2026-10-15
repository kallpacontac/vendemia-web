// Marcador mientras se construye la página (docs/PLAN-PIDE.md, fase 1). Existe
// para poder comprobar el dominio de punta a punta: pide.vendemias.com/<negocio>
// tiene que llegar aquí reescrito, sin que el cliente vea /pide en la barra.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SLUG } from '@/modules/pide/dominio/config';

export const metadata: Metadata = { title: 'Pide', robots: { index: false, follow: false } };

export default function Page({ params }: { params: { slug: string } }) {
  if (!SLUG.test(params.slug)) notFound();
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ margin: 0, color: '#555' }}>Esta página estará disponible muy pronto.</p>
    </main>
  );
}
