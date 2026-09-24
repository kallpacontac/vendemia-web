import type { Metadata } from 'next';
import Marco from '@/components/legal/Marco';
import CtaGuia from '@/components/guias/CtaGuia';
import { BRAND } from '@/lib/content';
import { EMPRESA } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Contacto · Vendemia',
  description: `Cómo contactar con ${BRAND.name}: correo, teléfono, WhatsApp y datos de ${EMPRESA.razonSocial}.`,
  alternates: { canonical: '/contacto' },
};

/**
 * Los datos de la empresa, en una ficha. Todo sale de EMPRESA (lib/legal.ts).
 *
 * Es texto en el HTML y no un componente de cliente: los rastreadores de Meta
 * no ejecutan JavaScript de forma fiable, y esta página existe para que la
 * lean ellos tanto como las personas. El único trozo con JS es el botón de
 * WhatsApp, y su enlace ya está en el HTML sin él.
 */
const FILAS: { k: string; v: React.ReactNode }[] = [
  { k: 'Marca', v: BRAND.name },
  { k: 'Razón social', v: EMPRESA.razonSocial },
  { k: 'RUC', v: EMPRESA.ruc },
  { k: 'Domicilio fiscal', v: `${EMPRESA.domicilio}, ${EMPRESA.ciudad}` },
  {
    k: 'Correo',
    v: (
      <a href={`mailto:${EMPRESA.email}`} className="underline underline-offset-4" style={{ color: 'var(--text-hi)' }}>
        {EMPRESA.email}
      </a>
    ),
  },
  {
    k: 'Teléfono y WhatsApp',
    v: (
      <a href={`tel:${EMPRESA.whatsapp}`} className="underline underline-offset-4" style={{ color: 'var(--text-hi)' }}>
        {EMPRESA.telefono}
      </a>
    ),
  },
];

export default function Pagina() {
  return (
    <Marco
      titulo="Contacto"
      bajada="La forma más rápida de hablar con nosotros es WhatsApp. Si prefieres el correo, también lo leemos."
      conFecha={false}
    >
      <dl className="space-y-5">
        {FILAS.map((f) => (
          <div key={f.k}>
            <dt className="text-[13px]" style={{ color: 'var(--text-low)' }}>
              {f.k}
            </dt>
            <dd className="mt-1 text-[16px] leading-[1.6]" style={{ color: 'var(--text-mid)' }}>
              {f.v}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-10">
        <CtaGuia
          label="Escribir por WhatsApp"
          className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold"
          style={{ background: 'var(--orange-cta)', color: 'var(--on-orange)' }}
        />
      </div>
    </Marco>
  );
}
