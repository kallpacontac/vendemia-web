import { PRICING } from '@/lib/content';

export const PLAN_SLUGS = ['starter', 'seller', 'best-seller'] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export function resolvePlan(value?: string) {
  const index = PLAN_SLUGS.findIndex((slug) => slug === value);
  return index < 0 ? 1 : index;
}

export const BUSINESS_OPTIONS = [
  { id: 'barberia', label: 'Barbería o peluquería', short: 'tu barbería', image: 'barberia' },
  { id: 'lavanderia', label: 'Lavandería', short: 'tu lavandería', image: 'lavanderia' },
  { id: 'gimnasio', label: 'Gimnasio o estudio', short: 'tu gimnasio', image: 'gimnasio' },
  { id: 'clinica', label: 'Clínica o consultorio', short: 'tu consultorio', image: 'clinica' },
  { id: 'tienda', label: 'Tienda online', short: 'tu tienda', image: 'tienda' },
  { id: 'inmobiliaria', label: 'Inmobiliaria o servicios', short: 'tu negocio', image: 'inmobiliaria' },
  { id: 'otro', label: 'Otro negocio', short: 'tu negocio', image: 'tienda' },
] as const;

export function planName(index: number) {
  return PRICING.plans[index].header.split(' · ')[0];
}
