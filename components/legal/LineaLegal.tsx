import { BRAND } from '@/lib/content';
import { EMPRESA } from '@/lib/legal';

/**
 * «Vendemia es una marca de KALLPA TRIATLON S.A.C.», al pie de TODAS las
 * páginas públicas.
 *
 * Existe por la verificación de negocio de Meta: lo que se revisa es que la
 * web demuestre que la marca y la empresa legal son la misma cosa. Una marca
 * sin razón social visible, o una razón social que no nombra la marca, no lo
 * demuestra. Por eso la frase lleva las dos, y el RUC y el domicilio al lado.
 *
 * Texto de verdad, no imagen, y sin JavaScript de por medio: los rastreadores
 * de Meta no ejecutan JS de forma fiable, y esto tiene que estar en el HTML.
 *
 * Todo sale de EMPRESA (lib/legal.ts). Si cambia un dato, cambia allí.
 */
export default function LineaLegal({ className = '' }: { className?: string }) {
  return (
    <div className={`text-[12px] leading-[1.7] ${className}`} style={{ color: 'var(--text-low)' }}>
      <p>
        {BRAND.name} es una marca de {EMPRESA.razonSocial} · RUC {EMPRESA.ruc} · {EMPRESA.domicilio} ·{' '}
        {EMPRESA.ciudad}
      </p>
      <p>
        <a href={`mailto:${EMPRESA.email}`} className="underline-offset-2 hover:underline">
          {EMPRESA.email}
        </a>{' '}
        ·{' '}
        <a href={`tel:${EMPRESA.whatsapp}`} className="underline-offset-2 hover:underline">
          {EMPRESA.telefono}
        </a>
      </p>
    </div>
  );
}
