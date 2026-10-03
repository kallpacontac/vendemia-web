/** Cómo se llaman las unidades según la regla. Una sola fuente para panel, tarjeta y Wallet. */
export type TipoRegla = 'stamps' | 'points' | 'visits';

export const UNIDAD: Record<TipoRegla, { una: string; varias: string; corta: string }> = {
  stamps: { una: 'sello', varias: 'sellos', corta: 'Sellos' },
  points: { una: 'punto', varias: 'puntos', corta: 'Puntos' },
  visits: { una: 'visita', varias: 'visitas', corta: 'Visitas' },
};

export const unidades = (n: number, tipo: TipoRegla | null | undefined) => {
  const u = UNIDAD[tipo ?? 'stamps'];
  return `${n.toLocaleString('es-PE')} ${Math.abs(n) === 1 ? u.una : u.varias}`;
};

/** Céntimos → «S/ 12,50». El dinero nunca viaja en decimales. */
export const soles = (centimos: number | null | undefined) =>
  `S/ ${((centimos ?? 0) / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** «12,50» o «12.5» → 1250. Devuelve null si no es un importe válido. */
export function aCentimos(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null;
  const [e, d = ''] = t.split('.');
  return Number(e) * 100 + Number((d + '00').slice(0, 2));
}

export const fechaHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('es-PE', {
        timeZone: 'America/Lima',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const fecha = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Lo que dice la regla, en una frase, para el panel y la página pública. */
export function fraseRegla(p: {
  rule_type: TipoRegla;
  threshold: number;
  reward: string;
  stamps_per_purchase?: number;
  points_per_unit?: number;
  unit_cents?: number;
  min_purchase_cents?: number;
}): string {
  const min = p.min_purchase_cents ? ` desde ${soles(p.min_purchase_cents)}` : '';
  if (p.rule_type === 'visits') return `Cada visita suma 1. Con ${p.threshold} visitas: ${p.reward}.`;
  if (p.rule_type === 'stamps')
    return `Cada compra${min} suma ${unidades(p.stamps_per_purchase ?? 1, 'stamps')}. Con ${p.threshold}: ${p.reward}.`;
  return `${unidades(p.points_per_unit ?? 1, 'points')} por cada ${soles(p.unit_cents ?? 100)}${min}. Con ${p.threshold.toLocaleString('es-PE')} puntos: ${p.reward}.`;
}

export const ESTADO_PLACA: Record<string, string> = {
  manufactured: 'Fabricada',
  tested: 'Probada',
  assigned: 'Asignada',
  active: 'Activa',
  suspended: 'Suspendida',
  retired: 'Retirada',
};

export const ROL: Record<string, string> = {
  platform_admin: 'Admin de plataforma',
  owner: 'Propietario',
  manager: 'Gerente',
  cashier: 'Cajero',
  analyst: 'Analista',
};
