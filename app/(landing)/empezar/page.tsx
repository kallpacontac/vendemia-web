import type { Metadata } from 'next';
import BrandSurface from '@/components/landing/BrandSurface';
import PlanJourney from '@/components/landing/PlanJourney';
import { resolvePlan } from '@/components/landing/plan-flow';

export const metadata: Metadata = {
  title: 'Mia para tu negocio | Vendemia',
  robots: { index: false, follow: true },
  alternates: { canonical: '/empezar' },
};

export default function StartPage({ searchParams }: { searchParams: { plan?: string; moneda?: string } }) {
  return <BrandSurface><PlanJourney initialPlan={resolvePlan(searchParams.plan)} initialCurrency={searchParams.moneda === 'USD' ? 1 : 0} /></BrandSurface>;
}
