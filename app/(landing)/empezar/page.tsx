import type { Metadata } from 'next';
import BrandSurface from '@/components/landing/BrandSurface';
import PlanJourney from '@/components/landing/PlanJourney';
import { resolvePlan } from '@/components/landing/plan-flow';
import LineaLegal from '@/components/legal/LineaLegal';

export const metadata: Metadata = {
  title: 'Mia para tu negocio | Vendemia',
  robots: { index: false, follow: true },
  alternates: { canonical: '/empezar' },
};

export default function StartPage({ searchParams }: { searchParams: { plan?: string; moneda?: string } }) {
  return (
    <BrandSurface>
      <PlanJourney initialPlan={resolvePlan(searchParams.plan)} initialCurrency={searchParams.moneda === 'USD' ? 1 : 0} />
      {/* Quién está detrás de la marca, también aquí: es una página pública. Ver components/legal/LineaLegal. */}
      <footer className="mx-auto w-full max-w-container px-6 pb-10 text-center">
        <LineaLegal />
      </footer>
    </BrandSurface>
  );
}
